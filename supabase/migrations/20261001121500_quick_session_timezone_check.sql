-- =============================================================================
-- create_quick_session checks the timezone without reading every zone
-- =============================================================================
-- Contract: specs/02-architecture/data-model.md ("Quick sessions") and
-- specs/05-pages/chair/quick-session.md.
--
-- 20261001120700 refused an unknown timezone by looking it up in
-- pg_catalog.pg_timezone_names. That view reads and parses every one of the
-- six hundred or so zone files on the server each time it is asked, about
-- 45 ms even on a quiet machine and the slowest step of the whole function.
-- During the full browser suite, with sixteen workers and a checkpoint
-- flushing to disk, two "Start session" presses sat in that lookup until the
-- 8 second statement timeout cancelled them, and the chair was told
-- "Something went wrong on our side." (the database log names the line).
--
-- This makes the function again with one change: the timezone is checked by
-- working out today's date in it, which refuses an unknown zone with the same
-- sentence and only ever loads the one zone asked for. Everything else is
-- exactly as before, and the grants of the function carry over because its
-- signature is unchanged.
--
-- "at time zone" is more forgiving than pg_timezone_names was: it also takes
-- abbreviations such as 'PST' and POSIX rules such as 'XYZ+3', which the
-- browser's Intl refuses, so a conference stored with one would break every
-- page that shows its times. Anybody signed in can call this function with
-- any string, so before the lookup the zone must be 'UTC' or an IANA
-- "Area/Location" name in one of IANA's own areas. That is every name
-- `$lib/timezones.ts` offers, and it shuts out abbreviations, POSIX rules and
-- the 'posix/' and 'right/' copies some servers keep beside the real files.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.

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

  -- Only 'UTC' or an IANA "Area/Location" name, such as 'Europe/Amsterdam'
  -- or 'America/Argentina/Buenos_Aires' (see the comment at the top).
  if zone <> 'UTC'
    and zone !~ '^(Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific|Etc)(/[A-Za-z0-9_+-]+){1,2}$'
  then
    raise exception 'That is not a timezone the database knows.';
  end if;

  -- Today in the given timezone, which also checks that Postgres knows the
  -- zone: "at time zone" refuses one it does not with invalid_parameter_value.
  -- It loads that one zone's file, where pg_timezone_names read all of them.
  begin
    today := (now() at time zone zone)::date;
  exception when invalid_parameter_value then
    raise exception 'That is not a timezone the database knows.';
  end;

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

