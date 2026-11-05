-- =============================================================================
-- The sponsors' answers to an amendment, heard as they arrive
-- =============================================================================
-- docs/committee-papers.md, step 7: the proposer of an amendment sees the
-- sponsors' answers arrive. Each sponsor's "Accept" is a row of
-- amendment_seats, and until the last sponsor accepts nothing changes on
-- the amendment's own row, so a page listening only to amendments heard
-- nothing until the end. The same holds for a seat's support of an
-- unfriendly amendment until it reaches the committee's setting.
--
-- So amendment_seats joins the realtime publication. Realtime applies the
-- table's select policy to every listener, which lets only those who may
-- read the draft hear its amendments' answers. A delete carries only the
-- primary key, the amendment's id, the seat's and the role, which say
-- nothing about the draft, and amendment_seats rows are deleted only with
-- their amendment or their seat.

-- Only when it is not there already. The local database is shared between
-- worktrees, and a migration applied there by hand before its branch is
-- merged must not fail when `migration up` runs it again.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'amendment_seats'
  ) then
    alter publication supabase_realtime add table public.amendment_seats;
  end if;
end;
$$;

-- This file is never edited once applied: a change is a new migration.
