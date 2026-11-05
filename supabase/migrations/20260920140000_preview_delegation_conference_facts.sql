-- =============================================================================
-- preview_delegation: the four conference facts the join page draws
-- =============================================================================
-- specs/05-pages/delegation/join.md says preview_delegation(code) returns
-- "delegation id, name, institution_name, status, conference name, slug,
-- start_date, end_date, city, country_code, head names, member count". The
-- version migration 0006 wrote, before any page existed, stopped at the
-- conference's name and slug.
--
-- The card on /join/[joinCode] draws the rest of that list:
--
--     THIMUN The Hague 2027 · 24-29 Jan 2027
--     NL The Hague, Netherlands
--
-- and canJoinDelegation in src/lib/delegations.ts needs the end date to say
-- "{conference} has already taken place." Asking the conferences table for them
-- separately would not do: a delegation is registered while its conference is
-- published, but the person holding the join code is not a participant of it,
-- and nothing promises the conference is still readable to them by the time
-- they open the link. The code is what earns them this much, so the code is
-- what fetches it.
--
-- Nothing else changes. The four columns are facts printed on the conference's
-- own public page, so they give away nothing the delegation did not already.
--
-- Postgres cannot change the shape of a "returns table" function with
-- create or replace, so the old one is dropped first. It is the whole reason
-- this is a migration of its own rather than an edit, which is never allowed.

drop function if exists public.preview_delegation(text);

create or replace function public.preview_delegation(code text)
returns table (
  id uuid,
  name text,
  institution_name text,
  country_code char(2),
  status public.delegation_status,
  conference_name text,
  conference_slug text,
  conference_start_date date,
  conference_end_date date,
  conference_city text,
  conference_country_code char(2),
  head_names text[],
  member_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    delegation.id,
    delegation.name,
    delegation.institution_name,
    delegation.country_code,
    delegation.status,
    conference.name as conference_name,
    conference.slug as conference_slug,
    conference.start_date as conference_start_date,
    conference.end_date as conference_end_date,
    conference.city as conference_city,
    conference.country_code as conference_country_code,
    (
      select coalesce(array_agg(profile.full_name order by profile.full_name), '{}')
      from public.delegation_members as head
      join public.profiles as profile on profile.id = head.user_id
      where head.delegation_id = delegation.id
        and head.role = 'head'
    ) as head_names,
    (
      select count(*)::integer
      from public.delegation_members as membership
      where membership.delegation_id = delegation.id
    ) as member_count
  from public.delegations as delegation
  join public.conferences as conference on conference.id = delegation.conference_id
  where delegation.join_code = preview_delegation.code;
$$;

revoke execute on function public.preview_delegation(text) from public, anon;
grant execute on function public.preview_delegation(text) to authenticated;
