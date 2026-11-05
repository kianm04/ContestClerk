-- =============================================================================
-- The caucus clock (S7, D4)
-- =============================================================================
-- Contract: specs/02-architecture/data-model.md ("committee_state", "The caucus
-- clock") and specs/02-architecture/realtime.md ("Timer").
--
-- A moderated caucus has two clocks: the time left of the caucus as a whole,
-- and the time left of the speech under way. Until now both had to share the
-- three timer_* columns, so calling a speaker wrote the speaking time over the
-- caucus's total (07-delivery/findings.md). The caucus gets three columns of
-- its own, working exactly like the speaker's clock:
--
--   * caucus_total_seconds: the caucus's whole length, grown by each extension;
--   * caucus_ends_at: the moment the caucus runs out, while its clock runs;
--   * caucus_paused_remaining_seconds: the seconds left, while it is paused.
--
-- The caucus clock runs exactly while the speaker's clock runs, so the time
-- between speakers is not lost; every write that starts or stops the speaker's
-- clock in a moderated caucus writes both in the same update of the row. An
-- unmoderated caucus has no speakers and keeps its one clock in the timer_*
-- columns, as before.
--
-- The new columns sit on the row the room already listens to, so realtime
-- needs nothing new, and the update policy "A chair can run the room" already
-- covers every column of the row.
--
-- No backfill: a moderated caucus already running when this lands has had its
-- total written over by its speakers' clocks, so there is nothing true to copy.
-- Its caucus line stays empty until it ends.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.

alter table public.committee_state
  add column caucus_total_seconds integer,
  add column caucus_ends_at timestamptz,
  add column caucus_paused_remaining_seconds integer,

  -- The timer's own rule, said once more for the caucus clock: running or
  -- paused, never both, so no screen has to decide which column to believe.
  add constraint committee_state_caucus_clock_runs_or_is_paused check (
    caucus_ends_at is null or caucus_paused_remaining_seconds is null
  );

comment on column public.committee_state.caucus_total_seconds is
  'A moderated caucus''s total time, grown by each extension. Null outside a moderated caucus.';
comment on column public.committee_state.caucus_ends_at is
  'When the moderated caucus runs out, while its clock runs. Runs exactly while the speaker''s clock runs.';
comment on column public.committee_state.caucus_paused_remaining_seconds is
  'The seconds left of the moderated caucus while its clock is paused.';
