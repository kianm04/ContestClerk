-- =============================================================================
-- Migration 0007: fees and invoices
-- =============================================================================
--
-- WHAT THIS IS
-- Task T17 in specs/07-delivery/tasks.md. Migration 0006 built the two roads
-- into a seat and left every one of them free of charge. This file is the
-- money: what a conference charges, what each person owes, and who is allowed
-- to change either of those.
--
-- Two tables and one sentence about each:
--
--   * fees  -- what the organiser charges, written once per conference. A
--     conference can have several, because an early bird price is the same fee
--     with a window on it, and a school pays a different rate from somebody
--     coming on their own.
--   * invoices -- what one person owes, written by the database the moment
--     somebody gets a seat. Nobody types an invoice; it is always the shadow of
--     an allocation, which is why migration 0006's allocation functions are
--     replaced here rather than the pages being asked to remember.
--
-- This file:
--
--   * adds fees and invoices with their policies, indexes and updated_at
--     triggers
--   * adds the money functions: platform_fee_per_delegate_cents, applicable_fee,
--     next_invoice_number, compute_invoice_amount
--   * adds the three guards on invoices: guard_invoice_insert (what a new one
--     may look like), check_invoice_transition (the status machine of
--     06-features/fees.md, for everybody) and protect_invoice_columns (which
--     columns, and which of their values, a browser may write)
--   * adds set_stripe_account and set_invoice_checkout_session, the only two
--     ways the app writes a Stripe column
--   * adds notify_invoice_created and notify_invoice_paid
--   * replaces accept_application, move_delegate, allocate_delegation_seats,
--     remove_delegation_seat and revoke_seat with the same body plus the
--     invoice each of them owes. Four of those five places are a "T17" comment
--     in migration 0006; move_delegate is the fifth, and the only one where the
--     invoice does not change but the seat it was written for does.
--
-- WHAT IS NOT HERE, ON PURPOSE
-- Anything that talks to Stripe. The account is created, the checkout session
-- is opened and the refund is made by the app in task T23 and the tasks after
-- it; the database only stores what came back. Position papers are still task
-- T34's, and both of the places that wait for it are now in this file rather
-- than in migration 0006: move_delegate and revoke_seat each carry the "T34"
-- comment saying what belongs there, because the live copy of each is here.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- fees
-- -----------------------------------------------------------------------------
-- What a conference charges. Which of them applies to a particular person at a
-- particular moment is the applicable_fee function further down: the lowest
-- position whose window is open. Nothing here enforces that the windows do not
-- overlap, because they are allowed to -- an organiser who leaves the early
-- bird price in the list with no end date has simply made it the price, and
-- position decides.
--
-- amount_cents may be zero. A conference that charges nothing has no fee rows
-- at all, and then nobody is invoiced; a zero row would mean "charge this
-- person nothing on purpose", which is a different thing and is allowed.

create table public.fees (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences (id) on delete cascade,
  -- What the payer reads on their invoice, for example "Early bird delegate fee".
  name text not null,
  -- Whole cents of the conference's currency, never a decimal. See the comment
  -- at the top of client/src/lib/money.ts for why money is never a float.
  amount_cents integer not null,
  applies_to public.fee_applies_to not null default 'individual',
  -- The early bird window. A null bound means no bound on that side, the same
  -- way the application window on conferences reads.
  valid_from timestamptz,
  valid_until timestamptz,
  -- Lowest first. It is the tie-breaker when two windows are open at once.
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fees_amount_not_negative check (amount_cents >= 0),
  constraint fees_valid_window check (
    valid_from is null or valid_until is null or valid_until >= valid_from
  )
);

-- applicable_fee asks for one conference's fees in position order, and the
-- organiser's fees page lists them the same way.
create index fees_conference_position_idx on public.fees (conference_id, position);

create trigger fees_set_updated_at
  before update on public.fees
  for each row
  execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- invoices
-- -----------------------------------------------------------------------------
-- What one person owes for one allocation. A delegate accepted on their own
-- gets a row with seat_id set and quantity 1; a school gets a row with
-- delegation_id set and quantity equal to the number of seats that arrived in
-- that one allocation, because the head pays for the group and not per child.
--
-- The amounts are stored rather than read back through fee_id, because a fee
-- may be renamed, repriced or deleted afterwards and an invoice is a record of
-- what was agreed. fee_id is kept anyway, as "which row this came from", and
-- goes null if that row is deleted.
--
-- conference_id restricts the delete rather than cascading: an organiser
-- deleting a conference that has invoices on it is not a tidy-up, it is a
-- question for a person.

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences (id) on delete restrict,
  -- "amsterdammun-2027-0001". Made by next_invoice_number below, which is the
  -- only thing that should ever write it.
  number text not null unique,
  -- The one person who owes this: the delegate, or the head of the delegation.
  --
  -- "on delete set null" and not cascade, so that deleting an account does not
  -- delete a paid invoice and its Stripe payment intent with it. Migration
  -- 0002 promises exactly this above delete_my_account -- "seats and invoices
  -- keep the row and forget the person" -- and it is what seats.user_id already
  -- does. The organiser's totals are money that really moved, and they must not
  -- change because somebody closed their account afterwards. guard_invoice_insert
  -- refuses a null on the way in, so the column is only ever empty for an
  -- account that has gone.
  payer_user_id uuid references auth.users (id) on delete set null,
  -- What the invoice is for. A group invoice carries the delegation; an
  -- individual one carries the seat; never both, which the
  -- invoices_one_subject check below enforces. An invoice an organiser raised
  -- by hand, for the late delegate agreed over email, carries neither.
  delegation_id uuid references public.delegations (id) on delete set null,
  seat_id uuid references public.seats (id) on delete set null,
  fee_id uuid references public.fees (id) on delete set null,
  -- "Delegate fee · Amsterdam Open MUN 2027", or "12 × School delegate fee · ...".
  description text not null,
  quantity integer not null default 1,
  unit_amount_cents integer not null,
  -- quantity x unit_amount_cents, kept by compute_invoice_amount below so that
  -- no caller can send a total that does not add up.
  amount_cents integer not null default 0,
  currency char(3) not null,
  -- MUNMeet's cut, charged to the organiser's Stripe account as the
  -- application_fee_amount. Also computed by compute_invoice_amount.
  platform_fee_cents integer not null default 0,
  status public.invoice_status not null default 'unpaid',
  due_at timestamptz,
  paid_at timestamptz,
  -- 'stripe' or 'manual'.
  paid_method text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_refund_id text,
  -- The organiser's own note, for example "paid by bank transfer 12 Jan".
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_quantity_positive check (quantity > 0),
  constraint invoices_unit_amount_not_negative check (unit_amount_cents >= 0),
  constraint invoices_paid_method_known check (paid_method is null or paid_method in ('stripe', 'manual')),
  -- One seat or one group, never both. revoke_seat voids "the invoice for this
  -- seat" and remove_delegation_seat reissues "the delegation's invoice", so a
  -- row that was both would be picked up by each of them and voided twice.
  constraint invoices_one_subject check (seat_id is null or delegation_id is null)
);

create index invoices_conference_status_idx on public.invoices (conference_id, status);
create index invoices_payer_user_id_idx on public.invoices (payer_user_id);
create index invoices_delegation_id_idx on public.invoices (delegation_id);
create index invoices_seat_id_idx on public.invoices (seat_id);
-- Not in the list in specs/02-architecture/data-model.md, but the Conventions
-- section there says every foreign key has an index, and the fees delete policy
-- below asks this exact question: does any invoice point at this fee?
create index invoices_fee_id_idx on public.invoices (fee_id);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row
  execute function public.set_updated_at();


-- =============================================================================
-- The money functions
-- =============================================================================

-- -----------------------------------------------------------------------------
-- platform_fee_per_delegate_cents()
-- -----------------------------------------------------------------------------
-- What MUNMeet keeps from each delegate seat that is paid for.
--
-- specs/02-architecture/payments.md puts this number in
-- client/src/lib/server/platform-fee.ts, and it is still there, because the
-- pricing page shows it and the Stripe call sends it. It is written a second
-- time here because invoices are created by the four allocation functions
-- below, which run inside the database and cannot read a TypeScript file. The
-- two copies have to be changed together; payments.md says so beside the first
-- one.
--
-- It is a function rather than a literal repeated in three places, so that
-- inside the database it is still written down exactly once.
--
-- It is the one function in this file with no "revoke" line under it, so it
-- keeps the execute right every new function is born with -- PUBLIC, and
-- through it anon and authenticated -- and it has to. compute_invoice_amount
-- calls it and is not "security definer", so it runs as whoever wrote the
-- invoice: revoking this grant makes an organiser raising an invoice fail with
-- "permission denied for function platform_fee_per_delegate_cents". Measured on
-- the local database with a plpgsql function standing in for the trigger. There
-- is nothing to protect either way -- the answer is a constant this file prints
-- six lines above.

create or replace function public.platform_fee_per_delegate_cents()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 200;
$$;


-- -----------------------------------------------------------------------------
-- applicable_fee(conference_id, applies_to)
-- -----------------------------------------------------------------------------
-- Which fee a person pays, right now: the lowest position of the matching kind
-- whose window contains this moment. 06-features/fees.md. When nothing matches
-- the answer is a row of nulls, and the caller creates no invoice at all --
-- which is also why there is never a zero-amount invoice.
--
-- Nobody a browser can be may call it, which is why it is neither
-- "security definer" nor granted to public, anon or authenticated. (service_role
-- keeps the execute right Supabase grants every function in this schema, which
-- is how a database test can ask it directly; nothing the app runs is ever that
-- role outside the Stripe webhook.) Its only callers are the four
-- allocation functions below, and those already run as the owner of the
-- function, so the fees are read with the owner's rights whatever this one
-- says. Granting it to signed-in users instead would hand anybody the prices of
-- a conference still in draft, which the fees select policy exists to keep from
-- them. The page that has to pick a fee will do it in TypeScript instead, with
-- `applicableFee` in client/src/lib/fees.ts, over the list it was allowed to
-- read; task T23 writes that file and its ledger row carries the reason.

create or replace function public.applicable_fee(
  conference_id uuid,
  applies_to public.fee_applies_to
)
returns public.fees
language sql
stable
set search_path = ''
as $$
  select fee.*
  from public.fees as fee
  where fee.conference_id = applicable_fee.conference_id
    and fee.applies_to = applicable_fee.applies_to
    and (fee.valid_from is null or fee.valid_from <= now())
    and (fee.valid_until is null or fee.valid_until >= now())
  order by fee.position, fee.created_at
  limit 1;
$$;

revoke execute on function public.applicable_fee(uuid, public.fee_applies_to)
  from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- next_invoice_number(conference_id)
-- -----------------------------------------------------------------------------
-- "amsterdammun-2027-0001", then 0002, and so on. Human readable, because the
-- number is what an organiser and a school quote at each other in an email
-- about a bank transfer.
--
-- Two accepted applications at the same instant would otherwise read the same
-- highest number and both try to write it, and one of them would fail on the
-- unique index. pg_advisory_xact_lock makes the second one wait until the
-- first has committed: it is a lock on a number rather than on a row, held to
-- the end of the transaction, and hashtext turns this conference's id into that
-- number. Conferences therefore never wait for each other.
--
-- It is "security definer" because it counts invoices the caller may not be
-- able to read one by one, and a number that skips the rows you cannot see is
-- a number that repeats. The organiser check is what keeps that from being a
-- way to ask how many people have been accepted.

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
  if not public.can_manage_conference(next_invoice_number.conference_id) then
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

revoke execute on function public.next_invoice_number(uuid) from public, anon;
grant execute on function public.next_invoice_number(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- compute_invoice_amount()
-- -----------------------------------------------------------------------------
-- The two totals on an invoice are worked out here and never sent in, so that
-- an amount always matches the quantity and the unit price beside it, whoever
-- wrote the row and whatever they meant to happen.
--
-- The platform fee is the one number here that is not recomputed on every
-- write, and the difference matters. amount_cents is made of quantity and
-- unit_amount_cents, which no one may change once the row exists, so working it
-- out again always gives the same answer. The platform fee is made of the
-- quantity and of what MUNMeet charged on the day the invoice was written, and
-- that second number can move: if it ever does in a later migration, the next
-- ordinary update to an old invoice -- "Mark as paid", a note, a status change
-- -- would silently restamp it at the new rate, after Stripe had already taken
-- the old application_fee_amount. An invoice is a record of what was agreed, so
-- it is worked out when the row is written and when the quantity changes, and
-- left alone otherwise.

create or replace function public.compute_invoice_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.amount_cents = new.quantity * new.unit_amount_cents;

  if tg_op = 'INSERT' or new.quantity is distinct from old.quantity then
    new.platform_fee_cents = new.quantity * public.platform_fee_per_delegate_cents();
  else
    new.platform_fee_cents = old.platform_fee_cents;
  end if;

  return new;
end;
$$;

-- A trigger function errors when it is called directly, so the grant below
-- changes nothing a browser can do. It is revoked all the same, because the
-- other trigger functions in this file and every one of migration 0006's are,
-- and a right nobody needs is a right nobody should have.
revoke execute on function public.compute_invoice_amount() from public, anon, authenticated;

create trigger invoices_compute_amount
  before insert or update on public.invoices
  for each row
  execute function public.compute_invoice_amount();


-- -----------------------------------------------------------------------------
-- guard_invoice_insert()
-- -----------------------------------------------------------------------------
-- What an invoice may look like on the day it is written, when a browser is the
-- one writing it. Without this, everything protect_invoice_columns below
-- refuses to let an organiser change could simply be chosen on the way in: an
-- invoice born `paid`, with a paid_method of 'stripe' and somebody else's
-- payment intent id beside it, and the payer told by notify_invoice_created
-- that a bill they never settled has been settled. permissions.md gives the
-- Stripe columns and "`paid` via Stripe" to the service role, which is a
-- sentence about the column and not about the statement.
--
-- It is the shape migration 0006 gave guard_application_insert and
-- guard_delegation_insert, for the same reason and after the same finding.
--
-- Like the other guards it is deliberately not "security definer", so that
-- current_user reads "authenticated" for a browser and "postgres" inside the
-- four allocation functions, which are the server and write these columns
-- legitimately.

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

  -- The currency is the conference's, and for much the same reason.
  -- specs/02-architecture/data-model.md says this column is copied from there,
  -- and Stripe Checkout is created in whatever it says
  -- (specs/02-architecture/payments.md, "Currency"), so an organiser who typed
  -- a currency of their own would send the payer to a payment page for an
  -- amount in a currency nobody had agreed to.
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

  return new;
end;
$$;

revoke execute on function public.guard_invoice_insert() from public, anon, authenticated;

-- Triggers on one table and one event fire in alphabetical order, so
-- invoices_compute_amount has already filled the two totals by the time this
-- one looks, which is why both are in the allow-list above.
create trigger invoices_guard_insert
  before insert on public.invoices
  for each row
  execute function public.guard_invoice_insert();


-- -----------------------------------------------------------------------------
-- check_invoice_transition()
-- -----------------------------------------------------------------------------
-- The status machine of 06-features/fees.md, and the only trigger in this file
-- that applies to everybody: unpaid becomes paid, waived or void; paid becomes
-- refunded; nothing else moves at all.
--
-- It is not part of protect_invoice_columns below, although both are about an
-- update, because the two are rules for different people. Which columns you may
-- write depends on who you are, and the server walks past it. Which statuses
-- exist does not: a webhook that tried to mark a voided invoice paid would be a
-- bug, and a bug is exactly what a database is meant to refuse.

create or replace function public.check_invoice_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'unpaid' and new.status in ('paid', 'waived', 'void'))
    or (old.status = 'paid' and new.status = 'refunded')
  ) then
    raise exception 'An invoice cannot go from % to %', old.status, new.status;
  end if;

  return new;
end;
$$;

revoke execute on function public.check_invoice_transition() from public, anon, authenticated;

create trigger invoices_check_transition
  before update of status on public.invoices
  for each row
  execute function public.check_invoice_transition();


-- -----------------------------------------------------------------------------
-- protect_invoice_columns()
-- -----------------------------------------------------------------------------
-- specs/02-architecture/permissions.md gives the organiser five columns of an
-- invoice and gives the Stripe columns to the server alone. A policy can decide
-- which rows somebody changes and not which columns, so the column half is
-- here, in the protect_<table>_columns shape that file's cross-cutting rules
-- describe.
--
-- That same sentence also names the values, and both halves are enforced here.
-- It lists the statuses an organiser may write one by one -- "waived, paid
-- (manual), void" -- and a column list on its own would let them write the two
-- it leaves out, which are exactly the two that mean money moved at Stripe.
--
-- Like protect_stripe_columns in migration 0002 it is deliberately NOT
-- "security definer": inside a security definer function current_user reads
-- "postgres" rather than the caller, which is the escape hatch that lets
-- set_invoice_checkout_session and the five allocation functions below write
-- the columns a browser may not.

create or replace function public.protect_invoice_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- What an organiser may write, taken straight from the invoices row of the
  -- policy matrix, plus updated_at, which invoices_set_updated_at overwrites a
  -- moment later whatever anybody sent.
  --
  -- It is an allow-list and the check below takes it away from both rows,
  -- rather than a list of the columns that are forbidden. A forbidden list is a
  -- list that rots: a column added to this table next year would be missing
  -- from it and a browser would quietly gain the right to write it. Task T16
  -- found that same bug twice in one review.
  --
  -- amount_cents and platform_fee_cents are not in the list and are not
  -- refused either, which is worth knowing before somebody goes looking for the
  -- hole. Triggers on the same event fire in name order, so
  -- invoices_compute_amount has already run and put the computed totals back by
  -- the time this one looks: the two rows are identical again and there is
  -- nothing to complain about. They are derived columns, so that is right --
  -- and they still cannot be moved, because quantity and unit_amount_cents,
  -- the only two things they are made of, are both refused here.
  organiser_writable constant text[] := array[
    'status', 'note', 'due_at', 'paid_at', 'paid_method', 'updated_at'
  ];
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if to_jsonb(new) - organiser_writable is distinct from to_jsonb(old) - organiser_writable then
    raise exception 'Only the status, the note and the payment details of an invoice can be changed';
  end if;

  -- "refunded" is not one of the organiser's statuses. A refund is money going
  -- back, which only Stripe can do: the app asks for it, the webhook writes
  -- stripe_refund_id with the status (specs/02-architecture/payments.md,
  -- "Refunds"), and both of those run as the server, which returned above. An
  -- invoice a browser marked refunded would tell the payer their money was
  -- returned with no refund made anywhere and no id to reconcile it against.
  --
  -- check_invoice_transition still allows paid -> refunded, and deliberately:
  -- that is the status machine, which is a rule about the invoice rather than
  -- about who is asking, and it binds the server too.
  if new.status is distinct from old.status and new.status = 'refunded' then
    raise exception 'Only a refund at Stripe can mark an invoice refunded';
  end if;

  -- The same sentence about the other half of "paid": the organiser's "Mark as
  -- paid" is the manual kind and sets paid_method = 'manual'
  -- (specs/02-architecture/payments.md, "Manual payments"), while a card
  -- payment is the webhook's and arrives with a payment intent id beside it. An
  -- organiser writing 'stripe' by hand would leave an invoice claiming a card
  -- payment that no Stripe id can be found for, which is the one thing the fees
  -- page and Stripe's own dashboard have to agree about.
  if new.paid_method is distinct from old.paid_method and new.paid_method = 'stripe' then
    raise exception 'Only a payment through Stripe can be marked as paid by card';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_invoice_columns() from public, anon, authenticated;

create trigger invoices_protect_columns
  before update on public.invoices
  for each row
  execute function public.protect_invoice_columns();


-- =============================================================================
-- The two Stripe writers
-- =============================================================================
-- Both columns they write are refused to a browser by a trigger, so these
-- functions are the only doors, and each one asks who is knocking.

-- -----------------------------------------------------------------------------
-- set_stripe_account(organization_id, stripe_account_id)
-- -----------------------------------------------------------------------------
-- Step 2 of the Connect onboarding in specs/02-architecture/payments.md: the
-- app has just created an Express account at Stripe and has to remember its id.
-- stripe_onboarding_completed_at is deliberately not writable here; it is set
-- by the webhook when Stripe says charges are enabled, and an organiser who
-- could set it themselves would be telling us they can take money when they
-- cannot.

create or replace function public.set_stripe_account(organization_id uuid, stripe_account_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_organization_admin(set_stripe_account.organization_id) then
    raise exception 'Only an owner or an admin of this organisation can connect Stripe';
  end if;

  update public.organizations
  set stripe_account_id = set_stripe_account.stripe_account_id
  where id = set_stripe_account.organization_id;
end;
$$;

revoke execute on function public.set_stripe_account(uuid, text) from public, anon;
grant execute on function public.set_stripe_account(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- set_invoice_checkout_session(invoice_id, session_id)
-- -----------------------------------------------------------------------------
-- The payer has just been sent to Stripe's hosted payment page and we keep the
-- session id so that the webhook coming back can be matched to this invoice.
--
-- The payer and nobody else, not even the organiser: it is the payer's own
-- checkout, and an id somebody else could overwrite would point the webhook at
-- the wrong payment.

create or replace function public.set_invoice_checkout_session(invoice_id uuid, session_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.invoices as invoice
    where invoice.id = set_invoice_checkout_session.invoice_id
      and invoice.payer_user_id = (select auth.uid())
  ) then
    raise exception 'Only the person who owes an invoice can pay it';
  end if;

  update public.invoices
  set stripe_checkout_session_id = set_invoice_checkout_session.session_id
  where id = set_invoice_checkout_session.invoice_id;
end;
$$;

revoke execute on function public.set_invoice_checkout_session(uuid, text) from public, anon;
grant execute on function public.set_invoice_checkout_session(uuid, text) to authenticated;


-- =============================================================================
-- The allocation functions, with the money in them
-- =============================================================================
-- Five of the functions migration 0006 wrote. Four of them gain the invoice
-- half that file marked with a "T17" comment and could not write, because this
-- table did not exist yet; move_delegate is the fifth, and gains one line, to
-- carry an invoice to the seat it has just filled. Everything else in each one
-- is unchanged; a "create or replace" is how a function is edited, since the
-- old body cannot be amended in place.
--
-- Two rules the four that write an invoice share. The invoice is written by the function and not by
-- the page, so that seating somebody and charging them are one statement and
-- neither can happen without the other. And when no fee applies -- a conference
-- that charges nothing, or one whose early bird window has closed with no
-- second price behind it -- no invoice is created at all, rather than one for
-- nothing. 06-features/fees.md.

-- -----------------------------------------------------------------------------
-- invoice_due_at(conference)
-- -----------------------------------------------------------------------------
-- When an invoice created now has to be paid: fourteen days, or the day
-- applications close if that comes first. 06-features/fees.md.
--
-- The "if that comes first" only counts while that day is still ahead of us.
-- Acceptances are normally decided after applications have closed, so reading
-- the rule literally would hand every real invoice a due date in the past and
-- call it overdue on the day it was written. The spec was describing an early
-- bird conference that invoices while its window is still open, and that is the
-- case this keeps.
--
-- Like applicable_fee above it is called from inside the allocation functions
-- and from nowhere else, so public, anon and authenticated are all revoked and
-- it needs no rights of its own.

create or replace function public.invoice_due_at(conference_id uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select least(
    now() + interval '14 days',
    (
      select conference.applications_close_at
      from public.conferences as conference
      where conference.id = invoice_due_at.conference_id
        and conference.applications_close_at > now()
    )
  );
$$;

revoke execute on function public.invoice_due_at(uuid) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- accept_application(application_id, seat_id)
-- -----------------------------------------------------------------------------
-- Accepting somebody, seating them and charging them are one decision, so they
-- are one statement. 06-features/allocation.md and 06-features/fees.md.

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

  if not public.can_manage_conference(application.conference_id) then
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

revoke execute on function public.accept_application(uuid, uuid) from public, anon;
grant execute on function public.accept_application(uuid, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- move_delegate(from_seat_id, to_seat_id)
-- -----------------------------------------------------------------------------
-- "Change seat" on the participants page. The seat half is migration 0006's and
-- is unchanged below; what this file adds is one line, and it is the smallest
-- change of any of the five.
--
-- The invoice itself does not move: the person is still coming and the fee did
-- not change because the room did. What moves is the seat the invoice is
-- written for. Without that, a delegate who has been moved once can never have
-- their invoice voided by anything: revoke_seat looks for the invoice carrying
-- the seat it is emptying, the invoice is still pointing at the seat they left,
-- and the rejected applicant keeps a live bill that notify_invoice_created has
-- already told them to pay.
--
-- Only an unpaid invoice follows them, and that is not a narrower guard than
-- the question: an unpaid invoice on a seat can only belong to whoever is
-- sitting in it, because the two ways of leaving a seat are this function,
-- which carries the invoice along, and revoke_seat, which voids it. A paid one
-- may well be an earlier occupant's, and dragging that across would move
-- somebody else's settled bill to a seat they never sat in.

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

  if not public.can_manage_conference(from_conference) then
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

  -- T34 carries the delegate's position paper across with them, by moving the
  -- documents row's seat_id. 06-features/documents.md.
end;
$$;

revoke execute on function public.move_delegate(uuid, uuid) from public, anon;
grant execute on function public.move_delegate(uuid, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- allocate_delegation_seats(delegation_id, seat_ids)
-- -----------------------------------------------------------------------------
-- The organiser ticks seats across committees on the delegation review page and
-- the whole tick list arrives here at once. One reservation is one invoice, for
-- the number of seats in it, so a school that is given four more seats next
-- week gets a second invoice for four rather than a rewritten first one.

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

  if not public.can_manage_conference(delegation.conference_id) then
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

revoke execute on function public.allocate_delegation_seats(uuid, uuid[]) from public, anon;
grant execute on function public.allocate_delegation_seats(uuid, uuid[]) to authenticated;


-- -----------------------------------------------------------------------------
-- remove_delegation_seat(seat_id)
-- -----------------------------------------------------------------------------
-- Giving a reserved seat back, before anybody was put in it. A seat somebody is
-- already sitting in goes through revoke_seat instead, because that is a
-- decision about a person and not about a count.
--
-- An invoice cannot be made smaller, because its total, its platform fee and
-- its Stripe session were all agreed at one number, so the unpaid one is voided
-- whole and a replacement is written for the seats that are left. If that
-- leaves none, there is no replacement.
--
-- Which invoice, when a school has been given seats twice? The newest unpaid
-- one. A seat does not record which allocation it arrived in -- only individual
-- invoices carry a seat_id -- so there is nothing to match it against, and the
-- newest is both the one still being looked at and the one whose fee is the
-- price the school last agreed to. When every invoice is paid, nothing happens
-- here at all: 06-features/fees.md leaves a paid invoice alone and the
-- organiser's fees page tells them to refund by hand.

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

  if not public.can_manage_conference(seat_conference) then
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

revoke execute on function public.remove_delegation_seat(uuid) from public, anon;
grant execute on function public.remove_delegation_seat(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- revoke_seat(seat_id)
-- -----------------------------------------------------------------------------
-- Taking a seat back off a person. The delegation keeps its reservation,
-- because the group still paid for that many seats and the head can put
-- somebody else in it; only the person is removed.
--
-- That is also why this touches no group invoice. The only invoice it can void
-- is the one written for this very seat, which is the individual kind: a school
-- whose member leaves still has the seat and still owes for it.

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

  if not public.can_manage_conference(seat_conference) then
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

  -- T34 deletes the seat's position paper row here; the file itself is removed
  -- by the app, which is the only thing that may talk to storage.
end;
$$;

revoke execute on function public.revoke_seat(uuid) from public, anon;
grant execute on function public.revoke_seat(uuid) to authenticated;


-- =============================================================================
-- Notifications
-- =============================================================================
-- The two lines of specs/02-architecture/notifications.md that belong to
-- invoices. Like the five in migration 0006 they are "security definer",
-- because notifications has no insert policy at all and a trigger running as
-- the organiser could not write a row addressed to the payer.

-- -----------------------------------------------------------------------------
-- notify_invoice_created()
-- -----------------------------------------------------------------------------
-- "Invoice amsterdammun-2027-0001: 65.00 EUR for Amsterdam Open MUN 2027."
--
-- The amount is written as digits and then the currency code, rather than as
-- "EUR 65.00" with a symbol in front of it the way the screen shows it.
-- Postgres has no Intl.NumberFormat, so a symbol would mean a second list of
-- currencies living in SQL beside the one in client/src/lib/money.ts, and a
-- list in two places is a list that rots.

create or replace function public.notify_invoice_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conference_name text;
begin
  -- An invoice whose payer deleted their account has nobody to tell, and
  -- notifications.user_id is not null, so writing one would abort whatever
  -- statement wrote the invoice. notify_invoice_paid below has the same guard
  -- for the same reason.
  --
  -- It is reachable through remove_delegation_seat, which carries the voided
  -- invoice's payer down to the replacement it writes: a school whose head
  -- closed their account still owes for the seats it keeps, so the reissue has
  -- to go through, and it is the delegation's other heads who read it. Every
  -- other invoice is born with a payer, because guard_invoice_insert refuses a
  -- null on the way in and the three other allocation functions each read a
  -- live person off the seat or the delegation.
  if new.payer_user_id is null then
    return new;
  end if;

  select conference.name
  into conference_name
  from public.conferences as conference
  where conference.id = new.conference_id;

  insert into public.notifications (user_id, conference_id, kind, title, link_path)
  values (
    new.payer_user_id,
    new.conference_id,
    'invoice_created',
    'Invoice ' || new.number || ': '
      || to_char(new.amount_cents / 100.0, 'FM999999990.00') || ' ' || new.currency
      || ' for ' || conference_name,
    '/invoices/' || new.id
  );

  return new;
end;
$$;

revoke execute on function public.notify_invoice_created() from public, anon, authenticated;

create trigger invoices_notify_created
  after insert on public.invoices
  for each row
  execute function public.notify_invoice_created();


-- -----------------------------------------------------------------------------
-- notify_invoice_paid()
-- -----------------------------------------------------------------------------
-- "Payment received for amsterdammun-2027-0001." It goes to the payer whether
-- the money came through Stripe or the organiser ticked "Mark as paid", because
-- either way the person who owed it wants to know it is settled.

create or replace function public.notify_invoice_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'paid' or old.status = 'paid' then
    return new;
  end if;

  -- An invoice whose payer deleted their account has nobody to tell, and
  -- notifications.user_id is not null. The organiser may still settle the row,
  -- because the money is theirs to record either way.
  if new.payer_user_id is null then
    return new;
  end if;

  insert into public.notifications (user_id, conference_id, kind, title, link_path)
  values (
    new.payer_user_id,
    new.conference_id,
    'invoice_paid',
    'Payment received for ' || new.number,
    '/invoices/' || new.id
  );

  return new;
end;
$$;

revoke execute on function public.notify_invoice_paid() from public, anon, authenticated;

create trigger invoices_notify_paid
  after update of status on public.invoices
  for each row
  execute function public.notify_invoice_paid();


-- =============================================================================
-- Row Level Security
-- =============================================================================
-- Every rule below is one row of the policy matrix in
-- specs/02-architecture/permissions.md, with a test in client/tests/db/ for the
-- allowed and for the refused case.


-- -----------------------------------------------------------------------------
-- fees
-- -----------------------------------------------------------------------------
-- What a conference charges is part of what a conference is: somebody deciding
-- whether to apply has to be able to read the price first. So the select rule
-- is the same two-policy "or" the committees and application_questions tables
-- use -- visitors see published and archived conferences, staff see their own
-- draft.

alter table public.fees enable row level security;

-- Written as a sub-select rather than as conference_is_published, although that
-- helper says exactly this, because every helper in permissions.md is granted
-- to "authenticated" only and a signed-out visitor is half of who this policy
-- is for. The committees and application_questions policies are written out for
-- the same reason.
create policy "Anyone can read the fees of a published conference"
  on public.fees
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.conferences as conference
      where conference.id = fees.conference_id
        and conference.status in ('published', 'archived')
    )
  );

create policy "Staff can read the fees of their conference"
  on public.fees
  for select
  to authenticated
  using (public.is_conference_staff(conference_id));

create policy "Organisers can add a fee"
  on public.fees
  for insert
  to authenticated
  with check (public.can_manage_conference(conference_id));

create policy "Organisers can change a fee"
  on public.fees
  for update
  to authenticated
  using (public.can_manage_conference(conference_id))
  with check (public.can_manage_conference(conference_id));

-- A fee that has been charged to somebody is part of their invoice's history,
-- so it may only be deleted while nothing points at it. An organiser who wants
-- an old price off the list closes its window instead.
create policy "Organisers can delete a fee nobody has been charged"
  on public.fees
  for delete
  to authenticated
  using (
    public.can_manage_conference(conference_id)
    and not exists (
      select 1
      from public.invoices as invoice
      where invoice.fee_id = fees.id
    )
  );


-- -----------------------------------------------------------------------------
-- invoices
-- -----------------------------------------------------------------------------
-- Three people may read an invoice and no more: the person who owes it, the
-- heads of the delegation it was written for, and the organisers of the
-- conference. There is no delete policy at all, because an invoice is a record:
-- the way to undo one is to void it.

alter table public.invoices enable row level security;

create policy "Payers can read their own invoices"
  on public.invoices
  for select
  to authenticated
  using (payer_user_id = (select auth.uid()));

-- Every head reads the group's invoices, not only the one who was named as the
-- payer, because a school that sends two teachers expects either of them to be
-- able to answer the bursar.
create policy "Delegation heads can read their delegation's invoices"
  on public.invoices
  for select
  to authenticated
  using (delegation_id is not null and public.is_delegation_head(delegation_id));

create policy "Organisers can read the invoices of their conference"
  on public.invoices
  for select
  to authenticated
  using (public.can_manage_conference(conference_id));

-- In practice the four allocation functions write every invoice, and they run
-- as the owner and never reach this policy. It is here for the organiser who
-- adds one by hand on the fees page, for a late delegate agreed over email.
create policy "Organisers can raise an invoice"
  on public.invoices
  for insert
  to authenticated
  with check (public.can_manage_conference(conference_id));

-- Which columns the organiser may write is protect_invoice_columns above, and
-- which statuses exist at all is check_invoice_transition, because a policy can
-- restrict neither.
create policy "Organisers can settle an invoice"
  on public.invoices
  for update
  to authenticated
  using (public.can_manage_conference(conference_id))
  with check (public.can_manage_conference(conference_id));
