-- =============================================================================
-- Suspending and resuming the room (S11, D6)
-- =============================================================================
-- Contract: specs/02-architecture/data-model.md ("committee_state",
-- "Suspending and resuming") and specs/06-features/chairing.md ("Suspending
-- and ending").
--
-- Until now suspending only changed committee_state.mode, so the room could
-- not say when it would be back, and "Resume session" always went to formal
-- debate, ending a caucus that had been suspended. Three columns let the room
-- remember:
--
--   * suspended_at: when the room was suspended ("12 min so far");
--   * suspended_until: when it is due back ("Back at 14:00"), or null while the
--     chair has not said;
--   * mode_before_suspension: the mode "Resume session" puts back.
--
-- Suspending is one update of this row: the mode becomes 'suspended', the three
-- columns are written, and whichever clock is running is paused at the seconds
-- it has left. Everything else (the session, the motion, the list, the speaker,
-- the vote, the agenda) is kept. Resuming is one update too: the mode comes
-- back from mode_before_suspension and the three columns are cleared, with both
-- clocks still paused. Both are made by the app through the update policy "A
-- chair can run the room", which already covers every column of the row, so
-- there is no function and no new policy; apply_passed_motion (20261001120500)
-- suspends the same way for a passed suspend motion.
--
-- The reason shown ("Suspended for lunch") is not stored here. It is the topic
-- of the session's passed suspend motion whose decided_at equals suspended_at,
-- the one moment apply_passed_motion writes into both.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.

alter table public.committee_state
  add column suspended_at timestamptz,
  add column suspended_until timestamptz,
  add column mode_before_suspension public.committee_mode;

comment on column public.committee_state.suspended_at is
  'When the room was suspended. Set exactly while mode is suspended.';
comment on column public.committee_state.suspended_until is
  'When the suspended room is due back, or null while the chair has not said.';
comment on column public.committee_state.mode_before_suspension is
  'The mode "Resume session" puts back. Set exactly while mode is suspended.';

-- A room already suspended when this lands is given the two columns the check
-- below insists on. updated_at is the closest moment to when it was suspended
-- that the row knows, and formal debate is where resuming would have taken it
-- before this migration. (The set_updated_at trigger then moves updated_at on,
-- which is true: the row has just changed.)
update public.committee_state
set suspended_at = updated_at,
    mode_before_suspension = 'formal_debate'
where mode = 'suspended';

-- The suspension belongs to a suspended room and to nothing else, said once in
-- the database rather than in every screen that reads it:
--
--   * suspended_at and mode_before_suspension are set exactly while the mode is
--     'suspended', so a resumed room can never carry a stale return time;
--   * suspended_until is only set beside suspended_at;
--   * the mode put back is never 'idle' (a suspended room has a session) or
--     'suspended' (resuming must leave the suspension).
alter table public.committee_state
  add constraint committee_state_suspension_matches_mode check (
    (mode = 'suspended') = (suspended_at is not null)
    and (mode = 'suspended') = (mode_before_suspension is not null)
    and (suspended_until is null or suspended_at is not null)
    and (mode_before_suspension is null or mode_before_suspension not in ('idle', 'suspended'))
  );
