-- =============================================================================
-- The roles model's remaining holes (security review of 2026-10-10)
-- =============================================================================
--
-- Never edit this file once it has been applied anywhere. Add a new migration.
--
-- WHAT THIS IS
-- Findings H4, L5, L6, L7, L8, L9 and M17 of docs/security-review-2026-10-10.md,
-- all on the tables of migration 20261007120000_conference_roles and on the
-- session notes policies of 20261007180000_committee_permissions:
--
--   * H4  A role could be moved to another conference. Its memberships stayed
--         on the old one, so a team member with manage_roles who owned a second
--         conference could carry a role there, rewrite it to administrator and
--         make every holder an administrator of the conference they left. A
--         trigger now refuses the move for every caller, a composite foreign
--         key makes a membership or invitation of a role of the wrong
--         conference impossible at the table, and every helper that joins a
--         membership to its role asks for the same conference on both sides.
--   * L5  Team managers could assign themselves to any committee and unassign
--         anybody. committee_chairs now asks the rank rule, can_manage_member.
--   * L6  Team managers could retitle anybody, at any length. conference_staff
--         asks the rank rule and caps the title.
--   * L7  Giving a role went by position alone, so a manager could hand a
--         lower role carrying administrator to a second account of their own.
--         Giving a role, or inviting somebody to one, now takes can_grant on
--         the role's permissions, as making or editing the role already did.
--   * L8  Team managers could put any account on the team without an
--         invitation. The direct insert policy goes: nothing in the app used
--         it, and staff rows come from accept_invite and ensure_chair_is_staff.
--   * L9  granted_by could name anybody. It defaults to the caller and the
--         policy insists on it.
--   * M17 committee_session_notes asked run_room where the page, the spec and
--         chair_notes ask write_chair_notes.
--
-- The tests are client/tests/db/security-conference-roles.test.ts.


-- =============================================================================
-- H4: a role stays on its conference
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Trigger: conference_id never changes
-- -----------------------------------------------------------------------------
-- For every caller, the service role and the seeds included: unlike the column
-- guards there is no support-script case for this. A role that has to exist on
-- another conference is a new role there.

create or replace function public.protect_conference_roles_conference()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.conference_id is distinct from old.conference_id then
    raise exception 'A role cannot be moved to another conference';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_conference_roles_conference()
  from public, anon, authenticated;

create trigger conference_roles_protect_conference
  before update on public.conference_roles
  for each row
  execute function public.protect_conference_roles_conference();


-- -----------------------------------------------------------------------------
-- The pair (id, conference_id), so that the rows pointing at a role can point
-- at its conference too
-- -----------------------------------------------------------------------------
-- check_role_member_conference and check_invite_role already refuse a row that
-- pairs a role with the wrong conference when it is written. The foreign keys
-- say the same thing at the table, where no trigger ordering and no later
-- update of the role can get around it. They take over the delete actions of
-- the single-column keys they replace, so a deleted role behaves as it always
-- has: refused while anybody holds it, and its open invitations go with it.
--
-- The single-column keys are dropped rather than kept beside the new ones,
-- because PostgREST embeds one table in another through the foreign key
-- between them and refuses when it finds two ("conference_roles(name)" is how
-- the team page, the switcher and the invitation list read a role). Nothing is
-- lost: a (role_id, conference_id) that exists on conference_roles is a
-- role_id that exists. On invites both columns are null for an organisation
-- invitation and both set for a conference one (invites_role_matches_kind and
-- invites_target_matches_kind), so the composite key is checked exactly when
-- the old one was.

alter table public.conference_roles
  add constraint conference_roles_id_conference_unique unique (id, conference_id);

alter table public.conference_role_members
  add constraint conference_role_members_role_conference_fkey
  foreign key (role_id, conference_id)
  references public.conference_roles (id, conference_id) on delete restrict;

alter table public.conference_role_members
  drop constraint conference_role_members_role_id_fkey;

alter table public.invites
  add constraint invites_role_conference_fkey
  foreign key (role_id, conference_id)
  references public.conference_roles (id, conference_id) on delete cascade;

alter table public.invites
  drop constraint invites_role_id_fkey;


-- -----------------------------------------------------------------------------
-- The permission helpers, with the conference on both sides of the join
-- -----------------------------------------------------------------------------
-- Each body is the one 20261007120000_conference_roles (and, for the last,
-- 20261008120100_committee_papers) defined, with one line added to the join
-- of conference_role_members to conference_roles: the role has to belong to
-- the conference the membership is on. The foreign key above makes anything
-- else impossible; the helpers say so as well, so that no reading of them
-- depends on the constraint being there.

create or replace function public.holder_has_permission(
  conference_id uuid,
  user_id uuid,
  permission public.permission
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin_account(holder_has_permission.user_id)
  or exists (
    select 1
    from public.conferences as conference
    join public.organization_members as membership
      on membership.organization_id = conference.organization_id
    where conference.id = holder_has_permission.conference_id
      and membership.user_id = holder_has_permission.user_id
      and membership.role in ('owner', 'admin')
  )
  or exists (
    select 1
    from public.conference_role_members as member
    join public.conference_roles as role
      on role.id = member.role_id
     and role.conference_id = member.conference_id
    where member.conference_id = holder_has_permission.conference_id
      and member.user_id = holder_has_permission.user_id
      and role.scope = 'conference'
      and role.permissions && array['administrator', holder_has_permission.permission]::public.permission[]
  );
$$;

revoke execute on function public.holder_has_permission(uuid, uuid, public.permission)
  from public, anon, authenticated;


create or replace function public.has_committee_permission(
  committee_id uuid,
  permission public.permission
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.committees as committee
    where committee.id = has_committee_permission.committee_id
      and public.has_permission(committee.conference_id, has_committee_permission.permission)
  )
  or exists (
    select 1
    from public.committee_chairs as assignment
    join public.committees as committee on committee.id = assignment.committee_id
    join public.conference_role_members as member
      on member.conference_id = committee.conference_id
     and member.user_id = assignment.user_id
    join public.conference_roles as role
      on role.id = member.role_id
     and role.conference_id = member.conference_id
    where assignment.committee_id = has_committee_permission.committee_id
      and assignment.user_id = (select auth.uid())
      and role.scope = 'committees'
      and role.permissions && array['administrator', has_committee_permission.permission]::public.permission[]
  );
$$;

revoke execute on function public.has_committee_permission(uuid, public.permission) from public, anon;
grant execute on function public.has_committee_permission(uuid, public.permission) to authenticated;


create or replace function public.permitted_conference_ids(permission public.permission)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select member.conference_id
  from public.conference_role_members as member
  join public.conference_roles as role
    on role.id = member.role_id
   and role.conference_id = member.conference_id
  where member.user_id = (select auth.uid())
    and role.scope = 'conference'
    and role.permissions && array['administrator', permitted_conference_ids.permission]::public.permission[]

  union

  select conference.id
  from public.conferences as conference
  join public.organization_members as membership
    on membership.organization_id = conference.organization_id
  where membership.user_id = (select auth.uid())
    and membership.role in ('owner', 'admin')

  union

  select conference.id
  from public.conferences as conference
  where public.is_platform_admin();
$$;

revoke execute on function public.permitted_conference_ids(public.permission) from public, anon;
grant execute on function public.permitted_conference_ids(public.permission) to authenticated;


create or replace function public.permitted_committee_ids(permission public.permission)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select committee.id
  from public.committees as committee
  where committee.conference_id in (
    select public.permitted_conference_ids(permitted_committee_ids.permission)
  )

  union

  select assignment.committee_id
  from public.committee_chairs as assignment
  join public.committees as committee on committee.id = assignment.committee_id
  join public.conference_role_members as member
    on member.conference_id = committee.conference_id
   and member.user_id = assignment.user_id
  join public.conference_roles as role
    on role.id = member.role_id
   and role.conference_id = member.conference_id
  where assignment.user_id = (select auth.uid())
    and role.scope = 'committees'
    and role.permissions && array['administrator', permitted_committee_ids.permission]::public.permission[];
$$;

revoke execute on function public.permitted_committee_ids(public.permission) from public, anon;
grant execute on function public.permitted_committee_ids(public.permission) to authenticated;


create or replace function public.my_permissions(conference_id uuid)
returns table (permission public.permission, scope public.role_scope)
language sql
stable
security definer
set search_path = ''
as $$
  with granted as (
    select
      'administrator'::public.permission as granted_permission,
      'conference'::public.role_scope as granted_scope
    where public.is_conference_owner(my_permissions.conference_id)

    union all

    select unnest(role.permissions), role.scope
    from public.conference_role_members as member
    join public.conference_roles as role
      on role.id = member.role_id
     and role.conference_id = member.conference_id
    where member.conference_id = my_permissions.conference_id
      and member.user_id = (select auth.uid())
  )
  select distinct on (granted.granted_permission)
    granted.granted_permission,
    granted.granted_scope
  from granted
  order by granted.granted_permission, granted.granted_scope;
$$;

revoke execute on function public.my_permissions(uuid) from public, anon;
grant execute on function public.my_permissions(uuid) to authenticated;


create or replace function public.user_rank(conference_id uuid, user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_platform_admin_account(user_rank.user_id)
      or exists (
        select 1
        from public.conferences as conference
        join public.organization_members as membership
          on membership.organization_id = conference.organization_id
        where conference.id = user_rank.conference_id
          and membership.user_id = user_rank.user_id
          and membership.role in ('owner', 'admin')
      )
    then -1
    else (
      select min(role.position)
      from public.conference_role_members as member
      join public.conference_roles as role
        on role.id = member.role_id
       and role.conference_id = member.conference_id
      where member.conference_id = user_rank.conference_id
        and member.user_id = user_rank.user_id
    )
  end;
$$;

revoke execute on function public.user_rank(uuid, uuid) from public, anon, authenticated;


create or replace function public.can_grant(
  conference_id uuid,
  permissions public.permission[],
  scope public.role_scope
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_permission(can_grant.conference_id, 'administrator')
  or not exists (
    select 1
    from unnest(can_grant.permissions) as wanted (permission)
    where not exists (
      select 1
      from public.conference_role_members as member
      join public.conference_roles as role
        on role.id = member.role_id
       and role.conference_id = member.conference_id
      where member.conference_id = can_grant.conference_id
        and member.user_id = (select auth.uid())
        and (role.scope = 'conference' or can_grant.scope = 'committees')
        and role.permissions && array['administrator', wanted.permission]::public.permission[]
    )
  );
$$;

revoke execute on function public.can_grant(uuid, public.permission[], public.role_scope) from public, anon;
grant execute on function public.can_grant(uuid, public.permission[], public.role_scope) to authenticated;


create or replace function public.holds_public_role(conference_id uuid, user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conference_role_members as member
    join public.conference_roles as role
      on role.id = member.role_id
     and role.conference_id = member.conference_id
    where member.conference_id = holds_public_role.conference_id
      and member.user_id = holds_public_role.user_id
      and role.is_public
  );
$$;

revoke execute on function public.holds_public_role(uuid, uuid) from public, anon;
grant execute on function public.holds_public_role(uuid, uuid) to authenticated;


create or replace function public.holder_has_committee_permission(
  committee_id uuid,
  user_id uuid,
  permission public.permission
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.committees as committee
    where committee.id = holder_has_committee_permission.committee_id
      and public.holder_has_permission(
        committee.conference_id,
        holder_has_committee_permission.user_id,
        holder_has_committee_permission.permission
      )
  )
  or exists (
    select 1
    from public.committee_chairs as assignment
    join public.committees as committee on committee.id = assignment.committee_id
    join public.conference_role_members as member
      on member.conference_id = committee.conference_id
     and member.user_id = assignment.user_id
    join public.conference_roles as role
      on role.id = member.role_id
     and role.conference_id = member.conference_id
    where assignment.committee_id = holder_has_committee_permission.committee_id
      and assignment.user_id = holder_has_committee_permission.user_id
      and role.scope = 'committees'
      and role.permissions
        && array['administrator', holder_has_committee_permission.permission]::public.permission[]
  );
$$;

revoke execute on function public.holder_has_committee_permission(uuid, uuid, public.permission)
  from public, anon, authenticated;


-- =============================================================================
-- L7: giving a role, or inviting somebody to one, takes holding its permissions
-- =============================================================================
-- Section 7 of docs/roles-and-permissions.md: a person "may put on a role only
-- permissions they hold themselves". Making and editing a role asked that
-- (can_grant in the conference_roles policies); giving one asked only the rank
-- rule, so a manager could give a lower role carrying anything, administrator
-- included, to anybody. Giving and inviting now ask the same question of the
-- role's own permissions.

-- May the signed-in user give this role, by its permissions? can_grant on the
-- role as it stands. A role that does not exist answers no; the foreign key
-- refuses the row anyway.
create or replace function public.can_grant_role_permissions(role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conference_roles as role
    where role.id = can_grant_role_permissions.role_id
      and public.can_grant(role.conference_id, role.permissions, role.scope)
  );
$$;

revoke execute on function public.can_grant_role_permissions(uuid) from public, anon;
grant execute on function public.can_grant_role_permissions(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- Trigger: a membership written from a browser passes the grant rule
-- -----------------------------------------------------------------------------
-- An ordinary function, not security definer, for the reason the column guards
-- give: inside a security definer function current_user is the owner, and the
-- escape hatch could not tell a browser from accept_invite. As it is, it reads
-- "authenticated" for the page and for set_member_roles (security invoker),
-- and "postgres" inside accept_invite and add_conference_presets, which give a
-- role the inviter or the creator was already allowed to give. 42501 is
-- "insufficient privilege", the code a refused policy comes back with, so the
-- pages treat it the same.

create or replace function public.guard_role_member_grant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if not public.can_grant_role_permissions(new.role_id) then
    raise exception 'You can only give a role whose permissions you hold yourself.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_role_member_grant() from public, anon, authenticated;

create trigger conference_role_members_guard_grant
  before insert on public.conference_role_members
  for each row
  execute function public.guard_role_member_grant();


-- -----------------------------------------------------------------------------
-- Trigger: an invitation sent from a browser offers a role the sender may give
-- -----------------------------------------------------------------------------
-- Both halves of giving: below the sender's rank (can_manage_role, which the
-- insert policy asks as well; the trigger does not lean on the policy staying
-- as it is) and within their permissions (can_grant_role_permissions). An
-- organisation invitation has no role_id and is not this trigger's business.

create or replace function public.guard_invite_role_rank()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role_id is null or current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if not public.can_manage_role(new.role_id) then
    raise exception 'You can only invite somebody to a role below your own.'
      using errcode = '42501';
  end if;

  if not public.can_grant_role_permissions(new.role_id) then
    raise exception 'You can only invite somebody to a role whose permissions you hold yourself.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_invite_role_rank() from public, anon, authenticated;

create trigger invites_guard_role_rank
  before insert on public.invites
  for each row
  execute function public.guard_invite_role_rank();


-- =============================================================================
-- L9: who gave a role is the caller
-- =============================================================================
-- The column defaults to the signed-in account, so a page that leaves it out
-- records the truth, and the policy refuses any other name. accept_invite and
-- add_conference_presets write it themselves, as before.

alter table public.conference_role_members
  alter column granted_by set default auth.uid();

alter policy "Team managers can give a role below their own to somebody else"
  on public.conference_role_members
  with check (
    public.has_permission(conference_id, 'manage_team')
    and public.can_manage_role(role_id)
    and user_id <> (select auth.uid())
    and granted_by = (select auth.uid())
  );


-- =============================================================================
-- L5: assigning people to committees follows the rank rule
-- =============================================================================
-- Only somebody below the manager, or somebody with no role at all, may be
-- assigned, retitled or unassigned: can_manage_member, the rule removing
-- somebody from the team already asks. One's own rank is not below one's own
-- rank, so a manager cannot assign themselves; an administrator can, since the
-- rank rule does not bind them. On the update, "using" asks about the person
-- assigned now and "with check" about the person the row will name.

alter policy "Team managers can assign somebody to a committee"
  on public.committee_chairs
  with check (
    exists (
      select 1
      from public.committees as committee
      where committee.id = committee_chairs.committee_id
        and public.has_permission(committee.conference_id, 'manage_team')
        and public.can_manage_member(committee.conference_id, committee_chairs.user_id)
    )
  );

alter policy "Team managers can change an assignment's title"
  on public.committee_chairs
  using (
    exists (
      select 1
      from public.committees as committee
      where committee.id = committee_chairs.committee_id
        and public.has_permission(committee.conference_id, 'manage_team')
        and public.can_manage_member(committee.conference_id, committee_chairs.user_id)
    )
  )
  with check (
    exists (
      select 1
      from public.committees as committee
      where committee.id = committee_chairs.committee_id
        and public.has_permission(committee.conference_id, 'manage_team')
        and public.can_manage_member(committee.conference_id, committee_chairs.user_id)
    )
  );

alter policy "Team managers can take somebody off a committee"
  on public.committee_chairs
  using (
    exists (
      select 1
      from public.committees as committee
      where committee.id = committee_chairs.committee_id
        and public.has_permission(committee.conference_id, 'manage_team')
        and public.can_manage_member(committee.conference_id, committee_chairs.user_id)
    )
  );


-- =============================================================================
-- L6: a title is changed by somebody above, and has a ceiling
-- =============================================================================
-- "Nobody edits their own row" stays, as before, for administrators too.
-- Eighty characters is the database's ceiling; the team page's form and
-- invites_title_length stop at forty.

alter policy "Team managers can change somebody else's title"
  on public.conference_staff
  using (
    public.has_permission(conference_id, 'manage_team')
    and user_id <> (select auth.uid())
    and public.can_manage_member(conference_id, user_id)
  )
  with check (
    public.has_permission(conference_id, 'manage_team')
    and user_id <> (select auth.uid())
    and public.can_manage_member(conference_id, user_id)
  );

alter table public.conference_staff
  add constraint conference_staff_title_length
  check (title is null or char_length(title) <= 80);


-- =============================================================================
-- L8: nobody writes a staff row directly
-- =============================================================================
-- Somebody joins the team by accepting an invitation (accept_invite) or by
-- being assigned to a committee (ensure_chair_is_staff), both of which run as
-- the owner. The team page sends invitations and nothing in the app inserted
-- here, so the policy only let a team manager put any account on the team
-- unasked.

drop policy "Team managers can add somebody to the team" on public.conference_staff;


-- =============================================================================
-- M17: session notes belong to write_chair_notes
-- =============================================================================
-- Like chair_notes: notes are remarks about named people, and a co-chair who
-- only runs the clock does not read them. The page (chair/notes/sessions)
-- already asks write_chair_notes. The read policy takes the set form, one
-- lookup per query, the way chair_notes reads; the writes ask per row and
-- keep the check that the session belongs to the committee.

alter policy "Chairs and organisers can read their committee's session notes"
  on public.committee_session_notes
  using (committee_id in (select public.permitted_committee_ids('write_chair_notes')));

alter policy "A chair can start the notes of a session of their own committee"
  on public.committee_session_notes
  with check (
    public.has_committee_permission(committee_id, 'write_chair_notes')
    and exists (
      select 1
      from public.committee_sessions as session
      where session.id = committee_session_notes.session_id
        and session.committee_id = committee_session_notes.committee_id
    )
  );

alter policy "A chair can save the notes of a session of their own committee"
  on public.committee_session_notes
  using (public.has_committee_permission(committee_id, 'write_chair_notes'))
  with check (
    public.has_committee_permission(committee_id, 'write_chair_notes')
    and exists (
      select 1
      from public.committee_sessions as session
      where session.id = committee_session_notes.session_id
        and session.committee_id = committee_session_notes.committee_id
    )
  );
