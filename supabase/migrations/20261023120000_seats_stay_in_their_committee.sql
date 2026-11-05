-- =============================================================================
-- A seat stays in its committee, and a delegation's reserved seat is not
-- deleted out from under it
-- =============================================================================
-- What finding M4 of the security review of 2026-10-10
-- (docs/security-review-2026-10-10.md) left open after protect_seats_columns
-- (C4) stopped browsers writing who sits in a seat.
--
-- 1. A committee editor could still move a seat to another committee
--    (update seats set committee_id = ...). The seat took its delegate, its
--    application and its delegation along, so somebody accepted into one
--    committee sat in another with nobody deciding it, and the move could even
--    land in a conference of the editor's own. Nothing in the app moves a seat
--    between committees: delegates move through move_delegate and
--    swap_delegates, which run as their owner.
--
-- 2. The seats delete policy refused only a seat somebody sits in, because
--    that was all it asked about. A seat held for a delegation has nobody in it
--    until the head names a member, so an editor could delete it and the
--    delegation lost a seat it had been given. The committee editor checks
--    this first, but the rule was the page's alone.
--
-- 3. For the same reason committee_has_delegates, which the committees delete
--    policy asks, let a committee go whose seats were all reserved and not yet
--    filled, and the cascade took the reservations with it.
--
-- 4. Counting a reserved seat was not enough on its own. The function was
--    STABLE and read the seats without locking them, so it saw them as the
--    delete's own snapshot had them: a committee deleted while
--    allocate_delegation_seats (or accept_application, or move_delegate) was
--    writing to one of its seats looked empty, and once the writer committed
--    the cascade took the seat it had just reserved. Shown with two sessions
--    by the final review.
--
-- 5. The first locks that answered point 4 left three gaps, found by a second
--    look. They let seats be added while the delete waited, and a seat added
--    then was never counted, so it could be reserved and still go with the
--    committee. remove_delegation_seat held its seat before its delegation,
--    the other way round from allocate_delegation_seats, so the two and a
--    delete counting seats could wait in a circle. And anybody signed in
--    could call the function through the API and hold a conference's seats.
--
-- 6. Locking the committee "for update" kept new seats out, but a third look
--    found it deadlocked with move_delegate and swap_delegates when the
--    delegate had a position paper (section 3 says why). So the committee
--    lock stays "for no key update", and a seat being added waits for the
--    delete through a trigger instead (section 5).
--
-- 7. That trigger first held the committee's row "for share". A fourth look
--    found that this made adding seats and editing the committee wait on
--    each other, and deadlocked them in some orders, and that a delete
--    refused for a delegation's seats could deadlock with a head changing
--    those seats. So the trigger takes an advisory lock, which no edit of the
--    committee takes, only a delete, and a delete stops before it locks any
--    seat once it sees one filled or reserved (section 3).
--
-- This file:
--
--   * has protect_seats_columns refuse a browser change of committee_id;
--   * lets the seats delete policy take only a seat that is neither filled nor
--     reserved;
--   * has committee_has_delegates count a reserved seat too, and, for
--     somebody who may manage the committee, lock the committee, keep new
--     seats out, and then, unless a seat is already filled or reserved, lock
--     its seats before it counts them, so that it waits for a writer and
--     counts what the writer left;
--   * has a seat added to a committee wait for a delete of that committee
--     (hold_committee_for_new_seat), so no seat can be added while the
--     delete counts;
--   * has remove_delegation_seat hold the delegation before the seat, the
--     order allocate_delegation_seats takes.
--
-- The database tests are in client/tests/db/seats-stay-in-their-committee.test.ts.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.

-- -----------------------------------------------------------------------------
-- 1. A seat stays in its committee
-- -----------------------------------------------------------------------------
-- The whole function again, with one new check before the others. The rest is
-- as 20261022110000 left it.
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

  -- A seat belongs to the committee it was added to. Its delegate, if any,
  -- would go with it, so moving it is a seating decision the allocation
  -- functions make, and moving an empty one is nothing the app does.
  if new.committee_id is distinct from old.committee_id then
    raise exception 'A seat stays in the committee it was added to. Add a seat to the other committee instead';
  end if;

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

-- -----------------------------------------------------------------------------
-- 2. A reserved seat is not deleted
-- -----------------------------------------------------------------------------
-- A refused delete hides the row rather than raising, so deleteSeat in
-- client/src/lib/server/seats.ts still reads it as "nothing went".
drop policy "Committee editors can delete a seat nobody sits in" on public.seats;

create policy "Committee editors can delete a seat nobody sits in or holds"
  on public.seats
  for delete
  to authenticated
  using (
    user_id is null
    and delegation_id is null
    and exists (
      select 1
      from public.committees as committee
      where committee.id = seats.committee_id
        and public.has_permission(committee.conference_id, 'manage_committees')
    )
  );

-- -----------------------------------------------------------------------------
-- 3. Nor is a committee with one
-- -----------------------------------------------------------------------------
-- The committees delete policy is unchanged and still asks this function, for
-- the reasons 20260916120000 gives. A reserved seat counts as a delegate's,
-- because a delegate of that delegation is about to sit in it.
--
-- The committee is locked first, "for no key update". Two deletes of one
-- committee, such as a form sent twice, take their turns here: the second
-- waits holding nothing, then finds the committee gone and deletes nothing.
-- Next the delete takes the lock a seat being added waits for
-- (hold_committee_for_new_seat, section 5), so no seat can be added while it
-- counts: one added at that moment waits for the delete to finish, and its
-- foreign key refuses it if the committee went.
--
-- The committee lock is no stronger on purpose. move_delegate and
-- swap_delegates hold their seats and then point the delegate's position
-- paper at the new seat's committee, and the paper's foreign key check takes
-- a "key share" lock on that committee. A "for update" lock here would make
-- the check wait for the delete while the delete waited for the seats, and
-- Postgres would end one of them with "deadlock detected": shown with three
-- sessions by the third look. "for no key update" lets the check through.
--
-- A committee with a seat already filled or reserved is kept there and then,
-- before any seat is locked. A writer emptying that seat at the same moment
-- costs only a refused delete that goes through when it is tried again.
--
-- Otherwise the seats are locked, "for share", and held until the delete's
-- transaction ends. A seat that a writer is changing makes the delete wait
-- until the writer is done, and then hands back the seat as the writer left
-- it, so a reservation made a moment ago is counted (point 4 above). The
-- other way round, a writer that comes second waits for the delete and then
-- finds its seat gone, which allocate_delegation_seats and accept_application
-- already refuse in words.
--
-- The seats are locked by id, the order allocate_delegation_seats,
-- swap_delegates and move_delegate lock theirs in. None of them waits for the
-- committee's lock or the one a new seat takes, and a seat being added takes
-- its lock before any seat, so the delete and these writers cannot each hold
-- what the other wants: shown with two and three sessions when this file was
-- checked. A head changing their delegation's seats in one statement, and a
-- delegation being deleted, which empties its seats, take seats in another
-- order, but only the delegation's own, and a delete that sees one of those
-- stops before it locks any (the fourth look found the two deadlocking
-- before it did). A seat given to a delegation after that look and before
-- the locks could still bring them into a circle, and Postgres would end
-- one with "deadlock detected"; trying again then works. So could a
-- statement deleting several committees, which takes them one after
-- another, each with its seats. The app deletes one at a time.
--
-- Somebody who may not manage the committee is told "yes", and nothing is
-- locked for them. The policy asks has_permission as well, so for a delete
-- this changes nothing; but anybody signed in can also call the function on
-- its own through the API, and should not be able to hold a conference's
-- seats with it.
--
-- Locking a row is a write in Postgres's eyes, so the function is volatile:
-- a stable one may not lock rows, though it could take the advisory lock. A
-- seat that a writer is changing when the count
-- begins is seen through its lock: "for share" waits for the writer, and then
-- reads the seat as the writer left it, though the count began before the
-- writer finished. Each statement of a volatile function also starts from
-- what was committed just before it, rather than from what the delete saw
-- when it started. That is what lets the early look see a seat reserved
-- since the delete began, and stop before it locks any seat, and what lets
-- the count see, and lock, a seat whose insert the delete waited for.
create or replace function public.committee_has_delegates(committee_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  has_delegates boolean;
begin
  -- "perform" is PL/pgSQL for a query run for its effect, here the lock,
  -- with its row thrown away. "found" then says whether there was a row: no
  -- committee, one that was deleted while this waited, and one the reader may
  -- not manage all answer "yes", which keeps the committee.
  perform committee.id
  from public.committees as committee
  where committee.id = committee_has_delegates.committee_id
    and public.has_permission(committee.conference_id, 'manage_committees')
  for no key update;

  if not found then
    return true;
  end if;

  -- The lock hold_committee_for_new_seat waits for, on the same two numbers
  -- (section 5), taken whole: a seat being added holds it shared.
  perform pg_advisory_xact_lock(
    hashtext('committee-seats'),
    hashtext(committee_has_delegates.committee_id::text)
  );

  if exists (
    select 1
    from public.seats as seat
    where seat.committee_id = committee_has_delegates.committee_id
      and (seat.user_id is not null or seat.delegation_id is not null)
  ) then
    return true;
  end if;

  -- A lock and an aggregate cannot share one select, so the seats are locked
  -- in the inner one and counted in the outer.
  select coalesce(bool_or(seat.user_id is not null or seat.delegation_id is not null), false)
  into has_delegates
  from (
    select held.user_id, held.delegation_id
    from public.seats as held
    where held.committee_id = committee_has_delegates.committee_id
    order by held.id
    for share
  ) as seat;

  return has_delegates;
end;
$$;

revoke execute on function public.committee_has_delegates(uuid) from public, anon;
grant execute on function public.committee_has_delegates(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. remove_delegation_seat holds the delegation before the seat
-- -----------------------------------------------------------------------------
-- The body of 20261022131000_money_races_and_invoice_payers with its two
-- locks the other way round, and its refusals word for word: the pages match
-- on them. It held the seat and then the delegation, and
-- allocate_delegation_seats holds the delegation and then the seats. With a
-- committee delete counting seats in id order beside them, each of the three
-- could hold what the next one wanted, until Postgres ended one with
-- "deadlock detected": shown with three sessions by the second look (point 5).
-- Now both functions take the delegation first.
--
-- The seat is read once without a lock, to check the reader and learn which
-- delegation to hold, and read again under its lock, so the refusals below
-- are about the seat as it is now. A seat that went to another delegation in
-- between is refused like one no longer reserved.
create or replace function public.remove_delegation_seat(seat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  seat public.seats;
  seat_conference uuid;
  reserved_for uuid;
  group_invoice public.invoices;
  rows_changed integer;
begin
  -- A seat never moves to another committee, so the conference read here is
  -- still its conference once the seat is locked.
  select committee.conference_id, seat_row.delegation_id
  into seat_conference, reserved_for
  from public.seats as seat_row
  join public.committees as committee on committee.id = seat_row.committee_id
  where seat_row.id = remove_delegation_seat.seat_id;

  if seat_conference is null then
    raise exception 'That seat does not exist';
  end if;

  if not public.has_permission(seat_conference, 'decide_applications') then
    raise exception 'Only the organisers of this conference can free a seat';
  end if;

  if reserved_for is null then
    raise exception 'That seat is not reserved for a delegation';
  end if;

  -- The delegation is held first, before its invoice is touched. Two removals
  -- of two different seats of one delegation, arriving together, would both
  -- read the same newest unpaid invoice, both void it, and both write a
  -- replacement one seat short (finding L31). The second now waits here, and
  -- then finds the replacement the first one wrote, which is the invoice it
  -- should be shortening. allocate_delegation_seats holds the same lock, also
  -- before any seat.
  perform delegation.id
  from public.delegations as delegation
  where delegation.id = reserved_for
  for update;

  -- Then the seat, held until this transaction ends, so two removals of the
  -- same seat are refused one after the other rather than both run.
  select *
  into seat
  from public.seats as seat_row
  where seat_row.id = remove_delegation_seat.seat_id
  for update;

  if seat.id is null then
    raise exception 'That seat does not exist';
  end if;

  if seat.delegation_id is distinct from reserved_for then
    raise exception 'That seat is not reserved for a delegation';
  end if;

  if seat.user_id is not null then
    raise exception 'Somebody is sitting in that seat. Revoke it instead.';
  end if;

  update public.seats
  set delegation_id = null,
      allocated_at = null
  where id = remove_delegation_seat.seat_id
    and delegation_id = seat.delegation_id
    and user_id is null;

  get diagnostics rows_changed = row_count;

  if rows_changed = 0 then
    raise exception 'That seat is not reserved for a delegation';
  end if;

  -- The newest unpaid group invoice of this delegation. The number breaks a tie
  -- on created_at, because two invoices written in the same transaction share
  -- that moment to the microsecond and "newest" would otherwise be whichever
  -- one Postgres happened to read first: next_invoice_number hands the numbers
  -- out in order, so the higher one is the later invoice.
  --
  -- "for update" holds the row that is about to be voided, so that a manager
  -- settling it at this very moment and this function take their turns.
  select *
  into group_invoice
  from public.invoices as invoice
  where invoice.delegation_id = seat.delegation_id
    and invoice.status = 'unpaid'
  order by invoice.created_at desc, invoice.number desc
  limit 1
  for update;

  if group_invoice.id is null then
    return;
  end if;

  update public.invoices
  set status = 'void'
  where id = group_invoice.id
    and status = 'unpaid';

  get diagnostics rows_changed = row_count;

  if rows_changed = 0 then
    raise exception 'That invoice has already moved on';
  end if;

  if group_invoice.quantity <= 1 then
    return;
  end if;

  insert into public.invoices (
    conference_id, number, payer_user_id, delegation_id, fee_id,
    description, quantity, unit_amount_cents, currency, due_at
  )
  values (
    group_invoice.conference_id,
    public.next_invoice_number(group_invoice.conference_id),
    group_invoice.payer_user_id,
    group_invoice.delegation_id,
    group_invoice.fee_id,
    -- The replacement is described the same way the first one was, with the new
    -- count in front of it, so the two read as one story on the invoices page.
    --
    -- A group invoice this function wrote always opens with a count, but one an
    -- organiser raised by hand may open with anything, and replacing nothing
    -- would leave a description saying three seats on a row that charges for
    -- two. So a description with no count on the front is given one.
    case
      when group_invoice.description ~ '^\d+ × '
        then regexp_replace(
          group_invoice.description, '^\d+ × ', (group_invoice.quantity - 1) || ' × '
        )
      else (group_invoice.quantity - 1) || ' × ' || group_invoice.description
    end,
    group_invoice.quantity - 1,
    group_invoice.unit_amount_cents,
    group_invoice.currency,
    group_invoice.due_at
  );
end;
$$;

revoke execute on function public.remove_delegation_seat(uuid) from public, anon;
grant execute on function public.remove_delegation_seat(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. A seat being added waits for its committee's delete
-- -----------------------------------------------------------------------------
-- A seat's foreign key check takes only a "key share" lock on its committee,
-- which the delete's lock in section 3 lets through. Without this, a seat
-- could be added while a delete counted, go uncounted, be reserved for a
-- delegation a moment later, and then go with the committee (point 5 above).
--
-- The trigger takes an advisory lock: a lock on a pair of numbers rather
-- than on a row, here 'committee-seats' and the committee's id, each made a
-- number by hashtext. committee_has_delegates takes the same pair whole
-- before it counts. The trigger takes it shared, so seats being added wait
-- for a delete and not for each other. A delete that comes first makes the
-- seat wait, and the seat's foreign key refuses it if the committee went; a
-- seat that comes first makes the delete wait until it is committed, and the
-- delete then counts it. Two different committees can, rarely, make the same
-- pair, and then one waits for the other a moment for nothing.
--
-- Nothing else takes the lock, so adding a seat does not wait for a change
-- of description and topics or a copied procedure, nor they for it, as they
-- did when this trigger held the committee's row "for share" (point 7
-- above). A save that writes the committee's slug still holds up a seat
-- being added, and the other way round, for one statement, as it always
-- has. The slug is part of a unique key, and committees has BEFORE UPDATE
-- triggers (committees_protect_columns, committees_set_updated_at), so when
-- an update names the slug, even with its old value, Postgres locks the
-- row "for update" rather than "for no key update", which holds up the
-- seat's foreign key check. Every save of the setup dialog and of the
-- committee page's whole form names it. That wait cannot form a circle with
-- the delete, because such a save takes neither this lock nor a seat's.
--
-- It runs before each row is written, so a statement adding several seats,
-- or a quick session's upsert, which changes some seats and adds others,
-- takes the lock before any seat, the order the delete takes.
--
-- It is taken for everybody adding a seat, the service role included,
-- without asking who they are: the lock holds nothing anybody could read or
-- change. Somebody who may not add the seat holds it only until the seats
-- insert policy refuses them, a moment later, and their transaction ends.
--
-- Something that added a seat and then edited its committee, a rename say,
-- in one transaction, while that committee was being deleted, would hold this
-- lock and want the committee's row, as the delete held the row and wanted
-- this lock, and Postgres would end one with "deadlock detected". Nothing
-- does: each request from the pages is a transaction of its own, and
-- create_quick_session, the one function that adds seats, adds them to a
-- committee it has just made.
create or replace function public.hold_committee_for_new_seat()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock_shared(
    hashtext('committee-seats'),
    hashtext(new.committee_id::text)
  );

  return new;
end;
$$;

revoke execute on function public.hold_committee_for_new_seat() from public, anon, authenticated;

create trigger seats_hold_committee
  before insert on public.seats
  for each row execute function public.hold_committee_for_new_seat();
