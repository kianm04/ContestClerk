-- =============================================================================
-- Conference roles and permissions (docs/roles-and-permissions.md, step 1)
-- =============================================================================
--
-- WHAT THIS IS
-- Until now a conference's team had three fixed roles in an enum on the
-- conference_staff row, and one of them, 'organiser', opened everything. This
-- migration gives each conference its own named roles, each role a set of
-- permissions from a fixed list, and each team member one or more roles. It
-- is section 7 of docs/roles-and-permissions.md, which also says why.
--
--   * two enums: permission (the twenty switches) and role_scope
--   * conference_roles and conference_role_members
--   * the helpers every policy and page will ask: has_permission,
--     has_committee_permission, permitted_conference_ids, my_permissions, and
--     the rank rule in can_manage_role, can_place_role, can_manage_member and
--     can_grant
--   * the three helpers that exist today, redefined on top of them, so that
--     every policy still asking can_manage_conference means "administrators"
--     and every policy asking is_committee_chair means "run_room in this
--     committee". Nothing widens by accident; each area's own step narrows it.
--   * a trigger that gives every new conference its three preset roles and its
--     creator the Organiser role
--   * invitations carry a role_id; accept_invite, get_invite, list_my_invites,
--     notify_invite, conference_team_has_email and
--     committee_chair_invite_refusal are rewritten for it
--   * the backfill: presets for every conference, memberships from the old
--     column, the Organiser role for every plain organisation member on every
--     existing conference (decision 1), and then the old column is dropped
--
-- WHAT IS NOT HERE, ON PURPOSE
-- Nothing about profile_details. The two views that split private details into
-- contact and welfare land in step 4, in the same change as the pages that
-- read them. No policy outside the team's own tables changes meaning here.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- =============================================================================
-- The two enums
-- =============================================================================
-- The twenty permissions, in the six groups section 4 of the document lists
-- them in. A role holds an array of these. The names are verbs a chair would
-- use, and $lib/permissions.ts carries the words shown on screen for each. A
-- new permission later is "alter type ... add value" and a line in that file.

create type public.permission as enum (
  -- Conference
  'administrator',
  'edit_conference',
  'manage_team',
  'manage_roles',
  -- Committees and rooms
  'manage_committees',
  'run_room',
  'review_papers',
  'write_chair_notes',
  'propose_awards',
  'confirm_awards',
  -- Applications
  'read_applications',
  'decide_applications',
  -- Participants and private details
  'read_participants',
  'read_contact_details',
  'read_welfare_details',
  -- Money
  'read_invoices',
  'manage_invoices',
  -- Programme and communication
  'edit_schedule',
  'send_announcements',
  'manage_documents'
);

-- Whether a role's permissions apply to the whole conference or only in the
-- committees each member is assigned to (a committee_chairs row). The order
-- matters once: 'conference' sorts first, which is how my_permissions keeps
-- the wider scope when a person holds a permission at both.
create type public.role_scope as enum ('conference', 'committees');


-- =============================================================================
-- conference_roles
-- =============================================================================
-- One row per role per conference. "position" orders them, lowest first, the
-- way committees and fees are ordered; it is also the rank the rule in
-- can_manage_role reads, so the role at the top of the list is the highest.
-- "is_public" puts a role's members on the conference's public team page.
--
-- Permissions are an enum array rather than a bitfield so that
-- "'run_room' = any (role.permissions)" reads as a sentence.

create table public.conference_roles (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences (id) on delete cascade,
  name text not null,
  position integer not null default 0,
  scope public.role_scope not null default 'conference',
  permissions public.permission[] not null default '{}',
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The same forty characters the role editor's form checks.
  constraint conference_roles_name_length check (char_length(btrim(name)) between 1 and 40)
);

-- Two roles of one conference never share a name, however it is capitalised.
create unique index conference_roles_unique_name
  on public.conference_roles (conference_id, lower(name));

-- The roles of a conference are always read in order.
create index conference_roles_conference_position_idx
  on public.conference_roles (conference_id, position);

create trigger conference_roles_set_updated_at
  before update on public.conference_roles
  for each row
  execute function public.set_updated_at();


-- =============================================================================
-- conference_role_members
-- =============================================================================
-- Who holds which role. The composite foreign key onto conference_staff means
-- a role can only be held by somebody on the team, and leaving the team drops
-- every role with it. "on delete restrict" on the role is rule 7 of the
-- document: a role with members cannot be deleted; take them off it first.

create table public.conference_role_members (
  conference_id uuid not null,
  user_id uuid not null,
  role_id uuid not null references public.conference_roles (id) on delete restrict,
  -- Who gave the role, for the record. Null once that account is gone.
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (role_id, user_id),
  foreign key (conference_id, user_id)
    references public.conference_staff (conference_id, user_id) on delete cascade
);

-- "Which roles does this person hold on this conference?", asked by every
-- permission check below.
create index conference_role_members_staff_idx
  on public.conference_role_members (conference_id, user_id);

-- "Which conferences does this person hold a role on?", for the switcher.
create index conference_role_members_user_id_idx
  on public.conference_role_members (user_id);


-- -----------------------------------------------------------------------------
-- Trigger: a membership's role belongs to its conference
-- -----------------------------------------------------------------------------
-- The row names both, so a page could pair a role of one conference with the
-- staff row of another. The same shape as check_invite_committee in migration
-- 0002, and security definer for the same reason: it has to read the role
-- whoever is inserting.

create or replace function public.check_role_member_conference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.conference_roles as role
    where role.id = new.role_id
      and role.conference_id = new.conference_id
  ) then
    raise exception 'That role belongs to a different conference';
  end if;

  return new;
end;
$$;

revoke execute on function public.check_role_member_conference() from public, anon, authenticated;

create trigger conference_role_members_check_conference
  before insert or update on public.conference_role_members
  for each row
  execute function public.check_role_member_conference();


-- =============================================================================
-- The preset roles
-- =============================================================================
-- The three roles every conference starts with, written once and read by both
-- the trigger below and the backfill at the end of this file. They match the
-- three the product had until now, so that nobody can do more or less on the
-- day this ships than the day before. $lib/permissions.ts repeats them for the
-- role editor; a test keeps the two copies the same.
--
-- Chair holds read_participants so that a chair sees the names and schools of
-- their own delegates, which the room shows anyway. It holds neither of the
-- private-detail permissions (decision 4).

create or replace function public.preset_conference_roles()
returns table (
  name text,
  role_position integer,
  scope public.role_scope,
  permissions public.permission[],
  is_public boolean
)
language sql
immutable
set search_path = ''
as $$
  select preset.name, preset.role_position, preset.scope, preset.permissions, preset.is_public
  from (
    values
      ('Organiser', 0, 'conference'::public.role_scope,
        array['administrator']::public.permission[], true),
      ('Chair', 1, 'committees'::public.role_scope,
        array[
          'run_room', 'review_papers', 'write_chair_notes', 'propose_awards',
          'send_announcements', 'manage_committees', 'read_participants'
        ]::public.permission[], true),
      ('Volunteer', 2, 'conference'::public.role_scope,
        array[]::public.permission[], false)
  ) as preset (name, role_position, scope, permissions, is_public);
$$;

revoke execute on function public.preset_conference_roles() from public, anon;
grant execute on function public.preset_conference_roles() to authenticated;


-- =============================================================================
-- Permission helpers
-- =============================================================================
-- All "security definer" and "stable", like the helpers of migration 0002 they
-- join, so that a policy on one table may ask a question about another the
-- caller cannot read. (select auth.uid()) rather than auth.uid() is the form
-- Postgres can work out once per query instead of once per row.


-- -----------------------------------------------------------------------------
-- is_conference_owner: the people above the roles
-- -----------------------------------------------------------------------------
-- Rule 4 of the document. The owners and admins of the organisation that runs
-- a conference, and a platform admin, are administrators of it and nobody at
-- the conference can change that, which is what stops a conference from
-- locking itself out.

create or replace function public.is_conference_owner(conference_id uuid)
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
    where conference.id = is_conference_owner.conference_id
      and membership.user_id = (select auth.uid())
      and membership.role in ('owner', 'admin')
  )
  or public.is_platform_admin();
$$;

revoke execute on function public.is_conference_owner(uuid) from public, anon;
grant execute on function public.is_conference_owner(uuid) to authenticated;


-- is_platform_admin reads the signed-in user's own flag. This is the same
-- question about any account, for holder_has_permission and user_rank.
create or replace function public.is_platform_admin_account(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = is_platform_admin_account.user_id
      and profile.is_platform_admin
  );
$$;

revoke execute on function public.is_platform_admin_account(uuid) from public, anon, authenticated;



-- -----------------------------------------------------------------------------
-- holder_has_permission: does this account hold this permission conference-wide?
-- -----------------------------------------------------------------------------
-- The one place the rule "administrator implies everything, and a role only
-- counts conference-wide when its scope is the conference" is written. It
-- takes the account as an argument because two callers below ask about
-- somebody other than the signed-in user: the rank rule, and the question of
-- whether an address may be invited to chair. It is granted to nobody; the
-- security definer functions that call it run as the owner and need no grant.
--
-- "&&" is Postgres for "the two arrays overlap", so the check reads: the
-- role's permissions contain 'administrator' or the one being asked about.

create or replace function public.holder_has_permission(
  conference_id uuid,
  user_id uuid,
  permission public.permission
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin_account(holder_has_permission.user_id)
  or exists (
    select 1
    from public.conferences as conference
    join public.organization_members as membership
      on membership.organization_id = conference.organization_id
    where conference.id = holder_has_permission.conference_id
      and membership.user_id = holder_has_permission.user_id
      and membership.role in ('owner', 'admin')
  )
  or exists (
    select 1
    from public.conference_role_members as member
    join public.conference_roles as role on role.id = member.role_id
    where member.conference_id = holder_has_permission.conference_id
      and member.user_id = holder_has_permission.user_id
      and role.scope = 'conference'
      and role.permissions && array['administrator', holder_has_permission.permission]::public.permission[]
  );
$$;

revoke execute on function public.holder_has_permission(uuid, uuid, public.permission)
  from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- has_permission: may the signed-in user do this, anywhere on the conference?
-- -----------------------------------------------------------------------------

create or replace function public.has_permission(conference_id uuid, permission public.permission)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.holder_has_permission(
    has_permission.conference_id,
    (select auth.uid()),
    has_permission.permission
  );
$$;

revoke execute on function public.has_permission(uuid, public.permission) from public, anon;
grant execute on function public.has_permission(uuid, public.permission) to authenticated;


-- -----------------------------------------------------------------------------
-- has_committee_permission: may the signed-in user do this in this committee?
-- -----------------------------------------------------------------------------
-- Yes when they may do it anywhere on the conference, and yes when they are
-- assigned to the committee (a committee_chairs row) and hold a role whose
-- scope is 'committees' with the permission on it. Inside their own
-- committees, 'administrator' on such a role counts for everything too.

create or replace function public.has_committee_permission(
  committee_id uuid,
  permission public.permission
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.committees as committee
    where committee.id = has_committee_permission.committee_id
      and public.has_permission(committee.conference_id, has_committee_permission.permission)
  )
  or exists (
    select 1
    from public.committee_chairs as assignment
    join public.committees as committee on committee.id = assignment.committee_id
    join public.conference_role_members as member
      on member.conference_id = committee.conference_id
     and member.user_id = assignment.user_id
    join public.conference_roles as role on role.id = member.role_id
    where assignment.committee_id = has_committee_permission.committee_id
      and assignment.user_id = (select auth.uid())
      and role.scope = 'committees'
      and role.permissions && array['administrator', has_committee_permission.permission]::public.permission[]
  );
$$;

revoke execute on function public.has_committee_permission(uuid, public.permission) from public, anon;
grant execute on function public.has_committee_permission(uuid, public.permission) to authenticated;


-- -----------------------------------------------------------------------------
-- permitted_conference_ids and permitted_committee_ids: the set forms
-- -----------------------------------------------------------------------------
-- For the policies that must cost one lookup per query rather than one per
-- row, the lesson of migration 20260923150000_rls_conference_lookups.sql. A
-- policy writes "conference_id in (select public.permitted_conference_ids(…))"
-- and Postgres runs the function once.

create or replace function public.permitted_conference_ids(permission public.permission)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select member.conference_id
  from public.conference_role_members as member
  join public.conference_roles as role on role.id = member.role_id
  where member.user_id = (select auth.uid())
    and role.scope = 'conference'
    and role.permissions && array['administrator', permitted_conference_ids.permission]::public.permission[]

  union

  select conference.id
  from public.conferences as conference
  join public.organization_members as membership
    on membership.organization_id = conference.organization_id
  where membership.user_id = (select auth.uid())
    and membership.role in ('owner', 'admin')

  union

  select conference.id
  from public.conferences as conference
  where public.is_platform_admin();
$$;

revoke execute on function public.permitted_conference_ids(public.permission) from public, anon;
grant execute on function public.permitted_conference_ids(public.permission) to authenticated;


create or replace function public.permitted_committee_ids(permission public.permission)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select committee.id
  from public.committees as committee
  where committee.conference_id in (
    select public.permitted_conference_ids(permitted_committee_ids.permission)
  )

  union

  select assignment.committee_id
  from public.committee_chairs as assignment
  join public.committees as committee on committee.id = assignment.committee_id
  join public.conference_role_members as member
    on member.conference_id = committee.conference_id
   and member.user_id = assignment.user_id
  join public.conference_roles as role on role.id = member.role_id
  where assignment.user_id = (select auth.uid())
    and role.scope = 'committees'
    and role.permissions && array['administrator', permitted_committee_ids.permission]::public.permission[];
$$;

revoke execute on function public.permitted_committee_ids(public.permission) from public, anon;
grant execute on function public.permitted_committee_ids(public.permission) to authenticated;


-- -----------------------------------------------------------------------------
-- my_permissions: everything the signed-in user holds on one conference
-- -----------------------------------------------------------------------------
-- The server reads this once per request for the sidebar and the buttons.
-- Each permission comes back once, with the widest scope it is held at: a
-- person who is a Chair (committees) and also Press (conference) reads
-- send_announcements as 'conference'. An owner, admin or platform admin reads
-- one row, administrator, and the page expands it.
--
-- Every column is qualified because the output columns are also called
-- "permission" and "scope", and an unqualified name would be ambiguous.

create or replace function public.my_permissions(conference_id uuid)
returns table (permission public.permission, scope public.role_scope)
language sql
stable
security definer
set search_path = ''
as $$
  with granted as (
    select
      'administrator'::public.permission as granted_permission,
      'conference'::public.role_scope as granted_scope
    where public.is_conference_owner(my_permissions.conference_id)

    union all

    select unnest(role.permissions), role.scope
    from public.conference_role_members as member
    join public.conference_roles as role on role.id = member.role_id
    where member.conference_id = my_permissions.conference_id
      and member.user_id = (select auth.uid())
  )
  select distinct on (granted.granted_permission)
    granted.granted_permission,
    granted.granted_scope
  from granted
  order by granted.granted_permission, granted.granted_scope;
$$;

revoke execute on function public.my_permissions(uuid) from public, anon;
grant execute on function public.my_permissions(uuid) to authenticated;


-- =============================================================================
-- The rank rule
-- =============================================================================
-- Rule 6 of the document. A person's rank is the position of their highest
-- role (the lowest number). Owners, admins and platform admins rank -1, above
-- every role. Somebody with no role has no rank at all, which the callers
-- below treat as the bottom.
--
-- Except for administrators, who may manage every role, a person may give,
-- take, edit or delete only roles strictly below their rank; may put on a role
-- only permissions they hold themselves, and at no wider scope than they hold
-- them; and may never change their own roles.

create or replace function public.user_rank(conference_id uuid, user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_platform_admin_account(user_rank.user_id)
      or exists (
        select 1
        from public.conferences as conference
        join public.organization_members as membership
          on membership.organization_id = conference.organization_id
        where conference.id = user_rank.conference_id
          and membership.user_id = user_rank.user_id
          and membership.role in ('owner', 'admin')
      )
    then -1
    else (
      select min(role.position)
      from public.conference_role_members as member
      join public.conference_roles as role on role.id = member.role_id
      where member.conference_id = user_rank.conference_id
        and member.user_id = user_rank.user_id
    )
  end;
$$;

revoke execute on function public.user_rank(uuid, uuid) from public, anon, authenticated;


create or replace function public.my_rank(conference_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select public.user_rank(my_rank.conference_id, (select auth.uid()));
$$;

revoke execute on function public.my_rank(uuid) from public, anon;
grant execute on function public.my_rank(uuid) to authenticated;


-- "coalesce(…, 2147483647)" turns "no rank" into the largest integer, so that
-- somebody with no role is below everything and can manage nothing.

-- May the signed-in user give, take, edit or delete this role?
create or replace function public.can_manage_role(role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conference_roles as role
    where role.id = can_manage_role.role_id
      and (
        public.has_permission(role.conference_id, 'administrator')
        or role.position > coalesce(public.my_rank(role.conference_id), 2147483647)
      )
  );
$$;

revoke execute on function public.can_manage_role(uuid) from public, anon;
grant execute on function public.can_manage_role(uuid) to authenticated;


-- May the signed-in user put a role at this position? A role above one's own
-- could not be managed afterwards, and a role at one's own position would be
-- a peer, so a new or moved role has to sit strictly below.
create or replace function public.can_place_role(conference_id uuid, role_position integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_permission(can_place_role.conference_id, 'administrator')
    or can_place_role.role_position > coalesce(public.my_rank(can_place_role.conference_id), 2147483647);
$$;

revoke execute on function public.can_place_role(uuid, integer) from public, anon;
grant execute on function public.can_place_role(uuid, integer) to authenticated;


-- May the signed-in user remove this person from the team? Only somebody
-- ranked below them, or somebody with no role at all.
create or replace function public.can_manage_member(conference_id uuid, user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_permission(can_manage_member.conference_id, 'administrator')
    or coalesce(public.user_rank(can_manage_member.conference_id, can_manage_member.user_id), 2147483647)
       > coalesce(public.my_rank(can_manage_member.conference_id), 2147483647);
$$;

revoke execute on function public.can_manage_member(uuid, uuid) from public, anon;
grant execute on function public.can_manage_member(uuid, uuid) to authenticated;


-- May the signed-in user put these permissions on a role of this scope? Every
-- one of them has to be a permission they hold; and a permission they hold
-- only in their own committees cannot go on a conference-wide role.
create or replace function public.can_grant(
  conference_id uuid,
  permissions public.permission[],
  scope public.role_scope
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_permission(can_grant.conference_id, 'administrator')
  or not exists (
    select 1
    from unnest(can_grant.permissions) as wanted (permission)
    where not exists (
      select 1
      from public.conference_role_members as member
      join public.conference_roles as role on role.id = member.role_id
      where member.conference_id = can_grant.conference_id
        and member.user_id = (select auth.uid())
        and (role.scope = 'conference' or can_grant.scope = 'committees')
        and role.permissions && array['administrator', wanted.permission]::public.permission[]
    )
  );
$$;

revoke execute on function public.can_grant(uuid, public.permission[], public.role_scope) from public, anon;
grant execute on function public.can_grant(uuid, public.permission[], public.role_scope) to authenticated;


-- Does this person hold a role the conference shows on its public team page?
-- Asked by the participants' read rule on conference_staff below, which cannot
-- read conference_role_members itself: that table is the team's to read, and a
-- participant is not on the team.
create or replace function public.holds_public_role(conference_id uuid, user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conference_role_members as member
    join public.conference_roles as role on role.id = member.role_id
    where member.conference_id = holds_public_role.conference_id
      and member.user_id = holds_public_role.user_id
      and role.is_public
  );
$$;

revoke execute on function public.holds_public_role(uuid, uuid) from public, anon;
grant execute on function public.holds_public_role(uuid, uuid) to authenticated;


-- =============================================================================
-- The three helpers that already exist, redefined
-- =============================================================================
-- This is what makes the change safe. About a hundred policies and fifteen
-- functions ask these three; none of them is touched here, and each keeps
-- meaning exactly what it meant for the people who held the preset roles.

-- "May the signed-in user run this conference?" now means "are they an
-- administrator of it". Every policy still asking it is administrators-only
-- until its own step rewrites it to the specific permission.
create or replace function public.can_manage_conference(conference_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_permission(can_manage_conference.conference_id, 'administrator');
$$;

-- "Does the signed-in user run this committee's room?" The room tables, the
-- papers, the notes, the awards and the background guide all hang off this
-- helper today, so they come with run_room until step 8 splits them.
create or replace function public.is_committee_chair(committee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_committee_permission(is_committee_chair.committee_id, 'run_room');
$$;

-- "Is the signed-in user on the team at all?" A staff row, or an owner, admin
-- or platform admin. A plain organisation member no longer counts unless they
-- have a staff row, which the backfill below gives every current one
-- (decision 1).
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
  or public.is_conference_owner(is_conference_staff.conference_id);
$$;

-- The set form of is_conference_staff, for the fast policies of T122.
create or replace function public.staff_conference_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select staff.conference_id
  from public.conference_staff as staff
  where staff.user_id = (select auth.uid())

  union

  select conference.id
  from public.conferences as conference
  join public.organization_members as membership
    on membership.organization_id = conference.organization_id
  where membership.user_id = (select auth.uid())
    and membership.role in ('owner', 'admin')

  union

  select conference.id
  from public.conferences as conference
  where public.is_platform_admin();
$$;


-- -----------------------------------------------------------------------------
-- ensure_chair_is_staff: a committee assignment puts somebody on the team
-- -----------------------------------------------------------------------------
-- As in migration 0003, with one difference: there is no role column to write
-- any more. Somebody assigned to a committee who is not yet on the team joins
-- it as a bare staff row with no roles. The assignment grants nothing by
-- itself; the organiser gives the person a role on the team page.

create or replace function public.ensure_chair_is_staff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  the_conference uuid;
begin
  select committee.conference_id
  into the_conference
  from public.committees as committee
  where committee.id = new.committee_id;

  insert into public.conference_staff (conference_id, user_id)
  values (the_conference, new.user_id)
  on conflict (conference_id, user_id) do nothing;

  return new;
end;
$$;


-- =============================================================================
-- Trigger: every new conference gets its presets, and its creator a role
-- =============================================================================
-- The three roles of preset_conference_roles. Then, unless the creator is an
-- owner or admin of the organisation (who are administrators by rule 4 and
-- need no row), a staff row and the Organiser role for them, so that a plain
-- organisation member who starts a conference can carry on setting it up. The
-- same shape as add_organization_creator_as_owner in migration 0001.

create or replace function public.add_conference_presets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  organiser_role uuid;
begin
  insert into public.conference_roles (conference_id, name, position, scope, permissions, is_public)
  select new.id, preset.name, preset.role_position, preset.scope, preset.permissions, preset.is_public
  from public.preset_conference_roles() as preset;

  if new.created_by is null then
    return new;
  end if;

  if exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id = new.organization_id
      and membership.user_id = new.created_by
      and membership.role in ('owner', 'admin')
  ) then
    return new;
  end if;

  insert into public.conference_staff (conference_id, user_id)
  values (new.id, new.created_by)
  on conflict (conference_id, user_id) do nothing;

  select role.id
  into organiser_role
  from public.conference_roles as role
  where role.conference_id = new.id
    and role.name = 'Organiser';

  insert into public.conference_role_members (conference_id, user_id, role_id, granted_by)
  values (new.id, new.created_by, organiser_role, new.created_by)
  on conflict (role_id, user_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.add_conference_presets() from public, anon, authenticated;

create trigger conferences_add_presets
  after insert on public.conferences
  for each row
  execute function public.add_conference_presets();


-- =============================================================================
-- Row Level Security
-- =============================================================================

-- -----------------------------------------------------------------------------
-- conference_roles
-- -----------------------------------------------------------------------------

alter table public.conference_roles enable row level security;

create policy "The team can read the roles of their conference"
  on public.conference_roles
  for select
  to authenticated
  using (public.is_conference_staff(conference_id));

-- The public team page names the roles it shows. The sub-select is limited by
-- the conferences read rules, which already hide an unpublished conference
-- from a visitor, so it only ever finds a published or archived one.
create policy "Anyone can read the public roles of a published conference"
  on public.conference_roles
  for select
  to anon, authenticated
  using (
    is_public
    and exists (
      select 1
      from public.conferences as conference
      where conference.id = conference_roles.conference_id
        and conference.status in ('published', 'archived')
    )
  );

-- Writing a role asks three things: may this person manage roles here, may
-- they place a role at this position, and may they give these permissions.
-- On an update, "using" reads the row as it is (the role has to be below
-- them now) and "with check" the row as it will be.
create policy "Role managers can add a role below their own"
  on public.conference_roles
  for insert
  to authenticated
  with check (
    public.has_permission(conference_id, 'manage_roles')
    and public.can_place_role(conference_id, conference_roles.position)
    and public.can_grant(conference_id, permissions, scope)
  );

create policy "Role managers can change a role below their own"
  on public.conference_roles
  for update
  to authenticated
  using (
    public.has_permission(conference_id, 'manage_roles')
    and public.can_manage_role(id)
  )
  with check (
    public.has_permission(conference_id, 'manage_roles')
    and public.can_place_role(conference_id, conference_roles.position)
    and public.can_grant(conference_id, permissions, scope)
  );

-- The foreign key from conference_role_members refuses this while anybody
-- holds the role, whatever the policy says.
create policy "Role managers can delete a role below their own"
  on public.conference_roles
  for delete
  to authenticated
  using (
    public.has_permission(conference_id, 'manage_roles')
    and public.can_manage_role(id)
  );


-- -----------------------------------------------------------------------------
-- conference_role_members
-- -----------------------------------------------------------------------------
-- No update policy: a membership is given or taken, never edited. Nobody
-- changes their own roles, in either direction.

alter table public.conference_role_members enable row level security;

create policy "The team can read who holds which role"
  on public.conference_role_members
  for select
  to authenticated
  using (public.is_conference_staff(conference_id));

create policy "Team managers can give a role below their own to somebody else"
  on public.conference_role_members
  for insert
  to authenticated
  with check (
    public.has_permission(conference_id, 'manage_team')
    and public.can_manage_role(role_id)
    and user_id <> (select auth.uid())
  );

create policy "Team managers can take a role below their own off somebody else"
  on public.conference_role_members
  for delete
  to authenticated
  using (
    public.has_permission(conference_id, 'manage_team')
    and public.can_manage_role(role_id)
    and user_id <> (select auth.uid())
  );


-- The public team list on the conference page reads the memberships of the
-- public roles, and a participant is not on the team. This is the participants'
-- half, the same shape as the rule on conference_staff below. The role is
-- asked about through a definer helper rather than a sub-select, because a
-- participant may not read conference_roles for a conference that is not
-- published yet.
create or replace function public.role_is_public(role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conference_roles as role
    where role.id = role_is_public.role_id
      and role.is_public
  );
$$;

revoke execute on function public.role_is_public(uuid) from public, anon;
grant execute on function public.role_is_public(uuid) to authenticated;

create policy "Participants can see who holds a public role"
  on public.conference_role_members
  for select
  to authenticated
  using (
    public.is_conference_participant(conference_id)
    and public.role_is_public(role_id)
  );


-- -----------------------------------------------------------------------------
-- conference_staff
-- -----------------------------------------------------------------------------
-- "Staff can read the team of their conference" stays as it is. The other
-- four are written again on the permissions.

drop policy "Participants can see the organisers and chairs of their conference" on public.conference_staff;
drop policy "Organisers can add somebody to the team" on public.conference_staff;
drop policy "Organisers can change somebody else's staff row" on public.conference_staff;
drop policy "Organisers can remove staff, and staff can step down" on public.conference_staff;

-- The "meet the team" list a participant sees: the people in the roles the
-- conference marks as public, which for the presets are organisers and chairs,
-- as before.
create policy "Participants can see the holders of a public role"
  on public.conference_staff
  for select
  to authenticated
  using (
    public.is_conference_participant(conference_id)
    and public.holds_public_role(conference_id, user_id)
  );

create policy "Team managers can add somebody to the team"
  on public.conference_staff
  for insert
  to authenticated
  with check (public.has_permission(conference_id, 'manage_team'));

-- The only column left to change is the title. Nobody edits their own row,
-- as before.
create policy "Team managers can change somebody else's title"
  on public.conference_staff
  for update
  to authenticated
  using (
    public.has_permission(conference_id, 'manage_team')
    and user_id <> (select auth.uid())
  )
  with check (
    public.has_permission(conference_id, 'manage_team')
    and user_id <> (select auth.uid())
  );

-- Removing somebody takes their roles and committees with them (both cascade),
-- so it is the rank rule's business: only somebody below the remover, or
-- somebody with no role. Everybody may leave.
create policy "Team managers can remove somebody below them, and anybody can leave"
  on public.conference_staff
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or (
      public.has_permission(conference_id, 'manage_team')
      and public.can_manage_member(conference_id, user_id)
    )
  );


-- -----------------------------------------------------------------------------
-- committee_chairs: assigning people to committees is a team manager's job
-- -----------------------------------------------------------------------------

drop policy "Organisers can put a chair on a committee" on public.committee_chairs;
drop policy "Organisers can change a chair's title" on public.committee_chairs;
drop policy "Organisers can take a chair off a committee" on public.committee_chairs;

create policy "Team managers can assign somebody to a committee"
  on public.committee_chairs
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.committees as committee
      where committee.id = committee_chairs.committee_id
        and public.has_permission(committee.conference_id, 'manage_team')
    )
  );

create policy "Team managers can change an assignment's title"
  on public.committee_chairs
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.committees as committee
      where committee.id = committee_chairs.committee_id
        and public.has_permission(committee.conference_id, 'manage_team')
    )
  )
  with check (
    exists (
      select 1
      from public.committees as committee
      where committee.id = committee_chairs.committee_id
        and public.has_permission(committee.conference_id, 'manage_team')
    )
  );

create policy "Team managers can take somebody off a committee"
  on public.committee_chairs
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.committees as committee
      where committee.id = committee_chairs.committee_id
        and public.has_permission(committee.conference_id, 'manage_team')
    )
  );


-- =============================================================================
-- Invitations carry a role
-- =============================================================================
-- An invitation to a conference now names a role by id, so that accepting it
-- gives that role. The old text column keeps serving organisation invitations,
-- whose roles are still the organization_role enum. The backfill further down
-- moves every existing conference invitation onto its preset's id before the
-- constraint that says each kind uses exactly one of the two columns.

alter table public.invites
  add column role_id uuid references public.conference_roles (id) on delete cascade;

alter table public.invites
  alter column role drop not null;

create index invites_role_id_idx on public.invites (role_id);


-- -----------------------------------------------------------------------------
-- Trigger: an invitation's role belongs to its conference
-- -----------------------------------------------------------------------------

create or replace function public.check_invite_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.conference_roles as role
    where role.id = new.role_id
      and role.conference_id = new.conference_id
  ) then
    raise exception 'That role belongs to a different conference';
  end if;

  return new;
end;
$$;

revoke execute on function public.check_invite_role() from public, anon, authenticated;

create trigger invites_check_role
  before insert or update on public.invites
  for each row
  execute function public.check_invite_role();


-- -----------------------------------------------------------------------------
-- invites: who may read, send and withdraw
-- -----------------------------------------------------------------------------

drop policy "Inviters and the people in charge can read invitations" on public.invites;
drop policy "Organisers and organization admins can send an invitation" on public.invites;
drop policy "Inviters and the people in charge can withdraw an invitation" on public.invites;

create policy "Inviters and the people in charge can read invitations"
  on public.invites
  for select
  to authenticated
  using (
    invited_by = (select auth.uid())
    or (conference_id is not null and public.has_permission(conference_id, 'manage_team'))
    or (organization_id is not null and public.is_organization_admin(organization_id))
  );

-- A conference invitation offers one role, and only one the sender could give
-- on the team page: below their own rank.
create policy "Team managers and organization admins can send an invitation"
  on public.invites
  for insert
  to authenticated
  with check (
    invited_by = (select auth.uid())
    and (
      (
        conference_id is not null
        and role_id is not null
        and public.has_permission(conference_id, 'manage_team')
        and public.can_manage_role(role_id)
      )
      or (organization_id is not null and public.is_organization_admin(organization_id))
    )
  );

create policy "Inviters and the people in charge can withdraw an invitation"
  on public.invites
  for delete
  to authenticated
  using (
    invited_by = (select auth.uid())
    or (conference_id is not null and public.has_permission(conference_id, 'manage_team'))
    or (organization_id is not null and public.is_organization_admin(organization_id))
  );


-- -----------------------------------------------------------------------------
-- accept_invite
-- -----------------------------------------------------------------------------
-- The same function migration 0010 left behind, with the conference half
-- rewritten: the staff row no longer carries a role, the role is a membership
-- of the invitation's role, and any role may come with a committee to be
-- assigned to, not only a chair. Roles add up, so accepting a second
-- invitation keeps the roles one already has rather than writing over them.
-- The title rule is unchanged: a new invitation with no title leaves the title
-- an organiser already typed alone.

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

    -- The invites_check_committee trigger has already made sure a committee
    -- named here is a committee of this conference, so the row is safe to
    -- write.
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
-- get_invite and list_my_invites: the role by name
-- -----------------------------------------------------------------------------
-- Both answered the role as the text in invites.role. For a conference
-- invitation that is now the role's name ("Chair", "USG delegate affairs"),
-- and get_invite also says the role's scope and permissions, which is how the
-- accept page knows where to send somebody afterwards without a second
-- lookup. get_invite gains columns, and a function's output columns cannot be
-- changed in place, so it is dropped and made again.

drop function public.get_invite(text);

create function public.get_invite(token text)
returns table (
  kind public.invite_kind,
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
  select
    invite.kind,
    coalesce(invite.role, conference_role.name),
    conference_role.scope,
    conference_role.permissions,
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
  left join public.conference_roles as conference_role on conference_role.id = invite.role_id
  left join public.profiles as inviter on inviter.id = invite.invited_by
  where invite.token = get_invite.token;
$$;

revoke execute on function public.get_invite(text) from public;
grant execute on function public.get_invite(text) to anon, authenticated;


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
    and invite.email = (
      select lower(account.email)
      from auth.users as account
      where account.id = (select auth.uid())
    )
  order by invite.created_at;
$$;


-- -----------------------------------------------------------------------------
-- notify_invite: the sentence names the role
-- -----------------------------------------------------------------------------
-- As in migration 0010, with the role looked up by id for a conference
-- invitation. The name is written as the conference wrote it ("Chair", "USG
-- delegate affairs"), because lowercasing would spoil a name like that.

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
  role_name text;
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

    role_name := new.role;
  else
    select conference.name
    into target_name
    from public.conferences as conference
    where conference.id = new.conference_id;

    select role.name
    into role_name
    from public.conference_roles as role
    where role.id = new.role_id;
  end if;

  insert into public.notifications (user_id, conference_id, kind, title, link_path)
  values (
    invitee,
    new.conference_id,
    'invite_received',
    coalesce(inviter_name, 'Somebody') || ' invited you to ' || target_name
      || ' as ' || coalesce(role_name, 'a member of the team'),
    '/invites/' || new.token
  );

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- conference_team_has_email: "that person is already on the team"
-- -----------------------------------------------------------------------------
-- As in migration 0010, on the permission a team manager holds. "The team" is
-- the staff rows and the organisation's owners and admins; a plain member of
-- the organisation is not on a conference's team until given a role
-- (decision 1), so an invitation to them is the right thing to send.

create or replace function public.conference_team_has_email(conference_id uuid, email text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission(conference_team_has_email.conference_id, 'manage_team') then
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
            and membership.role in ('owner', 'admin')
        )
      )
  );
end;
$$;


-- -----------------------------------------------------------------------------
-- committee_chair_invite_refusal: may this address be invited to chair?
-- -----------------------------------------------------------------------------
-- As in migration 20260930, on the permissions. The 'organiser' answer used to
-- protect an organiser from being demoted by accepting a chair invitation;
-- roles add up now, so nothing is demoted. It still answers 'organiser' for an
-- administrator, because they can already run every room and the panel's own
-- "Chair it yourself" button is the way to put them on the committee.

create or replace function public.committee_chair_invite_refusal(committee_id uuid, email text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  the_conference uuid;
  account_id uuid;
begin
  select committee.conference_id
  into the_conference
  from public.committees as committee
  where committee.id = committee_chair_invite_refusal.committee_id;

  if the_conference is null or not public.has_permission(the_conference, 'manage_team') then
    raise exception 'You cannot manage that committee';
  end if;

  select account.id
  into account_id
  from auth.users as account
  where lower(account.email) = lower(committee_chair_invite_refusal.email);

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

  if public.holder_has_permission(the_conference, account_id, 'administrator') then
    return 'organiser';
  end if;

  return null;
end;
$$;


-- =============================================================================
-- The backfill
-- =============================================================================
-- In this order: the presets for every conference that exists, then the
-- memberships the old column described, then the Organiser role for every
-- plain organisation member on every existing conference, then the
-- invitations, and only then the old column goes.

-- 1. Three preset roles for every existing conference. The trigger above only
--    fires for conferences made from now on.
insert into public.conference_roles (conference_id, name, position, scope, permissions, is_public)
select conference.id, preset.name, preset.role_position, preset.scope, preset.permissions, preset.is_public
from public.conferences as conference
cross join public.preset_conference_roles() as preset;

-- 2. Every staff row's role becomes a membership of the matching preset.
insert into public.conference_role_members (conference_id, user_id, role_id)
select staff.conference_id, staff.user_id, role.id
from public.conference_staff as staff
join public.conference_roles as role
  on role.conference_id = staff.conference_id
 and role.name = case staff.role
   when 'organiser' then 'Organiser'
   when 'chair' then 'Chair'
   else 'Volunteer'
 end;

-- 3. Decision 1: a plain organisation member used to run every conference of
--    the organisation. They keep doing so on the conferences that exist today,
--    as holders of the Organiser role, which an administrator can narrow
--    afterwards. Owners and admins get no rows; rule 4 covers them.
insert into public.conference_staff (conference_id, user_id)
select conference.id, membership.user_id
from public.conferences as conference
join public.organization_members as membership
  on membership.organization_id = conference.organization_id
where membership.role = 'member'
on conflict (conference_id, user_id) do nothing;

insert into public.conference_role_members (conference_id, user_id, role_id)
select conference.id, membership.user_id, role.id
from public.conferences as conference
join public.organization_members as membership
  on membership.organization_id = conference.organization_id
join public.conference_roles as role
  on role.conference_id = conference.id
 and role.name = 'Organiser'
where membership.role = 'member'
on conflict (role_id, user_id) do nothing;

-- 4. Every conference invitation names its preset by id instead of by word.
update public.invites as invite
set role_id = role.id
from public.conference_roles as role
where invite.kind = 'conference_staff'
  and role.conference_id = invite.conference_id
  and role.name = case invite.role
    when 'organiser' then 'Organiser'
    when 'chair' then 'Chair'
    else 'Volunteer'
  end;

update public.invites
set role = null
where kind = 'conference_staff';

-- Each kind uses exactly one of the two columns.
alter table public.invites
  add constraint invites_role_matches_kind check (
    (kind = 'organization_member' and role is not null and role_id is null)
    or (kind = 'conference_staff' and role_id is not null and role is null)
  );

-- 5. The old column and its enum go. Nothing reads them any more: the three
--    helpers above were redefined before this line, and the app changes in the
--    same commit.
alter table public.conference_staff
  drop column role;

drop type public.staff_role;
