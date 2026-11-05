-- =============================================================================
-- An applicant's own write puts the decision back as it was
-- (security review of 10 October 2026: finding M7, second pass)
-- =============================================================================
--
-- Never edit this file once it has been applied anywhere. Add a new migration.
--
-- WHAT THIS IS
-- 20261022132000_internal_notes_grants.sql took `decided_by` out of the
-- applicant's grant on `applications`, so no select of theirs can name it. The
-- review of that migration found one more way to ask. `guard_application_update`
-- compares `new.decided_by` with `old.decided_by` for the applicant and raises
-- "Only the organisers decide an application" when the two differ. A
-- waitlisted application is one the applicant may still write, to withdraw it,
-- and it carries a decider, so a request to withdraw that also named a
-- `decided_by` was refused for a wrong name, with no side effect, and went
-- through for the right one. The conference's team page gives names and
-- `profiles` gives an id for a name, so an applicant could try the team one by
-- one, each wrong name costing nothing, and read who decided off the one
-- withdrawal that succeeded.
--
-- A comparison answers a question; an assignment does not. This trigger runs
-- before the guard and, for the applicant's own request, puts the four decision
-- columns back to what they were. The guard then finds them unchanged whatever
-- was sent, so a right name and a wrong one do the same one thing: withdraw.
--
-- WHY A TRIGGER OF ITS OWN
-- The plain fix would be four assignments in the guard's applicant branch, but
-- `guard_application_update` is being rewritten in this review round by other
-- hands (the applications windows), and two migrations replacing one function
-- is how a fix gets lost. A second trigger leaves the guard as it is and still
-- fires first: Postgres runs the BEFORE triggers of one table in alphabetical
-- order of their names, and `applications_applicant_keeps_decision` sorts
-- before `applications_guard_update` (and before every other trigger on the
-- table today). Whoever renames a trigger on `applications` keeps that order,
-- and tests/db/security-internal-notes-grants.test.ts fails if it is lost.
--
-- The same shape protects `decided_at`, `decision_note` and the retired
-- `internal_note`; the first two the applicant may read anyway, and the third
-- is always null, so there was nothing to learn there. They are put back all
-- the same, because the rule is simpler to hold as "an applicant's write never
-- touches a decision column" than as a list of which columns happen to be
-- harmless this year.
--
-- `delegations.decided_by` has the same comparison in `guard_delegation_update`
-- and no counterpart here: the head and members may read that column (the
-- table keeps its table-level grant, see 20261022132000), so a guess tells them
-- nothing a select does not.

create or replace function public.keep_decision_from_applicant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Whose request this is, asked the way guard_application_update's applicant
  -- branch asks it, so the two triggers agree. The server's own functions
  -- (accept_application, move_delegate and the rest) run as their owner, not
  -- as `authenticated`, and an organiser deciding is not writing their own
  -- row; both pass straight through.
  if current_user in ('anon', 'authenticated') and new.user_id = (select auth.uid()) then
    new.decided_at := old.decided_at;
    new.decided_by := old.decided_by;
    new.decision_note := old.decision_note;
    new.internal_note := old.internal_note;
  end if;

  return new;
end;
$$;

revoke execute on function public.keep_decision_from_applicant() from public, anon, authenticated;

create trigger applications_applicant_keeps_decision
  before update on public.applications
  for each row
  execute function public.keep_decision_from_applicant();
