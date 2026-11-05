-- T96: a file whose `documents` row is deleted is removed from the bucket too.
--
-- `seats_clear_position_paper` deletes a position paper's row whenever a seat
-- changes hands, and `revoke_seat` deletes it itself, but neither can reach
-- into Storage: a file in a bucket is removed through the Storage API, not by
-- SQL. Nor can the person who emptied the seat remove it with their own
-- client. A delegation head is not allowed to see a delegate's paper at all,
-- and by the time the seat is empty the row the storage select policy asks
-- about is already gone for everybody.
--
-- So the database writes down which file lost its row, here, and the app
-- removes it with the service role afterwards (`removeOrphanedDocumentFiles`
-- in client/src/lib/server/orphaned-document-files.ts). See
-- specs/02-architecture/storage.md, "Files whose row is deleted".

create table public.orphaned_document_files (
  -- The path in the `documents` bucket, exactly as `documents.storage_path`
  -- held it. Every path carries a fresh uuid, so it is never used again.
  storage_path text primary key,
  orphaned_at timestamptz not null default now()
);

comment on table public.orphaned_document_files is
  'Files in the documents bucket whose documents row has been deleted, waiting for the app to remove them with the service role.';

-- Row Level Security with no policies at all: nobody signed in may read the
-- list, because a path would lead straight to a file they were never shown,
-- and nobody may write it, because only the trigger below decides what goes
-- in. The service role ignores Row Level Security, and that is who empties it.
alter table public.orphaned_document_files enable row level security;

revoke all on table public.orphaned_document_files from anon, authenticated;

-- Queues the file of every `documents` row that is deleted, whatever deleted
-- it: a seat changing hands, `revoke_seat`, a delegate removing their own
-- paper, an organiser deleting a resource, or a cascade from a deleted
-- committee or conference. Where the app already removed the file itself, the
-- sweep finds nothing there and removing nothing is not an error.
--
-- It is security definer because the person whose statement deleted the row
-- may not write to this table; that is the point of the table.
create or replace function public.queue_orphaned_document_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.orphaned_document_files (storage_path)
  values (old.storage_path)
  on conflict (storage_path) do nothing;

  return old;
end;
$$;

revoke execute on function public.queue_orphaned_document_file()
  from public, anon, authenticated;

create trigger documents_queue_orphaned_file
  after delete on public.documents
  for each row
  execute function public.queue_orphaned_document_file();
