-- =============================================================================
-- Delegations keep to the window too, and drafts stay with whoever wrote them
-- =============================================================================
--
-- WHAT THIS IS
-- The second half of findings M6, M14, L15 and L28 of the security review of
-- 2026-10-10 (docs/security-review-2026-10-10.md), found when the first half,
-- migration 20261022140000_applications_delegations_windows, was reviewed.
-- That migration closed the window for individual applications in
-- guard_application_update, but a delegation is the other way into a
-- conference and its guard had no window at all:
--
--   * M6, M14. A head could send a draft delegation after applications had
--     closed, or after the organiser had gone back to "I will open
--     applications myself" with no opening date, and could rewrite a sent one
--     at any time. canSubmitDelegation stopped the first only on the page, and
--     only for the closing date. guard_delegation_update now lets a head only
--     withdraw while conference_takes_applications(conference, 'delegation')
--     says no, exactly as guard_application_update does for an applicant.
--   * L28. A decider could move a delegation anywhere by a plain update, for
--     example a sent one to accepted with no seats behind it, an accepted one
--     back to submitted, or a draft nobody had sent to rejected. The organiser
--     branch now allows only the one move the review page makes by a column
--     write, to rejected, and refuses any change at all to a draft.
--   * L15. application_team_names answered a reader of the conference's
--     applications with every name in a team, the drafts' included, though the
--     read_applications policy now keeps those drafts from the same reader. It
--     now leaves drafts out for anybody who is not in the team.
--
-- This file:
--
--   * replaces guard_delegation_update (its trigger, delegations_guard_update,
--     stays as it is and calls the new body)
--   * replaces application_team_names
--
-- The database tests are in client/tests/db/security-applications-windows.test.ts.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- Trigger: guard_delegation_update
-- -----------------------------------------------------------------------------
-- The body of migration 20260918120000 with three rules added:
--
--   * the head: once the conference is not taking delegations the one thing
--     left to do is withdraw, and a withdrawal changes nothing but the status.
--     That covers a late submission, a late edit and a late move back to
--     draft, which is the first half of editing a sent delegation. It matches
--     canSubmitDelegation and canEditDelegation on the delegation page, which
--     offer "Submit" and "Details" only while the window is open. Withdrawing
--     stays open whenever the window is shut, because a head must always be
--     able to say "we are not coming";
--   * the organisers, a draft: a delegation nobody has sent is the head's own,
--     and the organisers' pages never show one, so there is nothing about it
--     for them to decide or note. The read_applications policy on delegations
--     still lets a reader see the row; this keeps the decide side shut;
--   * the organisers, the status: it may only become rejected, from submitted
--     or from accepted, which is "Reject" on the review page (rejectRefusal in
--     $lib/delegation-review.ts checks that an accepted one has no seats yet).
--     Nothing reaches accepted this way, because accepting hands out seats and
--     raises an invoice, which is allocate_delegation_seats' to do in one step;
--     and nothing goes back to draft, submitted or withdrawn, because those are
--     the head's to say.
--
-- Everything else is as it was, including why this is not security definer:
-- current_user has to be the caller's role for the browser test to mean
-- anything. allocate_delegation_seats and the other server functions run as
-- their owner and walk past all three rules, as they always did.

create or replace function public.guard_delegation_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- What each side may write, for the reason guard_application_update gives:
  -- the checks at the end of each branch compare everything else, so a column
  -- added to this table later is guarded from the day it arrives instead of
  -- being forgotten.
  head_writable constant text[] := array[
    'name', 'institution_name', 'country_code', 'requested_seats', 'note', 'status',
    'submitted_at', 'updated_at'
  ];
  organiser_writable constant text[] := array[
    'status', 'decision_note', 'internal_note', 'decided_at', 'decided_by',
    'submitted_at', 'updated_at'
  ];
  -- A withdrawal is the status and nothing else. updated_at is left out because
  -- delegations_set_updated_at overwrites it a moment later whatever anybody
  -- sent.
  withdrawal_columns constant text[] := array['status', 'updated_at'];
begin
  -- When a delegation was sent is this trigger's to say, the same rule
  -- guard_application_update keeps and for the same reason.
  if current_user in ('anon', 'authenticated')
    and new.submitted_at is distinct from old.submitted_at
  then
    raise exception 'When a delegation was submitted is not something a page writes';
  end if;

  if new.status = 'submitted' and old.status <> 'submitted' then
    new.submitted_at = now();
  elsif new.status = 'draft' and old.status <> 'draft' then
    -- The delegation page has no submitted -> draft move, but the status check
    -- below allows one, so the column is cleared here rather than left saying
    -- a draft was submitted at a moment that has passed.
    new.submitted_at = null;
  end if;

  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  -- The join code is minted once by create_delegation. Letting a head choose it
  -- would let them guess another delegation's.
  if new.join_code is distinct from old.join_code then
    raise exception 'The join code cannot be changed';
  end if;

  if new.conference_id is distinct from old.conference_id then
    raise exception 'A delegation cannot be moved to another conference';
  end if;

  if public.is_delegation_head(new.id) then
    -- The "where it is now" question comes first, so that a head touching a
    -- decided delegation is told it is decided rather than told off about a
    -- status they did not try to change.
    if old.status not in ('draft', 'submitted') then
      raise exception 'This delegation can no longer be changed';
    end if;

    if new.status not in ('draft', 'submitted', 'withdrawn') then
      raise exception 'You can only save, submit or withdraw a delegation';
    end if;

    -- The window. While the conference is not taking delegations, whether
    -- because it never opened applications, has closed them, stopped taking
    -- delegations or is no longer published, the head may withdraw and do
    -- nothing else: no edit, no submission of a draft, and no withdrawal that
    -- rewrites the delegation on its way out.
    if not public.conference_takes_applications(new.conference_id, 'delegation')
      and not (
        new.status = 'withdrawn'
        and to_jsonb(new) - withdrawal_columns is not distinct from to_jsonb(old) - withdrawal_columns
      )
    then
      raise exception 'This conference is not taking delegations, so the delegation can only be withdrawn';
    end if;

    if new.decided_at is distinct from old.decided_at
      or new.decided_by is distinct from old.decided_by
      or new.decision_note is distinct from old.decision_note
      or new.internal_note is distinct from old.internal_note
    then
      raise exception 'Only the organisers decide a delegation';
    end if;

    if to_jsonb(new) - head_writable is distinct from to_jsonb(old) - head_writable then
      raise exception 'A head can only change how they described their own delegation';
    end if;

    return new;
  end if;

  -- The organiser's rules. A draft is not theirs yet; see the note above.
  if old.status = 'draft' then
    raise exception 'A delegation nobody has sent is not for the organisers to decide';
  end if;

  -- The head's own description of their group is theirs.
  if new.name is distinct from old.name
    or new.institution_name is distinct from old.institution_name
    or new.country_code is distinct from old.country_code
    or new.requested_seats is distinct from old.requested_seats
    or new.note is distinct from old.note
  then
    raise exception 'An organiser cannot change what a delegation head wrote';
  end if;

  -- The one move the review page makes by a column write. See the note above
  -- the function for why nothing reaches accepted, or goes back, this way.
  if new.status is distinct from old.status
    and not (old.status in ('submitted', 'accepted') and new.status = 'rejected')
  then
    raise exception 'A delegation that is % cannot be marked % by the organisers',
      old.status, new.status;
  end if;

  if to_jsonb(new) - organiser_writable is distinct from to_jsonb(old) - organiser_writable
  then
    raise exception 'An organiser can only decide a delegation';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_delegation_update() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- application_team_names(team_id): who is in a team
-- -----------------------------------------------------------------------------
-- The body of migration 20261010120000 with one rule added. A member of the
-- team still reads every name in it, a teammate's draft included: they made the
-- team together and each knows the others are in it. A reader of the
-- conference's applications who is not in the team reads only the names on
-- applications somebody sent, the same rows the read_applications policy on
-- applications shows them.

create or replace function public.application_team_names(team_id uuid)
returns table (user_id uuid, full_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  team public.application_teams;
  is_in_team boolean;
begin
  select * into team from public.application_teams as team_row where team_row.id = application_team_names.team_id;

  if team.id is null then
    return;
  end if;

  is_in_team = exists (
    select 1
    from public.applications as application
    where application.team_id = team.id
      and application.user_id = (select auth.uid())
  );

  if not is_in_team and not public.has_permission(team.conference_id, 'read_applications') then
    return;
  end if;

  return query
  select application.user_id, profile.full_name
  from public.applications as application
  join public.profiles as profile on profile.id = application.user_id
  where application.team_id = team.id
    and (is_in_team or application.status <> 'draft')
  order by application.created_at;
end;
$$;

revoke execute on function public.application_team_names(uuid) from public, anon;
grant execute on function public.application_team_names(uuid) to authenticated;
