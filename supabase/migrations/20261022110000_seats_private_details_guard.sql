-- =============================================================================
-- Seats are filled only by the allocation functions, and private details
-- follow a real application or delegation
-- (docs/security-review-2026-10-10.md: C4, M4, L16, L19, I23)
-- =============================================================================
--
-- Never edit this file once it has been applied anywhere. Add a new migration.
--
-- WHAT WAS WRONG
-- Anybody signed in can create an organisation and is made its owner, and an
-- owner holds every permission on every conference of that organisation, draft
-- or not. The `seats` policies of migration 20261007180000 ask only for
-- `manage_committees` and, because a policy decides rows and not columns, let
-- that holder write any column of a seat. Nothing checked that the person
-- written into `user_id` had applied, been invited or agreed, and
-- `private_details_user_ids` (migration 20261007140000) counted any seat as
-- taking part. So a fresh account could add a committee and a seat to a draft
-- conference of its own, write a stranger's id into the seat, and read that
-- stranger's email, phone, date of birth, dietary requirements and emergency
-- contact through `staff_contact_details` and `staff_welfare_details`. The
-- seat notification triggers fire only on update, so an insert told the
-- victim nothing. (C4)
--
-- The same policies let a real conference's "head of academics" style role,
-- holding `manage_committees` alone, seat, unseat and re-point delegates by
-- hand, around `decide_applications` and the invoices and application statuses
-- the allocation functions keep in step. (M4)
--
-- The application branch of the function kept counting applicants after they
-- withdrew or were rejected, so the team kept their details for ever. (L19)
--
-- The two views run as their owner and were created without
-- `security_barrier`, so a reader's own predicate could be pushed down and run
-- against rows outside the view's `where`. (L16)
--
-- WHAT THIS DOES
--   1. protect_seats_columns, a BEFORE INSERT OR UPDATE trigger on seats. For
--      the two browser roles it refuses a non-null user_id, application_id,
--      delegation_id or allocated_at on insert, and any change to those four on
--      update, with one exception: a head of the delegation a seat is reserved
--      for may change user_id, to a member of that delegation or to null, which
--      is how the delegation seats page fills the delegation's seats today
--      ($lib/server/delegations.ts, assignDelegationSeat and
--      unassignDelegationSeat). Every other seating write goes through the
--      security definer allocation functions (accept_application,
--      allocate_delegation_seats, move_delegate, swap_delegates,
--      remove_delegation_seat, revoke_seat), inside which current_user is the
--      functions' owner and the guard does not fire. The seat list's own
--      writes, adding an empty seat, renaming, reordering, hiding and deleting,
--      are untouched.
--   2. private_details_user_ids counts a seat only when the seated person's own
--      application (not a draft) or own delegation membership stands behind it,
--      leaves out draft, withdrawn and rejected applications, and leaves out the
--      members of withdrawn and rejected delegations.
--   3. security_barrier on staff_contact_details and staff_welfare_details.
--
-- Nothing here is a schema change, so the generated types are unchanged. The
-- database tests are in client/tests/db/security-seats-private-details.test.ts.


-- -----------------------------------------------------------------------------
-- 1. protect_seats_columns: who may write the seating columns
-- -----------------------------------------------------------------------------
-- Like protect_stripe_columns (20260915130000) and protect_conferences_columns
-- (20260919140000) this is an ordinary function, not security definer, so that
-- current_user is the caller's role. Inside the allocation functions, which are
-- security definer, current_user is their owner, and inside the service role's
-- requests it is service_role; neither is a browser, and both pass. The seeds
-- run as postgres and pass the same way.
--
-- The four columns are named, rather than everything outside an allow-list,
-- for the reason protect_conferences_columns gives: a committee editor may
-- write every column that describes a seat (name, kind, flag, position,
-- is_available), and a column added to seats later is description until
-- somebody says otherwise. The four here are the allocation itself: who sits
-- here, which application or delegation put them here, and when.
--
-- The membership check reads delegation_members as the caller, under Row Level
-- Security. A head is a member of their own delegation, so "Members can read
-- who else is in their delegation" shows them every row they need. It repeats
-- rule 3 of check_seat_allocation on purpose: that trigger is the integrity
-- rule for every writer, this one is the door for browsers, and each stands on
-- its own. The two say it in the same words, because the delegation seats page
-- recognises the sentence.

create or replace function public.protect_seats_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.user_id is not null
      or new.application_id is not null
      or new.delegation_id is not null
      or new.allocated_at is not null
    then
      raise exception 'A new seat is empty: people are seated through the allocation functions';
    end if;

    return new;
  end if;

  -- From here on tg_op is UPDATE, so old is a row.
  if new.application_id is distinct from old.application_id
    or new.delegation_id is distinct from old.delegation_id
    or new.allocated_at is distinct from old.allocated_at
  then
    raise exception 'Who a seat is reserved for, and when, is written by the allocation functions';
  end if;

  if new.user_id is not distinct from old.user_id then
    return new;
  end if;

  -- The one browser write that may change user_id: a head of the delegation
  -- this seat is reserved for, seating one of its members or emptying the seat.
  -- It asks about the delegation the row already names (old.delegation_id);
  -- the check above has made sure new.delegation_id is the same one.
  if old.delegation_id is null or not public.is_delegation_head(old.delegation_id) then
    raise exception 'People are seated through the allocation functions';
  end if;

  if new.user_id is not null and not exists (
    select 1
    from public.delegation_members as membership
    where membership.delegation_id = old.delegation_id
      and membership.user_id = new.user_id
  ) then
    raise exception 'That person is not a member of the delegation this seat is reserved for';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_seats_columns() from public, anon, authenticated;

-- Triggers on one table and one event fire in alphabetical order by name, and
-- this one has to run before seats_check_allocation ("b" before "c"). That
-- trigger stamps allocated_at itself when a head seats a member, so a guard
-- running after it would see allocated_at change and refuse the head's own
-- allowed write. Running first, this guard sees the row exactly as the browser
-- sent it, which is the only row it has anything to say about.
create trigger seats_browser_column_guard
  before insert or update on public.seats
  for each row
  execute function public.protect_seats_columns();


-- -----------------------------------------------------------------------------
-- 2. private_details_user_ids: whose details a permission opens
-- -----------------------------------------------------------------------------
-- The body of migration 20261007140000 with three changes, each one a line of
-- the review:
--
--   * The application branch leaves out withdrawn and rejected applications
--     as well as drafts. A draft was never sent, and a withdrawn or rejected
--     one is over; the team has nothing left to book, feed or call about.
--   * The delegation-member branch leaves out withdrawn and rejected
--     delegations, for the same reason.
--   * The seat branch counts a seat only when the seated person's own
--     application (not a draft) or their own membership of the seat's
--     delegation stands behind it. That is the shape every allocation function
--     writes; a seat with a person and nothing behind them is a seat nobody
--     should have been able to write, and this is the second lock on it.
--
-- The signature, the grants and the per-committee scoping through
-- permitted_committee_ids are as they were.

create or replace function public.private_details_user_ids(permission public.permission)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select application.user_id
  from public.applications as application
  where application.status not in ('draft', 'withdrawn', 'rejected')
    and application.conference_id in (
      select public.permitted_conference_ids(private_details_user_ids.permission)
    )

  union

  select membership.user_id
  from public.delegation_members as membership
  join public.delegations as delegation on delegation.id = membership.delegation_id
  where delegation.status not in ('withdrawn', 'rejected')
    and delegation.conference_id in (
      select public.permitted_conference_ids(private_details_user_ids.permission)
    )

  union

  select seat.user_id
  from public.seats as seat
  where seat.user_id is not null
    and seat.committee_id in (
      select public.permitted_committee_ids(private_details_user_ids.permission)
    )
    and (
      exists (
        select 1
        from public.applications as application
        where application.id = seat.application_id
          and application.user_id = seat.user_id
          and application.status <> 'draft'
      )
      or exists (
        select 1
        from public.delegation_members as membership
        where membership.delegation_id = seat.delegation_id
          and membership.user_id = seat.user_id
      )
    );
$$;

-- "create or replace" keeps a function's grants, but saying them again costs
-- nothing and leaves the reader in no doubt: the signed-in may call it, and it
-- answers only about the caller's own permissions.
revoke execute on function public.private_details_user_ids(public.permission) from public, anon;
grant execute on function public.private_details_user_ids(public.permission) to authenticated;


-- -----------------------------------------------------------------------------
-- 3. The two views get security_barrier
-- -----------------------------------------------------------------------------
-- A view that runs as its owner (security_invoker = false) is a gate, and
-- without this option the planner may run a reader's own `where` before the
-- view's, so a function the reader wrote could see rows the gate was meant to
-- hold back. With it, the view's predicate always runs first.

alter view public.staff_contact_details set (security_barrier = true);
alter view public.staff_welfare_details set (security_barrier = true);

-- End of migration. Never edit this file once applied; write a new one.
