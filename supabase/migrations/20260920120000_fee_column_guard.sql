-- =============================================================================
-- Migration 0011: a fee cannot be moved to another conference
-- =============================================================================
--
-- WHAT THIS IS
-- Task T66 in specs/07-delivery/tasks.md, the fees page. It is the first page
-- in the app that writes rows of the fees table, and T17's review left a gap
-- open that has to be closed before it does.
--
-- THE GAP
-- The fees update policy is can_manage_conference(conference_id) on both halves
-- (see specs/02-architecture/permissions.md). Every helper of that kind is
-- "stable" and reads the table from the statement's own snapshot, so the
-- "with check" half still sees the *old* conference_id. An organiser who runs
-- two conferences could therefore post conference_id = <their other conference>
-- and carry the fee across. The invoices already written against it would keep
-- their fee_id, so an invoice of one conference would point at a fee of
-- another: the fees page's "12 invoices" count, and the delete policy that
-- reads it, would both then be answering about the wrong conference. The policy
-- is not wrong -- permissions.md says only "org." for that cell -- so the fix
-- belongs in a trigger, the way permissions.md's "Trigger-protected columns"
-- section says.
--
-- WHY A NAMED COLUMN RATHER THAN AN ALLOW-LIST
-- The same reasoning as protect_committees_columns in migration 0009 and
-- protect_conferences_columns in 0008, which closed the identical gap one and
-- two levels up. permissions.md asks a protect_<table>_columns trigger to
-- compare everything outside an allow-list, because a list of forbidden columns
-- rots. That is the other way round here: an organiser may write every column
-- of a fee of their own conference -- the name, the amount, who it applies to,
-- the window and the position are what the fees page is -- except the one
-- saying which conference it belongs to. So the list that must not rot is the
-- protected one, and it has exactly one entry, which is part of the row's
-- identity rather than part of its content.
--
-- This file:
--
--   * adds protect_fees_columns and the trigger that runs it
--
-- It creates no table, so nothing else changes. The database tests are in
-- client/tests/db/fees.test.ts.


-- -----------------------------------------------------------------------------
-- Trigger: the conference a fee belongs to never changes
-- -----------------------------------------------------------------------------
-- Only the app's own roles are held to this. The service role writes fees in
-- the tests and one day in a support script, and "current_user in ('anon',
-- 'authenticated')" is how the five existing column guards
-- (protect_profile_flags, protect_stripe_columns, protect_notifications_columns,
-- protect_conferences_columns and protect_committees_columns) say the same
-- thing.
--
-- Moving a fee between conferences is not something an organiser has ever asked
-- for. A conference that wants the same price as another one adds its own row,
-- which costs one form; carrying the row across would take its invoices' history
-- with it.

create or replace function public.protect_fees_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
    and new.conference_id is distinct from old.conference_id
  then
    raise exception 'A fee cannot be moved to another conference';
  end if;

  return new;
end;
$$;

create trigger fees_protect_columns
  before update on public.fees
  for each row
  execute function public.protect_fees_columns();
