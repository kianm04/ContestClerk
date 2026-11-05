-- =============================================================================
-- Security review 2026-10-10: invitations (H1, M11, M15, L1, L18)
-- =============================================================================
-- docs/security-review-2026-10-10.md found five holes in how an invitation is
-- sent, listed and accepted. This migration closes them all, on the invites
-- table and its own functions alone; nothing else in the schema changes.
--
-- H1. WHO MAY CLAIM AN ADDRESS
-- accept_invite and list_my_invites matched an invitation to the signed-in
-- account by email address without asking whether that address was ever
-- confirmed. With email confirmation off, whoever registers an invitee's
-- address first could accept their invitations, and list_my_invites handed
-- them the secret token of every later one. Every match is now against a
-- confirmed address (auth.users.email_confirmed_at). Local GoTrue confirms at
-- sign-up, so nothing changes here today; it matters the day confirmations are
-- turned on. list_my_invites names a waiting invitation by its id rather than
-- by its token, and accept_invite_by_id accepts by that id, so the home page
-- never needs the link's secret to offer its Accept button.
--
-- M11. INVITING ONESELF
-- A team manager could invite their own address and accept it, gaining a role
-- below their rank that may carry permissions they lack, because accept_invite
-- writes memberships as the server. The insert policy refuses one's own
-- address, and accepting refuses an invitation one sent oneself, so a row from
-- before this migration cannot be redeemed either.
--
-- M15. OWNER INVITATIONS
-- The organisation branch of the insert policy asked only is_organization_admin,
-- so an admin could invite somebody as an owner. The form never offered owner;
-- the database now refuses it in the policy, and accepting refuses an owner
-- invitation outright, so a row made earlier cannot be redeemed.
--
-- L1. FREE TEXT IN THE BELL
-- notify_invite wrote the inviter's name, the organisation's or conference's
-- name and the role column, unchecked, into the invited account's bell, and
-- anybody signed in could send as many as they liked. The role column is
-- checked, the text columns have lengths, the sentence is fixed words with the
-- names cut to 80 characters, and an inviter may send fifty invitations an
-- hour, counted in a log of their sends (invite_sends) that withdrawing an
-- invitation does not shorten and that no browser can touch.
--
-- L18. WHAT A TOKEN REVEALS
-- get_invite answered every column for a used or expired token. It now says a
-- status word for those and the identifying columns only while the invitation
-- is pending. The page at /invites/[token] changes in the same commit.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- invites: the shape of a row (L1)
-- -----------------------------------------------------------------------------
-- `role` is text because one column once held two enum types. It now serves
-- organisation invitations alone (invites_role_matches_kind), so it can be
-- held to that enum's three words. `owner` stays allowed here so that a row
-- written before this migration still satisfies the table; the policy below
-- refuses new ones and accept_invite_row refuses redeeming any. An address is
-- at most 254 characters (RFC 5321). The app makes tokens of exactly 32
-- characters, and a shorter one would be guessable.

alter table public.invites
  add constraint invites_role_is_organization_role
    check (role is null or role in ('owner', 'admin', 'member')),
  add constraint invites_email_length check (char_length(email) <= 254),
  add constraint invites_token_length check (char_length(token) between 32 and 64);


-- -----------------------------------------------------------------------------
-- invite_sender_email: the signed-in person's own address (M11)
-- -----------------------------------------------------------------------------
-- The policy below compares the invited address with the caller's own, and
-- addresses live in auth.users, which no policy grants to anybody; hence
-- security definer, the same shape as conference_team_has_email. It answers
-- about the caller alone and takes no argument, so it can tell nobody anything
-- they do not already know. Lowercased, because invites stores addresses
-- lowercase (invites_email_is_lowercase) and auth.users does not promise to.

create function public.invite_sender_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(account.email)
  from auth.users as account
  where account.id = (select auth.uid());
$$;

revoke execute on function public.invite_sender_email() from public, anon;
grant execute on function public.invite_sender_email() to authenticated;


-- -----------------------------------------------------------------------------
-- invites: who may send an invitation (M11, M15)
-- -----------------------------------------------------------------------------
-- As 20261007120000 had it, with two more conditions: the address is not the
-- sender's own, and an organisation invitation never offers owner. Ownership
-- is given on the members table, by an owner, to somebody who has already
-- joined; never to an address that might have been mistyped.

drop policy "Team managers and organization admins can send an invitation" on public.invites;

create policy "Team managers and organization admins can invite somebody else"
  on public.invites
  for insert
  to authenticated
  with check (
    invited_by = (select auth.uid())
    -- Both sides are lowercase, so "<>" is the whole comparison. Were the
    -- helper to answer null, the comparison would too, and a null check
    -- refuses the row: the rule fails closed.
    and email <> public.invite_sender_email()
    and (
      (
        conference_id is not null
        and role_id is not null
        and public.has_permission(conference_id, 'manage_team')
        and public.can_manage_role(role_id)
      )
      or (
        organization_id is not null
        and role <> 'owner'
        and public.is_organization_admin(organization_id)
      )
    )
  );


-- -----------------------------------------------------------------------------
-- invite_sends: when each inviter sent an invitation (L1)
-- -----------------------------------------------------------------------------
-- The cap below needs a count the inviter cannot shrink, and the invites rows
-- themselves are not that. The delete policy lets an inviter withdraw their
-- own invitations, and a withdrawn one leaves its bell row behind
-- (notifications has no key to invites), so fifty sent, fifty withdrawn and
-- fifty more would be a hundred rows in one bell. This table remembers the
-- moment of every send, whatever becomes of the invitation. It has no
-- policies and no grants, so a browser can neither read it nor write it:
-- guard_invite_rate alone writes it, as the server, and prunes what is older
-- than an hour as it goes, so it never holds more than an hour of sends.

create table public.invite_sends (
  id uuid primary key default gen_random_uuid(),
  invited_by uuid not null references auth.users (id) on delete cascade,
  sent_at timestamptz not null default now()
);

create index invite_sends_invited_by_sent_at_idx
  on public.invite_sends (invited_by, sent_at);

alter table public.invite_sends enable row level security;

-- Supabase grants every new table to anon and authenticated by default.
revoke all on table public.invite_sends from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- guard_invite_rate: fifty invitations an hour per inviter (L1)
-- -----------------------------------------------------------------------------
-- A conference's team is tens of people, so fifty an hour is room enough for
-- an organiser working down a list and far too few for a nuisance. Only a
-- browser request is held to it: the seeds and the service role are the
-- server's own work, the same distinction protect_stripe_columns draws.
--
-- The trigger also writes the three columns that are the server's to say. A
-- browser role may insert every column of invites, so without this a sender
-- could backdate created_at (a cap that counted the invites rows by it would
-- never see a row dated two hours ago) or write a row that already says who
-- accepted it. created_at is stamped here, and a new invitation has been
-- accepted by nobody.
--
-- Unlike the other guards this one is security definer, because it writes
-- invite_sends, which no browser role may touch. Inside a security definer
-- function current_user reads the owner for everybody, so the question the
-- other guards ask of current_user is asked of auth.role() instead: the role
-- claim of the request's own token, which PostgREST set the database role
-- from, and which nothing in here changes. The seeds run as postgres with no
-- token at all, and auth.role() answers null for them, hence the coalesce.
--
-- The advisory lock, taken per inviter and held to the end of the
-- transaction, makes fifty requests sent at once wait for one another, so
-- none of them counts before the others have been written. A row trigger sees
-- the rows the same statement wrote before it, so one insert of a hundred
-- rows is refused at its fifty-first, and the refusal rolls the whole
-- statement back, log rows included.

create function public.guard_invite_rate()
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

revoke execute on function public.guard_invite_rate() from public, anon, authenticated;

create trigger invites_guard_invite_rate
  before insert on public.invites
  for each row
  execute function public.guard_invite_rate();


-- -----------------------------------------------------------------------------
-- accept_invite_row: the one body behind accepting (H1, M11, M15)
-- -----------------------------------------------------------------------------
-- accept_invite and accept_invite_by_id differ only in how they find the row,
-- so the rules and the writes live here once and cannot drift apart. The two
-- wrappers hand over the row's id and nothing else: this function reads the
-- row for itself, as the server, so no caller ever gets to say what a row
-- contains. It runs as the server because it writes memberships, staff rows
-- and chair rows that the policies would not let the invited person write for
-- themselves. Execute is revoked from every browser role, and the wrappers,
-- being security definer, run as its owner. Were the revoke ever lost, a
-- browser could call it directly and gain nothing: by an id it is
-- accept_invite_by_id under another name, and every rule below still holds.
--
-- The rules, in the order they are asked:
--   1. somebody is signed in;
--   2. the row exists;
--   3. the address is the caller's own and confirmed (H1). An unconfirmed
--      account is told to confirm rather than that the address differs,
--      because it is the same address. The address comes before the state
--      of the invitation so that somebody holding another person's id learns
--      nothing about it, not even that it has been used;
--   4. the invitation is unused and has not run out;
--   5. it does not offer owner (M15), however the row got there;
--   6. it was not sent by the person accepting it (M11).
--
-- The writes are those of 20261007120000: roles add up, a title on the
-- invitation replaces one the person had while no title leaves it alone, and
-- a committee named on the invitation becomes a chair row. The
-- invites_check_committee and invites_check_role triggers made sure when the
-- row was written that the committee and the role belong to this conference.

create function public.accept_invite_row(invite_id uuid)
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

revoke execute on function public.accept_invite_row(uuid) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- accept_invite: by the token in the link
-- -----------------------------------------------------------------------------
-- The function the page at /invites/[token] calls. Only the lookup is here:
-- the token finds the row's id, and accept_invite_row above has the rules. A
-- token nobody was given finds no id, and a null id is "This invitation does
-- not exist" there.

create or replace function public.accept_invite(token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_id uuid;
begin
  select pending.id
  into found_id
  from public.invites as pending
  where pending.token = accept_invite.token;

  return public.accept_invite_row(found_id);
end;
$$;

revoke execute on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;


-- -----------------------------------------------------------------------------
-- accept_invite_by_id: from the list on the home page (H1)
-- -----------------------------------------------------------------------------
-- The Accept button beside a waiting invitation posts the id list_my_invites
-- gave it, which is no secret: an id finds the row, and accept_invite_row then
-- insists that the caller's confirmed address is the one invited, exactly as
-- it does for a token. The same body, so the two roads cannot disagree.

create function public.accept_invite_by_id(invite_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.accept_invite_row(accept_invite_by_id.invite_id);
end;
$$;

revoke execute on function public.accept_invite_by_id(uuid) from public, anon;
grant execute on function public.accept_invite_by_id(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- get_invite: a status word, and the details only while pending (L18)
-- -----------------------------------------------------------------------------
-- As 20261007120000 had it, with a `status` column -- 'pending', 'used' or
-- 'expired' -- and every identifying column (the address, the names, the
-- slugs) answered only while the status is 'pending'. A used or expired link
-- still says what kind of invitation it was, what role it offered and when it
-- ran out or was used, which is what the page needs for its sentence, and
-- nothing about whom it was for or who sent it. The function gains a column,
-- and a function's output columns cannot be changed in place, so it is dropped
-- and made again with the same grants: anon as well as authenticated, because
-- the page decides from the status whether a signed-out visitor is sent to
-- create an account or to sign in.

drop function public.get_invite(text);

create function public.get_invite(token text)
returns table (
  kind public.invite_kind,
  status text,
  role text,
  role_scope public.role_scope,
  role_permissions public.permission[],
  email text,
  organization_name text,
  organization_slug text,
  conference_name text,
  conference_slug text,
  committee_name text,
  invited_by_name text,
  expires_at timestamptz,
  accepted_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with found as (
    select
      invite.*,
      case
        when invite.accepted_at is not null then 'used'
        when invite.expires_at <= now() then 'expired'
        else 'pending'
      end as status
    from public.invites as invite
    where invite.token = get_invite.token
  )
  select
    found.kind,
    found.status,
    coalesce(found.role, conference_role.name),
    conference_role.scope,
    conference_role.permissions,
    case when found.status = 'pending' then found.email end,
    case when found.status = 'pending' then organization.name end,
    case when found.status = 'pending' then organization.slug end,
    case when found.status = 'pending' then conference.name end,
    case when found.status = 'pending' then conference.slug end,
    case when found.status = 'pending' then committee.name end,
    case when found.status = 'pending' then inviter.full_name end,
    found.expires_at,
    found.accepted_at
  from found
  left join public.organizations as organization on organization.id = found.organization_id
  left join public.conferences as conference on conference.id = found.conference_id
  left join public.committees as committee on committee.id = found.committee_id
  left join public.conference_roles as conference_role on conference_role.id = found.role_id
  left join public.profiles as inviter on inviter.id = found.invited_by;
$$;

revoke execute on function public.get_invite(text) from public;
grant execute on function public.get_invite(text) to anon, authenticated;


-- -----------------------------------------------------------------------------
-- list_my_invites: by id, for a confirmed address (H1)
-- -----------------------------------------------------------------------------
-- As 20261007120000 had it, with the id in place of the token and the address
-- matched only when confirmed. The two rows accept_invite_row would refuse
-- anyway -- an owner invitation, and one the reader sent themselves, both
-- from before this migration -- are left out, so the page never offers a
-- button that cannot work. The output columns change, so the function is
-- dropped and made again with the same grants.

drop function public.list_my_invites();

create function public.list_my_invites()
returns table (
  id uuid,
  kind public.invite_kind,
  role text,
  organization_name text,
  conference_name text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    invite.id,
    invite.kind,
    coalesce(invite.role, conference_role.name),
    organization.name,
    conference.name,
    invite.expires_at
  from public.invites as invite
  left join public.organizations as organization on organization.id = invite.organization_id
  left join public.conferences as conference on conference.id = invite.conference_id
  left join public.conference_roles as conference_role on conference_role.id = invite.role_id
  where invite.accepted_at is null
    and invite.expires_at > now()
    and invite.role is distinct from 'owner'
    and invite.invited_by <> (select auth.uid())
    and invite.email = (
      select lower(account.email)
      from auth.users as account
      where account.id = (select auth.uid())
        and account.email_confirmed_at is not null
    )
  order by invite.created_at;
$$;

revoke execute on function public.list_my_invites() from public, anon;
grant execute on function public.list_my_invites() to authenticated;


-- -----------------------------------------------------------------------------
-- notify_invite: fixed words, names cut short, confirmed accounts only (L1, H1)
-- -----------------------------------------------------------------------------
-- As 20261007120000 had it, with the sentence made of fixed words. The two
-- names are the only text from a row, and each is cut to 80 characters (a
-- profile name is at most 80 in the app; an organisation's or a conference's
-- up to 120). The role is never written as stored: an organisation role
-- becomes "an admin" or "a member", and a conference invitation says it is to
-- the team, because a conference role's name is the organiser's own text and
-- the invitation page says the rest. Only a confirmed account is told (H1):
-- an unconfirmed one could not accept, and its bell would otherwise carry the
-- link for an address its holder has not shown is theirs. The trigger
-- invites_notify_invite that calls this is unchanged.

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
  sentence text;
begin
  select account.id
  into invitee
  from auth.users as account
  where lower(account.email) = new.email
    and account.email_confirmed_at is not null;

  if invitee is null then
    return new;
  end if;

  -- A profile's name defaults to '', which would read as nobody at all.
  select left(nullif(btrim(inviter.full_name), ''), 80)
  into inviter_name
  from public.profiles as inviter
  where inviter.id = new.invited_by;

  if new.kind = 'organization_member' then
    select left(organization.name, 80)
    into target_name
    from public.organizations as organization
    where organization.id = new.organization_id;

    sentence := coalesce(inviter_name, 'Somebody')
      || ' invited you to ' || coalesce(target_name, 'an organisation')
      || case new.role
           when 'owner' then ' as an owner'
           when 'admin' then ' as an admin'
           else ' as a member'
         end;
  else
    select left(conference.name, 80)
    into target_name
    from public.conferences as conference
    where conference.id = new.conference_id;

    sentence := coalesce(inviter_name, 'Somebody')
      || ' invited you to join the team of ' || coalesce(target_name, 'a conference');
  end if;

  insert into public.notifications (user_id, conference_id, kind, title, link_path)
  values (invitee, new.conference_id, 'invite_received', sentence, '/invites/' || new.token);

  return new;
end;
$$;

revoke execute on function public.notify_invite() from public, anon, authenticated;
