-- =============================================================================
-- Migration 0011: is this address already a member of the organisation?
-- =============================================================================
--
-- WHAT THIS IS
-- Task T23 in specs/07-delivery/tasks.md, the organisation settings page at
-- /manage/organizations/[orgSlug]. That page's invitation form has to refuse an
-- address that already belongs to the organisation, which is what
-- specs/05-pages/organiser/organization-settings.md asks for: "Refuses an email
-- already a member: 'That person is already a member.'"
--
-- WHY IT CANNOT BE AN ORDINARY QUERY
-- Turning an email address into an account means reading auth.users, and
-- specs/02-architecture/permissions.md grants that table to nobody. The one
-- table the app may read that holds an address is profile_details, and its
-- select rule is "self; organiser of a conference where the person is a
-- participant; head of a delegation the person is in" -- a fellow member of an
-- organisation is none of those. So the question can only be asked by a
-- security definer function, exactly as conference_team_has_email in migration
-- 0010 asks the same question one level down, about a conference's team.
--
-- This file:
--
--   * adds organization_has_email(org_id, email)
--
-- It creates no table and changes no policy. The database tests are in
-- client/tests/db/organizations.test.ts.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- organization_has_email(org_id, email)
-- -----------------------------------------------------------------------------
-- True when some account with that address has an organization_members row for
-- this organisation.
--
-- It answers yes or no and hands nothing back, so a caller learns only about
-- the one address they already typed in. It is "security definer" because it
-- reads auth.users, which makes the first line the whole guard: without it,
-- anybody signed in could ask whether a given person belongs to a given
-- organisation. is_organization_admin is the same helper the invites insert
-- policy asks, so somebody refused here could not have sent the invitation
-- either -- the same pairing conference_team_has_email makes with
-- can_manage_conference.
--
-- The address is compared lowercased on both sides. invites stores addresses
-- lowercase (invites_email_is_lowercase), but auth.users does not promise to,
-- and an admin typed this one in by hand.

create or replace function public.organization_has_email(org_id uuid, email text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_organization_admin(organization_has_email.org_id) then
    raise exception 'You cannot manage that organisation';
  end if;

  return exists (
    select 1
    from auth.users as account
    join public.organization_members as membership
      on membership.user_id = account.id
    where lower(account.email) = lower(organization_has_email.email)
      and membership.organization_id = organization_has_email.org_id
  );
end;
$$;

revoke execute on function public.organization_has_email(uuid, text) from public, anon;
grant execute on function public.organization_has_email(uuid, text) to authenticated;
