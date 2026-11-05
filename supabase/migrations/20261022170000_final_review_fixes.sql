-- =============================================================================
-- The final review: a chair is somebody on the team, topics have a ceiling,
-- and revoke_seat locks what it changes
-- =============================================================================
-- Three holes the final review of the security fixes found still open, from
-- docs/security-review-2026-10-10.md:
--
--   * L8. Dropping the conference_staff insert policy stopped a team manager
--     writing a staff row directly, but not the way round it: a manager could
--     assign any account to a committee, and ensure_chair_is_staff, which runs
--     as the owner, then put that account on the team with no invitation. The
--     rank rule on the assignment (can_manage_member) is no help, because it
--     ranks somebody with no role below everyone. A browser may now assign
--     only somebody already on the team, or itself.
--
--   * L65. A quick session's topic, and the committee topics an organiser
--     types, were written into committees.topics and committee_state.
--     agenda_topic with no ceiling at all. Each topic now holds at most 200
--     characters and a committee at most 50 of them, the line behind
--     NEW_TOPIC_MAX_LENGTH (client/src/lib/chair-room.ts), LONGEST_AGENDA
--     (client/src/lib/quick-session.ts) and validateCommitteeForm
--     (client/src/lib/committee-details.ts), which refuse first with a
--     sentence. (The review's other half of L65, archiving quick sessions to
--     escape the cap of 25, does not open: conferences_quick_session_is_draft
--     keeps every quick session a draft, so it can never be archived.)
--
--   * L34 and L35, the sibling the money-races migration left out.
--     20261022131000_money_races_and_invoice_payers locked the seats in
--     accept_application, move_delegate and swap_delegates, but revoke_seat
--     still read its seat with a plain select. Racing a swap or a move, it
--     rejected the application of whoever sat in the seat when it read it,
--     then emptied the seat of whoever sat there once the other request had
--     committed, and voided that person's invoice: one delegate rejected but
--     still seated and billed, another unseated with nothing said. It now
--     locks the seat, and then the application that won it, before reading
--     either, and its writes repeat what it read.
--
-- The database tests are in client/tests/db/security-final-review.test.ts,
-- with the L8 tests of security-conference-roles.test.ts and
-- committee-chairs.test.ts, which put a chair on the team before assigning
-- them, as conference-fixtures.ts addChair now does.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- L8: private.chair_is_off_the_team(committee_id, user_id)
-- -----------------------------------------------------------------------------
-- True when the caller manages the team of this committee's conference and
-- the person is not on that team. It answers false to anybody who does not
-- manage the team, so it never tells a stranger who is on it; their insert is
-- refused by the committee_chairs policies as before. Security definer, so
-- that it reads the team whatever the caller's own select policies say; it is
-- in private, where the API does not serve it.

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.chair_is_off_the_team(committee_id uuid, user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.committees as committee
    where committee.id = chair_is_off_the_team.committee_id
      and public.has_permission(committee.conference_id, 'manage_team')
      and not exists (
        select 1
        from public.conference_staff as staff
        where staff.conference_id = committee.conference_id
          and staff.user_id = chair_is_off_the_team.user_id
      )
  );
$$;

revoke execute on function private.chair_is_off_the_team(uuid, uuid) from public;
grant execute on function private.chair_is_off_the_team(uuid, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- L8: protect_committee_chairs_team(), before a chair row is written
-- -----------------------------------------------------------------------------
-- Security invoker, so that current_user is whoever wrote the row: a browser
-- is anon or authenticated, while accept_invite and the other functions that
-- run as the owner, and the server's service role, are not asked. Those put
-- the person who accepted an invitation on a committee, which is the way onto
-- the team.
--
-- Two writes from a browser are let through without asking:
--
--   * an update that keeps the same person on the same committee, which is a
--     change of title;
--   * a row naming the caller, which is "Chair it yourself" on the committee
--     editor and create_quick_session, both of which make an organiser a
--     chair. The policies still decide whether they may; an administrator
--     may, a manager below that may not.
--
-- The trigger's name sorts before committee_chairs_ensure_staff, and before
-- triggers fire in the order of their names, so the row is refused before
-- ensure_chair_is_staff can add anybody to the team.

create or replace function public.protect_committee_chairs_team()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.user_id = old.user_id
    and new.committee_id = old.committee_id
  then
    return new;
  end if;

  if new.user_id = (select auth.uid()) then
    return new;
  end if;

  if private.chair_is_off_the_team(new.committee_id, new.user_id) then
    raise exception 'Only somebody already on the team can be assigned to a committee. Invite them first.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_committee_chairs_team() from public, anon, authenticated;

create trigger committee_chairs_already_on_team
  before insert or update on public.committee_chairs
  for each row
  execute function public.protect_committee_chairs_team();


-- -----------------------------------------------------------------------------
-- L65: private.topics_are_bounded(topics)
-- -----------------------------------------------------------------------------
-- A CHECK cannot hold a subquery, so the rule over every entry of the array is
-- a function. Immutable, because it reads nothing but its argument. A CHECK
-- runs as whoever writes the row, so the roles that write committees may call
-- it; anon writes no committee.

create or replace function private.topics_are_bounded(topics text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select topics is null
    or (
      cardinality(topics) <= 50
      and not exists (
        select 1
        from unnest(topics) as entry (topic)
        where char_length(entry.topic) > 200
      )
    );
$$;

revoke execute on function private.topics_are_bounded(text[]) from public;
grant execute on function private.topics_are_bounded(text[]) to authenticated, service_role;

-- "not valid" adds each check without reading the table under a lock it holds
-- for the whole scan; "validate" then reads every row, and fails the
-- migration if any row is already over the line.
alter table public.committees
  add constraint committees_topics_bounded
    check (private.topics_are_bounded(topics)) not valid;

alter table public.committees validate constraint committees_topics_bounded;

-- The agenda is one of the committee's topics when it is set
-- (check_committee_agenda_topic), so it has the same ceiling as one of them.
alter table public.committee_state
  add constraint committee_state_agenda_topic_length
    check (char_length(agenda_topic) <= 200) not valid;

alter table public.committee_state validate constraint committee_state_agenda_topic_length;


-- -----------------------------------------------------------------------------
-- L34, L35: revoke_seat(seat_id)
-- -----------------------------------------------------------------------------
-- The body of 20261007150000_applications_permissions with the locks and
-- the repeated state of accept_application, and its refusals word for word:
-- the pages match on them.
--
-- The seat is locked first and the application that won it second. That is
-- the order remove_delegation_seat, move_delegate and swap_delegates take
-- (seats before anything else), so none of them can wait on this function in
-- a circle. accept_application locks an application and then a seat, but it
-- refuses an application that is already accepted before it locks any seat,
-- and the only application this function locks is the accepted one sitting
-- in the seat, so the two never hold what the other is waiting for.

create or replace function public.revoke_seat(seat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  seat public.seats;
  seat_conference uuid;
  application public.applications;
  rows_changed integer;
begin
  -- "for update" holds the seat until this transaction ends. A swap or a move
  -- of the same seat that is already under way finishes first, and the seat
  -- is then read as it left it, so everything below acts on one delegate.
  -- Two statements, because PL/pgSQL refuses to fill a whole-row variable and
  -- a plain one from the same "into" list.
  select *
  into seat
  from public.seats as seat_row
  where seat_row.id = revoke_seat.seat_id
  for update;

  select committee.conference_id
  into seat_conference
  from public.committees as committee
  where committee.id = seat.committee_id;

  if seat.id is null then
    raise exception 'That seat does not exist';
  end if;

  if not public.has_permission(seat_conference, 'decide_applications') then
    raise exception 'Only the organisers of this conference can revoke a seat';
  end if;

  if seat.user_id is null then
    raise exception 'Nobody is sitting in that seat';
  end if;

  -- The individual application that won this seat is rejected with it, so the
  -- applicant's own page stops saying they are coming. It is held as well,
  -- so that it is the one read here that is rejected.
  if seat.application_id is not null then
    select *
    into application
    from public.applications as application_row
    where application_row.id = seat.application_id
    for update;

    update public.applications
    set status = 'rejected',
        decided_at = now(),
        decided_by = me
    where id = application.id;
  end if;

  -- The delegation keeps its reservation, and with it the moment that
  -- reservation was made; see move_delegate. The where clause repeats who was
  -- read in the seat, and the row count says whether they still were when it
  -- was written; with the lock above they always are, and the repetition is
  -- there so that the write can never outrun the read.
  update public.seats
  set user_id = null,
      application_id = null,
      allocated_at = case when delegation_id is null then null else allocated_at end
  where id = revoke_seat.seat_id
    and user_id = seat.user_id
    and application_id is not distinct from seat.application_id;

  get diagnostics rows_changed = row_count;

  if rows_changed = 0 then
    raise exception 'Nobody is sitting in that seat';
  end if;

  -- The unpaid bills of the delegate who has just lost the seat, and nobody
  -- else's: an invoice an organiser raised on the seat against somebody else
  -- is theirs to deal with. A paid invoice is left exactly as it is; the money
  -- has arrived, and giving it back is a refund somebody has to decide on,
  -- which the organiser's fees page asks them to do. The table is aliased
  -- because this function's parameter is also called seat_id.
  update public.invoices as invoice
  set status = 'void'
  where invoice.seat_id = revoke_seat.seat_id
    and invoice.status = 'unpaid'
    and invoice.payer_user_id = seat.user_id;

  -- The paper goes with the seat. Whoever sits here next writes their own, and
  -- the delegate who has just lost the seat may upload again once they hold
  -- another one. The file itself is removed by the app, as before.
  delete from public.documents as document
  where document.seat_id = revoke_seat.seat_id
    and document.kind = 'position_paper';
end;
$$;

revoke execute on function public.revoke_seat(uuid) from public, anon;
grant execute on function public.revoke_seat(uuid) to authenticated;
