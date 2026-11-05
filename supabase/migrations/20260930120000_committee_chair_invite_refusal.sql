-- -----------------------------------------------------------------------------
-- committee_chair_invite_refusal: may this address be invited to chair this
-- committee?
-- -----------------------------------------------------------------------------
-- T175 moved "Invite a chair" into the committee editor's Chairs panel
-- (specs/05-pages/organiser/committee-edit.md, "inviteChair"). The panel
-- refuses two kinds of address, and both can only be recognised by reading
-- auth.users, which no policy grants to anybody -- hence security definer, the
-- same shape as conference_team_has_email one migration family earlier:
--
-- * 'already_chair': the account already has a committee_chairs row for this
--   committee, so the invitation would do nothing.
-- * 'organiser': the account is an organiser of the conference, either as a
--   member of the organisation running it or as conference_staff with role
--   organiser. accept_invite writes the invitation's role over an existing
--   staff row, so an organiser accepting a chair invitation would lose their
--   organiser role. An organiser chairs through the panel's own
--   "Chair it yourself" button instead.
--
-- Anything else answers null: the address may be invited. The answer is a word
-- about one address the organiser has just typed and never hands an address
-- back. The first line is the whole guard: without it, anybody signed in could
-- ask about any committee.
--
-- The address is compared lowercased on both sides, for the reason
-- conference_team_has_email gives.

create or replace function public.committee_chair_invite_refusal(committee_id uuid, email text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  the_conference uuid;
  the_organization uuid;
  account_id uuid;
begin
  select committee.conference_id, conference.organization_id
  into the_conference, the_organization
  from public.committees as committee
  join public.conferences as conference on conference.id = committee.conference_id
  where committee.id = committee_chair_invite_refusal.committee_id;

  if the_conference is null or not public.can_manage_conference(the_conference) then
    raise exception 'You cannot manage that committee';
  end if;

  select account.id
  into account_id
  from auth.users as account
  where lower(account.email) = lower(committee_chair_invite_refusal.email);

  -- No account has that address yet, which is the ordinary case for a new
  -- chair: nothing about them can be in the way.
  if account_id is null then
    return null;
  end if;

  if exists (
    select 1
    from public.committee_chairs as chair
    where chair.committee_id = committee_chair_invite_refusal.committee_id
      and chair.user_id = account_id
  ) then
    return 'already_chair';
  end if;

  if exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id = the_organization
      and membership.user_id = account_id
  ) or exists (
    select 1
    from public.conference_staff as staff
    where staff.conference_id = the_conference
      and staff.user_id = account_id
      and staff.role = 'organiser'
  ) then
    return 'organiser';
  end if;

  return null;
end;
$$;

revoke execute on function public.committee_chair_invite_refusal(uuid, text) from public, anon;
grant execute on function public.committee_chair_invite_refusal(uuid, text) to authenticated;
