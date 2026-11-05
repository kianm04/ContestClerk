-- =============================================================================
-- The team page and the roles editor (docs/roles-and-permissions.md, step 3)
-- =============================================================================
--
-- WHAT THIS IS
-- Step 1 put roles in the database and wrote every policy the team page and
-- the roles editor need. Three things the screens do could not be written as
-- plain inserts, updates and deletes from the page, and are written here:
--
--   * set_member_roles: "Edit roles" saves a set of checkboxes. Taking some
--     roles off and putting others on has to happen together or not at all,
--     so it is one function, run as the caller, whose policies still decide.
--   * move_conference_role: "Move up" and "Move down" swap a role with its
--     neighbour, two updates that must both happen.
--   * list_conference_owners: the team page lists the organisation's owners
--     and admins at the top, and a team manager who is not in the
--     organisation cannot read organization_members.
--
-- Nothing here widens what anybody may do. The first two are "security
-- invoker", so every row they touch passes the policies of migration
-- 20261007120000_conference_roles exactly as if the page had written it; they
-- only add that a row the policies silently skip is an error rather than
-- nothing. The third reads one table on behalf of the team, and answers
-- nobody else.
--
-- This file is never edited once applied: a change is a new migration.


-- -----------------------------------------------------------------------------
-- set_member_roles: the "Edit roles" dialog
-- -----------------------------------------------------------------------------
-- Gives somebody exactly these roles on the conference: the ones they hold and
-- are not in the list are taken off, the ones in the list they do not hold are
-- given. A role the caller may not give or take (the rank rule) refuses the
-- whole change.
--
-- A delete that a policy forbids does not fail in Postgres, it just finds no
-- rows, so the function counts what it meant to delete and raises when fewer
-- went. An insert that a policy forbids does fail, with 42501, which is
-- "insufficient privilege", the same code raised here.

create or replace function public.set_member_roles(
  conference_id uuid,
  user_id uuid,
  role_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  meant_to_remove integer;
  removed integer;
begin
  select count(*)
  into meant_to_remove
  from public.conference_role_members as member
  where member.conference_id = set_member_roles.conference_id
    and member.user_id = set_member_roles.user_id
    and not (member.role_id = any (set_member_roles.role_ids));

  delete from public.conference_role_members as member
  where member.conference_id = set_member_roles.conference_id
    and member.user_id = set_member_roles.user_id
    and not (member.role_id = any (set_member_roles.role_ids));

  get diagnostics removed = row_count;

  if removed < meant_to_remove then
    raise exception 'You can only take off roles below your own.'
      using errcode = '42501';
  end if;

  insert into public.conference_role_members (conference_id, user_id, role_id, granted_by)
  select set_member_roles.conference_id, set_member_roles.user_id, wanted.role_id, (select auth.uid())
  from unnest(set_member_roles.role_ids) as wanted (role_id)
  where not exists (
    select 1
    from public.conference_role_members as member
    where member.role_id = wanted.role_id
      and member.user_id = set_member_roles.user_id
  );
end;
$$;

revoke execute on function public.set_member_roles(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.set_member_roles(uuid, uuid, uuid[]) to authenticated;


-- -----------------------------------------------------------------------------
-- move_conference_role: "Move up" and "Move down" on the roles page
-- -----------------------------------------------------------------------------
-- Swaps a role's place with the role next to it in the list, the list being
-- in position order and then by name, the order every page reads it in.
-- Both roles have to be ones the caller manages, which is what keeps anybody
-- from moving a role above their own: the role directly below their own
-- cannot be swapped with it.
--
-- Two roles can share a position (an administrator may put one anywhere), and
-- swapping two equal numbers changes nothing, so then the moved role takes the
-- number one past its neighbour's instead.

create or replace function public.move_conference_role(role_id uuid, direction text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  moved public.conference_roles;
  neighbour public.conference_roles;
  moved_to integer;
  changed integer;
begin
  if direction not in ('up', 'down') then
    raise exception 'A role moves up or down.' using errcode = '22023';
  end if;

  select role.*
  into moved
  from public.conference_roles as role
  where role.id = move_conference_role.role_id;

  if not found then
    raise exception 'There is no such role.' using errcode = 'P0002';
  end if;

  -- The role just above (or just below) in the order the pages show.
  select role.*
  into neighbour
  from public.conference_roles as role
  where role.conference_id = moved.conference_id
    and role.id <> moved.id
    and case
      when direction = 'up' then
        (role.position, lower(role.name)) < (moved.position, lower(moved.name))
      else
        (role.position, lower(role.name)) > (moved.position, lower(moved.name))
    end
  order by
    case when direction = 'up' then role.position end desc,
    case when direction = 'up' then lower(role.name) end desc,
    case when direction = 'down' then role.position end asc,
    case when direction = 'down' then lower(role.name) end asc
  limit 1;

  -- Already first or last: nothing to do.
  if not found then
    return;
  end if;

  if neighbour.position <> moved.position then
    moved_to := neighbour.position;
  elsif direction = 'up' then
    moved_to := neighbour.position - 1;
  else
    moved_to := neighbour.position + 1;
  end if;

  update public.conference_roles as role
  set position = moved_to
  where role.id = moved.id;

  get diagnostics changed = row_count;

  if changed = 0 then
    raise exception 'You can only move roles below your own.' using errcode = '42501';
  end if;

  if neighbour.position <> moved.position then
    update public.conference_roles as role
    set position = moved.position
    where role.id = neighbour.id;

    get diagnostics changed = row_count;

    if changed = 0 then
      raise exception 'You can only move roles below your own.' using errcode = '42501';
    end if;
  end if;
end;
$$;

revoke execute on function public.move_conference_role(uuid, text) from public, anon;
grant execute on function public.move_conference_role(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- list_conference_owners: the rows "From the organisation"
-- -----------------------------------------------------------------------------
-- The owners and admins of the organisation running the conference, who are
-- its administrators (rule 4) and head the team page. Only the team may ask,
-- the same people who may read the rest of the page; anybody else gets no
-- rows. Platform admins are administrators everywhere but are not part of any
-- conference's team, so they are not listed.

create or replace function public.list_conference_owners(conference_id uuid)
returns table (user_id uuid, organization_role public.organization_role)
language sql
stable
security definer
set search_path = ''
as $$
  select membership.user_id, membership.role
  from public.conferences as conference
  join public.organization_members as membership
    on membership.organization_id = conference.organization_id
  where conference.id = list_conference_owners.conference_id
    and membership.role in ('owner', 'admin')
    and public.is_conference_staff(list_conference_owners.conference_id);
$$;

revoke execute on function public.list_conference_owners(uuid) from public, anon;
grant execute on function public.list_conference_owners(uuid) to authenticated;

-- End of migration. Never edit this file once applied; write a new one.
