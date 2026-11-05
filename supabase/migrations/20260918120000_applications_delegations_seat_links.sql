-- =============================================================================
-- Migration 0006: applications, delegations, seat links, allocation functions
-- =============================================================================
--
-- WHAT THIS IS
-- Task T16 in specs/07-delivery/tasks.md. Migration 0003 built the empty seat
-- list; this file builds the two roads into a seat and the functions that walk
-- somebody down them. There are exactly two:
--
--   * one person applies on their own (applications), an organiser accepts them
--     and picks a free seat;
--   * a school registers a group (delegations), an organiser reserves seats for
--     the group, and the head of the group puts a member in each one.
--
-- Nobody takes both roads to the same conference. The
-- check_one_route_per_conference trigger is what makes that true.
--
-- This file:
--
--   * adds application_questions, applications, delegations, delegation_members
--   * adds the seats.application_id and seats.delegation_id columns migration
--     0003 left out, and rewrites check_seat_allocation with the two rules that
--     needed them
--   * adds the three permission helpers that need these tables:
--     is_conference_participant, is_delegation_head, is_delegation_member
--   * adds the eight functions the application and allocation pages call:
--     create_delegation, preview_delegation, join_delegation,
--     accept_application, move_delegate, allocate_delegation_seats,
--     remove_delegation_seat, revoke_seat
--   * adds conference_audience_user_ids and the first five notify_* triggers,
--     which are the only things that ever insert a notifications row
--   * finishes three policies earlier migrations left half-written, now that
--     there are tables to say what "a participant" means: profile_details,
--     conference_staff and seats
--
-- WHAT IS NOT HERE, ON PURPOSE
-- Money. accept_application, allocate_delegation_seats, remove_delegation_seat
-- and revoke_seat each have an invoice half in
-- specs/02-architecture/data-model.md, and the invoices table arrives in task
-- T17, which replaces all four. Position papers are the same story: move_delegate
-- carries a delegate's paper to their new seat and revoke_seat deletes it, and
-- the documents table arrives in task T34. Every one of those places is marked
-- with a "T17" or "T34" comment in the body below.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- application_questions
-- -----------------------------------------------------------------------------
-- The extra questions an organiser puts on their own application form, on top
-- of the fields every conference asks. An answer is stored in
-- applications.answers under this row's id, which is why deleting a question
-- does not have to touch the answers: a key nothing asks about is simply never
-- read again.

create table public.application_questions (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences (id) on delete cascade,
  -- The question itself, for example "Have you chaired before?".
  label text not null,
  -- The smaller line under it, for anything the label cannot fit.
  help_text text,
  type public.question_type not null,
  -- The choices, for single_choice, multiple_choice and checkbox. Empty for the
  -- two text types.
  options text[] not null default '{}',
  is_required boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index application_questions_conference_position_idx
  on public.application_questions (conference_id, position);

create trigger application_questions_set_updated_at
  before update on public.application_questions
  for each row
  execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- applications
-- -----------------------------------------------------------------------------
-- One person's request to come to one conference. A member of a delegation has
-- no row here: their delegation applies for all of them at once.
--
-- committee_preferences is an array of committee ids in the order the applicant
-- put them, "I would like the Security Council, and otherwise the Human Rights
-- Council". It is an array rather than a table of its own because it is never
-- read on its own, only with the application, and it is at most three entries.
--
-- answers is one JSON object keyed by application_questions.id. A value is a
-- string, or an array of strings for the two multiple-answer types.

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status public.application_status not null default 'draft',
  committee_preferences uuid[] not null default '{}',
  -- Free text, "Any P5 country, or Brazil".
  seat_preferences text,
  motivation text,
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  -- What the organiser wrote to the applicant. The applicant reads it.
  decision_note text,
  -- What the organisers wrote to each other. The applicant never sees it, and
  -- the applications policies below are what keeps it that way: the whole row
  -- is readable or it is not, so an applicant reading their own row reads this
  -- column too. Organisers are told as much in 06-features/applications.md.
  internal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Nobody applies to the same conference twice. Editing is reopening the row.
  unique (conference_id, user_id),
  constraint applications_motivation_length check (char_length(motivation) <= 1500)
);

-- The organiser's applications table is always "this conference, this status".
create index applications_conference_status_idx on public.applications (conference_id, status);
-- "Have I applied to this one?", asked on every public conference page.
create index applications_user_id_idx on public.applications (user_id);

create trigger applications_set_updated_at
  before update on public.applications
  for each row
  execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- delegations
-- -----------------------------------------------------------------------------
-- A school or club coming as a group. The head registers it, members join with
-- the join code, and the organiser reserves seats for the group as a whole.
--
-- requested_seats is a wish, not a limit: an organiser may reserve more or
-- fewer. How many were really reserved is count(seats where delegation_id =
-- this), which is why there is no column for it. A stored count would be one
-- more thing that can disagree with the seats themselves.

create table public.delegations (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences (id) on delete cascade,
  -- "Lycee Francais Delegation".
  name text not null,
  institution_name text not null,
  country_code char(2),
  status public.delegation_status not null default 'draft',
  requested_seats integer not null default 1,
  -- The head's message to the organisers.
  note text,
  -- Eight characters the head hands out, so a member can join without being
  -- invited one at a time. create_delegation below mints it; nobody may write
  -- it afterwards, which guard_delegation_update enforces.
  join_code text not null unique,
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  decision_note text,
  internal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delegations_requested_seats_range check (requested_seats between 1 and 200)
);

create index delegations_conference_status_idx on public.delegations (conference_id, status);

create trigger delegations_set_updated_at
  before update on public.delegations
  for each row
  execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- delegation_members
-- -----------------------------------------------------------------------------
-- Who is in the group. There is always at least one head, which is what
-- prevent_last_delegation_head_removal below guarantees; a school can send two
-- teachers and make both of them heads.

create table public.delegation_members (
  delegation_id uuid not null references public.delegations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.delegation_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (delegation_id, user_id)
);

-- The primary key already indexes delegation_id. This one answers "which
-- delegation is this person in?", asked by the apply page and by
-- check_one_route_per_conference below.
create index delegation_members_user_id_idx on public.delegation_members (user_id);


-- -----------------------------------------------------------------------------
-- seats: the two columns migration 0003 left out
-- -----------------------------------------------------------------------------
-- Which road the person in this seat took. A seat filled from an individual
-- application carries application_id; a seat reserved for a group carries
-- delegation_id, first with user_id still null and then with the member the
-- head chose.
--
-- Both are "on delete set null" rather than cascade, for the reason user_id
-- already is: deleting the application or the delegation must free the seat,
-- not take it out of the committee's list.

alter table public.seats
  add column delegation_id uuid references public.delegations (id) on delete set null,
  add column application_id uuid references public.applications (id) on delete set null;

create index seats_delegation_id_idx on public.seats (delegation_id);
create index seats_application_id_idx on public.seats (application_id);


-- =============================================================================
-- Permission helpers
-- =============================================================================
-- The last three helpers of specs/02-architecture/permissions.md, which could
-- not be written until these tables existed. Like the others they are
-- "security definer", so a policy on one table may ask a question about another
-- the caller is not allowed to read, and "set search_path = ''" so a caller
-- cannot point them at a table of their own.

-- Is the signed-in user inside this conference at all? Three ways in: they hold
-- a seat, they have an application that is no longer a private draft, or they
-- are in a delegation. It is what turns a stranger into somebody who may read
-- the seat lists and the team.
create or replace function public.is_conference_participant(conference_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.seats as seat
    join public.committees as committee on committee.id = seat.committee_id
    where committee.conference_id = is_conference_participant.conference_id
      and seat.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.applications as application
    where application.conference_id = is_conference_participant.conference_id
      and application.user_id = (select auth.uid())
      and application.status <> 'draft'
  )
  or exists (
    select 1
    from public.delegation_members as membership
    join public.delegations as delegation on delegation.id = membership.delegation_id
    where delegation.conference_id = is_conference_participant.conference_id
      and membership.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_conference_participant(uuid) from public, anon;
grant execute on function public.is_conference_participant(uuid) to authenticated;


-- Does the signed-in user run this delegation? A delegation may have several
-- heads, and every one of them may do everything.
create or replace function public.is_delegation_head(delegation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.delegation_members as membership
    where membership.delegation_id = is_delegation_head.delegation_id
      and membership.user_id = (select auth.uid())
      and membership.role = 'head'
  );
$$;

revoke execute on function public.is_delegation_head(uuid) from public, anon;
grant execute on function public.is_delegation_head(uuid) to authenticated;


-- Is the signed-in user in this delegation, as a head or as a member?
create or replace function public.is_delegation_member(delegation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.delegation_members as membership
    where membership.delegation_id = is_delegation_member.delegation_id
      and membership.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_delegation_member(uuid) from public, anon;
grant execute on function public.is_delegation_member(uuid) to authenticated;


-- =============================================================================
-- Triggers on applications and delegations
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Trigger: an application is filled in properly
-- -----------------------------------------------------------------------------
-- Two jobs, and the difference between them matters. The preference rules are
-- checked on every write, because a committee of another conference is never
-- acceptable, draft or not. The "did you fill it in?" rules are only checked
-- when the row becomes submitted, because a draft is allowed to be half empty;
-- that is what a draft is for.
--
-- It is "security definer" because it reads the conference and its committees
-- and questions, which an applicant may read here but a stranger writing a
-- draft for a conference they cannot see must not be able to probe. Reading
-- them as the owner keeps the answer the same for everybody.

create or replace function public.validate_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conference public.conferences;
  preference_count integer := coalesce(array_length(new.committee_preferences, 1), 0);
  distinct_count integer;
  foreign_committees integer;
  missing_question text;
  answer jsonb;
begin
  select *
  into conference
  from public.conferences as conference_row
  where conference_row.id = new.conference_id;

  if conference.id is null then
    raise exception 'That conference does not exist';
  end if;

  -- The form asks for this many preferences, so more than that never came from
  -- the form.
  if preference_count > conference.committee_preference_count then
    raise exception 'This conference asks for % committee preferences, not %',
      conference.committee_preference_count, preference_count;
  end if;

  -- Naming the same committee twice is a wasted preference rather than a
  -- second chance at it.
  select count(distinct preference)
  into distinct_count
  from unnest(new.committee_preferences) as preference;

  if distinct_count <> preference_count then
    raise exception 'Each committee preference has to be a different committee';
  end if;

  -- Every preference is a committee of this conference. Without this an
  -- applicant could put another conference's committee id in the array and the
  -- organiser's allocation screen would show a committee that is not theirs.
  select count(*)
  into foreign_committees
  from unnest(new.committee_preferences) as preference
  where not exists (
    select 1
    from public.committees as committee
    where committee.id = preference
      and committee.conference_id = new.conference_id
  );

  if foreign_committees > 0 then
    raise exception 'A committee preference has to be a committee of this conference';
  end if;

  if new.status <> 'submitted' then
    return new;
  end if;

  -- From here down: the rules a submitted application has to pass. A draft
  -- skipped them at the return above.

  if conference.committee_preference_count > 0 and preference_count = 0 then
    raise exception 'Pick at least one committee preference before you submit';
  end if;

  if conference.ask_motivation and coalesce(trim(new.motivation), '') = '' then
    raise exception 'Write a motivation before you submit';
  end if;

  -- Every question the organiser marked required has an answer that is not an
  -- empty string and not an empty list. jsonb_typeof tells the two shapes
  -- apart: a text answer from a text field, an array from a multiple choice.
  for missing_question, answer in
    select question.label, new.answers -> question.id::text
    from public.application_questions as question
    where question.conference_id = new.conference_id
      and question.is_required
  loop
    if answer is null
      or answer = 'null'::jsonb
      or (jsonb_typeof(answer) = 'string' and trim(answer #>> '{}') = '')
      or (jsonb_typeof(answer) = 'array' and jsonb_array_length(answer) = 0)
    then
      raise exception 'Answer "%" before you submit', missing_question;
    end if;
  end loop;

  return new;
end;
$$;

revoke execute on function public.validate_application() from public, anon, authenticated;

create trigger applications_validate
  before insert or update on public.applications
  for each row
  execute function public.validate_application();


-- -----------------------------------------------------------------------------
-- Trigger: what an application may look like on the day it is written
-- -----------------------------------------------------------------------------
-- guard_application_update below says what may change afterwards. This one says
-- what may arrive in the first place, and without it that whole guard can be
-- walked around by choosing at insert what it refuses to let anybody change:
-- an applicant could write their own row already accepted, with a decision note
-- they wrote themselves and a submitted_at from last year. The row would then be
-- stuck, because the update guard and the update policy both refuse an applicant
-- whose application is decided, and the organiser would be left with a decision
-- nobody made.
--
-- 06-features/applications.md gives the applicant exactly one creating move,
-- "create draft", and gives every other status a named transition with a named
-- actor. So a new row is a draft, or a draft and a submission in one go, and
-- nothing else.
--
-- Like the other three guards in this file it is an ordinary function and not a
-- security definer one, so that current_user is the caller's role and our own
-- server functions, which run as the owner, walk past it.
--
-- It cannot live in validate_application, which already fires before insert:
-- that function is security definer, so current_user reads "postgres" inside it
-- for everybody and the escape hatch could not tell the server from a browser.

create or replace function public.guard_application_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- What the applicant's own page may put in a new row. Everything else on it
  -- belongs to the organiser or to the database, and the catch-all at the end
  -- insists on what is left rather than naming the columns that are forbidden,
  -- for the reason guard_application_update gives: a list of forbidden columns
  -- is a list that rots.
  applicant_choosable constant text[] := array[
    'id', 'conference_id', 'user_id', 'status', 'committee_preferences',
    'seat_preferences', 'motivation', 'answers', 'submitted_at',
    'created_at', 'updated_at'
  ];
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.status not in ('draft', 'submitted') then
    raise exception 'A new application can only be saved as a draft or submitted';
  end if;

  -- The same rule the update guard keeps, on the same column and for the same
  -- reason: the organiser's table is sorted by the moment an application was
  -- sent, so it is not a moment the sender chooses.
  if new.submitted_at is not null then
    raise exception 'When an application was submitted is not something a page writes';
  end if;

  if new.status = 'submitted' then
    new.submitted_at = now();
  end if;

  -- The other two clocks are the database's as well. applications_set_updated_at
  -- only fires on update, so on an insert this is the one thing standing between
  -- an applicant and a row that claims to have been written last year.
  new.created_at = now();
  new.updated_at = now();

  -- The catch-all, and the reason this is written as an allow-list. Take away
  -- the columns the applicant chooses, and every column that is left -- the four
  -- the organiser decides with today, and any decision column this table grows
  -- later -- has to arrive empty.
  if exists (
    select 1
    from jsonb_each(to_jsonb(new) - applicant_choosable) as organiser_column
    where organiser_column.value <> 'null'::jsonb
  ) then
    raise exception 'Only the organisers decide an application';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_application_insert() from public, anon, authenticated;

-- Triggers on one table and one event fire in alphabetical order, so this one
-- runs before applications_validate and the row it checks is the row the
-- applicant really sent.
create trigger applications_guard_insert
  before insert on public.applications
  for each row
  execute function public.guard_application_insert();


-- -----------------------------------------------------------------------------
-- Trigger: who may change what on an application
-- -----------------------------------------------------------------------------
-- The applications update policy says "the applicant, but only these statuses"
-- and "the organiser, but only these columns". A Row Level Security policy can
-- decide which rows somebody changes and not which columns, so the column half
-- of both sentences is here. It is the pattern the cross-cutting rules in
-- specs/02-architecture/permissions.md describe.
--
-- The guard only runs for the two roles a browser ever uses. Our own security
-- definer functions below (accept_application, revoke_seat) run as the owner of
-- the function, and they are the server, so they walk past it. That is the same
-- escape hatch protect_stripe_columns and protect_notifications_columns use.
--
-- It is deliberately NOT "security definer", unlike most of the functions in
-- this file, and that is the whole reason the escape hatch works. Inside a
-- security definer function current_user is the function's owner rather than
-- the caller, so a guard written that way would read "postgres" for everybody
-- and let every write through. As an ordinary function it reads "authenticated"
-- for a browser request and "postgres" inside accept_application, which is
-- exactly the difference it is asking about. protect_stripe_columns and
-- protect_notifications_columns in migration 0002 are plain functions for the
-- same reason.
--
-- submitted_at is kept by this trigger rather than written by the page, because
-- a timestamp the applicant can choose is not a timestamp.

create or replace function public.guard_application_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  -- What each side is allowed to write. The checks at the end of each branch
  -- compare everything else, rather than naming the columns that are forbidden,
  -- because a list of forbidden columns is a list that rots: a column added to
  -- this table next year would be missing from it and both sides would quietly
  -- gain the right to write it. updated_at is in both lists because
  -- applications_set_updated_at overwrites it a moment later whatever anybody
  -- sent, and submitted_at because the block at the top of this function has
  -- already made sure it is this trigger's value and not the caller's.
  applicant_writable constant text[] := array[
    'status', 'committee_preferences', 'seat_preferences', 'motivation', 'answers',
    'submitted_at', 'updated_at'
  ];
  organiser_writable constant text[] := array[
    'status', 'decision_note', 'internal_note', 'decided_at', 'decided_by',
    'submitted_at', 'updated_at'
  ];
begin
  -- When an application was sent is this trigger's to say. Without this the
  -- block below only fills the column on a status change, so an update that
  -- leaves the status alone carries whatever moment the caller chose, and
  -- 06-features/applications.md gives the organiser a table sorted by it.
  if current_user in ('anon', 'authenticated')
    and new.submitted_at is distinct from old.submitted_at
  then
    raise exception 'When an application was submitted is not something a page writes';
  end if;

  -- Keep the clock honest whoever is writing, so a row the server moves is
  -- stamped the same way a row the applicant moves is.
  if new.status = 'submitted' and old.status <> 'submitted' then
    new.submitted_at = now();
  elsif new.status = 'draft' and old.status <> 'draft' then
    new.submitted_at = null;
  end if;

  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  -- Neither side may move the row to another person or another conference, and
  -- this comes before the two branches because it is the one rule both sides
  -- share. Without it the insert policy's conditions are optional: an applicant
  -- could make a draft at a conference that is open and then carry it to one
  -- that is closed, or to one where they already head a delegation, which
  -- check_one_route_per_conference cannot see because it fires on insert.
  if new.conference_id is distinct from old.conference_id
    or new.user_id is distinct from old.user_id
  then
    raise exception 'An application belongs to one person and one conference';
  end if;

  if new.user_id = me then
    -- The applicant's own rules.
    if old.status not in ('draft', 'submitted', 'waitlisted') then
      raise exception 'This application can no longer be changed';
    end if;

    if new.status not in ('draft', 'submitted', 'withdrawn') then
      raise exception 'You can only save, submit or withdraw an application';
    end if;

    -- Waitlisted is the one status an applicant may leave but not return to,
    -- so it may only become withdrawn.
    if old.status = 'waitlisted' and new.status <> 'withdrawn' then
      raise exception 'A waitlisted application can only be withdrawn';
    end if;

    if new.decided_at is distinct from old.decided_at
      or new.decided_by is distinct from old.decided_by
      or new.decision_note is distinct from old.decision_note
      or new.internal_note is distinct from old.internal_note
    then
      raise exception 'Only the organisers decide an application';
    end if;

    -- The catch-all. "to_jsonb" turns a row into a JSON object and "- the list"
    -- drops those keys, so this reads: take away the columns an applicant may
    -- write, and what is left has to be exactly what it was.
    if to_jsonb(new) - applicant_writable is distinct from to_jsonb(old) - applicant_writable
    then
      raise exception 'An applicant can only change their own answers';
    end if;

    return new;
  end if;

  -- The organiser's rules. Everything the applicant wrote stays as they wrote
  -- it; a decision is a decision, not an edit of somebody's answers. The person
  -- and the conference are guarded above, for both sides at once.
  if new.committee_preferences is distinct from old.committee_preferences
    or new.seat_preferences is distinct from old.seat_preferences
    or new.motivation is distinct from old.motivation
    or new.answers is distinct from old.answers
  then
    raise exception 'An organiser cannot change what an applicant wrote';
  end if;

  if to_jsonb(new) - organiser_writable is distinct from to_jsonb(old) - organiser_writable
  then
    raise exception 'An organiser can only decide an application';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_application_update() from public, anon, authenticated;

create trigger applications_guard_update
  before update on public.applications
  for each row
  execute function public.guard_application_update();


-- -----------------------------------------------------------------------------
-- Trigger: what a delegation may look like on the day it is written
-- -----------------------------------------------------------------------------
-- The twin of guard_application_insert above, for the other road into a
-- conference and for the same reason. 06-features/delegations.md says "Status
-- starts as draft", and an accepted delegation the organisers never accepted
-- would show up in the allocation grid asking for seats.
--
-- create_delegation is what the page really calls, and it walks past this guard
-- because it runs as the owner. The guard is here for the insert policy beside
-- it, which the policy matrix asks for and which nothing else checks.
--
-- join_code is the one column the head may choose here although nobody may
-- change it afterwards. The column is "not null" with no default, so an insert
-- through the policy has to carry one, and the code is that delegation's own:
-- the unique constraint already stops it being another delegation's, and
-- create_delegation mints one nobody chose on the path the app really uses.

create or replace function public.guard_delegation_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- What the head's own page may put in a new row, with the catch-all at the
  -- end insisting on everything else, the way the three guards around it do.
  head_choosable constant text[] := array[
    'id', 'conference_id', 'name', 'institution_name', 'country_code', 'status',
    'requested_seats', 'note', 'join_code', 'submitted_at',
    'created_at', 'updated_at'
  ];
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.status not in ('draft', 'submitted') then
    raise exception 'A new delegation can only be saved as a draft or submitted';
  end if;

  if new.submitted_at is not null then
    raise exception 'When a delegation was submitted is not something a page writes';
  end if;

  if new.status = 'submitted' then
    new.submitted_at = now();
  end if;

  new.created_at = now();
  new.updated_at = now();

  if exists (
    select 1
    from jsonb_each(to_jsonb(new) - head_choosable) as organiser_column
    where organiser_column.value <> 'null'::jsonb
  ) then
    raise exception 'Only the organisers decide a delegation';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_delegation_insert() from public, anon, authenticated;

create trigger delegations_guard_insert
  before insert on public.delegations
  for each row
  execute function public.guard_delegation_insert();


-- -----------------------------------------------------------------------------
-- Trigger: who may change what on a delegation
-- -----------------------------------------------------------------------------
-- The same shape as guard_application_update, for the same reason: the
-- delegations row of the policy matrix gives the head one list of columns and
-- the organiser another, and a policy cannot restrict columns.
--
-- specs/02-architecture/data-model.md does not name this trigger. The rule it
-- enforces is in permissions.md, and the only way to enforce a column rule is a
-- trigger, so it is written here and added to the function table. See the
-- decision log in specs/07-delivery/open-questions.md.
--
-- Like guard_application_update above it is an ordinary function and not a
-- security definer one, so that current_user is the caller's role and the
-- escape hatch for our own server functions can tell the two apart. The helper
-- it calls, is_delegation_head, is security definer and reads the tables this
-- one may not.

create or replace function public.guard_delegation_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- What each side may write, for the reason guard_application_update gives:
  -- the checks at the end of each branch compare everything else, so a column
  -- added to this table later is guarded from the day it arrives instead of
  -- being forgotten.
  head_writable constant text[] := array[
    'name', 'institution_name', 'country_code', 'requested_seats', 'note', 'status',
    'submitted_at', 'updated_at'
  ];
  organiser_writable constant text[] := array[
    'status', 'decision_note', 'internal_note', 'decided_at', 'decided_by',
    'submitted_at', 'updated_at'
  ];
begin
  -- When a delegation was sent is this trigger's to say, the same rule
  -- guard_application_update keeps and for the same reason.
  if current_user in ('anon', 'authenticated')
    and new.submitted_at is distinct from old.submitted_at
  then
    raise exception 'When a delegation was submitted is not something a page writes';
  end if;

  if new.status = 'submitted' and old.status <> 'submitted' then
    new.submitted_at = now();
  elsif new.status = 'draft' and old.status <> 'draft' then
    -- 06-features/delegations.md has no submitted -> draft move, but the status
    -- check below allows one, so the column is cleared here rather than left
    -- saying a draft was submitted at a moment that has passed.
    new.submitted_at = null;
  end if;

  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  -- The join code is minted once by create_delegation. Letting a head choose it
  -- would let them guess another delegation's.
  if new.join_code is distinct from old.join_code then
    raise exception 'The join code cannot be changed';
  end if;

  if new.conference_id is distinct from old.conference_id then
    raise exception 'A delegation cannot be moved to another conference';
  end if;

  if public.is_delegation_head(new.id) then
    -- The "where it is now" question comes first, so that a head touching a
    -- decided delegation is told it is decided rather than told off about a
    -- status they did not try to change.
    if old.status not in ('draft', 'submitted') then
      raise exception 'This delegation can no longer be changed';
    end if;

    if new.status not in ('draft', 'submitted', 'withdrawn') then
      raise exception 'You can only save, submit or withdraw a delegation';
    end if;

    if new.decided_at is distinct from old.decided_at
      or new.decided_by is distinct from old.decided_by
      or new.decision_note is distinct from old.decision_note
      or new.internal_note is distinct from old.internal_note
    then
      raise exception 'Only the organisers decide a delegation';
    end if;

    if to_jsonb(new) - head_writable is distinct from to_jsonb(old) - head_writable then
      raise exception 'A head can only change how they described their own delegation';
    end if;

    return new;
  end if;

  -- The organiser's rules. The head's own description of their group is theirs.
  if new.name is distinct from old.name
    or new.institution_name is distinct from old.institution_name
    or new.country_code is distinct from old.country_code
    or new.requested_seats is distinct from old.requested_seats
    or new.note is distinct from old.note
  then
    raise exception 'An organiser cannot change what a delegation head wrote';
  end if;

  if to_jsonb(new) - organiser_writable is distinct from to_jsonb(old) - organiser_writable
  then
    raise exception 'An organiser can only decide a delegation';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_delegation_update() from public, anon, authenticated;

create trigger delegations_guard_update
  before update on public.delegations
  for each row
  execute function public.guard_delegation_update();


-- -----------------------------------------------------------------------------
-- Trigger: one road into a conference, not two
-- -----------------------------------------------------------------------------
-- Somebody who applies on their own and also joins a school's delegation would
-- have two routes to a seat, two invoices and two answers to "am I coming?".
-- The apply page and the join page each say so in words; this is what makes it
-- true whatever anybody sends.
--
-- It fires on insert only, and that is safe exactly because neither table lets a
-- row change the person or the conference it is about afterwards. Each of those
-- is a column rule and therefore a trigger of its own:
-- guard_application_update refuses a change to applications.user_id or
-- conference_id, and protect_delegation_member_columns refuses a change to
-- delegation_members.user_id or delegation_id. Without the pair of them this
-- trigger would be a front door with the back door standing open.

create or replace function public.check_one_route_per_conference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  the_conference uuid;
  the_person uuid := new.user_id;
begin
  -- The row being inserted names its conference directly on applications, and
  -- through its delegation on delegation_members. tg_table_name is the name of
  -- the table the trigger is firing on, which is how one function serves both.
  if tg_table_name = 'applications' then
    the_conference = new.conference_id;
  else
    select delegation.conference_id
    into the_conference
    from public.delegations as delegation
    where delegation.id = new.delegation_id;
  end if;

  -- A second application for the same conference is refused by the unique
  -- (conference_id, user_id) index on applications, so only the other table has
  -- to ask this question.
  if tg_table_name = 'delegation_members' and exists (
    select 1
    from public.applications as application
    where application.conference_id = the_conference
      and application.user_id = the_person
  ) then
    raise exception 'You already have an application for this conference';
  end if;

  if exists (
    select 1
    from public.delegation_members as membership
    join public.delegations as delegation on delegation.id = membership.delegation_id
    where delegation.conference_id = the_conference
      and membership.user_id = the_person
  ) then
    raise exception 'You are already part of a delegation for this conference';
  end if;

  return new;
end;
$$;

revoke execute on function public.check_one_route_per_conference() from public, anon, authenticated;

create trigger applications_check_one_route
  before insert on public.applications
  for each row
  execute function public.check_one_route_per_conference();

create trigger delegation_members_check_one_route
  before insert on public.delegation_members
  for each row
  execute function public.check_one_route_per_conference();


-- -----------------------------------------------------------------------------
-- Trigger: a membership only ever changes its role
-- -----------------------------------------------------------------------------
-- specs/02-architecture/permissions.md gives a head one column on this table,
-- "head: role", and a policy cannot restrict columns, so the rest of that
-- sentence is here. It is the "protect_<table>_columns" shape the cross-cutting
-- rules in that file describe, and like the other three it is an ordinary
-- function and not a security definer one, so that current_user is the caller's
-- role rather than the owner's.
--
-- Without it a head could point an existing membership row at any account id,
-- which is a worse hole than it first looks: profiles are readable by anybody
-- signed in, so the ids are there for the taking. The rewritten account would
-- be in a delegation it never joined, the member who really joined would be
-- silently dropped, the one-road rule would be walked around because
-- check_one_route_per_conference fires on insert, and the head would gain that
-- stranger's phone number and emergency contact through the profile_details
-- policy further down this file.

create or replace function public.protect_delegation_member_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- The one column a head writes. The check below takes it away and insists
  -- that everything left is unchanged, rather than naming the columns nobody
  -- may write, for the reason the guards on applications and delegations give:
  -- a list of forbidden columns is a list that rots, and a column added to this
  -- table later would be missing from it.
  head_writable constant text[] := array['role'];
begin
  if current_user in ('anon', 'authenticated')
    and to_jsonb(new) - head_writable is distinct from to_jsonb(old) - head_writable
  then
    raise exception 'Only a member''s role can be changed. Remove them and let them join again.';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_delegation_member_columns()
  from public, anon, authenticated;

create trigger delegation_members_protect_columns
  before update on public.delegation_members
  for each row
  execute function public.protect_delegation_member_columns();


-- -----------------------------------------------------------------------------
-- Trigger: a delegation always keeps at least one head
-- -----------------------------------------------------------------------------
-- The same guard organization_members has. Without it the last head could
-- promote nobody and step down, and the group would have nobody who can seat
-- its members or pay its invoice.

create or replace function public.prevent_last_delegation_head_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  other_heads integer;
begin
  -- Deleting the delegation itself deletes every membership with it. There is
  -- no delegation left to be without a head, and the parent row is already gone
  -- by the time this runs.
  if tg_op = 'DELETE' and not exists (
    select 1
    from public.delegations as delegation
    where delegation.id = old.delegation_id
  ) then
    return old;
  end if;

  -- Removing or changing somebody who is not a head is always fine.
  if old.role <> 'head' then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  -- An update that leaves them a head changes nothing about this rule.
  if tg_op = 'UPDATE' and new.role = 'head' then
    return new;
  end if;

  select count(*)
  into other_heads
  from public.delegation_members as membership
  where membership.delegation_id = old.delegation_id
    and membership.role = 'head'
    and membership.user_id <> old.user_id;

  if other_heads = 0 then
    raise exception 'A delegation needs at least one head. Make somebody else a head first.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke execute on function public.prevent_last_delegation_head_removal()
  from public, anon, authenticated;

create trigger delegation_members_keep_a_head
  before update or delete on public.delegation_members
  for each row
  execute function public.prevent_last_delegation_head_removal();


-- -----------------------------------------------------------------------------
-- check_seat_allocation, with the two rules that needed these tables
-- -----------------------------------------------------------------------------
-- Migration 0003 wrote the first of the three rules
-- specs/02-architecture/data-model.md gives this trigger and said the other two
-- would arrive with the columns they are about. This replaces it with all
-- three, plus the narrow write a delegation head is allowed.
--
--   1. one person holds at most one seat per conference;
--   2. application_id belongs to an application of the same conference;
--   3. a seat reserved for a delegation only takes a member of that delegation.
--
-- The fourth paragraph is the head's half of the seats update policy. The
-- policy decides that a head may write to a seat reserved for their own
-- delegation; which columns they may write, and until when, is a column rule
-- and therefore lives here.
--
-- "create or replace" writes over migration 0003's version. There is only ever
-- one check_seat_allocation, and this is now it.

create or replace function public.check_seat_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  the_conference uuid;
  conference_start date;
begin
  select committee.conference_id, conference.start_date
  into the_conference, conference_start
  from public.committees as committee
  join public.conferences as conference on conference.id = committee.conference_id
  where committee.id = new.committee_id;

  -- Rule 2. An application from another conference on this seat would put a
  -- stranger's answers on an organiser's allocation screen.
  if new.application_id is not null then
    if not exists (
      select 1
      from public.applications as application
      where application.id = new.application_id
        and application.conference_id = the_conference
    ) then
      raise exception 'That application is not for this conference';
    end if;
  end if;

  -- The delegation a seat is reserved for has to be one of this conference too,
  -- for the same reason.
  if new.delegation_id is not null then
    if not exists (
      select 1
      from public.delegations as delegation
      where delegation.id = new.delegation_id
        and delegation.conference_id = the_conference
    ) then
      raise exception 'That delegation is not for this conference';
    end if;
  end if;

  -- The delegation head's narrow write.
  --
  -- This function has to be security definer to see every seat of the
  -- conference, and inside one of those current_user is the owner rather than
  -- the caller, so it cannot ask who is writing the way the two guard triggers
  -- above do. It asks about rights instead, which is the better question
  -- anyway: somebody who is a head of this seat's delegation and cannot manage
  -- the conference is a head and nobody else. auth.uid() still reads the
  -- caller's own id inside a security definer function, so the organiser
  -- calling allocate_delegation_seats passes can_manage_conference and skips
  -- this whole branch, and so does the service role, for whom both are false.
  if tg_op = 'UPDATE'
    and new.delegation_id is not null
    and not public.can_manage_conference(the_conference)
    and public.is_delegation_head(new.delegation_id)
  then
    -- "Everything but user_id has to be identical", rather than a list of the
    -- columns a head may not write. A forbidden list is a list that rots: this
    -- one was written without allocated_at and created_at on it, and a head
    -- could quietly backdate both. to_jsonb turns a row into a JSON object and
    -- "- the list" drops those keys, so this reads: take away the one column a
    -- head may write, and what is left has to be exactly what it was.
    --
    -- updated_at goes with it because seats_set_updated_at overwrites it a
    -- moment later whatever anybody sent.
    if to_jsonb(new) - array['user_id', 'updated_at'] is distinct from
       to_jsonb(old) - array['user_id', 'updated_at']
    then
      raise exception 'A delegation head can only seat and unseat their own members';
    end if;

    -- From the first day of the conference the organisers move people, because
    -- a change on the morning of a session has to be one somebody in the
    -- building decided. 06-features/allocation.md.
    if conference_start <= current_date then
      raise exception 'The conference has started. Ask the organisers to change a seat.';
    end if;

    -- The head may not write allocated_at, so the trigger writes it for them.
    -- data-model.md calls the column "when user_id or delegation_id was last
    -- set", and the head has just set user_id. Unseating leaves it alone: the
    -- delegation_id is still set, so the moment the seat was reserved stands.
    if new.user_id is not null and new.user_id is distinct from old.user_id then
      new.allocated_at = now();
    end if;
  end if;

  if new.user_id is null then
    return new;
  end if;

  -- Rule 3. A reserved seat is the delegation's to fill, and only with somebody
  -- who is in it.
  if new.delegation_id is not null then
    if not exists (
      select 1
      from public.delegation_members as membership
      where membership.delegation_id = new.delegation_id
        and membership.user_id = new.user_id
    ) then
      raise exception 'That person is not a member of the delegation this seat is reserved for';
    end if;
  end if;

  -- Rule 1. Two seats would mean two schedules, two position papers and two
  -- invoices for one person.
  if exists (
    select 1
    from public.seats as other_seat
    join public.committees as other_committee
      on other_committee.id = other_seat.committee_id
    where other_seat.user_id = new.user_id
      and other_seat.id <> new.id
      and other_committee.conference_id = the_conference
  ) then
    raise exception 'That person already has a seat in this conference';
  end if;

  return new;
end;
$$;

revoke execute on function public.check_seat_allocation() from public, anon, authenticated;


-- =============================================================================
-- The delegation functions
-- =============================================================================
-- Three things a page cannot do with a plain insert or select, so each is one
-- security definer function the app calls by name.

-- -----------------------------------------------------------------------------
-- create_delegation(...)
-- -----------------------------------------------------------------------------
-- Registering a group is two rows that have to appear together: the delegation
-- and its first head. Doing it from the page would mean an insert whose second
-- half can fail and leave a delegation nobody runs, so it is one function and
-- therefore one transaction.
--
-- The join code is minted here rather than by the page. Eight characters from
-- an alphabet without 0, O, 1 and I, because somebody reads it out loud or
-- copies it off a whiteboard. The loop runs again on the astronomically
-- unlikely chance that the code is already taken.

create or replace function public.create_delegation(
  conference_id uuid,
  name text,
  institution_name text,
  country_code char(2),
  requested_seats integer,
  note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- No 0, O, 1 or I: the four characters people read wrong.
  code_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  me uuid := (select auth.uid());
  conference public.conferences;
  fresh_code text;
  character_index integer;
  new_delegation uuid;
begin
  if me is null then
    raise exception 'You have to be signed in to register a delegation';
  end if;

  select *
  into conference
  from public.conferences as conference_row
  where conference_row.id = create_delegation.conference_id;

  if conference.id is null or conference.status <> 'published' then
    raise exception 'That conference is not taking delegations';
  end if;

  if not conference.accepts_delegations then
    raise exception 'That conference does not take delegations';
  end if;

  if conference.applications_open_at is not null and conference.applications_open_at > now() then
    raise exception 'Applications for that conference have not opened yet';
  end if;

  if conference.applications_close_at is not null and conference.applications_close_at < now() then
    raise exception 'Applications for that conference have closed';
  end if;

  if exists (
    select 1
    from public.applications as application
    where application.conference_id = create_delegation.conference_id
      and application.user_id = me
  ) then
    raise exception 'You already have an application for this conference';
  end if;

  if exists (
    select 1
    from public.delegation_members as membership
    join public.delegations as delegation on delegation.id = membership.delegation_id
    where delegation.conference_id = create_delegation.conference_id
      and membership.user_id = me
  ) then
    raise exception 'You are already part of a delegation for this conference';
  end if;

  loop
    fresh_code = '';

    for character_index in 1..8 loop
      fresh_code = fresh_code
        || substr(code_alphabet, 1 + floor(random() * length(code_alphabet))::integer, 1);
    end loop;

    exit when not exists (
      select 1
      from public.delegations as delegation
      where delegation.join_code = fresh_code
    );
  end loop;

  insert into public.delegations (
    conference_id, name, institution_name, country_code, requested_seats, note, join_code
  )
  values (
    create_delegation.conference_id,
    create_delegation.name,
    create_delegation.institution_name,
    create_delegation.country_code,
    create_delegation.requested_seats,
    create_delegation.note,
    fresh_code
  )
  returning id into new_delegation;

  insert into public.delegation_members (delegation_id, user_id, role)
  values (new_delegation, me, 'head');

  return new_delegation;
end;
$$;

revoke execute on function public.create_delegation(uuid, text, text, char(2), integer, text)
  from public, anon;
grant execute on function public.create_delegation(uuid, text, text, char(2), integer, text)
  to authenticated;


-- -----------------------------------------------------------------------------
-- preview_delegation(code)
-- -----------------------------------------------------------------------------
-- What /join/[joinCode] shows somebody before they decide. They are not a
-- member yet, so the delegations select policy gives them nothing, and holding
-- the code is what earns them this much and no more.
--
-- The head names are the only personal detail here, and they are the point:
-- "the Lycee Francais delegation, run by Amelie Dubois" is how somebody knows
-- they have the right code.

create or replace function public.preview_delegation(code text)
returns table (
  id uuid,
  name text,
  institution_name text,
  country_code char(2),
  status public.delegation_status,
  conference_name text,
  conference_slug text,
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


-- -----------------------------------------------------------------------------
-- join_delegation(code)
-- -----------------------------------------------------------------------------
-- Adding yourself to a group you were not invited to one at a time. It is a
-- function rather than an insert policy because the code is the permission: a
-- policy would have to let anybody read delegation_members to check it.

create or replace function public.join_delegation(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  delegation public.delegations;
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

  if delegation.status in ('rejected', 'withdrawn') then
    raise exception 'That delegation is no longer taking members';
  end if;

  if exists (
    select 1
    from public.delegation_members as membership
    where membership.delegation_id = delegation.id
      and membership.user_id = me
  ) then
    raise exception 'You are already in this delegation';
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


-- =============================================================================
-- The allocation functions
-- =============================================================================
-- Giving somebody a seat, moving them, and taking a seat back. Every one of
-- them is several writes that have to happen together, and every one of them is
-- an organiser's decision, so each checks can_manage_conference itself rather
-- than trusting the page that called it.
--
-- specs/02-architecture/data-model.md gives four of these an invoice half as
-- well. The invoices table arrives in task T17, which replaces all four with
-- the same body plus the money.

-- -----------------------------------------------------------------------------
-- accept_application(application_id, seat_id)
-- -----------------------------------------------------------------------------
-- Accepting somebody and seating them are one decision, so they are one
-- statement. 06-features/allocation.md.

create or replace function public.accept_application(application_id uuid, seat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  application public.applications;
  seat public.seats;
  seat_conference uuid;
begin
  select *
  into application
  from public.applications as application_row
  where application_row.id = accept_application.application_id;

  if application.id is null then
    raise exception 'That application does not exist';
  end if;

  if not public.can_manage_conference(application.conference_id) then
    raise exception 'Only the organisers of this conference can accept an application';
  end if;

  if application.status not in ('submitted', 'waitlisted') then
    raise exception 'Only a submitted or waitlisted application can be accepted';
  end if;

  -- The seat and the conference it is in are read one after the other, because
  -- PL/pgSQL refuses to fill a whole-row variable and a plain one from the same
  -- "into" list.
  select *
  into seat
  from public.seats as seat_row
  where seat_row.id = accept_application.seat_id;

  select committee.conference_id
  into seat_conference
  from public.committees as committee
  where committee.id = seat.committee_id;

  if seat.id is null or seat_conference is distinct from application.conference_id then
    raise exception 'That seat is not part of this conference';
  end if;

  if seat.user_id is not null or seat.delegation_id is not null or not seat.is_available then
    raise exception 'That seat is not free';
  end if;

  update public.seats
  set user_id = application.user_id,
      application_id = accept_application.application_id,
      allocated_at = now()
  where id = accept_application.seat_id;

  update public.applications
  set status = 'accepted',
      decided_at = now(),
      decided_by = me
  where id = accept_application.application_id;

  -- T17 creates the delegate's invoice here, from the fee that applies at this
  -- moment. 06-features/fees.md.
end;
$$;

revoke execute on function public.accept_application(uuid, uuid) from public, anon;
grant execute on function public.accept_application(uuid, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- move_delegate(from_seat_id, to_seat_id)
-- -----------------------------------------------------------------------------
-- "Change seat" on the participants page. The old seat is freed before the new
-- one is filled, because check_seat_allocation refuses one person two seats in
-- a conference and would otherwise see them holding both for an instant.
--
-- The invoice is deliberately untouched: the person is still coming, and the
-- fee did not change because the room did.

create or replace function public.move_delegate(from_seat_id uuid, to_seat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  from_seat public.seats;
  to_seat public.seats;
  from_conference uuid;
  to_conference uuid;
begin
  -- The seat and its conference are read one after the other, because PL/pgSQL
  -- refuses to fill a whole-row variable and a plain one from the same "into"
  -- list.
  select *
  into from_seat
  from public.seats as seat_row
  where seat_row.id = move_delegate.from_seat_id;

  select committee.conference_id
  into from_conference
  from public.committees as committee
  where committee.id = from_seat.committee_id;

  if from_seat.id is null then
    raise exception 'That seat does not exist';
  end if;

  if not public.can_manage_conference(from_conference) then
    raise exception 'Only the organisers of this conference can move a delegate';
  end if;

  if from_seat.user_id is null then
    raise exception 'Nobody is sitting in that seat';
  end if;

  select *
  into to_seat
  from public.seats as seat_row
  where seat_row.id = move_delegate.to_seat_id;

  select committee.conference_id
  into to_conference
  from public.committees as committee
  where committee.id = to_seat.committee_id;

  if to_seat.id is null or to_conference is distinct from from_conference then
    raise exception 'That seat is not part of this conference';
  end if;

  if to_seat.user_id is not null or not to_seat.is_available then
    raise exception 'That seat is not free';
  end if;

  -- A seat reserved for a delegation may only take a member of it, which
  -- check_seat_allocation decides. Asking here as well would be the same rule
  -- written twice.

  -- allocated_at is "when user_id or delegation_id was last set"
  -- (specs/02-architecture/data-model.md), so a seat that keeps its reservation
  -- keeps the moment it was reserved. Only a seat going back to being free
  -- forgets it.
  update public.seats
  set user_id = null,
      application_id = null,
      allocated_at = case when delegation_id is null then null else allocated_at end
  where id = move_delegate.from_seat_id;

  update public.seats
  set user_id = from_seat.user_id,
      application_id = from_seat.application_id,
      allocated_at = now()
  where id = move_delegate.to_seat_id;

  -- T34 carries the delegate's position paper across with them, by moving the
  -- documents row's seat_id. 06-features/documents.md.
end;
$$;

revoke execute on function public.move_delegate(uuid, uuid) from public, anon;
grant execute on function public.move_delegate(uuid, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- allocate_delegation_seats(delegation_id, seat_ids)
-- -----------------------------------------------------------------------------
-- The organiser ticks seats across committees on the delegation review page and
-- the whole tick list arrives here at once. Reserving them one at a time would
-- send the head one notification per seat; the statement-level
-- notify_delegation_seats trigger below sends one for the lot.

create or replace function public.allocate_delegation_seats(delegation_id uuid, seat_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  delegation public.delegations;
  unusable_seats integer;
begin
  select *
  into delegation
  from public.delegations as delegation_row
  where delegation_row.id = allocate_delegation_seats.delegation_id;

  if delegation.id is null then
    raise exception 'That delegation does not exist';
  end if;

  if not public.can_manage_conference(delegation.conference_id) then
    raise exception 'Only the organisers of this conference can allocate seats';
  end if;

  if delegation.status in ('rejected', 'withdrawn') then
    raise exception 'That delegation is no longer taking seats';
  end if;

  -- Every seat has to be free and in this conference. Counting the ones that
  -- are not, rather than looping, means the whole tick list is refused together
  -- and the organiser sees one message instead of a half-done allocation.
  select count(*)
  into unusable_seats
  from unnest(allocate_delegation_seats.seat_ids) as wanted_seat_id
  where not exists (
    select 1
    from public.seats as seat
    join public.committees as committee on committee.id = seat.committee_id
    where seat.id = wanted_seat_id
      and committee.conference_id = delegation.conference_id
      and seat.user_id is null
      and seat.delegation_id is null
      and seat.is_available
  );

  if unusable_seats > 0 then
    raise exception 'One of those seats is taken, hidden, or not part of this conference';
  end if;

  update public.seats
  set delegation_id = allocate_delegation_seats.delegation_id,
      allocated_at = now()
  where id = any (allocate_delegation_seats.seat_ids);

  if delegation.status = 'submitted' then
    update public.delegations
    set status = 'accepted',
        decided_at = now(),
        decided_by = me
    where id = allocate_delegation_seats.delegation_id;
  end if;

  -- T17 creates the group invoice here: one line for the number of seats, at
  -- the delegation_member fee that applies at this moment. 06-features/fees.md.
end;
$$;

revoke execute on function public.allocate_delegation_seats(uuid, uuid[]) from public, anon;
grant execute on function public.allocate_delegation_seats(uuid, uuid[]) to authenticated;


-- -----------------------------------------------------------------------------
-- remove_delegation_seat(seat_id)
-- -----------------------------------------------------------------------------
-- Giving a reserved seat back, before anybody was put in it. A seat somebody is
-- already sitting in goes through revoke_seat instead, because that is a
-- decision about a person and not about a count.

create or replace function public.remove_delegation_seat(seat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  seat public.seats;
  seat_conference uuid;
begin
  -- Two statements, because PL/pgSQL refuses to fill a whole-row variable and a
  -- plain one from the same "into" list.
  select *
  into seat
  from public.seats as seat_row
  where seat_row.id = remove_delegation_seat.seat_id;

  select committee.conference_id
  into seat_conference
  from public.committees as committee
  where committee.id = seat.committee_id;

  if seat.id is null then
    raise exception 'That seat does not exist';
  end if;

  if not public.can_manage_conference(seat_conference) then
    raise exception 'Only the organisers of this conference can free a seat';
  end if;

  if seat.delegation_id is null then
    raise exception 'That seat is not reserved for a delegation';
  end if;

  if seat.user_id is not null then
    raise exception 'Somebody is sitting in that seat. Revoke it instead.';
  end if;

  update public.seats
  set delegation_id = null,
      allocated_at = null
  where id = remove_delegation_seat.seat_id;

  -- T17 does the money here: an unpaid group invoice is voided and reissued for
  -- the seats that are left, and a paid one is left alone with a note telling
  -- the organiser to refund by hand. 06-features/fees.md.
end;
$$;

revoke execute on function public.remove_delegation_seat(uuid) from public, anon;
grant execute on function public.remove_delegation_seat(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- revoke_seat(seat_id)
-- -----------------------------------------------------------------------------
-- Taking a seat back off a person. The delegation keeps its reservation,
-- because the group still paid for that many seats and the head can put
-- somebody else in it; only the person is removed.

create or replace function public.revoke_seat(seat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  seat public.seats;
  seat_conference uuid;
begin
  -- Two statements, because PL/pgSQL refuses to fill a whole-row variable and a
  -- plain one from the same "into" list.
  select *
  into seat
  from public.seats as seat_row
  where seat_row.id = revoke_seat.seat_id;

  select committee.conference_id
  into seat_conference
  from public.committees as committee
  where committee.id = seat.committee_id;

  if seat.id is null then
    raise exception 'That seat does not exist';
  end if;

  if not public.can_manage_conference(seat_conference) then
    raise exception 'Only the organisers of this conference can revoke a seat';
  end if;

  if seat.user_id is null then
    raise exception 'Nobody is sitting in that seat';
  end if;

  -- The individual application that won this seat is rejected with it, so the
  -- applicant's own page stops saying they are coming.
  if seat.application_id is not null then
    update public.applications
    set status = 'rejected',
        decided_at = now(),
        decided_by = me
    where id = seat.application_id;
  end if;

  -- The delegation keeps its reservation, and with it the moment that
  -- reservation was made; see move_delegate above for why.
  update public.seats
  set user_id = null,
      application_id = null,
      allocated_at = case when delegation_id is null then null else allocated_at end
  where id = revoke_seat.seat_id;

  -- T34 deletes the seat's position paper row here; the file itself is removed
  -- by the app, which is the only thing that may talk to storage.
  -- T17 voids the unpaid invoice. A paid one stays, and the page tells the
  -- organiser to refund by hand.
end;
$$;

revoke execute on function public.revoke_seat(uuid) from public, anon;
grant execute on function public.revoke_seat(uuid) to authenticated;


-- =============================================================================
-- Notifications
-- =============================================================================
-- The bell in the app shell. specs/02-architecture/notifications.md says only
-- database triggers ever insert a row, so that no page can forget to send one
-- and no page can send one twice. These are the first five; the rest arrive
-- with the tables they are about.
--
-- Every one of them is "security definer", because notifications has no insert
-- policy at all and a trigger running as the organiser could not write a row
-- for the applicant.

-- -----------------------------------------------------------------------------
-- conference_audience_user_ids(conference_id, audience, committee_id, delegation_id)
-- -----------------------------------------------------------------------------
-- Who an announcement or a schedule change goes to, written once so that the
-- two triggers that need it cannot drift apart. The announcements and schedule
-- tables themselves arrive in task T34; the function is here because this is
-- the migration that first knows what a participant is.
--
-- committee_id and delegation_id are only read for the audience that names one,
-- and are null for the other four.

create or replace function public.conference_audience_user_ids(
  conference_id uuid,
  audience public.audience,
  committee_id uuid default null,
  delegation_id uuid default null
)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Who is taking part in a conference is the team's to know and nobody
  -- else's. Without this line any signed-in stranger could ask for the
  -- 'delegates' list of any conference and turn the ids into names through
  -- profiles, which everybody signed in may read. That is exactly what the
  -- seats policy and the public_seats view exist to prevent, so the function
  -- has to ask the same question they do.
  --
  -- It is written here rather than as a policy because a function has no
  -- policies. It stays security definer, because the lists it adds up come
  -- from tables even an organiser may not read whole -- organization_members
  -- is the clear one -- and because the notify_* triggers of task T34 call it
  -- while writing rows the caller could not write themselves. Those triggers
  -- run inside the request of the person who published the announcement or the
  -- schedule change, so this check is that person's own and not a second one
  -- they have to pass.
  --
  -- can_manage_conference and not is_conference_staff, although the wider one
  -- is enough for the seats half of the answer. The delegation branches return
  -- delegation_members.user_id, and permissions.md gives that table to "member
  -- of the same delegation; org." alone -- so a chair or a volunteer, who is
  -- staff and reads no delegation_members row of their own, would learn from
  -- this function who is in a school's group. /manage/[slug]/* is behind
  -- can_manage_conference anyway, which is where the only caller lives.
  if not public.can_manage_conference(conference_audience_user_ids.conference_id) then
    raise exception 'Only the organisers of a conference can see who takes part in it';
  end if;

  -- The two audiences that name one committee or one delegation have to name
  -- one of this conference's. Without these the check above is true of the
  -- conference_id and of nothing else: anybody signed in may create an
  -- organisation and a conference of their own, which makes them staff of it,
  -- and could then hand in their own conference id with somebody else's
  -- committee id and read that committee's delegates.
  if conference_audience_user_ids.audience = 'committee'
    and not exists (
      select 1
      from public.committees as committee
      where committee.id = conference_audience_user_ids.committee_id
        and committee.conference_id = conference_audience_user_ids.conference_id
    )
  then
    raise exception 'That committee is not part of this conference';
  end if;

  if conference_audience_user_ids.audience = 'delegation'
    and not exists (
      select 1
      from public.delegations as delegation
      where delegation.id = conference_audience_user_ids.delegation_id
        and delegation.conference_id = conference_audience_user_ids.conference_id
    )
  then
    raise exception 'That delegation is not part of this conference';
  end if;

  return query
  -- Everybody sitting in a committee of this conference.
  select seat.user_id
  from public.seats as seat
  join public.committees as committee on committee.id = seat.committee_id
  where committee.conference_id = conference_audience_user_ids.conference_id
    and seat.user_id is not null
    and conference_audience_user_ids.audience in ('everyone', 'delegates')

  union

  -- Everybody in a delegation of this conference, seated or not yet.
  select membership.user_id
  from public.delegation_members as membership
  join public.delegations as delegation on delegation.id = membership.delegation_id
  where delegation.conference_id = conference_audience_user_ids.conference_id
    and conference_audience_user_ids.audience in ('everyone', 'delegates')

  union

  -- The team: staff rows plus the members of the organisation running it.
  select staff.user_id
  from public.conference_staff as staff
  where staff.conference_id = conference_audience_user_ids.conference_id
    and conference_audience_user_ids.audience in ('everyone', 'staff')

  union

  select membership.user_id
  from public.organization_members as membership
  join public.conferences as conference
    on conference.organization_id = membership.organization_id
  where conference.id = conference_audience_user_ids.conference_id
    and conference_audience_user_ids.audience in ('everyone', 'staff')

  union

  -- One committee: the delegates sitting in it and the people chairing it.
  select seat.user_id
  from public.seats as seat
  where seat.committee_id = conference_audience_user_ids.committee_id
    and seat.user_id is not null
    and conference_audience_user_ids.audience = 'committee'

  union

  select chair.user_id
  from public.committee_chairs as chair
  where chair.committee_id = conference_audience_user_ids.committee_id
    and conference_audience_user_ids.audience = 'committee'

  union

  -- One delegation.
  select membership.user_id
  from public.delegation_members as membership
  where membership.delegation_id = conference_audience_user_ids.delegation_id
    and conference_audience_user_ids.audience = 'delegation';
end;
$$;

revoke execute on function public.conference_audience_user_ids(uuid, public.audience, uuid, uuid)
  from public, anon;
grant execute on function public.conference_audience_user_ids(uuid, public.audience, uuid, uuid)
  to authenticated;


-- -----------------------------------------------------------------------------
-- notify_application_decided()
-- -----------------------------------------------------------------------------
-- "Your application to Amsterdam Open MUN 2027 was accepted." A decision is the
-- one thing an applicant is waiting for, so it is the one notification the
-- applications table sends.

create or replace function public.notify_application_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conference_name text;
  decision_word text;
begin
  if new.status = old.status or new.status not in ('accepted', 'rejected', 'waitlisted') then
    return new;
  end if;

  select conference.name
  into conference_name
  from public.conferences as conference
  where conference.id = new.conference_id;

  -- "rejected" is the database's word for it, not a word we say to a person.
  decision_word = case new.status
    when 'accepted' then 'accepted'
    when 'waitlisted' then 'waitlisted'
    else 'not accepted'
  end;

  insert into public.notifications (user_id, conference_id, kind, title, link_path)
  values (
    new.user_id,
    new.conference_id,
    'application_decided',
    'Your application to ' || conference_name || ' was ' || decision_word,
    '/applications/' || new.id
  );

  return new;
end;
$$;

revoke execute on function public.notify_application_decided() from public, anon, authenticated;

create trigger applications_notify_decided
  after update of status on public.applications
  for each row
  execute function public.notify_application_decided();


-- -----------------------------------------------------------------------------
-- notify_delegation_decided()
-- -----------------------------------------------------------------------------
-- The same news for a group, and it goes to every head rather than to one
-- person, because either of them may be the one watching for it.

create or replace function public.notify_delegation_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conference_name text;
  decision_word text;
begin
  if new.status = old.status or new.status not in ('accepted', 'rejected') then
    return new;
  end if;

  select conference.name
  into conference_name
  from public.conferences as conference
  where conference.id = new.conference_id;

  decision_word = case new.status when 'accepted' then 'accepted' else 'not accepted' end;

  insert into public.notifications (user_id, conference_id, kind, title, link_path)
  select
    head.user_id,
    new.conference_id,
    'delegation_decided',
    'Your delegation request for ' || conference_name || ' was ' || decision_word,
    '/delegations/' || new.id
  from public.delegation_members as head
  where head.delegation_id = new.id
    and head.role = 'head';

  return new;
end;
$$;

revoke execute on function public.notify_delegation_decided() from public, anon, authenticated;

create trigger delegations_notify_decided
  after update of status on public.delegations
  for each row
  execute function public.notify_delegation_decided();


-- -----------------------------------------------------------------------------
-- notify_seat_allocated() and notify_delegation_seat_assigned()
-- -----------------------------------------------------------------------------
-- Both fire when a seat gains a user_id, and specs/02-architecture/notifications.md
-- gives them different words. They are kept apart by how the person got there:
-- an individual applicant is told they represent a country, a delegation member
-- is told their head assigned them one. A seat with a delegation_id is the
-- second case, a seat without it the first, so exactly one of the two speaks
-- and nobody is told twice.

create or replace function public.notify_seat_allocated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  committee_name text;
  the_conference uuid;
  link text;
begin
  if new.user_id is null or new.user_id is not distinct from old.user_id then
    return new;
  end if;

  if new.delegation_id is not null then
    return new;
  end if;

  select
    committee.name,
    committee.conference_id,
    '/conferences/' || conference.slug || '/committees/' || committee.slug
  into committee_name, the_conference, link
  from public.committees as committee
  join public.conferences as conference on conference.id = committee.conference_id
  where committee.id = new.committee_id;

  insert into public.notifications (user_id, conference_id, kind, title, link_path)
  values (
    new.user_id,
    the_conference,
    'seat_allocated',
    'You represent ' || new.name || ' in ' || committee_name,
    link
  );

  return new;
end;
$$;

revoke execute on function public.notify_seat_allocated() from public, anon, authenticated;

create trigger seats_notify_allocated
  after update of user_id on public.seats
  for each row
  execute function public.notify_seat_allocated();


create or replace function public.notify_delegation_seat_assigned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  committee_name text;
  the_conference uuid;
  link text;
begin
  if new.user_id is null or new.user_id is not distinct from old.user_id then
    return new;
  end if;

  if new.delegation_id is null then
    return new;
  end if;

  select
    committee.name,
    committee.conference_id,
    '/conferences/' || conference.slug || '/committees/' || committee.slug
  into committee_name, the_conference, link
  from public.committees as committee
  join public.conferences as conference on conference.id = committee.conference_id
  where committee.id = new.committee_id;

  insert into public.notifications (user_id, conference_id, kind, title, link_path)
  values (
    new.user_id,
    the_conference,
    'delegation_seat_assigned',
    'You were assigned ' || new.name || ' in ' || committee_name,
    link
  );

  return new;
end;
$$;

revoke execute on function public.notify_delegation_seat_assigned()
  from public, anon, authenticated;

create trigger seats_notify_delegation_seat_assigned
  after update of user_id on public.seats
  for each row
  execute function public.notify_delegation_seat_assigned();


-- -----------------------------------------------------------------------------
-- notify_delegation_seats()
-- -----------------------------------------------------------------------------
-- "8 seats were allocated to Lycee Francais Delegation." One message for the
-- whole allocation, not one per seat, which is why this is the only trigger in
-- the app that fires once per statement instead of once per row.
--
-- "referencing old table / new table" gives a statement-level trigger two
-- read-only tables holding every row as it was and as it now is. Joining them
-- on id is how the function sees which seats really gained a delegation, and
-- counting that join is the number in the sentence. A row-level trigger could
-- not do it: it is called once per row and has no idea how many others there
-- were.

create or replace function public.notify_delegation_seats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, conference_id, kind, title, link_path)
  select
    head.user_id,
    delegation.conference_id,
    'delegation_seat_assigned',
    case
      when newly_reserved.seat_count = 1 then '1 seat was'
      else newly_reserved.seat_count || ' seats were'
    end || ' allocated to ' || delegation.name,
    '/delegations/' || delegation.id || '/seats'
  from (
    select new_seat.delegation_id, count(*)::integer as seat_count
    from new_seats as new_seat
    join old_seats as old_seat on old_seat.id = new_seat.id
    where new_seat.delegation_id is not null
      and old_seat.delegation_id is null
    group by new_seat.delegation_id
  ) as newly_reserved
  join public.delegations as delegation on delegation.id = newly_reserved.delegation_id
  join public.delegation_members as head on head.delegation_id = delegation.id
  where head.role = 'head';

  return null;
end;
$$;

revoke execute on function public.notify_delegation_seats() from public, anon, authenticated;

create trigger seats_notify_delegation_seats
  after update on public.seats
  referencing old table as old_seats new table as new_seats
  for each statement
  execute function public.notify_delegation_seats();


-- =============================================================================
-- Row Level Security
-- =============================================================================
-- Every rule below is one row of the policy matrix in
-- specs/02-architecture/permissions.md, with a test in client/tests/db/ for the
-- allowed and for the refused case.


-- -----------------------------------------------------------------------------
-- application_questions
-- -----------------------------------------------------------------------------
-- The questions are part of the application form, so anybody who can see the
-- conference can see them, the same two-policy "or" the committees table uses:
-- visitors see published and archived conferences, staff see their own draft.

alter table public.application_questions enable row level security;

-- The rule is written as a sub-select rather than as conference_is_published,
-- although that helper says exactly this. Every helper in permissions.md is
-- granted to "authenticated" only, so a signed-out visitor calling one gets
-- "permission denied for function", and a visitor is half of who this policy is
-- for. The committees policy in migration 0003 is written out for the same
-- reason.
create policy "Anyone can read the questions of a published conference"
  on public.application_questions
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.conferences as conference
      where conference.id = application_questions.conference_id
        and conference.status in ('published', 'archived')
    )
  );

create policy "Staff can read the questions of their conference"
  on public.application_questions
  for select
  to authenticated
  using (public.is_conference_staff(conference_id));

create policy "Organisers can add a question"
  on public.application_questions
  for insert
  to authenticated
  with check (public.can_manage_conference(conference_id));

create policy "Organisers can change a question"
  on public.application_questions
  for update
  to authenticated
  using (public.can_manage_conference(conference_id))
  with check (public.can_manage_conference(conference_id));

create policy "Organisers can delete a question"
  on public.application_questions
  for delete
  to authenticated
  using (public.can_manage_conference(conference_id));


-- -----------------------------------------------------------------------------
-- applications
-- -----------------------------------------------------------------------------
-- An application is between one person and the organisers, and nobody else.
-- There is no chair policy and no delegate policy: a committee's chair reads
-- the seat, not the application that won it.

alter table public.applications enable row level security;

create policy "Applicants can read their own application"
  on public.applications
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Organisers can read the applications to their conference"
  on public.applications
  for select
  to authenticated
  using (public.can_manage_conference(conference_id));

-- Applying is only possible while the conference is published, says it takes
-- individual applications, and is inside its own window. A null bound means
-- open on that side, which is why each date is only compared when it is set.
create policy "A signed-in person can apply to an open conference"
  on public.applications
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.conferences as conference
      where conference.id = applications.conference_id
        and conference.status = 'published'
        and conference.accepts_individual_applications
        and (conference.applications_open_at is null or conference.applications_open_at <= now())
        and (conference.applications_close_at is null or conference.applications_close_at >= now())
    )
  );

-- Which columns each of the two may write is the guard_application_update
-- trigger's job, because a policy cannot restrict columns.
create policy "Applicants can edit their own application while it is open"
  on public.applications
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and status in ('draft', 'submitted', 'waitlisted')
  )
  with check (user_id = (select auth.uid()));

create policy "Organisers can decide an application"
  on public.applications
  for update
  to authenticated
  using (public.can_manage_conference(conference_id))
  with check (public.can_manage_conference(conference_id));

-- Deleting a draft throws away nothing anybody was waiting for, because a
-- draft has not been sent: once it is submitted the applicant withdraws it
-- instead, which leaves a row the organiser can still see.
--
-- It does not mean nobody can read a draft. The applications select policy is
-- "self; org.", the whole row either way, so an organiser of the conference
-- reads an unsent motivation if they ask for it. Keeping drafts off their
-- screen is the query's job and not the database's:
-- 05-pages/organiser/applications.md and application-review.md both filter
-- them out, and nothing here will catch it if a page forgets.
create policy "Applicants can delete their own draft"
  on public.applications
  for delete
  to authenticated
  using (user_id = (select auth.uid()) and status = 'draft');


-- -----------------------------------------------------------------------------
-- delegations
-- -----------------------------------------------------------------------------
-- Somebody holding the join code but not yet in the group reads nothing here.
-- They call preview_delegation(code) instead, which hands out a fixed handful
-- of fields and no more.

alter table public.delegations enable row level security;

create policy "Members can read their own delegation"
  on public.delegations
  for select
  to authenticated
  using (public.is_delegation_member(id));

create policy "Organisers can read the delegations of their conference"
  on public.delegations
  for select
  to authenticated
  using (public.can_manage_conference(conference_id));

-- create_delegation is what the page actually calls, because the delegation and
-- its first head have to appear together. The policy is still here, because
-- without it the insert inside that function would be the only way a row could
-- ever exist and the matrix says a signed-in person may register a group.
create policy "A signed-in person can register a delegation at an open conference"
  on public.delegations
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.conferences as conference
      where conference.id = delegations.conference_id
        and conference.status = 'published'
        and conference.accepts_delegations
        and (conference.applications_open_at is null or conference.applications_open_at <= now())
        and (conference.applications_close_at is null or conference.applications_close_at >= now())
    )
  );

create policy "Heads can edit their own delegation"
  on public.delegations
  for update
  to authenticated
  using (public.is_delegation_head(id))
  with check (public.is_delegation_head(id));

create policy "Organisers can decide a delegation"
  on public.delegations
  for update
  to authenticated
  using (public.can_manage_conference(conference_id))
  with check (public.can_manage_conference(conference_id));

create policy "Heads can delete their own delegation while it is a draft"
  on public.delegations
  for delete
  to authenticated
  using (public.is_delegation_head(id) and status = 'draft');


-- -----------------------------------------------------------------------------
-- delegation_members
-- -----------------------------------------------------------------------------
-- There is no insert policy on purpose. Joining goes through
-- join_delegation(code), because the code is the permission and a policy that
-- could check it would have to let anybody read the table to do so.

alter table public.delegation_members enable row level security;

create policy "Members can read who else is in their delegation"
  on public.delegation_members
  for select
  to authenticated
  using (public.is_delegation_member(delegation_id));

create policy "Organisers can read the members of a delegation at their conference"
  on public.delegation_members
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.delegations as delegation
      where delegation.id = delegation_members.delegation_id
        and public.can_manage_conference(delegation.conference_id)
    )
  );

-- Promoting a member to head, and demoting one, guarded by
-- prevent_last_delegation_head_removal.
create policy "Heads can change a member's role"
  on public.delegation_members
  for update
  to authenticated
  using (public.is_delegation_head(delegation_id))
  with check (public.is_delegation_head(delegation_id));

-- Somebody already sitting in a seat cannot be removed and cannot leave: their
-- seat would keep a delegate who is no longer in the delegation, which
-- check_seat_allocation would never have allowed in the first place. The head
-- unassigns the seat first.
create policy "Heads can remove a member, and a member can leave"
  on public.delegation_members
  for delete
  to authenticated
  using (
    (public.is_delegation_head(delegation_id) or user_id = (select auth.uid()))
    and not exists (
      select 1
      from public.seats as seat
      where seat.delegation_id = delegation_members.delegation_id
        and seat.user_id = delegation_members.user_id
    )
  );


-- -----------------------------------------------------------------------------
-- seats: the two halves earlier migrations could not write
-- -----------------------------------------------------------------------------
-- Migration 0003 said both of these would arrive here. The select policy asked
-- is_committee_delegate, so a delegate saw their own committee's seat list and
-- not the conference's other committees; the matrix says "participant", which
-- now has a meaning. The update policy had only the organiser's half.

drop policy "Delegates and staff can read a seat list" on public.seats;

create policy "Participants and staff can read a seat list"
  on public.seats
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.committees as committee
      where committee.id = seats.committee_id
        and (
          public.is_conference_participant(committee.conference_id)
          or public.is_conference_staff(committee.conference_id)
        )
    )
  );

-- The head's narrow write. Which columns they may change, and that they may
-- only do it before the conference starts, is check_seat_allocation's job:
-- a policy decides rows, not columns.
create policy "Delegation heads can seat a member of their own delegation"
  on public.seats
  for update
  to authenticated
  using (delegation_id is not null and public.is_delegation_head(delegation_id))
  with check (delegation_id is not null and public.is_delegation_head(delegation_id));


-- -----------------------------------------------------------------------------
-- profile_details: the two readers migration 0002 could not name
-- -----------------------------------------------------------------------------
-- Phone number, dietary requirements and emergency contact. Migration 0002 gave
-- them to the person alone and said the other two readers needed these tables.
-- They are the two people who have to act on them: the organiser who books the
-- meals and calls the number when something happens, and the head of the school
-- delegation who is responsible for a minor in their care.
--
-- The sub-selects read seats, applications and delegation_members as the
-- caller, so Row Level Security applies inside them too. That is why each one
-- is safe: an organiser only sees the rows of their own conference, and a head
-- only the memberships of their own delegation, so the "exists" cannot be true
-- for somebody they have nothing to do with.

create policy "Organisers can read the details of somebody at their conference"
  on public.profile_details
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.applications as application
      where application.user_id = profile_details.user_id
        and application.status <> 'draft'
        and public.can_manage_conference(application.conference_id)
    )
    or exists (
      select 1
      from public.seats as seat
      join public.committees as committee on committee.id = seat.committee_id
      where seat.user_id = profile_details.user_id
        and public.can_manage_conference(committee.conference_id)
    )
    or exists (
      select 1
      from public.delegation_members as membership
      join public.delegations as delegation on delegation.id = membership.delegation_id
      where membership.user_id = profile_details.user_id
        and public.can_manage_conference(delegation.conference_id)
    )
  );

create policy "A delegation head can read the details of their own members"
  on public.profile_details
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.delegation_members as membership
      where membership.user_id = profile_details.user_id
        and public.is_delegation_head(membership.delegation_id)
    )
  );


-- -----------------------------------------------------------------------------
-- conference_staff: the participant's half
-- -----------------------------------------------------------------------------
-- The "meet the team" list. Migration 0002 gave the whole team to the team and
-- said this half needed a table that says who a participant is. A participant
-- sees the people they may have to write to, and not the volunteers.

create policy "Participants can see the organisers and chairs of their conference"
  on public.conference_staff
  for select
  to authenticated
  using (
    role in ('organiser', 'chair')
    and public.is_conference_participant(conference_id)
  );
