-- =============================================================================
-- join_delegation: the conference gate, and one message per refusal
-- =============================================================================
-- specs/05-pages/delegation/join.md lists seven refusals and says the acceptance
-- criterion for them plainly: "Every row of the refusal table produces its
-- message, enforced by the database function, not only the page." Two rows of
-- that table were not enforced here, and one more could not be worded.
--
-- 1. "conference archived or ended" was checked only by canJoinDelegation in
--    src/lib/delegations.ts, which runs while the page is drawn. The action
--    calls join_delegation straight, on purpose, so that the database is the
--    guard -- and the database never asked. A POST to /join/<code> for a
--    delegation at a conference that finished last year added the membership.
--
-- 2. "delegation rejected" and "delegation withdrawn" are two rows with two
--    sentences, and the old function raised one message for both, so the server
--    had nothing to tell them apart by and answered both with a third sentence
--    the spec does not quote. They are now two raises.
--
-- 3. preview_delegation gains conference_status, without which the page cannot
--    see "archived" at all: an archived conference whose end date has not
--    passed yet looked joinable, and the visitor would have been offered a
--    button that the check below now refuses. join.md's own list of what the
--    preview returns did not include the status, which is the contradiction
--    between its Data section and its refusal table; the refusal table wins,
--    because a button that cannot work is worse than a fact given away, and the
--    status is printed on the conference's public page in any case.
--
-- The one-road rule is untouched: check_one_route_per_conference still raises
-- its own two messages on the insert, and this function still leaves that to it.

create or replace function public.join_delegation(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  delegation public.delegations;
  conference public.conferences;
begin
  if me is null then
    raise exception 'You have to be signed in to join a delegation';
  end if;

  select *
  into delegation
  from public.delegations as delegation_row
  where delegation_row.join_code = join_delegation.code;

  if delegation.id is null then
    raise exception 'That join code does not belong to a delegation';
  end if;

  -- The questions below are asked in the same order as canJoinDelegation asks
  -- them in src/lib/delegations.ts, so that the page and the database never
  -- name two different reasons for the same press. "Already in this one" is
  -- first there because the page redirects on it rather than drawing it.
  if exists (
    select 1
    from public.delegation_members as membership
    where membership.delegation_id = delegation.id
      and membership.user_id = me
  ) then
    raise exception 'You are already in this delegation';
  end if;

  -- One raise per row of the refusal table, so that the server can tell which
  -- row it was without reading the delegation a second time.
  if delegation.status = 'rejected' then
    raise exception 'That delegation was not accepted';
  end if;

  if delegation.status = 'withdrawn' then
    raise exception 'That delegation withdrew its request';
  end if;

  select *
  into conference
  from public.conferences as conference_row
  where conference_row.id = delegation.conference_id;

  -- "archived or ended", the two halves of one row of the table. end_date is a
  -- date and not a timestamp, so a conference is over the day after its last
  -- day, which is what makes joining on the closing day still work.
  if conference.status = 'archived' or conference.end_date < current_date then
    raise exception 'That conference has already taken place';
  end if;

  -- The one-road rule is the check_one_route_per_conference trigger's job, and
  -- it raises its own message on the insert below.
  insert into public.delegation_members (delegation_id, user_id, role)
  values (delegation.id, me, 'member');

  return delegation.id;
end;
$$;

revoke execute on function public.join_delegation(text) from public, anon;
grant execute on function public.join_delegation(text) to authenticated;

-- -----------------------------------------------------------------------------
-- preview_delegation, with the conference status on it
-- -----------------------------------------------------------------------------
-- Postgres cannot change the shape of a "returns table" function with
-- create or replace, so the old one is dropped first, exactly as migration
-- 20260920140000 had to. Everything else about it is unchanged, including the
-- grants: authenticated only, because the code is what earns the preview and a
-- signed-out visitor is sent to register before they ever get here.

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
  conference_status public.conference_status,
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
    conference.status as conference_status,
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
