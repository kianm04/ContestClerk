-- =============================================================================
-- Migration 0009: a committee cannot be moved to another conference
-- =============================================================================
--
-- WHAT THIS IS
-- Task T21 in specs/07-delivery/tasks.md, the committees and seats editor. It
-- is the first page in the app that writes ordinary columns of committees, and
-- specs/07-delivery/open-questions.md has been carrying a gap since T02's
-- review that has to be closed before it does.
--
-- THE GAP
-- The committees update policy is can_manage_conference(conference_id) on both
-- halves (see specs/02-architecture/permissions.md). Every helper of that kind
-- is "stable" and reads the table from the statement's own snapshot, so the
-- "with check" half still sees the *old* conference_id. An organiser who runs
-- two conferences could therefore post conference_id = <their other conference>
-- and carry the committee, and every seat hanging off it, across. The seats
-- would come with their delegates: check_seat_allocation fires on seats and not
-- on committees, so nothing would ask again whether those people already hold a
-- seat at the conference they have just been moved into, and somebody could end
-- up holding two. The policy is not wrong -- permissions.md says only "org." for
-- that cell -- so the fix belongs in a trigger, the way permissions.md's
-- "Trigger-protected columns" section says.
--
-- WHY A NAMED COLUMN RATHER THAN AN ALLOW-LIST
-- The same reasoning as protect_conferences_columns in migration 0008, which
-- closed the identical gap one level up. permissions.md asks a
-- protect_<table>_columns trigger to compare everything outside an allow-list,
-- because a list of forbidden columns rots. That is the other way round here:
-- an organiser may write every column of a committee of their own conference --
-- that is what this whole editor is -- except the one saying which conference
-- it belongs to. So the list that must not rot is the protected one, and it has
-- exactly one entry, which is part of the row's identity rather than part of
-- its content. A column added to committees next year is content and should be
-- writable; naming it here would be the mistake.
--
-- This file:
--
--   * adds protect_committees_columns and the trigger that runs it
--
-- It creates no table, so nothing else changes. The database tests are in
-- client/tests/db/committees-access.test.ts.


-- -----------------------------------------------------------------------------
-- Trigger: the conference a committee belongs to never changes
-- -----------------------------------------------------------------------------
-- Only the app's own roles are held to this. The service role writes committees
-- in the tests and one day in a support script, and "current_user in ('anon',
-- 'authenticated')" is how the four existing column guards
-- (protect_profile_flags, protect_stripe_columns, protect_notifications_columns
-- and protect_conferences_columns) say the same thing.
--
-- Moving a committee between conferences is not something an organiser has ever
-- asked for, and if it were it would be a handover of the seats, the chairs and
-- the allocation with it, so it would be its own function with its own checks.

create or replace function public.protect_committees_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
    and new.conference_id is distinct from old.conference_id
  then
    raise exception 'A committee cannot be moved to another conference';
  end if;

  return new;
end;
$$;

create trigger committees_protect_columns
  before update on public.committees
  for each row
  execute function public.protect_committees_columns();
