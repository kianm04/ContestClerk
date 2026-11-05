-- =============================================================================
-- Migration 0017: who may review a position paper, and what a delegate may not
-- =============================================================================
-- Task T37 builds the three pages that write position papers:
-- /manage/[slug]/documents, where an organiser approves papers or asks for
-- changes, and the delegate's own upload page. Migration 0013 wrote the rules
-- for the documents table before either page existed, and four of them do not
-- match what those pages, specs/05-pages/organiser/documents.md and
-- specs/06-features/documents.md ask for.
--
-- 1. An organiser could not review a paper at all. The only update policy for
--    a position paper that is not the delegate's own was "Chairs can review a
--    position paper", and protect_documents_columns let only a chair write the
--    review columns. The organiser's documents page has "Approve" and "Request
--    changes" on every seat, and 06-features/documents.md gives organisers
--    "the same actions" as a chair, so both learn about organisers here.
--
-- 2. A delegate could delete their own waiting paper after the deadline. The
--    delete policy was "uploader while submitted" with no window, while the
--    feature file says "while it is submitted and the deadline has not
--    passed", and the insert and update policies of the same table already
--    enforce the deadline. Hiding the button would not be enough, because the
--    same delete reaches the REST API.
--
-- 3. A delegate could put a "changes requested" paper back to "submitted"
--    without replacing the file, which would move it back into the chair's
--    queue with the same file the chair had just sent back.
--
-- 4. A delegate could clear what the chair wrote -- the comment, who reviewed
--    it and when -- without replacing the file either, and could replace the
--    file of an approved paper before the deadline while it kept saying
--    "approved". The feature file ties all of these to one event: uploading a
--    new file puts the paper back to "submitted" and clears the review.
--
-- 3 and 4 are one rule, so protect_documents_columns below states it once: for
-- anybody who may not review the paper, the four review columns change only
-- together with the file, and then only to "submitted" with the rest cleared.
-- These were the three things review round 5 of T34 found the database would
-- not do for this page, and its handoff asked that whichever the page needs be
-- closed in the guard rather than in a form action.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- Organisers can review a position paper
-- -----------------------------------------------------------------------------
-- The same shape as "Chairs can review a position paper" in migration 0013.
-- An organiser can already read every paper of their conference and delete
-- any of them, so being able to write the review adds nothing they could not
-- reach before except the review itself. protect_documents_columns still keeps
-- them from moving a paper to another seat or owner.

create policy "Organisers can review a position paper"
  on public.documents
  for update
  to authenticated
  using (kind = 'position_paper' and public.can_manage_conference(conference_id))
  with check (kind = 'position_paper' and public.can_manage_conference(conference_id));


-- -----------------------------------------------------------------------------
-- A delegate removes their own paper only before the deadline
-- -----------------------------------------------------------------------------
-- Dropped and written again, because a policy cannot be altered in place to
-- gain a condition. The half about background guides and resources is
-- unchanged: neither has a review or a deadline, so the chair who uploaded a
-- guide can still remove it whenever they like. A null deadline means the
-- conference set none, the same reading the insert and update policies use.

drop policy "An uploader can remove a file nobody has reviewed" on public.documents;

create policy "An uploader can remove a file nobody has reviewed"
  on public.documents
  for delete
  to authenticated
  using (
    uploaded_by = (select auth.uid())
    and (
      kind <> 'position_paper'
      or (
        (review_status is null or review_status = 'submitted')
        and exists (
          select 1
          from public.conferences as conference
          where conference.id = documents.conference_id
            and (conference.position_paper_deadline is null
                 or now() <= conference.position_paper_deadline)
        )
      )
    )
  );


-- -----------------------------------------------------------------------------
-- protect_documents_columns, replaced
-- -----------------------------------------------------------------------------
-- The first rule, what a document IS and what it belongs to, is migration
-- 0013's word for word; its long comment there still describes it. What
-- changed is the second rule, the review:
--
--   * "may review" is now a chair of the paper's committee OR an organiser of
--     its conference, which is point 1 above;
--   * everybody else -- in practice the delegate who uploaded the paper -- may
--     touch the four review columns only while replacing the file, which is
--     what "storage_path changed" means, because every path ends in a fresh
--     uuid. Then the paper has to go back to "submitted" with the comment, the
--     reviewer and the moment cleared. Without a new file, the four columns
--     stay exactly as they are. That is points 3 and 4.
--
-- A background guide and a resource have no review at all, which the
-- documents_review_is_for_papers check keeps true, so for them the new rule
-- only ever sees four nulls staying null.
--
-- The error message is migration 0013's, because the tests and anybody
-- reading a log already know it.

create or replace function public.protect_documents_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  writable constant text[] := array[
    'title', 'storage_path', 'file_name', 'file_size_bytes', 'mime_type',
    'audience', 'review_status', 'review_comment', 'reviewed_by',
    'reviewed_at', 'updated_at'
  ];
  is_new_file boolean;
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

  is_new_file := new.storage_path is distinct from old.storage_path;

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

  if is_new_file and not is_review_reset then
    raise exception
      'Only a chair of this committee can review a position paper: a new file goes back to submitted';
  end if;

  if not is_new_file and not is_review_unchanged then
    raise exception 'Only a chair of this committee can review a position paper';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_documents_columns() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Removing a replaced or deleted guide or resource
-- -----------------------------------------------------------------------------
-- Storage answers a remove with the rows it deleted, so a remove needs the
-- select policy to pass as well as the delete policy. The select policy from
-- migration 0012 reads the `documents` row, and by the time the organiser's
-- documents page removes a replaced background guide or a deleted resource,
-- the row points at the new file or is gone. The remove then matched nothing
-- and the old file stayed in the bucket, which
-- `05-pages/organiser/documents.md` says must not happen.
--
-- This lets whoever may change a file in the `resources` or
-- `background-guides` folder see it, row or no row: the organisers for a
-- resource, and the committee's chairs and the organisers for a guide, the same
-- people the delete policy already allows. Position papers are left out on
-- purpose: a paper with no row stays readable by nobody, as `storage.md` says.
create policy "Organisers and chairs can see the guides and resources they may change"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[2] in ('resources', 'background-guides')
    and public.may_change_conference_document(name)
  );
