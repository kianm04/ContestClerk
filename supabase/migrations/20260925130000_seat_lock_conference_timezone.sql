-- =============================================================================
-- Migration 0022: check_seat_allocation reads the day in the conference's timezone
-- =============================================================================
--
-- WHAT THIS IS
-- Task T98 in specs/07-delivery/tasks.md. A delegation head may seat and unseat
-- their members until the conference's first day (06-features/allocation.md,
-- "Head assigns members"), and two places ask whether that day has come:
--
--   * check_seat_allocation, the trigger on seats, which refuses the change;
--   * canChangeDelegationSeats in client/src/lib/delegations.ts, which the seats
--     page asks so it can put the Assign and Unassign buttons away.
--
-- The page worked the day out in the conference's own timezone, because a
-- conference in Auckland starts on Auckland's morning. The trigger compared
-- start_date with current_date, which is the day wherever the database server
-- happens to be. For a few hours around midnight the two disagreed: the page
-- could hide the buttons while the trigger would still have allowed the change,
-- or draw them for a change the trigger then refused.
--
-- The page was right, so the trigger learns the timezone. "now() at time zone
-- conference.timezone" turns this moment into the wall-clock time in that
-- timezone, and "::date" keeps only its day, which is what the page's
-- dayInTimezone(now, conference.timezone) answers as well.
--
-- Nothing else in the function changes. It is repeated whole below because
-- "create or replace" replaces the entire body; the copy it replaces is in
-- migration 0006 (20260918120000_applications_delegations_seat_links.sql).
--
-- Never edit this file once it has been applied anywhere. Add a new migration.

create or replace function public.check_seat_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  the_conference uuid;
  conference_start date;
  conference_today date;
begin
  -- conference_today is the date on a wall clock at the conference, not on the
  -- database server's. See the top of this file.
  select
    committee.conference_id,
    conference.start_date,
    (now() at time zone conference.timezone)::date
  into the_conference, conference_start, conference_today
  from public.committees as committee
  join public.conferences as conference on conference.id = committee.conference_id
  where committee.id = new.committee_id;

  -- Rule 2. An application from another conference on this seat would put a
  -- stranger's answers on an organiser's allocation screen.
  if new.application_id is not null then
    if not exists (
      select 1
      from public.applications as application
      where application.id = new.application_id
        and application.conference_id = the_conference
    ) then
      raise exception 'That application is not for this conference';
    end if;
  end if;

  -- The delegation a seat is reserved for has to be one of this conference too,
  -- for the same reason.
  if new.delegation_id is not null then
    if not exists (
      select 1
      from public.delegations as delegation
      where delegation.id = new.delegation_id
        and delegation.conference_id = the_conference
    ) then
      raise exception 'That delegation is not for this conference';
    end if;
  end if;

  -- The delegation head's narrow write.
  --
  -- This function has to be security definer to see every seat of the
  -- conference, and inside one of those current_user is the owner rather than
  -- the caller, so it cannot ask who is writing the way the two guard triggers
  -- above do. It asks about rights instead, which is the better question
  -- anyway: somebody who is a head of this seat's delegation and cannot manage
  -- the conference is a head and nobody else. auth.uid() still reads the
  -- caller's own id inside a security definer function, so the organiser
  -- calling allocate_delegation_seats passes can_manage_conference and skips
  -- this whole branch, and so does the service role, for whom both are false.
  if tg_op = 'UPDATE'
    and new.delegation_id is not null
    and not public.can_manage_conference(the_conference)
    and public.is_delegation_head(new.delegation_id)
  then
    -- "Everything but user_id has to be identical", rather than a list of the
    -- columns a head may not write. A forbidden list is a list that rots: this
    -- one was written without allocated_at and created_at on it, and a head
    -- could quietly backdate both. to_jsonb turns a row into a JSON object and
    -- "- the list" drops those keys, so this reads: take away the one column a
    -- head may write, and what is left has to be exactly what it was.
    --
    -- updated_at goes with it because seats_set_updated_at overwrites it a
    -- moment later whatever anybody sent.
    if to_jsonb(new) - array['user_id', 'updated_at'] is distinct from
       to_jsonb(old) - array['user_id', 'updated_at']
    then
      raise exception 'A delegation head can only seat and unseat their own members';
    end if;

    -- From the first day of the conference the organisers move people, because
    -- a change on the morning of a session has to be one somebody in the
    -- building decided. 06-features/allocation.md. The first day begins at
    -- midnight in the conference's timezone, which is what conference_today is.
    if conference_start <= conference_today then
      raise exception 'The conference has started. Ask the organisers to change a seat.';
    end if;

    -- The head may not write allocated_at, so the trigger writes it for them.
    -- data-model.md calls the column "when user_id or delegation_id was last
    -- set", and the head has just set user_id. Unseating leaves it alone: the
    -- delegation_id is still set, so the moment the seat was reserved stands.
    if new.user_id is not null and new.user_id is distinct from old.user_id then
      new.allocated_at = now();
    end if;
  end if;

  if new.user_id is null then
    return new;
  end if;

  -- Rule 3. A reserved seat is the delegation's to fill, and only with somebody
  -- who is in it.
  if new.delegation_id is not null then
    if not exists (
      select 1
      from public.delegation_members as membership
      where membership.delegation_id = new.delegation_id
        and membership.user_id = new.user_id
    ) then
      raise exception 'That person is not a member of the delegation this seat is reserved for';
    end if;
  end if;

  -- Rule 1. Two seats would mean two schedules, two position papers and two
  -- invoices for one person.
  if exists (
    select 1
    from public.seats as other_seat
    join public.committees as other_committee
      on other_committee.id = other_seat.committee_id
    where other_seat.user_id = new.user_id
      and other_seat.id <> new.id
      and other_committee.conference_id = the_conference
  ) then
    raise exception 'That person already has a seat in this conference';
  end if;

  return new;
end;
$$;

revoke execute on function public.check_seat_allocation() from public, anon, authenticated;
