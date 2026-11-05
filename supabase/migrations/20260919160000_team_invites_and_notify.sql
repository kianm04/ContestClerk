-- =============================================================================
-- Migration 0010: the team page's three missing pieces
-- =============================================================================
--
-- WHAT THIS IS
-- Task T22 in specs/07-delivery/tasks.md, the team page at
-- /manage/[slug]/team and the invite accept page at /invites/[token]. No new
-- table and no new policy: conference_staff, committee_chairs, invites and
-- notifications all exist, and specs/02-architecture/permissions.md already
-- gives each of them the rules this page needs. What is missing is three
-- things the page cannot do without.
--
-- 1. A TITLE ON AN INVITATION
-- specs/05-pages/organiser/team.md asks the invite form for a title ("Secretary
-- General"), which conference_staff has a column for and invites does not. The
-- title has to travel with the invitation, because the staff row does not exist
-- until the person accepts. So invites gains the column and accept_invite is
-- replaced with the same body plus one more column written.
--
-- 2. "THAT PERSON IS ALREADY ON THE TEAM."
-- The same page file refuses an invitation to somebody who is already on the
-- team. Answering that means turning an email address into an account, and
-- permissions.md gives profile_details (where the address lives) to the person
-- themselves, to the organisers of a conference they *participate* in, and to
-- their delegation head -- not to the organisers of a conference they are
-- staff of. So an organiser cannot read their own team's addresses, and the
-- question can only be asked by a security definer function that answers yes
-- or no about an address the organiser has just typed in. It never hands an
-- address back, and it refuses anybody who cannot manage the conference, so it
-- cannot be used to find out where somebody has an account.
--
-- 3. notify_invite
-- specs/02-architecture/notifications.md lists it; task T01 built the
-- notifications table and left this trigger without an owner, because nothing
-- created an invitation yet. The team page is what creates one, so it is this
-- task's. An invitation to somebody who already has an account turns up in
-- their bell; an invitation to an address with no account writes nothing, and
-- the organiser sends them the link by hand (email is Phase 2).
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- invites.title
-- -----------------------------------------------------------------------------
-- Free text shown beside the person's name on the team list once they accept.
-- Nullable, because most invitations have no title to give, and 40 characters
-- because that is the limit the form checks; the constraint is here so that a
-- longer one cannot be written by anything that skips the form.

alter table public.invites
  add column title text;

alter table public.invites
  add constraint invites_title_length check (title is null or char_length(title) <= 40);


-- -----------------------------------------------------------------------------
-- accept_invite: carry the title onto the staff row
-- -----------------------------------------------------------------------------
-- The same function migration 0003 left behind, with one column added to the
-- conference_staff insert. It is repeated in full rather than patched, because
-- "create or replace function" replaces the whole body and a reader of this
-- file should be able to see what the function now does without opening two
-- earlier migrations.
--
-- The "on conflict" branch keeps whatever title the person already had when the
-- new invitation names none: accepting a second invitation should not quietly
-- wipe the title an organiser typed on the team page. Inside "do update set",
-- "conference_staff.title" is the row that is already there and
-- "excluded.title" is the one being written.

create or replace function public.accept_invite(token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.invites;
  me uuid := (select auth.uid());
  my_email text;
  destination text;
begin
  if me is null then
    raise exception 'You have to be signed in to accept an invitation';
  end if;

  select lower(account.email)
  into my_email
  from auth.users as account
  where account.id = me;

  select *
  into invite
  from public.invites as pending
  where pending.token = accept_invite.token;

  if invite.id is null then
    raise exception 'This invitation does not exist';
  end if;

  if invite.accepted_at is not null then
    raise exception 'This invitation has already been used';
  end if;

  if invite.expires_at <= now() then
    raise exception 'This invitation has expired';
  end if;

  if invite.email is distinct from my_email then
    raise exception 'This invitation was sent to a different email address';
  end if;

  if invite.kind = 'organization_member' then
    if invite.role not in ('owner', 'admin', 'member') then
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
    if invite.role not in ('organiser', 'chair', 'volunteer') then
      raise exception 'This invitation has a role that is not a conference role';
    end if;

    insert into public.conference_staff (conference_id, user_id, role, title)
    values (invite.conference_id, me, invite.role::public.staff_role, invite.title)
    on conflict (conference_id, user_id) do update
      set role = excluded.role,
          title = coalesce(excluded.title, conference_staff.title);

    -- A chair invitation can also name the committee to chair. The
    -- invites_check_committee trigger in migration 0002 has already made sure
    -- it is a committee of this conference, so the row is safe to write.
    if invite.role = 'chair' and invite.committee_id is not null then
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
-- conference_team_has_email: is this address already on the team?
-- -----------------------------------------------------------------------------
-- "The team" is both halves of what the team page lists: the conference_staff
-- rows, and the members of the organisation running the conference, who are
-- organisers of it without a staff row (see can_manage_conference).
--
-- It is "security definer" because it reads auth.users, which no policy grants
-- to anybody. That makes the first line the whole guard: without it, anybody
-- signed in could ask about any conference. can_manage_conference is the same
-- helper the conference_staff insert policy asks, so somebody who is refused
-- here could not have sent the invitation either.
--
-- The address is compared lowercased on both sides. invites stores addresses
-- lowercase (invites_email_is_lowercase), but auth.users does not promise to,
-- and the organiser typed this one in by hand.

create or replace function public.conference_team_has_email(conference_id uuid, email text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_conference(conference_team_has_email.conference_id) then
    raise exception 'You cannot manage that conference';
  end if;

  return exists (
    select 1
    from auth.users as account
    where lower(account.email) = lower(conference_team_has_email.email)
      and (
        exists (
          select 1
          from public.conference_staff as staff
          where staff.conference_id = conference_team_has_email.conference_id
            and staff.user_id = account.id
        )
        or exists (
          select 1
          from public.conferences as conference
          join public.organization_members as membership
            on membership.organization_id = conference.organization_id
          where conference.id = conference_team_has_email.conference_id
            and membership.user_id = account.id
        )
      )
  );
end;
$$;

revoke execute on function public.conference_team_has_email(uuid, text) from public, anon;
grant execute on function public.conference_team_has_email(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- notify_invite
-- -----------------------------------------------------------------------------
-- specs/02-architecture/notifications.md: "{inviter} invited you to
-- {organisation/conference} as {role}", linking to /invites/{token}.
--
-- The address is looked up in auth.users rather than in profiles, which is what
-- the notifications file says, because profiles holds no address at all: it is
-- in profile_details, and both are copies of auth.users.email kept current by
-- the sync_user_email trigger. Reading the original is one table less to be
-- wrong about, and it is where accept_invite and list_my_invites already look.
--
-- Nothing is written when no account matches. That is the ordinary case for a
-- conference inviting a new chair, and the organiser sends them the link by
-- hand until email arrives in Phase 2.
--
-- The role is written into the sentence as it is stored. Every value of both
-- role enums -- owner, admin, member, organiser, chair, volunteer -- is already
-- an English word, and the alternative is a second list of words beside the one
-- in src/lib/status.ts.

create or replace function public.notify_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitee uuid;
  inviter_name text;
  target_name text;
begin
  select account.id
  into invitee
  from auth.users as account
  where lower(account.email) = new.email;

  if invitee is null then
    return new;
  end if;

  select inviter.full_name
  into inviter_name
  from public.profiles as inviter
  where inviter.id = new.invited_by;

  if new.kind = 'organization_member' then
    select organization.name
    into target_name
    from public.organizations as organization
    where organization.id = new.organization_id;
  else
    select conference.name
    into target_name
    from public.conferences as conference
    where conference.id = new.conference_id;
  end if;

  insert into public.notifications (user_id, conference_id, kind, title, link_path)
  values (
    invitee,
    new.conference_id,
    'invite_received',
    coalesce(inviter_name, 'Somebody') || ' invited you to ' || target_name
      || ' as ' || new.role,
    '/invites/' || new.token
  );

  return new;
end;
$$;

revoke execute on function public.notify_invite() from public, anon, authenticated;

create trigger invites_notify_invite
  after insert on public.invites
  for each row
  execute function public.notify_invite();
