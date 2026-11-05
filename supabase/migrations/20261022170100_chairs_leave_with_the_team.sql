-- =============================================================================
-- Leaving the team leaves its committees, and no write to a chair row puts
-- anybody back on the team
-- =============================================================================
-- What the check of 20261022170000_final_review_fixes found still open of
-- finding L8 of the security review of 2026-10-10
-- (docs/security-review-2026-10-10.md).
--
-- Taking somebody off conference_staff, whether a team manager removed them
-- or they left, kept their committee_chairs rows. That table points at
-- committees and at auth.users, not at the staff row, so nothing cascaded,
-- though removeStaff in client/src/lib/server/team.ts said it did. A team
-- manager could then change the title on the row left behind:
-- protect_committee_chairs_team let a change of title through without asking,
-- and ensure_chair_is_staff, which runs as the owner on every insert and
-- update of a chair row, put the person back on the team. That needed no
-- invitation and did not ask them, and any manage_team holder could do it,
-- one ranked below the owner who had removed the person included. The rows
-- left behind also kept removed chairs on the committee's page and in its
-- announcements' audience (conference_audience_user_ids reads
-- committee_chairs).
--
-- This file:
--
--   * adds the trigger conference_staff_takes_chairs_along: when a staff row
--     goes, that person's chair rows on the conference's committees go too;
--   * deletes the chair rows already left behind that way;
--   * replaces protect_committee_chairs_team, so that a change of title is
--     asked the same question as any other write from a browser: is this
--     person on the team?
--
-- The database tests are in client/tests/db/security-final-review.test.ts.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- remove_chairs_of_departed_staff(), after a staff row is deleted
-- -----------------------------------------------------------------------------
-- Security definer, because the person leaving deletes their own staff row
-- and may not delete chair rows: only a team manager may (the delete policy
-- on committee_chairs). Leaving the team is leaving every committee of it, so
-- the trigger does that part for them.
--
-- A conference or an account being deleted also deletes its staff rows. The
-- chair rows then go by their own cascade as well, and whichever delete runs
-- second finds nothing left, which is not an error.

create or replace function public.remove_chairs_of_departed_staff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.committee_chairs as assignment
  using public.committees as committee
  where committee.id = assignment.committee_id
    and committee.conference_id = old.conference_id
    and assignment.user_id = old.user_id;

  return old;
end;
$$;

revoke execute on function public.remove_chairs_of_departed_staff() from public, anon, authenticated;

create trigger conference_staff_takes_chairs_along
  after delete on public.conference_staff
  for each row
  execute function public.remove_chairs_of_departed_staff();


-- -----------------------------------------------------------------------------
-- The chair rows already left behind
-- -----------------------------------------------------------------------------
-- ensure_chair_is_staff has put every chair on the team since chairs were
-- first made (20260916120000), so a chair row with no staff row behind it is
-- one whose person has since left or been removed. Those rows go now, as they
-- would have with the trigger above.

delete from public.committee_chairs as assignment
using public.committees as committee
where committee.id = assignment.committee_id
  and not exists (
    select 1
    from public.conference_staff as staff
    where staff.conference_id = committee.conference_id
      and staff.user_id = assignment.user_id
  );


-- -----------------------------------------------------------------------------
-- protect_committee_chairs_team(), before a chair row is written
-- -----------------------------------------------------------------------------
-- The body of 20261022170000_final_review_fixes without its first shortcut,
-- which let an update keeping the same person on the same committee through
-- unasked. With the trigger above there is no row left to retitle once
-- somebody is off the team, but the check is cheap, so a change of title is
-- asked as well: a write to a chair row should never be what puts somebody on
-- the team. A row naming the caller is still let through, as "Chair it
-- yourself" and create_quick_session need.

create or replace function public.protect_committee_chairs_team()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
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
