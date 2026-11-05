-- =============================================================================
-- Account deletion, hardened (security review L20, L29, L43)
-- =============================================================================
-- docs/security-review-2026-10-10.md found three things wrong with
-- delete_my_account, the function behind "Delete account" on /settings. This
-- migration writes the function again, starting from the body in
-- 20261001120700, with three changes, and loosens one trigger so that a way
-- out the function now names is real.
--
--   * L43: the function asked nothing about when the person had signed in.
--     Anybody holding a session, on a laptop left unlocked or through a cookie
--     taken weeks ago, could delete the account. It now reads the "amr" claim
--     GoTrue puts in every access token (how the person authenticated, each
--     entry stamped with the second it happened) and refuses unless one of them
--     is within the last fifteen minutes. The settings page asks for the
--     password and signs the person in again before it calls this, which is
--     what mints a fresh stamp.
--
--   * L20: the invitations addressed to the person stayed behind, holding their
--     address and the role they had been offered. The pending ones go with the
--     account. Invitations the person sent already went, through
--     invites.invited_by, and accepted ones keep their row as the record of how
--     somebody joined, with accepted_by set to null as before.
--
--   * L29: the only head of a delegation was turned away with "A delegation
--     needs at least one head. Make somebody else a head first.", raised by
--     prevent_last_delegation_head_removal from the cascade that deletes their
--     membership. The page could not say which delegation, and "somebody else"
--     was no help to a head whose school had already withdrawn, because the
--     trigger kept a head on every delegation whatever its status. Now the
--     function looks before it deletes and names the delegation, its
--     conference and the ways out, and the trigger lets the last head of a
--     withdrawn or rejected delegation go: there is nobody left to seat and
--     nothing left to pay for, which is the whole reason a delegation keeps a
--     head.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- =============================================================================
-- prevent_last_delegation_head_removal, letting go of a delegation that is over
-- =============================================================================
-- The same function as in 20260918120000 with one more early return. The
-- delegation_members_keep_a_head trigger that calls it is unchanged.

create or replace function public.prevent_last_delegation_head_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  delegation_status public.delegation_status;
  other_heads integer;
begin
  select delegation.status
  into delegation_status
  from public.delegations as delegation
  where delegation.id = old.delegation_id;

  -- Deleting the delegation itself deletes every membership with it. There is
  -- no delegation left to be without a head, and the parent row is already gone
  -- by the time this runs.
  if tg_op = 'DELETE' and delegation_status is null then
    return old;
  end if;

  -- Removing or changing somebody who is not a head is always fine.
  if old.role <> 'head' then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  -- An update that leaves them a head changes nothing about this rule.
  if tg_op = 'UPDATE' and new.role = 'head' then
    return new;
  end if;

  -- A withdrawn or rejected delegation is over. Nobody will seat its members or
  -- pay its invoice, so its last head may step down or leave the site (L29).
  -- Without this a head whose school changed its mind could never delete their
  -- account, because the cascade from auth.users lands here.
  if delegation_status in ('withdrawn', 'rejected') then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  select count(*)
  into other_heads
  from public.delegation_members as membership
  where membership.delegation_id = old.delegation_id
    and membership.role = 'head'
    and membership.user_id <> old.user_id;

  if other_heads = 0 then
    raise exception 'A delegation needs at least one head. Make somebody else a head first.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke execute on function public.prevent_last_delegation_head_removal()
  from public, anon, authenticated;


-- =============================================================================
-- delete_my_account()
-- =============================================================================
-- In order: the sign-in has to be recent (L43); the person's quick sessions go
-- with their personal organisation, as before; a sole owner of a real
-- organisation is turned away, as before; a sole head of a live delegation is
-- turned away with the delegation named (L29); the invitations waiting for the
-- person go (L20); then the account. Every refusal is raised before anything is
-- deleted, and the whole thing is one transaction either way.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  -- The claims of the access token this request carried, which PostgREST sets
  -- for the transaction. The "true" makes a missing setting read as null, as it
  -- is in a psql session, rather than fail.
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  last_sign_in timestamptz;
  my_email text;
  blocking_organization text;
  blocking_delegation record;
begin
  if me is null then
    raise exception 'You have to be signed in to delete your account';
  end if;

  -- L43: a recent sign-in. The "amr" claim lists how the person authenticated,
  -- each entry with the second it happened as a unix timestamp:
  --
  --   "amr": [{"method": "password", "timestamp": 1792680993}]
  --
  -- GoTrue v2.196, the version this project runs, writes it into every access
  -- token, and a refreshed token keeps the original stamps, so the newest of
  -- them is when the person last proved who they are. The token's own
  -- issued-at stamp, "iat", would not do: a refresh writes a new one every
  -- hour without asking anybody anything. So "iat" is not used, not even as a
  -- fallback, and a token with no "amr" at all is refused like a stale one.
  -- Only a well-formed entry counts, which is what the typeof and the pattern
  -- below check; jsonb_array_elements would fail on anything but an array.
  select max(to_timestamp((entry ->> 'timestamp')::double precision))
  into last_sign_in
  from jsonb_array_elements(
    case
      when jsonb_typeof(claims -> 'amr') = 'array' then claims -> 'amr'
      else '[]'::jsonb
    end
  ) as entry
  where (entry ->> 'timestamp') ~ '^[0-9]+$';

  if last_sign_in is null or last_sign_in < now() - interval '15 minutes' then
    raise exception 'You signed in more than 15 minutes ago. Sign in again before deleting your account.';
  end if;

  -- The person's quick sessions, with the personal organisation that holds
  -- them, as 20261001120700 explains: without this the sole owner of "Quick
  -- sessions" would be told to hand over an organisation nobody else can use.
  -- The conferences go first, because conferences.organization_id restricts
  -- the delete of an organisation that still has one.
  delete from public.conferences as conference
  using public.organizations as organization
  where organization.id = conference.organization_id
    and organization.created_by = me
    and organization.is_personal
    and conference.kind = 'quick_session';

  delete from public.organizations as organization
  where organization.created_by = me
    and organization.is_personal
    and not exists (
      select 1
      from public.conferences as conference
      where conference.organization_id = organization.id
    );

  -- An organisation must keep an owner, so a sole owner hands it over first.
  select organization.name
  into blocking_organization
  from public.organization_members as membership
  join public.organizations as organization
    on organization.id = membership.organization_id
  where membership.user_id = me
    and membership.role = 'owner'
    and not exists (
      select 1
      from public.organization_members as other_member
      where other_member.organization_id = membership.organization_id
        and other_member.role = 'owner'
        and other_member.user_id <> me
    )
  limit 1;

  if blocking_organization is not null then
    raise exception 'Make somebody else an owner of % before you delete your account',
      blocking_organization;
  end if;

  -- L29: a live delegation must keep a head. The delegation_members_keep_a_head
  -- trigger would refuse the cascade below with a sentence that names nothing,
  -- so the question is asked here first, where the delegation and its
  -- conference can be named and the way out can fit where the request stands:
  -- a head may withdraw a draft or submitted request but not an accepted one
  -- (guard_delegation_update), so for an accepted one the only way out is
  -- another head. Withdrawn and rejected requests are over, and the trigger
  -- above lets their last head go. The oldest delegation is named when there
  -- are several, so that the person is told the same one each time.
  select delegation.name, delegation.status, conference.name as conference_name
  into blocking_delegation
  from public.delegation_members as membership
  join public.delegations as delegation
    on delegation.id = membership.delegation_id
  join public.conferences as conference
    on conference.id = delegation.conference_id
  where membership.user_id = me
    and membership.role = 'head'
    and delegation.status not in ('withdrawn', 'rejected')
    and not exists (
      select 1
      from public.delegation_members as other_head
      where other_head.delegation_id = membership.delegation_id
        and other_head.role = 'head'
        and other_head.user_id <> me
    )
  order by delegation.created_at
  limit 1;

  if found then
    raise exception 'You are the only head of % at %. % before deleting your account.',
      blocking_delegation.name,
      blocking_delegation.conference_name,
      case
        when blocking_delegation.status = 'accepted' then 'Make another member a head'
        else 'Make another member a head, or withdraw the delegation,'
      end;
  end if;

  -- L20: the invitations still waiting for this person hold their address and
  -- the role they were offered, and nobody is left to accept them. Invitation
  -- addresses are stored lowercase (invites_email_is_lowercase), and lower()
  -- on the account's side makes the comparison exact whatever case GoTrue kept.
  select lower(account.email)
  into my_email
  from auth.users as account
  where account.id = me;

  delete from public.invites as invite
  where invite.email = my_email
    and invite.accepted_at is null;

  delete from auth.users where id = me;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
