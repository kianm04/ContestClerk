-- =============================================================================
-- Migration 0002: people, organisations, conferences, staff, invites, notifications
-- =============================================================================
--
-- WHAT THIS IS
-- The first migration written from the specification. It turns the four
-- hand-made tables of migration 0001 into the shape
-- specs/02-architecture/data-model.md describes, and adds the tables every
-- other part of MUNMeet hangs off:
--
--   * every enum the whole product uses, so later migrations only add tables
--   * profiles and profile_details, one pair per account
--   * the new columns on organizations and conferences
--   * conferences.is_public becomes conferences.status
--   * conference_staff, invites, notifications
--   * the permission helper functions the policies read like sentences
--   * the policies for all of these, from specs/02-architecture/permissions.md
--
-- WHAT IS NOT HERE, ON PURPOSE
-- Committees, seats, applications, delegations, money, documents and the
-- committee room get their own migrations (tasks T02, T16, T17, T34, T39 in
-- specs/07-delivery/tasks.md). The helper functions and policies that need
-- those tables arrive with them. The notification triggers arrive with the
-- tables whose changes they announce; this file only creates the table they
-- write into.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
-- All of them, in one place, because a Postgres enum has to exist before a
-- column can use it and later migrations should only have to add tables.
-- Adding a value to one of these later is "alter type ... add value", which is
-- safe. organization_role already exists; migration 0001 created it.

-- Where a conference is in its life. Visitors only ever see 'published' and
-- 'archived'; 'draft' is the organiser's private workspace.
create type public.conference_status as enum ('draft', 'published', 'archived');

-- Who a conference is aimed at.
create type public.conference_level as enum ('high_school', 'university', 'mixed');

-- How much MUN somebody has done. Also used for a committee's difficulty,
-- where 'none' is not allowed.
create type public.experience_level as enum ('none', 'beginner', 'intermediate', 'advanced');

-- What somebody helping with a conference does.
create type public.staff_role as enum ('organiser', 'chair', 'volunteer');

-- What an invitation invites somebody into.
create type public.invite_kind as enum ('organization_member', 'conference_staff');

-- What a seat in a committee represents.
create type public.seat_kind as enum ('country', 'character', 'observer', 'other');

-- The life of an individual application.
create type public.application_status as enum (
  'draft', 'submitted', 'accepted', 'rejected', 'waitlisted', 'withdrawn'
);

-- The life of a school's delegation request.
create type public.delegation_status as enum (
  'draft', 'submitted', 'accepted', 'rejected', 'withdrawn'
);

-- What somebody is inside a delegation.
create type public.delegation_role as enum ('head', 'member');

-- The kinds of question an organiser can add to the application form.
create type public.question_type as enum (
  'short_text', 'long_text', 'single_choice', 'multiple_choice', 'checkbox'
);

-- Who a fee is charged to.
create type public.fee_applies_to as enum ('individual', 'delegation_member');

-- The life of an invoice.
create type public.invoice_status as enum ('unpaid', 'paid', 'waived', 'refunded', 'void');

-- What an uploaded file is.
create type public.document_kind as enum (
  'position_paper', 'background_guide', 'resource', 'working_paper', 'draft_resolution'
);

-- What a chair decided about a position paper.
create type public.review_status as enum ('submitted', 'approved', 'changes_requested');

-- Who may see a schedule event, an announcement or a document.
create type public.audience as enum ('everyone', 'delegates', 'staff', 'committee', 'delegation');

-- What a notification is about. The app picks an icon from this.
create type public.notification_kind as enum (
  'application_decided', 'seat_allocated', 'delegation_decided', 'delegation_seat_assigned',
  'invoice_created', 'invoice_paid', 'announcement', 'document_reviewed', 'award_published',
  'invite_received', 'schedule_changed'
);

-- The committee room, all of it. The tables come in a later migration.
create type public.session_status as enum ('scheduled', 'in_progress', 'ended');

create type public.committee_mode as enum (
  'idle', 'formal_debate', 'moderated_caucus', 'unmoderated_caucus', 'voting', 'suspended'
);

create type public.attendance_status as enum ('absent', 'present', 'present_and_voting');

create type public.speaker_status as enum ('waiting', 'speaking', 'spoken', 'removed');

create type public.motion_kind as enum (
  'moderated_caucus', 'unmoderated_caucus', 'extend_caucus', 'suspend_meeting',
  'adjourn_meeting', 'close_debate', 'introduce_document', 'other'
);

create type public.motion_status as enum ('proposed', 'passed', 'failed', 'withdrawn');

create type public.vote_kind as enum ('procedural', 'substantive');

create type public.vote_method as enum ('show_of_hands', 'roll_call');

create type public.vote_status as enum ('open', 'closed');

create type public.vote_choice as enum ('for', 'against', 'abstain');

create type public.majority_type as enum ('simple', 'two_thirds');

create type public.award_kind as enum (
  'best_delegate', 'outstanding_delegate', 'honourable_mention',
  'verbal_commendation', 'best_position_paper', 'custom'
);

create type public.award_status as enum ('proposed', 'confirmed');


-- -----------------------------------------------------------------------------
-- Keeping updated_at current
-- -----------------------------------------------------------------------------
-- One function, attached to every table that has an updated_at column. A
-- "before update" trigger can change the row that is about to be written, so
-- setting new.updated_at here means no page ever has to remember to.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
-- One row per account, created by the handle_new_user trigger below. Everything
-- here is safe for any signed-in user to read: it is what a seat list, an
-- application or the team page shows about a person. Facts that must stay
-- private live in profile_details.

create table public.profiles (
  -- The same id as the account in auth.users. Deleting the account deletes this.
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  -- Path inside the public-media storage bucket, not a full address.
  avatar_path text,
  institution_name text,
  country_code char(2),
  experience_level public.experience_level not null default 'none',
  pronouns text,
  bio text,
  -- Only somebody with direct database access can turn this on; the
  -- protect_profile_flags trigger below refuses it from the app.
  is_platform_admin boolean not null default false,
  -- Null means the person has not finished onboarding, so every signed-in page
  -- sends them to /welcome.
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_bio_length check (char_length(bio) <= 500)
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- profile_details
-- -----------------------------------------------------------------------------
-- The facts organisers need for logistics and nobody else should see. They are
-- in their own table, rather than on profiles, so that one narrow policy can
-- decide who reads them.

create table public.profile_details (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- A copy of auth.users.email. The app cannot read auth.users, so it reads the
  -- address here; the sync_user_email trigger keeps the copy current.
  email text not null,
  date_of_birth date,
  phone text,
  dietary_requirements text,
  emergency_contact_name text,
  emergency_contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profile_details_set_updated_at
  before update on public.profile_details
  for each row
  execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- Trigger: every new account gets a profile
-- -----------------------------------------------------------------------------
-- auth.users belongs to Supabase and the app may not write to it, so this runs
-- as "security definer" (as the owner of the function) to insert the two rows.
-- The register form sends the name as options.data.full_name, which Supabase
-- stores in raw_user_meta_data.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;

  -- An account made with a phone number instead of an email has no address yet.
  insert into public.profile_details (user_id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();


-- -----------------------------------------------------------------------------
-- Trigger: a changed email address is copied to profile_details
-- -----------------------------------------------------------------------------
-- Somebody who changes their address in /settings confirms it by email, and
-- Supabase then updates auth.users. This copies the new address across so the
-- team page and the CSV exports do not show the old one.

create or replace function public.sync_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profile_details
  set email = coalesce(new.email, '')
  where user_id = new.id;

  return new;
end;
$$;

revoke execute on function public.sync_user_email() from public, anon, authenticated;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_user_email();


-- -----------------------------------------------------------------------------
-- New columns on organizations
-- -----------------------------------------------------------------------------
-- The two stripe_ columns are how an organisation gets paid. Only the server
-- may write them; the protect_stripe_columns trigger further down enforces that.

alter table public.organizations
  add column logo_path text,
  add column stripe_account_id text,
  add column stripe_onboarding_completed_at timestamptz,
  add column updated_at timestamptz not null default now();

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row
  execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- New columns on conferences
-- -----------------------------------------------------------------------------
-- Everything an organiser fills in on /manage/<slug>/details, plus the settings
-- that decide whether applications are open and how the money works.

alter table public.conferences
  add column tagline text,
  add column logo_path text,
  add column banner_path text,
  add column venue_address text,
  add column contact_email text,
  add column instagram_url text,
  add column level public.conference_level not null default 'mixed',
  add column language text not null default 'English',
  add column expected_delegates integer,
  add column min_age integer,
  add column max_age integer,
  -- ISO 4217, for example EUR or USD. Every fee and invoice of this conference
  -- is in it.
  add column currency char(3) not null default 'EUR',
  -- Replaces is_public, which is dropped below.
  add column status public.conference_status not null default 'draft',
  add column applications_open_at timestamptz,
  add column applications_close_at timestamptz,
  add column accepts_individual_applications boolean not null default true,
  add column accepts_delegations boolean not null default true,
  add column committee_preference_count integer not null default 2,
  add column ask_motivation boolean not null default true,
  add column position_paper_required boolean not null default true,
  add column position_paper_deadline timestamptz,
  -- The moment awards become visible to delegates.
  add column awards_published_at timestamptz,
  add column collects_payments_manually boolean not null default false,
  add column payment_instructions text,
  add column show_schedule_publicly boolean not null default false,
  add column updated_at timestamptz not null default now();

-- A check that mentions a column which is null passes, so every one of these
-- only applies once the organiser has filled the field in.
alter table public.conferences
  add constraint conferences_tagline_length
    check (char_length(tagline) <= 120),
  add constraint conferences_expected_delegates_range
    check (expected_delegates between 1 and 5000),
  add constraint conferences_min_age_range
    check (min_age between 10 and 99),
  add constraint conferences_max_age_range
    check (max_age between 10 and 99),
  add constraint conferences_age_order
    check (max_age >= min_age),
  add constraint conferences_committee_preference_count_range
    check (committee_preference_count between 0 and 3);

create trigger conferences_set_updated_at
  before update on public.conferences
  for each row
  execute function public.set_updated_at();

-- committees came from migration 0001 with an updated_at column and nothing to
-- keep it current. The migration for task T02 rewrites the rest of that table.
create trigger committees_set_updated_at
  before update on public.committees
  for each row
  execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- is_public becomes status
-- -----------------------------------------------------------------------------
-- The old boolean only said "visitors can see it". The enum also says "the
-- organiser is still setting it up" and "it is over". Existing rows keep what
-- they had: public becomes published, private becomes draft.

update public.conferences
set status = (case when is_public then 'published' else 'draft' end)::public.conference_status;

-- Postgres refuses to drop a column that a policy or an index still mentions,
-- so those go first. Both are recreated below on status.
drop policy "Anyone can read public conferences" on public.conferences;
drop policy "Anyone can read committees of public conferences" on public.committees;
drop index public.conferences_public_start_date_idx;

alter table public.conferences drop column is_public;

create index conferences_status_start_date_idx on public.conferences (status, start_date);


-- -----------------------------------------------------------------------------
-- conference_staff
-- -----------------------------------------------------------------------------
-- People helping with one conference: organisers who are not members of the
-- organisation, chairs, and volunteers. A chair of a committee must have a row
-- here as well, which a later migration enforces.

create table public.conference_staff (
  conference_id uuid not null references public.conferences (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.staff_role not null,
  -- Free text shown on the team list, for example "Secretary General".
  title text,
  created_at timestamptz not null default now(),
  primary key (conference_id, user_id)
);

create index conference_staff_user_id_idx on public.conference_staff (user_id);


-- -----------------------------------------------------------------------------
-- invites
-- -----------------------------------------------------------------------------
-- An invitation to join an organisation or to help with a conference. The token
-- is the secret: anybody holding it may look the invitation up, but only
-- somebody signed in with the invited address may accept it.

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  kind public.invite_kind not null,
  organization_id uuid references public.organizations (id) on delete cascade,
  conference_id uuid references public.conferences (id) on delete cascade,
  -- Optional. A chair invitation that also puts the person on a committee.
  committee_id uuid references public.committees (id) on delete cascade,
  email text not null,
  -- An organization_role value or a staff_role value, depending on kind. It is
  -- text because one column cannot hold two enum types; accept_invite checks it.
  role text not null,
  -- 32 random url-safe characters, made by the server.
  token text not null unique,
  invited_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Addresses are stored lowercase so that comparing them is just "=".
  constraint invites_email_is_lowercase check (email = lower(email)),
  -- An invitation points at exactly one thing, and at the thing its kind says.
  constraint invites_target_matches_kind check (
    (kind = 'organization_member' and organization_id is not null and conference_id is null)
    or (kind = 'conference_staff' and conference_id is not null and organization_id is null)
  )
);

create index invites_email_idx on public.invites (email);
create index invites_organization_id_idx on public.invites (organization_id);
create index invites_conference_id_idx on public.invites (conference_id);
create index invites_committee_id_idx on public.invites (committee_id);
create index invites_invited_by_idx on public.invites (invited_by);
create index invites_accepted_by_idx on public.invites (accepted_by);


-- -----------------------------------------------------------------------------
-- Trigger: a chair invitation may only name a committee of its own conference
-- -----------------------------------------------------------------------------
-- Without this, an organiser of one conference could write the id of somebody
-- else's committee into an invitation, and accepting it would make them a chair
-- of that committee. accept_invite runs as the server, so Row Level Security on
-- committee_chairs would not stop it. Catching it here means the organiser is
-- told at the moment they make the mistake.

-- It is "security definer" because it has to see the committee whoever is
-- asking. An organiser setting a conference up still has it as a draft, and the
-- policy on committees only shows a draft conference's committees to nobody.
create or replace function public.check_invite_committee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.committee_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.committees as committee
    where committee.id = new.committee_id
      and committee.conference_id = new.conference_id
  ) then
    raise exception 'That committee belongs to a different conference';
  end if;

  return new;
end;
$$;

revoke execute on function public.check_invite_committee() from public, anon, authenticated;

create trigger invites_check_committee
  before insert or update on public.invites
  for each row
  execute function public.check_invite_committee();


-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------
-- The bell in the app shell. Only database triggers insert rows, so no page can
-- forget to send one; the app only ever sets read_at or deletes a row. The
-- triggers themselves come with the tables whose changes they announce.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- For grouping the notifications page by conference. Null for account-level
  -- notifications such as an invitation.
  conference_id uuid references public.conferences (id) on delete cascade,
  kind public.notification_kind not null,
  title text not null,
  body text,
  -- An app path such as /applications/<id>, never a full web address.
  link_path text,
  read_at timestamptz,
  -- A row may be dated in the future: awards are announced the moment the
  -- organiser chose, and the select policy hides the row until then.
  created_at timestamptz not null default now()
);

create index notifications_user_unread_idx
  on public.notifications (user_id, read_at, created_at desc);
create index notifications_conference_id_idx on public.notifications (conference_id);


-- -----------------------------------------------------------------------------
-- Permission helpers
-- -----------------------------------------------------------------------------
-- Small yes-or-no questions about the signed-in user, so that the policies
-- below read like sentences. Each one is "security definer", which means it
-- runs with the rights of the user that owns it rather than the caller's. That
-- is what lets a policy on one table look at another table the caller may not
-- read, and what stops two policies that mention each other from looping
-- forever. "set search_path = ''" makes every table name in the body absolute,
-- so a caller cannot point the function at a table of their own.
--
-- The helpers that need committees, seats, applications or delegations
-- (is_committee_chair, is_conference_participant, is_committee_delegate,
-- is_delegation_head, is_delegation_member) arrive in the migrations that
-- create those tables. See specs/02-architecture/permissions.md.

-- Is the signed-in user an owner or an admin of this organisation?
create or replace function public.is_organization_admin(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id = org_id
      and membership.user_id = (select auth.uid())
      and membership.role in ('owner', 'admin')
  );
$$;

revoke execute on function public.is_organization_admin(uuid) from public, anon;
grant execute on function public.is_organization_admin(uuid) to authenticated;


-- Is the signed-in user a MUNMeet administrator? Nobody is, unless somebody
-- sets the flag straight in the database.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = (select auth.uid())
      and profile.is_platform_admin
  );
$$;

revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;


-- May the signed-in user run this conference? Members of the organisation that
-- owns it may, and so may anybody invited to it as an organiser.
-- "can_manage_conference.conference_id" is how a function refers to its own
-- argument when a column of the same name is in scope.
create or replace function public.can_manage_conference(conference_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conferences as conference
    join public.organization_members as membership
      on membership.organization_id = conference.organization_id
    where conference.id = can_manage_conference.conference_id
      and membership.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.conference_staff as staff
    where staff.conference_id = can_manage_conference.conference_id
      and staff.user_id = (select auth.uid())
      and staff.role = 'organiser'
  )
  or public.is_platform_admin();
$$;

revoke execute on function public.can_manage_conference(uuid) from public, anon;
grant execute on function public.can_manage_conference(uuid) to authenticated;


-- Does the signed-in user help with this conference in any way at all?
create or replace function public.is_conference_staff(conference_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conference_staff as staff
    where staff.conference_id = is_conference_staff.conference_id
      and staff.user_id = (select auth.uid())
  )
  or public.can_manage_conference(is_conference_staff.conference_id);
$$;

revoke execute on function public.is_conference_staff(uuid) from public, anon;
grant execute on function public.is_conference_staff(uuid) to authenticated;


-- Is this conference one that visitors may see? Archived conferences stay
-- readable so last year's page does not turn into a dead link.
create or replace function public.conference_is_published(conference_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conferences as conference
    where conference.id = conference_is_published.conference_id
      and conference.status in ('published', 'archived')
  );
$$;

revoke execute on function public.conference_is_published(uuid) from public, anon;
grant execute on function public.conference_is_published(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- Column guards
-- -----------------------------------------------------------------------------
-- A Row Level Security policy decides which rows somebody may change, but not
-- which columns. Where permissions.md says "this column is the server's", a
-- "before update" trigger compares the old row with the new one and refuses.
--
-- "current_user" is the database role the request arrives as: 'anon' for a
-- visitor and 'authenticated' for a signed-in user, both of which come through
-- the app. Anything else is the server itself (the service role, or one of our
-- own security definer functions), which is allowed.

create or replace function public.protect_profile_flags()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_platform_admin is distinct from old.is_platform_admin
    and current_user in ('anon', 'authenticated') then
    raise exception 'is_platform_admin cannot be changed from the app';
  end if;

  return new;
end;
$$;

create trigger profiles_protect_flags
  before update on public.profiles
  for each row
  execute function public.protect_profile_flags();


create or replace function public.protect_stripe_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    new.stripe_account_id is distinct from old.stripe_account_id
    or new.stripe_onboarding_completed_at is distinct from old.stripe_onboarding_completed_at
  ) and current_user in ('anon', 'authenticated') then
    raise exception 'Stripe details can only be changed by the server';
  end if;

  return new;
end;
$$;

create trigger organizations_protect_stripe_columns
  before update on public.organizations
  for each row
  execute function public.protect_stripe_columns();


-- A person may mark their own notification as read, and nothing else about it.
create or replace function public.protect_notifications_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and (
    new.user_id is distinct from old.user_id
    or new.conference_id is distinct from old.conference_id
    or new.kind is distinct from old.kind
    or new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.link_path is distinct from old.link_path
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Only read_at can be changed on a notification';
  end if;

  return new;
end;
$$;

create trigger notifications_protect_columns
  before update on public.notifications
  for each row
  execute function public.protect_notifications_columns();


-- -----------------------------------------------------------------------------
-- Trigger: an organisation always keeps at least one owner
-- -----------------------------------------------------------------------------
-- Without this, the last owner could change their own role or leave, and the
-- organisation would have nobody who can invite anybody back in.

create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  other_owners integer;
begin
  -- Deleting the organisation itself deletes every membership with it. There is
  -- no organisation left to be without an owner, so there is nothing to guard.
  -- The parent row is already gone by the time this runs.
  if tg_op = 'DELETE' and not exists (
    select 1
    from public.organizations as organization
    where organization.id = old.organization_id
  ) then
    return old;
  end if;

  -- Removing or changing somebody who is not an owner is always fine.
  if old.role <> 'owner' then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  -- An update that leaves them an owner changes nothing about this rule.
  if tg_op = 'UPDATE' and new.role = 'owner' then
    return new;
  end if;

  select count(*)
  into other_owners
  from public.organization_members as membership
  where membership.organization_id = old.organization_id
    and membership.role = 'owner'
    and membership.user_id <> old.user_id;

  if other_owners = 0 then
    raise exception 'An organisation must always have at least one owner';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke execute on function public.prevent_last_owner_removal() from public, anon, authenticated;

create trigger organization_members_keep_an_owner
  before update or delete on public.organization_members
  for each row
  execute function public.prevent_last_owner_removal();


-- -----------------------------------------------------------------------------
-- delete_my_account()
-- -----------------------------------------------------------------------------
-- "Delete my account" in /settings. The app may not touch auth.users, so this
-- runs as the function's owner and does it. Deleting the account cascades to
-- the profile, the memberships, the applications and the notifications; seats
-- and invoices keep the row and forget the person.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  blocking_organization text;
begin
  if me is null then
    raise exception 'You have to be signed in to delete your account';
  end if;

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

  delete from auth.users where id = me;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;


-- -----------------------------------------------------------------------------
-- The invite functions
-- -----------------------------------------------------------------------------

-- What the /invites/<token> page shows before anybody is signed in. The token
-- is the secret, so holding it is enough; that is also why the invited address
-- comes back, so the register form can be filled in for the person.
create or replace function public.get_invite(token text)
returns table (
  kind public.invite_kind,
  role text,
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
  select
    invite.kind,
    invite.role,
    invite.email,
    organization.name,
    organization.slug,
    conference.name,
    conference.slug,
    committee.name,
    inviter.full_name,
    invite.expires_at,
    invite.accepted_at
  from public.invites as invite
  left join public.organizations as organization on organization.id = invite.organization_id
  left join public.conferences as conference on conference.id = invite.conference_id
  left join public.committees as committee on committee.id = invite.committee_id
  left join public.profiles as inviter on inviter.id = invite.invited_by
  where invite.token = get_invite.token;
$$;

revoke execute on function public.get_invite(text) from public;
grant execute on function public.get_invite(text) to anon, authenticated;


-- The invitations waiting for the signed-in user, shown on /home and /manage.
-- It matches on the address, so somebody who was invited before they had an
-- account finds the invitation as soon as they register with that address.
create or replace function public.list_my_invites()
returns table (
  token text,
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
    invite.token,
    invite.kind,
    invite.role,
    organization.name,
    conference.name,
    invite.expires_at
  from public.invites as invite
  left join public.organizations as organization on organization.id = invite.organization_id
  left join public.conferences as conference on conference.id = invite.conference_id
  where invite.accepted_at is null
    and invite.expires_at > now()
    and invite.email = (
      select lower(account.email)
      from auth.users as account
      where account.id = (select auth.uid())
    )
  order by invite.created_at;
$$;

revoke execute on function public.list_my_invites() from public, anon;
grant execute on function public.list_my_invites() to authenticated;


-- Accepting an invitation. It adds the membership or the staff row and marks
-- the invitation used in one go, so the two can never disagree. It returns the
-- path the person should be sent to next.
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

    insert into public.conference_staff (conference_id, user_id, role)
    values (invite.conference_id, me, invite.role::public.staff_role)
    on conflict (conference_id, user_id) do update set role = excluded.role;

    -- A chair invitation can also name the committee to chair, and
    -- invites_check_committee has already made sure it is a committee of this
    -- conference. Putting the person on it is not done here, because the
    -- committee_chairs table does not exist yet: the migration for task T02
    -- creates it and replaces this function with one that writes that row too.
    -- Until then a chair invitation still works; it just does not hand out the
    -- committee with it.

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

revoke execute on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;


-- =============================================================================
-- Row Level Security
-- =============================================================================
-- With RLS on, nothing is allowed unless a policy allows it, and "no policy"
-- means "refused". Every rule below is one row of the policy matrix in
-- specs/02-architecture/permissions.md, and has a test in client/tests/db/.


-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
-- Any signed-in user may read any profile: a seat list, an application and the
-- team page all show people. Visitors who are not signed in read nothing.

alter table public.profiles enable row level security;

create policy "Signed-in users can read every profile"
  on public.profiles
  for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));


-- -----------------------------------------------------------------------------
-- profile_details
-- -----------------------------------------------------------------------------
-- Private facts. For now only the person themselves. The organisers of a
-- conference the person takes part in, and the head of their delegation, are
-- added by the migration that creates applications, seats and delegations,
-- because the rule needs those tables to say what "takes part in" means.

alter table public.profile_details enable row level security;

create policy "Users can read their own private details"
  on public.profile_details
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can update their own private details"
  on public.profile_details
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));


-- -----------------------------------------------------------------------------
-- organizations
-- -----------------------------------------------------------------------------
-- Reading and creating already have their policies in migration 0001.

create policy "Organization admins can update their organization"
  on public.organizations
  for update
  to authenticated
  using (public.is_organization_admin(id))
  with check (public.is_organization_admin(id));

-- Deleting is deliberately narrow: only an owner, and only while nothing hangs
-- off the organisation. An owner can read every conference of their own
-- organisation (see the conferences policies below), so the "no conferences"
-- test below sees all of them, drafts included.
create policy "Owners can delete an organization that has no conferences"
  on public.organizations
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members as membership
      where membership.organization_id = organizations.id
        and membership.user_id = (select auth.uid())
        and membership.role = 'owner'
    )
    and not exists (
      select 1
      from public.conferences as conference
      where conference.organization_id = organizations.id
    )
  );


-- -----------------------------------------------------------------------------
-- organization_members
-- -----------------------------------------------------------------------------
-- Migration 0001 only let people read their own membership. The team page needs
-- everybody in the organisation to see the rest of it.

drop policy "Users can read their own memberships" on public.organization_members;

create policy "Members can read the members of their organization"
  on public.organization_members
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

create policy "Organization admins can add a member"
  on public.organization_members
  for insert
  to authenticated
  with check (public.is_organization_admin(organization_id));

create policy "Organization admins can change a member's role"
  on public.organization_members
  for update
  to authenticated
  using (public.is_organization_admin(organization_id))
  with check (public.is_organization_admin(organization_id));

create policy "Admins can remove a member, and anybody can leave"
  on public.organization_members
  for delete
  to authenticated
  using (
    public.is_organization_admin(organization_id)
    or user_id = (select auth.uid())
  );


-- -----------------------------------------------------------------------------
-- conferences
-- -----------------------------------------------------------------------------
-- The two select policies are an "or": a row is readable when either one says
-- so. Visitors see published and archived conferences; the people running a
-- conference see it whatever its status, which is how an organiser opens their
-- own draft.

create policy "Anyone can read published conferences"
  on public.conferences
  for select
  to anon, authenticated
  using (status in ('published', 'archived'));

drop policy "Members can read all conferences of their organization" on public.conferences;

-- There are two ways in, because of when each one can be checked. Looking the
-- conference up by its id, which is what is_conference_staff does, only works
-- for a row that is already in the table. It does not work for the row of an
-- "insert ... returning", the statement a page uses to get the new id back: the
-- new row is not there to be looked up yet, and the insert fails with "new row
-- violates row-level security policy". Reading organization_id straight off the
-- row being checked always works, and it covers the common case of somebody
-- creating a conference for their own organisation.
create policy "Staff can read their conference in any status"
  on public.conferences
  for select
  to authenticated
  using (
    public.is_organization_member(organization_id)
    or public.is_conference_staff(id)
  );

create policy "Organisers can update their conference"
  on public.conferences
  for update
  to authenticated
  using (public.can_manage_conference(id))
  with check (public.can_manage_conference(id));

-- Once a conference has been published, people have applied to it and paid for
-- it, so it is archived rather than deleted.
create policy "Organisers can delete a conference that is still a draft"
  on public.conferences
  for delete
  to authenticated
  using (public.can_manage_conference(id) and status = 'draft');


-- -----------------------------------------------------------------------------
-- committees
-- -----------------------------------------------------------------------------
-- The same rule migration 0001 had, written with status instead of is_public.
-- The migration for task T02 replaces the committees table's policies with the
-- full set from permissions.md.

create policy "Anyone can read committees of published conferences"
  on public.committees
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.conferences as conference
      where conference.id = committees.conference_id
        and conference.status in ('published', 'archived')
    )
  );


-- -----------------------------------------------------------------------------
-- conference_staff
-- -----------------------------------------------------------------------------
-- Everybody helping with a conference sees the whole team. Participants see the
-- chairs and organisers on the public "meet the team" list; that half of the
-- rule arrives with the tables that say who a participant is.

alter table public.conference_staff enable row level security;

create policy "Staff can read the team of their conference"
  on public.conference_staff
  for select
  to authenticated
  using (public.is_conference_staff(conference_id));

create policy "Organisers can add somebody to the team"
  on public.conference_staff
  for insert
  to authenticated
  with check (public.can_manage_conference(conference_id));

-- Nobody edits their own staff row, so an organiser cannot quietly promote
-- themselves and a chair cannot make themselves an organiser.
create policy "Organisers can change somebody else's staff row"
  on public.conference_staff
  for update
  to authenticated
  using (
    public.can_manage_conference(conference_id)
    and user_id <> (select auth.uid())
  )
  with check (
    public.can_manage_conference(conference_id)
    and user_id <> (select auth.uid())
  );

create policy "Organisers can remove staff, and staff can step down"
  on public.conference_staff
  for delete
  to authenticated
  using (
    public.can_manage_conference(conference_id)
    or user_id = (select auth.uid())
  );


-- -----------------------------------------------------------------------------
-- invites
-- -----------------------------------------------------------------------------
-- The invited person does not read this table at all. They use get_invite with
-- the token, which is a security definer function and therefore not limited by
-- these policies.

alter table public.invites enable row level security;

create policy "Inviters and the people in charge can read invitations"
  on public.invites
  for select
  to authenticated
  using (
    invited_by = (select auth.uid())
    or (conference_id is not null and public.can_manage_conference(conference_id))
    or (organization_id is not null and public.is_organization_admin(organization_id))
  );

create policy "Organisers and organization admins can send an invitation"
  on public.invites
  for insert
  to authenticated
  with check (
    invited_by = (select auth.uid())
    and (
      (conference_id is not null and public.can_manage_conference(conference_id))
      or (organization_id is not null and public.is_organization_admin(organization_id))
    )
  );

-- There is no update policy on purpose: accepting goes through accept_invite,
-- which is the only way accepted_at is ever written.
create policy "Inviters and the people in charge can withdraw an invitation"
  on public.invites
  for delete
  to authenticated
  using (
    invited_by = (select auth.uid())
    or (conference_id is not null and public.can_manage_conference(conference_id))
    or (organization_id is not null and public.is_organization_admin(organization_id))
  );


-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------
-- There is no insert policy: only triggers, which run as the server, put rows
-- here. "created_at <= now()" hides rows that are dated in the future, which is
-- how an award announcement appears at the moment the organiser chose without
-- anything having to run on a timer.

alter table public.notifications enable row level security;

create policy "Users can read their own notifications"
  on public.notifications
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and created_at <= now()
  );

create policy "Users can mark their own notifications as read"
  on public.notifications
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can delete their own notifications"
  on public.notifications
  for delete
  to authenticated
  using (user_id = (select auth.uid()));
