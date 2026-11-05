-- =============================================================================
-- Programme and communication (docs/roles-and-permissions.md, step 7)
-- =============================================================================
--
-- WHAT THIS IS
-- Until now the programme, the announcements and the conference's own
-- documents asked `can_manage_conference`, which since step 1 means "is an
-- administrator", and a chair announced to their committee through
-- `is_committee_chair`. This moves them to their permissions:
--
--   * edit_schedule: add, change and remove programme events, and choose
--     whether the programme is public. Held per committee, it covers the
--     events addressed to that committee and nothing else.
--   * send_announcements: conference-wide, an announcement to everyone, the
--     delegates, the staff or one delegation; per committee, an announcement
--     to that committee. The Chair preset holds it per committee, which is how
--     a chair keeps announcing to their room.
--   * manage_documents: upload, change and remove the conference's resources
--     (handbook, rules, maps), in the table and in the bucket.
--
-- Every policy below that has to cost one lookup per query rather than one
-- per row uses the set forms, `permitted_conference_ids` and
-- `permitted_committee_ids`, as migration 20260923150000_rls_conference_lookups
-- taught.
--
-- WHAT IS LEFT ALONE, AND WHY
--   * check_schedule_event_scope, check_announcement_scope and
--     check_document_scope ask no permission: they only check that a row's
--     committee, delegation and seat belong to its conference. Every policy
--     here still relies on them for that, and they need no change.
--   * protect_documents_columns lets a chair or an administrator past its
--     review rules; for a resource it answers yes to everybody before it
--     reaches them. The review half is about position papers, which are
--     review_papers in step 8.
--   * Background guides and position papers keep their policies, and the
--     'background-guides' and 'position-papers' folders their answers, until
--     step 8 moves them to manage_committees and review_papers.
--   * The organisers' policies on documents stay beside the new ones until
--     step 8 retires `can_manage_conference`: an administrator holds
--     manage_documents, so they add nothing a resource manager lacks.
--
-- This file is never edited once applied: a change is a new migration.


-- -----------------------------------------------------------------------------
-- schedule_events
-- -----------------------------------------------------------------------------
-- The read policies for delegates, staff, committees and the public are
-- unchanged. The organisers' four become the programme editors', who read and
-- write every event of the conference, or, holding edit_schedule per
-- committee, the events addressed to their committees. An editor of one
-- committee cannot move an event to another audience: the update's with check
-- asks the same question of the row as it will be.

drop policy "Organisers can read the whole programme of their conference" on public.schedule_events;
drop policy "Organisers can add an event" on public.schedule_events;
drop policy "Organisers can change an event" on public.schedule_events;
drop policy "Organisers can remove an event" on public.schedule_events;

create policy "Programme editors can read the events they may change"
  on public.schedule_events
  for select
  to authenticated
  using (
    conference_id in (select public.permitted_conference_ids('edit_schedule'))
    or (
      audience = 'committee'
      and committee_id in (select public.permitted_committee_ids('edit_schedule'))
    )
  );

create policy "Programme editors can add an event"
  on public.schedule_events
  for insert
  to authenticated
  with check (
    conference_id in (select public.permitted_conference_ids('edit_schedule'))
    or (
      audience = 'committee'
      and committee_id in (select public.permitted_committee_ids('edit_schedule'))
    )
  );

create policy "Programme editors can change an event"
  on public.schedule_events
  for update
  to authenticated
  using (
    conference_id in (select public.permitted_conference_ids('edit_schedule'))
    or (
      audience = 'committee'
      and committee_id in (select public.permitted_committee_ids('edit_schedule'))
    )
  )
  with check (
    conference_id in (select public.permitted_conference_ids('edit_schedule'))
    or (
      audience = 'committee'
      and committee_id in (select public.permitted_committee_ids('edit_schedule'))
    )
  );

create policy "Programme editors can remove an event"
  on public.schedule_events
  for delete
  to authenticated
  using (
    conference_id in (select public.permitted_conference_ids('edit_schedule'))
    or (
      audience = 'committee'
      and committee_id in (select public.permitted_committee_ids('edit_schedule'))
    )
  );


-- -----------------------------------------------------------------------------
-- set_schedule_publicity(conference_id, is_public)
-- -----------------------------------------------------------------------------
-- "Show programme publicly" is a column of the conference row, which step 6
-- gave to edit_conference. Choosing it belongs to whoever edits the whole
-- programme, so it is written here, past the row's update policy, for a
-- conference-wide holder of edit_schedule, and only that one column.

create or replace function public.set_schedule_publicity(conference_id uuid, is_public boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission(set_schedule_publicity.conference_id, 'edit_schedule') then
    raise exception 'Only the people who edit the whole programme can choose whether it is public';
  end if;

  update public.conferences as conference
  set show_schedule_publicly = set_schedule_publicity.is_public
  where conference.id = set_schedule_publicity.conference_id;
end;
$$;

revoke execute on function public.set_schedule_publicity(uuid, boolean) from public, anon;
grant execute on function public.set_schedule_publicity(uuid, boolean) to authenticated;


-- -----------------------------------------------------------------------------
-- announcements
-- -----------------------------------------------------------------------------
-- The read policies for the audiences themselves are unchanged. An announcer
-- reads every announcement they could have sent, so the page that sends them
-- lists them all. Publishing asks of the audience: a conference-wide holder
-- may address anybody, a holder per committee only one of their committees.
-- The chairs' own insert policy goes, because the Chair preset holds
-- send_announcements per committee and this one policy now answers for them.
--
-- Editing and deleting stay with the author, while they may still address
-- that audience, and with anybody holding send_announcements conference-wide.
-- protect_announcements_columns still refuses re-addressing, so the with
-- check below only ever sees the audience the row was published with.

drop policy "Organisers can read every announcement of their conference" on public.announcements;
drop policy "Organisers can publish an announcement to any audience" on public.announcements;
drop policy "Chairs can publish an announcement to their own committee" on public.announcements;
drop policy "The author or an organiser can edit an announcement" on public.announcements;
drop policy "The author or an organiser can delete an announcement" on public.announcements;

create policy "Announcers can read every announcement they could send"
  on public.announcements
  for select
  to authenticated
  using (
    conference_id in (select public.permitted_conference_ids('send_announcements'))
    or (
      audience = 'committee'
      and committee_id in (select public.permitted_committee_ids('send_announcements'))
    )
  );

create policy "Announcers can publish to the audiences they may address"
  on public.announcements
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      conference_id in (select public.permitted_conference_ids('send_announcements'))
      or (
        audience = 'committee'
        and committee_id in (select public.permitted_committee_ids('send_announcements'))
      )
    )
  );

create policy "The author or a conference-wide announcer can edit an announcement"
  on public.announcements
  for update
  to authenticated
  using (
    conference_id in (select public.permitted_conference_ids('send_announcements'))
    or (
      author_id = (select auth.uid())
      and audience = 'committee'
      and committee_id in (select public.permitted_committee_ids('send_announcements'))
    )
  )
  with check (
    conference_id in (select public.permitted_conference_ids('send_announcements'))
    or (
      author_id = (select auth.uid())
      and audience = 'committee'
      and committee_id in (select public.permitted_committee_ids('send_announcements'))
    )
  );

create policy "The author or a conference-wide announcer can delete an announcement"
  on public.announcements
  for delete
  to authenticated
  using (
    conference_id in (select public.permitted_conference_ids('send_announcements'))
    or (
      author_id = (select auth.uid())
      and audience = 'committee'
      and committee_id in (select public.permitted_committee_ids('send_announcements'))
    )
  );


-- -----------------------------------------------------------------------------
-- conference_audience_user_ids
-- -----------------------------------------------------------------------------
-- Who an audience is: asked by the announcements page to count it, and by the
-- notify_announcement and notify_schedule_changed triggers to tell it. Those
-- triggers run in the request of the person who published, so the gate is
-- theirs. It now asks the two permissions that address an audience: one
-- committee for a holder in that committee, anybody else for a
-- conference-wide holder. A chair who runs the room keeps their committee
-- until step 8 retires `is_committee_chair`.
--
-- The two scoping checks above the gate and everything below it are migration
-- 20260921120000's, word for word.

create or replace function public.conference_audience_user_ids(
  conference_id uuid,
  audience public.audience,
  committee_id uuid default null,
  delegation_id uuid default null
)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
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
      or public.is_committee_chair(conference_audience_user_ids.committee_id)
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
$$;


-- -----------------------------------------------------------------------------
-- documents: the conference's resources
-- -----------------------------------------------------------------------------
-- A resource manager reads, uploads, changes and removes the resources of the
-- conference, whoever uploaded them. These sit beside the organisers' policies,
-- which step 8 retires.

create policy "Document managers can read the conference's resources"
  on public.documents
  for select
  to authenticated
  using (
    kind = 'resource'
    and conference_id in (select public.permitted_conference_ids('manage_documents'))
  );

create policy "Document managers can upload a resource"
  on public.documents
  for insert
  to authenticated
  with check (
    kind = 'resource'
    and uploaded_by = (select auth.uid())
    and conference_id in (select public.permitted_conference_ids('manage_documents'))
  );

create policy "Document managers can change a resource"
  on public.documents
  for update
  to authenticated
  using (
    kind = 'resource'
    and conference_id in (select public.permitted_conference_ids('manage_documents'))
  )
  with check (
    kind = 'resource'
    and conference_id in (select public.permitted_conference_ids('manage_documents'))
  );

create policy "Document managers can remove a resource"
  on public.documents
  for delete
  to authenticated
  using (
    kind = 'resource'
    and conference_id in (select public.permitted_conference_ids('manage_documents'))
  );


-- -----------------------------------------------------------------------------
-- may_upload_conference_document and may_change_conference_document
-- -----------------------------------------------------------------------------
-- The bucket's answer for the 'resources' folder moves to manage_documents.
-- The other two folders answer as migration 20260921120000 wrote them.

create or replace function public.may_upload_conference_document(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
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
    return public.is_committee_chair(owner_id)
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
$$;


create or replace function public.may_change_conference_document(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
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
        and public.is_committee_chair(seat.committee_id)
    );
  end if;

  if kind_folder = 'background-guides' then
    return public.is_committee_chair(owner_id)
      and exists (
        select 1
        from public.committees as committee
        where committee.id = owner_id
          and committee.conference_id = the_conference
      );
  end if;

  return false;
end;
$$;

-- End of migration. Never edit this file once applied; write a new one.
