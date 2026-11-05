-- =============================================================================
-- Money: who an invoice may be raised against, and the allocation races
-- =============================================================================
-- Findings M10, L30, L31, L34, L35, L12 and L13 of
-- docs/security-review-2026-10-10.md.
--
-- WHO MAY BE INVOICED (M10)
-- The invoices insert policy asks whether the caller manages invoices on the
-- conference, and guard_invoice_insert asked only that a payer be named.
-- Anybody can own an organisation, so anybody can hold manage_invoices, and
-- profile ids are easy to come by: an invoice could be raised against any
-- account on the platform, whose owner was then told about a bill with the
-- attacker's own payment instructions on it. The guard now asks
-- invoice_payer_takes_part, below, whether the payer has any part in the
-- conference: a seat, an application that is no longer a private draft, or a
-- place in a delegation. The seat an invoice names and the delegation it
-- names are checked to be the conference's own a few lines earlier, so "the
-- seat's holder" and "the delegation's head" are covered by those three.
--
-- WHO MAY ASK ABOUT INVOICES (L12, L13)
-- fee_has_invoices answered anybody who typed a fee id, and
-- fee_invoice_counts answered the whole team, though reading the invoices
-- takes read_invoices. The first now answers the conference's staff, on whose
-- behalf the fees delete policy asks it; the second answers whoever holds
-- edit_conference, read_invoices or manage_invoices, the three permissions
-- that open the fees page ($lib/manage-pages.ts).
--
-- THE RACES (L30, L31, L34, L35)
-- accept_application, allocate_delegation_seats, move_delegate and
-- swap_delegates each read a seat, decided it was free, and then wrote it.
-- Under read committed, two requests arriving together both read the seat as
-- free; the second update waits for the first to commit and then goes ahead,
-- because its where clause asked for the seat's id and nothing else. So two
-- delegations were reserved the same seat and both invoiced for it, one
-- applicant was accepted twice and billed twice, and two moves into one free
-- seat dropped a delegate and deleted their paper. remove_delegation_seat
-- read the newest unpaid group invoice the same way, so two removals voided
-- it once and reissued it twice. The first of these was reproduced with two
-- psql sessions before this migration was written.
--
-- Each function now does two things. It locks the rows it is about to change
-- with "select ... for update" before it reads them, both seats of a move in
-- id order so that two moves can never wait on each other in a circle; a
-- second request then waits for the first to finish and reads what it left
-- behind. And every update repeats, in its where clause, the state the
-- function saw when it decided to go ahead, and raises when no row matched,
-- so that a row which changed between the read and the write can never be
-- written over. allocate_delegation_seats compares the rows its update
-- reserved with the distinct seats asked for and refuses the whole list when
-- they differ.
--
-- Every function is recreated from its newest body, with the refusals' words
-- kept: the pages match on them.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- invoice_payer_takes_part(conference_id, payer_user_id)
-- -----------------------------------------------------------------------------
-- Does this person have any part in this conference: a seat, an application
-- that is no longer a draft, or a place in a delegation? Asked by
-- guard_invoice_insert about the payer of an invoice raised by hand.
--
-- Security definer, like is_conference_participant, so that the question can
-- be answered from tables the caller may not read: an invoice manager need not
-- hold read_applications. It answers false to anybody who may not raise
-- invoices on the conference, so that it cannot be used to find out who is
-- going to one.

create or replace function public.invoice_payer_takes_part(conference_id uuid, payer_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_permission(invoice_payer_takes_part.conference_id, 'manage_invoices')
    and (
      exists (
        select 1
        from public.seats as seat
        join public.committees as committee on committee.id = seat.committee_id
        where committee.conference_id = invoice_payer_takes_part.conference_id
          and seat.user_id = invoice_payer_takes_part.payer_user_id
      )
      or exists (
        select 1
        from public.applications as application
        where application.conference_id = invoice_payer_takes_part.conference_id
          and application.user_id = invoice_payer_takes_part.payer_user_id
          and application.status <> 'draft'
      )
      or exists (
        select 1
        from public.delegation_members as membership
        join public.delegations as delegation on delegation.id = membership.delegation_id
        where delegation.conference_id = invoice_payer_takes_part.conference_id
          and membership.user_id = invoice_payer_takes_part.payer_user_id
      )
    );
$$;

revoke execute on function public.invoice_payer_takes_part(uuid, uuid) from public, anon;
grant execute on function public.invoice_payer_takes_part(uuid, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- guard_invoice_insert()
-- -----------------------------------------------------------------------------
-- The body of 20260919120000_fees_and_invoices.sql, with one more question at
-- the end: is the payer part of the conference (M10)? Everything else is as it
-- was. What an invoice may look like on the day it is written, when a browser
-- is the one writing it: born unpaid, numbered by the database, in the
-- conference's currency, owed by somebody, for a fee, seat or delegation of
-- this conference, with every payment column empty.
--
-- Like the other guards it is deliberately not "security definer", so that
-- current_user reads "authenticated" for a browser and "postgres" inside the
-- allocation functions, which are the server and write these columns
-- legitimately. The one question it cannot answer under the caller's own
-- policies, whether the payer takes part, it asks invoice_payer_takes_part.

create or replace function public.guard_invoice_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- What the organiser raising an invoice by hand chooses, plus the columns
  -- this trigger and compute_invoice_amount have just filled in themselves.
  --
  -- Take those away and every column left -- paid_at, paid_method, the three
  -- stripe_* columns, and any payment column this table grows later -- has to
  -- arrive empty. An allow-list rather than a list of the columns that are
  -- forbidden, because a forbidden list is a list that rots.
  organiser_choosable constant text[] := array[
    'id', 'conference_id', 'number', 'payer_user_id', 'delegation_id', 'seat_id', 'fee_id',
    'description', 'quantity', 'unit_amount_cents', 'amount_cents', 'platform_fee_cents',
    'currency', 'status', 'due_at', 'note', 'created_at', 'updated_at'
  ];
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  -- An invoice is born unpaid. Everything else is something that happened to
  -- it afterwards, and the statuses it may reach from here are
  -- check_invoice_transition's business.
  new.status = 'unpaid';

  -- The number is the database's, not the caller's. A hand-typed one collides
  -- with the next invoice or, worse, does not: a number ending in digits of its
  -- own moves where next_invoice_number counts from, so one invoice numbered by
  -- hand renumbers every invoice after it.
  new.number = public.next_invoice_number(new.conference_id);

  -- The currency is the conference's, and for much the same reason. The
  -- column is copied from there, and Stripe Checkout is created in whatever it
  -- says, so an organiser who typed a currency of their own would send the
  -- payer to a payment page for an amount in a currency nobody had agreed to.
  new.currency = (
    select conference.currency
    from public.conferences as conference
    where conference.id = new.conference_id
  );

  -- The clocks are the database's too, so that a row cannot claim to have been
  -- written last year. invoices_set_updated_at only fires on update.
  new.created_at = now();
  new.updated_at = now();

  -- An invoice has to be owed by somebody on the day it is written. It may
  -- forget them later, when they delete their account, which is what the
  -- "on delete set null" on this column is for.
  if new.payer_user_id is null then
    raise exception 'An invoice has to say who owes it';
  end if;

  -- Whatever the invoice is for has to belong to the conference it is for.
  -- Without these three, an organiser could raise an invoice against another
  -- conference's fee, seat or delegation -- and an invoice pointing at another
  -- conference's fee also freezes that fee for its own organiser, because the
  -- fees delete policy asks only whether any invoice points at the row.
  if new.fee_id is not null and not exists (
    select 1
    from public.fees as fee
    where fee.id = new.fee_id
      and fee.conference_id = new.conference_id
  ) then
    raise exception 'That fee is not part of this conference';
  end if;

  if new.seat_id is not null and not exists (
    select 1
    from public.seats as seat
    join public.committees as committee on committee.id = seat.committee_id
    where seat.id = new.seat_id
      and committee.conference_id = new.conference_id
  ) then
    raise exception 'That seat is not part of this conference';
  end if;

  if new.delegation_id is not null and not exists (
    select 1
    from public.delegations as delegation
    where delegation.id = new.delegation_id
      and delegation.conference_id = new.conference_id
  ) then
    raise exception 'That delegation is not part of this conference';
  end if;

  if exists (
    select 1
    from jsonb_each(to_jsonb(new) - organiser_choosable) as payment_column
    where payment_column.value <> 'null'::jsonb
  ) then
    raise exception 'Only a payment marks an invoice paid';
  end if;

  -- And the person who owes it has to be part of the conference. Without this
  -- an invoice manager could bill any account on the platform, whose owner
  -- would be told about it and shown the manager's payment instructions
  -- (finding M10). The seat and the delegation above are already known to be
  -- this conference's, so their holder and their head pass here too.
  if not public.invoice_payer_takes_part(new.conference_id, new.payer_user_id) then
    raise exception 'An invoice can only be raised against somebody taking part in this conference';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_invoice_insert() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- fee_invoice_counts(conference_id) and fee_has_invoices(fee_id)
-- -----------------------------------------------------------------------------
-- The bodies of 20261007160000_money_permissions.sql, each with its gate.

-- How many invoices point at each fee of a conference, for the people who may
-- open the fees page: a conference editor, who may not read the invoices but
-- sees the count beside each fee, and the invoice readers and managers. An
-- empty answer to everybody else (L13).
create or replace function public.fee_invoice_counts(conference_id uuid)
returns table (fee_id uuid, invoice_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select invoice.fee_id, count(*)::integer
  from public.invoices as invoice
  where invoice.conference_id = fee_invoice_counts.conference_id
    and invoice.fee_id is not null
    and (
      public.has_permission(fee_invoice_counts.conference_id, 'edit_conference')
      or public.has_permission(fee_invoice_counts.conference_id, 'read_invoices')
      or public.has_permission(fee_invoice_counts.conference_id, 'manage_invoices')
    )
  group by invoice.fee_id;
$$;

revoke execute on function public.fee_invoice_counts(uuid) from public, anon;
grant execute on function public.fee_invoice_counts(uuid) to authenticated;

-- Has anybody been charged this fee? Asked by the fees delete policy, on behalf
-- of a conference editor, who is on the team. Answers false to anybody who is
-- not staff of the fee's conference, rather than telling a stranger with a
-- guessed id whether a fee has ever been charged (L12).
create or replace function public.fee_has_invoices(fee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.invoices as invoice
    where invoice.fee_id = fee_has_invoices.fee_id
      and public.is_conference_staff(invoice.conference_id)
  );
$$;

revoke execute on function public.fee_has_invoices(uuid) from public, anon;
grant execute on function public.fee_has_invoices(uuid) to authenticated;


-- =============================================================================
-- The allocation functions, with their locks
-- =============================================================================
-- Each body is the one 20261007150000_applications_permissions.sql gave it,
-- plus the locks and the repeated where clauses described at the top.


-- -----------------------------------------------------------------------------
-- accept_application(application_id, seat_id)
-- -----------------------------------------------------------------------------

create or replace function public.accept_application(application_id uuid, seat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  application public.applications;
  seat public.seats;
  seat_conference uuid;
  fee public.fees;
  conference public.conferences;
  rows_changed integer;
begin
  -- "for update" holds the application row until this transaction ends. A
  -- second accept of the same application arriving at the same moment waits
  -- here, then reads the row as the first one left it, accepted, which the
  -- status check below refuses (finding L34).
  select *
  into application
  from public.applications as application_row
  where application_row.id = accept_application.application_id
  for update;

  if application.id is null then
    raise exception 'That application does not exist';
  end if;

  if not public.has_permission(application.conference_id, 'decide_applications') then
    raise exception 'Only the organisers of this conference can accept an application';
  end if;

  if application.status not in ('submitted', 'waitlisted') then
    raise exception 'Only a submitted or waitlisted application can be accepted';
  end if;

  -- The seat is held the same way, so two applicants accepted into one seat
  -- at the same moment are refused one after the other rather than both
  -- written. It and the conference it is in are read one after the other,
  -- because PL/pgSQL refuses to fill a whole-row variable and a plain one from
  -- the same "into" list.
  select *
  into seat
  from public.seats as seat_row
  where seat_row.id = accept_application.seat_id
  for update;

  select committee.conference_id
  into seat_conference
  from public.committees as committee
  where committee.id = seat.committee_id;

  if seat.id is null or seat_conference is distinct from application.conference_id then
    raise exception 'That seat is not part of this conference';
  end if;

  if seat.user_id is not null or seat.delegation_id is not null or not seat.is_available then
    raise exception 'That seat is not free';
  end if;

  -- The where clause repeats what was just checked, and the row count says
  -- whether the seat was still like that when it was written. With the lock
  -- above it always is; the repetition is there so that the write can never
  -- outrun the check, whatever changes around this function later.
  update public.seats
  set user_id = application.user_id,
      application_id = accept_application.application_id,
      allocated_at = now()
  where id = accept_application.seat_id
    and user_id is null
    and delegation_id is null
    and is_available;

  get diagnostics rows_changed = row_count;

  if rows_changed = 0 then
    raise exception 'That seat is not free';
  end if;

  update public.applications
  set status = 'accepted',
      decided_at = now(),
      decided_by = me
  where id = accept_application.application_id
    and status in ('submitted', 'waitlisted');

  get diagnostics rows_changed = row_count;

  if rows_changed = 0 then
    raise exception 'Only a submitted or waitlisted application can be accepted';
  end if;

  -- The delegate's own invoice, at whichever individual fee is open right now.
  fee = public.applicable_fee(application.conference_id, 'individual');

  if fee.id is null then
    return;
  end if;

  select *
  into conference
  from public.conferences as conference_row
  where conference_row.id = application.conference_id;

  insert into public.invoices (
    conference_id, number, payer_user_id, seat_id, fee_id,
    description, quantity, unit_amount_cents, currency, due_at
  )
  values (
    application.conference_id,
    public.next_invoice_number(application.conference_id),
    application.user_id,
    accept_application.seat_id,
    fee.id,
    fee.name || ' · ' || conference.name,
    1,
    fee.amount_cents,
    conference.currency,
    public.invoice_due_at(application.conference_id)
  );
end;
$$;

revoke execute on function public.accept_application(uuid, uuid) from public, anon;
grant execute on function public.accept_application(uuid, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- allocate_delegation_seats(delegation_id, seat_ids)
-- -----------------------------------------------------------------------------

create or replace function public.allocate_delegation_seats(delegation_id uuid, seat_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  delegation public.delegations;
  unusable_seats integer;
  wanted_seats integer;
  seat_count integer;
  rows_changed integer;
  fee public.fees;
  conference public.conferences;
  payer uuid;
begin
  -- "for update" holds the delegation until this transaction ends, so two
  -- allocations to one delegation, or an allocation and a removal, take their
  -- turns rather than both reading the same seats and the same invoice.
  select *
  into delegation
  from public.delegations as delegation_row
  where delegation_row.id = allocate_delegation_seats.delegation_id
  for update;

  if delegation.id is null then
    raise exception 'That delegation does not exist';
  end if;

  if not public.has_permission(delegation.conference_id, 'decide_applications') then
    raise exception 'Only the organisers of this conference can allocate seats';
  end if;

  if delegation.status in ('rejected', 'withdrawn') then
    raise exception 'That delegation is no longer taking seats';
  end if;

  -- The seats are held next, in id order so that two lists naming the same
  -- seats in a different order can never wait on each other in a circle. A
  -- second request waits here and then counts the seats as the first one left
  -- them (finding L30). "perform" is PL/pgSQL for a query run for its effect,
  -- which here is the locks, with its rows thrown away.
  perform seat.id
  from public.seats as seat
  where seat.id = any (allocate_delegation_seats.seat_ids)
  order by seat.id
  for update;

  -- Every seat has to be free and in this conference. Counting the ones that
  -- are not, rather than looping, means the whole tick list is refused together
  -- and the organiser sees one message instead of a half-done allocation.
  select count(*)
  into unusable_seats
  from unnest(allocate_delegation_seats.seat_ids) as wanted_seat_id
  where not exists (
    select 1
    from public.seats as seat
    join public.committees as committee on committee.id = seat.committee_id
    where seat.id = wanted_seat_id
      and committee.conference_id = delegation.conference_id
      and seat.user_id is null
      and seat.delegation_id is null
      and seat.is_available
  );

  if unusable_seats > 0 then
    raise exception 'One of those seats is taken, hidden, or not part of this conference';
  end if;

  -- The update asks the same questions again and reserves only the seats that
  -- still pass, so a seat that changed hands between the count above and this
  -- line is left alone rather than written over.
  update public.seats as seat
  set delegation_id = allocate_delegation_seats.delegation_id,
      allocated_at = now()
  from public.committees as committee
  where committee.id = seat.committee_id
    and seat.id = any (allocate_delegation_seats.seat_ids)
    and committee.conference_id = delegation.conference_id
    and seat.user_id is null
    and seat.delegation_id is null
    and seat.is_available;

  -- How many seats that statement really reserved, which is not the same as how
  -- long the tick list was. "= any (array)" is a set, so a list that arrived
  -- with the same seat twice reserves one seat; counting the array instead
  -- would bill the school for two of them, tell them so through
  -- notify_invoice_created, and double MUNMeet's own application_fee_amount.
  --
  -- row_count is the last statement's, so it is read here and not further down:
  -- the statements below would overwrite it.
  get diagnostics seat_count = row_count;

  -- Compared with the distinct seats asked for, which agrees with the row count
  -- when every seat was still free and in this conference at the moment it was
  -- written, duplicates and all. When they differ, a seat was taken, hidden or
  -- moved between the count and the write, and the whole list is refused
  -- together, as above; the transaction ends and nothing stays reserved.
  select count(distinct wanted_seat_id)
  into wanted_seats
  from unnest(allocate_delegation_seats.seat_ids) as wanted_seat_id;

  if seat_count <> wanted_seats then
    raise exception 'One of those seats is taken, hidden, or not part of this conference';
  end if;

  if delegation.status = 'submitted' then
    update public.delegations
    set status = 'accepted',
        decided_at = now(),
        decided_by = me
    where id = allocate_delegation_seats.delegation_id
      and status = 'submitted';

    get diagnostics rows_changed = row_count;

    if rows_changed = 0 then
      raise exception 'That delegation has already been decided';
    end if;
  end if;

  -- The group invoice: one line, as many seats as this allocation reserved. An
  -- empty tick list reserves nothing and is charged for nothing.
  if seat_count = 0 then
    return;
  end if;

  fee = public.applicable_fee(delegation.conference_id, 'delegation_member');

  if fee.id is null then
    return;
  end if;

  select *
  into conference
  from public.conferences as conference_row
  where conference_row.id = delegation.conference_id;

  -- A delegation may have several heads and they can all do everything, but one
  -- invoice needs one payer, and every one of them reads it anyway: the
  -- invoices select policy gives a head the whole delegation's invoices. The
  -- head who registered the school is the one who joined first.
  select head.user_id
  into payer
  from public.delegation_members as head
  where head.delegation_id = allocate_delegation_seats.delegation_id
    and head.role = 'head'
  order by head.joined_at
  limit 1;

  insert into public.invoices (
    conference_id, number, payer_user_id, delegation_id, fee_id,
    description, quantity, unit_amount_cents, currency, due_at
  )
  values (
    delegation.conference_id,
    public.next_invoice_number(delegation.conference_id),
    payer,
    allocate_delegation_seats.delegation_id,
    fee.id,
    seat_count || ' × ' || fee.name || ' · ' || conference.name,
    seat_count,
    fee.amount_cents,
    conference.currency,
    public.invoice_due_at(delegation.conference_id)
  );
end;
$$;

revoke execute on function public.allocate_delegation_seats(uuid, uuid[]) from public, anon;
grant execute on function public.allocate_delegation_seats(uuid, uuid[]) to authenticated;


-- -----------------------------------------------------------------------------
-- move_delegate(from_seat_id, to_seat_id)
-- -----------------------------------------------------------------------------

create or replace function public.move_delegate(from_seat_id uuid, to_seat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  from_seat public.seats;
  to_seat public.seats;
  from_conference uuid;
  to_conference uuid;
  rows_changed integer;
begin
  -- Both seats are held before either is read, in id order whichever way the
  -- move goes, so two moves touching the same seats wait for each other
  -- instead of both writing, and never wait on each other in a circle. The
  -- second of two moves into one free seat waits here and then reads the seat
  -- as taken (finding L35). "perform" runs the query for its locks alone.
  perform seat_row.id
  from public.seats as seat_row
  where seat_row.id in (move_delegate.from_seat_id, move_delegate.to_seat_id)
  order by seat_row.id
  for update;

  -- The seat and its conference are read one after the other, because PL/pgSQL
  -- refuses to fill a whole-row variable and a plain one from the same "into"
  -- list.
  select *
  into from_seat
  from public.seats as seat_row
  where seat_row.id = move_delegate.from_seat_id;

  select committee.conference_id
  into from_conference
  from public.committees as committee
  where committee.id = from_seat.committee_id;

  if from_seat.id is null then
    raise exception 'That seat does not exist';
  end if;

  if not public.has_permission(from_conference, 'decide_applications') then
    raise exception 'Only the organisers of this conference can move a delegate';
  end if;

  if from_seat.user_id is null then
    raise exception 'Nobody is sitting in that seat';
  end if;

  select *
  into to_seat
  from public.seats as seat_row
  where seat_row.id = move_delegate.to_seat_id;

  select committee.conference_id
  into to_conference
  from public.committees as committee
  where committee.id = to_seat.committee_id;

  if to_seat.id is null or to_conference is distinct from from_conference then
    raise exception 'That seat is not part of this conference';
  end if;

  if to_seat.user_id is not null or not to_seat.is_available then
    raise exception 'That seat is not free';
  end if;

  -- A seat reserved for a delegation may only take a member of it, which
  -- check_seat_allocation decides. Asking here as well would be the same rule
  -- written twice.

  -- allocated_at is "when user_id or delegation_id was last set", so a seat
  -- that keeps its reservation keeps the moment it was reserved. Only a seat
  -- going back to being free forgets it.
  -- The paper belongs to the delegate and not to the seat, so it follows them
  -- the way the invoice below does. It is moved first, before the seat it
  -- points at is emptied, because seats_clear_position_paper further down
  -- removes the paper of a seat that changes hands and would otherwise get
  -- there first. The file in the bucket is not touched and does not need to
  -- be: its path carries the seat id it was uploaded for, which is only ever
  -- read to work out who may write there, and the row is what every page reads.
  update public.documents as document
  set seat_id = move_delegate.to_seat_id,
      committee_id = to_seat.committee_id
  where document.seat_id = move_delegate.from_seat_id
    and document.kind = 'position_paper';

  -- Each update repeats the occupancy it was decided on, and the row count
  -- says whether that was still so when it was written; see accept_application.
  update public.seats
  set user_id = null,
      application_id = null,
      allocated_at = case when delegation_id is null then null else allocated_at end
  where id = move_delegate.from_seat_id
    and user_id = from_seat.user_id;

  get diagnostics rows_changed = row_count;

  if rows_changed = 0 then
    raise exception 'Nobody is sitting in that seat';
  end if;

  update public.seats
  set user_id = from_seat.user_id,
      application_id = from_seat.application_id,
      allocated_at = now()
  where id = move_delegate.to_seat_id
    and user_id is null
    and is_available;

  get diagnostics rows_changed = row_count;

  if rows_changed = 0 then
    raise exception 'That seat is not free';
  end if;

  -- The delegate's bill follows them, so that whatever happens to the new seat
  -- happens to the invoice written for the old one. The table is aliased
  -- because the column and the parameters are so nearly the same word; the
  -- column being set is never qualified, which is Postgres's rule for an
  -- update.
  update public.invoices as invoice
  set seat_id = move_delegate.to_seat_id
  where invoice.seat_id = move_delegate.from_seat_id
    and invoice.status = 'unpaid';
end;
$$;

revoke execute on function public.move_delegate(uuid, uuid) from public, anon;
grant execute on function public.move_delegate(uuid, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- swap_delegates(first_seat_id, second_seat_id)
-- -----------------------------------------------------------------------------

create or replace function public.swap_delegates(first_seat_id uuid, second_seat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_seat public.seats;
  second_seat public.seats;
  first_conference uuid;
  second_conference uuid;
  rows_changed integer;
begin
  -- Both seats are held before either is read, in id order, for the reason
  -- move_delegate gives (finding L35).
  perform seat_row.id
  from public.seats as seat_row
  where seat_row.id in (swap_delegates.first_seat_id, swap_delegates.second_seat_id)
  order by seat_row.id
  for update;

  -- The seat and its conference are read one after the other, for the reason
  -- move_delegate gives: PL/pgSQL will not fill a whole-row variable and a
  -- plain one from the same "into" list.
  select *
  into first_seat
  from public.seats as seat_row
  where seat_row.id = swap_delegates.first_seat_id;

  select committee.conference_id
  into first_conference
  from public.committees as committee
  where committee.id = first_seat.committee_id;

  if first_seat.id is null then
    raise exception 'That seat does not exist';
  end if;

  if not public.has_permission(first_conference, 'decide_applications') then
    raise exception 'Only the organisers of this conference can move a delegate';
  end if;

  select *
  into second_seat
  from public.seats as seat_row
  where seat_row.id = swap_delegates.second_seat_id;

  select committee.conference_id
  into second_conference
  from public.committees as committee
  where committee.id = second_seat.committee_id;

  if second_seat.id is null or second_conference is distinct from first_conference then
    raise exception 'That seat is not part of this conference';
  end if;

  if first_seat.id = second_seat.id then
    raise exception 'A delegate cannot swap with themselves';
  end if;

  if first_seat.user_id is null or second_seat.user_id is null then
    raise exception 'Nobody is sitting in that seat';
  end if;

  if first_seat.delegation_id is distinct from second_seat.delegation_id then
    raise exception 'Only delegates holding their seats the same way can swap';
  end if;

  -- The third argument, true, makes the flag last only until this transaction
  -- ends, so it can never leak into another request.
  perform set_config('munmeet.swapping_delegates', 'on', true);

  -- The two papers share a seat for the moment between their two rows being
  -- written, so the one-paper rule is asked once, when the transaction ends.
  set constraints public.documents_one_paper_per_seat deferred;

  -- Each paper follows its delegate, as in move_delegate. One statement moves
  -- both sets, so no paper is ever pointed at the seat it is leaving.
  update public.documents as document
  set seat_id = case
        when document.seat_id = first_seat.id then second_seat.id
        else first_seat.id
      end,
      committee_id = case
        when document.seat_id = first_seat.id then second_seat.committee_id
        else first_seat.committee_id
      end
  where document.seat_id in (first_seat.id, second_seat.id)
    and document.kind = 'position_paper';

  -- Three steps rather than one, because check_seat_allocation refuses a
  -- person in two seats of one conference at any moment, and the first seat
  -- has to be emptied before its delegate can be written into the second.
  -- Each step repeats the occupancy it was decided on, and the row count says
  -- whether that was still so when it was written; see accept_application.
  update public.seats
  set user_id = null,
      application_id = null
  where id = first_seat.id
    and user_id = first_seat.user_id;

  get diagnostics rows_changed = row_count;

  if rows_changed = 0 then
    raise exception 'Nobody is sitting in that seat';
  end if;

  update public.seats
  set user_id = first_seat.user_id,
      application_id = first_seat.application_id,
      allocated_at = now()
  where id = second_seat.id
    and user_id = second_seat.user_id;

  get diagnostics rows_changed = row_count;

  if rows_changed = 0 then
    raise exception 'Nobody is sitting in that seat';
  end if;

  update public.seats
  set user_id = second_seat.user_id,
      application_id = second_seat.application_id,
      allocated_at = now()
  where id = first_seat.id
    and user_id is null;

  get diagnostics rows_changed = row_count;

  if rows_changed = 0 then
    raise exception 'That seat is not free';
  end if;

  -- Each unpaid bill follows its delegate too, in one statement for the same
  -- reason as the papers. A paid invoice stays with the seat it paid for, as it
  -- does when move_delegate moves somebody.
  update public.invoices as invoice
  set seat_id = case
        when invoice.seat_id = first_seat.id then second_seat.id
        else first_seat.id
      end
  where invoice.seat_id in (first_seat.id, second_seat.id)
    and invoice.status = 'unpaid';

  perform set_config('munmeet.swapping_delegates', 'off', true);
end;
$$;

revoke execute on function public.swap_delegates(uuid, uuid) from public, anon;
grant execute on function public.swap_delegates(uuid, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- remove_delegation_seat(seat_id)
-- -----------------------------------------------------------------------------

create or replace function public.remove_delegation_seat(seat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  seat public.seats;
  seat_conference uuid;
  group_invoice public.invoices;
  rows_changed integer;
begin
  -- The seat is held until this transaction ends, so two removals of the same
  -- seat are refused one after the other rather than both run. Two statements,
  -- because PL/pgSQL refuses to fill a whole-row variable and a plain one from
  -- the same "into" list.
  select *
  into seat
  from public.seats as seat_row
  where seat_row.id = remove_delegation_seat.seat_id
  for update;

  select committee.conference_id
  into seat_conference
  from public.committees as committee
  where committee.id = seat.committee_id;

  if seat.id is null then
    raise exception 'That seat does not exist';
  end if;

  if not public.has_permission(seat_conference, 'decide_applications') then
    raise exception 'Only the organisers of this conference can free a seat';
  end if;

  if seat.delegation_id is null then
    raise exception 'That seat is not reserved for a delegation';
  end if;

  if seat.user_id is not null then
    raise exception 'Somebody is sitting in that seat. Revoke it instead.';
  end if;

  -- The delegation is held too, before its invoice is touched. Two removals
  -- of two different seats of one delegation, arriving together, would both
  -- read the same newest unpaid invoice, both void it, and both write a
  -- replacement one seat short (finding L31). The second now waits here, and
  -- then finds the replacement the first one wrote, which is the invoice it
  -- should be shortening. allocate_delegation_seats holds the same lock.
  perform delegation.id
  from public.delegations as delegation
  where delegation.id = seat.delegation_id
  for update;

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

-- End of migration. Never edit this file once applied; write a new one.
