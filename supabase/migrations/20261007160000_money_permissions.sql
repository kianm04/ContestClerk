-- =============================================================================
-- Money, and the conference itself (docs/roles-and-permissions.md, step 6)
-- =============================================================================
--
-- WHAT THIS IS
-- Until now the fees, the invoices and the conference row asked
-- `can_manage_conference`, which since step 1 means "is an administrator".
-- This moves them to their permissions:
--
--   * read_invoices: read the invoices and their payment status.
--   * manage_invoices: mark paid, waive and void, and number an invoice.
--     The role editor saves it together with read_invoices
--     (`withIncludedPermissions` in $lib/permissions.ts); the read policy
--     asks for either all the same, so a role written straight into the
--     database cannot manage what it cannot read.
--   * edit_conference: the fee list, and the conference row itself: its
--     details, publishing, archiving, deleting a draft, and its pictures.
--
-- Two questions about invoices are asked by people who may not read them.
-- The fee list says how many invoices point at each fee, and refuses to
-- delete a fee somebody has been charged; the details page locks the
-- currency once the first invoice exists. A policy's subquery sees only the
-- rows its reader may read, so `not exists (select ... from invoices)` would
-- answer "none" to an editor without read_invoices and let them delete a fee
-- in use. The three functions below answer those counts past the invoice
-- policies, and nothing more about the invoices than a count.
--
-- notify_invoice_paid, which the spec lists with this area, asks no
-- permission: it is a trigger that tells a payer their invoice is paid,
-- whoever marked it. It is unchanged.
--
-- This file is never edited once applied: a change is a new migration.


-- -----------------------------------------------------------------------------
-- Invoice counts, for readers of the fee list
-- -----------------------------------------------------------------------------

-- How many invoices point at each fee of a conference, for its team.
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
    and public.is_conference_staff(fee_invoice_counts.conference_id)
  group by invoice.fee_id;
$$;

revoke execute on function public.fee_invoice_counts(uuid) from public, anon;
grant execute on function public.fee_invoice_counts(uuid) to authenticated;

-- Has anybody been charged this fee? Asked by the fee delete policy below.
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
  );
$$;

revoke execute on function public.fee_has_invoices(uuid) from public, anon;
grant execute on function public.fee_has_invoices(uuid) to authenticated;

-- Has the conference raised its first invoice, which locks its currency?
-- Answers false to anybody outside its team.
create or replace function public.conference_has_invoices(conference_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_conference_staff(conference_has_invoices.conference_id)
    and exists (
      select 1
      from public.invoices as invoice
      where invoice.conference_id = conference_has_invoices.conference_id
    );
$$;

revoke execute on function public.conference_has_invoices(uuid) from public, anon;
grant execute on function public.conference_has_invoices(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- fees
-- -----------------------------------------------------------------------------
-- Reading is unchanged: the team reads the fee list, and anybody reads the
-- fees of a published conference.

drop policy "Organisers can add a fee" on public.fees;
drop policy "Organisers can change a fee" on public.fees;
drop policy "Organisers can delete a fee nobody has been charged" on public.fees;

create policy "Conference editors can add a fee"
  on public.fees
  for insert
  to authenticated
  with check (conference_id in (select public.permitted_conference_ids('edit_conference')));

create policy "Conference editors can change a fee"
  on public.fees
  for update
  to authenticated
  using (conference_id in (select public.permitted_conference_ids('edit_conference')))
  with check (conference_id in (select public.permitted_conference_ids('edit_conference')));

create policy "Conference editors can delete a fee nobody has been charged"
  on public.fees
  for delete
  to authenticated
  using (
    conference_id in (select public.permitted_conference_ids('edit_conference'))
    and not public.fee_has_invoices(id)
  );


-- -----------------------------------------------------------------------------
-- invoices
-- -----------------------------------------------------------------------------
-- The payer and the delegation head keep their own read policies. Invoices
-- are raised by accept_application and the allocation functions, which are
-- security definer; the insert policy is for a manager raising one by hand.

drop policy "Organisers can read the invoices of their conference" on public.invoices;
drop policy "Organisers can raise an invoice" on public.invoices;
drop policy "Organisers can settle an invoice" on public.invoices;

create policy "Invoice readers can read the invoices of their conference"
  on public.invoices
  for select
  to authenticated
  using (
    conference_id in (select public.permitted_conference_ids('read_invoices'))
    or conference_id in (select public.permitted_conference_ids('manage_invoices'))
  );

create policy "Invoice managers can raise an invoice"
  on public.invoices
  for insert
  to authenticated
  with check (conference_id in (select public.permitted_conference_ids('manage_invoices')));

create policy "Invoice managers can settle an invoice"
  on public.invoices
  for update
  to authenticated
  using (conference_id in (select public.permitted_conference_ids('manage_invoices')))
  with check (conference_id in (select public.permitted_conference_ids('manage_invoices')));


-- -----------------------------------------------------------------------------
-- conferences
-- -----------------------------------------------------------------------------
-- The details, publishing and archiving all update this one row. The columns
-- other steps own, such as the public schedule switch and the awards'
-- publishing, are written by administrators until those steps land, and an
-- administrator holds edit_conference.

drop policy "Organisers can update their conference" on public.conferences;
drop policy "Organisers can delete a conference that is still a draft" on public.conferences;

create policy "Conference editors can update their conference"
  on public.conferences
  for update
  to authenticated
  using (id in (select public.permitted_conference_ids('edit_conference')))
  with check (id in (select public.permitted_conference_ids('edit_conference')));

create policy "Conference editors can delete a conference that is still a draft"
  on public.conferences
  for delete
  to authenticated
  using (
    id in (select public.permitted_conference_ids('edit_conference'))
    and status = 'draft'
  );


-- -----------------------------------------------------------------------------
-- next_invoice_number
-- -----------------------------------------------------------------------------
-- Asked by whoever raises an invoice: a person deciding applications, through
-- accept_application, or a person managing invoices. has_permission already
-- answers yes to an administrator.

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
  if not public.has_permission(next_invoice_number.conference_id, 'decide_applications')
    and not public.has_permission(next_invoice_number.conference_id, 'manage_invoices')
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


-- -----------------------------------------------------------------------------
-- may_write_public_media
-- -----------------------------------------------------------------------------
-- A conference's banner and logo are part of its details, so they follow
-- edit_conference. The other two folders are unchanged.

create or replace function public.may_write_public_media(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  folders text[] := storage.foldername(object_name);
  top_folder text;
  owner_id uuid;
begin
  -- Every path this bucket accepts is "<folder>/<id>/<file name>". Anything
  -- shorter belongs to nobody.
  if coalesce(array_length(folders, 1), 0) < 2 then
    return false;
  end if;

  top_folder := folders[1];

  -- The second folder is always the id of the thing the file belongs to. A path
  -- with something else there is refused rather than allowed to raise an error,
  -- because the path is text a browser sent us.
  begin
    owner_id := folders[2]::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  if top_folder = 'avatars' then
    return owner_id = (select auth.uid());
  end if;

  if top_folder = 'organizations' then
    return public.is_organization_admin(owner_id);
  end if;

  if top_folder = 'conferences' then
    return public.has_permission(owner_id, 'edit_conference');
  end if;

  -- A folder we have never heard of. Nobody owns it, so nobody may write it.
  return false;
end;
$$;

-- End of migration. Never edit this file once applied; write a new one.
