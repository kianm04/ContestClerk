-- =============================================================================
-- Applications and delegations: when the doors are open, and who is inside
-- =============================================================================
--
-- WHAT THIS IS
-- Findings M5, M6, M14, L15, L23, L24 and L28 of the security review of
-- 2026-10-10 (docs/security-review-2026-10-10.md). They are one subject seen
-- from seven sides: the database had its own idea of when somebody may apply
-- and of who takes part in a conference, and that idea was looser than the
-- pages'.
--
--   * M6. A conference whose organiser said "I will open applications myself"
--     (application_open_mode = 'manual') and has not done so yet has no opening date.
--     canApply and canCreateDelegation read that as "not open yet"; the two
--     insert policies and create_delegation read it as "open since forever".
--     conference_takes_applications(conference_id, route) is now the one
--     answer, and all three ask it.
--   * M14. The update policy on applications had no window test, so an
--     applicant could rewrite a submitted application, or submit a draft,
--     after the window closed. guard_application_update now lets them only
--     withdraw while the conference is not taking applications.
--   * L28. A decider could move an application anywhere by a plain update,
--     including an accepted, seated one back to rejected or draft, or a sent
--     one to accepted with no seat. The organiser branch of the guard now
--     allows only the moves the review pages make by a column write;
--     accepting stays accept_application's job and taking an acceptance back
--     revoke_seat's.
--   * L15. read_applications readers could read drafts nobody had sent. The
--     select and update policies now leave drafts out.
--   * M5. is_conference_participant counted every delegation member whatever
--     the delegation's status, and every applicant for ever once they had sent
--     an application: one create_delegation call made a stranger a participant
--     and a rejected applicant stayed one. Both lookups now count out drafts,
--     withdrawals and rejections on both routes, and the "delegates" audience
--     of announcements, documents and the programme asks a stricter question,
--     is_conference_admitted: a seat, an accepted application or membership
--     of an accepted delegation. conference_audience_user_ids, which says
--     who the bell tells, had the same blind spot for delegations and now
--     asks the same two questions.
--   * L23, L24. The delegations insert policy let anybody write a headless
--     delegation with a join code of their choosing; create_delegation minted
--     eight characters from random(). The policy is gone, so create_delegation
--     is the only writer, and it now mints ten characters from
--     gen_random_bytes.
--
-- This file:
--
--   * adds conference_takes_applications and is_conference_admitted
--   * replaces is_conference_participant and participant_conference_ids
--   * replaces the "delegates" read policies on announcements, documents and
--     schedule_events, and conference_audience_user_ids, which the
--     notification triggers ask who those audiences are
--   * replaces the applications insert policy and the two read_applications /
--     decide_applications policies
--   * replaces guard_application_update
--   * drops the direct insert policy on delegations and replaces
--     create_delegation
--   * replaces the delete policy on delegation_members, whose seat check now
--     runs as the owner through delegation_member_holds_seat
--
-- The database tests are in client/tests/db/security-applications-windows.test.ts.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- conference_takes_applications
-- -----------------------------------------------------------------------------
-- Is this conference taking applications by this route right now? The same
-- questions canApply ($lib/applications.ts) and canCreateDelegation
-- ($lib/delegations.ts) ask, in SQL, so a page and a policy can never
-- disagree again:
--
--   * published;
--   * takes this route ('individual' or 'delegation'; anything else is no);
--   * not waiting for the organiser: 'manual' mode with no opening date means
--     nobody has opened them, whatever a missing date means in the other modes;
--   * the opening moment, if there is one, has passed;
--   * the closing moment, if there is one, has not.
--
-- It is not security definer: the conferences it answers yes about are
-- published, and a published conference is readable by anybody signed in, so
-- it needs no more than its caller has. Inside create_delegation, which is
-- security definer, it runs as that function's owner like everything else there.

create or replace function public.conference_takes_applications(conference_id uuid, route text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.conferences as conference
    where conference.id = conference_takes_applications.conference_id
      and conference.status = 'published'
      and case conference_takes_applications.route
            when 'individual' then conference.accepts_individual_applications
            when 'delegation' then conference.accepts_delegations
            else false
          end
      and not (
        conference.application_open_mode = 'manual'
        and conference.applications_open_at is null
      )
      and (conference.applications_open_at is null or conference.applications_open_at <= now())
      and (conference.applications_close_at is null or conference.applications_close_at >= now())
  );
$$;

revoke execute on function public.conference_takes_applications(uuid, text) from public, anon;
grant execute on function public.conference_takes_applications(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- is_conference_participant, participant_conference_ids, is_conference_admitted
-- -----------------------------------------------------------------------------
-- Two questions where there used to be one.
--
-- "Taking part" (is_conference_participant, and its set form
-- participant_conference_ids) is what lets somebody read the seat lists, the
-- public team and what is said to everyone: a seat, an application that is
-- live (sent and not withdrawn or rejected), or membership of a delegation
-- that is live in the same sense. A draft on either route is still private; a
-- withdrawal or a rejection is the end of it.
--
-- "Admitted" (is_conference_admitted) is what the "delegates" audience means:
-- somebody who is coming. A seat, an accepted application, or membership of an
-- accepted delegation. An applicant still under review is inside the
-- conference but is not yet a delegate of it.
--
-- All three are security definer, as the old one was: a policy on one table
-- asks them about seats, applications and delegations the caller may not read.

create or replace function public.is_conference_participant(conference_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.seats as seat
    join public.committees as committee on committee.id = seat.committee_id
    where committee.conference_id = is_conference_participant.conference_id
      and seat.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.applications as application
    where application.conference_id = is_conference_participant.conference_id
      and application.user_id = (select auth.uid())
      and application.status not in ('draft', 'withdrawn', 'rejected')
  )
  or exists (
    select 1
    from public.delegation_members as membership
    join public.delegations as delegation on delegation.id = membership.delegation_id
    where delegation.conference_id = is_conference_participant.conference_id
      and membership.user_id = (select auth.uid())
      and delegation.status not in ('draft', 'withdrawn', 'rejected')
  );
$$;

revoke execute on function public.is_conference_participant(uuid) from public, anon;
grant execute on function public.is_conference_participant(uuid) to authenticated;

create or replace function public.participant_conference_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select committee.conference_id
  from public.seats as seat
  join public.committees as committee on committee.id = seat.committee_id
  where seat.user_id = (select auth.uid())

  union

  select application.conference_id
  from public.applications as application
  where application.user_id = (select auth.uid())
    and application.status not in ('draft', 'withdrawn', 'rejected')

  union

  select delegation.conference_id
  from public.delegation_members as membership
  join public.delegations as delegation on delegation.id = membership.delegation_id
  where membership.user_id = (select auth.uid())
    and delegation.status not in ('draft', 'withdrawn', 'rejected');
$$;

revoke execute on function public.participant_conference_ids() from public, anon;
grant execute on function public.participant_conference_ids() to authenticated;

create or replace function public.is_conference_admitted(conference_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.seats as seat
    join public.committees as committee on committee.id = seat.committee_id
    where committee.conference_id = is_conference_admitted.conference_id
      and seat.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.applications as application
    where application.conference_id = is_conference_admitted.conference_id
      and application.user_id = (select auth.uid())
      and application.status = 'accepted'
  )
  or exists (
    select 1
    from public.delegation_members as membership
    join public.delegations as delegation on delegation.id = membership.delegation_id
    where delegation.conference_id = is_conference_admitted.conference_id
      and membership.user_id = (select auth.uid())
      and delegation.status = 'accepted'
  );
$$;

revoke execute on function public.is_conference_admitted(uuid) from public, anon;
grant execute on function public.is_conference_admitted(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- The "delegates" audience: announcements, documents, schedule_events
-- -----------------------------------------------------------------------------
-- The "everyone" policies beside these keep asking is_conference_participant,
-- which now means what it should. These three asked the same question of
-- something said to the delegates, and now ask who is admitted.

drop policy "Participants can read an announcement to the delegates" on public.announcements;

create policy "Admitted delegates can read an announcement to the delegates"
  on public.announcements
  for select
  to authenticated
  using (audience = 'delegates' and public.is_conference_admitted(conference_id));

drop policy "Participants can read the files meant for delegates" on public.documents;

create policy "Admitted delegates can read the files meant for delegates"
  on public.documents
  for select
  to authenticated
  using (
    kind in ('background_guide', 'resource')
    and audience = 'delegates'
    and public.is_conference_admitted(conference_id)
  );

drop policy "Participants can read the events meant for delegates" on public.schedule_events;

create policy "Admitted delegates can read the events meant for delegates"
  on public.schedule_events
  for select
  to authenticated
  using (audience = 'delegates' and public.is_conference_admitted(conference_id));


-- -----------------------------------------------------------------------------
-- conference_audience_user_ids: who the bell tells
-- -----------------------------------------------------------------------------
-- The notification triggers of announcements, documents and the programme ask
-- this function who an audience is, and the title of what was said goes into
-- each of those people's notifications. It counted every member of every
-- delegation for "everyone" and for "delegates", whatever the delegation's
-- status, so the same one create_delegation call that made a stranger a
-- participant also put the title of everything said to the delegates in their
-- bell, with a link to a page that would now turn them away.
--
-- The body of migration 20261007180000 with one change, in the delegation
-- branch: "everyone" counts a delegation that is live (sent and not withdrawn
-- or rejected), the way is_conference_participant does, and "delegates" one
-- that is accepted, the way is_conference_admitted does. A seat still counts
-- for both, and the one-delegation audience still reaches its members whatever
-- the status, as the read policy for it does.

create or replace function public.conference_audience_user_ids(
  conference_id uuid,
  audience public.audience,
  committee_id uuid default null,
  delegation_id uuid default null
)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- The two audiences that name one committee or one delegation have to name
  -- one of this conference's, or the gate below would be asked about the
  -- wrong conference.
  if conference_audience_user_ids.audience = 'committee'
    and not exists (
      select 1
      from public.committees as committee
      where committee.id = conference_audience_user_ids.committee_id
        and committee.conference_id = conference_audience_user_ids.conference_id
    )
  then
    raise exception 'That committee is not part of this conference';
  end if;

  if conference_audience_user_ids.audience = 'delegation'
    and not exists (
      select 1
      from public.delegations as delegation
      where delegation.id = conference_audience_user_ids.delegation_id
        and delegation.conference_id = conference_audience_user_ids.conference_id
    )
  then
    raise exception 'That delegation is not part of this conference';
  end if;

  -- Who is taking part is the team's to know, and of the team only those who
  -- may address that audience.
  if conference_audience_user_ids.audience = 'committee' then
    if not (
      public.has_committee_permission(conference_audience_user_ids.committee_id, 'send_announcements')
      or public.has_committee_permission(conference_audience_user_ids.committee_id, 'edit_schedule')
      or public.has_committee_permission(conference_audience_user_ids.committee_id, 'run_room')
    ) then
      raise exception 'Only the organisers of a conference can see who takes part in it';
    end if;
  elsif not (
    public.has_permission(conference_audience_user_ids.conference_id, 'send_announcements')
    or public.has_permission(conference_audience_user_ids.conference_id, 'edit_schedule')
  ) then
    raise exception 'Only the organisers of a conference can see who takes part in it';
  end if;

  return query
  -- Everybody sitting in a committee of this conference.
  select seat.user_id
  from public.seats as seat
  join public.committees as committee on committee.id = seat.committee_id
  where committee.conference_id = conference_audience_user_ids.conference_id
    and seat.user_id is not null
    and conference_audience_user_ids.audience in ('everyone', 'delegates')

  union

  -- Everybody in a delegation of this conference, seated or not yet, once the
  -- delegation is far enough along for that audience: sent and still in the
  -- running for "everyone", accepted for "delegates".
  select membership.user_id
  from public.delegation_members as membership
  join public.delegations as delegation on delegation.id = membership.delegation_id
  where delegation.conference_id = conference_audience_user_ids.conference_id
    and (
      (conference_audience_user_ids.audience = 'everyone'
        and delegation.status not in ('draft', 'withdrawn', 'rejected'))
      or (conference_audience_user_ids.audience = 'delegates'
        and delegation.status = 'accepted')
    )

  union

  -- The team: staff rows plus the members of the organisation running it.
  select staff.user_id
  from public.conference_staff as staff
  where staff.conference_id = conference_audience_user_ids.conference_id
    and conference_audience_user_ids.audience in ('everyone', 'staff')

  union

  select membership.user_id
  from public.organization_members as membership
  join public.conferences as conference
    on conference.organization_id = membership.organization_id
  where conference.id = conference_audience_user_ids.conference_id
    and conference_audience_user_ids.audience in ('everyone', 'staff')

  union

  -- One committee: the delegates sitting in it and the people chairing it.
  select seat.user_id
  from public.seats as seat
  where seat.committee_id = conference_audience_user_ids.committee_id
    and seat.user_id is not null
    and conference_audience_user_ids.audience = 'committee'

  union

  select chair.user_id
  from public.committee_chairs as chair
  where chair.committee_id = conference_audience_user_ids.committee_id
    and conference_audience_user_ids.audience = 'committee'

  union

  -- One delegation.
  select membership.user_id
  from public.delegation_members as membership
  where membership.delegation_id = conference_audience_user_ids.delegation_id
    and conference_audience_user_ids.audience = 'delegation';
end;
$$;

revoke execute on function public.conference_audience_user_ids(uuid, public.audience, uuid, uuid)
  from public, anon;
grant execute on function public.conference_audience_user_ids(uuid, public.audience, uuid, uuid)
  to authenticated;


-- -----------------------------------------------------------------------------
-- applications: the insert policy and the two permission policies
-- -----------------------------------------------------------------------------

drop policy "A signed-in person can apply to an open conference" on public.applications;

create policy "A signed-in person can apply while applications are open"
  on public.applications
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.conference_takes_applications(conference_id, 'individual')
  );

-- A draft is the applicant's own until they send it. The organisers' pages
-- already left drafts out of every list; the policies now do too, so a reader
-- cannot ask the table for them and a decider cannot write to one. The names
-- are shorter than their predecessors' because Postgres cut those at 63
-- characters.

drop policy "Application readers can read the applications to their conference" on public.applications;
drop policy "Application deciders can decide an application" on public.applications;

create policy "Application readers can read the applications somebody sent"
  on public.applications
  for select
  to authenticated
  using (
    status <> 'draft'
    and conference_id in (select public.permitted_conference_ids('read_applications'))
  );

create policy "Application deciders can decide an application somebody sent"
  on public.applications
  for update
  to authenticated
  using (
    status <> 'draft'
    and conference_id in (select public.permitted_conference_ids('decide_applications'))
  )
  with check (
    status <> 'draft'
    and conference_id in (select public.permitted_conference_ids('decide_applications'))
  );


-- -----------------------------------------------------------------------------
-- Trigger: guard_application_update
-- -----------------------------------------------------------------------------
-- The body of migration 20260918120000 with two rules added, one in each
-- branch:
--
--   * the applicant: once the conference is not taking applications the one
--     thing left to do is withdraw, and a withdrawal changes nothing but the
--     status. That covers both the late edit of M14 and the late submission of
--     M6, and it matches canEditApplication on the application page, which
--     offers "Edit" only while the window is open;
--   * the organisers: the status may move only the way the review pages move
--     it by a column write. submitted goes to rejected or waitlisted (the bulk
--     decisions); waitlisted to rejected; and rejected to withdrawn, which is
--     the second write of "Revoke acceptance" after revoke_seat has done the
--     real work as security definer. Nothing reaches accepted this way, because
--     accepting seats the person and raises their invoice, which is
--     accept_application's and accept_application_team's to do in one step; a
--     bare status write would admit somebody to the delegates' pages with
--     neither. Nothing leaves accepted this way either, because leaving accepted
--     frees a seat and voids an invoice, and nothing goes back to draft or
--     submitted.
--
-- Everything else is as it was, including why this is not security definer:
-- current_user has to be the caller's role for the browser test to mean
-- anything. accept_application, revoke_seat and the allocation functions run
-- as their owner and walk past both new rules, as they always did.

create or replace function public.guard_application_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  -- What each side is allowed to write. The checks at the end of each branch
  -- compare everything else, rather than naming the columns that are forbidden,
  -- because a list of forbidden columns is a list that rots: a column added to
  -- this table next year would be missing from it and both sides would quietly
  -- gain the right to write it. updated_at is in both lists because
  -- applications_set_updated_at overwrites it a moment later whatever anybody
  -- sent, and submitted_at because the block at the top of this function has
  -- already made sure it is this trigger's value and not the caller's.
  applicant_writable constant text[] := array[
    'status', 'committee_preferences', 'seat_preferences', 'motivation', 'answers',
    'submitted_at', 'updated_at'
  ];
  organiser_writable constant text[] := array[
    'status', 'decision_note', 'internal_note', 'decided_at', 'decided_by',
    'submitted_at', 'updated_at'
  ];
  -- A withdrawal is the status and nothing else; updated_at is left out for
  -- the reason above.
  withdrawal_columns constant text[] := array['status', 'updated_at'];
begin
  -- When an application was sent is this trigger's to say. Without this the
  -- block below only fills the column on a status change, so an update that
  -- leaves the status alone carries whatever moment the caller chose, and
  -- 06-features/applications.md gives the organiser a table sorted by it.
  if current_user in ('anon', 'authenticated')
    and new.submitted_at is distinct from old.submitted_at
  then
    raise exception 'When an application was submitted is not something a page writes';
  end if;

  -- Keep the clock honest whoever is writing, so a row the server moves is
  -- stamped the same way a row the applicant moves is.
  if new.status = 'submitted' and old.status <> 'submitted' then
    new.submitted_at = now();
  elsif new.status = 'draft' and old.status <> 'draft' then
    new.submitted_at = null;
  end if;

  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  -- Neither side may move the row to another person or another conference, and
  -- this comes before the two branches because it is the one rule both sides
  -- share. Without it the insert policy's conditions are optional: an applicant
  -- could make a draft at a conference that is open and then carry it to one
  -- that is closed, or to one where they already head a delegation, which
  -- check_one_route_per_conference cannot see because it fires on insert.
  if new.conference_id is distinct from old.conference_id
    or new.user_id is distinct from old.user_id
  then
    raise exception 'An application belongs to one person and one conference';
  end if;

  if new.user_id = me then
    -- The applicant's own rules.
    if old.status not in ('draft', 'submitted', 'waitlisted') then
      raise exception 'This application can no longer be changed';
    end if;

    if new.status not in ('draft', 'submitted', 'withdrawn') then
      raise exception 'You can only save, submit or withdraw an application';
    end if;

    -- Waitlisted is the one status an applicant may leave but not return to,
    -- so it may only become withdrawn.
    if old.status = 'waitlisted' and new.status <> 'withdrawn' then
      raise exception 'A waitlisted application can only be withdrawn';
    end if;

    -- The window. While the conference is not taking applications, whether
    -- because it never opened them, has closed them, stopped taking
    -- individuals or is no longer published, the applicant may withdraw and
    -- do nothing else: no edit, no submission of a draft, and no withdrawal
    -- that rewrites the answers on its way out.
    if not public.conference_takes_applications(new.conference_id, 'individual')
      and not (
        new.status = 'withdrawn'
        and to_jsonb(new) - withdrawal_columns is not distinct from to_jsonb(old) - withdrawal_columns
      )
    then
      raise exception 'This conference is not taking applications, so the application can only be withdrawn';
    end if;

    if new.decided_at is distinct from old.decided_at
      or new.decided_by is distinct from old.decided_by
      or new.decision_note is distinct from old.decision_note
      or new.internal_note is distinct from old.internal_note
    then
      raise exception 'Only the organisers decide an application';
    end if;

    -- The catch-all. "to_jsonb" turns a row into a JSON object and "- the list"
    -- drops those keys, so this reads: take away the columns an applicant may
    -- write, and what is left has to be exactly what it was.
    if to_jsonb(new) - applicant_writable is distinct from to_jsonb(old) - applicant_writable
    then
      raise exception 'An applicant can only change their own answers';
    end if;

    return new;
  end if;

  -- The organiser's rules. Everything the applicant wrote stays as they wrote
  -- it; a decision is a decision, not an edit of somebody's answers. The person
  -- and the conference are guarded above, for both sides at once.
  if new.committee_preferences is distinct from old.committee_preferences
    or new.seat_preferences is distinct from old.seat_preferences
    or new.motivation is distinct from old.motivation
    or new.answers is distinct from old.answers
  then
    raise exception 'An organiser cannot change what an applicant wrote';
  end if;

  -- The moves the review pages make, and no others. See the note above the
  -- function for why each is here and why nothing reaches or leaves accepted
  -- this way.
  if new.status is distinct from old.status
    and not (
      (old.status = 'submitted' and new.status in ('rejected', 'waitlisted'))
      or (old.status = 'waitlisted' and new.status = 'rejected')
      or (old.status = 'rejected' and new.status = 'withdrawn')
    )
  then
    raise exception 'An application that is % cannot be marked % by the organisers',
      old.status, new.status;
  end if;

  if to_jsonb(new) - organiser_writable is distinct from to_jsonb(old) - organiser_writable
  then
    raise exception 'An organiser can only decide an application';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_application_update() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- delegations: create_delegation is the only door
-- -----------------------------------------------------------------------------
-- The direct insert policy let any signed-in person write a delegation with no
-- head, any status the insert guard allowed and a join code of their choosing.
-- The app never used it: the page calls create_delegation, which is security
-- definer and so never met the policy. Without it the insert inside that
-- function is the only way a row comes to exist, which is what the function's
-- own comment always said it should be. guard_delegation_insert stays in place
-- as a second line, but a browser request no longer reaches it.

drop policy "A signed-in person can register a delegation at an open conference" on public.delegations;

-- The body of migration 20260918120000 with two changes. The window is
-- conference_takes_applications's to judge, and the checks that used to be the
-- window only choose which sentence to say, in the order canCreateDelegation
-- asks its questions. The join code is ten characters whose bytes come from
-- gen_random_bytes rather than random(): random() is seeded per session and
-- not meant for secrets, and eight characters of a 32-letter alphabet was a
-- 40-bit space against a preview function anybody signed in may call. The
-- alphabet is the same, without 0, O, 1 and I, because somebody still reads
-- the code out loud.

create or replace function public.create_delegation(
  conference_id uuid,
  name text,
  institution_name text,
  country_code char(2),
  requested_seats integer,
  note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- No 0, O, 1 or I: the four characters people read wrong.
  code_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code_length constant integer := 10;
  me uuid := (select auth.uid());
  conference public.conferences;
  fresh_code text;
  random_bytes bytea;
  byte_index integer;
  new_delegation uuid;
begin
  if me is null then
    raise exception 'You have to be signed in to register a delegation';
  end if;

  select *
  into conference
  from public.conferences as conference_row
  where conference_row.id = create_delegation.conference_id;

  if not public.conference_takes_applications(create_delegation.conference_id, 'delegation') then
    if conference.id is null or conference.status <> 'published' then
      raise exception 'That conference is not taking delegations';
    elsif not conference.accepts_delegations then
      raise exception 'That conference does not take delegations';
    elsif (conference.application_open_mode = 'manual' and conference.applications_open_at is null)
      or conference.applications_open_at > now()
    then
      raise exception 'Applications for that conference have not opened yet';
    else
      raise exception 'Applications for that conference have closed';
    end if;
  end if;

  if exists (
    select 1
    from public.applications as application
    where application.conference_id = create_delegation.conference_id
      and application.user_id = me
  ) then
    raise exception 'You already have an application for this conference';
  end if;

  if exists (
    select 1
    from public.delegation_members as membership
    join public.delegations as delegation on delegation.id = membership.delegation_id
    where delegation.conference_id = create_delegation.conference_id
      and membership.user_id = me
  ) then
    raise exception 'You are already part of a delegation for this conference';
  end if;

  -- The loop runs again on the astronomically unlikely chance that the code
  -- is already taken.
  loop
    random_bytes = extensions.gen_random_bytes(code_length);
    fresh_code = '';

    -- get_byte reads one byte, 0 to 255, and 256 is a multiple of 32, so the
    -- remainder favours no character of the alphabet over another.
    for byte_index in 0..code_length - 1 loop
      fresh_code = fresh_code
        || substr(code_alphabet, 1 + (get_byte(random_bytes, byte_index) % length(code_alphabet)), 1);
    end loop;

    exit when not exists (
      select 1
      from public.delegations as delegation
      where delegation.join_code = fresh_code
    );
  end loop;

  insert into public.delegations (
    conference_id, name, institution_name, country_code, requested_seats, note, join_code
  )
  values (
    create_delegation.conference_id,
    create_delegation.name,
    create_delegation.institution_name,
    create_delegation.country_code,
    create_delegation.requested_seats,
    create_delegation.note,
    fresh_code
  )
  returning id into new_delegation;

  insert into public.delegation_members (delegation_id, user_id, role)
  values (new_delegation, me, 'head');

  return new_delegation;
end;
$$;

revoke execute on function public.create_delegation(uuid, text, text, char(2), integer, text)
  from public, anon;
grant execute on function public.create_delegation(uuid, text, text, char(2), integer, text)
  to authenticated;


-- -----------------------------------------------------------------------------
-- delegation_members: the seat check behind leaving and removal
-- -----------------------------------------------------------------------------
-- "Heads can remove a member, and a member can leave" refuses the row when the
-- member sits in one of the delegation's seats, and it asked the seats table
-- in a plain subquery. A subquery in a policy runs with the caller's own read
-- rights, and a head's right to read seats comes from being a participant,
-- which the stricter is_conference_participant above no longer grants for a
-- delegation that is still a draft, withdrawn or rejected. A seat is only ever
-- reserved for an accepted delegation, so that head would have to be looking
-- at a seat left behind by a later rejection; but a guard that depends on
-- what its caller happens to be allowed to see is a guard that rots, so the
-- question is now asked as the owner.

--
-- It answers only somebody in the delegation, a head or a member, which is
-- everybody the delete policy asks for. To anybody else it answers null, so a
-- person holding two ids cannot use it to learn who sits in which seat; null
-- reads as "no" in a policy, which keeps the row out of reach either way.

create or replace function public.delegation_member_holds_seat(delegation_id uuid, user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_delegation_member(delegation_member_holds_seat.delegation_id) then exists (
      select 1
      from public.seats as seat
      where seat.delegation_id = delegation_member_holds_seat.delegation_id
        and seat.user_id = delegation_member_holds_seat.user_id
    )
  end;
$$;

revoke execute on function public.delegation_member_holds_seat(uuid, uuid) from public, anon;
grant execute on function public.delegation_member_holds_seat(uuid, uuid) to authenticated;

drop policy "Heads can remove a member, and a member can leave" on public.delegation_members;

create policy "Unseated members can leave, and heads can remove them"
  on public.delegation_members
  for delete
  to authenticated
  using (
    (public.is_delegation_head(delegation_id) or user_id = (select auth.uid()))
    and not public.delegation_member_holds_seat(delegation_id, user_id)
  );
