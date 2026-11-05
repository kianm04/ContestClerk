-- =============================================================================
-- Uploads nobody saved: swept, and a person's own folders hold five at most
-- =============================================================================
-- docs/security-review-2026-10-10.md, item L61, the half that migration
-- 20261022133000_storage_hygiene left open. That migration queues the file a
-- row lets go of when the row is replaced or deleted. A file that never had a
-- row was on neither queue: anybody signed in may put pictures in their own
-- avatars folder, and a seated delegate may put papers under their seat in the
-- position-papers folder, straight through the Storage API and without saving
-- them anywhere. A picture may be 5 MB and a paper 20 MB, nothing limited how
-- many there were, and nothing ever removed them.
--
-- This file:
--
--   * adds unreferenced_uploads(uploaded_before): the files in the two buckets
--     that somebody signed in uploaded before that moment and that no row
--     points at;
--   * adds queue_unreferenced_uploads(), which puts the ones more than an hour
--     old on the two cleanup queues. The app calls it with the service role
--     every fifteen minutes and then empties the queues
--     (client/src/lib/server/orphaned-document-files.ts, started by the `init`
--     hook in client/src/hooks.server.ts);
--   * adds upload_folder_has_room(bucket, name), which the two upload policies
--     a person reaches in their own right now ask first. Their avatars folder,
--     and the papers under one seat, hold at most five files that are not
--     already on their way out.
--
-- Two things are never swept. A file uploaded less than an hour ago is left
-- alone, because every page that uploads writes its row a moment after the
-- file (uploadAvatar in $lib/server/profiles.ts, the paper upload in
-- $lib/server/position-papers.ts), and a sweep in between must not take the
-- file from under it. And a file with no owner is left alone, because only the
-- service role uploads without one: the seed's sample pictures, which the
-- styleguide and the landing page show by a fixed path and no row names.
--
-- The database tests are in client/tests/db/security-unreferenced-uploads.test.ts.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- unreferenced_uploads(uploaded_before): the files no row points at
-- -----------------------------------------------------------------------------
-- The rows that point into each bucket are the ones the app builds addresses
-- from: documents.storage_path for the documents bucket, and for public-media
-- profiles.avatar_path, organizations.logo_path, conferences.logo_path and
-- conferences.banner_path. A file is compared with all four columns, not only
-- the one its folder suggests, so a row that pointed across folders would
-- still keep its file.
--
-- It only reads. The moment is a parameter so the database tests can ask
-- about files they have just uploaded; the sweep always uses the default.

create function public.unreferenced_uploads(
  uploaded_before timestamptz default now() - interval '1 hour'
)
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select stored_file.bucket_id, stored_file.name
  from storage.objects as stored_file
  where stored_file.bucket_id = 'documents'
    and stored_file.owner_id is not null
    and stored_file.created_at < unreferenced_uploads.uploaded_before
    and not exists (
      select 1
      from public.documents as document
      where document.storage_path = stored_file.name
    )

  union all

  select stored_file.bucket_id, stored_file.name
  from storage.objects as stored_file
  where stored_file.bucket_id = 'public-media'
    and stored_file.owner_id is not null
    and stored_file.created_at < unreferenced_uploads.uploaded_before
    and not exists (
      select 1 from public.profiles as profile where profile.avatar_path = stored_file.name
    )
    and not exists (
      select 1
      from public.organizations as organization
      where organization.logo_path = stored_file.name
    )
    and not exists (
      select 1
      from public.conferences as conference
      where conference.logo_path = stored_file.name
        or conference.banner_path = stored_file.name
    );
$$;

-- The answer names files in folders the caller may not see, so it is the
-- service role's alone, like the two queues it feeds.
revoke execute on function public.unreferenced_uploads(timestamptz) from public, anon, authenticated;
grant execute on function public.unreferenced_uploads(timestamptz) to service_role;


-- -----------------------------------------------------------------------------
-- queue_unreferenced_uploads(): put the old ones on the cleanup queues
-- -----------------------------------------------------------------------------
-- The same two queues the replacement triggers fill, so the one sweep in
-- orphaned-document-files.ts removes every kind of leftover the same way. A
-- path already waiting stays as it is. Answers how many paths it added.

create function public.queue_unreferenced_uploads()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  documents_added integer;
  pictures_added integer;
begin
  insert into public.orphaned_document_files (storage_path)
  select unreferenced.name
  from public.unreferenced_uploads() as unreferenced
  where unreferenced.bucket_id = 'documents'
  on conflict (storage_path) do nothing;

  get diagnostics documents_added = row_count;

  insert into public.public_media_cleanup (path)
  select unreferenced.name
  from public.unreferenced_uploads() as unreferenced
  where unreferenced.bucket_id = 'public-media'
  on conflict (path) do nothing;

  get diagnostics pictures_added = row_count;

  return documents_added + pictures_added;
end;
$$;

revoke execute on function public.queue_unreferenced_uploads() from public, anon, authenticated;
grant execute on function public.queue_unreferenced_uploads() to service_role;


-- -----------------------------------------------------------------------------
-- upload_folder_has_room(bucket, name): five files to a person's own folder
-- -----------------------------------------------------------------------------
-- Two folders take uploads from anybody who holds the right thing, not from a
-- role somebody gave them: "avatars/<user id>/" from its own user, and the
-- papers named "<conference id>/position-papers/<seat id>…" from the seat's
-- delegate. Each holds at most five files, counting every file there except
-- those already queued for removal. A person has one avatar and a seat has
-- one paper; a replaced one is queued by the triggers of migration
-- 20261022133000 and stops counting at once, so replacing a picture or a paper
-- as often as anybody likes never reaches the limit. Only files nobody saved
-- do, and the sweep takes those away after an hour.
--
-- Every other folder belongs to organisers and chairs, who are trusted with
-- their conference; it always has room, and its leftovers are swept the same.
--
-- It is security definer because it counts files the caller may not see, and
-- it answers only true or false. The upload policies run as the signed-in
-- caller, so authenticated keeps the grant.

create function public.upload_folder_has_room(bucket text, object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  most_files_in_a_folder constant integer := 5;
  folders text[] := storage.foldername(object_name);
  folder_prefix text;
  files_in_folder integer;
begin
  if bucket = 'public-media' and folders[1] = 'avatars' and array_length(folders, 1) = 2 then
    folder_prefix := 'avatars/' || folders[2] || '/';
  elsif bucket = 'documents' and folders[2] = 'position-papers' and array_length(folders, 1) = 2 then
    -- A paper's file name starts with its seat's id, 36 characters of uuid.
    folder_prefix := folders[1] || '/position-papers/'
      || left(substring(object_name from length(folders[1] || '/position-papers/') + 1), 36);
  else
    return true;
  end if;

  select count(*) into files_in_folder
  from storage.objects as stored_file
  where stored_file.bucket_id = upload_folder_has_room.bucket
    and starts_with(stored_file.name, folder_prefix)
    and not exists (
      select 1
      from public.orphaned_document_files as queued
      where queued.storage_path = stored_file.name
    )
    and not exists (
      select 1 from public.public_media_cleanup as queued where queued.path = stored_file.name
    );

  return files_in_folder < most_files_in_a_folder;
end;
$$;

revoke execute on function public.upload_folder_has_room(text, text) from public, anon;
grant execute on function public.upload_folder_has_room(text, text) to authenticated;


-- -----------------------------------------------------------------------------
-- The two upload policies ask for room first
-- -----------------------------------------------------------------------------
-- Each is the policy as migrations 20260916140000 and 20260921120000 made it,
-- with the room check added. Only inserts ask: replacing or deleting a file
-- that is already there never adds one, and a full folder must still let its
-- owner delete.

drop policy "People may add public media to their own folder" on storage.objects;

create policy "People may add public media to their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'public-media'
    and public.may_write_public_media(name)
    and public.upload_folder_has_room(bucket_id, name)
  );

drop policy "Delegates, chairs and organisers can upload a document" on storage.objects;

create policy "Delegates, chairs and organisers can upload a document"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'documents'
    and public.may_upload_conference_document(name)
    and public.upload_folder_has_room(bucket_id, name)
  );
