-- =============================================================================
-- Single speakers, and speakers who hold no seat (S9, D5)
-- =============================================================================
-- Contract: specs/02-architecture/data-model.md ("speakers_lists,
-- speakers_list_entries", "Single speakers and speakers with no seat") and
-- specs/02-architecture/permissions.md ("Speakers with no seat").
--
-- A single speaker is one person given the floor outside any list: a right of
-- reply, a presentation, the Secretary-General addressing the room. It runs on
-- a speakers list of its own, so the floor's clock, "Next" and "Also speaking"
-- work on it unchanged. This migration:
--
--   * adds speakers_lists.kind, which says what a list is for: the session's
--     General Speakers' List ('general'), a moderated caucus's list
--     ('caucus'), or a single speaker's ('single');
--   * adds speakers_lists.purpose, what a single speaker has the floor for;
--   * lets an entry name somebody with no seat: seat_id becomes nullable and
--     speaker_name holds a typed name instead, on a single speaker's list only;
--   * writes again the two entry policies that joined the entry's seat, which
--     an entry with no seat would fail.
--
-- The new 'single_speaker' mode was added by 20261001120000 on its own, because
-- a new enum value cannot be used in the transaction that adds it.
--
-- THE ONE CHANGE OF THE REDESIGN THAT IS NOT PURELY ADDITIVE
-- Everything that joined an entry to its seat was looked at (data-model.md
-- lists each). Only the insert and the update policy below joined seats; the
-- select and delete policies and "A chair can run the room" reach an entry
-- through its list, so a named speaker is read, removed and given the floor
-- like any other entry. No view and no database function joined the two
-- tables before this migration.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- speakers_lists.kind
-- -----------------------------------------------------------------------------
-- Until now a list with no motion was the General Speakers' List and a list
-- with one was a caucus's. A single speaker's list has no motion either, so a
-- missing motion no longer says which list it is, and the list says so itself.

create type public.speakers_list_kind as enum ('general', 'caucus', 'single');

-- Added with a default so the existing rows can be given a value, then
-- corrected from motion_id, the one thing that told them apart until now.
alter table public.speakers_lists
  add column kind public.speakers_list_kind not null default 'general';

update public.speakers_lists
set kind = 'caucus'
where motion_id is not null;

-- The default goes again, so every writer says which list it opens and none
-- can open a General Speakers' List by forgetting to.
alter table public.speakers_lists
  alter column kind drop default;

alter table public.speakers_lists
  -- A caucus's list always points at its motion, and nothing else does.
  add constraint speakers_lists_caucus_has_motion check (
    (kind = 'caucus') = (motion_id is not null)
  );

comment on column public.speakers_lists.kind is
  'What the list is for: the session''s General Speakers'' List, a moderated caucus''s list, or a single speaker''s.';

-- Every page asks for "the General Speakers' List of this session".
create index speakers_lists_session_kind_idx on public.speakers_lists (session_id, kind);


-- -----------------------------------------------------------------------------
-- speakers_lists.purpose
-- -----------------------------------------------------------------------------
-- "Right of reply", "Presentation", "Explanation of vote" or the chair's own
-- words, shown to the delegates and on the projector. Only a single speaker has
-- one. 200 characters is a motion topic's limit, the longest line the room
-- draws anywhere.

alter table public.speakers_lists
  add column purpose text,
  add constraint speakers_lists_purpose_only_on_single check (
    purpose is null or kind = 'single'
  ),
  add constraint speakers_lists_purpose_length check (
    char_length(purpose) <= 200
  );

comment on column public.speakers_lists.purpose is
  'What a single speaker has the floor for, such as "Right of reply". Null on every other list.';


-- -----------------------------------------------------------------------------
-- speakers_list_entries: a seat, or a typed name
-- -----------------------------------------------------------------------------
-- An entry is a seat or, on a single speaker's list only, the name of somebody
-- who holds no seat ("Secretary-General"). Exactly one of the two is set. That
-- a name stands only on a single speaker's list is the policies' rule below,
-- because a check constraint cannot read the list.
--
-- The foreign key keeps "on delete cascade": a named entry has no seat to
-- follow, and a seat's entries still go with it. speakers_list_entries_seat_id_idx
-- stays as it is.

alter table public.speakers_list_entries
  alter column seat_id drop not null;

alter table public.speakers_list_entries
  add column speaker_name text,
  add constraint speakers_list_entries_seat_or_name check (
    (seat_id is null) <> (speaker_name is null)
  ),
  -- A name nobody can read on the projector is not a name.
  add constraint speakers_list_entries_speaker_name_written check (
    speaker_name is null
    or (btrim(speaker_name) <> '' and char_length(speaker_name) <= 200)
  );

comment on column public.speakers_list_entries.speaker_name is
  'The typed name of a speaker who holds no seat, on a single speaker''s list only. Exactly one of seat_id and speaker_name is set.';


-- -----------------------------------------------------------------------------
-- The two entry policies that joined the seat, written again
-- -----------------------------------------------------------------------------
-- Both used to say "the seat is a seat of the list's committee" by joining
-- seats in their "with check" half. An entry with no seat finds no seat, so a
-- named speaker could never be added, called or finished. Each now says:
--
--   the list is one the caller chairs, and the entry either names a seat of the
--   list's committee, exactly as before, or names no seat and stands on a
--   single speaker's list.
--
-- So a chair can put a typed name on a single speaker's list and nowhere else,
-- and a seat of another committee on no list at all. The "using" half of the
-- update policy never joined the seat and is unchanged.

drop policy "A chair can add a seat of their own committee to a list"
  on public.speakers_list_entries;

create policy "A chair can add a seat of their own committee to a list"
  on public.speakers_list_entries
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.speakers_lists as list
      where list.id = speakers_list_entries.speakers_list_id
        and public.is_committee_chair(list.committee_id)
        and (
          (
            speakers_list_entries.seat_id is not null
            and exists (
              select 1
              from public.seats as seat
              where seat.id = speakers_list_entries.seat_id
                and seat.committee_id = list.committee_id
            )
          )
          or (speakers_list_entries.seat_id is null and list.kind = 'single')
        )
    )
  );

drop policy "A chair can reorder a list and move the turn on"
  on public.speakers_list_entries;

create policy "A chair can reorder a list and move the turn on"
  on public.speakers_list_entries
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.speakers_lists as list
      where list.id = speakers_list_entries.speakers_list_id
        and public.is_committee_chair(list.committee_id)
    )
  )
  with check (
    exists (
      select 1
      from public.speakers_lists as list
      where list.id = speakers_list_entries.speakers_list_id
        and public.is_committee_chair(list.committee_id)
        and (
          (
            speakers_list_entries.seat_id is not null
            and exists (
              select 1
              from public.seats as seat
              where seat.id = speakers_list_entries.seat_id
                and seat.committee_id = list.committee_id
            )
          )
          or (speakers_list_entries.seat_id is null and list.kind = 'single')
        )
    )
  );
