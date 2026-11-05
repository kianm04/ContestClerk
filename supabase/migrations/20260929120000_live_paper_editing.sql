-- =============================================================================
-- Live co-editing of position papers (T148)
-- =============================================================================
-- T147 let the members of a delegation work on each other's position paper
-- drafts, one save at a time. T148 lets them type in the same draft at once
-- and see each other's typing, cursors and faces as it happens.
--
-- The editor keeps the paper as a Yjs document, a structure that lets two
-- people's changes be merged in any order and always come out the same
-- (`specs/02-architecture/stack.md`). Browsers editing one paper send those
-- changes to each other over a private Supabase Realtime broadcast channel,
-- `paper:<seat id>` (`specs/02-architecture/realtime.md`).
--
-- 1. position_paper_drafts.document_state, the Yjs document itself, stored
--    beside the Markdown. The server merges every save into it and writes
--    the Markdown from the merged result, so body_markdown stays what
--    submitting, reviewing and word counts read.
--
-- 2. may_join_paper_channel(topic), and two policies on realtime.messages
--    that ask it. A private channel is only joined, heard and spoken on by
--    somebody may_edit_paper_draft (T147) lets work on the seat's draft.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- position_paper_drafts.document_state
-- -----------------------------------------------------------------------------
-- Null for a draft saved before T148: the next live save starts the
-- document from body_markdown. Every draft started since stores it from its
-- first save, and a save without JavaScript writes its text into it. The limit keeps
-- a save well inside what one request may carry; a paper at the 100 000
-- character limit takes a fraction of it.

alter table public.position_paper_drafts
  add column document_state bytea,
  add constraint position_paper_drafts_document_state_size
    check (octet_length(document_state) <= 1000000);

comment on column public.position_paper_drafts.document_state is
  'The draft as a Yjs document, merged on every save. body_markdown is written from it.';


-- -----------------------------------------------------------------------------
-- may_join_paper_channel
-- -----------------------------------------------------------------------------
-- True when topic is `paper:` followed by a seat id and the signed-in user
-- may work on that seat's draft. Any other topic is false, and is checked
-- before the id is read as a uuid, so a mistyped topic is refused rather than
-- raising an error.

create or replace function public.may_join_paper_channel(topic text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when topic ~ '^paper:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.may_edit_paper_draft(substr(topic, 7)::uuid)
    else false
  end;
$$;

revoke execute on function public.may_join_paper_channel(text) from public, anon;
grant execute on function public.may_join_paper_channel(text) to authenticated;


-- -----------------------------------------------------------------------------
-- realtime.messages: who may hear and speak on a paper's channel
-- -----------------------------------------------------------------------------
-- Realtime Authorization reads these policies when a browser joins a private
-- channel: select decides whether it may join and hear what is sent, insert
-- whether it may send. realtime.topic() is the channel being joined. Public
-- channels, such as the committee room's, never read them.
--
-- Broadcast carries the document's changes, the cursors and who is in the
-- paper. Presence and database changes are not used on these channels.

create policy "The delegation can hear a paper's live channel"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and public.may_join_paper_channel((select realtime.topic()))
  );

create policy "The delegation can speak on a paper's live channel"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and public.may_join_paper_channel((select realtime.topic()))
  );
