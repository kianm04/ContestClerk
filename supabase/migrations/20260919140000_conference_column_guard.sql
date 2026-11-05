-- =============================================================================
-- Migration 0008: a conference cannot be moved to another organisation
-- =============================================================================
--
-- WHAT THIS IS
-- Task T20 in specs/07-delivery/tasks.md, the conference details editor. The
-- editor is the first page in the app that writes ordinary columns of
-- conferences, and specs/07-delivery/open-questions.md has been carrying a gap
-- since T01 that has to be closed before it does.
--
-- THE GAP
-- The conferences update policy is can_manage_conference (see
-- specs/02-architecture/permissions.md), which asks about the row being
-- changed. Every helper of that kind is "stable" and reads the table from the
-- statement's own snapshot, so the "with check" half of the policy still sees
-- the *old* organization_id. An organiser could therefore post
-- organization_id = <any organisation> and hand their conference, its
-- committees, its applications and its invoices to an organisation they have
-- nothing to do with. The policy is not wrong -- permissions.md says only "org."
-- for that cell -- so the fix belongs in a trigger, the way permissions.md's
-- "Trigger-protected columns" section says.
--
-- WHY A NAMED COLUMN RATHER THAN AN ALLOW-LIST
-- permissions.md asks a protect_<table>_columns trigger to compare everything
-- outside an allow-list, because a list of forbidden columns rots: a column
-- added next year would be missing from it and a browser would quietly gain the
-- right to write it. That reasoning is the other way round here. An organiser
-- may write every column of their own conference -- that is what the details
-- editor, the application form editor and the fees page all are -- except the
-- one that says whose conference it is. So the list that must not rot is the
-- protected one, and it has exactly one entry, which is part of the row's
-- identity rather than part of its content. A column added to conferences next
-- year is content and should be writable; naming it here would be the mistake.
--
-- This file:
--
--   * adds protect_conferences_columns and the trigger that runs it
--
-- It creates no table, so nothing else changes. The database tests are in
-- client/tests/db/conferences-access.test.ts.


-- -----------------------------------------------------------------------------
-- Trigger: the organisation running a conference never changes
-- -----------------------------------------------------------------------------
-- Only the app's own roles are held to this. The service role writes conferences
-- in the tests and one day in a support script, and "current_user in ('anon',
-- 'authenticated')" is how the three existing column guards
-- (protect_profile_flags, protect_stripe_columns, protect_notifications_columns)
-- say the same thing.
--
-- Moving a conference between organisations is a real thing an organiser might
-- one day need, but it is a handover of everything hanging off it, not an edit,
-- so it would be its own function with its own checks on both sides.

create or replace function public.protect_conferences_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
    and new.organization_id is distinct from old.organization_id
  then
    raise exception 'A conference cannot be moved to another organisation';
  end if;

  return new;
end;
$$;

create trigger conferences_protect_columns
  before update on public.conferences
  for each row
  execute function public.protect_conferences_columns();
