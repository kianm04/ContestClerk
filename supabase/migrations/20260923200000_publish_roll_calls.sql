-- =============================================================================
-- Publish roll_calls to realtime
-- =============================================================================
-- Contract: specs/02-architecture/realtime.md ("Tables published").
--
-- A roll call starts with a new roll_calls row. The room's channel filters
-- roll_call_entries on the latest roll call it was given, so a roll call
-- started on another screen was heard only with the next change to another
-- published table (the T41 decision in 07-delivery/open-questions.md).
-- Publishing roll_calls lets the channel listen for it directly, filtered on
-- the current session_id, and read the room again.
--
-- Row Level Security applies to realtime messages: the roll_calls select
-- policy asks whether the reader can see the roll call's session, so nobody
-- hears a roll call of a committee they cannot read. No replica identity full
-- is needed, for the reason the first publication migration gives: nothing in
-- the room is deleted while somebody is watching.

alter publication supabase_realtime add table public.roll_calls;
