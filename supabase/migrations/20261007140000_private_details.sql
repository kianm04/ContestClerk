-- =============================================================================
-- Private details (docs/roles-and-permissions.md, step 4)
-- =============================================================================
--
-- WHAT THIS IS
-- Until now an organiser read `profile_details` (email, phone, date of birth,
-- dietary requirements, emergency contact) for anybody taking part in their
-- conference, through one policy. Row Level Security decides rows, not
-- columns, so two permissions over one table need two doors:
--
--   * staff_contact_details: email and phone, for `read_contact_details`.
--   * staff_welfare_details: date of birth, dietary requirements and the
--     emergency contact, for `read_welfare_details`.
--
-- Both are built the way `public_seats` is (`security_invoker = false`): the
-- view reads the table as its owner, and its own `where` is the rule. The
-- staff policy on `profile_details` is dropped. The two policies that are not
-- about staff stay: a person reads and edits their own row, and a delegation
-- head reads their own members' details.
--
-- It also lets a holder of `read_participants` read the delegations, and their
-- members, of the people they may list, so the participants page can name a
-- delegate's delegation and its head.
--
-- This file is never edited once applied: a change is a new migration.


-- -----------------------------------------------------------------------------
-- private_details_user_ids: whose details a permission opens
-- -----------------------------------------------------------------------------
-- The people who take part in a conference where the caller holds the
-- permission conference-wide (a non-draft application, a seat, or membership
-- of one of its delegations), and the people who sit in a committee where the
-- caller holds it per committee. `permitted_committee_ids` already includes
-- every committee of a conference where the permission is held conference-wide.

create or replace function public.private_details_user_ids(permission public.permission)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select application.user_id
  from public.applications as application
  where application.status <> 'draft'
    and application.conference_id in (
      select public.permitted_conference_ids(private_details_user_ids.permission)
    )

  union

  select membership.user_id
  from public.delegation_members as membership
  join public.delegations as delegation on delegation.id = membership.delegation_id
  where delegation.conference_id in (
    select public.permitted_conference_ids(private_details_user_ids.permission)
  )

  union

  select seat.user_id
  from public.seats as seat
  where seat.user_id is not null
    and seat.committee_id in (
      select public.permitted_committee_ids(private_details_user_ids.permission)
    );
$$;

-- A view's functions are checked against the person reading the view, so the
-- signed-in may call it. It answers only about the caller's own permissions.
revoke execute on function public.private_details_user_ids(public.permission) from public, anon;
grant execute on function public.private_details_user_ids(public.permission) to authenticated;


-- -----------------------------------------------------------------------------
-- The two views
-- -----------------------------------------------------------------------------

create view public.staff_contact_details
with (security_invoker = false)
as
  select detail.user_id, detail.email, detail.phone
  from public.profile_details as detail
  where detail.user_id in (select public.private_details_user_ids('read_contact_details'));

create view public.staff_welfare_details
with (security_invoker = false)
as
  select
    detail.user_id,
    detail.date_of_birth,
    detail.dietary_requirements,
    detail.emergency_contact_name,
    detail.emergency_contact_phone
  from public.profile_details as detail
  where detail.user_id in (select public.private_details_user_ids('read_welfare_details'));

-- Supabase grants every new relation to anon and authenticated by default.
-- These are read-only, and only for the signed-in.
revoke all on public.staff_contact_details from public, anon, authenticated;
revoke all on public.staff_welfare_details from public, anon, authenticated;
grant select on public.staff_contact_details to authenticated;
grant select on public.staff_welfare_details to authenticated;


-- -----------------------------------------------------------------------------
-- The staff policy on profile_details goes
-- -----------------------------------------------------------------------------

drop policy "Organisers can read the details of somebody at their conference"
  on public.profile_details;


-- -----------------------------------------------------------------------------
-- Delegations for the participants page
-- -----------------------------------------------------------------------------
-- The delegations holding a seat whose participant the caller may list: a seat
-- in a conference where they hold `read_participants` conference-wide, or in a
-- committee where they hold it per committee.

create or replace function public.participant_list_delegation_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select seat.delegation_id
  from public.seats as seat
  where seat.delegation_id is not null
    and seat.committee_id in (select public.permitted_committee_ids('read_participants'));
$$;

revoke execute on function public.participant_list_delegation_ids() from public, anon;
grant execute on function public.participant_list_delegation_ids() to authenticated;

create policy "Participant readers can read the delegations they list"
  on public.delegations
  for select
  to authenticated
  using (id in (select public.participant_list_delegation_ids()));

create policy "Participant readers can read the members they list"
  on public.delegation_members
  for select
  to authenticated
  using (delegation_id in (select public.participant_list_delegation_ids()));

-- End of migration. Never edit this file once applied; write a new one.
