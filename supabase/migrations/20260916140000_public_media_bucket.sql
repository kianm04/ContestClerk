-- =============================================================================
-- Migration 0004: the public-media storage bucket
-- =============================================================================
--
-- WHAT THIS IS
-- Task T09 in specs/07-delivery/tasks.md. specs/02-architecture/storage.md asks
-- for two buckets. This file makes the first one, public-media, which holds the
-- pictures anybody is allowed to look at: avatars, organisation logos, and
-- conference logos and banners. This file:
--
--   * creates the bucket, public, 5 MB, JPEG, PNG and WebP only
--   * adds may_write_public_media, which reads the folder a path starts with
--     and says whether the signed-in person owns that folder
--   * adds the four storage.objects policies for the bucket: anybody may read,
--     and only the owner of the folder may add, replace or remove
--
-- HOW A PATH DECIDES WHO OWNS A FILE
-- Every path in this bucket is "<folder>/<id>/<file name>", and the id is the
-- whole rule:
--
--   avatars/<user id>/<uuid>.<ext>              the person themselves
--   organizations/<organization id>/logo-…      an owner or admin of it
--   conferences/<conference id>/banner-…        anybody who manages it
--
-- The file name always ends in a fresh uuid, so replacing a picture never
-- serves a stale cached copy and the old object is deleted by the app
-- afterwards.
--
-- IT ALSO REPAIRS ACCOUNTS OLDER THAN THE TRIGGER
-- handle_new_user has written a profiles and a profile_details row for every
-- new account since migration 0002, but nothing ever wrote them for the
-- accounts that existed before it. Until this task those accounts merely had no
-- name in the top bar; now that every signed-in page sends somebody with no
-- onboarding_completed_at to /welcome, and /welcome cannot read a row that is
-- not there, they would be shut out of the app altogether. The backfill at the
-- end of this file gives every account its two rows.


-- WHAT IS NOT HERE, ON PURPOSE
-- The private documents bucket, which needs the documents table and its select
-- policy to guard it, so it arrives with them. No sample pictures are uploaded
-- either; T56 does that, because it is the task that shows them.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- The bucket
-- -----------------------------------------------------------------------------
-- "public" means the bytes are served from a plain address with no Supabase
-- call and no expiry, which is what lets a component show a picture without a
-- client. src/lib/media.ts builds that address.
--
-- The size and type limits are enforced by Storage itself, before a byte is
-- written. The form actions check the same two things first so that somebody
-- who picks the wrong file gets a sentence rather than a failed upload.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'public-media',
  'public-media',
  true,
  5242880, -- 5 MB, written out in bytes because that is what the column holds
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- may_write_public_media
-- -----------------------------------------------------------------------------
-- Whether the signed-in person may add, replace or remove the file at this
-- path. All four policies below ask it, rather than repeating the same three
-- branches four times.
--
-- It is "security definer" like every other helper in permissions.md, although
-- it reads no table of its own: the two branches below ask helpers that are
-- security definer themselves, so this changes nothing except that the rule
-- "every policy helper is security definer" stays true without an exception.
--
-- "storage.foldername(path)" is Storage's own helper. It cuts a path into its
-- folders, so 'avatars/7f3c…/a1b2.jpg' gives the array {avatars, 7f3c…}; the
-- file name itself is not in it.

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
    return public.can_manage_conference(owner_id);
  end if;

  -- A folder we have never heard of. Nobody owns it, so nobody may write it.
  return false;
end;
$$;

grant execute on function public.may_write_public_media(text) to authenticated;


-- -----------------------------------------------------------------------------
-- Policies on storage.objects
-- -----------------------------------------------------------------------------
-- Row Level Security is already on for storage.objects; Supabase turns it on
-- when the project is created. Each policy names the bucket, because every
-- bucket in the project shares this one table.

create policy "Anybody may read public media"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'public-media');

create policy "People may add public media to their own folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'public-media'
    and public.may_write_public_media(name)
  );

-- Replacing a file is an update of the row and needs both halves: "using" picks
-- the rows that may be changed, "with check" says what they may be changed into,
-- so a file cannot be renamed into somebody else's folder.
create policy "People may replace public media in their own folder"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'public-media'
    and public.may_write_public_media(name)
  )
  with check (
    bucket_id = 'public-media'
    and public.may_write_public_media(name)
  );

create policy "People may delete public media from their own folder"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'public-media'
    and public.may_write_public_media(name)
  );


-- -----------------------------------------------------------------------------
-- The backfill
-- -----------------------------------------------------------------------------
-- One row per account that has none, with the same values handle_new_user uses
-- for a new one: the name from the sign up form if it is there, and the address
-- the account signs in with. Both inserts are "on conflict do nothing", so
-- running this migration on a database where every account already has its rows
-- changes nothing, and both read auth.users, which only a migration may do.
--
-- onboarding_completed_at is deliberately left null: these people have never
-- answered the welcome form, so they should see it once, like everybody else.

insert into public.profiles (id, full_name)
select id, coalesce(raw_user_meta_data ->> 'full_name', '')
from auth.users
on conflict (id) do nothing;

insert into public.profile_details (user_id, email)
select id, coalesce(email, '')
from auth.users
on conflict (user_id) do nothing;
