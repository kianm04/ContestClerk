-- =============================================================================
-- One transaction per press: the functions that move the room (S2 D1, S9)
-- =============================================================================
-- Contract: specs/02-architecture/data-model.md ("committee_state", "Functions
-- that move the room"), specs/02-architecture/permissions.md ("The committee
-- room's functions") and specs/05-pages/chair/motions.md ("vote").
--
-- WHY FUNCTIONS
-- "Next speaker", "Start session" and "Pass" each write several rows: a speech
-- that ends, an entry that starts, the room's state row. The page used to write
-- them one request at a time, so two chairs pressing together, or a request
-- failing halfway, could leave the room half moved (07-delivery/findings.md,
-- "Next speaker is not written in one transaction", and "a GSL speaker can stay
-- speaking after a caucus"). Each press is now one call to one function here,
-- and a function runs in one transaction: everything it writes lands, or none
-- of it does.
--
-- THE RULES ALL FOUR SHARE
--   * Who. A caller who is not is_committee_chair of the committee (a chair of
--     it, or anybody who can manage its conference) is refused with error
--     42501 before anything changes.
--   * Not security definer. Every row they write is one the chair's own
--     policies already let them write, so they run as the caller and Row Level
--     Security checks each write exactly as when the page made them one by one.
--     They exist for the transaction, not for a privilege. A refused update
--     answers with no rows rather than an error, which is why the first rule is
--     asked out loud.
--   * One press at a time. Each locks the committee's committee_state row
--     ("select ... for update") before reading it, so a co-chair's press at the
--     same moment waits for this one and then sees the room it left.
--   * The moment. pressed_at is the moment the chair pressed, which the action
--     has already worked out with pressedMoment (realtime.md, "Timer"); null
--     means now(). It is not checked again: a chair calling a function by hand
--     with another moment could as well write the timer columns themselves.
--   * Ending a speech. Where a function ends the speech in progress, the entry
--     current_speaker_entry_id names becomes 'spoken', with finished_at the
--     moment and spoke_seconds the list's speaking time less the seconds left
--     on the speaker's clock, never below 0, as spokeSeconds in
--     src/lib/committee-room.ts reckons it.
--   * They refuse with the sentences the pages already show (ROOM_REFUSALS in
--     src/lib/chair-room.ts, MOTION_REFUSALS in src/lib/motions.ts, and the
--     page files' own), so a refusal can be shown to the chair as it is.
--
-- THE ROOM'S CLOCKS, IN THEIR FINAL FORM
-- The data model describes these functions step by step (S2, then S4, S6, S7,
-- S9 and S11 each change them). They are written here once, in the form the
-- last of those steps leaves them, because the session redesign is built in
-- one go and the later steps only call them:
--   * a called speaker's clock is ready and paused at the list's speaking time,
--     and the chair starts it when the speech starts (S4);
--   * a seat marked absent in the session's latest roll call is skipped (S4);
--   * a moderated caucus keeps its total on the caucus clock (S7, migration
--     20261001120200), which runs exactly while the speaker's clock runs;
--   * Pass drops the other motions on the floor (S6) and a suspend motion
--     suspends the room with its length (S11, migration 20261001120400).
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- clock_seconds_left(ends_at, paused_remaining_seconds, at_moment)
-- -----------------------------------------------------------------------------
-- The seconds a clock has left at a moment: a paused clock holds its seconds, a
-- running one counts down to ends_at and stops at zero, and a part-second left
-- counts as a whole one. Null when there is no clock at all. The same sum as
-- remainingSeconds in src/lib/committee-room.ts, which every screen counts
-- with, so the time the database records is the time the chair saw.
--
-- The speaker's clock (timer_*) and the caucus clock (caucus_*) are both a
-- moment and a pause, so one function serves both. It reads no table, which
-- is why it is "immutable" and why granting it to everybody signed in gives
-- nobody anything: it is arithmetic. It has to be granted, because the
-- functions below run as the caller and call it as the caller.

create or replace function public.clock_seconds_left(
  ends_at timestamptz,
  paused_remaining_seconds integer,
  at_moment timestamptz
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when clock_seconds_left.paused_remaining_seconds is not null then
      greatest(0, clock_seconds_left.paused_remaining_seconds)
    when clock_seconds_left.ends_at is not null then
      greatest(
        0,
        ceil(extract(epoch from clock_seconds_left.ends_at - clock_seconds_left.at_moment))
      )::integer
    else null
  end;
$$;

revoke execute on function public.clock_seconds_left(timestamptz, integer, timestamptz)
  from public, anon;
grant execute on function public.clock_seconds_left(timestamptz, integer, timestamptz)
  to authenticated;


-- -----------------------------------------------------------------------------
-- call_next_speaker(committee_id, speaking_entry_id, pressed_at)
-- -----------------------------------------------------------------------------
-- "Next: {seat}" and "Call {seat}", wherever they are drawn. It answers one
-- word:
--
--   * 'moved'     the next waiting entry has the floor;
--   * 'empty'     nobody was waiting, so the floor is empty;
--   * 'unchanged' the floor had already moved on since the chair's screen was
--                 drawn, and nothing was changed.
--
-- speaking_entry_id is the speech the chair's screen showed (null for nobody).
-- When the room's current speaker is another one, a press of another chair, or
-- of this chair a moment ago, has already moved the floor on, and moving it
-- again would skip a speaker. It is only ever compared with the room's own
-- pointer and never written, so it needs no check of its own.

create or replace function public.call_next_speaker(
  committee_id uuid,
  speaking_entry_id uuid default null,
  pressed_at timestamptz default null
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  moment timestamptz := coalesce(call_next_speaker.pressed_at, now());
  room public.committee_state;
  latest_roll_call_id uuid;
  next_entry_id uuid;
  list_speaking_seconds integer;
begin
  if not public.is_committee_chair(call_next_speaker.committee_id) then
    raise exception 'Only a chair of this committee can call the next speaker.'
      using errcode = '42501';
  end if;

  -- The lock: a second press waits here until this one has finished.
  select *
  into room
  from public.committee_state as state
  where state.committee_id = call_next_speaker.committee_id
  for update;

  if not exists (
    select 1
    from public.committee_sessions as session
    where session.id = room.current_session_id
      and session.status = 'in_progress'
  ) then
    raise exception 'No session is running.';
  end if;

  -- Written as the modes with no list to call from, rather than the modes
  -- with one, so that a new mode with a list of its own (single_speaker, S9)
  -- needed no new version of this function.
  if room.active_speakers_list_id is null
    or room.mode in ('unmoderated_caucus', 'voting', 'suspended') then
    raise exception 'There is no speakers list open.';
  end if;

  if room.current_speaker_entry_id is distinct from call_next_speaker.speaking_entry_id then
    return 'unchanged';
  end if;

  -- The speech in progress ends, with how long it lasted.
  update public.speakers_list_entries as entry
  set status = 'spoken',
      finished_at = moment,
      spoke_seconds = greatest(
        0,
        list.speaking_time_seconds - coalesce(
          public.clock_seconds_left(room.timer_ends_at, room.timer_paused_remaining_seconds, moment),
          0
        )
      )
  from public.speakers_lists as list
  where entry.id = room.current_speaker_entry_id
    and entry.status = 'speaking'
    and list.id = entry.speakers_list_id;

  -- Attendance is the session's latest roll call. Before the first one every
  -- seat counts as present, and an entry with no seat (a named single speaker)
  -- is never absent: "mark.seat_id = entry.seat_id" is never true for it.
  select roll_call.id
  into latest_roll_call_id
  from public.roll_calls as roll_call
  where roll_call.session_id = room.current_session_id
  order by roll_call.taken_at desc
  limit 1;

  select entry.id
  into next_entry_id
  from public.speakers_list_entries as entry
  where entry.speakers_list_id = room.active_speakers_list_id
    and entry.status = 'waiting'
    and not exists (
      select 1
      from public.roll_call_entries as mark
      where mark.roll_call_id = latest_roll_call_id
        and mark.seat_id = entry.seat_id
        and mark.status = 'absent'
    )
  order by entry.position, entry.created_at
  limit 1;

  -- Nobody waiting: the floor and the speaker's clock are cleared. The caucus
  -- clock only runs while the speaker's clock runs, so it is paused at what it
  -- has left; outside a moderated caucus it is empty and stays so.
  if next_entry_id is null then
    update public.committee_state as state
    set current_speaker_entry_id = null,
        timer_total_seconds = null,
        timer_ends_at = null,
        timer_paused_remaining_seconds = null,
        caucus_ends_at = null,
        caucus_paused_remaining_seconds = public.clock_seconds_left(
          room.caucus_ends_at, room.caucus_paused_remaining_seconds, moment
        )
    where state.committee_id = call_next_speaker.committee_id;

    return 'empty';
  end if;

  select list.speaking_time_seconds
  into list_speaking_seconds
  from public.speakers_lists as list
  where list.id = room.active_speakers_list_id;

  update public.speakers_list_entries as entry
  set status = 'speaking',
      started_at = moment
  where entry.id = next_entry_id;

  -- The new speaker's clock is ready at the full time and paused: the chair
  -- starts it when the speech really starts. The caucus clock waits with it.
  update public.committee_state as state
  set current_speaker_entry_id = next_entry_id,
      timer_total_seconds = list_speaking_seconds,
      timer_ends_at = null,
      timer_paused_remaining_seconds = list_speaking_seconds,
      caucus_ends_at = null,
      caucus_paused_remaining_seconds = public.clock_seconds_left(
        room.caucus_ends_at, room.caucus_paused_remaining_seconds, moment
      )
  where state.committee_id = call_next_speaker.committee_id;

  return 'moved';
end;
$$;

revoke execute on function public.call_next_speaker(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.call_next_speaker(uuid, uuid, timestamptz) to authenticated;


-- -----------------------------------------------------------------------------
-- start_committee_session(committee_id, name, pressed_at)
-- -----------------------------------------------------------------------------
-- "Start Session 2" and "Start a practice session". The action passes what the
-- chair typed, or else defaultSessionName's name. It answers the new session's
-- id.
--
-- The agenda is left alone, so the topic of the last session carries over to
-- the next one. Starting a quick session's session on a later day moves the
-- conference's last day forward, but that is the trigger
-- move_quick_session_end_date's job (20261001120700), not this function's,
-- because a co-chair who may start a session may not edit the conference.

create or replace function public.start_committee_session(
  committee_id uuid,
  name text,
  pressed_at timestamptz default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  moment timestamptz := coalesce(start_committee_session.pressed_at, now());
  session_name text := btrim(coalesce(start_committee_session.name, ''));
  speaking_seconds integer;
  new_session_id uuid;
  general_list_id uuid;
begin
  if not public.is_committee_chair(start_committee_session.committee_id) then
    raise exception 'Only a chair of this committee can start a session.'
      using errcode = '42501';
  end if;

  -- The lock: two chairs pressing "Start" together get one session, and the
  -- second is told why.
  perform 1
  from public.committee_state as state
  where state.committee_id = start_committee_session.committee_id
  for update;

  if exists (
    select 1
    from public.committee_sessions as session
    where session.committee_id = start_committee_session.committee_id
      and session.status = 'in_progress'
  ) then
    raise exception 'End the current session before starting a new one.';
  end if;

  if session_name = '' then
    raise exception 'Give the session a name.';
  end if;

  select committee.default_speaking_time_seconds
  into speaking_seconds
  from public.committees as committee
  where committee.id = start_committee_session.committee_id;

  insert into public.committee_sessions (committee_id, name, status, started_at)
  values (start_committee_session.committee_id, session_name, 'in_progress', moment)
  returning id into new_session_id;

  -- The same name GENERAL_SPEAKERS_LIST_NAME in src/lib/chair-room.ts gives it.
  insert into public.speakers_lists (
    committee_id, session_id, motion_id, kind, name, speaking_time_seconds
  )
  values (
    start_committee_session.committee_id,
    new_session_id,
    null,
    'general',
    'General Speakers'' List',
    speaking_seconds
  )
  returning id into general_list_id;

  -- Whatever the room pointed at belonged to the last session, so all of it
  -- is cleared: the motion, the speaker, the vote, both clocks and any
  -- suspension.
  update public.committee_state as state
  set current_session_id = new_session_id,
      mode = 'formal_debate',
      active_speakers_list_id = general_list_id,
      current_motion_id = null,
      current_speaker_entry_id = null,
      current_vote_id = null,
      timer_total_seconds = null,
      timer_ends_at = null,
      timer_paused_remaining_seconds = null,
      caucus_total_seconds = null,
      caucus_ends_at = null,
      caucus_paused_remaining_seconds = null,
      suspended_at = null,
      suspended_until = null,
      mode_before_suspension = null
  where state.committee_id = start_committee_session.committee_id;

  return new_session_id;
end;
$$;

revoke execute on function public.start_committee_session(uuid, text, timestamptz)
  from public, anon;
grant execute on function public.start_committee_session(uuid, text, timestamptz)
  to authenticated;


-- -----------------------------------------------------------------------------
-- apply_passed_motion(motion_id, votes_for, votes_against, pressed_at)
-- -----------------------------------------------------------------------------
-- "Pass" in Motions, and the direct route: "Start caucus" on the Mod or Unmod
-- view writes its motion as 'proposed' with started_without_vote = true and
-- passes it with this function in the same action, without counts. It answers
-- the ids of the motions it dropped, so the toast can say "2 other motions
-- dropped · Undo".
--
-- In order:
--   1. The motion must exist (a motion the caller cannot read does not), and
--      the caller must chair its committee.
--   2. It must still be on the floor: 'proposed', and of the room's current
--      session, which is running. Two chairs passing the same motion at once
--      cannot both succeed: the second waits for the lock and then finds it
--      'passed'.
--   3. The Motions page's own refusals are asked again (motions.md, "vote"),
--      because a co-chair may have changed the room since the page was drawn:
--      a suspended room passes only an adjournment, a document or an "other"
--      motion; a caucus or closing debate waits for an open vote to close; and
--      an extension needs a caucus to extend.
--   4. The motion becomes 'passed', with the counts as given (both null when
--      the chair passed it without counting) and decided_at the moment.
--   5. Every other motion of the session still on the floor is 'dropped' at
--      the same moment. A caucus started from its own view drops none: Mod and
--      Unmod start it "leaving the motions on the floor as they were"
--      (mod.md, unmod.md), and only Pass in Motions clears the floor.
--   6. A motion that changes the mode (a caucus, closing debate, adjourning)
--      ends the speech in progress, with its time. Before this function the
--      pointer was cleared and the entry was left 'speaking'.
--   7. The room changes as the motion's kind asks; see each branch below.
--      A caucus passed while another runs replaces it, and the old motion
--      keeps 'passed'.

create or replace function public.apply_passed_motion(
  motion_id uuid,
  votes_for integer default null,
  votes_against integer default null,
  pressed_at timestamptz default null
)
returns setof uuid
language plpgsql
set search_path = ''
as $$
declare
  moment timestamptz := coalesce(apply_passed_motion.pressed_at, now());
  motion public.motions;
  room public.committee_state;
  dropped_ids uuid[] := '{}';
  general_list_id uuid;
  caucus_list_id uuid;
  extension_seconds integer;
  seconds_left integer;
  extended_ends_at timestamptz;
  extended_paused_seconds integer;
begin
  select *
  into motion
  from public.motions as candidate
  where candidate.id = apply_passed_motion.motion_id;

  if motion.id is null then
    raise exception 'That motion does not exist';
  end if;

  if not public.is_committee_chair(motion.committee_id) then
    raise exception 'Only a chair of this committee can pass a motion.'
      using errcode = '42501';
  end if;

  select *
  into room
  from public.committee_state as state
  where state.committee_id = motion.committee_id
  for update;

  -- Read again now that the room is ours: a pass that held the lock before
  -- this one has committed by now, and this statement sees what it wrote.
  select *
  into motion
  from public.motions as candidate
  where candidate.id = apply_passed_motion.motion_id;

  if motion.status is distinct from 'proposed'
    or motion.session_id is distinct from room.current_session_id
    or not exists (
      select 1
      from public.committee_sessions as session
      where session.id = motion.session_id
        and session.status = 'in_progress'
    ) then
    raise exception 'That motion is no longer on the floor.';
  end if;

  if room.mode = 'suspended'
    and motion.kind not in ('adjourn_meeting', 'introduce_document', 'other') then
    raise exception 'Resume the session first.';
  end if;

  if motion.kind in ('moderated_caucus', 'unmoderated_caucus', 'close_debate')
    and exists (
      select 1
      from public.votes as vote
      where vote.session_id = motion.session_id
        and vote.status = 'open'
    ) then
    raise exception 'Close the open vote first.';
  end if;

  if motion.kind = 'extend_caucus'
    and room.mode not in ('moderated_caucus', 'unmoderated_caucus') then
    raise exception 'There is no caucus to extend.';
  end if;

  update public.motions as passing
  set status = 'passed',
      votes_for = apply_passed_motion.votes_for,
      votes_against = apply_passed_motion.votes_against,
      decided_at = moment
  where passing.id = motion.id;

  if not motion.started_without_vote then
    with dropped as (
      update public.motions as other_motion
      set status = 'dropped',
          decided_at = moment
      where other_motion.session_id = motion.session_id
        and other_motion.status = 'proposed'
        and other_motion.id <> motion.id
      returning other_motion.id
    )
    select coalesce(array_agg(dropped.id), '{}')
    into dropped_ids
    from dropped;
  end if;

  if motion.kind in ('moderated_caucus', 'unmoderated_caucus', 'close_debate', 'adjourn_meeting') then
    update public.speakers_list_entries as entry
    set status = 'spoken',
        finished_at = moment,
        spoke_seconds = greatest(
          0,
          list.speaking_time_seconds - coalesce(
            public.clock_seconds_left(room.timer_ends_at, room.timer_paused_remaining_seconds, moment),
            0
          )
        )
    from public.speakers_lists as list
    where entry.id = room.current_speaker_entry_id
      and entry.status = 'speaking'
      and list.id = entry.speakers_list_id;
  end if;

  select list.id
  into general_list_id
  from public.speakers_lists as list
  where list.session_id = motion.session_id
    and list.kind = 'general'
  order by list.created_at
  limit 1;

  if motion.kind = 'moderated_caucus' then
    -- The caucus runs on a list of its own, named after its topic, at its own
    -- speaking time. Nobody speaks yet, so the speaker's clock is empty and the
    -- caucus clock holds the whole total, paused, until the first speech. A
    -- vote still on show is closed (an open one was refused above) and ends.
    insert into public.speakers_lists (
      committee_id, session_id, motion_id, kind, name, speaking_time_seconds
    )
    values (
      motion.committee_id,
      motion.session_id,
      motion.id,
      'caucus',
      coalesce(nullif(btrim(motion.topic), ''), 'Moderated caucus'),
      coalesce(
        motion.speaking_time_seconds,
        (
          select committee.default_speaking_time_seconds
          from public.committees as committee
          where committee.id = motion.committee_id
        )
      )
    )
    returning id into caucus_list_id;

    update public.committee_state as state
    set mode = 'moderated_caucus',
        current_motion_id = motion.id,
        active_speakers_list_id = caucus_list_id,
        current_speaker_entry_id = null,
        current_vote_id = null,
        timer_total_seconds = null,
        timer_ends_at = null,
        timer_paused_remaining_seconds = null,
        caucus_total_seconds = motion.total_time_seconds,
        caucus_ends_at = null,
        caucus_paused_remaining_seconds = motion.total_time_seconds
    where state.committee_id = motion.committee_id;

  elsif motion.kind = 'unmoderated_caucus' then
    -- Nobody has the floor, and the one clock (timer_*) runs for the total at
    -- once. The General Speakers' List stays the active list, which the Unmod
    -- view shows as "After the caucus".
    update public.committee_state as state
    set mode = 'unmoderated_caucus',
        current_motion_id = motion.id,
        active_speakers_list_id = general_list_id,
        current_speaker_entry_id = null,
        current_vote_id = null,
        timer_total_seconds = coalesce(motion.total_time_seconds, 0),
        timer_ends_at = moment + make_interval(secs => coalesce(motion.total_time_seconds, 0)),
        timer_paused_remaining_seconds = null,
        caucus_total_seconds = null,
        caucus_ends_at = null,
        caucus_paused_remaining_seconds = null
    where state.committee_id = motion.committee_id;

  elsif motion.kind = 'extend_caucus' then
    -- The extension's length goes onto the clock of the caucus being run,
    -- running or paused, and grows its total by as much, the way
    -- extendedCaucusTimer in src/lib/motions.ts does. No speech ends.
    extension_seconds := coalesce(motion.total_time_seconds, 0);

    if room.mode = 'moderated_caucus' then
      seconds_left := public.clock_seconds_left(
        room.caucus_ends_at, room.caucus_paused_remaining_seconds, moment
      );

      -- A caucus with no caucus clock yet (one already running when the
      -- caucus clock arrived) gets one, running exactly when the speaker's
      -- clock runs.
      if room.caucus_ends_at is not null
        or (seconds_left is null and room.timer_ends_at is not null) then
        extended_ends_at := moment + make_interval(secs => coalesce(seconds_left, 0) + extension_seconds);
        extended_paused_seconds := null;
      else
        extended_ends_at := null;
        extended_paused_seconds := coalesce(seconds_left, 0) + extension_seconds;
      end if;

      update public.committee_state as state
      set caucus_total_seconds = coalesce(room.caucus_total_seconds, 0) + extension_seconds,
          caucus_ends_at = extended_ends_at,
          caucus_paused_remaining_seconds = extended_paused_seconds
      where state.committee_id = motion.committee_id;
    else
      seconds_left := public.clock_seconds_left(
        room.timer_ends_at, room.timer_paused_remaining_seconds, moment
      );

      -- A paused clock stays paused; a running one, or none at all, runs on
      -- from the moment with the extra time.
      if room.timer_paused_remaining_seconds is not null then
        extended_ends_at := null;
        extended_paused_seconds := seconds_left + extension_seconds;
      else
        extended_ends_at := moment + make_interval(secs => coalesce(seconds_left, 0) + extension_seconds);
        extended_paused_seconds := null;
      end if;

      update public.committee_state as state
      set timer_total_seconds = coalesce(room.timer_total_seconds, 0) + extension_seconds,
          timer_ends_at = extended_ends_at,
          timer_paused_remaining_seconds = extended_paused_seconds
      where state.committee_id = motion.committee_id;
    end if;

  elsif motion.kind = 'suspend_meeting' then
    -- Suspending as the mode bar's Suspend does (data-model.md, "Suspending
    -- and resuming"): every clock is paused at what it has left, everything
    -- else is kept, and the motion's length, when it has one, says when the
    -- room is back. suspended_at is the motion's decided_at, which is how the
    -- suspended screen finds the reason ("Suspended for lunch").
    update public.committee_state as state
    set mode = 'suspended',
        mode_before_suspension = room.mode,
        suspended_at = moment,
        suspended_until = moment + make_interval(secs => motion.total_time_seconds),
        timer_ends_at = null,
        timer_paused_remaining_seconds = public.clock_seconds_left(
          room.timer_ends_at, room.timer_paused_remaining_seconds, moment
        ),
        caucus_ends_at = null,
        caucus_paused_remaining_seconds = public.clock_seconds_left(
          room.caucus_ends_at, room.caucus_paused_remaining_seconds, moment
        )
    where state.committee_id = motion.committee_id;

  elsif motion.kind = 'adjourn_meeting' then
    -- Ends the session as "End session" does. A vote still open is cancelled,
    -- as cancelVote does (deleted with its answers), because nothing was
    -- decided in it and a closed session cannot finish it.
    delete from public.votes as vote
    where vote.session_id = motion.session_id
      and vote.status = 'open';

    update public.committee_sessions as session
    set status = 'ended',
        ended_at = moment
    where session.id = motion.session_id;

    update public.committee_state as state
    set mode = 'idle',
        current_session_id = null,
        current_motion_id = null,
        active_speakers_list_id = null,
        current_speaker_entry_id = null,
        current_vote_id = null,
        timer_total_seconds = null,
        timer_ends_at = null,
        timer_paused_remaining_seconds = null,
        caucus_total_seconds = null,
        caucus_ends_at = null,
        caucus_paused_remaining_seconds = null,
        suspended_at = null,
        suspended_until = null,
        mode_before_suspension = null
    where state.committee_id = motion.committee_id;

  elsif motion.kind = 'close_debate' then
    -- The room goes to voting with no vote yet, as opening a vote does: no
    -- motion, no speaker, both clocks cleared, and the General Speakers' List
    -- active again for when the vote is over. The chair opens the vote from
    -- the Vote view.
    update public.committee_state as state
    set mode = 'voting',
        current_motion_id = null,
        active_speakers_list_id = general_list_id,
        current_speaker_entry_id = null,
        current_vote_id = null,
        timer_total_seconds = null,
        timer_ends_at = null,
        timer_paused_remaining_seconds = null,
        caucus_total_seconds = null,
        caucus_ends_at = null,
        caucus_paused_remaining_seconds = null
    where state.committee_id = motion.committee_id;
  end if;

  -- introduce_document and other are recorded and change nothing more.

  return query select unnest(dropped_ids);
end;
$$;

revoke execute on function public.apply_passed_motion(uuid, integer, integer, timestamptz)
  from public, anon;
grant execute on function public.apply_passed_motion(uuid, integer, integer, timestamptz)
  to authenticated;


-- -----------------------------------------------------------------------------
-- start_single_speaker(committee_id, seat_id, speaker_name, purpose,
--                      speaking_time_seconds, pressed_at)
-- -----------------------------------------------------------------------------
-- "Give the floor" on the Single speaker view (S9, single-speaker.md). Not one
-- of D1's three, but the same kind of press, following the same rules.
--
-- The speaker is a seat of this committee or a typed name, never both. A
-- caucus, a single speaker or a closed vote the room was on ends with it, and
-- the speech in progress ends with its time. No motion is recorded: a single
-- speaker is the chair's call. The new speaker's clock is ready and paused, as
-- after "Next", so the chair starts it when the speech starts.

create or replace function public.start_single_speaker(
  committee_id uuid,
  seat_id uuid default null,
  speaker_name text default null,
  purpose text default null,
  speaking_time_seconds integer default null,
  pressed_at timestamptz default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  moment timestamptz := coalesce(start_single_speaker.pressed_at, now());
  typed_name text := nullif(btrim(start_single_speaker.speaker_name), '');
  room public.committee_state;
  single_list_id uuid;
  single_entry_id uuid;
begin
  if not public.is_committee_chair(start_single_speaker.committee_id) then
    raise exception 'Only a chair of this committee can give the floor.'
      using errcode = '42501';
  end if;

  select *
  into room
  from public.committee_state as state
  where state.committee_id = start_single_speaker.committee_id
  for update;

  if not exists (
    select 1
    from public.committee_sessions as session
    where session.id = room.current_session_id
      and session.status = 'in_progress'
  ) then
    raise exception 'No session is running.';
  end if;

  if room.mode = 'suspended' then
    raise exception 'Resume the session first.';
  end if;

  if exists (
    select 1
    from public.votes as vote
    where vote.session_id = room.current_session_id
      and vote.status = 'open'
  ) then
    raise exception 'Close the open vote first.';
  end if;

  if start_single_speaker.seat_id is null and typed_name is null then
    raise exception 'Choose a delegation or type a name.';
  end if;

  if start_single_speaker.seat_id is not null and typed_name is not null then
    raise exception 'Choose a delegation or type a name, not both.';
  end if;

  if start_single_speaker.seat_id is not null and not exists (
    select 1
    from public.seats as seat
    where seat.id = start_single_speaker.seat_id
      and seat.committee_id = start_single_speaker.committee_id
  ) then
    raise exception 'That seat is not part of this committee.';
  end if;

  if coalesce(start_single_speaker.speaking_time_seconds, 0) <= 0 then
    raise exception 'Choose how long the speaker has.';
  end if;

  -- The speech in progress ends, with how long it lasted.
  update public.speakers_list_entries as entry
  set status = 'spoken',
      finished_at = moment,
      spoke_seconds = greatest(
        0,
        list.speaking_time_seconds - coalesce(
          public.clock_seconds_left(room.timer_ends_at, room.timer_paused_remaining_seconds, moment),
          0
        )
      )
  from public.speakers_lists as list
  where entry.id = room.current_speaker_entry_id
    and entry.status = 'speaking'
    and list.id = entry.speakers_list_id;

  insert into public.speakers_lists (
    committee_id, session_id, motion_id, kind, name, purpose, speaking_time_seconds
  )
  values (
    start_single_speaker.committee_id,
    room.current_session_id,
    null,
    'single',
    'Single speaker',
    nullif(btrim(start_single_speaker.purpose), ''),
    start_single_speaker.speaking_time_seconds
  )
  returning id into single_list_id;

  insert into public.speakers_list_entries (
    speakers_list_id, seat_id, speaker_name, position, status, started_at
  )
  values (
    single_list_id,
    start_single_speaker.seat_id,
    typed_name,
    1,
    'speaking',
    moment
  )
  returning id into single_entry_id;

  update public.committee_state as state
  set mode = 'single_speaker',
      active_speakers_list_id = single_list_id,
      current_speaker_entry_id = single_entry_id,
      current_motion_id = null,
      current_vote_id = null,
      timer_total_seconds = start_single_speaker.speaking_time_seconds,
      timer_ends_at = null,
      timer_paused_remaining_seconds = start_single_speaker.speaking_time_seconds,
      caucus_total_seconds = null,
      caucus_ends_at = null,
      caucus_paused_remaining_seconds = null
  where state.committee_id = start_single_speaker.committee_id;
end;
$$;

revoke execute on function public.start_single_speaker(uuid, uuid, text, text, integer, timestamptz)
  from public, anon;
grant execute on function public.start_single_speaker(uuid, uuid, text, text, integer, timestamptz)
  to authenticated;
