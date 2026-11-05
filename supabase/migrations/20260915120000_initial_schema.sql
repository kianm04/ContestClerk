-- =============================================================================
-- Migration 0001: the tables the app used before the spec existed
-- =============================================================================
--
-- WHAT THIS IS
-- Before September 2026 the tables were created by hand in the Supabase
-- dashboard and nobody wrote the SQL down. This file recreates them from what
-- the app reads and writes (client/src/lib/server/*.ts), from seed.sql, and
-- from the policies that used to live in supabase/dashboard-era/policies.sql.
-- It exists so that `supabase start` gives every developer a database the
-- current app runs against.
--
-- It is NOT the final schema. specs/02-architecture/data-model.md describes
-- the real one. The schema tasks in specs/07-delivery/tasks.md add further
-- migrations that extend these tables and create the rest. Never edit this
-- file once it has been applied anywhere; add a new migration instead.
--
-- HOW MIGRATIONS WORK
-- Every file in supabase/migrations/ runs once, in filename order, on
-- `supabase db reset` (locally) and `supabase db push` (to the cloud project).
-- The filename starts with a timestamp so the order is obvious.


-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

-- What a person may do inside an organization. The trigger below makes the
-- creator an 'owner'. Adding a value later is "alter type ... add value".
create type public.organization_role as enum ('owner', 'admin', 'member');


-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

-- An organization runs conferences. Anybody can read it (the public conference
-- list shows the organization name next to each conference).
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  country_code char(2),
  website_url text,
  -- Null when a row was added by seed.sql rather than by a person.
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Who belongs to which organization. One row per person per organization.
create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.organization_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members (user_id);

-- A conference. is_public decides whether visitors can see it; the spec
-- replaces this column with a status enum in a later migration.
create table public.conferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  slug text not null unique,
  name text not null,
  description text,
  city text not null,
  venue_name text,
  country_code char(2) not null,
  timezone text not null default 'Europe/Amsterdam',
  start_date date not null,
  end_date date not null,
  website_url text,
  is_public boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint conferences_end_after_start check (end_date >= start_date)
);

create index conferences_organization_id_idx on public.conferences (organization_id);
create index conferences_public_start_date_idx on public.conferences (is_public, start_date);

-- A committee inside a conference. The app does not use this table yet; it is
-- here because the dashboard had it and a policy referred to it.
create table public.committees (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences (id) on delete cascade,
  slug text not null,
  name text not null,
  abbreviation text,
  description text,
  topics text[] not null default '{}',
  room text,
  position integer not null default 0,
  default_speaking_time_seconds integer not null default 90,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conference_id, slug)
);


-- -----------------------------------------------------------------------------
-- Helper: is_organization_member(org_id)
-- -----------------------------------------------------------------------------
-- Answers "is the signed-in user a member of this organization?". Policies on
-- other tables call it. "security definer" lets it read organization_members
-- even though the caller may not, and the empty search_path stops a caller
-- from tricking it into reading a different table with the same name.
create or replace function public.is_organization_member(org_id uuid)
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
  );
$$;

revoke execute on function public.is_organization_member(uuid) from public, anon;
grant execute on function public.is_organization_member(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- Trigger: the person who creates an organization becomes its owner
-- -----------------------------------------------------------------------------
create or replace function public.add_organization_creator_as_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Rows added by seed.sql have no creator, so there is nobody to make owner.
  if new.created_by is null then
    return new;
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict do nothing;

  return new;
end;
$$;

revoke execute on function public.add_organization_creator_as_owner() from public, anon, authenticated;

create trigger on_organization_created_add_owner
  after insert on public.organizations
  for each row
  execute function public.add_organization_creator_as_owner();


-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
-- The app talks to the database with the publishable key, which anybody can
-- find in the browser. RLS is what stops that key from reading or changing
-- everything. With RLS on, nothing is allowed unless a policy allows it.
-- There are no update or delete policies yet, on purpose.

alter table public.organizations enable row level security;

create policy "Anyone can read organizations"
  on public.organizations
  for select
  to anon, authenticated
  using (true);

create policy "Signed-in users can create organizations they own"
  on public.organizations
  for insert
  to authenticated
  with check (created_by = (select auth.uid()));

alter table public.organization_members enable row level security;

create policy "Users can read their own memberships"
  on public.organization_members
  for select
  to authenticated
  using (user_id = (select auth.uid()));

alter table public.conferences enable row level security;

create policy "Anyone can read public conferences"
  on public.conferences
  for select
  to anon, authenticated
  using (is_public = true);

create policy "Members can read all conferences of their organization"
  on public.conferences
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

create policy "Members can create conferences for their organization"
  on public.conferences
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and public.is_organization_member(organization_id)
  );

alter table public.committees enable row level security;

create policy "Anyone can read committees of public conferences"
  on public.committees
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.conferences as conference
      where conference.id = committees.conference_id
        and conference.is_public = true
    )
  );
