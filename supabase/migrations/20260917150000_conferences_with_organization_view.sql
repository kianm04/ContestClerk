-- =============================================================================
-- Migration 0005: the conferences_with_organization view
-- =============================================================================
--
-- WHAT THIS IS
-- Task T12 in specs/07-delivery/tasks.md. The conference directory at
-- /conferences lets a visitor search over a conference's name, its city and the
-- name of the organisation running it, which is the second acceptance criterion
-- on specs/05-pages/public/conferences.md.
--
-- WHY A VIEW AND NOT A JOIN IN THE QUERY
-- The organisation's name lives in another table, and PostgREST cannot put an
-- embedded table's column inside a top-level "or", which is what a search over
-- three columns at once needs. The first version of this search worked around
-- that by asking the organizations table for the ids whose name matched and then
-- writing "organization_id.in.(...)" into the filter. That breaks: a word many
-- organisations share ("MUN", "School", "University" are the obvious ones) puts
-- hundreds of uuids into the query string, the address grows past what the
-- server accepts, and the page answers with an error instead of results.
--
-- A view puts organization_name beside name and city as an ordinary column, so
-- the search is one "or" over three columns of one relation, in one request,
-- with nothing of unbounded length in the address.
--
-- "security_invoker = true" means the view reads the two tables as whoever is
-- asking, so the row level security already on conferences and organizations
-- decides what comes back: a visitor sees published and archived conferences,
-- and the staff of a conference also see their own drafts. That is the opposite
-- choice from public_seats, which is "security_invoker = false" because it
-- exists to hide a column from the people who may read the row. This view hides
-- nothing; it only saves a join.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- conferences_with_organization
-- -----------------------------------------------------------------------------
-- Every column of conferences, plus the name and the slug of the organisation
-- running it. "conference.*" rather than a list of columns on purpose: a column
-- added to conferences later should appear here without a migration to remember.
--
-- The join is an inner join and not a left join because conferences.organization_id
-- is "not null" and references organizations, so every conference has exactly one.

create view public.conferences_with_organization
with (security_invoker = true) as
select
  conference.*,
  organization.name as organization_name,
  organization.slug as organization_slug
from public.conferences as conference
join public.organizations as organization
  on organization.id = conference.organization_id;

-- A view does not inherit the grants of the tables under it, so it needs its own.
-- Row level security still applies underneath, because of security_invoker above.
grant select on public.conferences_with_organization to anon, authenticated;
