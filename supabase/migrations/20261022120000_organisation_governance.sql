-- =============================================================================
-- Who runs an organisation is decided by the database, not by the settings page
-- =============================================================================
-- Findings H3, M1, M16, L2 and L65 of docs/security-review-2026-10-10.md.
--
-- Every organization_members policy stopped at is_organization_admin, which
-- counts owners and admins alike. The rule "only an owner may grant or take
-- away owner" lived in the changeRole action of the organisation settings page
-- alone, so anybody holding the publishable key and an admin's session could
-- make themselves an owner, demote the real owners and remove them (M1, M16).
-- The same admin could update created_by and is_personal on the organisation
-- (H3): pointing created_by at a victim and setting is_personal makes the
-- attacker's organisation the victim's "Quick sessions" one, the partial unique
-- index on (created_by) where is_personal stops the victim ever getting their
-- own, and every quick session the victim starts then lands where the attacker
-- is an owner. create_quick_session trusted whatever that lookup found. It also
-- let one account start as many quick sessions as it liked (L65), and
-- prevent_last_owner_removal counted owners without a lock, so two owners
-- leaving at the same moment could leave none (L2).
--
-- This file:
--
--   * adds is_organization_owner, the owner-only twin of is_organization_admin;
--   * adds protect_organizations_ownership_columns and its trigger, which refuse
--     a browser changing created_by or is_personal;
--   * makes prevent_last_owner_removal again, taking an advisory lock on the
--     organisation before it counts owners;
--   * makes the organization_members policies again: an owner's row is only
--     ever changed or removed by an owner, nobody inserts a row by hand, and a
--     browser may update nothing but the role column;
--   * adds protect_quick_session_days and its trigger on conferences, which
--     refuse a browser moving a quick session's first or last day, changing its
--     timezone or making it an ordinary conference;
--   * makes create_quick_session again: the personal organisation it finds has
--     to be owned by the caller, and a person may have 25 live quick sessions,
--     counted under a lock on that organisation.
--
-- The database tests are in client/tests/db/security-organisation-governance.test.ts.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- is_organization_owner(org_id)
-- -----------------------------------------------------------------------------
-- Is the signed-in user an owner of this organisation? The same shape as
-- is_organization_admin in 20260915130000: "security definer" because the
-- policies on organization_members itself ask it, and a policy that read the
-- table it guards as the caller would loop; "set search_path = ''" so that
-- every name in the body is absolute.

create or replace function public.is_organization_owner(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id = org_id
      and membership.user_id = (select auth.uid())
      and membership.role = 'owner'
  );
$$;

revoke execute on function public.is_organization_owner(uuid) from public, anon;
grant execute on function public.is_organization_owner(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- Trigger: who created an organisation, and whether it is personal, never
-- changes from a browser
-- -----------------------------------------------------------------------------
-- The two columns are part of the row's identity, not of its content: no page
-- writes either, and create_quick_session finds a person's personal
-- organisation by them. Only the app's own roles are held to this, the way
-- protect_stripe_columns and protect_conferences_columns say it: the service
-- role writes organisations in the tests and may one day in a support script.

create or replace function public.protect_organizations_ownership_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and (
    new.created_by is distinct from old.created_by
    or new.is_personal is distinct from old.is_personal
  ) then
    raise exception 'The creator of an organisation and whether it is personal can only be changed by the server';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_organizations_ownership_columns() from public, anon, authenticated;

create trigger organizations_protect_ownership_columns
  before update on public.organizations
  for each row
  execute function public.protect_organizations_ownership_columns();


-- -----------------------------------------------------------------------------
-- prevent_last_owner_removal, made again with a lock
-- -----------------------------------------------------------------------------
-- The body is 20260915130000's with one line added. Two owners leaving in two
-- requests at once each counted the other, and both left. pg_advisory_xact_lock
-- makes the second wait for the first to commit, after which it counts again
-- in a fresh snapshot and finds itself alone. The lock is keyed on the
-- organisation, so unrelated organisations never wait for each other, and it
-- is released with the transaction.

create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  other_owners integer;
begin
  -- Deleting the organisation itself deletes every membership with it. There is
  -- no organisation left to be without an owner, so there is nothing to guard.
  -- The parent row is already gone by the time this runs.
  if tg_op = 'DELETE' and not exists (
    select 1
    from public.organizations as organization
    where organization.id = old.organization_id
  ) then
    return old;
  end if;

  -- Removing or changing somebody who is not an owner is always fine.
  if old.role <> 'owner' then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  -- An update that leaves them an owner changes nothing about this rule.
  if tg_op = 'UPDATE' and new.role = 'owner' then
    return new;
  end if;

  -- One owner at a time per organisation past this point (see above).
  perform pg_advisory_xact_lock(hashtext(old.organization_id::text));

  select count(*)
  into other_owners
  from public.organization_members as membership
  where membership.organization_id = old.organization_id
    and membership.role = 'owner'
    and membership.user_id <> old.user_id;

  if other_owners = 0 then
    raise exception 'An organisation must always have at least one owner';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke execute on function public.prevent_last_owner_removal() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- organization_members policies, made again
-- -----------------------------------------------------------------------------
-- The read policy stays. The three writing policies go, and two come back.
--
-- No insert policy. The app never inserts into this table directly: a member
-- arrives by accepting an invitation (accept_invite, which runs as the
-- database's own owner and checks the invitation was sent to the account's
-- address), and an organisation's creator by the add_organization_creator_as_owner
-- trigger. The old policy let an admin add any account to any organisation of
-- theirs without that account's consent, which is the last step of the H3
-- hijack. A row nobody may insert needs no policy, and the tests arrange one
-- through the service role when they need a second member.
--
-- Update and delete: an owner's row is touched by an owner alone. The old role
-- is asked about in USING, so an admin never sees an owner's row to change or
-- remove, and the new role in WITH CHECK, so an admin cannot make anybody,
-- themselves included, an owner. Anybody may still leave by themselves, and
-- prevent_last_owner_removal still keeps the last owner in place whoever asks.
--
-- A policy decides which rows may change, not which columns, and an update of
-- user_id or organization_id would be a second way of putting an account into
-- an organisation without its consent. The grant below the policies therefore
-- lets a browser update the role column and nothing else: PostgreSQL refuses
-- the other columns with "permission denied" before any policy is asked. The
-- functions that write whole rows run as the database's own owner and are not
-- held to it.

drop policy "Organization admins can add a member" on public.organization_members;
drop policy "Organization admins can change a member's role" on public.organization_members;
drop policy "Admins can remove a member, and anybody can leave" on public.organization_members;

create policy "Admins change roles below owner, owners change any role"
  on public.organization_members
  for update
  to authenticated
  using (
    public.is_organization_admin(organization_id)
    and (role <> 'owner' or public.is_organization_owner(organization_id))
  )
  with check (
    public.is_organization_admin(organization_id)
    and (role <> 'owner' or public.is_organization_owner(organization_id))
  );

create policy "Admins remove members below owner, owners remove anybody, anybody leaves"
  on public.organization_members
  for delete
  to authenticated
  using (
    (
      public.is_organization_admin(organization_id)
      and (role <> 'owner' or public.is_organization_owner(organization_id))
    )
    or user_id = (select auth.uid())
  );

revoke update on public.organization_members from anon, authenticated;
grant update (role) on public.organization_members to authenticated;


-- -----------------------------------------------------------------------------
-- Trigger: a quick session's days and timezone are the database's
-- -----------------------------------------------------------------------------
-- create_quick_session below counts a person's live quick sessions: those
-- whose last day has not yet passed in their own timezone. The owner of the
-- personal organisation may edit its conferences, so without this they could
-- empty that count through the conferences update policy and start again from
-- nought, in two ways: by moving every last day into the past, or by moving
-- every session to a timezone where that day has already passed (twenty-five
-- sessions made in Etc/GMT+12 and then moved to Pacific/Kiritimati, twenty-six
-- hours ahead, are all over whatever the hour). Both columns are held, and so
-- is the kind, so a quick session cannot be renamed an ordinary conference to
-- leave the count. The dates and timezone of a quick session are only ever
-- written by the database: create_quick_session sets them when it is made, and
-- move_quick_session_end_date, which runs as the database's own owner and so
-- is not a browser here, moves the last day forward when a later session
-- starts. Holding the timezone also stops a browser writing one Postgres does
-- not know, after which the count, and so create_quick_session, would fail
-- for that account for ever. As in protect_conferences_columns, only the app's
-- own roles are held to this: the service role moves these dates in the
-- browser tests.

create or replace function public.protect_quick_session_days()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
    and old.kind = 'quick_session'
    and (
      new.start_date is distinct from old.start_date
      or new.end_date is distinct from old.end_date
      or new.timezone is distinct from old.timezone
      or new.kind is distinct from old.kind
    )
  then
    raise exception 'The days and timezone of a quick session are set by the database, and it stays a quick session';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_quick_session_days() from public, anon, authenticated;

create trigger conferences_protect_quick_session_days
  before update on public.conferences
  for each row
  execute function public.protect_quick_session_days();


-- -----------------------------------------------------------------------------
-- create_quick_session, made again
-- -----------------------------------------------------------------------------
-- The body is 20261001121500's with two checks added after the personal
-- organisation is found or made:
--
--   * the caller has to be an owner of it. The trigger above now stops a
--     browser planting a personal organisation on somebody else, but a row
--     that nevertheless says "yours" while holding no owner row for the caller
--     is refused with a sentence rather than used, instead of failing further
--     down on the conferences insert policy with no explanation;
--   * a person may have 25 live quick sessions. A quick session is kept a draft
--     for ever by conferences_quick_session_is_draft and nothing in the app
--     archives one, so "live" is decided by its last day: one whose end_date,
--     in its own timezone, has not passed. Both that day and the timezone it
--     is read in are the database's to write (protect_quick_session_days
--     above), so a browser can neither backdate a session nor move it to a
--     zone where its day is already over; the count only falls as days pass,
--     or when the owner deletes a quick session outright, which the conferences
--     delete policy allows for a draft and which frees the place together with
--     everything the session held. The count is made under an advisory lock on
--     the personal organisation, so two requests at once cannot both count 24
--     and both go through. Twenty-five is a bound on what one account can make
--     the database hold at a time, not a limit a chair running one session an
--     evening will ever meet. Should a quick session one day be archived, an
--     archived one is not live either.
--
-- Everything else is exactly as before. The grants are restated so the file
-- says what a browser may call; the signature is unchanged, so they would have
-- carried over anyway.

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
  -- How many quick sessions one person may have live at a time (see above).
  most_live_quick_sessions constant integer := 25;
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
  live_quick_sessions integer;
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
  -- or 'America/Argentina/Buenos_Aires' (see 20261001121500).
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

  -- Whichever way it was found, it is only used if the caller owns it. A
  -- freshly made one has its owner row from add_organization_creator_as_owner
  -- by now; one that says "created by me" without that row is not theirs.
  if not public.is_organization_owner(personal_organization_id) then
    raise exception 'The organisation that holds your quick sessions is not owned by you. Please contact MUNMeet before starting another.';
  end if;

  -- The cap (see above). One request at a time per personal organisation from
  -- here to the end of the transaction, so that the count below sees what a
  -- request ahead of it committed. The key is this function's own, so it
  -- never waits on prevent_last_owner_removal's lock for the same
  -- organisation. The caller owns the organisation and so reads every
  -- conference in it, so the count sees them all.
  perform pg_advisory_xact_lock(hashtext('create_quick_session:' || personal_organization_id::text));

  select count(*)
  into live_quick_sessions
  from public.conferences as conference
  where conference.organization_id = personal_organization_id
    and conference.kind = 'quick_session'
    and conference.status <> 'archived'
    and conference.end_date >= (now() at time zone conference.timezone)::date;

  if live_quick_sessions >= most_live_quick_sessions then
    raise exception 'You already have % quick sessions running. Start another once one of them is over.',
      most_live_quick_sessions;
  end if;

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
