-- =============================================================================
-- Delegation join codes: ten wrong codes an hour, and no short codes left
-- =============================================================================
--
-- WHAT THIS IS
-- Finding L24 of the security review of 2026-10-10
-- (docs/security-review-2026-10-10.md): a delegation's join code came from
-- random(), never changed, and could be guessed without limit in a space of 40
-- bits. Migration 20261022140000_applications_delegations_windows already
-- mints new codes in create_delegation from gen_random_bytes, ten characters
-- long. This file does the other two halves, the way
-- 20261022141000_codes_and_shape_checks does them for an application team's
-- code:
--
--   * a delegation made before that migration still holds its eight-character
--     code from random(). It gets a fresh ten-character one now. A head who has
--     already shared the old link has to share the new one, which their
--     delegation page shows as it always has;
--   * preview_delegation and join_delegation both say whether a code belongs
--     to a delegation, so both now write a wrong code down, and a person who
--     has sent ten wrong codes in the last hour, to either of them, is refused
--     by both until the hour has passed.
--
-- Codes are not changed on a timetable. A head shares one code with a whole
-- class, often weeks before the conference, and a code that changed by itself
-- would break every link they had handed out. Ten characters at ten guesses an
-- hour leave nothing for a rotation to protect against.
--
-- This file:
--
--   * gives every delegation whose code is shorter than ten characters a new one
--   * adds the table delegation_code_attempts
--   * adds private.limit_delegation_code_guesses
--   * replaces preview_delegation and join_delegation
--
-- The database tests are in client/tests/db/security-delegation-join-codes.test.ts.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- A fresh code for every delegation still holding a short one
-- -----------------------------------------------------------------------------
-- The alphabet, the length and the draw are create_delegation's. One row at a
-- time, so each code is checked against every code already handed out, the
-- ones this loop has just given included. The update runs as the migration's
-- owner, which guard_delegation_update lets past its "the join code cannot be
-- changed" rule, since that rule is for pages.

do $$
declare
  -- No 0, O, 1 or I: the four characters people read wrong.
  code_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code_length constant integer := 10;
  short_code_delegation record;
  random_bytes bytea;
  fresh_code text;
begin
  for short_code_delegation in
    select delegation.id
    from public.delegations as delegation
    where char_length(delegation.join_code) < code_length
  loop
    loop
      random_bytes = extensions.gen_random_bytes(code_length);
      fresh_code = '';

      -- get_byte reads one byte, 0 to 255, and 256 is a multiple of 32, so the
      -- remainder favours no character of the alphabet over another.
      for byte_index in 0..code_length - 1 loop
        fresh_code = fresh_code
          || substr(code_alphabet, 1 + (get_byte(random_bytes, byte_index) % length(code_alphabet)), 1);
      end loop;

      exit when not exists (
        select 1
        from public.delegations as delegation
        where delegation.join_code = fresh_code
      );
    end loop;

    update public.delegations
    set join_code = fresh_code
    where id = short_code_delegation.id;
  end loop;
end;
$$;


-- -----------------------------------------------------------------------------
-- delegation_code_attempts: the wrong delegation codes each person sent lately
-- -----------------------------------------------------------------------------
-- One row per wrong code, written by preview_delegation and join_delegation
-- alone. Nobody reads it from a browser: row level security is on with no
-- policies, and the default grants are taken away as well, the way
-- application_team_code_attempts is. Rows older than an hour no longer count
-- and private.limit_delegation_code_guesses deletes them as it goes, so the
-- table never needs a job to sweep it.

create table public.delegation_code_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index delegation_code_attempts_user_time_idx
  on public.delegation_code_attempts (user_id, attempted_at);

alter table public.delegation_code_attempts enable row level security;

revoke all on table public.delegation_code_attempts from anon, authenticated;
revoke all on sequence public.delegation_code_attempts_id_seq from anon, authenticated;


-- -----------------------------------------------------------------------------
-- private.limit_delegation_code_guesses(person): refuse the eleventh wrong code
-- -----------------------------------------------------------------------------
-- The first step of both functions below, so the two share one count. It is
-- asked before the code is looked up, so a person past the cap learns nothing
-- even from the right code.
--
-- The count and the write that follows a miss are one step per person: the
-- lock on the caller is held until the whole call ends, so a second request
-- from the same person waits until the first has written its attempt down.
-- Without it, thirty codes sent at the same moment all count the same attempts
-- and all get through to the lookup. Two numbers name the lock, what it is for
-- and whose it is, so another person's codes never wait on it.
--
-- Not security definer: the two functions that call it are, so it already runs
-- as their owner.

create function private.limit_delegation_code_guesses(person uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  most_wrong_codes_per_hour constant integer := 10;
begin
  perform pg_advisory_xact_lock(hashtext('delegation_code_attempts'), hashtext(person::text));

  delete from public.delegation_code_attempts as attempt
  where attempt.user_id = person
    and attempt.attempted_at < now() - interval '1 hour';

  if (
    select count(*)
    from public.delegation_code_attempts as attempt
    where attempt.user_id = person
  ) >= most_wrong_codes_per_hour then
    raise exception 'Too many wrong codes. Try again in an hour';
  end if;
end;
$$;

revoke execute on function private.limit_delegation_code_guesses(uuid) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- preview_delegation, made again: it counts the wrong codes
-- -----------------------------------------------------------------------------
-- The select from 20260920190000_join_delegation_conference_gate.sql, unchanged,
-- behind the cap. It was a "language sql stable" function. Writing an attempt
-- down needs plpgsql, and a function that writes cannot be stable: the API
-- runs a stable function in a read-only transaction. Every column is named
-- with its table, because in plpgsql the returned columns (id, name, status
-- and the rest) are variables too.
--
-- A wrong code still answers with no rows, as before. The cap raises: by then
-- there is nothing to keep.

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
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  found_delegation_id uuid;
begin
  -- The attempts are counted per person, so there has to be one.
  if me is null then
    raise exception 'You have to be signed in to look up a join code';
  end if;

  perform private.limit_delegation_code_guesses(me);

  select delegation_row.id
  into found_delegation_id
  from public.delegations as delegation_row
  where delegation_row.join_code = preview_delegation.code;

  if found_delegation_id is null then
    insert into public.delegation_code_attempts (user_id) values (me);

    return;
  end if;

  return query
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
  where delegation.id = found_delegation_id;
end;
$$;

revoke execute on function public.preview_delegation(text) from public, anon;
grant execute on function public.preview_delegation(text) to authenticated;


-- -----------------------------------------------------------------------------
-- join_delegation, made again: it counts the wrong codes
-- -----------------------------------------------------------------------------
-- The complete body from 20261022111000_delegation_private_reads.sql, with the
-- cap asked first and a wrong code written down.
--
-- A wrong code is answered with null now rather than with the exception "That
-- join code does not belong to a delegation". An exception would roll back the
-- whole call, the attempt row with it, and the cap could never fill. The
-- visitor never sees the difference: joinDelegation in
-- client/src/lib/server/delegations.ts turns the null into the same refusal
-- the exception used to be. Every other refusal still raises, because none of
-- them has anything to keep.

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

  perform private.limit_delegation_code_guesses(me);

  select *
  into delegation
  from public.delegations as delegation_row
  where delegation_row.join_code = join_delegation.code;

  if delegation.id is null then
    insert into public.delegation_code_attempts (user_id) values (me);

    return null;
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

  -- The conference team runs the conference and does not take part in it. A
  -- chair who could join would read the delegation's drafts and announcements
  -- (security review 2026-10-10, M18). The page cannot ask this itself, so it
  -- is the one refusal only the database raises.
  if public.is_conference_staff(delegation.conference_id) then
    raise exception 'The conference team cannot join a delegation';
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
