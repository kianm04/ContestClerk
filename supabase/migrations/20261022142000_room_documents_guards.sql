-- =============================================================================
-- Committee room and documents guards (security review of 10 October 2026)
-- =============================================================================
-- docs/security-review-2026-10-10.md, findings L47, L48, L49, L50, L51, L58,
-- L21 and L22, one section each below, every one saying which hole it closes
-- and why it has the shape it has. The client changes that go with the last
-- two (the room's live channels and the amendments page) are in the same
-- commit, and client/tests/db/security-room-documents-guards.test.ts proves
-- each rule.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- L47: a closed vote is the record of what the committee decided
-- -----------------------------------------------------------------------------
-- Every write the room makes to a vote asks for status = 'open' first
-- (client/src/lib/server/votes.ts), and protect_vote_ties (20261008120100)
-- freezes a closed vote on a paper or an amendment, because closing it
-- settled the paper. A closed procedural vote, or a substantive one with a
-- typed subject, had no such guard: anybody holding run_room could rewrite
-- its counts and its result, delete it, or change and delete its roll call
-- answers, with no trace. The first two triggers below refuse a browser any
-- change to a closed vote and to the answers of one, and the third keeps a
-- browser from removing the session a closed vote belongs to, or moving it
-- to another committee.
--
-- No trigger is security definer, like protect_vote_ties and for the same
-- reason: current_user has to be the person's role. A deleted committee
-- takes its sessions and votes with it as the table's owner, and a
-- cancelled (open) vote takes its answers the same way, so those cascades
-- pass.
--
-- The trigger's name sorts after votes_protect_ties on purpose. Triggers of
-- the same kind run in the order of their names, so a closed vote on a paper
-- is still refused with protect_vote_ties' own sentence, which the paper
-- tests expect, and this one speaks for every other closed vote.

create or replace function public.protect_closed_votes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and old.status = 'closed' then
    raise exception 'A closed vote is the record of what the committee decided: it stays as it closed.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_closed_votes() from public, anon, authenticated;

create trigger votes_refuse_closed_changes
  before update or delete on public.votes
  for each row
  execute function public.protect_closed_votes();

-- The answers. vote_entries has no status of its own, so the vote is asked.
-- The read runs as the person, whose own select policy shows them the vote
-- they are writing an answer of; a vote they cannot see is one the entry
-- policies refuse anyway, so nothing is hidden from this check that matters.
--
-- An update asks about the vote the answer leaves as well as the one it goes
-- to. Moving an answer off a closed vote (update ... set vote_id) takes it out
-- of the record as surely as deleting it, and cancelling the open vote it was
-- moved onto would then erase it for good.

create or replace function public.protect_closed_vote_entries()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- The votes this write touches: the old row's on an update or a delete,
  -- the new row's on an insert or an update. A missing one is null.
  leaving_vote_id uuid := case when tg_op in ('UPDATE', 'DELETE') then old.vote_id end;
  joining_vote_id uuid := case when tg_op in ('INSERT', 'UPDATE') then new.vote_id end;
begin
  if current_user in ('anon', 'authenticated')
    and exists (
      select 1
      from public.votes as vote
      where vote.id in (leaving_vote_id, joining_vote_id)
        and vote.status = 'closed'
    )
  then
    raise exception 'A closed vote''s answers stay as they were given.' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_closed_vote_entries() from public, anon, authenticated;

create trigger vote_entries_refuse_closed_vote
  before insert or update or delete on public.vote_entries
  for each row
  execute function public.protect_closed_vote_entries();

-- The session. "A chair can remove a session that has not started" matches
-- only a scheduled session, because a session that has begun is the record
-- of what happened in the room, and the owner's cascade then takes
-- everything in it: its votes, closed ones too, and their answers. Two ways
-- round that rule were open to a run_room holder. A session could be put
-- back to scheduled once it had run, and then removed. And a vote can be
-- opened and closed in a session that never started (the insert policy asks
-- only that the session is the committee's), which the rule then let go.
--
-- A third way was the session's committee. "A chair can change a session"
-- asks for run_room on the committee before and after, so a chair of two
-- committees could move a session, ended or not, to the other one. The
-- roll call policies find their committee through the session, so its roll
-- calls went with it: to another conference's team, and out of sight of the
-- conference it was taken in. And once there, the other conference's owner
-- could remove it: a check for a closed vote that reads votes as the
-- remover does not see a vote of the first conference, so the cascade
-- erased it.
--
-- So a browser may move a session forward only, scheduled to in progress to
-- ended, as start_committee_session and endSession
-- (src/lib/server/committee-sessions.ts) do; may not move it to another
-- committee; and may not remove a session that holds a closed vote. The app
-- never moves one back, to another committee, or removes one with a closed
-- vote; the database's own user, the seeds and the test-site reset still
-- may.
--
-- Not security definer, for the reason the two above are not. The question
-- whether the session holds a closed vote is asked of
-- private.session_holds_closed_vote, which is, so that the answer does not
-- depend on which votes the remover may read. It lives in the private
-- schema, which the API does not serve (PostgREST serves only the schemas
-- supabase/config.toml lists under [api]), because the trigger runs as the
-- signed-in person, who therefore has to be allowed to execute it, and in
-- public it would be an RPC answering that question about any session.
-- 20261022150000_hide_public_role_helpers.sql makes the same schema with the
-- same grants; both say "if not exists" and grant the same, so either may
-- run first.

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.session_holds_closed_vote(session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.votes as vote
    where vote.session_id = session_holds_closed_vote.session_id
      and vote.status = 'closed'
  );
$$;

revoke execute on function private.session_holds_closed_vote(uuid) from public, anon;
grant execute on function private.session_holds_closed_vote(uuid) to authenticated;

create or replace function public.protect_committee_session_record()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- The order a session's status may only move forward in.
  status_order constant public.session_status[] := array[
    'scheduled', 'in_progress', 'ended'
  ]::public.session_status[];
begin
  if current_user not in ('anon', 'authenticated') then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.committee_id is distinct from old.committee_id then
      raise exception 'A session stays in the committee it was started in.'
        using errcode = '42501';
    end if;

    if array_position(status_order, new.status) < array_position(status_order, old.status) then
      raise exception 'A session that has started cannot go back to an earlier state.'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if private.session_holds_closed_vote(old.id) then
    raise exception 'A session that holds a closed vote is part of the record: it cannot be removed.'
      using errcode = '42501';
  end if;

  return old;
end;
$$;

revoke execute on function public.protect_committee_session_record() from public, anon, authenticated;

create trigger committee_sessions_keep_record
  before update or delete on public.committee_sessions
  for each row
  execute function public.protect_committee_session_record();


-- -----------------------------------------------------------------------------
-- L48: a vote opens open, and with no result
-- -----------------------------------------------------------------------------
-- "A chair can open a vote" asked about the session and the motion and
-- nothing about the row's state, so a run_room holder could insert a vote
-- already closed with a result of their choosing. settle_vote_paper never
-- ran for it, since that fires on the change from open to closed, and under
-- L47 the row was permanent the moment it was written. The policy is as
-- 20261007180000 left it, with the state of a vote being opened added: open,
-- uncounted, undecided.

alter policy "A chair can open a vote"
  on public.votes
  with check (
    public.has_committee_permission(committee_id, 'run_room')
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
    and votes.status = 'open'
    and votes.votes_for is null
    and votes.votes_against is null
    and votes.votes_abstain is null
    and votes.passed is null
    and votes.closed_at is null
  );


-- -----------------------------------------------------------------------------
-- L49: a position paper always says where its review stands
-- -----------------------------------------------------------------------------
-- review_status has no default, because a default would put a review on
-- every guide and resource too (20260921120000). The upload action writes
-- 'submitted', the seed files write one and the tests do, so nothing wrote
-- a null; but nothing refused one either, and protect_documents_columns
-- compared the new status with "=", so a null arriving with a new file made
-- is_review_reset null and the guard waved the row through: a paper neither
-- submitted nor sent back, which no page could place. The check closes the
-- column, and the guard below compares with "is not distinct from".
--
-- A paper left without a status is put back to submitted first, the state a
-- new upload starts in, so that a database holding one does not fail the
-- constraint. A fresh database has none, and the update changes nothing.

update public.documents
set review_status = 'submitted'
where kind = 'position_paper'
  and review_status is null;

alter table public.documents
  add constraint documents_position_paper_has_review_status
    check (kind <> 'position_paper' or review_status is not null);


-- -----------------------------------------------------------------------------
-- L50: the uploader of a guide or a resource keeps no rights of their own
-- -----------------------------------------------------------------------------
-- Two policies named uploaded_by: "Uploaders and administrators can change a
-- guide or shared file" and "An uploader can remove a file nobody has
-- reviewed". A chair who uploaded the background guide, or a document
-- manager who uploaded a resource, kept changing and removing it after
-- losing the role, for as long as the row lived. A file's rights follow a
-- permission somebody holds today, not who pressed upload once.
--
-- Committee editors (manage_committees) have their own policies for the
-- guide and document managers (manage_documents) for the resources, and an
-- administrator changes and removes any file of the conference. What is
-- left to say here is the administrator's half of the old update policy,
-- and the delegate's half of the old delete policy: a delegate takes back
-- their own paper while it still waits for review and the deadline is open,
-- exactly as before. (review_status = 'submitted' alone, since L49 above
-- means a paper's status is never null.)

drop policy "Uploaders and administrators can change a guide or shared file" on public.documents;

create policy "Administrators can change a guide or shared file"
  on public.documents
  for update
  to authenticated
  using (
    kind in ('background_guide', 'resource')
    and public.has_permission(conference_id, 'administrator')
  )
  with check (
    kind in ('background_guide', 'resource')
    and public.has_permission(conference_id, 'administrator')
  );

drop policy "An uploader can remove a file nobody has reviewed" on public.documents;

create policy "A delegate can remove their own paper while it waits for review"
  on public.documents
  for delete
  to authenticated
  using (
    kind = 'position_paper'
    and uploaded_by = (select auth.uid())
    and review_status = 'submitted'
    and exists (
      select 1
      from public.conferences as conference
      where conference.id = documents.conference_id
        and (conference.position_paper_deadline is null
             or now() <= conference.position_paper_deadline)
    )
  );


-- -----------------------------------------------------------------------------
-- L51 (and L49): protect_documents_columns, replaced
-- -----------------------------------------------------------------------------
-- The body is 20261007180000's with two changes. A review_papers holder
-- returned early with the whole row open to them, so a reviewer could
-- replace a delegate's file or retitle their paper, not only review it. Now
-- a reviewer who did not upload the paper may change the four review columns
-- and nothing else; updated_at is left out of the comparison because
-- documents_set_updated_at stamps it after this trigger. And is_review_reset
-- is written with "is not distinct from", so a null status compares false
-- rather than null (L49).
--
-- Guides and resources are decided by their policies alone, as before: the
-- review columns are null on them (documents_review_is_for_papers), so the
-- review rules have nothing to say, and the kind is answered first. Still
-- not security definer: current_user has to be the person's role, and
-- move_delegate, which really moves a paper between seats, runs as the owner
-- and passes.

create or replace function public.protect_documents_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  writable constant text[] := array[
    'title', 'storage_path', 'file_name', 'file_size_bytes', 'mime_type',
    'body_markdown', 'audience', 'review_status', 'review_comment',
    'reviewed_by', 'reviewed_at', 'updated_at'
  ];
  review_columns constant text[] := array[
    'review_status', 'review_comment', 'reviewed_by', 'reviewed_at', 'updated_at'
  ];
  is_new_version boolean;
  is_review_unchanged boolean;
  is_review_reset boolean;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if to_jsonb(new) - writable is distinct from to_jsonb(old) - writable then
    raise exception
      'A document cannot be turned into another kind, or moved to another conference, committee, seat or owner';
  end if;

  if new.kind <> 'position_paper' then
    return new;
  end if;

  -- A paper's reviewers write its review, and only the review: the paper is
  -- the delegate's own work. A reviewer who uploaded the paper themselves is
  -- its delegate here and follows the rules below like any other.
  if public.has_committee_permission(new.committee_id, 'review_papers')
    and new.uploaded_by is distinct from (select auth.uid())
  then
    if to_jsonb(new) - review_columns is distinct from to_jsonb(old) - review_columns then
      raise exception 'A reviewer writes the review of a position paper and nothing else of it'
        using errcode = '42501';
    end if;

    return new;
  end if;

  is_new_version :=
    new.storage_path is distinct from old.storage_path
    or new.body_markdown is distinct from old.body_markdown;

  is_review_unchanged :=
    new.review_status is not distinct from old.review_status
    and new.review_comment is not distinct from old.review_comment
    and new.reviewed_by is not distinct from old.reviewed_by
    and new.reviewed_at is not distinct from old.reviewed_at;

  is_review_reset :=
    new.review_status is not distinct from 'submitted'::public.review_status
    and new.review_comment is null
    and new.reviewed_by is null
    and new.reviewed_at is null;

  if is_new_version and not is_review_reset then
    raise exception
      'Only a chair of this committee can review a position paper: a new file goes back to submitted';
  end if;

  if not is_new_version and not is_review_unchanged then
    raise exception 'Only a chair of this committee can review a position paper';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_documents_columns() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- L58: a moved event tells its audience once per half hour
-- -----------------------------------------------------------------------------
-- notify_schedule_changed told the whole audience on every change to the
-- start, the end or the room of an event inside the next 24 hours. An
-- organiser nudging a session four times in a minute, or one PATCH over a
-- morning's events, rang every phone each time. last_notified_at remembers
-- when an event last told its audience, and a change within thirty minutes
-- of that says nothing more; the change itself still goes through, only the
-- bell is kept quiet.
--
-- The trigger sets the column itself, so it becomes a before trigger (only a
-- before trigger may change the row being written), under its old name. A
-- browser may not write the column, or an editor could silence an event for
-- ever or ring it twice: guard_schedule_event_notified_at refuses that. The
-- guard cannot live inside notify_schedule_changed, which is security
-- definer and so cannot tell a browser from the database's own user. Its
-- trigger's name sorts before the notify trigger's on purpose, so it reads
-- what the browser sent and not what the trigger then set.

alter table public.schedule_events
  add column last_notified_at timestamptz;

comment on column public.schedule_events.last_notified_at is
  'When notify_schedule_changed last told the audience this event moved. Null until it has.';

create or replace function public.guard_schedule_event_notified_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and (
    (tg_op = 'INSERT' and new.last_notified_at is not null)
    or (tg_op = 'UPDATE' and new.last_notified_at is distinct from old.last_notified_at)
  ) then
    raise exception 'Only the database says when an event last told its audience.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_schedule_event_notified_at() from public, anon, authenticated;

create trigger schedule_events_guard_notified_at
  before insert or update on public.schedule_events
  for each row
  execute function public.guard_schedule_event_notified_at();

-- The body is 20260921120000's, with the cool-down and the stamp added.

drop trigger schedule_events_notify_changed on public.schedule_events;

create or replace function public.notify_schedule_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conference_slug text;
  conference_timezone text;
  short_title text;
  moved_to text;
begin
  if new.starts_at is not distinct from old.starts_at
    and new.ends_at is not distinct from old.ends_at
    and new.location is not distinct from old.location
  then
    return new;
  end if;

  if not (
    old.starts_at between now() and now() + interval '24 hours'
    or new.starts_at between now() and now() + interval '24 hours'
  ) then
    return new;
  end if;

  -- The cool-down: told within the last half hour, the audience hears
  -- nothing more about this event until the half hour is up.
  if old.last_notified_at is not null
    and old.last_notified_at > now() - interval '30 minutes'
  then
    return new;
  end if;

  select conference.slug, conference.timezone
  into conference_slug, conference_timezone
  from public.conferences as conference
  where conference.id = new.conference_id;

  short_title := case
    when char_length(new.title) <= 70 then new.title
    else left(new.title, 69) || '…'
  end;

  moved_to := to_char(new.starts_at at time zone conference_timezone, 'FMDD Mon, HH24:MI');

  insert into public.notifications (user_id, conference_id, kind, title, link_path)
  select
    recipient,
    new.conference_id,
    'schedule_changed',
    short_title || ' moved to ' || moved_to,
    '/conferences/' || conference_slug || '/schedule'
  from public.conference_audience_user_ids(
    new.conference_id,
    new.audience,
    new.committee_id,
    null
  ) as recipient
  where recipient is distinct from (select auth.uid());

  new.last_notified_at := now();

  return new;
end;
$$;

revoke execute on function public.notify_schedule_changed() from public, anon, authenticated;

create trigger schedule_events_notify_changed
  before update of starts_at, ends_at, location on public.schedule_events
  for each row
  execute function public.notify_schedule_changed();


-- -----------------------------------------------------------------------------
-- L21: the room's tables are closed to visitors
-- -----------------------------------------------------------------------------
-- Realtime applies a table's select policy to the inserts and updates it
-- sends, but a delete carries only the row's primary key, and no policy can
-- be asked about a row that is gone: it goes to every subscriber whose role
-- may read the table at all. The nine room tables kept the default grants to
-- anon, so a channel joined with the publishable key alone heard every
-- delete of every room, and the code's comments said Row Level Security hid
-- everything from a visitor. No visitor has any business in a committee
-- room: every page of it signs the reader in first (requireRoomWatcher), and
-- no policy on these tables names anon. Without the grants a visitor's
-- subscription is refused outright, deletes included, and PostgREST answers
-- a visitor's select with "permission denied".

revoke all on table
  public.committee_state,
  public.committee_sessions,
  public.speakers_lists,
  public.speakers_list_entries,
  public.motions,
  public.votes,
  public.roll_calls,
  public.roll_call_entries,
  public.vote_entries
from anon;


-- -----------------------------------------------------------------------------
-- L22: committee_paper_seats and amendment_seats leave the publication
-- -----------------------------------------------------------------------------
-- The same delete reached every signed-in person for these two tables: who
-- left which paper, which sponsor's answer went, by primary key, in every
-- committee of every conference. Nothing listened to committee_paper_seats;
-- the amendments page listened to amendment_seats so a proposer saw the
-- sponsors' answers arrive (20261009130000). Both leave the publication, and
-- a change to either row now touches the paper or the amendment it belongs
-- to instead, which the pages do hear: the amendments page through the
-- draft's amendments, filtered on the paper, and a paper's row wherever it
-- is listened to. amendments gains updated_at for that, kept by the same
-- set_updated_at as every other table's, since committee_papers already has
-- one. The touches run as the database's own user, the way
-- apply_amendment_to_paper touches the paper's updated_at, so the column
-- guard on committee_papers lets them through whoever wrote the seat.
--
-- "Only when it is there": the local database is shared between worktrees,
-- as 20261009130000 says, so a publication already changed by hand must not
-- fail this migration.

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'committee_paper_seats'
  ) then
    alter publication supabase_realtime drop table public.committee_paper_seats;
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'amendment_seats'
  ) then
    alter publication supabase_realtime drop table public.amendment_seats;
  end if;
end;
$$;

alter table public.amendments
  add column updated_at timestamptz not null default now();

comment on column public.amendments.updated_at is
  'When the amendment, or a sponsor''s answer or a seat''s support of it, last changed.';

create trigger amendments_set_updated_at
  before update on public.amendments
  for each row
  execute function public.set_updated_at();

create or replace function public.touch_paper_for_seat_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.committee_papers as paper
  set updated_at = now()
  where paper.id = case when tg_op = 'DELETE' then old.paper_id else new.paper_id end;

  return null;
end;
$$;

revoke execute on function public.touch_paper_for_seat_change() from public, anon, authenticated;

create trigger committee_paper_seats_touch_paper
  after insert or update or delete on public.committee_paper_seats
  for each row
  execute function public.touch_paper_for_seat_change();

create or replace function public.touch_amendment_for_seat_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.amendments as amendment
  set updated_at = now()
  where amendment.id = case when tg_op = 'DELETE' then old.amendment_id else new.amendment_id end;

  return null;
end;
$$;

revoke execute on function public.touch_amendment_for_seat_change() from public, anon, authenticated;

create trigger amendment_seats_touch_amendment
  after insert or update or delete on public.amendment_seats
  for each row
  execute function public.touch_amendment_for_seat_change();
