-- =============================================================================
-- Motions started without a vote (S6, D3)
-- =============================================================================
-- Contract: specs/02-architecture/data-model.md ("motions") and
-- specs/05-pages/chair/motions.md.
--
-- The redesign lets a chair start a moderated or unmoderated caucus straight
-- from its own view, without putting it to the vote first (the "direct route",
-- mod.md and unmod.md). The caucus is still written down as a motion, so the
-- session record lists it, but a motion that nobody voted on must never read as
-- voted. This column is how the record tells the two apart: "started without a
-- vote" where a voted motion shows its count.
--
-- Dropping a motion (the other half of D3) needs no column: it is the new
-- 'dropped' status from the previous migration, with decided_at set, and the
-- existing update policy "A chair can decide or withdraw a motion" already lets
-- a chair write both. Putting a dropped motion back ("Undo", "Restore") is the
-- same update the other way, so D3 adds no policy at all.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.

alter table public.motions
  add column started_without_vote boolean not null default false;

comment on column public.motions.started_without_vote is
  'True for a caucus the chair started from its own view without a vote, so the record never shows it as voted.';
