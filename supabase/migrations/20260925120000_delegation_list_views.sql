-- =============================================================================
-- Migration 0021: the delegations_with_heads and delegation_status_totals views
-- =============================================================================
--
-- WHAT THIS IS
-- Task T74 in specs/07-delivery/tasks.md. The organiser's delegations table at
-- /manage/[slug]/delegations searches by the delegation's name, its
-- institution *and the names of its heads*, and the heads' names are not a
-- column of delegations. delegation_members.user_id points at auth.users rather
-- than at profiles, and PostgREST can only bring along a table that a foreign
-- key of the one being read actually names, so the first version of that page
-- read every delegation in a status, looked the heads up in a second query, and
-- then searched, sorted and paged them in TypeScript.
--
-- supabase/config.toml sets max_rows = 1000, so "every delegation in a status"
-- was never every delegation: a conference with more than a thousand of them
-- under review saw a thousand, in the table, in the tab counts and in the
-- sentence under the heading, with nothing on the page saying the answer was
-- short.
--
-- This is the same problem T72 had with the applications table, and it gets
-- the same answer (migration 0015, applications_with_applicant): a view that
-- puts what the search needs beside the row, so one request can ask for "this
-- conference, this status, a name, a school or a head containing this text,
-- this country, in this order, rows 25 to 49" and the database answers with
-- that page and with how many rows matched altogether.
--
-- The tabs and the sentence under the heading need a second thing the
-- applications page did not: the number of seats every delegation asked for,
-- added up. A count can be asked for without reading any rows, but a sum
-- cannot, so the second view below does the adding up in the database.
--
-- Both views are "security_invoker = true": they read the tables under them as
-- whoever is asking, so the row level security already on delegations,
-- delegation_members and profiles decides what comes back. Neither adds a rule
-- or a permission of its own.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- delegations_with_heads
-- -----------------------------------------------------------------------------
-- The columns of delegations the organiser's table reads, plus the names of the
-- delegation's heads, twice over:
--
--   * head_names is a list, oldest membership first, so the head who
--     registered the group is named first. A head whose profile cannot be read
--     is a null in the list rather than missing from it, and the page writes
--     "Deleted account" there.
--   * head_names_text is the same names as one piece of text, one name per
--     line. It exists only to be searched: PostgREST's "ilike" works on text
--     and not on a list. The search box can never send a line break (see
--     toSafeSearchText in src/lib/server/search-text.ts), so a search cannot
--     match across the end of one name and the start of the next.
--
-- The columns are named one by one rather than with "delegation.*". The table
-- needs these eight, and a star would also hand join_code and internal_note to
-- whatever reads the view; a column added to delegations later then needs a
-- migration here only if the table is meant to show it.
--
-- The heads are gathered by a "left join lateral": for each delegation, the
-- subquery on the right runs once with that delegation's id, and always
-- answers with exactly one row, so a delegation with no readable heads keeps
-- its row, with an empty list. The profiles join inside it is a left join for
-- the same reason applications_with_applicant's is.
--
-- The members, the seats and the invoices are not in the view. PostgREST can
-- still bring them along, the way it does for delegations itself, because it
-- sees that the view's id is delegations.id and delegation_members, seats and
-- invoices each have a delegation_id foreign key naming that.

create view public.delegations_with_heads
with (security_invoker = true) as
select
  delegation.id,
  delegation.conference_id,
  delegation.name,
  delegation.institution_name,
  delegation.country_code,
  delegation.status,
  delegation.requested_seats,
  delegation.submitted_at,
  coalesce(heads.head_names, '{}') as head_names,
  coalesce(heads.head_names_text, '') as head_names_text
from public.delegations as delegation
left join lateral (
  select
    array_agg(profile.full_name order by member.joined_at, member.user_id) as head_names,
    string_agg(profile.full_name, E'\n' order by member.joined_at, member.user_id)
      as head_names_text
  from public.delegation_members as member
  left join public.profiles as profile
    on profile.id = member.user_id
  where member.delegation_id = delegation.id
    and member.role = 'head'
) as heads on true;

-- A view does not inherit the grants of the tables under it, so it needs its
-- own. Nothing is granted to anon: nobody who is not signed in may read a
-- delegation, and the delegations policies say so anyway.
grant select on public.delegations_with_heads to authenticated;


-- -----------------------------------------------------------------------------
-- delegation_status_totals
-- -----------------------------------------------------------------------------
-- One row per conference and status: how many delegations are in it, and how
-- many seats they asked for between them. The tab strip reads the first number
-- and the sentence under the heading ("9 requests · 214 seats requested") adds
-- up the second over the four statuses it shows.
--
-- A grouped view rather than reading every delegation's status and seats and
-- adding them up in TypeScript, which is what max_rows cut short, and rather
-- than one counting query per tab the way the applications tabs are counted,
-- because a count can be asked for without rows and a sum cannot.
--
-- The filter on conference_id that the page puts on this view is applied
-- before the grouping, because conference_id is one of the columns grouped by,
-- so only that conference's delegations are ever read. Row level security
-- still applies to each of them first, so an organiser adds up their own
-- conference's delegations and a head adds up nothing but their own.
--
-- Drafts are counted here like every other status. The page asks for the four
-- statuses it shows and leaves draft out itself, the way every organiser query
-- in src/lib/server/delegations.ts does.

create view public.delegation_status_totals
with (security_invoker = true) as
select
  delegation.conference_id,
  delegation.status,
  -- count and sum both answer bigint in Postgres. requested_seats is at most
  -- 200 by its check constraint, so no conference will outgrow an integer, and
  -- integer is what reaches TypeScript as a plain number.
  count(*)::integer as delegation_count,
  sum(delegation.requested_seats)::integer as requested_seats
from public.delegations as delegation
group by delegation.conference_id, delegation.status;

grant select on public.delegation_status_totals to authenticated;
