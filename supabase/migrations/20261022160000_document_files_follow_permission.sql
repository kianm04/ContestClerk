-- =============================================================================
-- A guide's or a resource's file follows a permission, not its uploader
-- =============================================================================
--
-- WHAT THIS IS
-- The Storage half of finding L50 of the security review of 2026-10-10
-- (docs/security-review-2026-10-10.md). Migration
-- 20261022142000_room_documents_guards closed the documents rows: a chair who
-- uploaded the background guide, or a document manager who uploaded a
-- resource, no longer changes or removes the row once the role is gone. The
-- file behind the row kept the old rule. The two storage.objects policies
-- from 20261022133000_storage_hygiene still let the person who uploaded a
-- guide or a resource file (Storage's `owner` column) replace and delete it
-- for as long as it existed:
--
--   * "Uploaders delete their files, a paper only while it is theirs" let a
--     former chair or document manager delete the file, so the committee's
--     guide or the conference's rules of procedure vanished under a row that
--     still pointed at them;
--   * "Uploaders replace guides and resources, reviewers any file" named the
--     uploader too. Its with check and the select policies happen to refuse
--     what an uploader could try today (new bytes at a path a row points at,
--     or a move to a path nobody may read), but the rule should not rest on
--     that, so the uploader leaves this policy as well.
--
-- The rights over a guide or a resource now come only from
-- may_change_conference_document, which asks for manage_committees on the
-- guide's committee and manage_documents on the conference, the permissions
-- the documents page checks today. The uploader keeps rights of their own in
-- one place only, as on the row: a delegate takes back their own position
-- paper while it waits for review and the deadline is open
-- (may_delete_own_position_paper). Nobody ever replaced a paper's file in
-- place, so the update policy has no uploader branch left at all.
--
-- This file:
--
--   * replaces the update policy on storage.objects for the documents bucket
--   * replaces the delete policy on storage.objects for the documents bucket
--
-- The database tests are in client/tests/db/security-storage.test.ts, under
-- "L50".
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- Replacing or moving a file
-- -----------------------------------------------------------------------------
-- A policy cannot be altered to lose a branch, so it is dropped and made again
-- under a name that says the new rule (shortened to fit Postgres's 63
-- characters for a name). "with check" is as it was: a file may
-- only become a path the person could upload to or change.

drop policy "Uploaders replace guides and resources, reviewers any file" on storage.objects;

create policy "Editors, managers and reviewers replace a document file"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'documents'
    and public.may_change_conference_document(name)
  )
  with check (
    bucket_id = 'documents'
    and (
      public.may_upload_conference_document(name)
      or public.may_change_conference_document(name)
    )
  );


-- -----------------------------------------------------------------------------
-- Removing a file
-- -----------------------------------------------------------------------------
-- may_delete_own_position_paper answers false for any folder but
-- position-papers, so the uploader's branch reaches papers alone. The folder
-- is still named here so the rule reads in the policy itself.

drop policy "Uploaders delete their files, a paper only while it is theirs" on storage.objects;

create policy "A delegate removes their paper while theirs, editors any file"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'documents'
    and (
      (
        owner = (select auth.uid())
        and coalesce((storage.foldername(name))[2], '') = 'position-papers'
        and public.may_delete_own_position_paper(name)
      )
      or public.may_change_conference_document(name)
    )
  );
