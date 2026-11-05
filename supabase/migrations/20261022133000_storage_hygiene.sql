-- =============================================================================
-- Storage hygiene: the bucket findings of the security review of 10 October 2026
-- =============================================================================
-- docs/security-review-2026-10-10.md, items M3, L59, L60, L61, L62, L63, L64
-- and I22. All of them are about the two buckets and the paths that point into
-- them, and every one is closed here:
--
--   * L62  the three storage helpers had PostgreSQL's default PUBLIC execute
--          grant, so a visitor could call them through RPC. Revoked.
--   * L60  "Anybody may read public media" let a visitor list the whole
--          public-media bucket: every avatar owner's id, every organisation's
--          id, the pictures of unpublished conferences. Dropped. A public
--          bucket serves its files at the public address without a select
--          policy; the only reads that need one are the copies creation makes
--          into a new draft's folder, and the removals of a replaced picture,
--          both by the folder's own owner.
--   * M3   a seated delegate could overwrite the bytes of a paper a chair had
--          approved, or delete and re-upload them, because the storage update
--          and delete policies trusted the object's uploader and the insert
--          helper never asked whether a row already pointed at the path. The
--          review rules lived only on the documents row.
--   * L59  documents.storage_path was any text, so a row could point at a
--          file in another conference's folder or of another kind.
--   * L61, L63, L64  replaced pictures and papers, and the avatars of deleted
--          accounts, were never removed. A second cleanup queue for the
--          public-media bucket, filled by triggers, and the documents queue
--          filled on replacement as well as on deletion.
--   * I22  avatar_path, logo_path and banner_path were free text that the app
--          turned into public addresses. Each is now tied to its owner's folder.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- =============================================================================
-- L62: the storage helpers are for signed-in people only
-- =============================================================================
-- Every function in PostgreSQL is executable by PUBLIC until somebody says
-- otherwise, and the three helpers below were only ever granted, never revoked.
-- They return false for a visitor today, but a visitor had no business calling
-- them at all. The policies run as the signed-in role, which keeps its grant.

revoke execute on function public.may_write_public_media(text) from public, anon;
revoke execute on function public.may_change_conference_document(text) from public, anon;
grant execute on function public.may_write_public_media(text) to authenticated;
grant execute on function public.may_change_conference_document(text) to authenticated;
-- may_upload_conference_document is replaced further down and gets its grants there.


-- =============================================================================
-- L60: nobody lists the public-media bucket
-- =============================================================================
-- Storage lists a folder by selecting from storage.objects as the caller, so a
-- select policy for anon and authenticated is what let a visitor walk the
-- whole bucket. The bytes themselves do not need it: a public bucket answers
-- /storage/v1/object/public/… as the storage service itself, which is the
-- address src/lib/media.ts builds and the only one the app ever shows.
--
-- Two things did need the old policy. Storage answers a remove with the rows
-- it removed, so removing a replaced avatar, logo or banner needs its owner to
-- see it. And when a draft conference begins, src/lib/server/creation.ts
-- copies the organisation's logo and the previous edition's banner into the
-- draft's folder, and a copy has to see its source. Any member of the
-- organisation may begin a draft, not only its admins, and the previous
-- edition is one the organisation has published. So the one select policy
-- left says: you see your own avatar folder, the folder of every organisation
-- you belong to, and the folder of every conference that is public or that
-- you may edit. A visitor sees nothing, and nobody sees a stranger's avatars
-- or another organisation's drafts.

drop policy "Anybody may read public media" on storage.objects;

-- The same shape as may_write_public_media, and security definer for the same
-- reason: the helpers it asks are security definer themselves.
create or replace function public.may_see_public_media(object_name text)
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

  -- The path is text a browser sent us, so an id that is not a uuid is
  -- refused rather than allowed to raise an error.
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
    return public.is_organization_member(owner_id);
  end if;

  if top_folder = 'conferences' then
    return public.conference_is_published(owner_id)
      or public.has_permission(owner_id, 'edit_conference');
  end if;

  return false;
end;
$$;

revoke execute on function public.may_see_public_media(text) from public, anon;
grant execute on function public.may_see_public_media(text) to authenticated;

create policy "People may see the public media of what they belong to"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'public-media'
    and public.may_see_public_media(name)
  );


-- =============================================================================
-- M3: an approved paper's bytes are the chair's to keep
-- =============================================================================
-- Three changes, read together with the storage policies for the documents
-- bucket in migration 20260921120000.
--
-- may_upload_conference_document now refuses a path a documents row already
-- points at. Replacing a paper, a guide or a resource always goes to a fresh
-- path with a new uuid in it (positionPaperPath and its siblings in
-- src/lib/documents.ts), so the only upload that ever names a taken path is one
-- putting different bytes under a row that says what the file is.
--
-- The update policy no longer trusts the uploader in the position-papers
-- folder. A delegate never updates an object in place; a chair with
-- review_papers still may, through may_change_conference_document, which is
-- unchanged. Guides and resources keep the uploader branch they had.
--
-- The delete policy trusts the uploader in that folder only while the paper is
-- still theirs to withdraw: no row points at the file, or the row is
-- unreviewed and the deadline has not passed, the same two conditions the
-- documents delete policy of migration 20260923120000 puts on the row.

create or replace function public.may_upload_conference_document(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  folders text[] := storage.foldername(object_name);
  the_conference uuid;
  kind_folder text;
  path_prefix text;
  file_name text;
  owner_id uuid;
begin
  -- Every path this bucket accepts is "<conference id>/<kind>/<file name>".
  -- Anything shorter or deeper belongs to nobody.
  if coalesce(array_length(folders, 1), 0) <> 2 then
    return false;
  end if;

  -- A path a documents row points at is taken: the bytes there are the ones
  -- the row describes, and a review is a judgement about those bytes. New
  -- bytes go to a new path, which the row is then pointed at.
  if exists (
    select 1
    from public.documents as document
    where document.storage_path = object_name
  ) then
    return false;
  end if;

  -- The path is text a browser sent us, so an id that is not a uuid is refused
  -- rather than allowed to raise an error.
  begin
    the_conference := folders[1]::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  kind_folder := folders[2];

  -- storage.foldername leaves the file name out, so it is cut off the end of
  -- the path by hand: everything after "<conference id>/<kind folder>/".
  path_prefix := folders[1] || '/' || folders[2] || '/';
  file_name := substring(object_name from length(path_prefix) + 1);

  if kind_folder = 'resources' then
    return public.has_permission(the_conference, 'manage_documents');
  end if;

  -- The two kinds that belong to something smaller than the conference start
  -- their file name with that thing's id, which is 36 characters of uuid.
  begin
    owner_id := substring(file_name from 1 for 36)::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  if kind_folder = 'position-papers' then
    return exists (
      select 1
      from public.seats as seat
      join public.committees as committee on committee.id = seat.committee_id
      where seat.id = owner_id
        and seat.user_id = (select auth.uid())
        and committee.conference_id = the_conference
    );
  end if;

  if kind_folder = 'background-guides' then
    return public.has_committee_permission(owner_id, 'manage_committees')
      and exists (
        select 1
        from public.committees as committee
        where committee.id = owner_id
          and committee.conference_id = the_conference
      );
  end if;

  -- A folder we have never heard of. Nobody owns it, so nobody may write it.
  return false;
end;
$$;

revoke execute on function public.may_upload_conference_document(text) from public, anon;
grant execute on function public.may_upload_conference_document(text) to authenticated;


-- -----------------------------------------------------------------------------
-- may_delete_own_position_paper(object_name)
-- -----------------------------------------------------------------------------
-- Whether the file at this path, in the position-papers folder, is still its
-- uploader's to take away. The delete policy below asks it only for the
-- object's own uploader; who else may remove a paper is
-- may_change_conference_document's answer, as before.
--
-- Security definer like the other helpers: it reads the documents row and the
-- conference's deadline, and the person asking cannot always read either.

create or replace function public.may_delete_own_position_paper(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  paper record;
begin
  if coalesce((storage.foldername(object_name))[2], '') <> 'position-papers' then
    return false;
  end if;

  select document.review_status, conference.position_paper_deadline
  into paper
  from public.documents as document
  join public.conferences as conference on conference.id = document.conference_id
  where document.storage_path = object_name;

  -- No row points at the file: an upload whose row was never written, or a
  -- paper whose row has since gone. Nothing says what it is, so its uploader
  -- may clear it away.
  if not found then
    return true;
  end if;

  -- The same two conditions "An uploader can remove a file nobody has
  -- reviewed" puts on the row: not yet reviewed, and the deadline not passed.
  -- A null deadline means the conference set none.
  return (paper.review_status is null or paper.review_status = 'submitted')
    and (paper.position_paper_deadline is null or now() <= paper.position_paper_deadline);
end;
$$;

revoke execute on function public.may_delete_own_position_paper(text) from public, anon;
grant execute on function public.may_delete_own_position_paper(text) to authenticated;


-- -----------------------------------------------------------------------------
-- The update and delete policies, written again
-- -----------------------------------------------------------------------------
-- A policy cannot be altered to lose a branch, so both are dropped and made
-- again under names that say the new rule. "with check" is as it was: a file
-- may only be changed into a path the person could upload to or change.

drop policy "Uploaders, chairs and organisers can replace a document" on storage.objects;

create policy "Uploaders replace guides and resources, reviewers any file"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'documents'
    and (
      (
        owner = (select auth.uid())
        and coalesce((storage.foldername(name))[2], '') <> 'position-papers'
      )
      or public.may_change_conference_document(name)
    )
  )
  with check (
    bucket_id = 'documents'
    and (
      public.may_upload_conference_document(name)
      or public.may_change_conference_document(name)
    )
  );

drop policy "Uploaders, chairs and organisers can delete a document" on storage.objects;

create policy "Uploaders delete their files, a paper only while it is theirs"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'documents'
    and (
      (
        owner = (select auth.uid())
        and (
          coalesce((storage.foldername(name))[2], '') <> 'position-papers'
          or public.may_delete_own_position_paper(name)
        )
      )
      or public.may_change_conference_document(name)
    )
  );


-- =============================================================================
-- L59: a documents row points into its own folder
-- =============================================================================
-- check_document_scope already made sure a row's committee and seat belong to
-- its conference. It now holds storage_path to the same rule, in the shape the
-- app builds paths (src/lib/documents.ts) and the two storage helpers read
-- them: "<conference id>/position-papers/<seat id>-…",
-- "<conference id>/background-guides/<committee id>-…" and
-- "<conference id>/resources/…", with nothing but a file name after the
-- prefix. Without it a row could describe a file in another conference's
-- folder, and the storage select policy, which only asks whether a row with
-- that path exists, would then hand the file to the row's readers. The first
-- half of the function is migration 20260921120000's, word for word.
--
-- The path is checked when it is set: on insert, and on an update that
-- changes it. An update that keeps it is left alone, because move_delegate
-- and swap_delegates carry a paper to another seat by changing the row's
-- seat and committee while the file stays where it was, and
-- protect_documents_columns already refuses every other change of what a row
-- is (its kind, conference, committee or seat) for anybody else.
--
-- A row that lacks the id its kind needs, or is of a kind that has no folder
-- (working papers and draft resolutions live in committee_papers), is passed
-- on untouched: the table's check constraints refuse it next, with the
-- message the tests and the app already know.

create or replace function public.check_document_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  seat_committee uuid;
  expected_prefix text;
  rest_of_path text;
begin
  if new.committee_id is not null
    and not exists (
      select 1
      from public.committees as committee
      where committee.id = new.committee_id
        and committee.conference_id = new.conference_id
    )
  then
    raise exception 'That committee is not part of this conference';
  end if;

  if new.seat_id is not null then
    select seat.committee_id
    into seat_committee
    from public.seats as seat
    where seat.id = new.seat_id;

    if seat_committee is distinct from new.committee_id then
      raise exception 'That seat is not part of this committee';
    end if;
  end if;

  -- A written paper has no file and nothing to check here, and a path that an
  -- update leaves as it was has been checked already.
  if new.storage_path is null
    or (tg_op = 'UPDATE' and new.storage_path = old.storage_path)
  then
    return new;
  end if;

  if new.kind = 'position_paper' and new.seat_id is not null then
    expected_prefix := new.conference_id::text || '/position-papers/' || new.seat_id::text || '-';
  elsif new.kind = 'background_guide' and new.committee_id is not null then
    expected_prefix := new.conference_id::text || '/background-guides/'
      || new.committee_id::text || '-';
  elsif new.kind = 'resource' then
    expected_prefix := new.conference_id::text || '/resources/';
  else
    return new;
  end if;

  rest_of_path := substring(new.storage_path from length(expected_prefix) + 1);

  if left(new.storage_path, length(expected_prefix)) <> expected_prefix
    or rest_of_path = ''
    or position('/' in rest_of_path) > 0
  then
    raise exception 'That file path does not belong to this document';
  end if;

  return new;
end;
$$;

revoke execute on function public.check_document_scope() from public, anon, authenticated;


-- =============================================================================
-- L61, L63, L64: a second cleanup queue, and the first one filled on replacement
-- =============================================================================
-- A file in a bucket is removed through the Storage API, not by SQL, and the
-- person whose write made a file redundant often cannot remove it: a deleted
-- account has nobody left to act for it, and a delegate cannot see a paper
-- file whose row has moved on (the storage select policy asks for the row).
-- So, as migration 20260925140000 did for deleted documents, the database
-- writes down which file lost its owner and the app's sweep
-- (removeOrphanedDocumentFiles in client/src/lib/server/orphaned-document-files.ts)
-- removes it with the service role afterwards.
--
-- public_media_cleanup is that list for the public-media bucket: the avatar,
-- logo or banner a new one replaced, and the pictures of a profile,
-- organisation or conference row that was deleted. The app removes a replaced
-- picture itself when it can; where that fails, or where nothing runs at all
-- (an account deleted, a path changed by hand), the queue catches it. Every
-- path carries a fresh uuid, so a queued path is never written again.

create table public.public_media_cleanup (
  -- The path in the public-media bucket, exactly as the column held it.
  path text primary key,
  queued_at timestamptz not null default now()
);

comment on table public.public_media_cleanup is
  'Files in the public-media bucket that no row points at any more, waiting for the app to remove them with the service role.';

-- Row Level Security with no policies, like orphaned_document_files: nobody
-- signed in may read a path to a picture they were never shown, and nobody
-- may write a path to have a picture removed. The service role, which ignores
-- Row Level Security, is who empties it.
alter table public.public_media_cleanup enable row level security;

revoke all on table public.public_media_cleanup from anon, authenticated;

-- One trigger function for the three tables. The trigger names the picture
-- columns of its table as arguments, so the function need not know which
-- table it is on: to_jsonb turns the old and new rows into maps the column
-- name can be looked up in. On an update the old path is queued when it
-- changed; on a delete, whenever there was one.
--
-- Security definer because the person whose statement fired it may not write
-- the queue; that is the point of the queue.

create or replace function public.queue_replaced_public_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  column_name text;
  old_path text;
  new_path text;
begin
  foreach column_name in array tg_argv loop
    old_path := to_jsonb(old) ->> column_name;
    new_path := case when tg_op = 'UPDATE' then to_jsonb(new) ->> column_name end;

    if old_path is not null and old_path is distinct from new_path then
      insert into public.public_media_cleanup (path)
      values (old_path)
      on conflict (path) do nothing;
    end if;
  end loop;

  -- An AFTER trigger's answer is ignored.
  return null;
end;
$$;

revoke execute on function public.queue_replaced_public_media()
  from public, anon, authenticated;

create trigger profiles_queue_replaced_avatar
  after update of avatar_path or delete on public.profiles
  for each row
  execute function public.queue_replaced_public_media('avatar_path');

create trigger organizations_queue_replaced_logo
  after update of logo_path or delete on public.organizations
  for each row
  execute function public.queue_replaced_public_media('logo_path');

create trigger conferences_queue_replaced_pictures
  after update of banner_path, logo_path or delete on public.conferences
  for each row
  execute function public.queue_replaced_public_media('banner_path', 'logo_path');

-- The documents queue gained a second way in. A replaced paper or guide points
-- its row at the new file, and the old one has no row left to be seen by: the
-- remove the app tried afterwards matched nothing (L63). Now the update itself
-- queues the old path, and the app no longer pretends to remove it.

create or replace function public.queue_replaced_document_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.storage_path is not null and old.storage_path is distinct from new.storage_path then
    insert into public.orphaned_document_files (storage_path)
    values (old.storage_path)
    on conflict (storage_path) do nothing;
  end if;

  return null;
end;
$$;

revoke execute on function public.queue_replaced_document_file()
  from public, anon, authenticated;

create trigger documents_queue_replaced_file
  after update of storage_path on public.documents
  for each row
  execute function public.queue_replaced_document_file();


-- =============================================================================
-- I22: a picture's path is in its owner's folder
-- =============================================================================
-- src/lib/media.ts turns each of these columns into a public address by
-- putting it after the bucket's name, and the storage policies only ever let
-- a row's owner write into the folder named by the row's own id. The checks
-- say the same thing about the column, so a row cannot be pointed at another
-- person's, organisation's or conference's picture. The layout is
-- src/lib/server/profiles.ts, organizations.ts and conferences.ts's:
-- "avatars/<user id>/…", "organizations/<organisation id>/…" and
-- "conferences/<conference id>/…", with at least one character after the
-- folder. In LIKE, "_" stands for exactly one character.
--
-- "not valid" then "validate" checks the existing rows without taking the
-- long lock an ordinary add would; every seeded row already passes.

alter table public.profiles
  add constraint profiles_avatar_path_in_own_folder check (
    avatar_path is null or avatar_path like ('avatars/' || id::text || '/_%')
  ) not valid;
alter table public.profiles validate constraint profiles_avatar_path_in_own_folder;

alter table public.organizations
  add constraint organizations_logo_path_in_own_folder check (
    logo_path is null or logo_path like ('organizations/' || id::text || '/_%')
  ) not valid;
alter table public.organizations validate constraint organizations_logo_path_in_own_folder;

alter table public.conferences
  add constraint conferences_banner_path_in_own_folder check (
    banner_path is null or banner_path like ('conferences/' || id::text || '/_%')
  ) not valid;
alter table public.conferences validate constraint conferences_banner_path_in_own_folder;

alter table public.conferences
  add constraint conferences_logo_path_in_own_folder check (
    logo_path is null or logo_path like ('conferences/' || id::text || '/_%')
  ) not valid;
alter table public.conferences validate constraint conferences_logo_path_in_own_folder;

-- End of migration. Never edit this file once applied; write a new one.
