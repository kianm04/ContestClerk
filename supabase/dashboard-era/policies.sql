-- =============================================================================
-- MUNMeet: Row Level Security (RLS) policies
-- File: supabase/policies.sql
-- =============================================================================
--
-- WHAT THIS FILE DOES
-- The app talks to the database with the "publishable" key, which anybody can
-- find in the browser. Row Level Security is what stops that key from reading or
-- changing everything. Every policy below is one rule of the form
-- "this kind of visitor may do this action on these rows".
--
-- HOW RLS DECIDES
-- * Once RLS is enabled on a table, every action is refused unless a policy
--   allows it. No policy means no access.
-- * When several policies cover the same action, a row is allowed if ANY of
--   them allows it. An old policy with a different name can therefore quietly
--   allow more than this file intends. Step 0 shows whether such policies exist.
-- * The "postgres" user that the SQL editor runs as is not limited by RLS.
--
-- WORDS YOU WILL SEE
-- anon           A visitor who is not signed in.
-- authenticated  A visitor who is signed in.
-- auth.uid()     The user id of the signed-in visitor, or null for anon.
--
-- WHAT IS DELIBERATELY NOT ALLOWED YET
-- There are no UPDATE or DELETE policies on any table, so nobody can edit or
-- delete rows through the app. There is no INSERT policy on
-- organization_members either, so the app cannot add members itself; the
-- trigger in the organizations section does that. Editing, deleting and inviting
-- members will get their own policies when those features are built.
--
-- HOW TO RUN
-- 1. Run the step 0 inspect query on its own first and go through its checklist.
-- 2. Paste this whole file into the Supabase SQL editor and press Run. The editor
--    may ask you to confirm because the file contains "drop" statements. They
--    only drop this file's own policies and trigger, which are recreated
--    straight after.
-- 3. Running the file again is safe. It replaces its own policies, functions and
--    trigger instead of adding copies.


-- =============================================================================
-- STEP 0 (READ-ONLY): INSPECT THE TABLES FIRST
-- =============================================================================
-- Nobody wrote down exactly how these tables were set up, so look at what is
-- really there before running anything. The query inside the comment below only
-- reads the database's own catalogue. It changes nothing.
--
-- How to use it: copy everything between "START INSPECT" and "END INSPECT" into
-- a NEW query tab and press Run. The SQL editor only shows the result of the
-- last statement, which is why this is one query glued together with
-- "union all". The "kind" column says what each result row describes.

/* START INSPECT

with our_tables (table_name) as (
  values ('conferences'), ('organizations'), ('organization_members'), ('committees')
)

-- kind = column: every column, whether it may be empty (nullable), and its default.
select
  'column' as kind,
  col.table_name::text as table_name,
  col.column_name::text as name,
  format(
    'type=%s, nullable=%s, default=%s',
    col.data_type, col.is_nullable, coalesce(col.column_default, '(none)')
  ) as details
from information_schema.columns as col
where col.table_schema = 'public'
  and col.table_name::text in (select our_tables.table_name from our_tables)

union all

-- kind = rls: whether Row Level Security is switched on, and who owns the table.
select
  'rls',
  cls.relname::text,
  'row level security',
  format(
    'enabled=%s, forced=%s, owner=%s',
    cls.relrowsecurity::text, cls.relforcerowsecurity::text, pg_get_userbyid(cls.relowner)
  )
from pg_class as cls
where cls.relnamespace = 'public'::regnamespace
  and cls.relname::text in (select our_tables.table_name from our_tables)

union all

-- kind = policy: policies that already exist, with their rules.
select
  'policy',
  pol.tablename::text,
  pol.policyname::text,
  format(
    'action=%s, roles=%s, using=%s, with_check=%s',
    pol.cmd, pol.roles::text, coalesce(pol.qual, '(none)'), coalesce(pol.with_check, '(none)')
  )
from pg_policies as pol
where pol.schemaname = 'public'
  and pol.tablename::text in (select our_tables.table_name from our_tables)

union all

-- kind = trigger: triggers that already exist, and the function each one runs.
select
  'trigger',
  trg.event_object_table::text,
  trg.trigger_name::text,
  format('%s %s: %s', trg.action_timing, trg.event_manipulation, trg.action_statement)
from information_schema.triggers as trg
where trg.event_object_schema = 'public'
  and trg.event_object_table::text in (select our_tables.table_name from our_tables)

union all

-- kind = constraint: primary key (p), unique (u), check (c) and foreign key (f).
select
  'constraint',
  cls.relname::text,
  con.conname::text,
  pg_get_constraintdef(con.oid)
from pg_constraint as con
join pg_class as cls on cls.oid = con.conrelid
where cls.relnamespace = 'public'::regnamespace
  and cls.relname::text in (select our_tables.table_name from our_tables)
  and con.contype in ('p', 'u', 'c', 'f')

union all

-- kind = unique index: a column can also be unique through an index alone.
select
  'unique index',
  idx.tablename::text,
  idx.indexname::text,
  idx.indexdef
from pg_indexes as idx
where idx.schemaname = 'public'
  and idx.tablename::text in (select our_tables.table_name from our_tables)
  and idx.indexdef like 'CREATE UNIQUE INDEX%'

union all

-- kind = function: functions already in the public schema, to spot name clashes.
select
  'function',
  '(public schema)',
  fn.proname::text,
  format(
    'arguments=(%s), security_definer=%s',
    pg_get_function_arguments(fn.oid), fn.prosecdef::text
  )
from pg_proc as fn
where fn.pronamespace = 'public'::regnamespace

union all

-- kind = grant: which table privileges the two app roles have.
select
  'grant',
  grt.table_name::text,
  grt.grantee::text,
  string_agg(grt.privilege_type::text, ', ' order by grt.privilege_type::text)
from information_schema.role_table_grants as grt
where grt.table_schema = 'public'
  and grt.table_name::text in (select our_tables.table_name from our_tables)
  and grt.grantee::text in ('anon', 'authenticated')
group by grt.table_name, grt.grantee

union all

-- kind = row count: how many rows exist. The editor sees every row, RLS or not.
select 'row count', 'conferences', 'rows', count(*)::text from public.conferences
union all
select 'row count', 'organizations', 'rows', count(*)::text from public.organizations
union all
select 'row count', 'organization_members', 'rows', count(*)::text from public.organization_members
union all
select 'row count', 'committees', 'rows', count(*)::text from public.committees

order by kind, table_name, name;

END INSPECT */

-- CHECKLIST: compare the inspect result with what the app and this file assume.
--
-- [ ] column: organizations.id and conferences.id have a default such as
--     gen_random_uuid(). The app inserts an organization without an id and asks
--     for the new id back.
-- [ ] column: created_at and updated_at are nullable or have a default like now().
-- [ ] column: conferences.status, conferences.timezone and conferences.venue_name
--     are nullable = YES or have a default. The app never sends them.
-- [ ] column: organizations.created_by and conferences.created_by. If they are
--     nullable = NO, seed.sql needs your own user id (explained in that file).
-- [ ] column: organization_members.role. A type of "USER-DEFINED" means an enum,
--     and that enum must include 'owner'.
-- [ ] constraint: any CHECK on organization_members.role must allow 'owner'.
--     Otherwise creating ANY organization in the app fails.
-- [ ] constraint: PRIMARY KEY (id) on organizations and conferences. seed.sql
--     relies on it.
-- [ ] constraint: a PRIMARY KEY or UNIQUE on organization_members
--     (organization_id, user_id), so nobody can be added to the same
--     organization twice.
-- [ ] constraint: FOREIGN KEYs from conferences.organization_id and
--     organization_members.organization_id to organizations(id). The app's
--     "organizations(...)" lookups only work through foreign keys.
-- [ ] constraint or unique index: UNIQUE (slug) on conferences and organizations.
--     If it is missing, see OPTIONAL at the bottom of this file.
-- [ ] rls: forced=false. The owner is normally postgres.
-- [ ] policy: any policy whose name is NOT one of the seven this file creates:
--       organizations:        "Anyone can read organizations"
--                             "Signed-in users can create organizations they own"
--       organization_members: "Users can read their own memberships"
--       conferences:          "Anyone can read public conferences"
--                             "Members can read all conferences of their organization"
--                             "Members can create conferences for their organization"
--       committees:           "Anyone can read committees of public conferences"
--     Policies are OR-ed, so a leftover such as "Enable insert for authenticated
--     users only" would let any signed-in user insert anything. Remove each
--     leftover by name in a separate query tab, for example:
--       drop policy if exists "Enable read access for all users" on public.conferences;
-- [ ] trigger: an AFTER INSERT trigger on organizations that somebody already
--     made to add the owner. Keep only one of the two (see the organizations
--     section).
-- [ ] function: an existing is_organization_member or
--     add_organization_creator_as_owner with different argument names.
--     "create or replace" cannot rename an argument and stops with an error.
-- [ ] grant: see step 1 below.
-- [ ] row count: if rows already exist, duplicate slugs can block the optional
--     unique constraints, and existing slugs can clash with seed.sql.


-- =============================================================================
-- STEP 1: TABLE PRIVILEGES (GRANTS). USUALLY NOTHING TO DO.
-- =============================================================================
-- Postgres checks two separate things for every request:
--   1. GRANTs decide whether a role may use a table at all (select, insert, ...).
--   2. RLS policies (the rest of this file) decide which rows it may use.
-- Supabase normally grants anon and authenticated full privileges on tables in
-- the public schema and relies on RLS for safety, so this file does not change
-- grants. Some projects are set up so that new tables are not exposed to the API
-- automatically, and then these grants are missing.
--
-- How to tell the two apart when the app gets an error. Both use error code
-- 42501, so read the message:
--   "permission denied for table conferences"          -> a GRANT is missing.
--   "new row violates row-level security policy ..."   -> a policy said no.
--   A select that returns no rows and no error         -> RLS hid the rows.
--
-- The "grant" rows of the inspect query should show at least:
--   anon:          SELECT on conferences, organizations, committees
--   authenticated: SELECT on all four tables, INSERT on organizations and conferences
-- If something is missing, uncomment only the line you need and run it:
-- grant select on public.conferences, public.organizations, public.committees to anon;
-- grant select on public.conferences, public.organizations, public.committees, public.organization_members to authenticated;
-- grant insert on public.organizations, public.conferences to authenticated;


-- =============================================================================
-- SHARED HELPER: is_organization_member(org_id)
-- =============================================================================

-- Answers "is the signed-in user a member of this organization?" with true or false.
--
-- Why a function instead of writing the check inside each policy:
-- * It keeps the conference policies short and readable.
-- * "security definer" makes it run with the rights of its owner (postgres), so it
--   can read organization_members without going through that table's own
--   policies. That avoids "infinite recursion detected in policy" errors once
--   policies on different tables start looking at each other.
-- * "set search_path = ''" plus full names (public.organization_members, auth.uid)
--   stops anybody from tricking the function into using a look-alike table.
-- * "stable" tells Postgres the answer does not change during one query.
--
-- It only ever checks the CURRENT user, never a user id passed in, so it cannot
-- be used to find out who belongs to other organizations. Anon always gets false.
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

-- Supabase lets every role call functions in the public schema by default, even
-- through the API. Only signed-in users need this one, because every policy that
-- uses it is "to authenticated", so take the right away from everybody else.
revoke execute on function public.is_organization_member(uuid) from public, anon;
grant execute on function public.is_organization_member(uuid) to authenticated;


-- =============================================================================
-- TABLE: organizations
-- =============================================================================

-- Turn on RLS. From here on nothing is allowed on this table unless a policy allows it.
alter table public.organizations enable row level security;

-- READ: anybody, signed in or not, may read every organization.
-- Why: the public conference list shows each conference's organization name
-- (the app asks for organizations(name) together with each conference). If
-- organizations were hidden, that name would come back empty. It is also what
-- lets the app read back the id of an organization it has just created. This
-- makes created_by (a user id) readable by anybody, which is acceptable for now.
drop policy if exists "Anyone can read organizations" on public.organizations;
create policy "Anyone can read organizations"
  on public.organizations
  for select
  to anon, authenticated
  using (true);

-- CREATE: a signed-in user may create an organization, but only with themselves
-- as created_by.
-- Why: without this check, somebody could create an organization in another
-- user's name, and the trigger below would make that other user its owner.
-- A missing (null) created_by is refused as well.
-- "(select auth.uid())" instead of plain "auth.uid()" is what Supabase
-- recommends: Postgres then looks up the user id once per statement instead of
-- once per row.
drop policy if exists "Signed-in users can create organizations they own" on public.organizations;
create policy "Signed-in users can create organizations they own"
  on public.organizations
  for insert
  to authenticated
  with check (created_by = (select auth.uid()));

-- UPDATE and DELETE: no policy, so refused for everybody using the app. Intended for now.

-- Adds the creator of a new organization to organization_members as 'owner'.
--
-- Why a trigger: it runs inside the same insert as the organization, so either
-- the organization and its owner membership are both saved, or neither is. The
-- app never inserts memberships itself, which is why organization_members has
-- no INSERT policy.
--
-- Why "security definer": signed-in users may not insert into
-- organization_members directly. This function runs as its owner (postgres),
-- who may, and it only ever inserts the one row below.
create or replace function public.add_organization_creator_as_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Organizations added in the SQL editor (for example by seed.sql) can have no
  -- creator. There is nobody to make owner then, so skip the membership.
  if new.created_by is null then
    return new;
  end if;

  -- "on conflict do nothing": if this person is somehow already a member, keep
  -- the existing row instead of failing the whole organization insert.
  insert into public.organization_members (organization_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict do nothing;

  return new;
end;
$$;

-- Only the trigger below should run this function; nobody should call it
-- directly. This does not stop the trigger from working: Postgres checks this
-- right when the trigger is created, which happens as postgres.
revoke execute on function public.add_organization_creator_as_owner() from public, anon, authenticated;

-- Run the function once for every new organization, right after it is inserted.
-- If the inspect query showed another trigger that already adds the owner,
-- remove one of the two so the same work is not done twice.
drop trigger if exists on_organization_created_add_owner on public.organizations;
create trigger on_organization_created_add_owner
  after insert on public.organizations
  for each row
  execute function public.add_organization_creator_as_owner();


-- =============================================================================
-- TABLE: organization_members
-- =============================================================================

-- Turn on RLS. From here on nothing is allowed on this table unless a policy allows it.
alter table public.organization_members enable row level security;

-- READ: a signed-in user may read only their OWN membership rows.
-- Why: the app lists "your organizations" by selecting organization_members
-- where user_id is the current user. Users cannot see who else is in an
-- organization; that comes when member lists are built.
-- This policy does not call a function or look at another table, so it cannot
-- cause recursion.
drop policy if exists "Users can read their own memberships" on public.organization_members;
create policy "Users can read their own memberships"
  on public.organization_members
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- INSERT, UPDATE and DELETE: no policy, so refused for everybody using the app.
-- Memberships are only created by the trigger on organizations. Inviting and
-- removing members comes later.


-- =============================================================================
-- TABLE: conferences
-- =============================================================================

-- Turn on RLS. From here on nothing is allowed on this table unless a policy allows it.
alter table public.conferences enable row level security;

-- READ (1 of 2): anybody, signed in or not, may read conferences marked public.
-- Why: the conference list and detail pages are open to visitors who are not
-- signed in. A conference whose is_public is false or empty (null) stays hidden.
drop policy if exists "Anyone can read public conferences" on public.conferences;
create policy "Anyone can read public conferences"
  on public.conferences
  for select
  to anon, authenticated
  using (is_public = true);

-- READ (2 of 2): a signed-in member of an organization may also read that
-- organization's conferences that are NOT public.
-- Why: organizers need to see their own unpublished conferences, and when a new
-- conference is inserted and asked for back, Postgres only returns it if the
-- user may READ it. Because policies are OR-ed, members see their private
-- conferences in any select, so the app's public list keeps filtering on
-- is_public = true itself.
drop policy if exists "Members can read all conferences of their organization" on public.conferences;
create policy "Members can read all conferences of their organization"
  on public.conferences
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

-- CREATE: a signed-in user may create a conference only when both are true:
--   1. created_by is themselves, so nobody creates a conference in somebody
--      else's name, and
--   2. they are a member of the organization in organization_id, so nobody adds
--      conferences to an organization they do not belong to.
-- If organization_id is empty (null), the membership check is false and the
-- insert is refused. The membership check is not wrapped in "(select ...)",
-- because its answer depends on each row's organization_id.
drop policy if exists "Members can create conferences for their organization" on public.conferences;
create policy "Members can create conferences for their organization"
  on public.conferences
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and public.is_organization_member(organization_id)
  );

-- UPDATE and DELETE: no policy, so refused for everybody using the app. Intended for now.


-- =============================================================================
-- TABLE: committees
-- =============================================================================
-- Committees get ONE policy: a public read that mirrors conferences. The app does
-- not use committees yet, but conference pages will list them, and a committee
-- should never be more visible than its conference. To keep committees fully
-- locked until then, delete the policy below. With RLS on and no policies,
-- nobody using the app can read or change them.

-- Turn on RLS. From here on nothing is allowed on this table unless a policy allows it.
alter table public.committees enable row level security;

-- READ: anybody, signed in or not, may read a committee whose conference is public.
drop policy if exists "Anyone can read committees of public conferences" on public.committees;
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

-- INSERT, UPDATE and DELETE: no policy, so refused for everybody using the app.


-- =============================================================================
-- AFTER RUNNING
-- =============================================================================
-- Run the step 0 inspect query again. You should see enabled=true on all four
-- tables, exactly the seven policies listed in the checklist, and the trigger
-- on_organization_created_add_owner on organizations.


/* =============================================================================
   OPTIONAL: MAKE SLUGS UNIQUE
   =============================================================================
   Only do this if the inspect query shows NO unique constraint or unique index
   on slug. Copy the lines you need into a new query tab and run them ONCE.

   Why: the detail page lives at /conferences/[slug]. With two conferences on the
   same slug, one of them could never be opened. A unique constraint makes the
   database refuse the second one instead.

   These are NOT safe to run twice: the second run stops with "already exists".
   They also fail if duplicate slugs already exist. Find duplicates first with:
     select slug, count(*) from public.conferences group by slug having count(*) > 1;
     select slug, count(*) from public.organizations group by slug having count(*) > 1;

-- Refuse a second organization with the same slug.
alter table public.organizations add constraint organizations_slug_key unique (slug);

-- Refuse a second conference with the same slug.
alter table public.conferences add constraint conferences_slug_key unique (slug);
*/
