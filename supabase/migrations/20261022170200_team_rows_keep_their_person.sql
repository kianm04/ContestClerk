-- =============================================================================
-- A team row and a chair row keep their person, and a removal and an
-- assignment made at the same moment wait for each other
-- =============================================================================
-- What the check of 20261022170100_chairs_leave_with_the_team found still
-- open of finding L8 of the security review of 2026-10-10
-- (docs/security-review-2026-10-10.md).
--
-- 1. The policy "Team managers can change somebody else's title" on
--    conference_staff was written for the title, but nothing kept it to the
--    title: browsers held update on every column, as Supabase grants by
--    default. A team manager could point somebody's staff row at another
--    account (update conference_staff set user_id = ...), which put that
--    account on the team with no invitation, or point it at another
--    conference they also manage. The person who lost the row kept their chair
--    rows, because conference_staff_takes_chairs_along fires on delete only.
--    committee_chairs had the same default grant, and the app never changes
--    anything there but a title either.
--
-- 2. Neither trigger locked the staff row it relied on. A chair assignment
--    written while the same person was being removed could read the staff
--    row the removal had not committed yet, and ensure_chair_is_staff then
--    put them back on the team once it had; or the removal could finish
--    first without seeing the new chair row, and leave it behind.
--
-- This file:
--
--   * lets a browser update only the title of a staff row and of a chair row;
--   * also takes a person's chair rows away when a staff row is moved off
--     them by a writer the grants do not stop, such as the service role;
--   * adds private.lock_place_on_team, and has protect_committee_chairs_team
--     ask it, so that the two writes above happen one after the other;
--   * deletes again any chair row left with no staff row behind it.
--
-- The database tests are in client/tests/db/security-final-review.test.ts.
-- The race was checked by hand in two psql sessions, because a database test
-- cannot hold a transaction open across two requests.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- Browsers change a title and nothing else
-- -----------------------------------------------------------------------------
-- updateStaffTitle in client/src/lib/server/team.ts writes only the title;
-- nothing in the app updates committee_chairs. Revoking update on the table
-- also revokes it on each column, so the grant afterwards is the whole of
-- what is left. The service role and the functions that run as the owner are
-- not affected. Who may change which title is still the policies' to say.

revoke update on public.conference_staff from anon, authenticated;
grant update (title) on public.conference_staff to authenticated;

revoke update on public.committee_chairs from anon, authenticated;
grant update (title) on public.committee_chairs to authenticated;


-- -----------------------------------------------------------------------------
-- conference_staff_moved_takes_chairs_along, after a staff row changes hands
-- -----------------------------------------------------------------------------
-- No browser can make this change now. The trigger is there so that the rule
-- "chair rows go when the staff row goes" holds whoever writes: a staff row
-- moved to another person or another conference has left the old person off
-- the old team, as a delete would. remove_chairs_of_departed_staff reads only
-- `old`, so it serves both triggers. The `when` clause leaves an update that
-- changes only the title alone; a delete trigger cannot have one like it,
-- because a delete has no `new` row, so this is a trigger of its own.

create trigger conference_staff_moved_takes_chairs_along
  after update of conference_id, user_id on public.conference_staff
  for each row
  when (
    old.conference_id is distinct from new.conference_id
    or old.user_id is distinct from new.user_id
  )
  execute function public.remove_chairs_of_departed_staff();


-- -----------------------------------------------------------------------------
-- private.lock_place_on_team(committee_id, user_id)
-- -----------------------------------------------------------------------------
-- True when the person may be written as a chair of this committee as far as
-- the team goes: they are on its conference's team, or they are the caller
-- and the caller may run that team, which is "Chair it yourself" and
-- create_quick_session for an organisation's owners and administrators, who
-- need no staff row to run it.
--
-- It locks the person's staff row "for key share" while it looks, and the
-- lock lasts until the caller's write commits. A removal has to lock the same
-- row to delete it, so:
--
--   * when the chair write comes first, the removal waits for it, and its
--     trigger then sees the new chair row and deletes it as well;
--   * when the removal comes first, this waits for it and then finds no row,
--     so the write is refused instead of ensure_chair_is_staff putting the
--     person back on the team.
--
-- has_permission is asked after the lock, inside this function, so it reads
-- the team as it is after a removal it waited for. The policies on
-- committee_chairs read it as it was when the statement began.
--
-- Volatile, because a function that locks rows may not be stable. Security
-- definer, so that it can read and lock the row whatever the caller's own
-- policies let them see; it is in private, where the API does not serve it.

create or replace function private.lock_place_on_team(committee_id uuid, user_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  the_conference uuid;
begin
  select committee.conference_id
  into the_conference
  from public.committees as committee
  where committee.id = lock_place_on_team.committee_id;

  if the_conference is null then
    return false;
  end if;

  perform 1
  from public.conference_staff as staff
  where staff.conference_id = the_conference
    and staff.user_id = lock_place_on_team.user_id
  for key share;

  if found then
    return true;
  end if;

  return lock_place_on_team.user_id = (select auth.uid())
    and public.has_permission(the_conference, 'manage_team');
end;
$$;

revoke execute on function private.lock_place_on_team(uuid, uuid) from public;
grant execute on function private.lock_place_on_team(uuid, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- protect_committee_chairs_team(), before a chair row is written
-- -----------------------------------------------------------------------------
-- The body of 20261022170100_chairs_leave_with_the_team, asking
-- private.lock_place_on_team first. A row naming the caller who may not join
-- the team that way is refused here too: the policies would have let it
-- through on a removal they had not seen yet. For anybody else who is not
-- on the team, chair_is_off_the_team answers as before, so a caller who does
-- not run the team still learns nothing about who is on it: the policies
-- refuse them in the same words either way.

create or replace function public.protect_committee_chairs_team()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if private.lock_place_on_team(new.committee_id, new.user_id) then
    return new;
  end if;

  if new.user_id = (select auth.uid())
    or private.chair_is_off_the_team(new.committee_id, new.user_id) then
    raise exception 'Only somebody already on the team can be assigned to a committee. Invite them first.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_committee_chairs_team() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- The chair rows left behind since 20261022170100
-- -----------------------------------------------------------------------------
-- The same clean-up as in that file, for any row a moved staff row or the race
-- above left with no staff row behind it.

delete from public.committee_chairs as assignment
using public.committees as committee
where committee.id = assignment.committee_id
  and not exists (
    select 1
    from public.conference_staff as staff
    where staff.conference_id = committee.conference_id
      and staff.user_id = assignment.user_id
  );
