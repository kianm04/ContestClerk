-- =============================================================================
-- Applications, delegations and allocation (docs/roles-and-permissions.md, step 5)
-- =============================================================================
--
-- WHAT THIS IS
-- Until now every policy and function of the applications area asked
-- `can_manage_conference`, which since step 1 means "is an administrator".
-- This moves the area to its two permissions:
--
--   * read_applications: read the applications, delegations and their members,
--     every answer and the internal notes.
--   * decide_applications: accept, reject and waitlist, write the internal
--     notes, decide delegations, allocate, revoke, move and swap seats, and
--     hide or offer a seat on the allocation grid.
--
-- The role editor saves decide_applications together with read_applications
-- (`withIncludedPermissions` in $lib/permissions.ts), so a policy that reads
-- asks for the weaker permission only.
--
-- The application form's questions belong to `edit_conference` (section 4 of
-- the spec), so their three write policies move to it here, with the rest of
-- the area's tables.
--
-- Seats. Every allocation write goes through a security definer function
-- below, so a person who decides applications needs no update policy on
-- `seats` itself, which would also let them rename a seat. The one write the
-- allocation page made directly, hiding a seat or offering it again, becomes
-- the function set_seat_availability. The seat list's own policies (add,
-- change, delete) stay with administrators until `manage_committees` lands in
-- step 8.
--
-- notify_delegation_seats, which the spec lists with this area, asks no
-- permission: it is a trigger that tells a delegation's head about new seats,
-- whoever reserved them. It is unchanged.
--
-- This file is never edited once applied: a change is a new migration.


-- -----------------------------------------------------------------------------
-- applications
-- -----------------------------------------------------------------------------
-- The set form of the check, one lookup per query rather than one per row, the
-- lesson of migration 20260923150000_rls_conference_lookups.sql. The column
-- rules of a decision are guard_application_update's, which asks no permission.

drop policy "Organisers can read the applications to their conference" on public.applications;
drop policy "Organisers can decide an application" on public.applications;

create policy "Application readers can read the applications to their conference"
  on public.applications
  for select
  to authenticated
  using (conference_id in (select public.permitted_conference_ids('read_applications')));

create policy "Application deciders can decide an application"
  on public.applications
  for update
  to authenticated
  using (conference_id in (select public.permitted_conference_ids('decide_applications')))
  with check (conference_id in (select public.permitted_conference_ids('decide_applications')));


-- -----------------------------------------------------------------------------
-- delegations and delegation_members
-- -----------------------------------------------------------------------------

drop policy "Organisers can read the delegations of their conference" on public.delegations;
drop policy "Organisers can decide a delegation" on public.delegations;
drop policy "Organisers can read the members of a delegation at their confer"
  on public.delegation_members;

create policy "Application readers can read the delegations of their conference"
  on public.delegations
  for select
  to authenticated
  using (conference_id in (select public.permitted_conference_ids('read_applications')));

create policy "Application deciders can decide a delegation"
  on public.delegations
  for update
  to authenticated
  using (conference_id in (select public.permitted_conference_ids('decide_applications')))
  with check (conference_id in (select public.permitted_conference_ids('decide_applications')));

create policy "Application readers can read the members of a delegation"
  on public.delegation_members
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.delegations as delegation
      where delegation.id = delegation_members.delegation_id
        and delegation.conference_id in (
          select public.permitted_conference_ids('read_applications')
        )
    )
  );


-- -----------------------------------------------------------------------------
-- application_questions
-- -----------------------------------------------------------------------------
-- Reading them stays as it was: anybody for a published conference, and the
-- whole team for any conference.

drop policy "Organisers can add a question" on public.application_questions;
drop policy "Organisers can change a question" on public.application_questions;
drop policy "Organisers can delete a question" on public.application_questions;

create policy "Conference editors can add a question"
  on public.application_questions
  for insert
  to authenticated
  with check (public.has_permission(conference_id, 'edit_conference'));

create policy "Conference editors can change a question"
  on public.application_questions
  for update
  to authenticated
  using (public.has_permission(conference_id, 'edit_conference'))
  with check (public.has_permission(conference_id, 'edit_conference'));

create policy "Conference editors can delete a question"
  on public.application_questions
  for delete
  to authenticated
  using (public.has_permission(conference_id, 'edit_conference'));


-- -----------------------------------------------------------------------------
-- set_seat_availability: hide a seat from allocation, or offer it again
-- -----------------------------------------------------------------------------
-- For whoever decides applications, from the allocation grid, and for whoever
-- edits the seat list, from a committee's page. Refusing to hide a seat
-- somebody holds is the page's rule (`FREE_BEFORE_HIDING_REFUSAL`), which
-- needs the seat's whole state to explain itself, so it stays there.

create or replace function public.set_seat_availability(seat_id uuid, is_available boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  seat_conference uuid;
begin
  select committee.conference_id
  into seat_conference
  from public.seats as seat
  join public.committees as committee on committee.id = seat.committee_id
  where seat.id = set_seat_availability.seat_id;

  if seat_conference is null then
    raise exception 'That seat does not exist';
  end if;

  -- can_manage_conference is the seat list's own question until step 8 gives
  -- it to manage_committees.
  if not public.has_permission(seat_conference, 'decide_applications')
    and not public.can_manage_conference(seat_conference)
  then
    raise exception 'Only the organisers of this conference can hide or offer a seat';
  end if;

  update public.seats
  set is_available = set_seat_availability.is_available
  where id = set_seat_availability.seat_id;
end;
$$;

revoke execute on function public.set_seat_availability(uuid, boolean) from public, anon;
grant execute on function public.set_seat_availability(uuid, boolean) to authenticated;


-- -----------------------------------------------------------------------------
-- next_invoice_number: accepting raises an invoice
-- -----------------------------------------------------------------------------
-- accept_application, allocate_delegation_seats and remove_delegation_seat
-- each write an invoice, and number it here. Somebody who decides
-- applications has to get past this check, though they need not be able to
-- read invoices. can_manage_conference is the money area's question until
-- step 6 gives it to manage_invoices.

create or replace function public.next_invoice_number(conference_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  conference_slug text;
  highest_so_far integer;
begin
  if not public.can_manage_conference(next_invoice_number.conference_id)
    and not public.has_permission(next_invoice_number.conference_id, 'decide_applications')
  then
    raise exception 'Only the organisers of this conference can number an invoice';
  end if;

  select conference.slug
  into conference_slug
  from public.conferences as conference
  where conference.id = next_invoice_number.conference_id;

  if conference_slug is null then
    raise exception 'That conference does not exist';
  end if;

  perform pg_advisory_xact_lock(hashtext('invoice_number:' || next_invoice_number.conference_id::text));

  -- The digits after the last dash, read back as a number. The slug itself can
  -- hold dashes, which is why this looks at the end of the string and not at
  -- the first one.
  select coalesce(max(substring(invoice.number from '[0-9]+$')::integer), 0)
  into highest_so_far
  from public.invoices as invoice
  where invoice.conference_id = next_invoice_number.conference_id;

  return conference_slug || '-' || to_char(highest_so_far + 1, 'FM0000');
end;
$$;


-- =============================================================================
-- The allocation functions, now asking decide_applications
-- =============================================================================
-- Each body is the one it had, with `can_manage_conference(…)` replaced by
-- `has_permission(…, 'decide_applications')`. The refusals keep their words,
-- which the pages match on.


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
begin
  select *
  into application
  from public.applications as application_row
  where application_row.id = accept_application.application_id;

  if application.id is null then
    raise exception 'That application does not exist';
  end if;

  if not public.has_permission(application.conference_id, 'decide_applications') then
    raise exception 'Only the organisers of this conference can accept an application';
  end if;

  if application.status not in ('submitted', 'waitlisted') then
    raise exception 'Only a submitted or waitlisted application can be accepted';
  end if;

  -- The seat and the conference it is in are read one after the other, because
  -- PL/pgSQL refuses to fill a whole-row variable and a plain one from the same
  -- "into" list.
  select *
  into seat
  from public.seats as seat_row
  where seat_row.id = accept_application.seat_id;

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

  update public.seats
  set user_id = application.user_id,
      application_id = accept_application.application_id,
      allocated_at = now()
  where id = accept_application.seat_id;

  update public.applications
  set status = 'accepted',
      decided_at = now(),
      decided_by = me
  where id = accept_application.application_id;

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
  seat_count integer;
  fee public.fees;
  conference public.conferences;
  payer uuid;
begin
  select *
  into delegation
  from public.delegations as delegation_row
  where delegation_row.id = allocate_delegation_seats.delegation_id;

  if delegation.id is null then
    raise exception 'That delegation does not exist';
  end if;

  if not public.has_permission(delegation.conference_id, 'decide_applications') then
    raise exception 'Only the organisers of this conference can allocate seats';
  end if;

  if delegation.status in ('rejected', 'withdrawn') then
    raise exception 'That delegation is no longer taking seats';
  end if;

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

  update public.seats
  set delegation_id = allocate_delegation_seats.delegation_id,
      allocated_at = now()
  where id = any (allocate_delegation_seats.seat_ids);

  -- How many seats that statement really reserved, which is not the same as how
  -- long the tick list was. "= any (array)" is a set, so a list that arrived
  -- with the same seat twice reserves one seat; counting the array instead
  -- would bill the school for two of them, tell them so through
  -- notify_invoice_created, and double MUNMeet's own application_fee_amount.
  -- The check above cannot catch it, because it asks each element whether a
  -- free seat with that id exists, and a duplicate answers yes twice.
  --
  -- row_count is the last statement's, so it is read here and not further down:
  -- the update on delegations below would overwrite it.
  get diagnostics seat_count = row_count;

  if delegation.status = 'submitted' then
    update public.delegations
    set status = 'accepted',
        decided_at = now(),
        decided_by = me
    where id = allocate_delegation_seats.delegation_id;
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
  -- invoices select policy below gives a head the whole delegation's invoices.
  -- The head who registered the school is the one who joined first.
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
begin
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

  -- allocated_at is "when user_id or delegation_id was last set"
  -- (specs/02-architecture/data-model.md), so a seat that keeps its reservation
  -- keeps the moment it was reserved. Only a seat going back to being free
  -- forgets it.
  -- The paper belongs to the delegate and not to the seat
  -- (specs/06-features/documents.md), so it follows them the way the invoice
  -- below does. It is moved first, before the seat it points at is emptied,
  -- because seats_clear_position_paper further down removes the paper of a
  -- seat that changes hands and would otherwise get there first. The file in
  -- the bucket is not touched and does not need to be: its path carries the
  -- seat id it was uploaded for, which is only ever read to work out who may
  -- write there, and the row is what every page reads.
  update public.documents as document
  set seat_id = move_delegate.to_seat_id,
      committee_id = to_seat.committee_id
  where document.seat_id = move_delegate.from_seat_id
    and document.kind = 'position_paper';

  update public.seats
  set user_id = null,
      application_id = null,
      allocated_at = case when delegation_id is null then null else allocated_at end
  where id = move_delegate.from_seat_id;

  update public.seats
  set user_id = from_seat.user_id,
      application_id = from_seat.application_id,
      allocated_at = now()
  where id = move_delegate.to_seat_id;

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
begin
  -- Two statements, because PL/pgSQL refuses to fill a whole-row variable and a
  -- plain one from the same "into" list.
  select *
  into seat
  from public.seats as seat_row
  where seat_row.id = remove_delegation_seat.seat_id;

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

  update public.seats
  set delegation_id = null,
      allocated_at = null
  where id = remove_delegation_seat.seat_id;

  -- The newest unpaid group invoice of this delegation. The number breaks a tie
  -- on created_at, because two invoices written in the same transaction share
  -- that moment to the microsecond and "newest" would otherwise be whichever
  -- one Postgres happened to read first: next_invoice_number hands the numbers
  -- out in order, so the higher one is the later invoice.
  select *
  into group_invoice
  from public.invoices as invoice
  where invoice.delegation_id = seat.delegation_id
    and invoice.status = 'unpaid'
  order by invoice.created_at desc, invoice.number desc
  limit 1;

  if group_invoice.id is null then
    return;
  end if;

  update public.invoices
  set status = 'void'
  where id = group_invoice.id;

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

create or replace function public.revoke_seat(seat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  seat public.seats;
  seat_conference uuid;
begin
  -- Two statements, because PL/pgSQL refuses to fill a whole-row variable and a
  -- plain one from the same "into" list.
  select *
  into seat
  from public.seats as seat_row
  where seat_row.id = revoke_seat.seat_id;

  select committee.conference_id
  into seat_conference
  from public.committees as committee
  where committee.id = seat.committee_id;

  if seat.id is null then
    raise exception 'That seat does not exist';
  end if;

  if not public.has_permission(seat_conference, 'decide_applications') then
    raise exception 'Only the organisers of this conference can revoke a seat';
  end if;

  if seat.user_id is null then
    raise exception 'Nobody is sitting in that seat';
  end if;

  -- The individual application that won this seat is rejected with it, so the
  -- applicant's own page stops saying they are coming.
  if seat.application_id is not null then
    update public.applications
    set status = 'rejected',
        decided_at = now(),
        decided_by = me
    where id = seat.application_id;
  end if;

  -- The delegation keeps its reservation, and with it the moment that
  -- reservation was made; see move_delegate above for why.
  update public.seats
  set user_id = null,
      application_id = null,
      allocated_at = case when delegation_id is null then null else allocated_at end
  where id = revoke_seat.seat_id;

  -- A paid invoice is left exactly as it is. The money has arrived, and giving
  -- it back is a refund somebody has to decide on, which the organiser's fees
  -- page asks them to do.
  -- The table is aliased because this function's parameter is also called
  -- seat_id: an unqualified seat_id in the "where" would match both the column
  -- and the parameter, and PL/pgSQL refuses a name it cannot decide. The
  -- statement above gets away with it only because "id" is not a parameter.
  update public.invoices as invoice
  set status = 'void'
  where invoice.seat_id = revoke_seat.seat_id
    and invoice.status = 'unpaid';

  -- The paper goes with the seat. Whoever sits here next writes their own, and
  -- the delegate who has just lost the seat may upload again once they hold
  -- another one. The file itself is removed by the app, which is the only thing
  -- in MUNMeet that may talk to storage; a row deleted here with its object
  -- left behind is a few kilobytes nobody can reach, which is a smaller problem
  -- than a database function reaching out of the database.
  delete from public.documents as document
  where document.seat_id = revoke_seat.seat_id
    and document.kind = 'position_paper';
end;
$$;

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
begin
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
  update public.seats
  set user_id = null,
      application_id = null
  where id = first_seat.id;

  update public.seats
  set user_id = first_seat.user_id,
      application_id = first_seat.application_id,
      allocated_at = now()
  where id = second_seat.id;

  update public.seats
  set user_id = second_seat.user_id,
      application_id = second_seat.application_id,
      allocated_at = now()
  where id = first_seat.id;

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


-- -----------------------------------------------------------------------------
-- check_seat_allocation: the delegation head's branch
-- -----------------------------------------------------------------------------
-- The branch that holds a delegation head to seating their own members now
-- passes over whoever decides applications, rather than whoever administers
-- the conference, so that a decider who also heads a delegation can still
-- allocate its seats.

create or replace function public.check_seat_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  the_conference uuid;
  conference_start date;
  conference_today date;
begin
  -- conference_today is the date on a wall clock at the conference, not on the
  -- database server's. See the top of this file.
  select
    committee.conference_id,
    conference.start_date,
    (now() at time zone conference.timezone)::date
  into the_conference, conference_start, conference_today
  from public.committees as committee
  join public.conferences as conference on conference.id = committee.conference_id
  where committee.id = new.committee_id;

  -- Rule 2. An application from another conference on this seat would put a
  -- stranger's answers on an organiser's allocation screen.
  if new.application_id is not null then
    if not exists (
      select 1
      from public.applications as application
      where application.id = new.application_id
        and application.conference_id = the_conference
    ) then
      raise exception 'That application is not for this conference';
    end if;
  end if;

  -- The delegation a seat is reserved for has to be one of this conference too,
  -- for the same reason.
  if new.delegation_id is not null then
    if not exists (
      select 1
      from public.delegations as delegation
      where delegation.id = new.delegation_id
        and delegation.conference_id = the_conference
    ) then
      raise exception 'That delegation is not for this conference';
    end if;
  end if;

  -- The delegation head's narrow write.
  --
  -- This function has to be security definer to see every seat of the
  -- conference, and inside one of those current_user is the owner rather than
  -- the caller, so it cannot ask who is writing the way the two guard triggers
  -- above do. It asks about rights instead, which is the better question
  -- anyway: somebody who is a head of this seat's delegation and may not
  -- decide applications is a head and nobody else. auth.uid() still reads the
  -- caller's own id inside a security definer function, so the team member
  -- calling allocate_delegation_seats holds decide_applications and skips
  -- this whole branch, and so does the service role, for whom both are false.
  if tg_op = 'UPDATE'
    and new.delegation_id is not null
    and not public.has_permission(the_conference, 'decide_applications')
    and public.is_delegation_head(new.delegation_id)
  then
    -- "Everything but user_id has to be identical", rather than a list of the
    -- columns a head may not write. A forbidden list is a list that rots: this
    -- one was written without allocated_at and created_at on it, and a head
    -- could quietly backdate both. to_jsonb turns a row into a JSON object and
    -- "- the list" drops those keys, so this reads: take away the one column a
    -- head may write, and what is left has to be exactly what it was.
    --
    -- updated_at goes with it because seats_set_updated_at overwrites it a
    -- moment later whatever anybody sent.
    if to_jsonb(new) - array['user_id', 'updated_at'] is distinct from
       to_jsonb(old) - array['user_id', 'updated_at']
    then
      raise exception 'A delegation head can only seat and unseat their own members';
    end if;

    -- From the first day of the conference the organisers move people, because
    -- a change on the morning of a session has to be one somebody in the
    -- building decided. 06-features/allocation.md. The first day begins at
    -- midnight in the conference's timezone, which is what conference_today is.
    if conference_start <= conference_today then
      raise exception 'The conference has started. Ask the organisers to change a seat.';
    end if;

    -- The head may not write allocated_at, so the trigger writes it for them.
    -- data-model.md calls the column "when user_id or delegation_id was last
    -- set", and the head has just set user_id. Unseating leaves it alone: the
    -- delegation_id is still set, so the moment the seat was reserved stands.
    if new.user_id is not null and new.user_id is distinct from old.user_id then
      new.allocated_at = now();
    end if;
  end if;

  if new.user_id is null then
    return new;
  end if;

  -- Rule 3. A reserved seat is the delegation's to fill, and only with somebody
  -- who is in it.
  if new.delegation_id is not null then
    if not exists (
      select 1
      from public.delegation_members as membership
      where membership.delegation_id = new.delegation_id
        and membership.user_id = new.user_id
    ) then
      raise exception 'That person is not a member of the delegation this seat is reserved for';
    end if;
  end if;

  -- Rule 1. Two seats would mean two schedules, two position papers and two
  -- invoices for one person.
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

-- End of migration. Never edit this file once applied; write a new one.
