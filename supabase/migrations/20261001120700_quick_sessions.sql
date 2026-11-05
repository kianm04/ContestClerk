-- =============================================================================
-- Quick sessions (S14, D7)
-- =============================================================================
-- Contract: specs/02-architecture/data-model.md ("organizations",
-- "conferences", "Quick sessions", "Functions and triggers", "Views"),
-- specs/02-architecture/permissions.md ("Quick sessions") and
-- specs/05-pages/chair/quick-session.md.
--
-- A quick session is one committee run without a conference around it: a
-- school club's practice night, a chair rehearsing. It is stored as a
-- conference with kind = 'quick_session', so the whole chair console, its
-- access rules and every committee query work on it unchanged; a committee with
-- no conference would have touched every one of them. This migration:
--
--   * adds conferences.kind, and lets a quick session have no city or country
--     (conferences_place_unless_quick_session) while keeping it a draft for
--     ever (conferences_quick_session_is_draft), which is what keeps it out of
--     every public list;
--   * adds organizations.is_personal, for the one organisation that holds a
--     person's quick sessions;
--   * adds create_quick_session, which makes all of it in one transaction and
--     starts its first session;
--   * adds move_quick_session_end_date, so a quick session kept for another
--     evening is never a conference in the past;
--   * makes conferences_with_organization again, so it carries kind;
--   * teaches delete_my_account to take a person's quick sessions with them.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- =============================================================================
-- conferences.kind and the two checks keyed on it
-- =============================================================================

create type public.conference_kind as enum ('conference', 'quick_session');

alter table public.conferences
  add column kind public.conference_kind not null default 'conference';

comment on column public.conferences.kind is
  'quick_session for a quick session made by create_quick_session; conference for everything else. No page changes it.';

-- A quick session happens nowhere in particular. Every other conference still
-- needs a place, which used to be the two "not null"s this replaces.
alter table public.conferences
  alter column city drop not null,
  alter column country_code drop not null;

alter table public.conferences
  add constraint conferences_place_unless_quick_session check (
    kind = 'quick_session' or (city is not null and country_code is not null)
  ),
  -- A quick session is never published. The directory, the landing page's
  -- count, the public conference and committee pages and public_seats all
  -- show published and archived conferences only, so this one check keeps a
  -- quick session out of every one of them, by the same rules that hide every
  -- draft.
  add constraint conferences_quick_session_is_draft check (
    kind = 'conference' or status = 'draft'
  );


-- =============================================================================
-- organizations.is_personal
-- =============================================================================
-- The organisation create_quick_session makes for a person's quick sessions.
-- Organisations are readable by visitors and a person's name is not, so it is
-- called "Quick sessions", never after its owner. Its owner is the person,
-- through add_organization_creator_as_owner like any other organisation. The
-- pages leave it out of everything an organisation shows up in.
--
-- No page sets the flag. A browser that sets it on an organisation of its own
-- gains nothing: it only hides that organisation from its own members, and
-- delete_my_account below only ever deletes quick sessions out of it.

alter table public.organizations
  add column is_personal boolean not null default false;

comment on column public.organizations.is_personal is
  'True for the one organisation create_quick_session makes to hold a person''s quick sessions.';

-- At most one personal organisation per person, which is also how
-- create_quick_session finds it again.
create unique index organizations_one_personal_per_creator
  on public.organizations (created_by)
  where is_personal;


-- =============================================================================
-- conferences_with_organization, made again
-- =============================================================================
-- The view expanded "conference.*" into a fixed list of columns when it was
-- made (20260917150000), so kind is not in it until it is made again. The
-- organiser's lists filter quick sessions out by it. "create or replace" cannot
-- add a column in the middle of a view, so it is dropped and created; nothing
-- else depends on it. Everything else is as before: security_invoker = true,
-- so the conferences and organizations policies decide what comes back, and
-- its own grant.

drop view public.conferences_with_organization;

create view public.conferences_with_organization
with (security_invoker = true) as
select
  conference.*,
  organization.name as organization_name,
  organization.slug as organization_slug
from public.conferences as conference
join public.organizations as organization
  on organization.id = conference.organization_id;

grant select on public.conferences_with_organization to anon, authenticated;


-- =============================================================================
-- create_quick_session(committee_name, committee_slug, topic,
--                      speaking_time_seconds, seats, timezone)
-- =============================================================================
-- "Start session" on /quick/new. In one transaction it makes, in order:
--
--   1. the caller's personal organisation, on their first quick session only;
--   2. a draft conference of kind 'quick_session' in it, named after the
--      committee, its slug "quick-" and ten random lowercase letters and
--      digits, its first and last day today in the browser's timezone, no city
--      or country, and no applications;
--   3. one committee, whose one topic is the typed agenda (none when nothing was
--      typed), with the speaking time as its default;
--   4. its seats, from a JSON array of { "name": ..., "country_code": ... } in
--      the order the setup screen lists them: with a country code a 'country'
--      seat, without one an 'other' seat ("Amnesty International");
--   5. the caller's committee_chairs row, titled "Chair", from which
--      ensure_chair_is_staff writes their conference_staff chair row;
--   6. the agenda set to the typed topic, when there is one;
--   7. "Session 1", through start_committee_session.
--
-- It is NOT security definer. Every row it writes is one the caller may already
-- write through the policies /create and the committee editor use: an
-- organisation of their own, a conference in it, then, as its organiser, the
-- committee, its seats, its chair and its room. Row Level Security checks each
-- one. It is a function only so that the press is one transaction.
--
-- WHY IT RETURNS A TYPE RATHER THAN "returns table"
-- The data model has it answer (conference_slug, committee_slug), which
-- chairRoomUrl turns into the chair room's address. A "returns table" column is
-- a parameter too, and PL/pgSQL refuses two parameters called committee_slug,
-- the one passed in and the one handed back. A row type with the same two
-- columns gives PostgREST exactly the same answer without the clash.

create type public.quick_session_address as (
  conference_slug text,
  committee_slug text
);

create or replace function public.create_quick_session(
  committee_name text,
  committee_slug text,
  topic text default null,
  speaking_time_seconds integer default 90,
  seats jsonb default '[]',
  timezone text default null
)
returns setof public.quick_session_address
language plpgsql
set search_path = ''
as $$
declare
  -- How many seats one quick session may have: PASTED_SEAT_LIMIT in
  -- src/lib/seat-lists.ts, the most the setup screen accepts.
  most_seats constant integer := 300;
  -- The characters a random slug is drawn from.
  slug_alphabet constant text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  -- How many times a random slug that clashes is drawn again before giving up.
  -- With 36^10 slugs a second clash means something else is wrong.
  most_slug_attempts constant integer := 5;

  me uuid := (select auth.uid());
  trimmed_name text := btrim(coalesce(create_quick_session.committee_name, ''));
  typed_topic text := nullif(btrim(create_quick_session.topic), '');
  -- 'Europe/Amsterdam' is the conferences.timezone column's own default, used
  -- when the form sent no timezone, as it does without JavaScript.
  zone text := coalesce(nullif(btrim(create_quick_session.timezone), ''), 'Europe/Amsterdam');
  seat_count integer;
  today date;
  attempts integer := 0;
  personal_organization_id uuid;
  new_conference_id uuid;
  new_conference_slug text;
  new_committee_id uuid;
begin
  if me is null then
    raise exception 'Sign in to start a quick session.'
      using errcode = '42501';
  end if;

  if trimmed_name = '' or btrim(coalesce(create_quick_session.committee_slug, '')) = '' then
    raise exception 'Please enter the committee''s name.';
  end if;

  seat_count := case
    when jsonb_typeof(create_quick_session.seats) = 'array'
      then jsonb_array_length(create_quick_session.seats)
    else 0
  end;

  if seat_count < 2 then
    raise exception 'A quick session needs at least two delegations.';
  end if;

  if seat_count > most_seats then
    raise exception 'A quick session holds at most 300 delegations.';
  end if;

  -- An element that is not an object has no name either, so it is refused
  -- here too.
  if exists (
    select 1
    from jsonb_array_elements(create_quick_session.seats) as member (value)
    where nullif(btrim(member.value ->> 'name'), '') is null
  ) then
    raise exception 'Every delegation needs a name.';
  end if;

  if coalesce(create_quick_session.speaking_time_seconds, 0) <= 0 then
    raise exception 'The speaking time must be a positive number of seconds.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names as known_zone
    where known_zone.name = zone
  ) then
    raise exception 'That is not a timezone the database knows.';
  end if;

  today := (now() at time zone zone)::date;

  -- 1. The personal organisation: found again by the unique index, or made.
  -- "on conflict ... do nothing" covers the same person starting two quick
  -- sessions at the same moment in two tabs: the second finds the first's.
  -- A clash of the random slug is the only other way the insert can fail,
  -- and it draws again.
  select organization.id
  into personal_organization_id
  from public.organizations as organization
  where organization.created_by = me
    and organization.is_personal;

  while personal_organization_id is null loop
    attempts := attempts + 1;

    begin
      insert into public.organizations as organization (name, slug, created_by, is_personal)
      values (
        'Quick sessions',
        'personal-' || (
          select string_agg(substr(slug_alphabet, 1 + floor(random() * 36)::integer, 1), '')
          from generate_series(1, 10)
        ),
        me,
        true
      )
      on conflict (created_by) where is_personal do nothing
      returning organization.id into personal_organization_id;

      if personal_organization_id is null then
        select organization.id
        into personal_organization_id
        from public.organizations as organization
        where organization.created_by = me
          and organization.is_personal;
      end if;
    exception when unique_violation then
      if attempts >= most_slug_attempts then
        raise;
      end if;
    end;
  end loop;

  -- 2. The conference. A random slug that clashes is drawn again; slugs are
  -- the one unique column a new conference can collide on.
  attempts := 0;

  loop
    attempts := attempts + 1;

    begin
      insert into public.conferences as conference (
        organization_id,
        slug,
        name,
        kind,
        timezone,
        start_date,
        end_date,
        accepts_individual_applications,
        accepts_delegations,
        position_paper_required,
        committee_preference_count,
        created_by
      )
      values (
        personal_organization_id,
        'quick-' || (
          select string_agg(substr(slug_alphabet, 1 + floor(random() * 36)::integer, 1), '')
          from generate_series(1, 10)
        ),
        trimmed_name,
        'quick_session',
        zone,
        today,
        today,
        false,
        false,
        false,
        0,
        me
      )
      returning conference.id, conference.slug into new_conference_id, new_conference_slug;

      exit;
    exception when unique_violation then
      if attempts >= most_slug_attempts then
        raise;
      end if;
    end;
  end loop;

  -- 3. The committee. create_committee_state gives it its state row.
  insert into public.committees as committee (
    conference_id, name, slug, topics, default_speaking_time_seconds
  )
  values (
    new_conference_id,
    trimmed_name,
    btrim(create_quick_session.committee_slug),
    case when typed_topic is null then '{}'::text[] else array[typed_topic] end,
    create_quick_session.speaking_time_seconds
  )
  returning committee.id into new_committee_id;

  -- 4. The seats, positions counted from 0 in the order given, as the
  -- committee editor counts them. A name given twice is refused by
  -- unique (committee_id, name).
  insert into public.seats (committee_id, name, kind, country_code, position)
  select
    new_committee_id,
    btrim(member.value ->> 'name'),
    case
      when nullif(btrim(member.value ->> 'country_code'), '') is null then 'other'
      else 'country'
    end::public.seat_kind,
    upper(nullif(btrim(member.value ->> 'country_code'), '')),
    (member.ordinality - 1)::integer
  from jsonb_array_elements(create_quick_session.seats) with ordinality as member (value, ordinality);

  -- 5. The caller chairs it, and ensure_chair_is_staff puts them on the team.
  insert into public.committee_chairs (committee_id, user_id, title)
  values (new_committee_id, me, 'Chair');

  -- 6. The agenda, which check_committee_agenda_topic accepts because it is
  -- now the committee's one topic.
  if typed_topic is not null then
    update public.committee_state as state
    set agenda_topic = typed_topic
    where state.committee_id = new_committee_id;
  end if;

  -- 7. The first session.
  perform public.start_committee_session(new_committee_id, 'Session 1', now());

  return query select new_conference_slug, btrim(create_quick_session.committee_slug);
end;
$$;

revoke execute on function public.create_quick_session(text, text, text, integer, jsonb, text)
  from public, anon;
grant execute on function public.create_quick_session(text, text, text, integer, jsonb, text)
  to authenticated;


-- =============================================================================
-- move_quick_session_end_date()
-- =============================================================================
-- A quick session's first and last day are the day it was made. A session
-- started on a later day moves the last day forward to that day, in the
-- conference's own timezone, so a quick session kept for another evening is
-- never a conference in the past.
--
-- A trigger rather than a step of start_committee_session, and "security
-- definer", because a co-chair of a quick session who is not its organiser may
-- start a session but may not edit the conference. It writes one column of one
-- row, and only ever moves the date forward.

create or replace function public.move_quick_session_end_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.started_at is null then
    return new;
  end if;

  update public.conferences as conference
  set end_date = (new.started_at at time zone conference.timezone)::date
  from public.committees as committee
  where committee.id = new.committee_id
    and conference.id = committee.conference_id
    and conference.kind = 'quick_session'
    and conference.end_date < (new.started_at at time zone conference.timezone)::date;

  return new;
end;
$$;

revoke execute on function public.move_quick_session_end_date() from public, anon, authenticated;

create trigger committee_sessions_move_quick_session_end_date
  after insert or update of started_at on public.committee_sessions
  for each row
  execute function public.move_quick_session_end_date();


-- =============================================================================
-- delete_my_account(), with the person's quick sessions
-- =============================================================================
-- The same function as in 20260915130000, with one step before the rest: the
-- caller's quick sessions are deleted with their personal organisation.
-- Without it the sole owner of "Quick sessions" would be told to hand over an
-- organisation nobody else can use before they may leave.
--
-- The conferences go first, because conferences.organization_id restricts the
-- delete of an organisation that still has one. Only quick sessions are
-- deleted, and the organisation only once it is empty: a person who set the
-- flag on a real organisation of theirs keeps its conferences, and is asked to
-- hand it over as before.

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

  delete from public.conferences as conference
  using public.organizations as organization
  where organization.id = conference.organization_id
    and organization.created_by = me
    and organization.is_personal
    and conference.kind = 'quick_session';

  delete from public.organizations as organization
  where organization.created_by = me
    and organization.is_personal
    and not exists (
      select 1
      from public.conferences as conference
      where conference.organization_id = organization.id
    );

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
