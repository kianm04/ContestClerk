-- =============================================================================
-- Delegation private reads (security review 2026-10-10, findings M18 and M19)
-- =============================================================================
-- Two reads on the delegate side gave away more than the page they served
-- ever showed.
--
-- M18. Migration 20261007140000 let a holder of `read_participants` select the
-- whole `delegations` row of any delegation holding a seat in their
-- committee, so that the participants page could name a delegate's group. A
-- whole row includes `join_code`, and `join_delegation` asked nothing about
-- who was joining, so a chair could take the code, join the delegation and
-- then read its position-paper drafts in every committee and its
-- announcements. Row Level Security decides rows, not columns, so the row
-- policy goes and a view takes its place: `participant_delegations` answers
-- the public columns only (id, conference, name, institution, country,
-- status) and never the join code. `join_delegation` now turns away anybody
-- on the conference team. Heads and members already in a delegation are left
-- as they are: the gate is on joining, not on staying.
--
-- M19. The head of a delegation read the whole `profile_details` row of every
-- member: email, date of birth and the emergency contact as well as the phone
-- number and dietary requirements their members page shows, and for as long
-- as the membership row existed, through rejected and withdrawn states too.
-- Members consent to this on joining, so it is a question of reading the least
-- that does the job and for no longer than needed, not a missing check. The
-- policy goes and `delegation_member_details` takes its place: the phone
-- number and dietary requirements of the members of delegations the caller
-- heads, while the delegation is neither withdrawn nor rejected. The head
-- never reads the date of birth any more; their page showed no age.
--
-- Both views are built the way `staff_contact_details` is
-- (`security_invoker = false`): the view reads the table as its owner, and its
-- own `where` is the rule.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- M18: participant_delegations, the public face of a delegation
-- -----------------------------------------------------------------------------
-- The rows are the delegations the caller may know about at all, and the
-- columns are the ones every one of those readers may see:
--
--   * the delegations holding a seat whose participant they may list, which
--     is what `participant_list_delegation_ids` answers and what the old row
--     policy let a chair read in full;
--   * their own delegation, which `delegations` already answers them in full;
--   * every delegation of a conference where they hold `read_applications`,
--     which `delegations` already answers them in full as well.
--
-- The last two are here so that one read serves every page that names a
-- delegation beside a seat: the public committee page, the committees editor
-- and the participants page are each read by members, chairs and organisers
-- alike, and a page that had to ask the table for some readers and the view
-- for others would be two doors to keep in step. Nothing is opened by them
-- that the table did not already open; what closes is the chair's whole row.

drop policy "Participant readers can read the delegations they list" on public.delegations;

create view public.participant_delegations
with (security_invoker = false)
as
  select
    delegation.id,
    delegation.conference_id,
    delegation.name,
    delegation.institution_name,
    delegation.country_code,
    delegation.status
  from public.delegations as delegation
  where delegation.id in (select public.participant_list_delegation_ids())
    or public.is_delegation_member(delegation.id)
    or delegation.conference_id in (select public.permitted_conference_ids('read_applications'));

-- Supabase grants every new relation to anon and authenticated by default.
-- Read-only, and only for the signed-in: every rule in the `where` is about
-- who the caller is.
revoke all on public.participant_delegations from public, anon, authenticated;
grant select on public.participant_delegations to authenticated;


-- -----------------------------------------------------------------------------
-- M18: join_delegation turns the conference team away
-- -----------------------------------------------------------------------------
-- The body is the one migration 20260920190000 wrote, with one more refusal
-- after "already in this delegation": somebody on the team of the conference
-- (`is_conference_staff`: a staff row, or an owner or admin of the organising
-- organisation, or a platform admin) is told the team cannot join. It comes
-- before the status checks so that a chair is told the one thing that is true
-- of them whatever state the delegation is in. The page's own
-- `canJoinDelegation` does not ask this question, because the preview it works
-- from says nothing about the reader's roles; the database is the guard, which
-- is what join.md asks for, and the action words the refusal.

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

  select *
  into delegation
  from public.delegations as delegation_row
  where delegation_row.join_code = join_delegation.code;

  if delegation.id is null then
    raise exception 'That join code does not belong to a delegation';
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


-- -----------------------------------------------------------------------------
-- M19: delegation_member_details, what a head reads of their members
-- -----------------------------------------------------------------------------
-- One row per membership of a delegation the caller heads, while that
-- delegation is neither withdrawn nor rejected, carrying the two facts the
-- members page shows and nothing else. The caller's own row is among them,
-- which costs nothing: they read their own `profile_details` anyway.
--
-- The delegations the caller heads are found once, as a set, rather than by
-- asking `is_delegation_head` of every row, for the reason migration
-- 20260923150000 gives: a rule that runs once per query, not once per row.

drop policy "A delegation head can read the details of their own members"
  on public.profile_details;

create view public.delegation_member_details
with (security_invoker = false)
as
  select
    membership.user_id,
    membership.delegation_id,
    detail.phone,
    detail.dietary_requirements
  from public.delegation_members as membership
  join public.delegations as delegation on delegation.id = membership.delegation_id
  join public.profile_details as detail on detail.user_id = membership.user_id
  where delegation.status not in ('withdrawn', 'rejected')
    and membership.delegation_id in (
      select head.delegation_id
      from public.delegation_members as head
      where head.user_id = (select auth.uid())
        and head.role = 'head'
    );

revoke all on public.delegation_member_details from public, anon, authenticated;
grant select on public.delegation_member_details to authenticated;

-- End of migration. Never edit this file once applied; write a new one.
