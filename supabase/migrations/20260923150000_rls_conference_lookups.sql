-- T122: make the "who may read this" rules on seats, committees and conferences
-- cost one lookup per query instead of one lookup per row.
--
-- The old read rules called `is_conference_staff(...)` and
-- `is_conference_participant(...)` once for every row Postgres looked at. When
-- the app asks for "the seats of this conference", PostgREST writes the join to
-- `committees` in a shape (a LATERAL join with a LIMIT) that stops Postgres from
-- narrowing to that one conference first. So it checked every seat of every
-- conference in the database, calling those functions each time. One seat-list
-- request took 0.5 to 1 second and grew with every conference anybody created.
--
-- The fix follows Supabase's advice for fast policies: a security definer
-- function works out, once, the full set of conferences (or committees) the
-- signed-in user may read, and the policy asks "is this row's id in that set?".
-- Postgres runs a set-returning function inside `in (select ...)` once per
-- query and checks each row against the result with a hash lookup.
--
-- Who may read what does not change. The rules below say exactly what the old
-- ones said; only how the answer is worked out is different.


-- The conferences the signed-in user is staff of, in the sense of
-- `is_conference_staff`: anybody on the conference's team in any role, every
-- member of the organisation that owns it, and a platform admin for every
-- conference.
create function public.staff_conference_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select staff.conference_id
  from public.conference_staff as staff
  where staff.user_id = (select auth.uid())

  union

  select conference.id
  from public.conferences as conference
  join public.organization_members as membership
    on membership.organization_id = conference.organization_id
  where membership.user_id = (select auth.uid())

  union

  select conference.id
  from public.conferences as conference
  where public.is_platform_admin();
$$;

revoke execute on function public.staff_conference_ids() from public, anon;
grant execute on function public.staff_conference_ids() to authenticated;


-- The conferences the signed-in user takes part in, in the sense of
-- `is_conference_participant`: they sit in one of its seats, they sent it an
-- application (a draft does not count), or they belong to one of its
-- delegations.
create function public.participant_conference_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select committee.conference_id
  from public.seats as seat
  join public.committees as committee on committee.id = seat.committee_id
  where seat.user_id = (select auth.uid())

  union

  select application.conference_id
  from public.applications as application
  where application.user_id = (select auth.uid())
    and application.status <> 'draft'

  union

  select delegation.conference_id
  from public.delegation_members as membership
  join public.delegations as delegation on delegation.id = membership.delegation_id
  where membership.user_id = (select auth.uid());
$$;

revoke execute on function public.participant_conference_ids() from public, anon;
grant execute on function public.participant_conference_ids() to authenticated;


-- The committees whose seat list the signed-in user may read. This is what the
-- old seats rule worked out row by row: the staff of a conference see its
-- committees in any status, and a participant sees them once the conference is
-- published or archived. (The old rule got the second half from the committees
-- read rule, which hides the committees of an unpublished conference from
-- anybody who is not staff.)
create function public.seat_list_committee_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select committee.id
  from public.committees as committee
  where committee.conference_id in (select public.staff_conference_ids())

  union

  select committee.id
  from public.committees as committee
  join public.conferences as conference on conference.id = committee.conference_id
  where conference.status in ('published', 'archived')
    and committee.conference_id in (select public.participant_conference_ids());
$$;

revoke execute on function public.seat_list_committee_ids() from public, anon;
grant execute on function public.seat_list_committee_ids() to authenticated;


-- The seats read rule. Before: an EXISTS over `committees` that called
-- `is_conference_participant` and `is_conference_staff` for every seat.
drop policy "Participants and staff can read a seat list" on public.seats;

create policy "Participants and staff can read a seat list"
  on public.seats for select
  to authenticated
  using (committee_id in (select public.seat_list_committee_ids()));


-- The committees read rule for staff. Before: `is_conference_staff(conference_id)`
-- for every committee.
drop policy "Staff can read the committees of their conference" on public.committees;

create policy "Staff can read the committees of their conference"
  on public.committees for select
  to authenticated
  using (conference_id in (select public.staff_conference_ids()));


-- The organisations the signed-in user is a member of, in any role. This is
-- the set form of `is_organization_member`.
create function public.member_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select membership.organization_id
  from public.organization_members as membership
  where membership.user_id = (select auth.uid());
$$;

revoke execute on function public.member_organization_ids() from public, anon;
grant execute on function public.member_organization_ids() to authenticated;


-- The conferences read rule for staff. Before: `is_organization_member` and
-- `is_conference_staff` for every conference.
--
-- The organisation check stays separate from `staff_conference_ids`, even
-- though that set includes the organisation's conferences too. Creating a
-- conference reads the new row straight back, and a function like
-- `staff_conference_ids` sees the tables as they were when the statement
-- started, before that row existed. The organisation already existed then, so
-- asking about the row's `organization_id` still lets its creator read it.
drop policy "Staff can read their conference in any status" on public.conferences;

create policy "Staff can read their conference in any status"
  on public.conferences for select
  to authenticated
  using (
    organization_id in (select public.member_organization_ids())
    or id in (select public.staff_conference_ids())
  );
