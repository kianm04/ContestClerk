-- =============================================================================
-- swap_delegates: two delegates trade seats in one step (T131)
-- =============================================================================
-- The allocation grid lets an organiser drag a delegate onto another filled
-- seat, and the two people trade places. move_delegate cannot do it: it only
-- moves into a free seat, and there is no free seat in the middle of a swap to
-- park one of them in. So this function does the whole trade in one
-- transaction, carrying what move_delegate carries: the application, the
-- unpaid invoice and the position paper each follow their person.
--
-- specs/06-features/allocation.md has the rule in words, and
-- specs/05-pages/organiser/allocation.md the page that calls it.


-- -----------------------------------------------------------------------------
-- One paper per seat, checked at the end of a swap rather than halfway
-- -----------------------------------------------------------------------------
-- A seat still has at most one position paper, but two papers trading seats
-- in one statement break that rule for a moment, and a unique index checks
-- every row the moment it is written. An index cannot wait; a constraint
-- marked "deferrable" can be told to wait until the end of the transaction,
-- and a partial rule ("where kind = 'position_paper'") has to be an exclusion
-- constraint to be a constraint at all. "exclude using btree (seat_id with =)"
-- says exactly what the unique index said: no two position papers share a
-- seat. It keeps the index's name, so an error still names the same rule.
-- "initially immediate" keeps it checking every row at once, as before, for
-- every writer except swap_delegates, which defers it for its own transaction.

drop index public.documents_one_paper_per_seat;

alter table public.documents
  add constraint documents_one_paper_per_seat
  exclude using btree (seat_id with =)
  where (kind = 'position_paper')
  deferrable initially immediate;


-- -----------------------------------------------------------------------------
-- The position paper trigger learns to stand aside during a swap
-- -----------------------------------------------------------------------------
-- seats_clear_position_paper deletes the paper of a seat whose delegate
-- changes. In a swap both seats change hands, and the papers have to point at
-- one seat or the other at every moment, so whichever way round the steps are
-- taken the trigger would delete a paper that is only changing seats with its
-- delegate. swap_delegates therefore sets a flag that lasts until the end of its
-- own transaction, and while it is on the trigger leaves the papers alone:
-- swap_delegates moves them itself.
--
-- Nobody outside the database can set the flag. set_config lives in
-- pg_catalog, which PostgREST does not expose, so only a function like the one
-- below can turn it on. Everything but the first "if" is unchanged from
-- migration 20260921120000_documents_schedule_announcements.sql.

create or replace function public.clear_position_paper_on_seat_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- "true" as the second argument answers null, rather than raising, when the
  -- flag was never set, which is every update except a swap.
  if current_setting('munmeet.swapping_delegates', true) = 'on' then
    return new;
  end if;

  if old.user_id is null or new.user_id is not distinct from old.user_id then
    return new;
  end if;

  delete from public.documents as document
  where document.seat_id = old.id
    and document.kind = 'position_paper';

  return new;
end;
$$;

revoke execute on function public.clear_position_paper_on_seat_change()
  from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- swap_delegates(first_seat_id, second_seat_id)
-- -----------------------------------------------------------------------------
-- Both seats have to have somebody in them and belong to the same conference.
-- They also have to be held the same way: both taken through an application of
-- their own, or both reserved for the same delegation. seats.delegation_id
-- stays with the seat, exactly as in move_delegate, so trading a delegation's
-- member with anybody else would quietly move a seat out of the delegation.
-- canMoveInto in client/src/lib/allocation.ts is the same rule for a move.

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

  if not public.can_manage_conference(first_conference) then
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

revoke execute on function public.swap_delegates(uuid, uuid) from public, anon;
grant execute on function public.swap_delegates(uuid, uuid) to authenticated;
