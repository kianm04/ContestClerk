-- =============================================================================
-- Stripe binding and the money columns a browser may read or write
-- =============================================================================
--
-- WHAT THIS IS
-- The stripe-organizations package of the security review of 2026-10-10
-- (docs/security-review-2026-10-10.md): findings C5, L3, L11, L32 and L33.
--
-- C5. Any organisation admin could bind another organisation's Stripe account.
-- set_stripe_account took any text and ran as its owner, so the column guard
-- never saw it; the guard itself ran on update only, so an organisation could
-- be *created* with both Stripe columns already filled in; and every
-- organisation's stripe_account_id was public, so a real onboarded id was easy
-- to copy. Once bound, the server minted Express dashboard logins and
-- onboarding links for it. This file makes the guard run on insert as well,
-- makes set_stripe_account a one-time write, and keeps one Stripe account to
-- one organisation with a unique index. The application half (the account's
-- metadata.organization_id, checked on every path that uses a stored id) is
-- in client/src/lib/server/stripe.ts.
--
-- L3. organizations was readable column for column by anonymous visitors,
-- stripe_account_id, stripe_onboarding_completed_at and created_by included.
-- Table-level select goes and the public columns come back as column grants.
-- The view organization_private_settings hands an admin the three private
-- columns and a plain member only whether an account exists, which is what the
-- settings page shows them.
--
-- L11. The payer and the heads of a delegation could read the organiser's note
-- on their invoice ("chased twice by email"). The note was never shown to them
-- and was written as the organiser's own, so it moves to a table only invoice
-- readers and managers may read, and the column goes.
--
-- L32. protect_invoice_columns let an invoice manager rewrite paid_at and
-- paid_method at any status. Now a browser may only ever move them on the
-- unpaid -> paid transition, the payment is then by definition the manual kind,
-- and the trigger stamps paid_at from the database's clock itself.
--
-- L33. set_invoice_checkout_session accepted any text from the payer. Nothing
-- in the application calls it; a browser may no longer call it either.
--
-- This file:
--
--   * replaces protect_stripe_columns and recreates its trigger for inserts too
--   * replaces set_stripe_account, which now refuses a second binding
--   * adds the unique index organizations_stripe_account_id_unique
--   * replaces the organizations select grant with column grants
--   * adds the view organization_private_settings
--   * adds invoice_internal_notes, its two helpers can_read_invoice_note and
--     can_manage_invoice_note, moves the existing notes over and drops
--     invoices.note
--   * replaces protect_invoice_columns
--   * revokes set_invoice_checkout_session from authenticated
--
-- The database tests are in client/tests/db/security-stripe-organizations.test.ts.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- =============================================================================
-- C5. protect_stripe_columns, on insert as well
-- =============================================================================
-- The body for an update is the one migration 0002 wrote. The insert branch is
-- new: an organisation a browser creates starts with no Stripe account and no
-- onboarding, whatever the row it sent said. Only the app's own roles are held
-- to this, the way every column guard in this repository says it (see
-- protect_conferences_columns in 20260919140000): the server writes both
-- columns, the webhook most of all.

create or replace function public.protect_stripe_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.stripe_account_id is not null or new.stripe_onboarding_completed_at is not null then
      raise exception 'Stripe details can only be set by the server';
    end if;

    return new;
  end if;

  if new.stripe_account_id is distinct from old.stripe_account_id
    or new.stripe_onboarding_completed_at is distinct from old.stripe_onboarding_completed_at
  then
    raise exception 'Stripe details can only be changed by the server';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_stripe_columns() from public, anon, authenticated;

drop trigger organizations_protect_stripe_columns on public.organizations;

create trigger organizations_protect_stripe_columns
  before insert or update on public.organizations
  for each row
  execute function public.protect_stripe_columns();


-- =============================================================================
-- C5. set_stripe_account writes once
-- =============================================================================
-- Still the admin's call, still the one door to the column, but a door that
-- closes behind the first id. The application creates the Express account and
-- stores its id in the same breath, so a second call can only be an admin
-- pointing the organisation at an account that is not the one Stripe opened for
-- it. Replacing an account is a support job, not a form.
--
-- The check and the write are one statement, so two admins pressing "Connect
-- Stripe" at once cannot both get through: the second update matches no row and
-- is refused.

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

  if set_stripe_account.stripe_account_id is null
    or btrim(set_stripe_account.stripe_account_id) = ''
  then
    raise exception 'A Stripe account id is needed';
  end if;

  -- The column and the parameter share a name, so the column is written with
  -- its table in front; plpgsql would otherwise call the reference ambiguous.
  update public.organizations
  set stripe_account_id = set_stripe_account.stripe_account_id
  where organizations.id = set_stripe_account.organization_id
    and organizations.stripe_account_id is null;

  if not found then
    raise exception 'This organisation already has a Stripe account';
  end if;
end;
$$;

revoke execute on function public.set_stripe_account(uuid, text) from public, anon;
grant execute on function public.set_stripe_account(uuid, text) to authenticated;

-- One Stripe account pays one organisation. Partial, because most organisations
-- have none yet and nulls are not duplicates of each other.
create unique index organizations_stripe_account_id_unique
  on public.organizations (stripe_account_id)
  where stripe_account_id is not null;


-- =============================================================================
-- L3. Which organisation columns the public may read
-- =============================================================================
-- The select policy "Anyone can read organizations" stays as it is: every row
-- is public, because the conference list names its organiser. Which *columns*
-- are public is a grant, not a policy, and until now it was the whole table.
--
-- Measured on this stack before writing this: with column grants in place
-- PostgREST refuses "select=*" and an embedded "organizations(*)" outright
-- (42501), and answers an explicit list of granted columns, inside an embed as
-- well. Every read in client/src names its columns, and none of them names the
-- three below except through the view that follows.
--
-- Two of the three stay readable to the signed-in, and only to them.
-- stripe_onboarding_completed_at is the "Stripe connected" fact the publish
-- checklist, the organiser area, the creation flow and the fees page show to
-- every member and every conference administrator, who need not be an
-- organisation admin or even a member; it names no account and nothing can be
-- done with it. created_by is read as the caller by create_quick_session
-- (20261001121500), which finds a person's own personal organisation with it
-- and is not security definer; taking the grant away would stop every quick
-- session. Once that function no longer reads the column as the caller, this
-- one grant can go, and the view below is already the admin's way to it.

revoke select on public.organizations from anon, authenticated;

grant select (
  id, name, slug, description, country_code, website_url, created_at,
  logo_path, updated_at, is_personal, city
) on public.organizations to anon, authenticated;

grant select (stripe_onboarding_completed_at, created_by) on public.organizations to authenticated;

-- -----------------------------------------------------------------------------
-- organization_private_settings
-- -----------------------------------------------------------------------------
-- What the settings page reads beside the public columns. Built the way the
-- staff_*_details views of 20261007140000 are (security_invoker = false): the
-- view reads organizations as its owner, and the where clause and the two case
-- expressions are the whole guard. security_barrier keeps it that way: the
-- planner may not push a reader's own filter below the where clause, so no
-- function a reader writes into a filter can see a row the view withholds. A
-- member learns whether there is an account and whether onboarding finished,
-- which the Stripe card on the settings page has always shown them; which
-- account it is, and who made the organisation, come back only for an owner or
-- an admin.
--
-- The functions in a view run as the person reading it, so is_organization_
-- member and is_organization_admin answer about the caller, and the grant below
-- keeps anon, who may call neither, away from the view altogether.

create view public.organization_private_settings
with (security_invoker = false, security_barrier = true)
as
  select
    organization.id as organization_id,
    organization.stripe_onboarding_completed_at,
    organization.stripe_account_id is not null as has_stripe_account,
    case
      when public.is_organization_admin(organization.id) then organization.stripe_account_id
    end as stripe_account_id,
    case
      when public.is_organization_admin(organization.id) then organization.created_by
    end as created_by
  from public.organizations as organization
  where public.is_organization_member(organization.id);

comment on view public.organization_private_settings is
  'The Stripe account and the creator of an organisation, for its members. Only an owner or an admin sees the account id and the creator.';

revoke all on public.organization_private_settings from public, anon, authenticated;
grant select on public.organization_private_settings to authenticated;


-- =============================================================================
-- L11. The organiser's note moves off the invoice
-- =============================================================================
-- "Paid by bank transfer 12 Jan", "chased twice by email": the fees page's
-- "Mark as paid" and "Waive" dialogs take a note, the invoice page never showed
-- it to the payer, and migration 0006 called it "the organiser's own note". A
-- payer who read it through the API anyway was reading the office's file on
-- them. One row per invoice, because the dialogs write one note and the CSV
-- prints one.
--
-- Who may read it is who may read the invoices of the conference, and who may
-- write it is who may settle them: the same two permissions the invoices
-- policies of 20261007160000 ask for, asked through the invoice the note is
-- about. The two helpers are plain functions rather than security definer: the
-- invoices they look at are ones the caller may read anyway, so Row Level
-- Security on invoices is simply applied a second time.

create table public.invoice_internal_notes (
  invoice_id uuid primary key references public.invoices (id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The box on the fees page stops at 200 characters (INVOICE_NOTE_MAX_LENGTH in
  -- client/src/lib/invoices.ts); a note of nothing is no note.
  constraint invoice_internal_notes_note_not_blank check (btrim(note) <> ''),
  constraint invoice_internal_notes_note_length check (char_length(note) <= 200)
);

comment on table public.invoice_internal_notes is
  'What the organisers wrote for themselves when they settled an invoice. Never shown to the payer.';

create trigger invoice_internal_notes_set_updated_at
  before update on public.invoice_internal_notes
  for each row
  execute function public.set_updated_at();

create or replace function public.can_read_invoice_note(invoice_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.invoices as invoice
    where invoice.id = can_read_invoice_note.invoice_id
      and (
        invoice.conference_id in (select public.permitted_conference_ids('read_invoices'))
        or invoice.conference_id in (select public.permitted_conference_ids('manage_invoices'))
      )
  );
$$;

create or replace function public.can_manage_invoice_note(invoice_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.invoices as invoice
    where invoice.id = can_manage_invoice_note.invoice_id
      and invoice.conference_id in (select public.permitted_conference_ids('manage_invoices'))
  );
$$;

revoke execute on function public.can_read_invoice_note(uuid) from public, anon;
revoke execute on function public.can_manage_invoice_note(uuid) from public, anon;
grant execute on function public.can_read_invoice_note(uuid) to authenticated;
grant execute on function public.can_manage_invoice_note(uuid) to authenticated;

alter table public.invoice_internal_notes enable row level security;

create policy "Invoice readers can read the notes of their conference"
  on public.invoice_internal_notes
  for select
  to authenticated
  using (public.can_read_invoice_note(invoice_id));

create policy "Invoice managers can write a note"
  on public.invoice_internal_notes
  for insert
  to authenticated
  with check (public.can_manage_invoice_note(invoice_id));

create policy "Invoice managers can change a note"
  on public.invoice_internal_notes
  for update
  to authenticated
  using (public.can_manage_invoice_note(invoice_id))
  with check (public.can_manage_invoice_note(invoice_id));

create policy "Invoice managers can remove a note"
  on public.invoice_internal_notes
  for delete
  to authenticated
  using (public.can_manage_invoice_note(invoice_id));

revoke all on public.invoice_internal_notes from anon;

-- The notes already written come along, and the column they sat in goes, so
-- that no reader of invoices, through any policy, can find one there again.
-- left() only guards against a note typed before the box had its limit; the
-- application never saved a longer one.
insert into public.invoice_internal_notes (invoice_id, note, created_at, updated_at)
select invoice.id, left(invoice.note, 200), invoice.created_at, invoice.updated_at
from public.invoices as invoice
where invoice.note is not null
  and btrim(invoice.note) <> '';

alter table public.invoices drop column note;


-- =============================================================================
-- L32. protect_invoice_columns: the payment details are written once
-- =============================================================================
-- The body is migration 0006's with two changes. The allow-list loses "note",
-- which is no longer a column. And paid_at and paid_method are no longer free
-- for an organiser to write at any status: a browser may only move them when it
-- moves an unpaid invoice to paid, and then the payment is by definition the
-- manual kind, so the trigger writes 'manual' and the database's own clock
-- itself rather than believe what was sent. A backdated paid_at would misstate
-- when the money arrived; a paid_method rewritten later would turn a card
-- payment the webhook recorded into a manual one with no Stripe id to match.
--
-- Like protect_stripe_columns above it is deliberately NOT "security definer":
-- inside a security definer function current_user reads "postgres" rather than
-- the caller, which is the escape hatch that lets the allocation functions and
-- the webhook write the columns a browser may not.

create or replace function public.protect_invoice_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- What an organiser may write, plus updated_at, which invoices_set_updated_at
  -- overwrites a moment later whatever anybody sent. An allow-list, not a list
  -- of forbidden columns, for the reason migration 0006 gives: a forbidden list
  -- rots.
  organiser_writable constant text[] := array[
    'status', 'due_at', 'paid_at', 'paid_method', 'updated_at'
  ];
  is_being_paid boolean;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if to_jsonb(new) - organiser_writable is distinct from to_jsonb(old) - organiser_writable then
    raise exception 'Only the status, the due date and the payment details of an invoice can be changed';
  end if;

  -- A refund is money going back, which only Stripe can do; the webhook writes
  -- stripe_refund_id with the status and runs as the server, which returned
  -- above. check_invoice_transition still allows paid -> refunded for it.
  if new.status is distinct from old.status and new.status = 'refunded' then
    raise exception 'Only a refund at Stripe can mark an invoice refunded';
  end if;

  is_being_paid := old.status = 'unpaid' and new.status = 'paid';

  if is_being_paid then
    -- An organiser writing 'stripe' by hand would leave an invoice claiming a
    -- card payment that no Stripe id can be found for.
    if new.paid_method = 'stripe' then
      raise exception 'Only a payment through Stripe can be marked as paid by card';
    end if;

    new.paid_method := 'manual';
    new.paid_at := now();

    return new;
  end if;

  if new.paid_at is distinct from old.paid_at or new.paid_method is distinct from old.paid_method then
    raise exception 'The payment details of an invoice are written when it is marked as paid and not changed afterwards';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_invoice_columns() from public, anon, authenticated;


-- =============================================================================
-- L33. set_invoice_checkout_session is the server's
-- =============================================================================
-- The function checked that the caller owed the invoice and nothing else, so a
-- payer could store any text as the session id of any invoice of theirs and
-- point the webhook coming back at the wrong payment. Nothing in the
-- application calls it (client/src/lib/invoices.ts, invoicePaymentSection,
-- says why the pay button is decided on the server). When the pay action and
-- the webhook arrive they write stripe_checkout_session_id with the service
-- role, which protect_invoice_columns lets through, right after Stripe has made
-- the session, and the webhook resolves an invoice by its own id in the
-- session's metadata, never by the stored session id. The function stays, so
-- that no later migration has to guess at its body, but no browser may call it.

revoke execute on function public.set_invoice_checkout_session(uuid, text) from public, anon, authenticated;
