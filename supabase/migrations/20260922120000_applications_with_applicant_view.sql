-- =============================================================================
-- Migration 0015: the applications_with_applicant view
-- =============================================================================
--
-- WHAT THIS IS
-- Task T72 in specs/07-delivery/tasks.md. The organiser's applications table at
-- /manage/[slug]/applications searches, filters and sorts by the *applicant*:
-- their name, their school and their country. Not one of those three is a
-- column of applications. applications.user_id points at auth.users rather than
-- at profiles, and PostgREST can only bring along a table that a foreign key of
-- the one being read actually names, so the first version of that page read
-- every application in a status, looked the profiles up in a second query, and
-- then searched, sorted and paged them in TypeScript.
--
-- That is what this view is here to end. supabase/config.toml sets
-- max_rows = 1000, so "every application in a status" was never every
-- application: a conference with more than a thousand applications under review
-- saw a thousand of them, in the table, in the tab counts and in the CSV
-- export, with nothing on the page saying that the answer was short.
--
-- A view puts the applicant's name, school and country beside the application's
-- own columns, so one request can ask for "this conference, this status, a name
-- or a school containing this text, this country, in this order, rows 25 to 49"
-- and the database answers with that page and with how many rows matched
-- altogether. Nothing is read that is not shown.
--
-- WHY A VIEW AND NOT A COLUMN ON applications
-- The other way to make the applicant's name sortable from the applications
-- table is to copy it onto every application row and keep the copy up to date
-- with a trigger on profiles. That is one more thing that can silently go
-- wrong: a name changed while the trigger was broken would leave the table
-- sorting by something nobody can see. A view has one copy of the truth.
--
-- "security_invoker = true" means the view reads the two tables as whoever is
-- asking, so the row level security already on applications and profiles
-- decides what comes back: an organiser of the conference sees its
-- applications, the applicant sees their own, and nobody else sees any. That is
-- the same choice conferences_with_organization made, and the opposite of
-- public_seats, which is "security_invoker = false" because it exists to hide a
-- column from the people who may read the row. This view hides nothing; it only
-- saves a join.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- applications_with_applicant
-- -----------------------------------------------------------------------------
-- Every column of applications, plus the five things about the applicant that
-- the organiser's table and its CSV show: the name, the avatar, the school, the
-- country and how much MUN they have done.
--
-- "application.*" rather than a list of columns because the table and the CSV
-- between them read nearly all of them, and each caller names the ones it wants
-- in its own select. Postgres expands the star once, when the view is made, so
-- a column added to applications later needs a migration here as well.
--
-- The join is a left join and not an inner one. Every account gets a profiles
-- row from the handle_new_user trigger, so in practice there is always one to
-- find; the left join is what makes an application whose profile somehow cannot
-- be read stay a row the organiser can see and decide on, with no name on it,
-- rather than disappear from the table. specs/05-pages/organiser/applications.md
-- asks for exactly that under "Edge cases", and the page writes "Deleted
-- account" where the name would be.
--
-- The applicant columns are prefixed so that nothing here can ever collide with
-- a column of applications, the way conferences_with_organization prefixes the
-- organisation's.

create view public.applications_with_applicant
with (security_invoker = true) as
select
  application.*,
  applicant.full_name as applicant_name,
  applicant.avatar_path as applicant_avatar_path,
  applicant.institution_name as applicant_institution_name,
  applicant.country_code as applicant_country_code,
  applicant.experience_level as applicant_experience_level
from public.applications as application
left join public.profiles as applicant
  on applicant.id = application.user_id;

-- A view does not inherit the grants of the tables under it, so it needs its
-- own. Row level security still applies underneath, because of security_invoker
-- above. Nothing is granted to anon: an application is never readable by
-- somebody who is not signed in, and the applications policies say so anyway.
grant select on public.applications_with_applicant to authenticated;
