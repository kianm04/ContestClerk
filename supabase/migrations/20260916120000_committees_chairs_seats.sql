-- =============================================================================
-- Migration 0003: committees, chairs and seats
-- =============================================================================
--
-- WHAT THIS IS
-- Task T02 in specs/07-delivery/tasks.md. A conference is a list of committees,
-- a committee is a list of seats, and a seat is one country or character that
-- one delegate takes. This file:
--
--   * finishes the committees table (migration 0001 made it by hand, without
--     the level column) and gives it the real policies from permissions.md
--   * adds committee_chairs, and the trigger that keeps a chair on the team
--   * adds seats, and the trigger that stops one person holding two of them
--   * adds the two permission helpers that need these tables,
--     is_committee_chair and is_committee_delegate
--   * adds the public_seats view, which is how a visitor sees a seat list
--     without seeing who is in it
--   * replaces accept_invite so that a chair invitation naming a committee
--     hands the committee over as well
--
-- WHAT IS NOT HERE, ON PURPOSE
-- seats has no application_id and no delegation_id column yet. Those arrive in
-- task T16 with the applications and delegations tables, together with the two
-- allocation rules of check_seat_allocation that need them, the delegation
-- head's half of the seats update policy, and the allocation functions that
-- write seats.allocated_at.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- committees: the level column
-- -----------------------------------------------------------------------------
-- How much experience a committee expects, so a first-time delegate can tell
-- the beginner committees from the crisis ones. It shares the experience_level
-- enum with profiles, where 'none' means "I have never done this". A committee
-- is never 'none', so the check refuses it.

alter table public.committees
  add column level public.experience_level not null default 'intermediate';

alter table public.committees
  add constraint committees_level_not_none check (level <> 'none');


-- -----------------------------------------------------------------------------
-- committee_chairs
-- -----------------------------------------------------------------------------
-- Who runs a committee. A committee usually has two or three: a chair, a vice
-- chair and a rapporteur, which is what the title column holds.
--
-- There is no updated_at column, because there is nothing to change but the
-- title and the row is small enough to delete and add again.

create table public.committee_chairs (
  committee_id uuid not null references public.committees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Chair',
  created_at timestamptz not null default now(),
  primary key (committee_id, user_id)
);

-- The primary key already indexes committee_id, so only the other foreign key
-- needs one of its own. It answers "which committees does this person chair?".
create index committee_chairs_user_id_idx on public.committee_chairs (user_id);


-- -----------------------------------------------------------------------------
-- Trigger: a chair is always on the conference team
-- -----------------------------------------------------------------------------
-- specs/02-architecture/data-model.md says a chair must also have a
-- conference_staff row for that conference. Rather than refuse the insert and
-- make every page do it in two steps, the trigger adds the missing row.
--
-- It is "security definer" so that it can look the committee's conference up
-- whoever is inserting, the same reason check_invite_committee in migration
-- 0002 is one. accept_invite also runs it, and that function is the server.
--
-- Somebody who is already on the team keeps the role they have: an organiser
-- who also chairs a committee stays an organiser, and would lose the right to
-- run the conference if this overwrote their row with 'chair'.
--
-- It fires on every update too, not only on insert. The policy matrix lets an
-- organiser update any column of this table, so a chair row can be handed to
-- somebody else, or moved to another committee, in place. Either way the person
-- the row ends up describing needs the same staff row the person it was
-- inserted for got, and for the conference the row now points at. The function
-- is an "insert ... on conflict do nothing", so running it on an update that
-- changed neither column costs one index lookup and changes nothing.

create or replace function public.ensure_chair_is_staff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  the_conference uuid;
begin
  select committee.conference_id
  into the_conference
  from public.committees as committee
  where committee.id = new.committee_id;

  insert into public.conference_staff (conference_id, user_id, role)
  values (the_conference, new.user_id, 'chair')
  on conflict (conference_id, user_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.ensure_chair_is_staff() from public, anon, authenticated;

create trigger committee_chairs_ensure_staff
  before insert or update on public.committee_chairs
  for each row
  execute function public.ensure_chair_is_staff();


-- -----------------------------------------------------------------------------
-- seats
-- -----------------------------------------------------------------------------
-- One country, character or role in one committee. An organiser makes the whole
-- list empty, and allocating somebody is writing their user_id onto a row.
--
-- is_available is how an organiser hides a seat they are not offering this year
-- without deleting it and losing its position in the list.

create table public.seats (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees (id) on delete cascade,
  -- "France", or "Minister of Defence" in a crisis committee.
  name text not null,
  kind public.seat_kind not null default 'country',
  -- Two-letter ISO 3166-1 code, for the flag next to a country seat.
  country_code char(2),
  position integer not null default 0,
  is_available boolean not null default true,
  -- The delegate sitting in the seat. Null means the seat is free.
  --
  -- "on delete set null" rather than the "on delete cascade" the conventions in
  -- data-model.md ask for: deleting an account must not take the seat with it.
  -- The committee keeps its list, the seat goes back to being free, and the
  -- organiser can give it to somebody else. delete_my_account in migration 0002
  -- describes the same rule from the other side: "seats and invoices keep the
  -- row and forget the person".
  user_id uuid references auth.users (id) on delete set null,
  -- When user_id was last set. The allocation functions in task T16 write it.
  allocated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One committee never has two seats with the same name, which is also what
  -- makes seed.sql safe to run twice.
  unique (committee_id, name)
);

-- The seat list of a committee is always read in display order.
create index seats_committee_position_idx on public.seats (committee_id, position);
-- "Which seat does this person hold?", asked on every page of the delegate side.
create index seats_user_id_idx on public.seats (user_id);

create trigger seats_set_updated_at
  before update on public.seats
  for each row
  execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- Trigger: one person, one seat per conference
-- -----------------------------------------------------------------------------
-- A delegate takes part in one committee. Two seats would mean two schedules,
-- two position papers and two invoices for the same person.
--
-- specs/02-architecture/data-model.md gives this trigger three rules. The other
-- two are about the application_id and delegation_id columns, which task T16
-- adds; this file enforces the one whose columns exist.
--
-- It is "security definer" because it has to see every seat of the conference,
-- including the ones in committees the person doing the allocation cannot read.

create or replace function public.check_seat_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  the_conference uuid;
begin
  if new.user_id is null then
    return new;
  end if;

  select committee.conference_id
  into the_conference
  from public.committees as committee
  where committee.id = new.committee_id;

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

-- The spec names this a "before update" trigger, because allocating is normally
-- an update of an empty seat. It fires on insert too, so that adding a seat
-- with somebody already in it cannot walk around the rule.
create trigger seats_check_allocation
  before insert or update on public.seats
  for each row
  execute function public.check_seat_allocation();


-- -----------------------------------------------------------------------------
-- Permission helpers
-- -----------------------------------------------------------------------------
-- The two helpers from specs/02-architecture/permissions.md that could not be
-- written before these tables existed. Like the others in migration 0002 they
-- are "security definer", so a policy on one table may ask a question about
-- another that the caller is not allowed to read.

-- Does the signed-in user run this committee? Its chairs do, and so does
-- anybody who can run the whole conference.
create or replace function public.is_committee_chair(committee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.committee_chairs as chair
    where chair.committee_id = is_committee_chair.committee_id
      and chair.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.committees as committee
    where committee.id = is_committee_chair.committee_id
      and public.can_manage_conference(committee.conference_id)
  );
$$;

revoke execute on function public.is_committee_chair(uuid) from public, anon;
grant execute on function public.is_committee_chair(uuid) to authenticated;


-- Does the signed-in user sit in this committee?
create or replace function public.is_committee_delegate(committee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.seats as seat
    where seat.committee_id = is_committee_delegate.committee_id
      and seat.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_committee_delegate(uuid) from public, anon;
grant execute on function public.is_committee_delegate(uuid) to authenticated;


-- Has anybody been allocated a seat in this committee? Only the committees
-- delete policy asks, and it has to ask a function rather than write the
-- sub-select itself, for two reasons.
--
-- First, a sub-select on seats inside a policy on committees is limited by the
-- seats policies, and those ask about committees in turn. Postgres refuses that
-- circle with "infinite recursion detected in policy for relation committees".
--
-- Second, a guard that can only see the seats the caller may read would let the
-- delete through whenever it cannot see the delegate, which is the wrong way
-- round for a guard.
create or replace function public.committee_has_delegates(committee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.seats as seat
    where seat.committee_id = committee_has_delegates.committee_id
      and seat.user_id is not null
  );
$$;

revoke execute on function public.committee_has_delegates(uuid) from public, anon;
grant execute on function public.committee_has_delegates(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- accept_invite, now that committee_chairs exists
-- -----------------------------------------------------------------------------
-- The same function as in migration 0002, with one paragraph added: a chair
-- invitation that names a committee now hands the committee over as well.
-- Migration 0002 left that out because this table did not exist yet, and a
-- PL/pgSQL function that mentions a missing table fails the moment it runs.
--
-- "create or replace" writes over the old version; there is only ever one
-- accept_invite, and this is now it.

create or replace function public.accept_invite(token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.invites;
  me uuid := (select auth.uid());
  my_email text;
  destination text;
begin
  if me is null then
    raise exception 'You have to be signed in to accept an invitation';
  end if;

  select lower(account.email)
  into my_email
  from auth.users as account
  where account.id = me;

  select *
  into invite
  from public.invites as pending
  where pending.token = accept_invite.token;

  if invite.id is null then
    raise exception 'This invitation does not exist';
  end if;

  if invite.accepted_at is not null then
    raise exception 'This invitation has already been used';
  end if;

  if invite.expires_at <= now() then
    raise exception 'This invitation has expired';
  end if;

  if invite.email is distinct from my_email then
    raise exception 'This invitation was sent to a different email address';
  end if;

  if invite.kind = 'organization_member' then
    if invite.role not in ('owner', 'admin', 'member') then
      raise exception 'This invitation has a role that is not an organisation role';
    end if;

    insert into public.organization_members (organization_id, user_id, role)
    values (invite.organization_id, me, invite.role::public.organization_role)
    on conflict (organization_id, user_id) do nothing;

    select '/manage/organizations/' || organization.slug
    into destination
    from public.organizations as organization
    where organization.id = invite.organization_id;
  else
    if invite.role not in ('organiser', 'chair', 'volunteer') then
      raise exception 'This invitation has a role that is not a conference role';
    end if;

    insert into public.conference_staff (conference_id, user_id, role)
    values (invite.conference_id, me, invite.role::public.staff_role)
    on conflict (conference_id, user_id) do update set role = excluded.role;

    -- A chair invitation can also name the committee to chair. The
    -- invites_check_committee trigger in migration 0002 has already made sure
    -- it is a committee of this conference, so the row is safe to write.
    if invite.role = 'chair' and invite.committee_id is not null then
      insert into public.committee_chairs (committee_id, user_id)
      values (invite.committee_id, me)
      on conflict (committee_id, user_id) do nothing;
    end if;

    select '/manage/' || conference.slug
    into destination
    from public.conferences as conference
    where conference.id = invite.conference_id;
  end if;

  update public.invites
  set accepted_at = now(), accepted_by = me
  where id = invite.id;

  return destination;
end;
$$;

revoke execute on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;


-- =============================================================================
-- Row Level Security
-- =============================================================================
-- Every rule below is one row of the policy matrix in
-- specs/02-architecture/permissions.md, with a test in client/tests/db/.


-- -----------------------------------------------------------------------------
-- committees
-- -----------------------------------------------------------------------------
-- Migration 0002 left one select policy here, the rule from migration 0001
-- rewritten onto status, and said this file would replace it with the full set.
-- Dropping it and writing both select policies again keeps every rule about
-- committees in one place instead of two files.
--
-- "Anyone who can select the conference" is two policies because a row is
-- readable when either one allows it: visitors see published and archived
-- conferences, and the people running a conference see it in any status, which
-- is how an organiser opens the committees of a draft.

drop policy "Anyone can read committees of published conferences" on public.committees;

create policy "Anyone can read the committees of a published conference"
  on public.committees
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.conferences as conference
      where conference.id = committees.conference_id
        and conference.status in ('published', 'archived')
    )
  );

-- is_conference_staff reads the conference_id of the row being checked rather
-- than looking the committee up by its id, so this also passes for the row of
-- an "insert ... returning", the statement a page uses to get the new id back.
create policy "Staff can read the committees of their conference"
  on public.committees
  for select
  to authenticated
  using (public.is_conference_staff(conference_id));

create policy "Organisers can add a committee"
  on public.committees
  for insert
  to authenticated
  with check (public.can_manage_conference(conference_id));

create policy "Organisers can change a committee"
  on public.committees
  for update
  to authenticated
  using (public.can_manage_conference(conference_id))
  with check (public.can_manage_conference(conference_id));

-- Deleting a committee cascades to its seats, so a committee somebody has been
-- allocated to may not be deleted. Emptying the seats first is deliberate work.
create policy "Organisers can delete a committee nobody sits in"
  on public.committees
  for delete
  to authenticated
  using (
    public.can_manage_conference(conference_id)
    and not public.committee_has_delegates(id)
  );


-- -----------------------------------------------------------------------------
-- committee_chairs
-- -----------------------------------------------------------------------------
-- Chairs are public: the committee page shows "Chairs: Name, Name" to anybody
-- who can see the committee. That is what the sub-select says, because the
-- policies on committees already decide who may select which committee.

alter table public.committee_chairs enable row level security;

create policy "Anyone who can see the committee can see its chairs"
  on public.committee_chairs
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.committees as committee
      where committee.id = committee_chairs.committee_id
    )
  );

create policy "Organisers can put a chair on a committee"
  on public.committee_chairs
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.committees as committee
      where committee.id = committee_chairs.committee_id
        and public.can_manage_conference(committee.conference_id)
    )
  );

create policy "Organisers can change a chair's title"
  on public.committee_chairs
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.committees as committee
      where committee.id = committee_chairs.committee_id
        and public.can_manage_conference(committee.conference_id)
    )
  )
  with check (
    exists (
      select 1
      from public.committees as committee
      where committee.id = committee_chairs.committee_id
        and public.can_manage_conference(committee.conference_id)
    )
  );

create policy "Organisers can take a chair off a committee"
  on public.committee_chairs
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.committees as committee
      where committee.id = committee_chairs.committee_id
        and public.can_manage_conference(committee.conference_id)
    )
  );


-- -----------------------------------------------------------------------------
-- seats
-- -----------------------------------------------------------------------------
-- The seats table carries user_id, and a policy can only decide which rows
-- somebody reads, not which columns. So the table itself is for the people
-- inside the conference, and everybody else reads the public_seats view below,
-- which has no user_id in it at all.
--
-- permissions.md says "participant and staff". A participant is somebody who
-- holds a seat, has applied, or is in a delegation; only the first of those
-- three exists before task T16, so this policy asks is_committee_delegate now
-- and gains the is_conference_participant branch with the other two tables.

alter table public.seats enable row level security;

create policy "Delegates and staff can read a seat list"
  on public.seats
  for select
  to authenticated
  using (
    public.is_committee_delegate(committee_id)
    or exists (
      select 1
      from public.committees as committee
      where committee.id = seats.committee_id
        and public.is_conference_staff(committee.conference_id)
    )
  );

create policy "Organisers can add a seat"
  on public.seats
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.committees as committee
      where committee.id = seats.committee_id
        and public.can_manage_conference(committee.conference_id)
    )
  );

-- An organiser may write any column, which is how allocating and unallocating a
-- delegate works. The delegation head's narrower version of this, writing
-- user_id on a seat reserved for their own delegation, arrives with task T16.
create policy "Organisers can change a seat"
  on public.seats
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.committees as committee
      where committee.id = seats.committee_id
        and public.can_manage_conference(committee.conference_id)
    )
  )
  with check (
    exists (
      select 1
      from public.committees as committee
      where committee.id = seats.committee_id
        and public.can_manage_conference(committee.conference_id)
    )
  );

create policy "Organisers can delete a seat nobody sits in"
  on public.seats
  for delete
  to authenticated
  using (
    user_id is null
    and exists (
      select 1
      from public.committees as committee
      where committee.id = seats.committee_id
        and public.can_manage_conference(committee.conference_id)
    )
  );


-- -----------------------------------------------------------------------------
-- public_seats
-- -----------------------------------------------------------------------------
-- What a visitor sees of a seat list: the flag, the name, and whether the seat
-- is taken. Never by whom.
--
-- "security_invoker = false" means the view reads the seats table as the user
-- that owns the view rather than as the caller, so Row Level Security on seats
-- does not apply inside it. That is the point: nobody but the conference gets a
-- select policy on seats, and this view is the one door for everybody else. It
-- also means the view has to repeat the "published conference" rule itself,
-- because there is no policy left to do it.

create view public.public_seats
with (security_invoker = false) as
select
  seat.id,
  seat.committee_id,
  seat.name,
  seat.kind,
  seat.country_code,
  seat.position,
  seat.user_id is not null as is_taken
from public.seats as seat
join public.committees as committee on committee.id = seat.committee_id
join public.conferences as conference on conference.id = committee.conference_id
where seat.is_available
  and conference.status in ('published', 'archived');

grant select on public.public_seats to anon, authenticated;
