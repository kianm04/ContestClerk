-- =============================================================================
-- Migration 0014: the committee room and awards
-- =============================================================================
--
-- WHAT THIS IS
-- Task T39 in specs/07-delivery/tasks.md, the shared schema of milestone M6,
-- "Committee room". The pages that read and write these tables are T40 to T48;
-- this file is everything they stand on. It:
--
--   * creates the nine tables of the "Committee room" section of
--     specs/02-architecture/data-model.md: committee_sessions, roll_calls,
--     roll_call_entries, motions, speakers_lists, speakers_list_entries,
--     votes, vote_entries and committee_state, plus chair_notes
--   * creates awards, with the propose-confirm-publish flow of
--     specs/06-features/awards.md
--   * adds create_committee_state, the trigger T21's committee editor has been
--     waiting for, and backfills the row for every committee that already
--     exists
--   * adds the three rules awards needs that a policy cannot say on its own:
--     guard_award_insert, protect_awards_columns and freeze_award_user
--   * adds notify_awards_published, the last of the notify_* triggers
--   * puts the seven tables of specs/02-architecture/realtime.md into the
--     supabase_realtime publication
--
-- WHY THE TABLES ARE IN THIS ORDER
-- committee_state points at a session, a motion, a speakers list, a speakers
-- list entry and a vote, and nothing points back at it, so it is created after
-- all five rather than second, where the data model lists it. The data model's
-- own preamble says its tables are "in dependency order"; this is that same
-- order read one level deeper.
--
-- WHERE A ROW'S COMMITTEE HAS TO MATCH
-- Most of these tables name something that belongs to a committee: a session, a
-- motion, a speakers list, a seat. A chair of one committee must not be able to
-- put another committee's seat on their speakers list, or hang their motion off
-- another committee's session. That rule is written into the insert and update
-- policies here rather than into a check_*_scope trigger of its own, the way
-- T34 wrote it for documents and announcements, for two reasons. A policy's
-- "with check" half runs on an insert and on an update alike, so one sentence
-- covers both. And the rule is the same question the policy is already asking
-- -- "is this row yours?" -- so keeping it in the policy means a reader sees
-- the whole answer in one place instead of two. The sub-selects those policies
-- make run under the caller's own Row Level Security, which is what makes them
-- short: "you may write an entry of a list you may write" needs no second copy
-- of who may write a list. specs/02-architecture/permissions.md and the
-- database tests in client/tests/db/committee-room.test.ts spell out each case.
--
-- WHAT IS NOT HERE, ON PURPOSE
-- No seeded session, roll call, motion, vote or award. supabase/seed.sql runs
-- as "postgres" with nobody signed in, and every write here belongs to a chair;
-- T34 made the same choice for announcements and said why. The page tasks make
-- their rows through the real forms, which is what
-- specs/02-architecture/testing.md asks of a browser test anyway. The one
-- exception is committee_state, which no chair writes: the seeded committees
-- get theirs from create_committee_state like every other committee.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- =============================================================================
-- committee_sessions
-- =============================================================================
-- A block of committee time. specs/06-features/chairing.md: the chair starts
-- one, and every roll call, motion, vote and speakers list belongs to it, so a
-- new day starts clean while the history stays.

create table public.committee_sessions (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees (id) on delete cascade,
  name text not null,
  status public.session_status not null default 'scheduled',
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.committee_sessions is
  'One block of committee time. Everything that happens in the room belongs to a session.';

-- Every page in the room asks for the sessions of one committee, newest first.
create index committee_sessions_committee_created_idx
  on public.committee_sessions (committee_id, created_at desc);

create trigger committee_sessions_set_updated_at
  before update on public.committee_sessions
  for each row
  execute function public.set_updated_at();

alter table public.committee_sessions enable row level security;


-- -----------------------------------------------------------------------------
-- committee_sessions: who may read and write
-- -----------------------------------------------------------------------------
-- The "deleg., staff" read and the "chair" write of the committee room rows of
-- specs/02-architecture/permissions.md. is_committee_chair is true for a chair
-- of the committee and for anybody who can manage its conference, so the write
-- policies below cover the organiser as well.
--
-- The conference id of a committee is looked up with a sub-select, as
-- permissions.md asks, and seats_committee_position_idx is not the index that
-- serves it: committees.id is the primary key.

create policy "A committee's delegates can read its sessions"
  on public.committee_sessions
  for select
  to authenticated
  using (public.is_committee_delegate(committee_id));

create policy "The conference team can read a committee's sessions"
  on public.committee_sessions
  for select
  to authenticated
  using (
    public.is_conference_staff(
      (select committee.conference_id from public.committees as committee where committee.id = committee_sessions.committee_id)
    )
  );

create policy "A chair can start a session"
  on public.committee_sessions
  for insert
  to authenticated
  with check (public.is_committee_chair(committee_id));

create policy "A chair can change a session"
  on public.committee_sessions
  for update
  to authenticated
  using (public.is_committee_chair(committee_id))
  with check (public.is_committee_chair(committee_id));

-- A session that has begun is a record of what happened, so only one that is
-- still "scheduled" can be removed. permissions.md: "chair, while scheduled".
create policy "A chair can remove a session that has not started"
  on public.committee_sessions
  for delete
  to authenticated
  using (public.is_committee_chair(committee_id) and status = 'scheduled');


-- =============================================================================
-- roll_calls, roll_call_entries
-- =============================================================================
-- Who is in the room. specs/06-features/chairing.md: a later roll call in the
-- same session replaces the earlier one as the current attendance, and the
-- present seats drive quorum and every majority.
--
-- The data model names this table's own moment taken_at, so there is no
-- created_at beside it: the two would hold the same value under two names.

create table public.roll_calls (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.committee_sessions (id) on delete cascade,
  -- The chair who took it, defaulted and then pinned to the caller by the
  -- policies below, the way chair_notes.author_id and awards.created_by are. A
  -- column that says who recorded the attendance is worth nothing if any chair
  -- can write somebody else's name into it -- including the name of the
  -- delegate they are marking absent.
  --
  -- Cascading with the account is the convention in data-model.md, and it is
  -- worth saying out loud what it costs here: a chair who deletes their account
  -- takes the attendance they recorded with them.
  taken_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  taken_at timestamptz not null default now()
);

comment on table public.roll_calls is
  'One roll call of one session. The latest of a session is that session''s current attendance.';

-- "The latest roll call of this session", which is how every count in the room
-- starts.
create index roll_calls_session_taken_idx
  on public.roll_calls (session_id, taken_at desc);
create index roll_calls_taken_by_idx on public.roll_calls (taken_by);

alter table public.roll_calls enable row level security;

-- Reading a roll call is the same question as reading its session, and writing
-- one is the same question as writing the session it belongs to. The sub-select
-- runs under the reader's own Row Level Security, so the policies above decide
-- it and the rule is written once rather than twice -- the same shape T34 used
-- for the documents bucket's storage policies.

create policy "You can read a roll call if you can read its session"
  on public.roll_calls
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.committee_sessions as session
      where session.id = roll_calls.session_id
    )
  );

create policy "A chair can take a roll call"
  on public.roll_calls
  for insert
  to authenticated
  with check (
    taken_by = (select auth.uid())
    and exists (
      select 1
      from public.committee_sessions as session
      where session.id = roll_calls.session_id
        and public.is_committee_chair(session.committee_id)
    )
  );

-- A co-chair correcting a roll call becomes the chair it is recorded against,
-- because the same rule applies on the way in: whoever wrote this row is who it
-- says took the attendance. That is more honest than keeping a name beside
-- numbers somebody else changed.
create policy "A chair can change a roll call"
  on public.roll_calls
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.committee_sessions as session
      where session.id = roll_calls.session_id
        and public.is_committee_chair(session.committee_id)
    )
  )
  with check (
    taken_by = (select auth.uid())
    and exists (
      select 1
      from public.committee_sessions as session
      where session.id = roll_calls.session_id
        and public.is_committee_chair(session.committee_id)
    )
  );

create policy "A chair can remove a roll call"
  on public.roll_calls
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.committee_sessions as session
      where session.id = roll_calls.session_id
        and public.is_committee_chair(session.committee_id)
    )
  );


-- One line of a roll call: this seat was absent, present, or present and
-- voting. There is no id column, because the pair of ids is the row's identity,
-- the way committee_chairs is keyed.

create table public.roll_call_entries (
  roll_call_id uuid not null references public.roll_calls (id) on delete cascade,
  seat_id uuid not null references public.seats (id) on delete cascade,
  status public.attendance_status not null,
  created_at timestamptz not null default now(),

  primary key (roll_call_id, seat_id)
);

comment on table public.roll_call_entries is
  'One seat''s attendance in one roll call. "present_and_voting" seats cannot abstain in a substantive vote.';

create index roll_call_entries_seat_id_idx on public.roll_call_entries (seat_id);

alter table public.roll_call_entries enable row level security;

create policy "You can read a roll call entry if you can read its roll call"
  on public.roll_call_entries
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.roll_calls as roll_call
      where roll_call.id = roll_call_entries.roll_call_id
    )
  );

-- The seat has to be a seat of the committee whose session this roll call
-- belongs to. Without that half, a chair could mark another committee's
-- delegate present and their name would appear in the wrong room.

create policy "A chair can mark a seat of their own committee"
  on public.roll_call_entries
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.roll_calls as roll_call
      join public.committee_sessions as session on session.id = roll_call.session_id
      join public.seats as seat on seat.id = roll_call_entries.seat_id
      where roll_call.id = roll_call_entries.roll_call_id
        and seat.committee_id = session.committee_id
        and public.is_committee_chair(session.committee_id)
    )
  );

create policy "A chair can change a mark"
  on public.roll_call_entries
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.roll_calls as roll_call
      join public.committee_sessions as session on session.id = roll_call.session_id
      where roll_call.id = roll_call_entries.roll_call_id
        and public.is_committee_chair(session.committee_id)
    )
  )
  with check (
    exists (
      select 1
      from public.roll_calls as roll_call
      join public.committee_sessions as session on session.id = roll_call.session_id
      join public.seats as seat on seat.id = roll_call_entries.seat_id
      where roll_call.id = roll_call_entries.roll_call_id
        and seat.committee_id = session.committee_id
        and public.is_committee_chair(session.committee_id)
    )
  );

create policy "A chair can take a mark off again"
  on public.roll_call_entries
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.roll_calls as roll_call
      join public.committee_sessions as session on session.id = roll_call.session_id
      where roll_call.id = roll_call_entries.roll_call_id
        and public.is_committee_chair(session.committee_id)
    )
  );


-- =============================================================================
-- motions
-- =============================================================================
-- What a delegate, or the chair, asks the committee to do.
-- specs/06-features/chairing.md orders several proposed motions "most
-- disruptive first"; that ranking is pure logic and lives in
-- src/lib/committee-room.ts (task T40), not here, because it changes with the
-- rules of procedure and not with the data.
--
-- A failed or withdrawn motion stays listed for the record, which is why
-- status has four values and nothing deletes a decided one.

create table public.motions (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees (id) on delete cascade,
  session_id uuid not null references public.committee_sessions (id) on delete cascade,
  -- Null means the chair proposed it, which is how a chair-initiated caucus or
  -- an adjournment is written. specs/06-features/chairing.md names that case.
  proposed_by_seat_id uuid references public.seats (id) on delete cascade,
  kind public.motion_kind not null,
  topic text,
  total_time_seconds integer,
  speaking_time_seconds integer,
  status public.motion_status not null default 'proposed',
  votes_for integer,
  votes_against integer,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.motions is
  'A motion of one session: proposed, then passed, failed or withdrawn. Failed ones stay for the record.';

-- The room reads the motions of the current session, newest first, and the
-- overview page reads the motions of the committee.
create index motions_session_created_idx on public.motions (session_id, created_at desc);
create index motions_committee_id_idx on public.motions (committee_id);
create index motions_proposed_by_seat_id_idx on public.motions (proposed_by_seat_id);

alter table public.motions enable row level security;

create policy "A committee's delegates can read its motions"
  on public.motions
  for select
  to authenticated
  using (public.is_committee_delegate(committee_id));

create policy "The conference team can read a committee's motions"
  on public.motions
  for select
  to authenticated
  using (
    public.is_conference_staff(
      (select committee.conference_id from public.committees as committee where committee.id = motions.committee_id)
    )
  );

-- The session and the proposing seat both have to belong to this committee. A
-- motion hung off another committee's session would appear in this room and in
-- that committee's history at the same time, and a motion proposed by another
-- committee's seat would name a delegate who is not in the room.

create policy "A chair can write down a motion"
  on public.motions
  for insert
  to authenticated
  with check (
    public.is_committee_chair(committee_id)
    and exists (
      select 1
      from public.committee_sessions as session
      where session.id = motions.session_id
        and session.committee_id = motions.committee_id
    )
    and (
      motions.proposed_by_seat_id is null
      or exists (
        select 1
        from public.seats as seat
        where seat.id = motions.proposed_by_seat_id
          and seat.committee_id = motions.committee_id
      )
    )
  );

create policy "A chair can decide or withdraw a motion"
  on public.motions
  for update
  to authenticated
  using (public.is_committee_chair(committee_id))
  with check (
    public.is_committee_chair(committee_id)
    and exists (
      select 1
      from public.committee_sessions as session
      where session.id = motions.session_id
        and session.committee_id = motions.committee_id
    )
    and (
      motions.proposed_by_seat_id is null
      or exists (
        select 1
        from public.seats as seat
        where seat.id = motions.proposed_by_seat_id
          and seat.committee_id = motions.committee_id
      )
    )
  );

create policy "A chair can remove a motion"
  on public.motions
  for delete
  to authenticated
  using (public.is_committee_chair(committee_id));


-- =============================================================================
-- speakers_lists, speakers_list_entries
-- =============================================================================
-- The General Speakers' List is created with the session and has no motion. A
-- moderated caucus creates one of its own when its motion passes, with that
-- caucus's speaking time, which is why motion_id is nullable rather than the
-- list being told apart by its name.

create table public.speakers_lists (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees (id) on delete cascade,
  session_id uuid not null references public.committee_sessions (id) on delete cascade,
  -- Null for the General Speakers' List.
  motion_id uuid references public.motions (id) on delete cascade,
  name text not null,
  -- Seconds each speaker gets. The session's first list takes the committee's
  -- default_speaking_time_seconds; a caucus takes the one its motion asked for.
  speaking_time_seconds integer not null,
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.speakers_lists is
  'One speakers list: the General Speakers List of a session, or the list a moderated caucus runs on.';

create index speakers_lists_session_created_idx
  on public.speakers_lists (session_id, created_at desc);
create index speakers_lists_committee_id_idx on public.speakers_lists (committee_id);
create index speakers_lists_motion_id_idx on public.speakers_lists (motion_id);

alter table public.speakers_lists enable row level security;

create policy "A committee's delegates can read its speakers lists"
  on public.speakers_lists
  for select
  to authenticated
  using (public.is_committee_delegate(committee_id));

create policy "The conference team can read a committee's speakers lists"
  on public.speakers_lists
  for select
  to authenticated
  using (
    public.is_conference_staff(
      (select committee.conference_id from public.committees as committee where committee.id = speakers_lists.committee_id)
    )
  );

create policy "A chair can open a speakers list"
  on public.speakers_lists
  for insert
  to authenticated
  with check (
    public.is_committee_chair(committee_id)
    and exists (
      select 1
      from public.committee_sessions as session
      where session.id = speakers_lists.session_id
        and session.committee_id = speakers_lists.committee_id
    )
    and (
      speakers_lists.motion_id is null
      or exists (
        select 1
        from public.motions as motion
        where motion.id = speakers_lists.motion_id
          and motion.committee_id = speakers_lists.committee_id
      )
    )
  );

create policy "A chair can close a speakers list"
  on public.speakers_lists
  for update
  to authenticated
  using (public.is_committee_chair(committee_id))
  with check (
    public.is_committee_chair(committee_id)
    and exists (
      select 1
      from public.committee_sessions as session
      where session.id = speakers_lists.session_id
        and session.committee_id = speakers_lists.committee_id
    )
    and (
      speakers_lists.motion_id is null
      or exists (
        select 1
        from public.motions as motion
        where motion.id = speakers_lists.motion_id
          and motion.committee_id = speakers_lists.committee_id
      )
    )
  );

create policy "A chair can remove a speakers list"
  on public.speakers_lists
  for delete
  to authenticated
  using (public.is_committee_chair(committee_id));


-- One seat's turn on one list. Removing a speaker is a change of status to
-- "removed" rather than a delete, so the record of who was on the list stays
-- and so a delegate's screen hears about it as an ordinary update.

create table public.speakers_list_entries (
  id uuid primary key default gen_random_uuid(),
  speakers_list_id uuid not null references public.speakers_lists (id) on delete cascade,
  seat_id uuid not null references public.seats (id) on delete cascade,
  position integer not null default 0,
  status public.speaker_status not null default 'waiting',
  started_at timestamptz,
  finished_at timestamptz,
  -- How long the seat actually spoke, written when the chair moves on. A yield
  -- to the chair ends a turn early, so this is not the list's speaking time.
  spoke_seconds integer,
  created_at timestamptz not null default now()
);

comment on table public.speakers_list_entries is
  'One seat''s turn on a speakers list, in position order. "removed" is how a speaker is taken off.';

-- The list is always read in speaking order.
create index speakers_list_entries_list_position_idx
  on public.speakers_list_entries (speakers_list_id, position);
create index speakers_list_entries_seat_id_idx on public.speakers_list_entries (seat_id);

alter table public.speakers_list_entries enable row level security;

create policy "You can read a speakers list entry if you can read its list"
  on public.speakers_list_entries
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.speakers_lists as list
      where list.id = speakers_list_entries.speakers_list_id
    )
  );

create policy "A chair can add a seat of their own committee to a list"
  on public.speakers_list_entries
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.speakers_lists as list
      join public.seats as seat on seat.id = speakers_list_entries.seat_id
      where list.id = speakers_list_entries.speakers_list_id
        and seat.committee_id = list.committee_id
        and public.is_committee_chair(list.committee_id)
    )
  );

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
      join public.seats as seat on seat.id = speakers_list_entries.seat_id
      where list.id = speakers_list_entries.speakers_list_id
        and seat.committee_id = list.committee_id
        and public.is_committee_chair(list.committee_id)
    )
  );

create policy "A chair can take a seat off a list"
  on public.speakers_list_entries
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.speakers_lists as list
      where list.id = speakers_list_entries.speakers_list_id
        and public.is_committee_chair(list.committee_id)
    )
  );


-- =============================================================================
-- votes, vote_entries
-- =============================================================================
-- Both the procedural vote that decides a motion and the substantive vote on a
-- draft resolution. specs/06-features/chairing.md: a show of hands is the chair
-- typing two or three counts, and a roll call vote is one row per present seat
-- in vote_entries.
--
-- The counts and "passed" stay null until the vote is closed, which is what
-- makes an open vote and a closed one tell themselves apart without a second
-- column. opened_at is this table's own created_at, the way taken_at is
-- roll_calls'.

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees (id) on delete cascade,
  session_id uuid not null references public.committee_sessions (id) on delete cascade,
  kind public.vote_kind not null,
  -- Free text in MVP, "Draft Resolution 1.1". Real draft resolutions are
  -- Phase 2, which is what document_id is waiting for.
  subject text,
  document_id uuid references public.documents (id) on delete set null,
  -- Set on the procedural vote that decides a motion.
  motion_id uuid references public.motions (id) on delete set null,
  method public.vote_method not null default 'show_of_hands',
  majority public.majority_type not null default 'simple',
  status public.vote_status not null default 'open',
  votes_for integer,
  votes_against integer,
  votes_abstain integer,
  passed boolean,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,

  -- A vote has to say what it is about, one way or another. The data model
  -- marks none of the three not null, because each of them is empty in some
  -- vote: a procedural vote points at its motion and types no subject, and a
  -- substantive one types a subject because MVP has no document to point at.
  -- A vote with none of the three is a row no screen could draw.
  constraint votes_says_what_it_is_about check (
    subject is not null or motion_id is not null or document_id is not null
  )
);

comment on table public.votes is
  'One vote of one session, procedural or substantive. The counts are null until the chair closes it.';

create index votes_session_opened_idx on public.votes (session_id, opened_at desc);
create index votes_committee_id_idx on public.votes (committee_id);
create index votes_motion_id_idx on public.votes (motion_id);
create index votes_document_id_idx on public.votes (document_id);

alter table public.votes enable row level security;

create policy "A committee's delegates can read its votes"
  on public.votes
  for select
  to authenticated
  using (public.is_committee_delegate(committee_id));

create policy "The conference team can read a committee's votes"
  on public.votes
  for select
  to authenticated
  using (
    public.is_conference_staff(
      (select committee.conference_id from public.committees as committee where committee.id = votes.committee_id)
    )
  );

create policy "A chair can open a vote"
  on public.votes
  for insert
  to authenticated
  with check (
    public.is_committee_chair(committee_id)
    and exists (
      select 1
      from public.committee_sessions as session
      where session.id = votes.session_id
        and session.committee_id = votes.committee_id
    )
    and (
      votes.motion_id is null
      or exists (
        select 1
        from public.motions as motion
        where motion.id = votes.motion_id
          and motion.committee_id = votes.committee_id
      )
    )
  );

create policy "A chair can close a vote"
  on public.votes
  for update
  to authenticated
  using (public.is_committee_chair(committee_id))
  with check (
    public.is_committee_chair(committee_id)
    and exists (
      select 1
      from public.committee_sessions as session
      where session.id = votes.session_id
        and session.committee_id = votes.committee_id
    )
    and (
      votes.motion_id is null
      or exists (
        select 1
        from public.motions as motion
        where motion.id = votes.motion_id
          and motion.committee_id = votes.committee_id
      )
    )
  );

create policy "A chair can remove a vote"
  on public.votes
  for delete
  to authenticated
  using (public.is_committee_chair(committee_id));


-- One seat's choice in a roll call vote. A show of hands has no entries at all;
-- the chair types the counts onto the vote itself.
--
-- Whether a "present and voting" seat may abstain is the chair page's rule and
-- src/lib/committee-room.ts's: it needs the current roll call, which is a
-- different session's worth of rows from the one being written here.

create table public.vote_entries (
  vote_id uuid not null references public.votes (id) on delete cascade,
  seat_id uuid not null references public.seats (id) on delete cascade,
  choice public.vote_choice not null,
  created_at timestamptz not null default now(),

  primary key (vote_id, seat_id)
);

comment on table public.vote_entries is
  'One seat''s choice in a roll call vote. A show of hands has none: the chair types the counts.';

create index vote_entries_seat_id_idx on public.vote_entries (seat_id);

alter table public.vote_entries enable row level security;

create policy "You can read a vote entry if you can read its vote"
  on public.vote_entries
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.votes as vote
      where vote.id = vote_entries.vote_id
    )
  );

create policy "A chair can record a seat of their own committee voting"
  on public.vote_entries
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.votes as vote
      join public.seats as seat on seat.id = vote_entries.seat_id
      where vote.id = vote_entries.vote_id
        and seat.committee_id = vote.committee_id
        and public.is_committee_chair(vote.committee_id)
    )
  );

create policy "A chair can change a recorded choice"
  on public.vote_entries
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.votes as vote
      where vote.id = vote_entries.vote_id
        and public.is_committee_chair(vote.committee_id)
    )
  )
  with check (
    exists (
      select 1
      from public.votes as vote
      join public.seats as seat on seat.id = vote_entries.seat_id
      where vote.id = vote_entries.vote_id
        and seat.committee_id = vote.committee_id
        and public.is_committee_chair(vote.committee_id)
    )
  );

create policy "A chair can take a recorded choice off again"
  on public.vote_entries
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.votes as vote
      where vote.id = vote_entries.vote_id
        and public.is_committee_chair(vote.committee_id)
    )
  );


-- =============================================================================
-- committee_state
-- =============================================================================
-- Exactly one row per committee: what the room is doing right now. Every screen
-- in the room mirrors it, and specs/02-architecture/realtime.md makes it the
-- first of the published tables, because a delegate's phone reloads the page
-- whenever this row changes.
--
-- It has no created_at, only updated_at, because the row is created with the
-- committee and never again: the data model's column list is the whole row.
--
-- THE TIMER
-- realtime.md: the timer is not ticked over the wire. timer_ends_at is a
-- moment, and every client works out the seconds left from it with its own
-- clock. Pausing writes timer_paused_remaining_seconds and clears
-- timer_ends_at; resuming does the reverse. The check below is that sentence
-- said once in the database, so a row can never be running and paused at the
-- same time and no screen has to decide which of the two columns to believe.

create table public.committee_state (
  committee_id uuid primary key references public.committees (id) on delete cascade,
  current_session_id uuid references public.committee_sessions (id) on delete set null,
  mode public.committee_mode not null default 'idle',
  -- The caucus being run, which is the motion that passed.
  current_motion_id uuid references public.motions (id) on delete set null,
  active_speakers_list_id uuid references public.speakers_lists (id) on delete set null,
  current_speaker_entry_id uuid references public.speakers_list_entries (id) on delete set null,
  current_vote_id uuid references public.votes (id) on delete set null,
  timer_total_seconds integer,
  timer_ends_at timestamptz,
  timer_paused_remaining_seconds integer,
  updated_at timestamptz not null default now(),

  constraint committee_state_timer_runs_or_is_paused check (
    timer_ends_at is null or timer_paused_remaining_seconds is null
  )
);

comment on table public.committee_state is
  'One row per committee: the mode, the timer and what the room is pointing at. The room mirrors it live.';

create index committee_state_current_session_id_idx
  on public.committee_state (current_session_id);

create trigger committee_state_set_updated_at
  before update on public.committee_state
  for each row
  execute function public.set_updated_at();

alter table public.committee_state enable row level security;

-- permissions.md: "deleg., staff" read it, a chair writes it, nobody inserts
-- or deletes it. There is no insert policy at all, because the only thing that
-- writes a row is create_committee_state below, and no delete policy, because
-- the row goes when its committee does.

create policy "A committee's delegates can read its state"
  on public.committee_state
  for select
  to authenticated
  using (public.is_committee_delegate(committee_id));

create policy "The conference team can read a committee's state"
  on public.committee_state
  for select
  to authenticated
  using (
    public.is_conference_staff(
      (select committee.conference_id from public.committees as committee where committee.id = committee_state.committee_id)
    )
  );

-- Every one of the five pointers has to point inside this committee, the same
-- rule the tables above carry for a motion's session and a list entry's seat.
-- Nothing leaks without it -- a delegate reading this row would get an id whose
-- row their own select policies refuse -- but the room's screens would be
-- pointing at nothing, and this row is the one thing every screen in the room
-- believes. It is a write a chair makes a few times a minute and a read every
-- delegate makes continuously, so the cost sits on the rare side.
--
-- current_speaker_entry_id is two hops, because speakers_list_entries has no
-- committee_id of its own; it belongs to the committee its list belongs to.
create policy "A chair can run the room"
  on public.committee_state
  for update
  to authenticated
  using (public.is_committee_chair(committee_id))
  with check (
    public.is_committee_chair(committee_id)
    and (
      current_session_id is null
      or exists (
        select 1
        from public.committee_sessions as session
        where session.id = committee_state.current_session_id
          and session.committee_id = committee_state.committee_id
      )
    )
    and (
      current_motion_id is null
      or exists (
        select 1
        from public.motions as motion
        where motion.id = committee_state.current_motion_id
          and motion.committee_id = committee_state.committee_id
      )
    )
    and (
      active_speakers_list_id is null
      or exists (
        select 1
        from public.speakers_lists as list
        where list.id = committee_state.active_speakers_list_id
          and list.committee_id = committee_state.committee_id
      )
    )
    and (
      current_speaker_entry_id is null
      or exists (
        select 1
        from public.speakers_list_entries as entry
        join public.speakers_lists as list on list.id = entry.speakers_list_id
        where entry.id = committee_state.current_speaker_entry_id
          and list.committee_id = committee_state.committee_id
      )
    )
    and (
      current_vote_id is null
      or exists (
        select 1
        from public.votes as vote
        where vote.id = committee_state.current_vote_id
          and vote.committee_id = committee_state.committee_id
      )
    )
  );


-- -----------------------------------------------------------------------------
-- create_committee_state()
-- -----------------------------------------------------------------------------
-- The trigger the committee editor has been waiting for since T21: creating a
-- committee creates its state row, so every page in the room can read one row
-- and never has to handle "no state yet".
--
-- It is "security definer" because committee_state has no insert policy at all,
-- which is the same reason every trigger that writes to profiles,
-- organization_members, notifications or invoices is.

create or replace function public.create_committee_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.committee_state (committee_id)
  values (new.id)
  -- A committee is inserted once, so this cannot collide today. It is here for
  -- the backfill below, which runs the same statement for the committees that
  -- were created before this migration.
  on conflict (committee_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.create_committee_state() from public, anon, authenticated;

create trigger committees_create_state
  after insert on public.committees
  for each row
  execute function public.create_committee_state();

-- Every committee that already exists gets the row the trigger would have
-- written. On a fresh "pnpm db:reset" this finds nothing, because the seed runs
-- after the migrations and its committees come in through the trigger; it
-- matters for a database that has been running since before today, which is
-- every deployment and every developer's local copy.
insert into public.committee_state (committee_id)
select committee.id
from public.committees as committee
on conflict (committee_id) do nothing;


-- =============================================================================
-- chair_notes
-- =============================================================================
-- What a chair writes down about a seat while the committee runs: private to
-- the chairs and the organisers, never shown to a delegate. The seat list in
-- the room shows a count and nothing else.
--
-- is_committee_chair is the whole select rule, which is why this is the one
-- table in this file with no policy for a delegate or for a volunteer: the
-- matrix in permissions.md gives every column of chair_notes to "chair", and
-- is_committee_chair is true for a chair of the committee and for anybody who
-- can manage its conference.

create table public.chair_notes (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees (id) on delete cascade,
  seat_id uuid not null references public.seats (id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

comment on table public.chair_notes is
  'A chair''s private note about one seat. Chairs and organisers only; never shown to delegates.';

-- The room reads the notes of one seat, newest first, and counts them per
-- committee.
create index chair_notes_seat_created_idx on public.chair_notes (seat_id, created_at desc);
create index chair_notes_committee_id_idx on public.chair_notes (committee_id);
create index chair_notes_author_id_idx on public.chair_notes (author_id);

alter table public.chair_notes enable row level security;

create policy "Chairs and organisers can read the notes of their committee"
  on public.chair_notes
  for select
  to authenticated
  using (public.is_committee_chair(committee_id));

create policy "A chair can write a note about a seat of their own committee"
  on public.chair_notes
  for insert
  to authenticated
  with check (
    public.is_committee_chair(committee_id)
    and author_id = (select auth.uid())
    and exists (
      select 1
      from public.seats as seat
      where seat.id = chair_notes.seat_id
        and seat.committee_id = chair_notes.committee_id
    )
  );

-- Only the person who wrote a note edits it. A co-chair reading it is not the
-- same as a co-chair rewriting it.
create policy "The author can edit their own note"
  on public.chair_notes
  for update
  to authenticated
  using (author_id = (select auth.uid()))
  with check (
    author_id = (select auth.uid())
    and public.is_committee_chair(committee_id)
    and exists (
      select 1
      from public.seats as seat
      where seat.id = chair_notes.seat_id
        and seat.committee_id = chair_notes.committee_id
    )
  );

create policy "The author or an organiser can delete a note"
  on public.chair_notes
  for delete
  to authenticated
  using (
    author_id = (select auth.uid())
    or public.can_manage_conference(
      (select committee.conference_id from public.committees as committee where committee.id = chair_notes.committee_id)
    )
  );


-- =============================================================================
-- awards
-- =============================================================================
-- specs/06-features/awards.md: a chair proposes, an organiser confirms, and the
-- conference publishes every confirmed award at a moment of its choosing by
-- setting conferences.awards_published_at. Before that moment a delegate sees
-- nothing.
--
-- WHY user_id EXISTS BESIDE seat_id
-- An award belongs to a seat, but it is a person's to keep. At publish,
-- freeze_award_user copies the seat's holder onto the row, so a seat that
-- changes hands afterwards does not carry the award with it. Until publish the
-- column is null and the seat is the only answer.

create table public.awards (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees (id) on delete cascade,
  -- Cascades with the seat. An award is about a seat of a committee, and the
  -- data model gives the committee the same rule one level up. The case is
  -- nearly unreachable on purpose: the seats delete policy only lets an
  -- organiser remove a seat nobody holds, and a seat that won an award was
  -- held by somebody.
  seat_id uuid not null references public.seats (id) on delete cascade,
  -- The holder, frozen at publish. "on delete set null" and not the cascade the
  -- conventions ask for, for the same reason seats.user_id has it: deleting an
  -- account must not take the committee's record of its awards with it.
  user_id uuid references auth.users (id) on delete set null,
  kind public.award_kind not null,
  -- "Best Delegate". The chair types their own for kind = 'custom'; for every
  -- other kind the page writes the kind's own words.
  title text not null,
  status public.award_status not null default 'proposed',
  -- Who proposed it. The default is what makes guard_award_insert's rule easy
  -- to obey: a page inserts a kind, a title and a seat, and the database fills
  -- in the chair. A chair who deletes their account takes the awards they
  -- proposed with them, which is the same trade documents.uploaded_by makes.
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- awards.md: one award per kind per seat, and a seat may have several kinds.
  unique (committee_id, seat_id, kind)
);

comment on table public.awards is
  'An award for one seat: proposed by a chair, confirmed by an organiser, published by the conference.';

create index awards_committee_status_idx on public.awards (committee_id, status);
create index awards_seat_id_idx on public.awards (seat_id);
create index awards_user_id_idx on public.awards (user_id);
create index awards_created_by_idx on public.awards (created_by);

create trigger awards_set_updated_at
  before update on public.awards
  for each row
  execute function public.set_updated_at();

alter table public.awards enable row level security;


-- -----------------------------------------------------------------------------
-- awards: who may read and write
-- -----------------------------------------------------------------------------
-- The matrix in permissions.md gives this table three readers. The first is the
-- chairs and organisers, who see every proposal from the moment it is made. The
-- other two -- "a delegate of the conference once it is published and
-- confirmed" and "anyone reading a profile sees confirmed published awards of
-- that user" -- are one policy here, because the second is wider than the
-- first: /profile shows a person their awards, and profiles are readable by
-- every signed-in user, so a published award is too. Nothing is readable by a
-- visitor who is not signed in; public profiles are Phase 2.

create policy "Chairs and organisers can read every award of their committee"
  on public.awards
  for select
  to authenticated
  using (public.is_committee_chair(committee_id));

create policy "Anyone signed in can read a published, confirmed award"
  on public.awards
  for select
  to authenticated
  using (
    status = 'confirmed'
    and exists (
      select 1
      from public.committees as committee
      join public.conferences as conference on conference.id = committee.conference_id
      where committee.id = awards.committee_id
        and conference.awards_published_at is not null
        and conference.awards_published_at <= now()
    )
  );

create policy "A chair can propose an award for a seat of their own committee"
  on public.awards
  for insert
  to authenticated
  with check (
    public.is_committee_chair(committee_id)
    and exists (
      select 1
      from public.seats as seat
      where seat.id = awards.seat_id
        and seat.committee_id = awards.committee_id
    )
  );

-- Two update rules in one policy, because the matrix gives each side a
-- different list of columns and protect_awards_columns below is what tells them
-- apart. "Chair (own proposed)" is the person who proposed it editing their own
-- wording; "org. (status)" is an organiser confirming or unconfirming anybody's
-- proposal. is_committee_chair is true for an organiser too, so the second half
-- only widens the first.
--
-- The seat is checked again on the way in, because seat_id is one of the
-- columns protect_awards_columns lets the proposing chair reword. Without it a
-- chair could move their own award onto another committee's seat, which would
-- put an award on a delegate they do not run.
--
-- Both halves of the chair's branch say "proposed", the "using" half about the
-- row as it is and the "with check" half about the row as it would be. Only the
-- first is about who may write the row at all; the second is what stops a chair
-- leaving their own proposal confirmed, which is the organiser's word and not
-- theirs. protect_awards_columns below says the same thing about the column
-- itself, so that the rule holds however the row is reached.
create policy "A chair edits their own proposal and an organiser confirms any"
  on public.awards
  for update
  to authenticated
  using (
    (public.is_committee_chair(committee_id)
      and status = 'proposed'
      and created_by = (select auth.uid()))
    or public.can_manage_conference(
      (select committee.conference_id from public.committees as committee where committee.id = awards.committee_id)
    )
  )
  with check (
    exists (
      select 1
      from public.seats as seat
      where seat.id = awards.seat_id
        and seat.committee_id = awards.committee_id
    )
    and (
      (public.is_committee_chair(committee_id)
        and status = 'proposed'
        and created_by = (select auth.uid()))
      or public.can_manage_conference(
        (select committee.conference_id from public.committees as committee where committee.id = awards.committee_id)
      )
    )
  );

create policy "A chair can delete their own proposal and an organiser any award"
  on public.awards
  for delete
  to authenticated
  using (
    (public.is_committee_chair(committee_id)
      and status = 'proposed'
      and created_by = (select auth.uid()))
    or public.can_manage_conference(
      (select committee.conference_id from public.committees as committee where committee.id = awards.committee_id)
    )
  );


-- -----------------------------------------------------------------------------
-- guard_award_insert()
-- -----------------------------------------------------------------------------
-- What an award may look like on the day a browser writes it: it is "proposed",
-- nobody is frozen onto it yet, and the chair it names is the chair asking.
-- The same job guard_document_insert, guard_application_insert and
-- guard_invoice_insert do, and for the same reason -- without it
-- protect_awards_columns beside it is walked around by choosing at insert what
-- it refuses to let anybody change. A chair could otherwise propose an award
-- that already says "confirmed", and it would appear on a delegate's profile
-- the moment the conference published, with no organiser ever having agreed.
--
-- Like the other guards it is deliberately NOT security definer: inside a
-- security definer function current_user reads "postgres" rather than the
-- caller, which is how freeze_award_user stays able to write user_id.

create or replace function public.guard_award_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.status is distinct from 'proposed'::public.award_status then
    raise exception
      'An award is proposed first: only an organiser of this conference can confirm one';
  end if;

  if new.user_id is not null then
    raise exception
      'An award cannot name its holder yet: the conference writes that when it publishes the awards';
  end if;

  if new.created_by is distinct from me then
    raise exception 'An award records the chair who proposed it, which is you';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_award_insert() from public, anon, authenticated;

create trigger awards_guard_insert
  before insert on public.awards
  for each row
  execute function public.guard_award_insert();


-- -----------------------------------------------------------------------------
-- protect_awards_columns()
-- -----------------------------------------------------------------------------
-- The column half of the awards update rule, which a policy cannot say.
--
-- Two sentences. The first: what an award IS and what it belongs to -- its id,
-- its committee, its holder, the chair who proposed it and when it was written
-- -- never changes from a browser at all. It is written as the allow-list
-- permissions.md asks for, comparing everything outside the list rather than
-- naming the columns it refuses, because a forbidden list is a list that rots.
--
-- The second: the wording of an award -- the kind, the title and the seat -- is
-- the proposing chair's while it is still proposed. A chair whose proposal has
-- been confirmed has to ask the organiser to unconfirm it before rewording it.
--
-- The third: "status" is the organiser's column and nobody else's. The
-- allow-list above cannot say that on its own, because an allow-list is about
-- which columns moved and not about who moved them, and "status" has to be in
-- it for the organiser to write at all. Without this rule a chair could confirm
-- their own proposal -- the row is theirs and still proposed, so the update
-- policy lets them write it -- and the award would reach the delegate's profile
-- and their notifications at publish with no organiser ever having agreed. That
-- is the same hole guard_award_insert closes at insert, one statement later.

create or replace function public.protect_awards_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  writable text[] := array['kind', 'title', 'seat_id', 'status', 'updated_at'];
  wording_changed boolean;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if to_jsonb(new) - writable is distinct from to_jsonb(old) - writable then
    raise exception
      'An award keeps the committee, the seat holder and the chair it was written with';
  end if;

  wording_changed := (new.kind, new.title, new.seat_id)
    is distinct from (old.kind, old.title, old.seat_id);

  if wording_changed
    and (old.created_by is distinct from me or old.status <> 'proposed')
  then
    raise exception
      'Only the chair who proposed an award can reword it, and only while it is still proposed';
  end if;

  if new.status is distinct from old.status
    and not public.can_manage_conference(
      (select committee.conference_id
       from public.committees as committee
       where committee.id = old.committee_id)
    )
  then
    raise exception
      'Only an organiser of this conference can confirm or unconfirm an award';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_awards_columns() from public, anon, authenticated;

create trigger awards_protect_columns
  before update on public.awards
  for each row
  execute function public.protect_awards_columns();


-- =============================================================================
-- Publishing the awards
-- =============================================================================
-- specs/06-features/awards.md step 3: at publish, freeze_award_user copies the
-- seat holder onto each confirmed award and notify_awards_published tells each
-- recipient. Both hang off the same column of the same table, conferences
-- .awards_published_at, which is the one thing the organiser's "Publish awards"
-- button writes.
--
-- The freeze is a "before" trigger and the notification an "after" one, in that
-- order on purpose: the notification reads awards.user_id, and the freeze is
-- what puts it there.

-- -----------------------------------------------------------------------------
-- freeze_award_user()
-- -----------------------------------------------------------------------------
-- An award is a person's to keep, and a seat is not. Once the awards of a
-- conference are published, each confirmed award remembers who was holding its
-- seat at that moment, so a seat that changes hands next week -- or is revoked
-- and given to somebody else -- does not carry the award with it.
--
-- It only fills a row that is still empty, which is what makes it a freeze
-- rather than a refresh. An organiser who unpublishes and publishes again does
-- not move an award somebody has already been told about; an award confirmed
-- after the first publish is frozen by the second one.
--
-- It is "security definer" because protect_awards_columns refuses a change to
-- user_id from anon and authenticated, and the organiser pressing "Publish
-- awards" is authenticated. Inside a security definer function current_user
-- reads "postgres", so the guard lets this one through, which is the same
-- arrangement every protect_* trigger in this schema relies on.

create or replace function public.freeze_award_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.awards_published_at is null
    or new.awards_published_at is not distinct from old.awards_published_at
  then
    return new;
  end if;

  update public.awards as award
  set user_id = (
    select seat.user_id
    from public.seats as seat
    where seat.id = award.seat_id
  )
  where award.status = 'confirmed'
    and award.user_id is null
    and award.committee_id in (
      select committee.id
      from public.committees as committee
      where committee.conference_id = new.id
    );

  return new;
end;
$$;

revoke execute on function public.freeze_award_user() from public, anon, authenticated;

create trigger conferences_freeze_award_user
  before update of awards_published_at on public.conferences
  for each row
  execute function public.freeze_award_user();


-- -----------------------------------------------------------------------------
-- notify_awards_published()
-- -----------------------------------------------------------------------------
-- "You received Best Delegate in Security Council." The last of the notify_*
-- triggers of specs/02-architecture/notifications.md, and the only one whose
-- rows may be dated in the future: an organiser can set awards_published_at to
-- a moment that has not arrived, the row is written with that moment as its
-- created_at, and the notifications select policy hides it until then. That is
-- how a scheduled announcement works without a scheduler.
--
-- WHY IT LOOKS FOR A NOTIFICATION IT HAS ALREADY SENT
-- The trigger fires on every write of awards_published_at, and an organiser may
-- write it more than once: unpublishing and republishing, or moving the moment.
-- notifications.md says notifications are never deleted by a trigger, so the
-- only way not to tell somebody the same thing twice is to look first. The
-- title is what it looks for, because it is what identifies the award from the
-- recipient's side: the same person cannot hold two seats at one conference
-- (check_seat_allocation), so one person, one committee and one award title is
-- one award.
--
-- Like every notify_* it shortens a title built out of words somebody typed.
-- A chair can name a custom award longer than the 100 characters
-- notifications.md allows for a line in the bell; the award itself keeps every
-- word.

create or replace function public.notify_awards_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.awards_published_at is null
    or new.awards_published_at is not distinct from old.awards_published_at
  then
    return new;
  end if;

  with recipient_line as (
    select
      award.user_id as user_id,
      'You received ' || award.title || ' in ' || committee.name as line
    from public.awards as award
    join public.committees as committee on committee.id = award.committee_id
    where committee.conference_id = new.id
      and award.status = 'confirmed'
      and award.user_id is not null
  ),
  recipient as (
    select
      user_id,
      case
        when char_length(line) <= 99 then line
        else left(line, 98) || '…'
      end as title
    from recipient_line
  )
  insert into public.notifications (user_id, conference_id, kind, title, link_path, created_at)
  select
    recipient.user_id,
    new.id,
    'award_published',
    recipient.title,
    '/profile',
    new.awards_published_at
  from recipient
  where not exists (
    select 1
    from public.notifications as already_sent
    where already_sent.user_id = recipient.user_id
      and already_sent.conference_id = new.id
      and already_sent.kind = 'award_published'
      and already_sent.title = recipient.title
  );

  return new;
end;
$$;

revoke execute on function public.notify_awards_published() from public, anon, authenticated;

create trigger conferences_notify_awards_published
  after update of awards_published_at on public.conferences
  for each row
  execute function public.notify_awards_published();


-- =============================================================================
-- Realtime
-- =============================================================================
-- specs/02-architecture/realtime.md: the committee room is the one place in
-- MUNMeet that pushes rather than waits to be asked, and these are the seven
-- tables it listens to. Row Level Security applies to a realtime message the
-- same way it applies to a select, so a delegate only hears about rows their
-- own select policy above would have returned, and because those policies ask
-- is_committee_delegate, no delegate hears another committee.
--
-- chair_notes and awards are deliberately not published. A note is private to
-- the chairs, and an award appears when the conference publishes it, which is a
-- page load and not a live event.
--
-- Nothing here sets "replica identity full". A delete carries only the primary
-- key of the row that went, which is enough, because nothing in the room is
-- removed while a delegate is watching: taking a speaker off a list is a change
-- of status to "removed" and withdrawing a motion is a change of status to
-- "withdrawn", both of them ordinary updates that carry the whole row.

alter publication supabase_realtime add table
  public.committee_state,
  public.committee_sessions,
  public.speakers_lists,
  public.speakers_list_entries,
  public.motions,
  public.votes,
  public.roll_call_entries;
