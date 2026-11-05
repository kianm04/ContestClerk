-- =============================================================================
-- A chair may replace and remove their own committee's background guide
-- =============================================================================
-- Task T46 builds /conferences/[slug]/committees/[committeeSlug]/chair/papers,
-- whose "Background guide" card replaces and removes the committee's guide
-- (specs/05-pages/chair/papers.md). specs/06-features/documents.md says a guide
-- is "uploaded by a chair or organiser", one per committee, and replacing it
-- deletes the old file.
--
-- Migration 0013 let a chair insert a guide but change or delete only one they
-- had uploaded themselves ("Uploaders and organisers can change a file", and
-- "An uploader can remove a file nobody has reviewed"). So once an organiser
-- had uploaded a committee's guide, its chair could neither replace nor remove
-- it. Worse, the storage policies already let every chair of the committee
-- change the objects under background-guides/<committee id>-...
-- (may_change_conference_document), so the object and the row disagreed about
-- who owns a guide.
--
-- These two policies make the row agree with the object: a chair of the
-- committee (is_committee_chair, which is also true of an organiser) may
-- update and delete that committee's background guide row. protect_documents_columns
-- still freezes kind, conference, committee, seat and uploader, so an update
-- can only point the row at another file, rename it or change its audience.
-- Policies of one command are OR-ed, so the existing uploader and organiser
-- policies are left as they are.

create policy "Chairs can change their committee's background guide"
  on public.documents
  for update
  to authenticated
  using (kind = 'background_guide' and public.is_committee_chair(committee_id))
  with check (kind = 'background_guide' and public.is_committee_chair(committee_id));

create policy "Chairs can remove their committee's background guide"
  on public.documents
  for delete
  to authenticated
  using (kind = 'background_guide' and public.is_committee_chair(committee_id));
