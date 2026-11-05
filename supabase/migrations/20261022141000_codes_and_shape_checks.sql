-- =============================================================================
-- Join codes and shape checks (security review 2026-10-10: L25, L26, L27, L68)
-- =============================================================================
-- Four findings about what the database took without asking:
--
--   * L25. An application team's join code was six characters drawn with
--     random(), which is seeded per session and not made for secrets, and
--     join_application_team took as many guesses as anyone cared to send. A
--     code is now eight characters from gen_random_bytes, teams made before
--     this migration get a fresh one, and a person who sends ten wrong codes in
--     an hour is refused for the rest of that hour, however many they send at
--     once.
--   * L26 and L27. applications.answers took any JSON at all, so one applicant
--     could store a shape the review page and the CSV export cannot draw. A
--     CHECK now requires an object of at most 50 answers, each under a question
--     id of at most 64 characters and each a string of at most 4000 characters
--     or a list of at most 20 such strings: the two shapes the apply form
--     writes. seat_preferences and committee_preferences get bounds of their
--     own. motivation already had applications_motivation_length at the form's
--     1500 characters, so it is left as it is.
--   * L68. A delegation's name, institution and note were unbounded on a direct
--     write. They get the limits the form has (client/src/lib/delegations.ts).
--
-- Each constraint is added "not valid" and then validated. A database that
-- already holds rows then checks them in a step of its own, with a clear
-- message naming the constraint, rather than failing half way through adding
-- it. The seeds pass every one. Before deploying to a database with real rows,
-- this lists every row that would stop the migration; it should print nothing:
--
--   select 'applications' as rows_of, id from public.applications
--   where case
--       when jsonb_typeof(answers) is distinct from 'object' then true
--       else (select count(*) from jsonb_object_keys(answers)) > 50
--         or exists (
--           select 1 from jsonb_each(answers) as answer (question_id, value)
--           where char_length(answer.question_id) > 64
--             or case jsonb_typeof(answer.value)
--               when 'string' then char_length(answer.value #>> '{}') > 4000
--               when 'array' then jsonb_array_length(answer.value) > 20
--                 or exists (
--                   select 1 from jsonb_array_elements(answer.value) as element (entry)
--                   where jsonb_typeof(element.entry) <> 'string'
--                     or char_length(element.entry #>> '{}') > 4000)
--               else true
--             end)
--     end
--     or char_length(seat_preferences) > 300
--     or cardinality(committee_preferences) > 10
--   union all
--   select 'delegations', id from public.delegations
--   where char_length(name) > 120
--     or char_length(institution_name) > 120
--     or char_length(note) > 1000;
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- The private schema: helpers the API does not serve
-- -----------------------------------------------------------------------------
-- PostgREST offers every function in public as an RPC. The two helpers below
-- are called by the database itself, from a function and from a CHECK, so
-- they live where the API cannot see them: supabase/config.toml lists the
-- schemas it serves under [api], and private is not one of them. A CHECK runs
-- as whoever writes the row, so the roles that write applications may look
-- inside; nothing else is granted on it. (Security review I2 moves helpers
-- here as well; "if not exists" lets either migration come first.)

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- private.new_application_team_code(): eight characters from gen_random_bytes
-- -----------------------------------------------------------------------------
-- The loop that drew the code in new_application_team, moved out so that the
-- teams made before this migration can be given a code the same way. The
-- alphabet has thirty-two characters, so one random byte modulo thirty-two
-- picks each of them equally often.

create or replace function private.new_application_team_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  -- No 0, O, 1 or I: the four characters people read wrong.
  code_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code_length constant integer := 8;
  random_bytes bytea;
  fresh_code text;
  byte_index integer;
begin
  loop
    -- pgcrypto's generator, fed by the operating system. random() would do
    -- for a shuffle, not for a code that stands between a stranger and a team.
    random_bytes = extensions.gen_random_bytes(code_length);
    fresh_code = '';

    for byte_index in 0..code_length - 1 loop
      fresh_code = fresh_code
        || substr(code_alphabet, 1 + get_byte(random_bytes, byte_index) % length(code_alphabet), 1);
    end loop;

    exit when not exists (
      select 1
      from public.application_teams as team
      where team.join_code = fresh_code
    );
  end loop;

  return fresh_code;
end;
$$;

-- Only new_application_team calls it, as the owner, and this migration once.
revoke execute on function private.new_application_team_code() from public;


-- -----------------------------------------------------------------------------
-- new_application_team, made again: the code comes from the helper above
-- -----------------------------------------------------------------------------
-- The complete body from 20261010120000_application_teams.sql, with the loop
-- that drew the code replaced by a call to private.new_application_team_code.

create or replace function public.new_application_team(conference_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_team uuid;
begin
  insert into public.application_teams (conference_id, join_code)
  values (new_application_team.conference_id, private.new_application_team_code())
  returning id into new_team;

  return new_team;
end;
$$;

-- Only start_application_team and team_applications call it, as before.
revoke execute on function public.new_application_team(uuid) from public, anon, authenticated;

-- A team made before this migration holds a six-character code from random().
-- It gets an eight-character one now; its members see the new code on their
-- application page, and only a friend holding the old one has to ask again.
update public.application_teams
set join_code = private.new_application_team_code()
where char_length(join_code) < 8;


-- -----------------------------------------------------------------------------
-- application_team_code_attempts: the wrong codes each person sent lately
-- -----------------------------------------------------------------------------
-- One row per wrong code, written by join_application_team alone. Nobody reads
-- it from a browser: row level security is on with no policies, and the
-- default grants are taken away as well, the way orphaned_document_files does.
-- Rows older than an hour no longer count and the function deletes them as it
-- goes, so the table never needs a job to sweep it.

create table public.application_team_code_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index application_team_code_attempts_user_time_idx
  on public.application_team_code_attempts (user_id, attempted_at);

alter table public.application_team_code_attempts enable row level security;

revoke all on table public.application_team_code_attempts from anon, authenticated;
revoke all on sequence public.application_team_code_attempts_id_seq from anon, authenticated;


-- -----------------------------------------------------------------------------
-- join_application_team, made again: ten wrong codes an hour, then no more
-- -----------------------------------------------------------------------------
-- The complete body from 20261010120000_application_teams.sql, with the cap
-- added before the code is looked up and the attempt written down after a miss.
--
-- The count and the write are one step per person: a lock on the caller, held
-- until the call ends, makes a second request from the same person wait until
-- the first has written its attempt down. Without it, thirty codes sent at the
-- same moment all count the same attempts and all get through to the lookup.
--
-- A wrong code is answered with null rather than an exception. An exception
-- would roll back the whole call, the attempt row with it, and the cap could
-- never fill; the browser never sees the difference, because joinMyTeam in
-- client/src/lib/server/application-teams.ts turns the null back into the
-- sentence the page has always shown. The cap itself may raise: by then there
-- is nothing to keep.

create or replace function public.join_application_team(application_id uuid, code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  most_wrong_codes_per_hour constant integer := 10;
  application public.applications := public.own_open_application(join_application_team.application_id);
  -- own_open_application has refused anybody who is not signed in by now.
  me uuid := (select auth.uid());
  team public.application_teams;
begin
  -- Two numbers name the lock: what it is for, and whose it is. Another
  -- person's attempts never wait on it.
  perform pg_advisory_xact_lock(hashtext('join_application_team'), hashtext(me::text));

  delete from public.application_team_code_attempts as attempt
  where attempt.user_id = me
    and attempt.attempted_at < now() - interval '1 hour';

  -- Checked before the lookup, so the eleventh try learns nothing even when it
  -- happens to be right.
  if (
    select count(*)
    from public.application_team_code_attempts as attempt
    where attempt.user_id = me
  ) >= most_wrong_codes_per_hour then
    raise exception 'Too many wrong codes. Try again in an hour';
  end if;

  -- Codes are shown in capitals, but somebody may type them in small letters.
  select *
  into team
  from public.application_teams as team_row
  where team_row.join_code = upper(trim(join_application_team.code))
    and team_row.conference_id = application.conference_id;

  if team.id is null then
    insert into public.application_team_code_attempts (user_id) values (me);

    return null;
  end if;

  if application.team_id = team.id then
    raise exception 'You are already in this team';
  end if;

  update public.applications
  set team_id = team.id
  where id = application.id;

  perform public.dissolve_lonely_application_team(application.team_id);

  return team.id;
end;
$$;

revoke execute on function public.join_application_team(uuid, text) from public, anon;
grant execute on function public.join_application_team(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- private.application_answers_are_valid(answers): the two shapes the form writes
-- -----------------------------------------------------------------------------
-- answers is one object keyed by application_questions.id, a 36-character
-- uuid; a value is a string (a text answer or one choice) or an array of
-- strings (several choices). The review page and the CSV export draw exactly
-- those two shapes and nothing else, so nothing else may be stored, and a key
-- is drawn like an answer, so it is bounded too. The form has at most 20
-- questions; 4000 and 20 are ANSWER_MAX_LENGTH in client/src/lib/applications.ts
-- and MAX_CHOICE_OPTIONS in client/src/lib/application-questions.ts, which the
-- apply form refuses and clips to, so what it saves always fits.
--
-- CASE rather than AND, because SQL does not promise the order AND evaluates
-- its sides in, and jsonb_object_keys raises on anything but an object.

create or replace function private.application_answers_are_valid(answers jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when answers is null or jsonb_typeof(answers) <> 'object' then false
    when (select count(*) from jsonb_object_keys(answers)) > 50 then false
    when exists (
      select 1
      from jsonb_object_keys(answers) as question_id
      where char_length(question_id) > 64
    ) then false
    else not exists (
      select 1
      from jsonb_each(answers) as answer (question_id, value)
      where not (
        (jsonb_typeof(answer.value) = 'string' and char_length(answer.value #>> '{}') <= 4000)
        or (
          jsonb_typeof(answer.value) = 'array'
          and jsonb_array_length(answer.value) <= 20
          and not exists (
            select 1
            from jsonb_array_elements(answer.value) as element (entry)
            where jsonb_typeof(element.entry) <> 'string'
              or char_length(element.entry #>> '{}') > 4000
          )
        )
      )
    )
  end;
$$;

-- A CHECK runs as whoever writes the row, so the applicant's and the
-- organiser's role has to be able to call this, and so does the server's own;
-- anon never writes an application and gets nothing.
revoke execute on function private.application_answers_are_valid(jsonb) from public;
grant execute on function private.application_answers_are_valid(jsonb) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- The bounds on an application
-- -----------------------------------------------------------------------------
-- seat_preferences is free text, "Any P5 country, or Brazil", clipped by the
-- form at SEAT_PREFERENCES_MAX_LENGTH (client/src/lib/applications.ts).
-- committee_preferences is already held to the conference's own count, at most
-- three, by validate_application; ten is the line behind that trigger.

alter table public.applications
  add constraint applications_answers_shape
    check (private.application_answers_are_valid(answers)) not valid,
  add constraint applications_seat_preferences_length
    check (char_length(seat_preferences) <= 300) not valid,
  add constraint applications_committee_preferences_count
    check (cardinality(committee_preferences) <= 10) not valid;

alter table public.applications validate constraint applications_answers_shape;
alter table public.applications validate constraint applications_seat_preferences_length;
alter table public.applications validate constraint applications_committee_preferences_count;


-- -----------------------------------------------------------------------------
-- The bounds on a delegation
-- -----------------------------------------------------------------------------
-- The same three numbers as DELEGATION_NAME_MAX_LENGTH,
-- DELEGATION_INSTITUTION_MAX_LENGTH and DELEGATION_NOTE_MAX_LENGTH in
-- client/src/lib/delegations.ts, which the register and edit forms refuse
-- with a sentence of their own before a row ever reaches these.

alter table public.delegations
  add constraint delegations_name_length
    check (char_length(name) <= 120) not valid,
  add constraint delegations_institution_name_length
    check (char_length(institution_name) <= 120) not valid,
  add constraint delegations_note_length
    check (char_length(note) <= 1000) not valid;

alter table public.delegations validate constraint delegations_name_length;
alter table public.delegations validate constraint delegations_institution_name_length;
alter table public.delegations validate constraint delegations_note_length;
