-- =============================================================================
-- Written position papers (T145)
-- =============================================================================
-- A delegate may now write their position paper on MUNMeet in Markdown instead
-- of uploading a PDF. Two things change in the database:
--
-- 1. position_paper_drafts, a new table: the working draft of a written paper,
--    one per seat, saved while the delegate types. Only the delegate sitting in
--    the seat reads or writes it. Chairs and organisers never see a draft; they
--    see what was submitted.
--
-- 2. documents gains body_markdown. A submitted written paper is the seat's
--    ordinary position_paper row, holding a Markdown snapshot of what was sent
--    instead of a file. So the review states, the deadline policies, the
--    chair's comment, move_delegate, swap_delegates and every count that asks
--    "does this seat have a position paper" work for both kinds unchanged. A
--    row carries either a file (the four file columns) or a body, never both
--    and never neither (T145 decision in open-questions.md).
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- documents: a file or a Markdown body
-- -----------------------------------------------------------------------------
-- The four file columns become optional, and documents_file_or_body says they
-- come as a set. Only a position paper may be written; a background guide and
-- a resource are still always files. The existing checks on the file columns
-- (a paper is a PDF, a file is 1 byte to 20 MB) pass a null, so a written
-- paper meets them without change.
--
-- 100 000 characters is the same ceiling the session notes and the draft
-- below carry: a long position paper is a tenth of it.

alter table public.documents
  alter column storage_path drop not null,
  alter column file_name drop not null,
  alter column file_size_bytes drop not null,
  alter column mime_type drop not null,
  add column body_markdown text;

alter table public.documents
  add constraint documents_file_or_body check (
    (
      storage_path is not null and file_name is not null
      and file_size_bytes is not null and mime_type is not null
      and body_markdown is null
    )
    or (
      kind = 'position_paper'
      and storage_path is null and file_name is null
      and file_size_bytes is null and mime_type is null
      and body_markdown is not null
    )
  ),
  add constraint documents_body_is_written check (
    body_markdown is null
    -- At least one character that is not white space: btrim alone would let
    -- a body of nothing but line breaks through.
    or (body_markdown ~ '[^[:space:]]' and char_length(body_markdown) <= 100000)
  );

comment on column public.documents.body_markdown is
  'A written position paper as it was submitted, in Markdown. Null for a file.';


-- -----------------------------------------------------------------------------
-- protect_documents_columns, replaced
-- -----------------------------------------------------------------------------
-- Migration 0017's function with two changes. body_markdown joins the list of
-- columns a browser may write, next to the file columns it replaces. And a
-- "new file" is now a new version of the paper: a new storage_path or a new
-- body. Sending a new version is still the only way a delegate may put the
-- review back to "submitted", so resending the exact text the chair sent back
-- is refused the same way resending nothing is.

create or replace function public.protect_documents_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  writable constant text[] := array[
    'title', 'storage_path', 'file_name', 'file_size_bytes', 'mime_type',
    'body_markdown', 'audience', 'review_status', 'review_comment',
    'reviewed_by', 'reviewed_at', 'updated_at'
  ];
  is_new_version boolean;
  is_review_unchanged boolean;
  is_review_reset boolean;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if to_jsonb(new) - writable is distinct from to_jsonb(old) - writable then
    raise exception
      'A document cannot be turned into another kind, or moved to another conference, committee, seat or owner';
  end if;

  if public.is_committee_chair(new.committee_id)
    or public.can_manage_conference(new.conference_id)
  then
    return new;
  end if;

  if new.kind <> 'position_paper' then
    return new;
  end if;

  is_new_version :=
    new.storage_path is distinct from old.storage_path
    or new.body_markdown is distinct from old.body_markdown;

  is_review_unchanged :=
    new.review_status is not distinct from old.review_status
    and new.review_comment is not distinct from old.review_comment
    and new.reviewed_by is not distinct from old.reviewed_by
    and new.reviewed_at is not distinct from old.reviewed_at;

  is_review_reset :=
    new.review_status = 'submitted'::public.review_status
    and new.review_comment is null
    and new.reviewed_by is null
    and new.reviewed_at is null;

  if is_new_version and not is_review_reset then
    raise exception
      'Only a chair of this committee can review a position paper: a new file goes back to submitted';
  end if;

  if not is_new_version and not is_review_unchanged then
    raise exception 'Only a chair of this committee can review a position paper';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_documents_columns() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- queue_orphaned_document_file, replaced
-- -----------------------------------------------------------------------------
-- A deleted written paper has no file behind it, so there is nothing for the
-- sweep to remove and no path to write into orphaned_document_files, whose
-- primary key would refuse a null. Otherwise unchanged from T96.

create or replace function public.queue_orphaned_document_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.storage_path is null then
    return old;
  end if;

  insert into public.orphaned_document_files (storage_path)
  values (old.storage_path)
  on conflict (storage_path) do nothing;

  return old;
end;
$$;

revoke execute on function public.queue_orphaned_document_file()
  from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- position_paper_drafts
-- -----------------------------------------------------------------------------
-- The working draft of a written paper, saved over and over while the
-- delegate types. One per seat. `revision` moves on with every save, the way
-- committee_session_notes does it (T130): a save names the revision it
-- started from, so a second window cannot wipe out the first one's words
-- without being told. T147 lets the members of a delegation write together,
-- which is when two writers become ordinary.
--
-- Submitting copies the draft into the documents row and deletes the draft;
-- "Edit and resubmit" starts a new one from the submitted text.

create table public.position_paper_drafts (
  seat_id uuid primary key references public.seats (id) on delete cascade,
  body_markdown text not null default '',
  revision integer not null default 1,
  -- Null once the account that saved last is deleted.
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint position_paper_drafts_body_length check (char_length(body_markdown) <= 100000),
  constraint position_paper_drafts_revision_positive check (revision >= 1)
);

comment on table public.position_paper_drafts is
  'The working draft of a written position paper. Only the seat''s delegate reads it.';

create index position_paper_drafts_updated_by_idx
  on public.position_paper_drafts (updated_by);


-- -----------------------------------------------------------------------------
-- stamp_position_paper_draft
-- -----------------------------------------------------------------------------
-- Every save from a browser records who made it and when, and moves the
-- revision on by one, so a page cannot reuse a revision another save already
-- took. A draft stays with its seat. The seed files write as the database's
-- own user and keep the names and times they give, which is why the stamp only
-- applies to anon and authenticated.

create or replace function public.stamp_position_paper_draft()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.seat_id <> old.seat_id then
      raise exception 'A draft stays with its seat.'
        using errcode = '42501';
    end if;

    new.revision = old.revision + 1;
  else
    new.revision = 1;
  end if;

  if current_user in ('anon', 'authenticated') then
    new.updated_by = auth.uid();
    new.updated_at = now();
  end if;

  return new;
end;
$$;

revoke execute on function public.stamp_position_paper_draft() from public, anon, authenticated;

create trigger position_paper_drafts_stamp
  before insert or update on public.position_paper_drafts
  for each row
  execute function public.stamp_position_paper_draft();


-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
-- The delegate sitting in the seat, and nobody else, not even the chair or
-- an organiser: a draft is not yet something anybody was sent. Writing a
-- draft is allowed after the deadline too, because it changes nothing anybody
-- reviews; the documents policies are what refuse a late submission.

alter table public.position_paper_drafts enable row level security;

create policy "A delegate can read the draft of their own seat"
  on public.position_paper_drafts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.seats as seat
      where seat.id = position_paper_drafts.seat_id
        and seat.user_id = (select auth.uid())
    )
  );

create policy "A delegate can start the draft of their own seat"
  on public.position_paper_drafts
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.seats as seat
      where seat.id = position_paper_drafts.seat_id
        and seat.user_id = (select auth.uid())
    )
  );

create policy "A delegate can save the draft of their own seat"
  on public.position_paper_drafts
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.seats as seat
      where seat.id = position_paper_drafts.seat_id
        and seat.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.seats as seat
      where seat.id = position_paper_drafts.seat_id
        and seat.user_id = (select auth.uid())
    )
  );

create policy "A delegate can drop the draft of their own seat"
  on public.position_paper_drafts
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.seats as seat
      where seat.id = position_paper_drafts.seat_id
        and seat.user_id = (select auth.uid())
    )
  );

-- A visitor who is not signed in has no business with drafts at all.
revoke all on public.position_paper_drafts from anon;


-- -----------------------------------------------------------------------------
-- clear_position_paper_draft_on_seat_change
-- -----------------------------------------------------------------------------
-- A seat that changes hands loses its draft, whoever moved it: a head
-- unassigning a member, revoke_seat, move_delegate or swap_delegates. The
-- select policy asks who sits in the seat now, so without this the next
-- delegate would read the last one's unsent work. Unlike the submitted paper,
-- a draft does not move with its delegate (T145 decision): it is unfinished
-- work, and a moved delegate usually writes for another committee.
--
-- Security definer because the person who emptied the seat may not see the
-- draft, which is the point of the rule.

create or replace function public.clear_position_paper_draft_on_seat_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.position_paper_drafts where seat_id = new.id;

  return new;
end;
$$;

revoke execute on function public.clear_position_paper_draft_on_seat_change()
  from public, anon, authenticated;

create trigger seats_clear_position_paper_draft
  after update of user_id on public.seats
  for each row
  when (old.user_id is distinct from new.user_id)
  execute function public.clear_position_paper_draft_on_seat_change();
