-- =============================================================================
-- Internal notes, deciders, profile flags and published awards
-- (security review of 10 October 2026: findings M7, M8, L4 and L14)
-- =============================================================================
--
-- Never edit this file once it has been applied anywhere. Add a new migration.
--
-- WHAT THIS IS
-- Row Level Security decides rows, not columns. Four places relied on the
-- server's column lists alone to keep a column from the people who may read
-- the row, and the browser holds the user's own token, so a page was never the
-- only thing that could ask:
--
--   * M7: an applicant could read `applications.internal_note`, what the
--     organisers wrote to each other, and `decided_by`, on their own row.
--   * M8: every member of a delegation could read `delegations.internal_note`,
--     and so could a chair holding `read_participants` over one of its seats.
--   * L4: every signed-in user could read everybody's `is_platform_admin` and
--     `onboarding_completed_at`.
--   * L14: every signed-in account could read the `user_id`, `seat_id` and
--     `created_by` of every published award, which says who sat where.
--
-- WHAT WAS MEASURED FIRST
-- Postgres can grant single columns, so the question was how the PostgREST
-- this stack runs (ghcr.io/supabase/postgrest:v16.2) behaves when a table
-- carries a column-level select grant for `authenticated` and no table-level
-- one. On a throwaway three-column table with two columns granted, as a
-- signed-in client:
--
--   works: `select=a,b`; an embedded resource that names its columns, in
--          either direction; a `security_invoker` view that names its columns;
--          `Prefer: count=exact` with a named column; insert, update, upsert
--          and delete with `return=minimal`, or with `return=representation`
--          and an explicit `select=`.
--   fails, 42501 for the whole request: `select=*`; no `select` at all;
--          an embed written `(*)`; a filter or an `order` on the ungranted
--          column; a `security_invoker` view written with a star; insert or
--          update with `return=representation` and no `select=`.
--
-- So a column-level grant is safe for a table every reader already names
-- its columns on, and loud (not silent) when something does not.
--
-- THE TWO TOOLS, AND WHICH ONE EACH HOLE GETS
-- The notes, which have a natural home of their own, move to two tables:
-- `application_internal_notes` and `delegation_internal_notes`, read by
-- `read_applications` and written by `decide_applications`. The three columns
-- that cannot move -- `applications.decided_by`, which `accept_application`,
-- `move_delegate`, `swap_delegates` and the bulk decisions all write, and the
-- two `profiles` columns, which `is_platform_admin()` and
-- `is_platform_admin_account()` read -- are hidden with a column-level grant
-- instead, and given back to the people entitled to them through two small
-- `security_invoker = false` views, the way `staff_contact_details` gives
-- organisers the private details. `delegations` keeps its table-level grant:
-- its retired note column is always null (see below), and other views over
-- it are being written in the same review round.
--
-- That grant comes with one rule for everybody who adds a column later: a new
-- column on `applications` or `profiles` is invisible to the app until a
-- migration grants it to `authenticated`. The failure is loud (the whole query
-- is refused), and tests/db/applications-with-applicant-view.test.ts checks
-- the two lists against the table.
--
-- WHY THE OLD NOTE COLUMNS STAY, EMPTY
-- `guard_application_update` and `guard_delegation_update` compare
-- `new.internal_note` with `old.internal_note`, and a plpgsql trigger that
-- names a dropped column fails at run time on every update of the table.
-- Both guards are being rewritten in the same review round by other hands, so
-- this migration leaves the columns in place, copies every note across,
-- empties them, and puts a trigger on each that refuses any value from now
-- on. A later migration may drop them once neither guard names them.
-- `applications.internal_note` is also left out of the grant below, so it
-- cannot even be asked for.

-- -----------------------------------------------------------------------------
-- application_internal_notes
-- -----------------------------------------------------------------------------
-- One row per application the organisers have written about. `note` is null
-- once the box was emptied: the row stays, so "no note" reads one way whether
-- or not anybody ever wrote one, and the page has one shape to read.

create table public.application_internal_notes (
  application_id uuid primary key references public.applications (id) on delete cascade,
  note text,
  updated_at timestamptz not null default now()
);

comment on table public.application_internal_notes is
  'What the organisers wrote to each other about one application. Never shown to the applicant.';

create trigger application_internal_notes_set_updated_at
  before update on public.application_internal_notes
  for each row
  execute function public.set_updated_at();

alter table public.application_internal_notes enable row level security;

-- Supabase grants every new table to anon and authenticated. Nobody who is not
-- signed in has anything to do here.
revoke all on public.application_internal_notes from anon;

-- The set form of the permission check, one lookup per query, the lesson of
-- 20260923150000_rls_conference_lookups.sql. The application is looked up
-- under the reader's own policies on `applications`, the way the
-- `delegation_members` policy of 20261007150000 looks a delegation up.
create policy "Application readers can read the notes on applications"
  on public.application_internal_notes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.applications as application
      where application.id = application_internal_notes.application_id
        and application.conference_id in (
          select public.permitted_conference_ids('read_applications')
        )
    )
  );

-- The page writes with an upsert, which is an insert that becomes an update
-- when the row is there, so both policies are needed and both say the same.
-- There is no delete policy: an emptied note is a null note.
--
-- The application is looked up under the writer's own policies on
-- `applications`, which `read_applications` passes, so a role holding
-- `decide_applications` alone would be refused here. That is a role the app
-- never makes: `withIncludedPermissions` in $lib/permissions.ts adds
-- `read_applications` to every role that decides before the editor saves it,
-- so the database only ever has to look for the weaker permission, and the
-- review page that holds the note box is itself gated on `read_applications`.
create policy "Application deciders can write a note on an application"
  on public.application_internal_notes
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.applications as application
      where application.id = application_internal_notes.application_id
        and application.conference_id in (
          select public.permitted_conference_ids('decide_applications')
        )
    )
  );

create policy "Application deciders can change a note on an application"
  on public.application_internal_notes
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.applications as application
      where application.id = application_internal_notes.application_id
        and application.conference_id in (
          select public.permitted_conference_ids('decide_applications')
        )
    )
  )
  with check (
    exists (
      select 1
      from public.applications as application
      where application.id = application_internal_notes.application_id
        and application.conference_id in (
          select public.permitted_conference_ids('decide_applications')
        )
    )
  );


-- -----------------------------------------------------------------------------
-- delegation_internal_notes
-- -----------------------------------------------------------------------------
-- The same table for the other road into a conference, and the same policies.
-- The chair who lists the delegation's seats on the participants page reads
-- the delegation row through "Participant readers can read the delegations
-- they list" and nothing here, because that policy is about `delegations`.

create table public.delegation_internal_notes (
  delegation_id uuid primary key references public.delegations (id) on delete cascade,
  note text,
  updated_at timestamptz not null default now()
);

comment on table public.delegation_internal_notes is
  'What the organisers wrote to each other about one delegation. Never shown to its head or members.';

create trigger delegation_internal_notes_set_updated_at
  before update on public.delegation_internal_notes
  for each row
  execute function public.set_updated_at();

alter table public.delegation_internal_notes enable row level security;

revoke all on public.delegation_internal_notes from anon;

create policy "Application readers can read the notes on delegations"
  on public.delegation_internal_notes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.delegations as delegation
      where delegation.id = delegation_internal_notes.delegation_id
        and delegation.conference_id in (
          select public.permitted_conference_ids('read_applications')
        )
    )
  );

create policy "Application deciders can write a note on a delegation"
  on public.delegation_internal_notes
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.delegations as delegation
      where delegation.id = delegation_internal_notes.delegation_id
        and delegation.conference_id in (
          select public.permitted_conference_ids('decide_applications')
        )
    )
  );

create policy "Application deciders can change a note on a delegation"
  on public.delegation_internal_notes
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.delegations as delegation
      where delegation.id = delegation_internal_notes.delegation_id
        and delegation.conference_id in (
          select public.permitted_conference_ids('decide_applications')
        )
    )
  )
  with check (
    exists (
      select 1
      from public.delegations as delegation
      where delegation.id = delegation_internal_notes.delegation_id
        and delegation.conference_id in (
          select public.permitted_conference_ids('decide_applications')
        )
    )
  );


-- -----------------------------------------------------------------------------
-- The notes move house, and the old columns are retired
-- -----------------------------------------------------------------------------

insert into public.application_internal_notes (application_id, note)
select application.id, application.internal_note
from public.applications as application
where application.internal_note is not null;

insert into public.delegation_internal_notes (delegation_id, note)
select delegation.id, delegation.internal_note
from public.delegations as delegation
where delegation.internal_note is not null;

-- Emptying the old columns is housekeeping, not an event: nobody decided
-- anything, and `validate_application` has no business re-checking a row
-- against rules the conference may have tightened since it was written. The
-- row triggers are stood down for exactly these two statements.
alter table public.applications disable trigger user;
update public.applications set internal_note = null where internal_note is not null;
alter table public.applications enable trigger user;

alter table public.delegations disable trigger user;
update public.delegations set internal_note = null where internal_note is not null;
alter table public.delegations enable trigger user;

-- From now on the old column takes no value from anybody, the server
-- included: a note put back there would be readable by whoever reads the
-- row, which is the hole this migration closes. The table the note belongs
-- in is named in the message, so a page that still writes the old way is
-- told where to go.
create or replace function public.retire_internal_note_column()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.internal_note is not null then
    raise exception '%.internal_note is retired: the note lives in its own table now', tg_table_name;
  end if;

  return new;
end;
$$;

revoke execute on function public.retire_internal_note_column() from public, anon, authenticated;

create trigger applications_retire_internal_note
  before insert or update on public.applications
  for each row
  execute function public.retire_internal_note_column();

create trigger delegations_retire_internal_note
  before insert or update on public.delegations
  for each row
  execute function public.retire_internal_note_column();


-- -----------------------------------------------------------------------------
-- applications: every column but internal_note and decided_by
-- -----------------------------------------------------------------------------
-- `anon` keeps its table-level grant: no policy on `applications` admits a
-- visitor, so they read nothing either way, and a 42501 in place of an empty
-- list would be a new way for a public page to fail.

revoke select on public.applications from authenticated;

grant select (
  id, conference_id, user_id, status, committee_preferences, seat_preferences,
  motivation, answers, submitted_at, decided_at, decision_note, created_at,
  updated_at, team_id
) on public.applications to authenticated;

-- applications_with_applicant was written `select application.*`, and a
-- security_invoker view is checked column by column against whoever is
-- reading, so one ungranted column under the star would refuse the whole view.
-- It is made again naming the granted columns, otherwise exactly as
-- 20261010120000_application_teams.sql left it. `create or replace view`
-- cannot take columns away, so it is dropped first.
drop view public.applications_with_applicant;

create view public.applications_with_applicant
with (security_invoker = true) as
select
  application.id,
  application.conference_id,
  application.user_id,
  application.status,
  application.committee_preferences,
  application.seat_preferences,
  application.motivation,
  application.answers,
  application.submitted_at,
  application.decided_at,
  application.decision_note,
  application.created_at,
  application.updated_at,
  application.team_id,
  applicant.full_name as applicant_name,
  applicant.avatar_path as applicant_avatar_path,
  applicant.institution_name as applicant_institution_name,
  applicant.country_code as applicant_country_code,
  applicant.experience_level as applicant_experience_level
from public.applications as application
left join public.profiles as applicant
  on applicant.id = application.user_id;

grant select on public.applications_with_applicant to authenticated;

-- Who decided an application, for the people who read applications. Built the
-- way `staff_contact_details` is: the view reads the table as its owner and
-- its own `where` is the rule. `security_barrier` keeps a reader's own
-- conditions from running on rows the `where` has not yet let through.
create view public.staff_application_deciders
with (security_invoker = false, security_barrier = true) as
select
  application.id as application_id,
  application.decided_by
from public.applications as application
where application.decided_by is not null
  and application.conference_id in (select public.permitted_conference_ids('read_applications'));

revoke all on public.staff_application_deciders from public, anon, authenticated;
grant select on public.staff_application_deciders to authenticated;


-- -----------------------------------------------------------------------------
-- profiles: every column but is_platform_admin and onboarding_completed_at
-- -----------------------------------------------------------------------------
-- The helpers that read the admin flag (`is_platform_admin`,
-- `is_platform_admin_account`) run as their owner and are untouched. The
-- `profiles_protect_flags` trigger compares `new` with `old` and reads
-- nothing. Every view and function that joins `profiles` for a name asks for
-- `full_name`, which stays granted.

revoke select on public.profiles from authenticated;

grant select (
  id, full_name, avatar_path, institution_name, country_code, experience_level,
  pronouns, bio, created_at, updated_at
) on public.profiles to authenticated;

-- A person's own two columns, which the onboarding gate on every signed-in
-- page reads, and nobody else's.
create view public.my_profile_state
with (security_invoker = false, security_barrier = true) as
select
  profile.id,
  profile.is_platform_admin,
  profile.onboarding_completed_at
from public.profiles as profile
where profile.id = (select auth.uid());

revoke all on public.my_profile_state from public, anon, authenticated;
grant select on public.my_profile_state to authenticated;


-- -----------------------------------------------------------------------------
-- awards: the public reads a view with display fields only
-- -----------------------------------------------------------------------------
-- "Anyone signed in can read a published, confirmed award" handed the whole
-- row to every signed-in account, and `user_id` on a published award says
-- who sat in which seat, the very thing `public_seats` exists to hide. The
-- policy goes; proposers and confirmers keep reading the table through
-- "Proposers and confirmers can read a committee's awards", and everybody
-- else reads this view. It asks what the old policy asked (confirmed, and the
-- conference's publish moment has arrived) and adds the seat's name and flag
-- and the holder's name, which the public committee page used to look up
-- itself. `is_mine` is what /profile filters on in place of `user_id`.

drop policy "Anyone signed in can read a published, confirmed award" on public.awards;

create view public.published_awards
with (security_invoker = false, security_barrier = true) as
select
  award.id,
  award.committee_id,
  award.kind,
  award.title,
  seat.name as seat_name,
  seat.country_code as seat_country_code,
  holder.full_name as holder_name,
  coalesce(award.user_id = (select auth.uid()), false) as is_mine
from public.awards as award
join public.committees as committee on committee.id = award.committee_id
join public.conferences as conference on conference.id = committee.conference_id
join public.seats as seat on seat.id = award.seat_id
left join public.profiles as holder on holder.id = award.user_id
where award.status = 'confirmed'
  and conference.awards_published_at is not null
  and conference.awards_published_at <= now();

-- The old policy was granted to `authenticated` only, and so is this. Public
-- profiles, which would change that, are Phase 2.
revoke all on public.published_awards from public, anon, authenticated;
grant select on public.published_awards to authenticated;
