-- Step 8 of docs/roles-and-permissions.md: committees and rooms.
--
-- Until now the committee tables asked the two helpers step 1 redefined:
-- is_committee_chair, which means run_room, and can_manage_conference, which
-- means administrator. Each now asks its own permission (section 4):
--
--   manage_committees   committees, their seats and background guides
--   run_room            the room tables and the functions that run the room
--   review_papers       the committee's position papers
--   write_chair_notes   chair_notes
--   propose_awards      proposing an award for a seat of the committee
--   confirm_awards      confirming any award and publishing them all
--
-- Every permission but confirm_awards may be held per committee, which
-- has_committee_permission answers. The room tables keep their policies and
-- only name run_room outright, so nobody gains or loses the room.


-- -----------------------------------------------------------------------------
-- committees
-- -----------------------------------------------------------------------------
-- Conference-wide, manage_committees adds and deletes committees and changes
-- every column. Held per committee it changes that committee's description
-- and agenda and nothing else, which protect_committees_columns enforces,
-- because a policy cannot tell one column from another.

drop policy "Organisers can add a committee" on public.committees;
drop policy "Organisers can change a committee" on public.committees;
drop policy "Organisers can delete a committee nobody sits in" on public.committees;

create policy "Committee editors can add a committee"
  on public.committees
  for insert
  to authenticated
  with check (public.has_permission(conference_id, 'manage_committees'));

create policy "Committee editors can change the committees they edit"
  on public.committees
  for update
  to authenticated
  using (id in (select public.permitted_committee_ids('manage_committees')))
  with check (id in (select public.permitted_committee_ids('manage_committees')));

create policy "Committee editors can delete a committee nobody sits in"
  on public.committees
  for delete
  to authenticated
  using (
    public.has_permission(conference_id, 'manage_committees')
    and not public.committee_has_delegates(id)
  );

create or replace function public.protect_committees_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- What somebody who edits only their own committees may change.
  per_committee constant text[] := array['description', 'topics', 'updated_at'];
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.conference_id is distinct from old.conference_id then
    raise exception 'A committee cannot be moved to another conference';
  end if;

  if not public.has_permission(new.conference_id, 'manage_committees')
    and to_jsonb(new) - per_committee is distinct from to_jsonb(old) - per_committee
  then
    raise exception
      'Only the people who edit every committee can change more than its description and agenda';
  end if;

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- seats
-- -----------------------------------------------------------------------------
-- The seat list is part of the committee, so it is conference-wide
-- manage_committees'. Seating a delegate goes through the allocation
-- functions, which ask decide_applications themselves.

drop policy "Organisers can add a seat" on public.seats;
drop policy "Organisers can change a seat" on public.seats;
drop policy "Organisers can delete a seat nobody sits in" on public.seats;

create policy "Committee editors can add a seat"
  on public.seats
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.committees as committee
      where committee.id = seats.committee_id
        and public.has_permission(committee.conference_id, 'manage_committees')
    )
  );

create policy "Committee editors can change a seat"
  on public.seats
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.committees as committee
      where committee.id = seats.committee_id
        and public.has_permission(committee.conference_id, 'manage_committees')
    )
  )
  with check (
    exists (
      select 1
      from public.committees as committee
      where committee.id = seats.committee_id
        and public.has_permission(committee.conference_id, 'manage_committees')
    )
  );

create policy "Committee editors can delete a seat nobody sits in"
  on public.seats
  for delete
  to authenticated
  using (
    user_id is null
    and exists (
      select 1
      from public.committees as committee
      where committee.id = seats.committee_id
        and public.has_permission(committee.conference_id, 'manage_committees')
    )
  );


-- -----------------------------------------------------------------------------
-- awards
-- -----------------------------------------------------------------------------
-- propose_awards proposes for a seat of the committee, and rewords or
-- withdraws the holder's own proposal while it is still proposed.
-- confirm_awards counts only conference-wide: its holder reads every
-- committee's awards, adds one (proposed, then confirmed, as the awards page
-- has always done), and confirms, rejects or deletes any of them.
-- protect_awards_columns keeps the status change to confirm_awards.

-- Every committee of the conferences where the caller confirms awards, in
-- set form so the policies below ask once per query.
create or replace function public.confirmable_committee_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select committee.id
  from public.committees as committee
  where committee.conference_id in (select public.permitted_conference_ids('confirm_awards'));
$$;

revoke execute on function public.confirmable_committee_ids() from public, anon;
grant execute on function public.confirmable_committee_ids() to authenticated;

drop policy "Chairs and organisers can read every award of their committee" on public.awards;
drop policy "A chair can propose an award for a seat of their own committee" on public.awards;
drop policy "A chair edits their own proposal and an organiser confirms any" on public.awards;
drop policy "A chair can delete their own proposal and an organiser any awar" on public.awards;

create policy "Proposers and confirmers can read a committee's awards"
  on public.awards
  for select
  to authenticated
  using (
    committee_id in (select public.permitted_committee_ids('propose_awards'))
    or committee_id in (select public.confirmable_committee_ids())
  );

create policy "Proposers and confirmers can add an award for a seat"
  on public.awards
  for insert
  to authenticated
  with check (
    (
      public.has_committee_permission(committee_id, 'propose_awards')
      or committee_id in (select public.confirmable_committee_ids())
    )
    and exists (
      select 1
      from public.seats as seat
      where seat.id = awards.seat_id
        and seat.committee_id = awards.committee_id
    )
  );

create policy "A proposer edits their own proposal and a confirmer any award"
  on public.awards
  for update
  to authenticated
  using (
    (
      public.has_committee_permission(committee_id, 'propose_awards')
      and status = 'proposed'
      and created_by = (select auth.uid())
    )
    or committee_id in (select public.confirmable_committee_ids())
  )
  with check (
    exists (
      select 1
      from public.seats as seat
      where seat.id = awards.seat_id
        and seat.committee_id = awards.committee_id
    )
    and (
      (
        public.has_committee_permission(committee_id, 'propose_awards')
        and status = 'proposed'
        and created_by = (select auth.uid())
      )
      or committee_id in (select public.confirmable_committee_ids())
    )
  );

create policy "A proposer deletes their own proposal and a confirmer any award"
  on public.awards
  for delete
  to authenticated
  using (
    (
      public.has_committee_permission(committee_id, 'propose_awards')
      and status = 'proposed'
      and created_by = (select auth.uid())
    )
    or committee_id in (select public.confirmable_committee_ids())
  );


-- -----------------------------------------------------------------------------
-- set_awards_published_at(conference_id, published_at)
-- -----------------------------------------------------------------------------
-- When the awards are published is a column of the conference row, whose
-- update policy belongs to edit_conference. Publishing is confirm_awards',
-- so it is written here, past that policy, and protect_conferences_columns
-- below stops an editor of the conference writing the column directly. The
-- triggers that notify the recipients and freeze the award holders fire as
-- they always have. Null hides the awards again.

create or replace function public.set_awards_published_at(
  conference_id uuid,
  published_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission(set_awards_published_at.conference_id, 'confirm_awards') then
    raise exception 'Only the people who confirm awards can publish them';
  end if;

  update public.conferences as conference
  set awards_published_at = set_awards_published_at.published_at
  where conference.id = set_awards_published_at.conference_id;
end;
$$;

revoke execute on function public.set_awards_published_at(uuid, timestamptz) from public, anon;
grant execute on function public.set_awards_published_at(uuid, timestamptz) to authenticated;

create or replace function public.protect_conferences_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id then
    raise exception 'A conference cannot be moved to another organisation';
  end if;

  -- set_awards_published_at runs as its owner, so it never reaches this.
  if new.awards_published_at is distinct from old.awards_published_at
    and not public.has_permission(new.id, 'confirm_awards')
  then
    raise exception 'Only the people who confirm awards can publish them';
  end if;

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- chair_notes
-- -----------------------------------------------------------------------------
-- write_chair_notes reads the committee's notes and writes the holder's own;
-- co-chairs read each other's (section 10, decision 5). An administrator may
-- still delete any note, as an organiser could.

drop policy "Chairs and organisers can read the notes of their committee" on public.chair_notes;
drop policy "A chair can write a note about a seat of their own committee" on public.chair_notes;
drop policy "The author can edit their own note" on public.chair_notes;
drop policy "The author or an organiser can delete a note" on public.chair_notes;

create policy "Note keepers can read the notes of their committee"
  on public.chair_notes
  for select
  to authenticated
  using (committee_id in (select public.permitted_committee_ids('write_chair_notes')));

create policy "A note keeper can write a note about a seat of the committee"
  on public.chair_notes
  for insert
  to authenticated
  with check (
    public.has_committee_permission(committee_id, 'write_chair_notes')
    and author_id = (select auth.uid())
    and exists (
      select 1
      from public.seats as seat
      where seat.id = chair_notes.seat_id
        and seat.committee_id = chair_notes.committee_id
    )
  );

create policy "The author can edit their own note"
  on public.chair_notes
  for update
  to authenticated
  using (author_id = (select auth.uid()))
  with check (
    author_id = (select auth.uid())
    and public.has_committee_permission(committee_id, 'write_chair_notes')
    and exists (
      select 1
      from public.seats as seat
      where seat.id = chair_notes.seat_id
        and seat.committee_id = chair_notes.committee_id
    )
  );

create policy "The author or an administrator can delete a note"
  on public.chair_notes
  for delete
  to authenticated
  using (
    author_id = (select auth.uid())
    or public.has_permission(
      (select committee.conference_id
       from public.committees as committee
       where committee.id = chair_notes.committee_id),
      'administrator'
    )
  );


-- -----------------------------------------------------------------------------
-- documents
-- -----------------------------------------------------------------------------
-- review_papers reads and reviews the committee's position papers.
-- manage_committees uploads, changes and removes the committee's background
-- guide. The shared files are manage_documents' since step 7. What was the
-- organisers' (every file read and removed, and a file changed by more than
-- its uploader) stays with administrators.

drop policy "Chairs and organisers can read a position paper" on public.documents;
drop policy "Chairs can review a position paper" on public.documents;
drop policy "Organisers can review a position paper" on public.documents;
drop policy "Chairs can read their own committee's background guide" on public.documents;
drop policy "Chairs can upload a background guide for their committee" on public.documents;
drop policy "Chairs can change their committee's background guide" on public.documents;
drop policy "Chairs can remove their committee's background guide" on public.documents;
drop policy "Organisers can read every file of their conference" on public.documents;
drop policy "Organisers can remove any file of their conference" on public.documents;
drop policy "Organisers can upload a file for their conference" on public.documents;
drop policy "Uploaders and organisers can change a file" on public.documents;

create policy "Paper reviewers can read the committee's position papers"
  on public.documents
  for select
  to authenticated
  using (
    kind = 'position_paper'
    and committee_id in (select public.permitted_committee_ids('review_papers'))
  );

create policy "Paper reviewers can review a position paper"
  on public.documents
  for update
  to authenticated
  using (
    kind = 'position_paper'
    and public.has_committee_permission(committee_id, 'review_papers')
  )
  with check (
    kind = 'position_paper'
    and public.has_committee_permission(committee_id, 'review_papers')
  );

create policy "Committee editors can read the committee's background guide"
  on public.documents
  for select
  to authenticated
  using (
    kind = 'background_guide'
    and committee_id in (select public.permitted_committee_ids('manage_committees'))
  );

create policy "Committee editors can upload the committee's background guide"
  on public.documents
  for insert
  to authenticated
  with check (
    kind = 'background_guide'
    and uploaded_by = (select auth.uid())
    and public.has_committee_permission(committee_id, 'manage_committees')
  );

create policy "Committee editors can change the committee's background guide"
  on public.documents
  for update
  to authenticated
  using (
    kind = 'background_guide'
    and public.has_committee_permission(committee_id, 'manage_committees')
  )
  with check (
    kind = 'background_guide'
    and public.has_committee_permission(committee_id, 'manage_committees')
  );

create policy "Committee editors can remove the committee's background guide"
  on public.documents
  for delete
  to authenticated
  using (
    kind = 'background_guide'
    and public.has_committee_permission(committee_id, 'manage_committees')
  );

create policy "Administrators can read every file of their conference"
  on public.documents
  for select
  to authenticated
  using (conference_id in (select public.permitted_conference_ids('administrator')));

create policy "Administrators can remove any file of their conference"
  on public.documents
  for delete
  to authenticated
  using (public.has_permission(conference_id, 'administrator'));

create policy "Uploaders and administrators can change a guide or shared file"
  on public.documents
  for update
  to authenticated
  using (
    kind in ('background_guide', 'resource')
    and (uploaded_by = (select auth.uid()) or public.has_permission(conference_id, 'administrator'))
  )
  with check (
    kind in ('background_guide', 'resource')
    and (uploaded_by = (select auth.uid()) or public.has_permission(conference_id, 'administrator'))
  );


-- -----------------------------------------------------------------------------
-- Functions that guard papers, guides, awards and seats
-- -----------------------------------------------------------------------------
-- protect_documents_columns lets a paper's reviewers write its review.
-- may_upload_conference_document and may_change_conference_document give the
-- background-guides folder to manage_committees and the position-papers
-- folder to review_papers. protect_awards_columns keeps confirming to
-- confirm_awards, and set_seat_availability gives the seat list to
-- manage_committees beside decide_applications.

CREATE OR REPLACE FUNCTION public.protect_documents_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  writable constant text[] := array[
    'title', 'storage_path', 'file_name', 'file_size_bytes', 'mime_type',
    'body_markdown', 'audience', 'review_status', 'review_comment',
    'reviewed_by', 'reviewed_at', 'updated_at'
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

  -- A paper's reviewers write its review; nobody else may touch it.
  if public.has_committee_permission(new.committee_id, 'review_papers') then
    return new;
  end if;

  if new.kind <> 'position_paper' then
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
    new.review_status = 'submitted'::public.review_status
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
$function$;

CREATE OR REPLACE FUNCTION public.may_upload_conference_document(object_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  folders text[] := storage.foldername(object_name);
  the_conference uuid;
  kind_folder text;
  path_prefix text;
  file_name text;
  owner_id uuid;
begin
  -- Every path this bucket accepts is "<conference id>/<kind>/<file name>".
  -- Anything shorter or deeper belongs to nobody.
  if coalesce(array_length(folders, 1), 0) <> 2 then
    return false;
  end if;

  -- The path is text a browser sent us, so an id that is not a uuid is refused
  -- rather than allowed to raise an error.
  begin
    the_conference := folders[1]::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  kind_folder := folders[2];

  -- storage.foldername leaves the file name out, so it is cut off the end of
  -- the path by hand: everything after "<conference id>/<kind folder>/".
  path_prefix := folders[1] || '/' || folders[2] || '/';
  file_name := substring(object_name from length(path_prefix) + 1);

  if kind_folder = 'resources' then
    return public.has_permission(the_conference, 'manage_documents');
  end if;

  -- The two kinds that belong to something smaller than the conference start
  -- their file name with that thing's id, which is 36 characters of uuid.
  begin
    owner_id := substring(file_name from 1 for 36)::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  if kind_folder = 'position-papers' then
    return exists (
      select 1
      from public.seats as seat
      join public.committees as committee on committee.id = seat.committee_id
      where seat.id = owner_id
        and seat.user_id = (select auth.uid())
        and committee.conference_id = the_conference
    );
  end if;

  if kind_folder = 'background-guides' then
    return public.has_committee_permission(owner_id, 'manage_committees')
      and exists (
        select 1
        from public.committees as committee
        where committee.id = owner_id
          and committee.conference_id = the_conference
      );
  end if;

  -- A folder we have never heard of. Nobody owns it, so nobody may write it.
  return false;
end;
$function$;

CREATE OR REPLACE FUNCTION public.may_change_conference_document(object_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  folders text[] := storage.foldername(object_name);
  the_conference uuid;
  kind_folder text;
  path_prefix text;
  file_name text;
  owner_id uuid;
begin
  if coalesce(array_length(folders, 1), 0) <> 2 then
    return false;
  end if;

  begin
    the_conference := folders[1]::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  kind_folder := folders[2];

  -- storage.foldername leaves the file name out, so it is cut off the end of
  -- the path by hand: everything after "<conference id>/<kind folder>/".
  path_prefix := folders[1] || '/' || folders[2] || '/';
  file_name := substring(object_name from length(path_prefix) + 1);

  if kind_folder = 'resources' then
    return public.has_permission(the_conference, 'manage_documents');
  end if;

  begin
    owner_id := substring(file_name from 1 for 36)::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  if kind_folder = 'position-papers' then
    return exists (
      select 1
      from public.seats as seat
      join public.committees as committee on committee.id = seat.committee_id
      where seat.id = owner_id
        and committee.conference_id = the_conference
        and public.has_committee_permission(seat.committee_id, 'review_papers')
    );
  end if;

  if kind_folder = 'background-guides' then
    return public.has_committee_permission(owner_id, 'manage_committees')
      and exists (
        select 1
        from public.committees as committee
        where committee.id = owner_id
          and committee.conference_id = the_conference
      );
  end if;

  return false;
end;
$function$;

CREATE OR REPLACE FUNCTION public.protect_awards_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    and not public.has_permission(
      (select committee.conference_id
       from public.committees as committee
       where committee.id = old.committee_id),
      'confirm_awards'
    )
  then
    raise exception
      'Only the people who confirm awards can confirm or unconfirm one';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_seat_availability(seat_id uuid, is_available boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  seat_conference uuid;
begin
  select committee.conference_id
  into seat_conference
  from public.seats as seat
  join public.committees as committee on committee.id = seat.committee_id
  where seat.id = set_seat_availability.seat_id;

  if seat_conference is null then
    raise exception 'That seat does not exist';
  end if;

  -- Whoever decides applications offers seats; whoever edits every committee
  -- keeps the seat list itself.
  if not public.has_permission(seat_conference, 'decide_applications')
    and not public.has_permission(seat_conference, 'manage_committees')
  then
    raise exception 'Only the organisers of this conference can hide or offer a seat';
  end if;

  update public.seats
  set is_available = set_seat_availability.is_available
  where id = set_seat_availability.seat_id;
end;
$function$;


-- -----------------------------------------------------------------------------
-- The room, by name
-- -----------------------------------------------------------------------------
-- The same rules as before, asking run_room outright: the room tables, the
-- committee's own announcements and events, which its chairs read, and the
-- functions the chair console calls. conference_audience_user_ids still lets
-- whoever runs a room see who sits in it.

CREATE OR REPLACE FUNCTION public.start_committee_session(committee_id uuid, name text, pressed_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  moment timestamptz := coalesce(start_committee_session.pressed_at, now());
  session_name text := btrim(coalesce(start_committee_session.name, ''));
  speaking_seconds integer;
  new_session_id uuid;
  general_list_id uuid;
begin
  if not public.has_committee_permission(start_committee_session.committee_id, 'run_room') then
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
$function$;

CREATE OR REPLACE FUNCTION public.start_single_speaker(committee_id uuid, seat_id uuid DEFAULT NULL::uuid, speaker_name text DEFAULT NULL::text, purpose text DEFAULT NULL::text, speaking_time_seconds integer DEFAULT NULL::integer, pressed_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  moment timestamptz := coalesce(start_single_speaker.pressed_at, now());
  typed_name text := nullif(btrim(start_single_speaker.speaker_name), '');
  room public.committee_state;
  single_list_id uuid;
  single_entry_id uuid;
begin
  if not public.has_committee_permission(start_single_speaker.committee_id, 'run_room') then
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
$function$;

CREATE OR REPLACE FUNCTION public.call_next_speaker(committee_id uuid, speaking_entry_id uuid DEFAULT NULL::uuid, pressed_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  moment timestamptz := coalesce(call_next_speaker.pressed_at, now());
  room public.committee_state;
  latest_roll_call_id uuid;
  next_entry_id uuid;
  list_speaking_seconds integer;
begin
  if not public.has_committee_permission(call_next_speaker.committee_id, 'run_room') then
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
$function$;

CREATE OR REPLACE FUNCTION public.apply_passed_motion(motion_id uuid, votes_for integer DEFAULT NULL::integer, votes_against integer DEFAULT NULL::integer, pressed_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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

  if not public.has_committee_permission(motion.committee_id, 'run_room') then
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
$function$;

CREATE OR REPLACE FUNCTION public.conference_audience_user_ids(conference_id uuid, audience audience, committee_id uuid DEFAULT NULL::uuid, delegation_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- The two audiences that name one committee or one delegation have to name
  -- one of this conference's, or the gate below would be asked about the
  -- wrong conference.
  if conference_audience_user_ids.audience = 'committee'
    and not exists (
      select 1
      from public.committees as committee
      where committee.id = conference_audience_user_ids.committee_id
        and committee.conference_id = conference_audience_user_ids.conference_id
    )
  then
    raise exception 'That committee is not part of this conference';
  end if;

  if conference_audience_user_ids.audience = 'delegation'
    and not exists (
      select 1
      from public.delegations as delegation
      where delegation.id = conference_audience_user_ids.delegation_id
        and delegation.conference_id = conference_audience_user_ids.conference_id
    )
  then
    raise exception 'That delegation is not part of this conference';
  end if;

  -- Who is taking part is the team's to know, and of the team only those who
  -- may address that audience.
  if conference_audience_user_ids.audience = 'committee' then
    if not (
      public.has_committee_permission(conference_audience_user_ids.committee_id, 'send_announcements')
      or public.has_committee_permission(conference_audience_user_ids.committee_id, 'edit_schedule')
      or public.has_committee_permission(conference_audience_user_ids.committee_id, 'run_room')
    ) then
      raise exception 'Only the organisers of a conference can see who takes part in it';
    end if;
  elsif not (
    public.has_permission(conference_audience_user_ids.conference_id, 'send_announcements')
    or public.has_permission(conference_audience_user_ids.conference_id, 'edit_schedule')
  ) then
    raise exception 'Only the organisers of a conference can see who takes part in it';
  end if;

  return query
  -- Everybody sitting in a committee of this conference.
  select seat.user_id
  from public.seats as seat
  join public.committees as committee on committee.id = seat.committee_id
  where committee.conference_id = conference_audience_user_ids.conference_id
    and seat.user_id is not null
    and conference_audience_user_ids.audience in ('everyone', 'delegates')

  union

  -- Everybody in a delegation of this conference, seated or not yet.
  select membership.user_id
  from public.delegation_members as membership
  join public.delegations as delegation on delegation.id = membership.delegation_id
  where delegation.conference_id = conference_audience_user_ids.conference_id
    and conference_audience_user_ids.audience in ('everyone', 'delegates')

  union

  -- The team: staff rows plus the members of the organisation running it.
  select staff.user_id
  from public.conference_staff as staff
  where staff.conference_id = conference_audience_user_ids.conference_id
    and conference_audience_user_ids.audience in ('everyone', 'staff')

  union

  select membership.user_id
  from public.organization_members as membership
  join public.conferences as conference
    on conference.organization_id = membership.organization_id
  where conference.id = conference_audience_user_ids.conference_id
    and conference_audience_user_ids.audience in ('everyone', 'staff')

  union

  -- One committee: the delegates sitting in it and the people chairing it.
  select seat.user_id
  from public.seats as seat
  where seat.committee_id = conference_audience_user_ids.committee_id
    and seat.user_id is not null
    and conference_audience_user_ids.audience = 'committee'

  union

  select chair.user_id
  from public.committee_chairs as chair
  where chair.committee_id = conference_audience_user_ids.committee_id
    and conference_audience_user_ids.audience = 'committee'

  union

  -- One delegation.
  select membership.user_id
  from public.delegation_members as membership
  where membership.delegation_id = conference_audience_user_ids.delegation_id
    and conference_audience_user_ids.audience = 'delegation';
end;
$function$;


-- announcements
alter policy "A committee's delegates and chairs can read its announcements"
  on public.announcements
  using (((audience = 'committee'::audience) AND (is_committee_delegate(committee_id) OR has_committee_permission(committee_id, 'run_room'))));

-- committee_session_notes
alter policy "A chair can save the notes of a session of their own committee"
  on public.committee_session_notes
  using (has_committee_permission(committee_id, 'run_room'))
  with check ((has_committee_permission(committee_id, 'run_room') AND (EXISTS ( SELECT 1
   FROM committee_sessions session
  WHERE ((session.id = committee_session_notes.session_id) AND (session.committee_id = committee_session_notes.committee_id))))));
alter policy "A chair can start the notes of a session of their own committee"
  on public.committee_session_notes
  with check ((has_committee_permission(committee_id, 'run_room') AND (EXISTS ( SELECT 1
   FROM committee_sessions session
  WHERE ((session.id = committee_session_notes.session_id) AND (session.committee_id = committee_session_notes.committee_id))))));
alter policy "Chairs and organisers can read their committee's session notes"
  on public.committee_session_notes
  using (has_committee_permission(committee_id, 'run_room'));

-- committee_sessions
alter policy "A chair can change a session"
  on public.committee_sessions
  using (has_committee_permission(committee_id, 'run_room'))
  with check (has_committee_permission(committee_id, 'run_room'));
alter policy "A chair can remove a session that has not started"
  on public.committee_sessions
  using ((has_committee_permission(committee_id, 'run_room') AND (status = 'scheduled'::session_status)));
alter policy "A chair can start a session"
  on public.committee_sessions
  with check (has_committee_permission(committee_id, 'run_room'));

-- committee_state
alter policy "A chair can run the room"
  on public.committee_state
  using (has_committee_permission(committee_id, 'run_room'))
  with check ((has_committee_permission(committee_id, 'run_room') AND ((current_session_id IS NULL) OR (EXISTS ( SELECT 1
   FROM committee_sessions session
  WHERE ((session.id = committee_state.current_session_id) AND (session.committee_id = committee_state.committee_id))))) AND ((current_motion_id IS NULL) OR (EXISTS ( SELECT 1
   FROM motions motion
  WHERE ((motion.id = committee_state.current_motion_id) AND (motion.committee_id = committee_state.committee_id))))) AND ((active_speakers_list_id IS NULL) OR (EXISTS ( SELECT 1
   FROM speakers_lists list
  WHERE ((list.id = committee_state.active_speakers_list_id) AND (list.committee_id = committee_state.committee_id))))) AND ((current_speaker_entry_id IS NULL) OR (EXISTS ( SELECT 1
   FROM (speakers_list_entries entry
     JOIN speakers_lists list ON ((list.id = entry.speakers_list_id)))
  WHERE ((entry.id = committee_state.current_speaker_entry_id) AND (list.committee_id = committee_state.committee_id))))) AND ((current_vote_id IS NULL) OR (EXISTS ( SELECT 1
   FROM votes vote
  WHERE ((vote.id = committee_state.current_vote_id) AND (vote.committee_id = committee_state.committee_id)))))));

-- motions
alter policy "A chair can decide or withdraw a motion"
  on public.motions
  using (has_committee_permission(committee_id, 'run_room'))
  with check ((has_committee_permission(committee_id, 'run_room') AND (EXISTS ( SELECT 1
   FROM committee_sessions session
  WHERE ((session.id = motions.session_id) AND (session.committee_id = motions.committee_id)))) AND ((proposed_by_seat_id IS NULL) OR (EXISTS ( SELECT 1
   FROM seats seat
  WHERE ((seat.id = motions.proposed_by_seat_id) AND (seat.committee_id = motions.committee_id)))))));
alter policy "A chair can remove a motion"
  on public.motions
  using (has_committee_permission(committee_id, 'run_room'));
alter policy "A chair can write down a motion"
  on public.motions
  with check ((has_committee_permission(committee_id, 'run_room') AND (EXISTS ( SELECT 1
   FROM committee_sessions session
  WHERE ((session.id = motions.session_id) AND (session.committee_id = motions.committee_id)))) AND ((proposed_by_seat_id IS NULL) OR (EXISTS ( SELECT 1
   FROM seats seat
  WHERE ((seat.id = motions.proposed_by_seat_id) AND (seat.committee_id = motions.committee_id)))))));

-- roll_call_entries
alter policy "A chair can change a mark"
  on public.roll_call_entries
  using ((EXISTS ( SELECT 1
   FROM (roll_calls roll_call
     JOIN committee_sessions session ON ((session.id = roll_call.session_id)))
  WHERE ((roll_call.id = roll_call_entries.roll_call_id) AND has_committee_permission(session.committee_id, 'run_room')))))
  with check ((EXISTS ( SELECT 1
   FROM ((roll_calls roll_call
     JOIN committee_sessions session ON ((session.id = roll_call.session_id)))
     JOIN seats seat ON ((seat.id = roll_call_entries.seat_id)))
  WHERE ((roll_call.id = roll_call_entries.roll_call_id) AND (seat.committee_id = session.committee_id) AND has_committee_permission(session.committee_id, 'run_room')))));
alter policy "A chair can mark a seat of their own committee"
  on public.roll_call_entries
  with check ((EXISTS ( SELECT 1
   FROM ((roll_calls roll_call
     JOIN committee_sessions session ON ((session.id = roll_call.session_id)))
     JOIN seats seat ON ((seat.id = roll_call_entries.seat_id)))
  WHERE ((roll_call.id = roll_call_entries.roll_call_id) AND (seat.committee_id = session.committee_id) AND has_committee_permission(session.committee_id, 'run_room')))));
alter policy "A chair can take a mark off again"
  on public.roll_call_entries
  using ((EXISTS ( SELECT 1
   FROM (roll_calls roll_call
     JOIN committee_sessions session ON ((session.id = roll_call.session_id)))
  WHERE ((roll_call.id = roll_call_entries.roll_call_id) AND has_committee_permission(session.committee_id, 'run_room')))));

-- roll_calls
alter policy "A chair can change a roll call"
  on public.roll_calls
  using ((EXISTS ( SELECT 1
   FROM committee_sessions session
  WHERE ((session.id = roll_calls.session_id) AND has_committee_permission(session.committee_id, 'run_room')))))
  with check (((taken_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM committee_sessions session
  WHERE ((session.id = roll_calls.session_id) AND has_committee_permission(session.committee_id, 'run_room'))))));
alter policy "A chair can remove a roll call"
  on public.roll_calls
  using ((EXISTS ( SELECT 1
   FROM committee_sessions session
  WHERE ((session.id = roll_calls.session_id) AND has_committee_permission(session.committee_id, 'run_room')))));
alter policy "A chair can take a roll call"
  on public.roll_calls
  with check (((taken_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM committee_sessions session
  WHERE ((session.id = roll_calls.session_id) AND has_committee_permission(session.committee_id, 'run_room'))))));

-- schedule_events
alter policy "A committee's delegates and chairs can read its events"
  on public.schedule_events
  using (((audience = 'committee'::audience) AND (is_committee_delegate(committee_id) OR has_committee_permission(committee_id, 'run_room'))));

-- speakers_list_entries
alter policy "A chair can add a seat of their own committee to a list"
  on public.speakers_list_entries
  with check ((EXISTS ( SELECT 1
   FROM speakers_lists list
  WHERE ((list.id = speakers_list_entries.speakers_list_id) AND has_committee_permission(list.committee_id, 'run_room') AND (((speakers_list_entries.seat_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM seats seat
          WHERE ((seat.id = speakers_list_entries.seat_id) AND (seat.committee_id = list.committee_id))))) OR ((speakers_list_entries.seat_id IS NULL) AND (list.kind = 'single'::speakers_list_kind)))))));
alter policy "A chair can reorder a list and move the turn on"
  on public.speakers_list_entries
  using ((EXISTS ( SELECT 1
   FROM speakers_lists list
  WHERE ((list.id = speakers_list_entries.speakers_list_id) AND has_committee_permission(list.committee_id, 'run_room')))))
  with check ((EXISTS ( SELECT 1
   FROM speakers_lists list
  WHERE ((list.id = speakers_list_entries.speakers_list_id) AND has_committee_permission(list.committee_id, 'run_room') AND (((speakers_list_entries.seat_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM seats seat
          WHERE ((seat.id = speakers_list_entries.seat_id) AND (seat.committee_id = list.committee_id))))) OR ((speakers_list_entries.seat_id IS NULL) AND (list.kind = 'single'::speakers_list_kind)))))));
alter policy "A chair can take a seat off a list"
  on public.speakers_list_entries
  using ((EXISTS ( SELECT 1
   FROM speakers_lists list
  WHERE ((list.id = speakers_list_entries.speakers_list_id) AND has_committee_permission(list.committee_id, 'run_room')))));

-- speakers_lists
alter policy "A chair can close a speakers list"
  on public.speakers_lists
  using (has_committee_permission(committee_id, 'run_room'))
  with check ((has_committee_permission(committee_id, 'run_room') AND (EXISTS ( SELECT 1
   FROM committee_sessions session
  WHERE ((session.id = speakers_lists.session_id) AND (session.committee_id = speakers_lists.committee_id)))) AND ((motion_id IS NULL) OR (EXISTS ( SELECT 1
   FROM motions motion
  WHERE ((motion.id = speakers_lists.motion_id) AND (motion.committee_id = speakers_lists.committee_id)))))));
alter policy "A chair can open a speakers list"
  on public.speakers_lists
  with check ((has_committee_permission(committee_id, 'run_room') AND (EXISTS ( SELECT 1
   FROM committee_sessions session
  WHERE ((session.id = speakers_lists.session_id) AND (session.committee_id = speakers_lists.committee_id)))) AND ((motion_id IS NULL) OR (EXISTS ( SELECT 1
   FROM motions motion
  WHERE ((motion.id = speakers_lists.motion_id) AND (motion.committee_id = speakers_lists.committee_id)))))));
alter policy "A chair can remove a speakers list"
  on public.speakers_lists
  using (has_committee_permission(committee_id, 'run_room'));

-- vote_entries
alter policy "A chair can change a recorded choice"
  on public.vote_entries
  using ((EXISTS ( SELECT 1
   FROM votes vote
  WHERE ((vote.id = vote_entries.vote_id) AND has_committee_permission(vote.committee_id, 'run_room')))))
  with check ((EXISTS ( SELECT 1
   FROM (votes vote
     JOIN seats seat ON ((seat.id = vote_entries.seat_id)))
  WHERE ((vote.id = vote_entries.vote_id) AND (seat.committee_id = vote.committee_id) AND has_committee_permission(vote.committee_id, 'run_room')))));
alter policy "A chair can record a seat of their own committee voting"
  on public.vote_entries
  with check ((EXISTS ( SELECT 1
   FROM (votes vote
     JOIN seats seat ON ((seat.id = vote_entries.seat_id)))
  WHERE ((vote.id = vote_entries.vote_id) AND (seat.committee_id = vote.committee_id) AND has_committee_permission(vote.committee_id, 'run_room')))));
alter policy "A chair can take a recorded choice off again"
  on public.vote_entries
  using ((EXISTS ( SELECT 1
   FROM votes vote
  WHERE ((vote.id = vote_entries.vote_id) AND has_committee_permission(vote.committee_id, 'run_room')))));

-- votes
alter policy "A chair can close a vote"
  on public.votes
  using (has_committee_permission(committee_id, 'run_room'))
  with check ((has_committee_permission(committee_id, 'run_room') AND (EXISTS ( SELECT 1
   FROM committee_sessions session
  WHERE ((session.id = votes.session_id) AND (session.committee_id = votes.committee_id)))) AND ((motion_id IS NULL) OR (EXISTS ( SELECT 1
   FROM motions motion
  WHERE ((motion.id = votes.motion_id) AND (motion.committee_id = votes.committee_id)))))));
alter policy "A chair can open a vote"
  on public.votes
  with check ((has_committee_permission(committee_id, 'run_room') AND (EXISTS ( SELECT 1
   FROM committee_sessions session
  WHERE ((session.id = votes.session_id) AND (session.committee_id = votes.committee_id)))) AND ((motion_id IS NULL) OR (EXISTS ( SELECT 1
   FROM motions motion
  WHERE ((motion.id = votes.motion_id) AND (motion.committee_id = votes.committee_id)))))));
alter policy "A chair can remove a vote"
  on public.votes
  using (has_committee_permission(committee_id, 'run_room'));
