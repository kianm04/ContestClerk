-- =============================================================================
-- An invitation holds only while its sender could still send it
-- =============================================================================
-- What the check of the invites package (20261022121000_security_invites.sql)
-- found still open around findings H1, M11, M15 and L1 of the security review
-- of 2026-10-10 (docs/security-review-2026-10-10.md).
--
-- 1. accept_invite_row checked the invitation but not its sender. An
--    organisation admin who was removed, or a team manager who lost
--    manage_team, was moved below the role they had offered, or lost a
--    permission the role gives, left pending invitations behind that still
--    made their holders admins or team members. Shown for an organisation
--    admin, and for a lost permission, by probes.
--
-- 2. The browser chose expires_at. guard_invite_rate stamped created_at but
--    not the expiry, so an inviter could send an invitation that never ran
--    out. The app leaves the column to its default of fourteen days.
--
-- 3. The token was checked for length only, and notify_invite builds the bell
--    link as '/invites/' || token. A sender could choose a token such as
--    '<32 characters>/../../settings?x=1' and so choose where the invitee's
--    bell sent them on this site. The app's tokens are 32 characters of a-z
--    and 2-7.
--
-- 4. Any manage_team holder could withdraw any of the conference's
--    invitations, including those offering a role above their own, which the
--    roles spec says they may neither send nor withdraw.
--
-- 5. Browsers kept Supabase's default UPDATE, TRUNCATE, TRIGGER and
--    REFERENCES grants on invites. Nothing in the app updates an invitation,
--    and there is no update policy, so only that absence stopped a change.
--
-- This file:
--
--   * has accept_invite_row ask that the sender still holds what sending asked
--     of them: the insert policy's manage_team, and guard_invite_role_rank's
--     rank above the role and every permission it gives;
--   * has guard_invite_rate cap a browser's expires_at at fourteen days;
--   * adds the CHECK invites_token_is_url_safe;
--   * adds can_manage_role(role_id) to the conference branch of the delete
--     policy;
--   * revokes those four grants.
--
-- The database tests are in client/tests/db/invitations-hold-while-sent.test.ts.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.

-- -----------------------------------------------------------------------------
-- 1. The sender's say-so still holds
-- -----------------------------------------------------------------------------
-- The whole function again, as 20261022121000 left it, with new checks after
-- the others: everything before them is about the invitation and the person
-- accepting it, and these are about the person who sent it.
-- user_rank is -1 for an owner or admin of the organisation and for a platform
-- admin, the same rank can_manage_role gives them when they send. The
-- permissions check is can_grant (20261022122000) with the sender in place of
-- auth.uid(), because nobody signed in as the sender is here to ask.
create or replace function public.accept_invite_row(invite_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  invite public.invites;
  my_email text;
  my_email_is_confirmed boolean;
  destination text;
begin
  if me is null then
    raise exception 'You have to be signed in to accept an invitation';
  end if;

  -- "accept_invite_row.invite_id" is how a function refers to its own
  -- argument when a column of the same name is in scope. With no such row,
  -- every field of `invite` is null.
  select *
  into invite
  from public.invites as stored
  where stored.id = accept_invite_row.invite_id;

  if invite.id is null then
    raise exception 'This invitation does not exist';
  end if;

  select lower(account.email), account.email_confirmed_at is not null
  into my_email, my_email_is_confirmed
  from auth.users as account
  where account.id = me;

  if invite.email is distinct from my_email then
    raise exception 'This invitation was sent to a different email address';
  end if;

  if not coalesce(my_email_is_confirmed, false) then
    raise exception 'Confirm your email address before accepting an invitation';
  end if;

  if invite.accepted_at is not null then
    raise exception 'This invitation has already been used';
  end if;

  if invite.expires_at <= now() then
    raise exception 'This invitation has expired';
  end if;

  if invite.kind = 'organization_member' and invite.role = 'owner' then
    raise exception 'An invitation cannot make somebody an owner. An owner can raise a member who has joined';
  end if;

  if invite.invited_by = me then
    raise exception 'You cannot accept an invitation you sent yourself';
  end if;

  -- An invitation carries its sender's say-so, so that say-so has to hold
  -- still when it is used, as it did when it was sent (the invites insert
  -- policy). Somebody removed from the organisation or the team, or moved
  -- below the role they offered, no longer gives anybody anything, and the
  -- same goes for a role moved above them since.
  if invite.kind = 'organization_member' then
    if not exists (
      select 1
      from public.organization_members as membership
      where membership.organization_id = invite.organization_id
        and membership.user_id = invite.invited_by
        and membership.role in ('owner', 'admin')
    ) then
      raise exception 'The person who sent this invitation can no longer invite people to this organisation';
    end if;
  elsif not (
    public.holder_has_permission(invite.conference_id, invite.invited_by, 'manage_team')
    and (
      public.holder_has_permission(invite.conference_id, invite.invited_by, 'administrator')
      or exists (
        select 1
        from public.conference_roles as role
        where role.id = invite.role_id
          and role.conference_id = invite.conference_id
          and role.position > coalesce(
            public.user_rank(invite.conference_id, invite.invited_by),
            2147483647
          )
      )
    )
  ) then
    raise exception 'The person who sent this invitation can no longer give this role';
  end if;

  -- A role's permissions are given only by somebody who holds each of them,
  -- whole-conference for a whole-conference role (section 7 of
  -- docs/roles-and-permissions.md). An administrator, or an owner or admin of
  -- the organisation, holds them all, which holder_has_permission answers.
  if invite.kind <> 'organization_member'
    and not public.holder_has_permission(invite.conference_id, invite.invited_by, 'administrator')
    and exists (
      select 1
      from public.conference_roles as role
      cross join lateral unnest(role.permissions) as wanted (permission)
      where role.id = invite.role_id
        and not exists (
          select 1
          from public.conference_role_members as member
          join public.conference_roles as sender_role
            on sender_role.id = member.role_id
           and sender_role.conference_id = member.conference_id
          where member.conference_id = invite.conference_id
            and member.user_id = invite.invited_by
            and (sender_role.scope = 'conference' or role.scope = 'committees')
            and sender_role.permissions && array['administrator', wanted.permission]::public.permission[]
        )
    )
  then
    raise exception 'The person who sent this invitation can no longer give this role';
  end if;

  if invite.kind = 'organization_member' then
    -- The table now refuses any other word, so this catches only a row older
    -- than invites_role_is_organization_role.
    if invite.role not in ('admin', 'member') then
      raise exception 'This invitation has a role that is not an organisation role';
    end if;

    insert into public.organization_members (organization_id, user_id, role)
    values (invite.organization_id, me, invite.role::public.organization_role)
    on conflict (organization_id, user_id) do nothing;

    select '/manage/organizations/' || organization.slug
    into destination
    from public.organizations as organization
    where organization.id = invite.organization_id;
  else
    if invite.role_id is null then
      raise exception 'This invitation names no role';
    end if;

    insert into public.conference_staff (conference_id, user_id, title)
    values (invite.conference_id, me, invite.title)
    on conflict (conference_id, user_id) do update
      set title = coalesce(excluded.title, conference_staff.title);

    insert into public.conference_role_members (conference_id, user_id, role_id, granted_by)
    values (invite.conference_id, me, invite.role_id, invite.invited_by)
    on conflict (role_id, user_id) do nothing;

    if invite.committee_id is not null then
      insert into public.committee_chairs (committee_id, user_id)
      values (invite.committee_id, me)
      on conflict (committee_id, user_id) do nothing;
    end if;

    select '/manage/' || conference.slug
    into destination
    from public.conferences as conference
    where conference.id = invite.conference_id;
  end if;

  update public.invites
  set accepted_at = now(), accepted_by = me
  where id = invite.id;

  return destination;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. An invitation lasts fourteen days at most
-- -----------------------------------------------------------------------------
-- The whole function again, as 20261022121000 left it, with the expiry capped
-- beside the other columns it stamps. least() and not a plain assignment, so
-- that a shorter expiry somebody chose on purpose still stands. least() skips
-- a null, so an explicit null, which this trigger sees before NOT NULL is
-- checked, also gets fourteen days.
create or replace function public.guard_invite_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sent_in_the_last_hour integer;
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;

  new.created_at := now();
  new.accepted_at := null;
  new.accepted_by := null;
  new.expires_at := least(new.expires_at, now() + interval '14 days');

  perform pg_advisory_xact_lock(hashtext('invite_sends:' || new.invited_by::text));

  delete from public.invite_sends as send
  where send.invited_by = new.invited_by
    and send.sent_at <= now() - interval '1 hour';

  select count(*)
  into sent_in_the_last_hour
  from public.invite_sends as send
  where send.invited_by = new.invited_by;

  if sent_in_the_last_hour >= 50 then
    raise exception 'You have sent fifty invitations in the last hour. Wait a while before sending more';
  end if;

  insert into public.invite_sends (invited_by) values (new.invited_by);

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. A token is letters, digits, '-' and '_' only
-- -----------------------------------------------------------------------------
-- How long a token is stays invites_token_length's to say, so that a token
-- too short is refused in those words. No row on any stack this was checked
-- against breaks it, so it is added valid.
alter table public.invites
  add constraint invites_token_is_url_safe check (token ~ '^[A-Za-z0-9_-]*$');

-- -----------------------------------------------------------------------------
-- 4. A team manager withdraws only what they could have sent
-- -----------------------------------------------------------------------------
-- The sender may still withdraw their own, and an organisation admin any of
-- the organisation's. role_id is never null on a conference invitation
-- (invites_role_matches_kind).
drop policy "Inviters and the people in charge can withdraw an invitation" on public.invites;

create policy "Inviters and the people in charge can withdraw an invitation"
  on public.invites
  for delete
  to authenticated
  using (
    invited_by = (select auth.uid())
    or (
      conference_id is not null
      and public.has_permission(conference_id, 'manage_team')
      and public.can_manage_role(role_id)
    )
    or (organization_id is not null and public.is_organization_admin(organization_id))
  );

-- -----------------------------------------------------------------------------
-- 5. Browsers never update an invitation
-- -----------------------------------------------------------------------------
revoke update, truncate, trigger, references on public.invites from anon, authenticated;
