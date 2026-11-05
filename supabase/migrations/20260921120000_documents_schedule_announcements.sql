-- =============================================================================
-- Migration 0013: documents, the schedule, announcements and their notifications
-- =============================================================================
--
-- WHAT THIS IS
-- Task T34 in specs/07-delivery/tasks.md, the shared schema of milestone M5,
-- "Before the conference". The pages that read and write these tables are
-- T35 to T37; this file is everything they stand on. It:
--
--   * creates documents, with the position paper, background guide and
--     resource rules of specs/06-features/documents.md
--   * creates schedule_events and announcements, the programme and the
--     conference's own messages
--   * creates the second storage bucket, "documents", which is private, and
--     the four storage.objects policies that guard it
--   * replaces conference_audience_user_ids so a chair publishing to their own
--     committee can work out who that is
--   * adds the three notify_* triggers these tables own: notify_announcement,
--     notify_schedule_changed and notify_document_reviewed
--   * replaces move_delegate and revoke_seat with the same bodies plus the
--     position-paper line each of them has been carrying a "T34" comment for
--     since migration 0006
--
-- WHERE THE TWO ALLOCATION FUNCTIONS COME FROM
-- Their bodies are copied from supabase/migrations/20260919120000_fees_and_
-- invoices.sql and not from migration 0006. T17 replaced both of them there to
-- add the invoice each one owes, so migration 0006's copies are stale and
-- starting from one of those would silently drop that invoice again.
--
-- WHAT IS NOT HERE, ON PURPOSE
-- No seeded announcement, schedule event or document. notify_announcement
-- resolves its audience through conference_audience_user_ids, which refuses a
-- caller who cannot manage the conference, and supabase/seed.sql runs as
-- "postgres" with nobody signed in at all. The two ways out were to widen that
-- gate for a caller with no auth.uid() or to seed nothing; seeding nothing is
-- the smaller of the two and leaves the gate exactly as strict as it is today.
-- The page tasks make their own rows through the real forms, which is what
-- specs/02-architecture/testing.md asks of a browser test anyway.
--
-- The awards table and the committee room are T39's. Working papers and draft
-- resolutions are Phase 2: document_kind already has both values, and the
-- documents select policy answers for them, but nothing writes one.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- =============================================================================
-- documents
-- =============================================================================
-- One row per file in the "documents" bucket, with its meaning attached: which
-- conference it belongs to, what kind of file it is, and for a position paper,
-- what the chair thought of it. specs/02-architecture/data-model.md.
--
-- uploaded_by cascades with the account, which is the convention for every
-- user_id column in the data model. It is worth saying out loud what that costs
-- here: a chair who deletes their account takes their committee's background
-- guide row with them. The alternative would be a nullable column the data
-- model does not have, and the file itself stays in the bucket either way.

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences (id) on delete cascade,
  committee_id uuid references public.committees (id) on delete cascade,
  seat_id uuid references public.seats (id) on delete cascade,
  uploaded_by uuid not null references auth.users (id) on delete cascade,
  kind public.document_kind not null,
  title text not null,
  storage_path text not null unique,
  file_name text not null,
  file_size_bytes integer not null,
  mime_type text not null,
  audience public.audience not null default 'delegates',
  review_status public.review_status,
  review_comment text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A position paper is one delegate's answer for one seat, so it cannot exist
  -- without both. A background guide belongs to a committee. A resource belongs
  -- to the conference and to nothing smaller.
  constraint documents_position_paper_has_seat check (
    kind <> 'position_paper' or (committee_id is not null and seat_id is not null)
  ),
  constraint documents_background_guide_has_committee check (
    kind <> 'background_guide' or committee_id is not null
  ),

  -- specs/02-architecture/storage.md: position papers are PDFs and nothing
  -- else. The bucket's own type list is wider, because a resource may be a
  -- picture or a Word file, so this is the rule that keeps a paper a paper.
  constraint documents_position_paper_is_pdf check (
    kind <> 'position_paper' or mime_type = 'application/pdf'
  ),

  -- Review is something that happens to a position paper. A background guide
  -- has nobody to approve it. That is also why review_status has no column
  -- default although the data model says a paper arrives "submitted": a default
  -- would put a review status on every guide and resource too, and this check
  -- would then refuse them. The upload action writes it.
  constraint documents_review_is_for_papers check (
    kind = 'position_paper'
    or (review_status is null and review_comment is null
        and reviewed_by is null and reviewed_at is null)
  ),

  -- 20 MB, the bucket's limit, written out in bytes because that is what both
  -- this column and storage.buckets hold. An empty file is refused too: it is
  -- always a failed upload rather than a document.
  constraint documents_file_size_within_limit check (
    file_size_bytes between 1 and 20971520
  ),

  -- specs/02-architecture/permissions.md gives the documents select rule three
  -- audiences and no more: "everyone", "delegates" and "staff". A row with
  -- "committee" or "delegation" on it would be a row the select policy cannot
  -- answer for, so it is refused on the way in rather than becoming invisible.
  constraint documents_audience_is_answerable check (
    audience in ('everyone', 'delegates', 'staff')
  )
);

comment on table public.documents is
  'Files in the documents bucket with their meaning attached: position papers, background guides and resources.';

-- A seat has at most one current position paper and a committee at most one
-- current background guide. Uploading again replaces the row rather than adding
-- a second one, which is what makes "the paper" a thing a page can talk about.
create unique index documents_one_paper_per_seat
  on public.documents (seat_id)
  where kind = 'position_paper';

create unique index documents_one_guide_per_committee
  on public.documents (committee_id)
  where kind = 'background_guide';

-- Every foreign key has an index (the Conventions section of the data model).
-- The first one carries kind as well, because every page that reads this table
-- reads one kind of one conference.
create index documents_conference_kind_idx on public.documents (conference_id, kind);
create index documents_committee_id_idx on public.documents (committee_id);
create index documents_seat_id_idx on public.documents (seat_id);
create index documents_uploaded_by_idx on public.documents (uploaded_by);

create trigger documents_set_updated_at
  before update on public.documents
  for each row
  execute function public.set_updated_at();

alter table public.documents enable row level security;


-- -----------------------------------------------------------------------------
-- documents: who may read
-- -----------------------------------------------------------------------------
-- The "documents select rule" table in specs/02-architecture/permissions.md,
-- one policy per line of it. They are separate policies rather than one long
-- "or", because Postgres combines several permissive policies with "or" itself
-- and a reader can then check one line of the spec against one policy.
--
-- is_committee_chair is true of a chair of the committee *and* of anybody who
-- can manage its conference, so the organisers are inside it and do not need a
-- branch of their own.

create policy "A delegate can read the position paper of their own seat"
  on public.documents
  for select
  to authenticated
  using (
    kind = 'position_paper'
    and exists (
      select 1
      from public.seats as seat
      where seat.id = documents.seat_id
        and seat.user_id = (select auth.uid())
    )
  );

create policy "Chairs and organisers can read a position paper"
  on public.documents
  for select
  to authenticated
  using (kind = 'position_paper' and public.is_committee_chair(committee_id));

-- A background guide or a resource marked "everyone" is as readable as the
-- conference it belongs to: a visitor sees it on a published conference, and
-- the team sees their own draft's.
-- Without this a chair who marks their own background guide "delegates" cannot
-- read it back: that line of the select rule is is_conference_participant, and
-- a chair is staff rather than a participant. The guide for the committee they
-- run is theirs to read whichever audience they chose for it.
create policy "Chairs can read their own committee's background guide"
  on public.documents
  for select
  to authenticated
  using (kind = 'background_guide' and public.is_committee_chair(committee_id));

create policy "Anyone who can read the conference can read its public files"
  on public.documents
  for select
  to anon, authenticated
  using (
    kind in ('background_guide', 'resource')
    and audience = 'everyone'
    and exists (
      select 1
      from public.conferences as conference
      where conference.id = documents.conference_id
        and conference.status in ('published', 'archived')
    )
  );

create policy "Staff can read the public files of their own conference"
  on public.documents
  for select
  to authenticated
  using (
    kind in ('background_guide', 'resource')
    and audience = 'everyone'
    and public.is_conference_staff(conference_id)
  );

create policy "Participants can read the files meant for delegates"
  on public.documents
  for select
  to authenticated
  using (
    kind in ('background_guide', 'resource')
    and audience = 'delegates'
    and public.is_conference_participant(conference_id)
  );

create policy "Staff can read the files meant for staff"
  on public.documents
  for select
  to authenticated
  using (
    kind in ('background_guide', 'resource')
    and audience = 'staff'
    and public.is_conference_staff(conference_id)
  );

-- Working papers and draft resolutions are Phase 2 and nothing writes one yet.
-- The line is here so the policy set answers for every value of document_kind
-- rather than leaving two of them readable by nobody by accident.
create policy "Delegates and staff can read working papers"
  on public.documents
  for select
  to authenticated
  using (
    kind in ('working_paper', 'draft_resolution')
    and (public.is_committee_delegate(committee_id) or public.is_conference_staff(conference_id))
  );

create policy "Organisers can read every file of their conference"
  on public.documents
  for select
  to authenticated
  using (public.can_manage_conference(conference_id));


-- -----------------------------------------------------------------------------
-- documents: who may write
-- -----------------------------------------------------------------------------
-- The delegate sitting in the seat uploads its position paper, while the
-- conference's deadline has not passed. specs/06-features/documents.md reopens
-- the upload after the deadline when the chair has asked for changes; that is
-- an update of the row that is already there rather than an insert, because the
-- unique index above allows a seat only one paper, so the "changes requested"
-- half of the rule lives in the update policy below.
--
-- A null deadline means the conference set none, which is open on that side,
-- the same reading as the application window in src/lib/conferences.ts.

create policy "A delegate can upload the position paper for their own seat"
  on public.documents
  for insert
  to authenticated
  with check (
    kind = 'position_paper'
    and uploaded_by = (select auth.uid())
    and exists (
      select 1
      from public.seats as seat
      where seat.id = documents.seat_id
        and seat.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.conferences as conference
      where conference.id = documents.conference_id
        and (conference.position_paper_deadline is null
             or now() <= conference.position_paper_deadline)
    )
  );

create policy "Chairs can upload a background guide for their committee"
  on public.documents
  for insert
  to authenticated
  with check (
    kind = 'background_guide'
    and uploaded_by = (select auth.uid())
    and public.is_committee_chair(committee_id)
  );

create policy "Organisers can upload a file for their conference"
  on public.documents
  for insert
  to authenticated
  with check (
    kind in ('background_guide', 'resource')
    and uploaded_by = (select auth.uid())
    and public.can_manage_conference(conference_id)
  );

-- Nothing writes a working paper or a draft resolution, which are Phase 2, so
-- neither has an insert policy and neither can be written. The select policy
-- above answers for them already, so the day they arrive it is one policy.

-- -----------------------------------------------------------------------------
-- Trigger: a document's committee and seat belong to its conference
-- -----------------------------------------------------------------------------
-- The same job check_invite_committee does for an invitation, and security
-- definer for the same reason it is. Every policy above asks about one of the
-- three ids on the row and takes the other two on trust, so without this a
-- chair could file their committee's background guide under another conference,
-- where the "resource" readers of that conference would find it. Firing on
-- update as well is what keeps it true afterwards.
--
-- Without security definer the question would quietly become "can the writer
-- *read* that committee?", and a delegate uploading a paper for a conference
-- that is not published yet cannot: the committees select policy covers
-- published conferences and staff. They would be turned away with a sentence
-- about the committee belonging to another conference, which is not what went
-- wrong. The two triggers of the same shape below say so for the same reason.

create or replace function public.check_document_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  seat_committee uuid;
begin
  if new.committee_id is not null
    and not exists (
      select 1
      from public.committees as committee
      where committee.id = new.committee_id
        and committee.conference_id = new.conference_id
    )
  then
    raise exception 'That committee is not part of this conference';
  end if;

  if new.seat_id is not null then
    select seat.committee_id
    into seat_committee
    from public.seats as seat
    where seat.id = new.seat_id;

    if seat_committee is distinct from new.committee_id then
      raise exception 'That seat is not part of this committee';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.check_document_scope() from public, anon, authenticated;

create trigger documents_check_scope
  before insert or update on public.documents
  for each row
  execute function public.check_document_scope();

-- Replacing a paper is an update, and so is a chair reviewing one. Which
-- columns each of them may write is protect_documents_columns below, because a
-- policy decides rows and not columns.
create policy "A delegate can replace their own position paper"
  on public.documents
  for update
  to authenticated
  using (
    kind = 'position_paper'
    and uploaded_by = (select auth.uid())
    and (
      review_status = 'changes_requested'
      or exists (
        select 1
        from public.conferences as conference
        where conference.id = documents.conference_id
          and (conference.position_paper_deadline is null
               or now() <= conference.position_paper_deadline)
      )
    )
  )
  with check (uploaded_by = (select auth.uid()));

create policy "Chairs can review a position paper"
  on public.documents
  for update
  to authenticated
  using (kind = 'position_paper' and public.is_committee_chair(committee_id))
  with check (kind = 'position_paper' and public.is_committee_chair(committee_id));

create policy "Uploaders and organisers can change a file"
  on public.documents
  for update
  to authenticated
  using (
    kind in ('background_guide', 'resource')
    and (uploaded_by = (select auth.uid()) or public.can_manage_conference(conference_id))
  )
  with check (
    kind in ('background_guide', 'resource')
    and (uploaded_by = (select auth.uid()) or public.can_manage_conference(conference_id))
  );

-- "uploader while submitted; org." The review_status half is what stops a
-- delegate taking back a paper their chair has already approved or already
-- written a comment on; a background guide and a resource have no review at
-- all, which is what the null covers, so the chair who uploaded a guide can
-- still remove it.
create policy "An uploader can remove a file nobody has reviewed"
  on public.documents
  for delete
  to authenticated
  using (
    uploaded_by = (select auth.uid())
    and (review_status is null or review_status = 'submitted')
  );

create policy "Organisers can remove any file of their conference"
  on public.documents
  for delete
  to authenticated
  using (public.can_manage_conference(conference_id));


-- -----------------------------------------------------------------------------
-- Trigger: what a document may look like on the day a browser writes it
-- -----------------------------------------------------------------------------
-- The review belongs to the chair. protect_documents_columns below keeps a
-- delegate from writing it on an update, and without this guard that rule is
-- walked around by choosing at insert what the update guard refuses to let
-- anybody change -- the same hole, and the same answer, as guard_invoice_insert
-- in migration 0007 and guard_application_insert in migration 0006.
--
-- "A delegate can upload the position paper for their own seat" above asks
-- about the kind, the owner, the seat and the deadline, and nothing looks at
-- the four review columns, so a delegate could upload a paper that already says
-- "approved" with their chair's user id on it, and /.../chair/papers would
-- count it among the papers that are done.
--
-- Like protect_documents_columns it is deliberately NOT security definer:
-- inside a security definer function current_user reads "postgres" rather than
-- the caller, which is how our own functions stay able to write these columns.

create or replace function public.guard_document_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  -- "submitted" is the one review status an upload may carry, because it is
  -- what a paper arriving means; a background guide and a resource carry none
  -- at all, which documents_review_is_for_papers has already insisted on.
  -- Everything the chair writes -- the comment, who reviewed it and when --
  -- arrives empty.
  if (new.review_status is not null
      and new.review_status is distinct from 'submitted'::public.review_status)
    or new.review_comment is not null
    or new.reviewed_by is not null
    or new.reviewed_at is not null
  then
    raise exception
      'A document cannot be uploaded already reviewed: only a chair of this committee can review a position paper';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_document_insert() from public, anon, authenticated;

create trigger documents_guard_insert
  before insert on public.documents
  for each row
  execute function public.guard_document_insert();


-- -----------------------------------------------------------------------------
-- Trigger: which columns of a document a browser may write
-- -----------------------------------------------------------------------------
-- Two rules, both of which a policy cannot express, because a policy decides
-- rows and not columns (the "Trigger-protected columns" section of
-- specs/02-architecture/permissions.md).
--
-- The first is what a document IS and what it belongs to: its kind, and the
-- conference, committee, seat and owner it hangs off. None of those is content,
-- so none of them moves. Without it a chair could point a position paper at
-- another committee's seat, and an organiser could move a resource to their
-- other conference. move_delegate is what really moves a paper between seats,
-- and it runs security definer, so current_user there is the owner and not
-- "authenticated".
--
-- It is written the way permissions.md asks for -- an allow-list of what may be
-- written, taken away from both rows -- rather than as a list of the columns it
-- refuses, and round 2 of this task's review is the reason the rule exists.
-- "kind" was missing from a list of refused columns, and that was a real hole:
-- Postgres combines permissive policies with "or" for "using" and again,
-- separately, for "with check", so a delegate updating their own paper is
-- picked by "A delegate can replace their own position paper" and the row they
-- are writing is then accepted by "Uploaders and organisers can change a file",
-- which asks only that they uploaded it. They could set kind = 'resource' and
-- audience = 'everyone' on their own position paper, and both the row and,
-- through the storage select policy, the file itself became readable by anybody
-- at all. A forbidden list is a list that rots; an allow-list refuses every
-- column this table gains from now on until somebody adds it on purpose.
--
-- The second is the review. permissions.md gives the review columns to the
-- chair, but the update policy above has to let a delegate write the row as
-- well, because replacing the file after "changes requested" is what reopens
-- the paper -- and specs/06-features/documents.md says that puts review_status
-- back to "submitted". So the delegate may put the paper back in the queue and
-- clear what the chair wrote, and nothing else: "approved" and
-- "changes_requested" are the chair's words about somebody else's work.

create or replace function public.protect_documents_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- What a browser may write. Everything outside this list is the document's
  -- identity and is refused: "id" and "created_at", which no row ever changes,
  -- and "conference_id", "committee_id", "seat_id", "uploaded_by" and "kind".
  --
  -- "storage_path" is in the list and has to be, although it is the name of the
  -- object in the bucket. Every path in specs/02-architecture/storage.md ends
  -- in a fresh uuid, so replacing a file writes a new path onto the row that is
  -- already there. "updated_at" is in it because documents_set_updated_at fires
  -- after this trigger -- triggers on the same event run in name order -- and
  -- overwrites whatever the caller sent a moment later anyway.
  writable constant text[] := array[
    'title', 'storage_path', 'file_name', 'file_size_bytes', 'mime_type',
    'audience', 'review_status', 'review_comment', 'reviewed_by',
    'reviewed_at', 'updated_at'
  ];
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if to_jsonb(new) - writable is distinct from to_jsonb(old) - writable then
    raise exception
      'A document cannot be turned into another kind, or moved to another conference, committee, seat or owner';
  end if;

  if public.is_committee_chair(new.committee_id) then
    return new;
  end if;

  if new.review_status is distinct from old.review_status
    and new.review_status is distinct from 'submitted'::public.review_status
  then
    raise exception 'Only a chair of this committee can review a position paper';
  end if;

  if new.review_comment is not null and new.review_comment is distinct from old.review_comment then
    raise exception 'Only a chair of this committee can review a position paper';
  end if;

  if (new.reviewed_by is not null and new.reviewed_by is distinct from old.reviewed_by)
    or (new.reviewed_at is not null and new.reviewed_at is distinct from old.reviewed_at)
  then
    raise exception 'Only a chair of this committee can review a position paper';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_documents_columns() from public, anon, authenticated;

create trigger documents_protect_columns
  before update on public.documents
  for each row
  execute function public.protect_documents_columns();


-- =============================================================================
-- schedule_events
-- =============================================================================
-- The programme: one row per thing that happens at a time and a place.
-- specs/06-features/schedule-and-announcements.md. Times are stored as moments
-- and shown in the conference's own timezone, which is a column of conferences.

create table public.schedule_events (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences (id) on delete cascade,
  committee_id uuid references public.committees (id) on delete cascade,
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  audience public.audience not null default 'everyone',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint schedule_events_ends_after_it_starts check (ends_at > starts_at),

  -- "delegation is not allowed here" (the data model). A school's own group has
  -- nothing on the conference programme; the four audiences that are left are
  -- everyone, the delegates, the team, and one committee.
  constraint schedule_events_audience_is_not_a_delegation check (
    audience <> 'delegation'
  ),

  -- A committee event names its committee, and nothing else does. Written as
  -- one equality of two yes-or-no answers, so neither half can drift: an event
  -- for everybody with a committee on it would be as wrong as a committee event
  -- without one.
  constraint schedule_events_committee_matches_audience check (
    (audience = 'committee') = (committee_id is not null)
  )
);

comment on table public.schedule_events is
  'The conference programme. One row per event, shown in the conference timezone.';

create index schedule_events_conference_starts_idx
  on public.schedule_events (conference_id, starts_at);

create index schedule_events_committee_id_idx on public.schedule_events (committee_id);

create trigger schedule_events_set_updated_at
  before update on public.schedule_events
  for each row
  execute function public.set_updated_at();

alter table public.schedule_events enable row level security;


-- -----------------------------------------------------------------------------
-- schedule_events: who may read
-- -----------------------------------------------------------------------------
-- The audience rules of specs/02-architecture/permissions.md, plus one line the
-- announcements below do not have: an organiser may put the "everyone" half of
-- the programme on the public conference page, which is the
-- conferences.show_schedule_publicly tick box.

create policy "Anyone can read a public programme"
  on public.schedule_events
  for select
  to anon, authenticated
  using (
    audience = 'everyone'
    and exists (
      select 1
      from public.conferences as conference
      where conference.id = schedule_events.conference_id
        and conference.status in ('published', 'archived')
        and conference.show_schedule_publicly
    )
  );

create policy "Participants and staff can read the whole-conference programme"
  on public.schedule_events
  for select
  to authenticated
  using (
    audience = 'everyone'
    and (public.is_conference_participant(conference_id)
         or public.is_conference_staff(conference_id))
  );

create policy "Participants can read the events meant for delegates"
  on public.schedule_events
  for select
  to authenticated
  using (audience = 'delegates' and public.is_conference_participant(conference_id));

create policy "Staff can read the events meant for staff"
  on public.schedule_events
  for select
  to authenticated
  using (audience = 'staff' and public.is_conference_staff(conference_id));

create policy "A committee's delegates and chairs can read its events"
  on public.schedule_events
  for select
  to authenticated
  using (
    audience = 'committee'
    and (public.is_committee_delegate(committee_id) or public.is_committee_chair(committee_id))
  );

create policy "Organisers can read the whole programme of their conference"
  on public.schedule_events
  for select
  to authenticated
  using (public.can_manage_conference(conference_id));

-- -----------------------------------------------------------------------------
-- Trigger: a committee event belongs to its conference's committee
-- -----------------------------------------------------------------------------
-- The check constraint above says a committee event names a committee; this
-- says which committees it may name. The announcements table has the same
-- trigger one section down, with a delegation to check as well.

create or replace function public.check_schedule_event_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.committee_id is not null
    and not exists (
      select 1
      from public.committees as committee
      where committee.id = new.committee_id
        and committee.conference_id = new.conference_id
    )
  then
    raise exception 'That committee is not part of this conference';
  end if;

  return new;
end;
$$;

revoke execute on function public.check_schedule_event_scope() from public, anon, authenticated;

create trigger schedule_events_check_scope
  before insert or update on public.schedule_events
  for each row
  execute function public.check_schedule_event_scope();


create policy "Organisers can add an event"
  on public.schedule_events
  for insert
  to authenticated
  with check (public.can_manage_conference(conference_id));

create policy "Organisers can change an event"
  on public.schedule_events
  for update
  to authenticated
  using (public.can_manage_conference(conference_id))
  with check (public.can_manage_conference(conference_id));

create policy "Organisers can remove an event"
  on public.schedule_events
  for delete
  to authenticated
  using (public.can_manage_conference(conference_id));


-- =============================================================================
-- announcements
-- =============================================================================
-- What the conference says to the people taking part in it. Plain text in MVP;
-- Markdown is Phase 2.

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null,
  audience public.audience not null default 'everyone',
  committee_id uuid references public.committees (id) on delete cascade,
  delegation_id uuid references public.delegations (id) on delete cascade,
  is_pinned boolean not null default false,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The same shape as the schedule's constraint above, once per audience that
  -- names something: a committee announcement names a committee and nothing
  -- else does, and the same for a delegation.
  constraint announcements_committee_matches_audience check (
    (audience = 'committee') = (committee_id is not null)
  ),
  constraint announcements_delegation_matches_audience check (
    (audience = 'delegation') = (delegation_id is not null)
  )
);

comment on table public.announcements is
  'Messages from the conference to an audience. Publishing one notifies everybody in that audience.';

-- Pinned first and newest first is how every page that reads this table sorts
-- it, so the index carries both.
create index announcements_conference_published_idx
  on public.announcements (conference_id, is_pinned desc, published_at desc);

create index announcements_author_id_idx on public.announcements (author_id);
create index announcements_committee_id_idx on public.announcements (committee_id);
create index announcements_delegation_id_idx on public.announcements (delegation_id);

create trigger announcements_set_updated_at
  before update on public.announcements
  for each row
  execute function public.set_updated_at();

alter table public.announcements enable row level security;


-- -----------------------------------------------------------------------------
-- announcements: who may read and write
-- -----------------------------------------------------------------------------
-- The audience rules of specs/02-architecture/permissions.md. An announcement
-- is never public, even on a published conference: the whole table is behind a
-- signed-in reader who takes part in the conference or helps run it.

create policy "Participants and staff can read an announcement to everyone"
  on public.announcements
  for select
  to authenticated
  using (
    audience = 'everyone'
    and (public.is_conference_participant(conference_id)
         or public.is_conference_staff(conference_id))
  );

create policy "Participants can read an announcement to the delegates"
  on public.announcements
  for select
  to authenticated
  using (audience = 'delegates' and public.is_conference_participant(conference_id));

create policy "Staff can read an announcement to the team"
  on public.announcements
  for select
  to authenticated
  using (audience = 'staff' and public.is_conference_staff(conference_id));

create policy "A committee's delegates and chairs can read its announcements"
  on public.announcements
  for select
  to authenticated
  using (
    audience = 'committee'
    and (public.is_committee_delegate(committee_id) or public.is_committee_chair(committee_id))
  );

create policy "A delegation's members can read its announcements"
  on public.announcements
  for select
  to authenticated
  using (audience = 'delegation' and public.is_delegation_member(delegation_id));

create policy "Organisers can read every announcement of their conference"
  on public.announcements
  for select
  to authenticated
  using (public.can_manage_conference(conference_id));

-- -----------------------------------------------------------------------------
-- Trigger: an announcement's committee and delegation belong to its conference
-- -----------------------------------------------------------------------------
-- notify_announcement would refuse a committee from another conference anyway,
-- because conference_audience_user_ids scopes all three of its parameters. This
-- says so on the table rather than through a notification the row happens to
-- send, so that the rule is still there the day an announcement is edited.

create or replace function public.check_announcement_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.committee_id is not null
    and not exists (
      select 1
      from public.committees as committee
      where committee.id = new.committee_id
        and committee.conference_id = new.conference_id
    )
  then
    raise exception 'That committee is not part of this conference';
  end if;

  if new.delegation_id is not null
    and not exists (
      select 1
      from public.delegations as delegation
      where delegation.id = new.delegation_id
        and delegation.conference_id = new.conference_id
    )
  then
    raise exception 'That delegation is not part of this conference';
  end if;

  return new;
end;
$$;

revoke execute on function public.check_announcement_scope() from public, anon, authenticated;

create trigger announcements_check_scope
  before insert or update on public.announcements
  for each row
  execute function public.check_announcement_scope();


create policy "Organisers can publish an announcement to any audience"
  on public.announcements
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and public.can_manage_conference(conference_id)
  );

-- A chair speaks to their own committee and to nobody else. That the committee
-- is one of this conference's is check_announcement_scope above, because
-- is_committee_chair on its own says nothing about the conference_id the row
-- carries.
create policy "Chairs can publish an announcement to their own committee"
  on public.announcements
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and audience = 'committee'
    and public.is_committee_chair(committee_id)
  );

create policy "The author or an organiser can edit an announcement"
  on public.announcements
  for update
  to authenticated
  using (author_id = (select auth.uid()) or public.can_manage_conference(conference_id))
  with check (author_id = (select auth.uid()) or public.can_manage_conference(conference_id));

create policy "The author or an organiser can delete an announcement"
  on public.announcements
  for delete
  to authenticated
  using (author_id = (select auth.uid()) or public.can_manage_conference(conference_id));


-- -----------------------------------------------------------------------------
-- Trigger: which columns of an announcement a browser may write
-- -----------------------------------------------------------------------------
-- The update policy above is "the author or an organiser", which is who
-- specs/02-architecture/permissions.md gives an edit to. Who an announcement is
-- *addressed to* is a different question, and the two insert policies answer
-- it: an organiser writes to any audience, a chair writes to their own
-- committee and to nothing else.
--
-- Without this guard an edit walks straight around that rule. Postgres checks
-- the updated row against the table's policies again, and the author branch of
-- the update policy is true whatever the row has been turned into -- so a chair
-- could publish to their own committee and then edit that row into a pinned
-- announcement to everyone, or to the whole team, and the delegates of the
-- conference would read it.
--
-- So an edit changes what an announcement says and whether it is pinned, and
-- never who it is for. Re-addressing one means deleting it and writing a new
-- one, which is also the only thing that tells the new audience: notify_-
-- announcement fires on insert and on nothing else.

create or replace function public.protect_announcements_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- What a browser may write, taken away from both rows by the check below.
  -- It is an allow-list rather than a list of the columns that are refused, for
  -- the reason the "Trigger-protected columns" rule in permissions.md gives: a
  -- forbidden list rots, and the next column added to this table would be
  -- writable by a browser the day it lands.
  --
  -- Left out, and therefore refused: "id" and "created_at", which no row ever
  -- changes, and the five that say who the announcement is from and who it is
  -- for -- "conference_id", "author_id", "audience", "committee_id" and
  -- "delegation_id".
  --
  -- "updated_at" is in the list because announcements_set_updated_at fires
  -- after this trigger, triggers on the same event running in name order, and
  -- overwrites whatever the caller sent.
  writable constant text[] := array[
    'title', 'body', 'is_pinned', 'published_at', 'updated_at'
  ];
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if to_jsonb(new) - writable is distinct from to_jsonb(old) - writable then
    raise exception
      'An announcement cannot be re-addressed after it is published; delete it and write a new one';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_announcements_columns() from public, anon, authenticated;

create trigger announcements_protect_columns
  before update on public.announcements
  for each row
  execute function public.protect_announcements_columns();


-- =============================================================================
-- The "documents" storage bucket
-- =============================================================================
-- The second and last bucket of specs/02-architecture/storage.md, and the
-- opposite of public-media in migration 0004: nothing here is served from a
-- plain address. A page that wants to show a file asks Storage for a signed URL
-- that lasts sixty seconds, and Storage only makes one for somebody the select
-- policy below lets through.
--
-- THE PATHS
--   <conference id>/position-papers/<seat id>-<uuid>.pdf
--   <conference id>/background-guides/<committee id>-<uuid>.pdf
--   <conference id>/resources/<uuid>.<ext>
--
-- The first folder says which conference the file belongs to and the second
-- says what kind of file it is; for the first two kinds the name then starts
-- with the id of the seat or the committee it is for. That is the whole rule
-- the two helpers below read, in the same shape as may_write_public_media.
--
-- The type list is the bucket's own guard and is wider than any one kind of
-- file: a position paper is a PDF, which the documents table checks, while a
-- resource may be a picture or a Word document. image/* in storage.md is
-- written out as the same three image types public-media accepts, because
-- storage.buckets holds a list of exact types and not a pattern.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  20971520, -- 20 MB, written out in bytes because that is what the column holds
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- may_upload_conference_document(object_name)
-- -----------------------------------------------------------------------------
-- Whether the signed-in person may put a new file at this path. It answers the
-- "insert" line of the storage table in specs/02-architecture/storage.md: the
-- seat's delegate for their own position paper, a chair for their committee's
-- background guide, an organiser for the conference's resources.
--
-- "storage.foldername(path)" is Storage's own helper. It cuts a path into its
-- folders, so '7f3c…/resources/a1b2.pdf' gives {7f3c…, resources}; the file
-- name itself is not in it, which is why the name is read separately below.

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
    return public.can_manage_conference(the_conference);
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

grant execute on function public.may_upload_conference_document(text) to authenticated;


-- -----------------------------------------------------------------------------
-- may_change_conference_document(object_name)
-- -----------------------------------------------------------------------------
-- The "update / delete" line of the same table: "uploader, chair, organiser".
-- The uploader half is the object's own owner column and is asked in the two
-- policies below, so this function answers only for the chair and the
-- organiser. It differs from the one above in exactly one place: a position
-- paper may be replaced or removed by a chair of the seat's committee, who is
-- not the person allowed to upload it in the first place.

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
    return public.can_manage_conference(the_conference);
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

grant execute on function public.may_change_conference_document(text) to authenticated;


-- -----------------------------------------------------------------------------
-- Policies on storage.objects for the documents bucket
-- -----------------------------------------------------------------------------
-- Reading the bytes is the same question as reading the row: the "exists" below
-- runs under the reader's own Row Level Security, so the documents select
-- policies decide it and the rule is written once rather than twice. A file
-- with no row is readable by nobody, which is the right answer for the moment
-- between an upload failing and the row never being written.
--
-- anon is on the select policy because a background guide marked "everyone" on
-- a published conference is readable by a visitor, and the signed URL for it is
-- made in "load" with a client that has nobody signed in.

create policy "You can read a document file if you can read its row"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1
      from public.documents as document
      where document.storage_path = storage.objects.name
    )
  );

create policy "Delegates, chairs and organisers can upload a document"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'documents'
    and public.may_upload_conference_document(name)
  );

-- Replacing a file needs both halves: "using" picks the rows that may be
-- changed and "with check" says what they may be changed into.
--
-- The two halves are deliberately different. "using" asks who the file belongs
-- to, where being its uploader is enough. "with check" asks about the path it
-- would end up at, and being the uploader says nothing about that: Storage
-- renames an object by updating its name, so an uploader whose own id satisfied
-- both halves could move their paper into any folder in the bucket. It has to
-- be a path they could have uploaded to in the first place, or one they could
-- remove a file from -- which is the same pair of questions the insert and
-- delete policies ask, put side by side.
create policy "Uploaders, chairs and organisers can replace a document"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'documents'
    and (owner = (select auth.uid()) or public.may_change_conference_document(name))
  )
  with check (
    bucket_id = 'documents'
    and (
      public.may_upload_conference_document(name)
      or public.may_change_conference_document(name)
    )
  );

create policy "Uploaders, chairs and organisers can delete a document"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'documents'
    and (owner = (select auth.uid()) or public.may_change_conference_document(name))
  );


-- =============================================================================
-- conference_audience_user_ids, replaced
-- =============================================================================
-- Migration 0006 wrote this function for the two triggers below, which did not
-- exist yet. Two things about it have to change now that they do, and both are
-- about a chair.
--
-- specs/02-architecture/permissions.md lets a chair publish an announcement to
-- their own committee. The trigger that fires on that insert runs inside the
-- chair's own request and asks this function who the audience is, and the gate
-- as migration 0006 wrote it is can_manage_conference, which a chair fails. So
-- a chair could write the row and the statement would then abort on the
-- notification -- the one audience a chair is allowed to address would be the
-- one nobody could address.
--
-- The exception is committee-shaped rather than chair-shaped: for
-- audience = 'committee' the gate becomes is_committee_chair of that committee,
-- which is true of its chairs and of anybody who can manage the conference. It
-- hands back the committee's seat holders and its chairs, and nothing else --
-- and the seats select policy already gives every member of staff exactly those
-- rows, so a chair learns nothing here they could not read from the table. The
-- delegation branches, which are the reason the gate is can_manage_conference
-- and not is_conference_staff, are untouched.
--
-- The two scoping checks move above the gate. They have to, now that the gate
-- for one audience reads committee_id: a stranger handing in their own
-- conference id with somebody else's committee id should be told the committee
-- is not part of this conference, which is the answer migration 0006 gave and
-- the answer client/tests/db/participant-notifications.test.ts expects. Neither
-- check has changed, and together they still mean that every one of the three
-- parameters is scoped and not only the first.
--
-- Everything below the gate is migration 0006's, word for word.

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
  -- one of this conference's. Without these the gate below is true of the
  -- conference_id and of nothing else: anybody signed in may create an
  -- organisation and a conference of their own, which makes them staff of it,
  -- and could then hand in their own conference id with somebody else's
  -- committee id and read that committee's delegates.
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

  -- Who is taking part in a conference is the team's to know and nobody
  -- else's. Without this any signed-in stranger could ask for the 'delegates'
  -- list of any conference and turn the ids into names through profiles, which
  -- everybody signed in may read. That is exactly what the seats policy and the
  -- public_seats view exist to prevent, so the function has to ask the same
  -- question they do.
  --
  -- It is written here rather than as a policy because a function has no
  -- policies. It stays security definer, because the lists it adds up come from
  -- tables even an organiser may not read whole -- organization_members is the
  -- clear one -- and because the notify_* triggers call it while writing rows
  -- the caller could not write themselves. Those triggers run inside the
  -- request of the person who published the announcement or the schedule
  -- change, so this check is that person's own and not a second one they have
  -- to pass.
  if conference_audience_user_ids.audience = 'committee' then
    if not public.is_committee_chair(conference_audience_user_ids.committee_id) then
      raise exception 'Only the organisers of a conference can see who takes part in it';
    end if;
  elsif not public.can_manage_conference(conference_audience_user_ids.conference_id) then
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

revoke execute on function public.conference_audience_user_ids(uuid, public.audience, uuid, uuid)
  from public, anon;
grant execute on function public.conference_audience_user_ids(uuid, public.audience, uuid, uuid)
  to authenticated;


-- =============================================================================
-- Notifications
-- =============================================================================
-- The three lines of specs/02-architecture/notifications.md that belong to
-- these tables. Like every notify_* before them they are "security definer",
-- because notifications has no insert policy at all and a trigger running as
-- the organiser could not write a row addressed to somebody else.
--
-- A NOTE ABOUT LENGTH
-- notifications.md asks for a title under 100 characters, and two of the three
-- below are built out of something a person typed into a form. An organiser who
-- writes a 200-character announcement headline would otherwise write a
-- 200-character notification, so each of these shortens what it was given and
-- ends it with an ellipsis. The announcement itself keeps every word; it is
-- only the line in the bell that is cut.

-- -----------------------------------------------------------------------------
-- notify_announcement()
-- -----------------------------------------------------------------------------
-- One row per person in the audience, resolved by conference_audience_user_ids
-- so that this trigger and notify_schedule_changed can never disagree about who
-- "the delegates" are.
--
-- The author is left out. notifications.md says "everyone in the audience", and
-- the author is in it whenever they address a group they belong to, but a bell
-- that lights up for something you have just written yourself is noise rather
-- than news.

create or replace function public.notify_announcement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conference_slug text;
  short_title text;
begin
  select conference.slug
  into conference_slug
  from public.conferences as conference
  where conference.id = new.conference_id;

  short_title := case
    when char_length(new.title) <= 99 then new.title
    else left(new.title, 98) || '…'
  end;

  insert into public.notifications (user_id, conference_id, kind, title, link_path)
  select
    recipient,
    new.conference_id,
    'announcement',
    short_title,
    '/conferences/' || conference_slug || '/announcements'
  from public.conference_audience_user_ids(
    new.conference_id,
    new.audience,
    new.committee_id,
    new.delegation_id
  ) as recipient
  where recipient is distinct from new.author_id;

  return new;
end;
$$;

revoke execute on function public.notify_announcement() from public, anon, authenticated;

create trigger announcements_notify_published
  after insert on public.announcements
  for each row
  execute function public.notify_announcement();


-- -----------------------------------------------------------------------------
-- notify_schedule_changed()
-- -----------------------------------------------------------------------------
-- "Opening ceremony moved to 20 Jan, 09:00."
--
-- specs/06-features/schedule-and-announcements.md only tells the audience about
-- an event that starts within the next 24 hours. A programme being built two
-- months out is edited many times and nobody wants a notification for each one;
-- a time that moves on the morning of the conference is the one thing a
-- delegate has to hear. Both the old start and the new one are looked at, so
-- moving an event out of the next 24 hours is announced as well as moving one
-- into them.
--
-- Whoever made the change is left out, the way notify_announcement leaves the
-- author of an announcement out: an organiser who has just dragged a session an
-- hour later does not need a bell about it. schedule_events carries no author
-- column, so it is the person writing the row rather than the person who
-- created it, which is the same one in practice.
--
-- The time is written in the conference's own timezone, which is what every
-- screen shows and what an organiser typed. Postgres has no Intl.DateTimeFormat
-- and to_char has no month names beyond the English abbreviations it ships
-- with, which is what "20 Jan, 09:00" is; src/lib/dates.ts is what formats the
-- same moment on a page.

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

  return new;
end;
$$;

revoke execute on function public.notify_schedule_changed() from public, anon, authenticated;

create trigger schedule_events_notify_changed
  after update of starts_at, ends_at, location on public.schedule_events
  for each row
  execute function public.notify_schedule_changed();


-- -----------------------------------------------------------------------------
-- notify_document_reviewed()
-- -----------------------------------------------------------------------------
-- "Your position paper for Security Council was approved."
--
-- notifications.md writes the sentence up to the last word and leaves the two
-- endings open. "approved" is the chair's own word for it; the other reads
-- "sent back for changes", because "changes_requested" is the database's word
-- and not something to say to a person.

create or replace function public.notify_document_reviewed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  committee_name text;
  link text;
  decision_word text;
begin
  -- "is null" first, because "null not in (…)" is null rather than true, so a
  -- chair clearing the review would fall past the test below and be announced
  -- as "sent back for changes".
  if new.review_status is null
    or new.review_status is not distinct from old.review_status
    or new.review_status not in ('approved', 'changes_requested')
  then
    return new;
  end if;

  select
    committee.name,
    '/conferences/' || conference.slug
      || '/committees/' || committee.slug
      || '/position-paper'
  into committee_name, link
  from public.committees as committee
  join public.conferences as conference on conference.id = committee.conference_id
  where committee.id = new.committee_id;

  decision_word = case new.review_status
    when 'approved' then 'approved'
    else 'sent back for changes'
  end;

  insert into public.notifications (user_id, conference_id, kind, title, link_path)
  values (
    new.uploaded_by,
    new.conference_id,
    'document_reviewed',
    'Your position paper for ' || committee_name || ' was ' || decision_word,
    link
  );

  return new;
end;
$$;

revoke execute on function public.notify_document_reviewed() from public, anon, authenticated;

create trigger documents_notify_reviewed
  after update of review_status on public.documents
  for each row
  execute function public.notify_document_reviewed();


-- =============================================================================
-- move_delegate and revoke_seat, replaced
-- =============================================================================
-- Both have been carrying a "T34" comment since migration 0006, because a
-- position paper is the one thing that has to follow a delegate between seats
-- and the documents table did not exist yet. The bodies below are copied from
-- supabase/migrations/20260919120000_fees_and_invoices.sql, where T17 replaced
-- them to add the invoice each one owes; migration 0006's copies are stale and
-- starting from one of those would silently drop that invoice.
--
-- Everything but the last statement of each function is unchanged.

create or replace function public.move_delegate(from_seat_id uuid, to_seat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  from_seat public.seats;
  to_seat public.seats;
  from_conference uuid;
  to_conference uuid;
begin
  -- The seat and its conference are read one after the other, because PL/pgSQL
  -- refuses to fill a whole-row variable and a plain one from the same "into"
  -- list.
  select *
  into from_seat
  from public.seats as seat_row
  where seat_row.id = move_delegate.from_seat_id;

  select committee.conference_id
  into from_conference
  from public.committees as committee
  where committee.id = from_seat.committee_id;

  if from_seat.id is null then
    raise exception 'That seat does not exist';
  end if;

  if not public.can_manage_conference(from_conference) then
    raise exception 'Only the organisers of this conference can move a delegate';
  end if;

  if from_seat.user_id is null then
    raise exception 'Nobody is sitting in that seat';
  end if;

  select *
  into to_seat
  from public.seats as seat_row
  where seat_row.id = move_delegate.to_seat_id;

  select committee.conference_id
  into to_conference
  from public.committees as committee
  where committee.id = to_seat.committee_id;

  if to_seat.id is null or to_conference is distinct from from_conference then
    raise exception 'That seat is not part of this conference';
  end if;

  if to_seat.user_id is not null or not to_seat.is_available then
    raise exception 'That seat is not free';
  end if;

  -- A seat reserved for a delegation may only take a member of it, which
  -- check_seat_allocation decides. Asking here as well would be the same rule
  -- written twice.

  -- allocated_at is "when user_id or delegation_id was last set"
  -- (specs/02-architecture/data-model.md), so a seat that keeps its reservation
  -- keeps the moment it was reserved. Only a seat going back to being free
  -- forgets it.
  -- The paper belongs to the delegate and not to the seat
  -- (specs/06-features/documents.md), so it follows them the way the invoice
  -- below does. It is moved first, before the seat it points at is emptied,
  -- because seats_clear_position_paper further down removes the paper of a
  -- seat that changes hands and would otherwise get there first. The file in
  -- the bucket is not touched and does not need to be: its path carries the
  -- seat id it was uploaded for, which is only ever read to work out who may
  -- write there, and the row is what every page reads.
  update public.documents as document
  set seat_id = move_delegate.to_seat_id,
      committee_id = to_seat.committee_id
  where document.seat_id = move_delegate.from_seat_id
    and document.kind = 'position_paper';

  update public.seats
  set user_id = null,
      application_id = null,
      allocated_at = case when delegation_id is null then null else allocated_at end
  where id = move_delegate.from_seat_id;

  update public.seats
  set user_id = from_seat.user_id,
      application_id = from_seat.application_id,
      allocated_at = now()
  where id = move_delegate.to_seat_id;

  -- The delegate's bill follows them, so that whatever happens to the new seat
  -- happens to the invoice written for the old one. The table is aliased
  -- because the column and the parameters are so nearly the same word; the
  -- column being set is never qualified, which is Postgres's rule for an
  -- update.
  update public.invoices as invoice
  set seat_id = move_delegate.to_seat_id
  where invoice.seat_id = move_delegate.from_seat_id
    and invoice.status = 'unpaid';

end;
$$;

revoke execute on function public.move_delegate(uuid, uuid) from public, anon;
grant execute on function public.move_delegate(uuid, uuid) to authenticated;

create or replace function public.revoke_seat(seat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  seat public.seats;
  seat_conference uuid;
begin
  -- Two statements, because PL/pgSQL refuses to fill a whole-row variable and a
  -- plain one from the same "into" list.
  select *
  into seat
  from public.seats as seat_row
  where seat_row.id = revoke_seat.seat_id;

  select committee.conference_id
  into seat_conference
  from public.committees as committee
  where committee.id = seat.committee_id;

  if seat.id is null then
    raise exception 'That seat does not exist';
  end if;

  if not public.can_manage_conference(seat_conference) then
    raise exception 'Only the organisers of this conference can revoke a seat';
  end if;

  if seat.user_id is null then
    raise exception 'Nobody is sitting in that seat';
  end if;

  -- The individual application that won this seat is rejected with it, so the
  -- applicant's own page stops saying they are coming.
  if seat.application_id is not null then
    update public.applications
    set status = 'rejected',
        decided_at = now(),
        decided_by = me
    where id = seat.application_id;
  end if;

  -- The delegation keeps its reservation, and with it the moment that
  -- reservation was made; see move_delegate above for why.
  update public.seats
  set user_id = null,
      application_id = null,
      allocated_at = case when delegation_id is null then null else allocated_at end
  where id = revoke_seat.seat_id;

  -- A paid invoice is left exactly as it is. The money has arrived, and giving
  -- it back is a refund somebody has to decide on, which the organiser's fees
  -- page asks them to do.
  -- The table is aliased because this function's parameter is also called
  -- seat_id: an unqualified seat_id in the "where" would match both the column
  -- and the parameter, and PL/pgSQL refuses a name it cannot decide. The
  -- statement above gets away with it only because "id" is not a parameter.
  update public.invoices as invoice
  set status = 'void'
  where invoice.seat_id = revoke_seat.seat_id
    and invoice.status = 'unpaid';

  -- The paper goes with the seat. Whoever sits here next writes their own, and
  -- the delegate who has just lost the seat may upload again once they hold
  -- another one. The file itself is removed by the app, which is the only thing
  -- in MUNMeet that may talk to storage; a row deleted here with its object
  -- left behind is a few kilobytes nobody can reach, which is a smaller problem
  -- than a database function reaching out of the database.
  delete from public.documents as document
  where document.seat_id = revoke_seat.seat_id
    and document.kind = 'position_paper';
end;
$$;

revoke execute on function public.revoke_seat(uuid) from public, anon;
grant execute on function public.revoke_seat(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- Trigger: a seat that changes hands loses its position paper
-- -----------------------------------------------------------------------------
-- specs/06-features/documents.md names three ways a delegate stops holding a
-- seat, and says the paper is deleted for two of them: revoke_seat, which does
-- it above, "or a delegation head unassigns a member". The third, move_delegate,
-- carries the paper along instead.
--
-- A head unassigning a member is not a function. permissions.md gives them the
-- seats.user_id column directly, so they clear it with a plain update, and
-- without this trigger the paper would stay on the seat -- where the next person
-- the head puts in it would read it, because the documents select policy asks
-- who is sitting in the seat the paper names. An organiser clearing the same
-- column by hand, which the seats update policy also allows, leaves the same
-- paper behind.
--
-- It fires for every writer, including the two allocation functions, and does
-- not try to tell them apart. It could not: this is security definer, because a
-- head is neither the paper's uploader nor an organiser and the delete would
-- otherwise match nothing under their own Row Level Security -- and inside a
-- security definer function current_user is the owner, so the test the
-- protect_<table>_columns guards use says "postgres" here whoever is asking.
-- check_seat_allocation says the same thing about itself a few migrations up.
--
-- Firing for all three is the right answer anyway. move_delegate re-points the
-- paper at the new seat *before* it empties the old one, so the "where seat_id
-- = old.id" below finds nothing. revoke_seat deletes the paper itself, and
-- whichever of the two gets there first, the paper is gone.
--
-- The file itself stays in the bucket. Only the app may talk to storage, and a
-- few kilobytes nobody can reach is a smaller problem than a database function
-- reaching out of the database.

create or replace function public.clear_position_paper_on_seat_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.user_id is null or new.user_id is not distinct from old.user_id then
    return new;
  end if;

  delete from public.documents as document
  where document.seat_id = old.id
    and document.kind = 'position_paper';

  return new;
end;
$$;

revoke execute on function public.clear_position_paper_on_seat_change()
  from public, anon, authenticated;

create trigger seats_clear_position_paper
  before update of user_id on public.seats
  for each row
  execute function public.clear_position_paper_on_seat_change();
