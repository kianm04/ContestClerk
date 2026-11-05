-- =============================================================================
-- The session redesign: two new enum values (S6 D3, S9 D5)
-- =============================================================================
-- Contract: specs/02-architecture/data-model.md ("Enums", "motions",
-- "Single speakers and speakers with no seat") and
-- specs/03-design/session-redesign/build-plan.md ("Data model changes").
--
--   * motion_status gains 'dropped' (D3): a motion still on the floor when
--     another one passes, or when the chair clears the floor, is dropped rather
--     than failed, so the record says nobody voted on it.
--   * committee_mode gains 'single_speaker' (D5): one speaker has the floor
--     outside any list, for a right of reply or a presentation.
--
-- WHY THESE TWO LINES HAVE A FILE OF THEIR OWN
-- A value added with "alter type ... add value" cannot be used in the
-- transaction that adds it: Postgres refuses to write it into a row, a check or
-- a default until the transaction has committed. Every migration file runs in
-- one transaction, so the migrations after this one, which write both values,
-- could not live in the same file. data-model.md's conventions say the same.
--
-- "if not exists" makes a second run harmless, which matters for a database
-- that already has the value from a hand-made experiment.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.

alter type public.motion_status add value if not exists 'dropped';

alter type public.committee_mode add value if not exists 'single_speaker';
