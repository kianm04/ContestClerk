-- =============================================================================
-- Application teams: friends who apply to represent one country together
-- =============================================================================
--
-- WHAT THIS IS
-- Trello pZNcdPqU. Two or more people who apply to the same conference can ask
-- to represent one country together ("Umarbek and Kian want to be Kenya").
-- Each of them still sends their own application, with their own answers, and
-- each still ends up in a seat of their own: the team is given one country,
-- and every member takes that country's seat in a different committee. So a
-- seat keeps exactly one holder, and nothing on the delegate or chair side
-- changes.
--
-- This file:
--
--   * adds application_teams, and applications.team_id pointing at it
--   * adds the three functions an applicant calls on their own application:
--     start_application_team, join_application_team, leave_application_team
--   * adds application_team_names, which tells a member who else is in the team
--   * adds the two functions an organiser calls to change who is in a team:
--     team_applications and remove_application_from_team
--   * adds accept_application_team, which accepts every member into their own
--     seat of one country in one transaction, so a team is never left half in
--
-- Nobody writes team_id directly. guard_application_update leaves it out of
-- both lists of writable columns, and the functions below are security
-- definer, so they are the only way it changes.
--
-- This file is never edited once applied: a change is a new migration.


-- -----------------------------------------------------------------------------
-- application_teams
-- -----------------------------------------------------------------------------
-- A team is little more than its join code: who is in it is the applications
-- whose team_id points here. The code is what one friend gives the others, the
-- way a delegation's join code is.

create table public.application_teams (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences (id) on delete cascade,
  join_code text not null unique,
  created_at timestamptz not null default now()
);

create index application_teams_conference_idx on public.application_teams (conference_id);

-- "on delete set null": a team deleted under somebody leaves them applying alone.
alter table public.applications
  add column team_id uuid references public.application_teams (id) on delete set null;

create index applications_team_idx on public.applications (team_id);

-- applications_with_applicant is written `select application.*`, and Postgres
-- expanded that star when the view was made, so the view has to be made again
-- to carry team_id (see 20260922120000_applications_with_applicant_view.sql).
-- `create or replace` cannot put a column in the middle, so it is dropped and
-- made again exactly as before, grant included.
drop view public.applications_with_applicant;

create view public.applications_with_applicant
with (security_invoker = true) as
select
  application.*,
  applicant.full_name as applicant_name,
  applicant.avatar_path as applicant_avatar_path,
  applicant.institution_name as applicant_institution_name,
  applicant.country_code as applicant_country_code,
  applicant.experience_level as applicant_experience_level
from public.applications as application
left join public.profiles as applicant
  on applicant.id = application.user_id;

grant select on public.applications_with_applicant to authenticated;

alter table public.application_teams enable row level security;

-- Organisers read every team of their conference; a member reads their own.
-- There are no write policies: the functions below are the only writers.
create policy "Application readers can read the teams of their conference"
  on public.application_teams
  for select
  to authenticated
  using (conference_id in (select public.permitted_conference_ids('read_applications')));

create policy "Applicants can read their own team"
  on public.application_teams
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.applications as application
      where application.team_id = application_teams.id
        and application.user_id = (select auth.uid())
    )
  );


-- -----------------------------------------------------------------------------
-- new_application_team(conference_id): a team with a fresh join code
-- -----------------------------------------------------------------------------
-- Shared by the applicant's "Start a team" and the organiser's "Add to team".
-- Six characters from the same alphabet as a delegation's code, which leaves
-- out 0, O, 1 and I because people read them wrong.

create or replace function public.new_application_team(conference_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  code_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  fresh_code text;
  character_index integer;
  new_team uuid;
begin
  loop
    fresh_code = '';

    for character_index in 1..6 loop
      fresh_code = fresh_code
        || substr(code_alphabet, 1 + floor(random() * length(code_alphabet))::integer, 1);
    end loop;

    exit when not exists (
      select 1
      from public.application_teams as team
      where team.join_code = fresh_code
    );
  end loop;

  insert into public.application_teams (conference_id, join_code)
  values (new_application_team.conference_id, fresh_code)
  returning id into new_team;

  return new_team;
end;
$$;

-- Only the functions below call it.
revoke execute on function public.new_application_team(uuid) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- dissolve_lonely_application_team(team_id)
-- -----------------------------------------------------------------------------
-- A team of one is somebody applying alone, so once a member leaves and only
-- one is left, the team goes and the last member applies on their own again.

create or replace function public.dissolve_lonely_application_team(team_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if team_id is null then
    return;
  end if;

  if (
    select count(*)
    from public.applications as application
    where application.team_id = dissolve_lonely_application_team.team_id
  ) <= 1 then
    -- Deleting the team empties team_id on whoever is left, by the foreign key.
    delete from public.application_teams as team
    where team.id = dissolve_lonely_application_team.team_id;
  end if;
end;
$$;

revoke execute on function public.dissolve_lonely_application_team(uuid)
  from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- own_open_application(application_id): the applicant's side of every check
-- -----------------------------------------------------------------------------
-- The caller's own application, while they may still change it: the same three
-- statuses guard_application_update lets an applicant edit.

create or replace function public.own_open_application(application_id uuid)
returns public.applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  application public.applications;
begin
  select *
  into application
  from public.applications as application_row
  where application_row.id = own_open_application.application_id
    and application_row.user_id = (select auth.uid());

  if application.id is null then
    raise exception 'That application does not exist';
  end if;

  if application.status not in ('draft', 'submitted', 'waitlisted') then
    raise exception 'This application can no longer be changed';
  end if;

  return application;
end;
$$;

revoke execute on function public.own_open_application(uuid) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- The applicant's three functions
-- -----------------------------------------------------------------------------

-- Start a team with my application in it, and answer its join code.
create or replace function public.start_application_team(application_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  application public.applications := public.own_open_application(start_application_team.application_id);
  new_team uuid;
  code text;
begin
  if application.team_id is not null then
    raise exception 'You are already in a team for this conference';
  end if;

  new_team = public.new_application_team(application.conference_id);

  update public.applications
  set team_id = new_team
  where id = application.id;

  select team.join_code into code from public.application_teams as team where team.id = new_team;

  return code;
end;
$$;

revoke execute on function public.start_application_team(uuid) from public, anon;
grant execute on function public.start_application_team(uuid) to authenticated;

-- Join the team whose code a friend gave me, leaving any team I was in.
create or replace function public.join_application_team(application_id uuid, code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  application public.applications := public.own_open_application(join_application_team.application_id);
  team public.application_teams;
begin
  -- Codes are shown in capitals, but somebody may type them in small letters.
  select *
  into team
  from public.application_teams as team_row
  where team_row.join_code = upper(trim(join_application_team.code))
    and team_row.conference_id = application.conference_id;

  if team.id is null then
    raise exception 'That code does not belong to a team at this conference';
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

-- Leave my team and apply on my own again.
create or replace function public.leave_application_team(application_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  application public.applications := public.own_open_application(leave_application_team.application_id);
begin
  if application.team_id is null then
    raise exception 'You are not in a team';
  end if;

  update public.applications
  set team_id = null
  where id = application.id;

  perform public.dissolve_lonely_application_team(application.team_id);
end;
$$;

revoke execute on function public.leave_application_team(uuid) from public, anon;
grant execute on function public.leave_application_team(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- application_team_names(team_id): who is in a team
-- -----------------------------------------------------------------------------
-- An applicant can read only their own application, so they cannot look up
-- their teammates' rows. This answers their names, and only to a member of the
-- team or a reader of the conference's applications. Every profile is already
-- readable by any signed-in user, so a name is all it gives away.

create or replace function public.application_team_names(team_id uuid)
returns table (user_id uuid, full_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  team public.application_teams;
begin
  select * into team from public.application_teams as team_row where team_row.id = application_team_names.team_id;

  if team.id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.applications as application
    where application.team_id = team.id
      and application.user_id = (select auth.uid())
  ) and not public.has_permission(team.conference_id, 'read_applications') then
    return;
  end if;

  return query
  select application.user_id, profile.full_name
  from public.applications as application
  join public.profiles as profile on profile.id = application.user_id
  where application.team_id = team.id
  order by application.created_at;
end;
$$;

revoke execute on function public.application_team_names(uuid) from public, anon;
grant execute on function public.application_team_names(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- The organiser's two functions
-- -----------------------------------------------------------------------------

-- Put partner_application_id in the same team as application_id: into its team
-- when it has one, into the partner's team when only the partner has one, and
-- into a new team of the two when neither does.
create or replace function public.team_applications(
  application_id uuid,
  partner_application_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  application public.applications;
  partner public.applications;
  team uuid;
begin
  select * into application from public.applications as application_row where application_row.id = team_applications.application_id;
  select * into partner from public.applications as application_row where application_row.id = team_applications.partner_application_id;

  -- A draft is not an application yet, and organisers never see one.
  if application.id is null or partner.id is null
    or application.conference_id <> partner.conference_id
    or 'draft' in (application.status, partner.status)
  then
    raise exception 'That application does not exist';
  end if;

  if not public.has_permission(application.conference_id, 'decide_applications') then
    raise exception 'Only the organisers of this conference can change a team';
  end if;

  if application.id = partner.id then
    raise exception 'An application cannot be teamed with itself';
  end if;

  if application.team_id is not null and application.team_id = partner.team_id then
    raise exception 'They are already in the same team';
  end if;

  if application.team_id is not null then
    team = application.team_id;

    update public.applications set team_id = team where id = partner.id;
    perform public.dissolve_lonely_application_team(partner.team_id);
  elsif partner.team_id is not null then
    team = partner.team_id;

    update public.applications set team_id = team where id = application.id;
  else
    team = public.new_application_team(application.conference_id);

    update public.applications set team_id = team where id in (application.id, partner.id);
  end if;

  return team;
end;
$$;

revoke execute on function public.team_applications(uuid, uuid) from public, anon;
grant execute on function public.team_applications(uuid, uuid) to authenticated;

-- Take one application out of its team, so it is decided on its own.
create or replace function public.remove_application_from_team(application_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  application public.applications;
begin
  select * into application from public.applications as application_row where application_row.id = remove_application_from_team.application_id;

  if application.id is null then
    raise exception 'That application does not exist';
  end if;

  if not public.has_permission(application.conference_id, 'decide_applications') then
    raise exception 'Only the organisers of this conference can change a team';
  end if;

  if application.team_id is null then
    raise exception 'That application is not in a team';
  end if;

  update public.applications set team_id = null where id = application.id;

  perform public.dissolve_lonely_application_team(application.team_id);
end;
$$;

revoke execute on function public.remove_application_from_team(uuid) from public, anon;
grant execute on function public.remove_application_from_team(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- accept_application_team(application_ids, seat_ids)
-- -----------------------------------------------------------------------------
-- Accept a team: application_ids[n] takes seat_ids[n]. The page chooses the
-- seats (one country, a different committee each, each member's preferred
-- committee where it can); this makes sure that is what it sent and accepts
-- them all, or none. Each accept is accept_application itself, so the
-- permission, the free-seat check and the invoice are its rules unchanged.

create or replace function public.accept_application_team(
  application_ids uuid[],
  seat_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_count integer := coalesce(array_length(application_ids, 1), 0);
  member_index integer;
begin
  if member_count = 0 or member_count <> coalesce(array_length(seat_ids, 1), 0) then
    raise exception 'Every member of the team needs one seat';
  end if;

  if (
    select count(distinct application.team_id)
    from public.applications as application
    where application.id = any (accept_application_team.application_ids)
      and application.team_id is not null
  ) <> 1 or (
    select count(*)
    from public.applications as application
    where application.id = any (accept_application_team.application_ids)
      and application.team_id is not null
  ) <> member_count then
    raise exception 'Those applications are not one team';
  end if;

  -- One country, each seat in a committee of its own.
  if (
    select count(distinct seat.country_code) = 1
      and count(seat.country_code) = member_count
      and count(distinct seat.committee_id) = member_count
    from public.seats as seat
    where seat.id = any (accept_application_team.seat_ids)
  ) is not true then
    raise exception 'A team takes one country, in a different committee each';
  end if;

  for member_index in 1..member_count loop
    perform public.accept_application(application_ids[member_index], seat_ids[member_index]);
  end loop;
end;
$$;

revoke execute on function public.accept_application_team(uuid[], uuid[]) from public, anon;
grant execute on function public.accept_application_team(uuid[], uuid[]) to authenticated;
