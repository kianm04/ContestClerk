-- =============================================================================
-- Committee papers (docs/committee-papers.md, step 1: papers in the database)
-- =============================================================================
--
-- Until now a committee's own writing lived on laptops: working papers, draft
-- resolutions and amendments were typed elsewhere and read out, and the
-- documents table's two unused kinds were the only trace of them. This
-- migration gives every kind of paper a committee writes a home of its own,
-- with the rules of sections 3 to 5 of the specification enforced here:
--
--   * committee_papers, the papers themselves: working papers, draft
--     resolutions, committee, joint and personal directives and press
--     releases. A paper is private to its authors until they open it for
--     signatures or submit it (may_read_paper).
--   * committee_paper_seats, the seats that write (authors) and sign
--     (signatories) a paper. Seats write, people type.
--   * committee_paper_sources, the introduced working papers a draft is based
--     on.
--   * committee_paper_versions, the text frozen into clauses with ids at
--     submission, and every version an amendment makes after that.
--   * amendments and amendment_seats, the changes proposed to an introduced
--     draft, the sponsors' answers and the support they gather.
--   * paper_comment_threads and paper_comments, the comments on a paper's
--     text, shared with position papers.
--   * one column per setting of section 5 on committees, so each committee
--     keeps its own procedure.
--   * motions.paper_id, votes.paper_id and votes.amendment_id, so introducing
--     a paper and voting on it or on an amendment settle it;
--     committee_state.displayed_paper_id for the projector, and the crisis
--     update.
--   * the documents policy "Delegates and staff can read working papers" goes,
--     and votes.document_id with it, since nothing ever wrote either.
--
-- Writes go through security definer functions, one per thing a person does,
-- so each rule lives in one place and every change of status is atomic. The
-- tables have read policies and nothing more, except the three writes that
-- are plain: the authors' live save of the text, the working papers a draft
-- is based on, and the lead author deleting a paper never submitted. The
-- delegates' screens arrive from step 2 on; this step has no visible change.
--
-- The new values of permission and notification_kind are in
-- 20261008120000_committee_papers_enum_values.sql, which explains why they
-- cannot be in this file.


-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
-- committee_format: a standard committee writes working papers and draft
-- resolutions; a crisis committee writes the four crisis kinds, and the
-- standard two as well when committees.crisis_allows_resolutions says so.
create type public.committee_format as enum ('standard', 'crisis');

-- What a paper is. The first three go to the dais and then to the committee;
-- the last three go to the crisis staff.
create type public.paper_kind as enum (
  'working_paper',
  'draft_resolution',
  'committee_directive',
  'joint_directive',
  'personal_directive',
  'press_release'
);

-- Where a paper is in its life (section 4, "The life of a paper"). Which of
-- these a kind can reach is committee_papers_status_fits_kind below. Being
-- open for signatures is not a status but a flag on a paper being written.
create type public.paper_status as enum (
  'writing',
  'submitted',
  'approved',
  'introduced',
  'passed',
  'failed',
  'withdrawn',
  'carried_out',
  'refused',
  'published'
);

-- A seat writes a paper (an author; a sponsor on a draft resolution) or signs
-- one it did not write (a signatory).
create type public.paper_seat_role as enum ('author', 'signatory');

-- What an amendment does to its clause.
create type public.amendment_action as enum ('add', 'change', 'strike');

-- Where an amendment is. The first four are still waiting; the rest are how
-- it ended.
--   awaiting_sponsors    the draft's sponsors are asked whether it is friendly
--   collecting_support   unfriendly, gathering the signatures it needs
--   with_the_dais        in the dais's queue, to approve or rule out of order
--   approved             unfriendly and approved, waiting for its vote
--   written_in           friendly, approved and written into the draft
--   passed, failed       how its vote went
--   out_of_order         ruled out of order by the dais, with a reason
--   withdrawn            taken back by its proposer
--   lapsed               its clause, its draft or its parent went first
create type public.amendment_status as enum (
  'awaiting_sponsors',
  'collecting_support',
  'with_the_dais',
  'approved',
  'written_in',
  'passed',
  'failed',
  'out_of_order',
  'withdrawn',
  'lapsed'
);

-- The words a committee's screens use for the people on a paper: "Sponsors"
-- and "Signatories", or THIMUN's "Main submitter" and "Co-submitters". Only
-- words; the rules are the same.
create type public.paper_words as enum ('sponsors_and_signatories', 'submitters');

-- How a minimum of support is counted: a number of seats, or a share of the
-- seats that have a delegate, rounded up (paper_support_needed).
create type public.support_unit as enum ('seats', 'percent');


-- -----------------------------------------------------------------------------
-- committees: one column per setting of section 5
-- -----------------------------------------------------------------------------
-- The defaults are common North American procedure, which most conferences on
-- the platform follow, so most committees never change them.
-- apply_committee_procedure fills them from North American or THIMUN
-- procedure in one press and copy_committee_procedure copies one committee's
-- to others; nothing stores which procedure was chosen, so there is no third,
-- half-supported "custom" mode. Settings are read when they matter and never
-- written into papers: changing the support a draft needs changes what the
-- next submission is checked against, not what was submitted before.

alter table public.committees
  add column format public.committee_format not null default 'standard',
  add column crisis_allows_resolutions boolean not null default false,
  add column paper_words public.paper_words not null default 'sponsors_and_signatories',
  add column has_working_papers boolean not null default true,
  add column sponsor_limit integer default 5,
  add column support_minimum integer not null default 20,
  add column support_unit public.support_unit not null default 'percent',
  add column support_counts_sponsors boolean not null default true,
  add column one_sponsorship_per_topic boolean not null default false,
  add column has_friendly_amendments boolean not null default true,
  add column amendment_support_minimum integer not null default 10,
  add column amendment_support_unit public.support_unit not null default 'percent',
  add column preamble_amendable boolean not null default false,
  add column has_second_degree_amendments boolean not null default false,
  add column checks_format boolean not null default true,
  -- Null is "no cap". A thousand is far beyond any committee and keeps a
  -- typing slip from becoming a number nobody meant.
  add constraint committees_sponsor_limit_in_range
    check (sponsor_limit is null or sponsor_limit between 1 and 1000),
  add constraint committees_support_minimum_in_range
    check (
      support_minimum between 0 and 1000
      and (support_unit = 'seats' or support_minimum <= 100)
    ),
  add constraint committees_amendment_support_minimum_in_range
    check (
      amendment_support_minimum between 0 and 1000
      and (amendment_support_unit = 'seats' or amendment_support_minimum <= 100)
    );

comment on column public.committees.format is
  'Standard or crisis: which kinds of paper the committee writes.';
comment on column public.committees.crisis_allows_resolutions is
  'A crisis committee also writes working papers and draft resolutions.';
comment on column public.committees.paper_words is
  'The words on screen: sponsors and signatories, or main submitter and co-submitters.';
comment on column public.committees.has_working_papers is
  'Off hides working papers; blocs write draft resolutions from the start.';
comment on column public.committees.sponsor_limit is
  'The most sponsors a draft resolution may have when it is submitted. Null for no cap.';
comment on column public.committees.support_minimum is
  'The support a draft resolution needs to be submitted, in support_unit.';
comment on column public.committees.support_counts_sponsors is
  'Whether the sponsors count towards that support, or the signatories alone.';
comment on column public.committees.one_sponsorship_per_topic is
  'A seat may sponsor only one draft resolution per topic.';
comment on column public.committees.has_friendly_amendments is
  'An amendment every sponsor accepts is friendly and written in when the dais approves it.';
comment on column public.committees.amendment_support_minimum is
  'The support an unfriendly amendment needs to reach the dais, in amendment_support_unit. The proposer counts.';
comment on column public.committees.preamble_amendable is
  'Preambulatory clauses can be amended, not only operative ones.';
comment on column public.committees.has_second_degree_amendments is
  'A pending unfriendly amendment can itself be amended, one level deep.';
comment on column public.committees.checks_format is
  'The writer and the dais''s review list what does not follow the resolution format.';


-- protect_committees_columns (20261007180000) lets somebody who edits only
-- their own committees change its description and agenda and nothing else.
-- Section 8 gives the settings above to manage_committees wherever it is
-- held, so they join that list. The rest of the function is as it was.

create or replace function public.protect_committees_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- What somebody who edits only their own committees may change.
  per_committee constant text[] := array[
    'description', 'topics', 'updated_at',
    'format', 'crisis_allows_resolutions', 'paper_words', 'has_working_papers',
    'sponsor_limit', 'support_minimum', 'support_unit', 'support_counts_sponsors',
    'one_sponsorship_per_topic', 'has_friendly_amendments',
    'amendment_support_minimum', 'amendment_support_unit', 'preamble_amendable',
    'has_second_degree_amendments', 'checks_format'
  ];
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
      'Only the people who edit every committee can change more than its description, agenda and resolution settings';
  end if;

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- committee_papers
-- -----------------------------------------------------------------------------
-- A paper belongs to a committee and a topic, not to a session: a bloc writes
-- across lunch and into the next day. While it is written its text is a Yjs
-- document, exactly as a position paper's draft is (20260929120000), and the
-- Markdown columns are written from it on every save as if every open
-- suggestion were rejected: they are the agreed text, which word counts, the
-- plain form and the format checks read. A draft resolution and a committee
-- directive keep their parts apart, because the editor shows one editor per
-- part and submitting turns each into clauses.
--
-- topic_number and sequence are the "1.2" of "Draft resolution 1.2", given
-- by the dais on approval and never before.

create table public.committee_papers (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees (id) on delete cascade,
  kind public.paper_kind not null,
  status public.paper_status not null default 'writing',
  title text not null,
  topic text,
  topic_number integer,
  sequence integer,
  started_by_seat_id uuid references public.seats (id) on delete set null,
  lead_seat_id uuid references public.seats (id) on delete set null,
  is_open_for_signatures boolean not null default false,
  document_state bytea,
  body_markdown text,
  preamble_markdown text,
  operative_markdown text,
  revision integer not null default 1,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  return_comment text,
  answer_markdown text,
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  introduced_at timestamptz,
  introduced_by_motion_id uuid references public.motions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint committee_papers_title_is_written
    check (title ~ '[^[:space:]]' and char_length(title) <= 200),

  -- A draft resolution has both parts, a committee directive operative
  -- clauses only, every other kind one free text.
  constraint committee_papers_text_fits_kind check (
    case kind
      when 'draft_resolution' then
        preamble_markdown is not null and operative_markdown is not null
        and body_markdown is null
      when 'committee_directive' then
        operative_markdown is not null
        and preamble_markdown is null and body_markdown is null
      else
        body_markdown is not null
        and preamble_markdown is null and operative_markdown is null
    end
  ),
  constraint committee_papers_text_within_limit check (
    coalesce(char_length(body_markdown), 0) <= 100000
    and coalesce(char_length(preamble_markdown), 0) <= 100000
    and coalesce(char_length(operative_markdown), 0) <= 100000
  ),
  -- The same limit as a position paper's draft: a save stays well inside
  -- what one request may carry.
  constraint committee_papers_document_state_size
    check (octet_length(document_state) <= 1000000),

  constraint committee_papers_status_fits_kind check (
    case kind
      when 'working_paper' then
        status in ('writing', 'submitted', 'approved', 'introduced', 'withdrawn')
      when 'draft_resolution' then
        status in ('writing', 'submitted', 'approved', 'introduced', 'passed', 'failed', 'withdrawn')
      when 'committee_directive' then
        status in (
          'writing', 'submitted', 'approved', 'introduced', 'passed', 'failed', 'withdrawn',
          'carried_out', 'refused'
        )
      when 'press_release' then
        status in ('writing', 'submitted', 'published', 'refused', 'withdrawn')
      else
        status in ('writing', 'submitted', 'carried_out', 'refused', 'withdrawn')
    end
  ),

  -- A returned paper is being written again and keeps the time it was last
  -- submitted, which is what keeps it open to the dais that returned it and
  -- what stops its lead deleting it (section 3, rule 4: only a paper never
  -- submitted may be deleted).
  constraint committee_papers_submitted_when_sent
    check (submitted_at is not null or status in ('writing', 'withdrawn')),

  constraint committee_papers_signatures_while_writing check (
    not is_open_for_signatures
    or (status = 'writing' and kind in ('draft_resolution', 'committee_directive'))
  ),

  constraint committee_papers_number_is_whole check (
    (topic_number is null) = (sequence is null)
    and (topic_number is null or (topic_number >= 1 and sequence >= 1))
  ),
  -- A number only from approval, and only for the kinds the dais numbers. A
  -- paper withdrawn after approval keeps its number; one withdrawn before
  -- has none.
  constraint committee_papers_numbered_from_approval check (
    case
      when kind not in ('working_paper', 'draft_resolution', 'committee_directive') then
        topic_number is null
      when status in ('writing', 'submitted') then
        topic_number is null
      when status = 'withdrawn' then
        true
      else
        topic_number is not null
    end
  ),
  constraint committee_papers_one_number_each
    unique (committee_id, kind, topic_number, sequence),

  constraint committee_papers_introduced_when_introduced check (
    (
      introduced_at is null
      or (
        kind in ('working_paper', 'draft_resolution', 'committee_directive')
        and status in ('introduced', 'passed', 'failed', 'withdrawn', 'carried_out', 'refused')
      )
    )
    and (
      introduced_at is not null
      or not (
        status in ('introduced', 'passed', 'failed')
        or (kind = 'committee_directive' and status in ('carried_out', 'refused'))
      )
    )
  ),

  constraint committee_papers_return_comment_length
    check (char_length(return_comment) between 1 and 2000),
  -- The crisis staff's answer, for the four kinds they answer. An answer may
  -- be empty (null): a backroom that answers on paper still records what
  -- happened (section 10, decision 10).
  constraint committee_papers_answer_fits_kind check (
    answer_markdown is null
    or (
      kind in ('committee_directive', 'joint_directive', 'personal_directive', 'press_release')
      and char_length(answer_markdown) <= 100000
    )
  )
);

create index committee_papers_committee_id_idx on public.committee_papers (committee_id);

comment on table public.committee_papers is
  'The papers a committee writes: working papers, draft resolutions, directives and press releases. docs/committee-papers.md.';
comment on column public.committee_papers.lead_seat_id is
  'The lead author, the "main submitter" in THIMUN''s words. The seat that started the paper until it hands the lead on.';
comment on column public.committee_papers.document_state is
  'The paper as a Yjs document while it is written, merged on every save. Kept as it was submitted.';
comment on column public.committee_papers.body_markdown is
  'The text of a working paper, a joint or personal directive or a press release, with every open suggestion rejected.';
comment on column public.committee_papers.revision is
  'Counts the saves of the text, so a save or a submission made from an older text is refused.';
comment on column public.committee_papers.return_comment is
  'The dais''s comment when it last returned the paper to its authors.';
comment on column public.committee_papers.answer_markdown is
  'The crisis staff''s answer to a directive or press release. Null for none.';


-- -----------------------------------------------------------------------------
-- committee_paper_seats
-- -----------------------------------------------------------------------------
-- Seats write, people type (section 3, rule 2): a resolution names countries,
-- so its authors and signatories are seats, and the delegate in the seat is
-- the person who may type, sign and answer. One row per seat and paper, so a
-- seat is an author or a signatory, never both. A seat that changes hands
-- keeps its papers.
--
-- The sponsor cap and the one-sponsorship setting are checked when the paper
-- is submitted (submit_paper), not on every row, so a bloc can be over the
-- cap while it decides who stays a sponsor.

create table public.committee_paper_seats (
  paper_id uuid not null references public.committee_papers (id) on delete cascade,
  seat_id uuid not null references public.seats (id) on delete cascade,
  role public.paper_seat_role not null,
  added_by uuid default auth.uid() references auth.users (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (paper_id, seat_id)
);

create index committee_paper_seats_seat_id_idx on public.committee_paper_seats (seat_id);

comment on table public.committee_paper_seats is
  'The seats that write a paper (authors, the sponsors of a draft) and that sign it (signatories).';
comment on column public.committee_paper_seats.added_at is
  'When the seat became an author or signed. The longest-standing author leads when the lead leaves.';


-- -----------------------------------------------------------------------------
-- committee_paper_sources
-- -----------------------------------------------------------------------------
-- The introduced working papers a draft resolution is based on. Their text is
-- shown beside the editor for the authors to work from; nothing is copied.

create table public.committee_paper_sources (
  paper_id uuid not null references public.committee_papers (id) on delete cascade,
  source_paper_id uuid not null references public.committee_papers (id) on delete cascade,
  primary key (paper_id, source_paper_id),
  constraint committee_paper_sources_not_itself check (paper_id <> source_paper_id)
);

create index committee_paper_sources_source_paper_id_idx
  on public.committee_paper_sources (source_paper_id);

comment on table public.committee_paper_sources is
  'The introduced working papers a draft resolution is based on.';


-- -----------------------------------------------------------------------------
-- committee_paper_versions
-- -----------------------------------------------------------------------------
-- Submitting freezes the text into version 1, and every amendment written in
-- or passed makes the next version. content is what every reader renders and
-- every amendment points into: for a draft resolution or a committee
-- directive, { "preamble": [...], "operative": [...] }, each clause
-- { "id", "markdown" } and an operative clause with its "children", its
-- sub-clauses, which may have sub-clauses of their own and nothing deeper;
-- for the other kinds { "markdown": "..." }. Ids are
-- made once, at submission, and kept by every later version, so an amendment
-- points at a clause and not at a number; numbers and letters are worked out
-- when the text is shown ($lib/paper-clauses.ts). is_valid_paper_content says
-- what a valid content is.
--
-- A return deletes the versions, so the next submission is version 1 again.

create table public.committee_paper_versions (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.committee_papers (id) on delete cascade,
  version_number integer not null,
  content jsonb not null,
  -- The amendment that made this version. Null for the version made by
  -- submitting. Its foreign key is added once amendments exists, below.
  amendment_id uuid,
  created_at timestamptz not null default now(),
  constraint committee_paper_versions_one_number_each unique (paper_id, version_number),
  constraint committee_paper_versions_number_from_one check (version_number >= 1),
  constraint committee_paper_versions_content_is_object check (jsonb_typeof(content) = 'object')
);

comment on table public.committee_paper_versions is
  'The text of a paper from its submission, as clauses with ids, and every version an amendment makes.';


-- -----------------------------------------------------------------------------
-- amendments
-- -----------------------------------------------------------------------------
-- A change to one clause of an introduced draft resolution: adding a clause
-- after another (or at the start, when target_clause_id is null), changing a
-- clause's words or striking it with its sub-clauses. It points at a clause
-- id, so an amendment passed before it cannot make it point at the wrong
-- clause; if its clause is struck, it lapses.
--
-- An amendment to an amendment (the second degree) changes the text of its
-- parent, a pending unfriendly amendment that has no parent of its own, and
-- carries its parent's part and clause so the screens can say what it is
-- about. A passed one rewrites its parent's text_markdown and stays as the
-- record of it.

create table public.amendments (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.committee_papers (id) on delete cascade,
  -- "Amendment 3" on that draft.
  sequence integer not null,
  proposed_by_seat_id uuid references public.seats (id) on delete set null,
  action public.amendment_action not null,
  target_part text not null,
  target_clause_id text,
  text_markdown text,
  parent_amendment_id uuid references public.amendments (id) on delete cascade,
  status public.amendment_status not null,
  is_friendly boolean not null default false,
  -- The dais's order, across every draft of the committee, while the
  -- amendment waits for the dais.
  queue_position integer,
  ruling text,
  based_on_version_id uuid references public.committee_paper_versions (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,

  constraint amendments_one_number_each unique (paper_id, sequence),
  constraint amendments_number_from_one check (sequence >= 1),
  constraint amendments_target_part_is_known check (target_part in ('preamble', 'operative')),
  constraint amendments_target_clause_id_length check (char_length(target_clause_id) <= 100),
  -- Only an addition may have no clause (it goes at the start), and an
  -- amendment to an amendment that adds at the start inherits that.
  constraint amendments_names_its_clause check (
    action = 'add' or target_clause_id is not null or parent_amendment_id is not null
  ),
  constraint amendments_text_fits_action check (
    (text_markdown is null) = (action = 'strike')
    and (
      text_markdown is null
      or (text_markdown ~ '[^[:space:]]' and char_length(text_markdown) <= 10000)
    )
  ),
  constraint amendments_second_degree_changes check (
    parent_amendment_id is null or action = 'change'
  ),
  constraint amendments_ruling_when_out_of_order check (
    (ruling is not null) = (status = 'out_of_order')
    and (ruling is null or (ruling ~ '[^[:space:]]' and char_length(ruling) <= 2000))
  ),
  constraint amendments_decided_when_ended check (
    (decided_at is not null)
    = (status in ('written_in', 'passed', 'failed', 'out_of_order', 'withdrawn', 'lapsed'))
  ),
  constraint amendments_queued_with_the_dais check (
    (queue_position is not null) = (status = 'with_the_dais')
  )
);

create index amendments_paper_id_idx on public.amendments (paper_id);
create index amendments_parent_amendment_id_idx on public.amendments (parent_amendment_id);

alter table public.committee_paper_versions
  add constraint committee_paper_versions_amendment_id_fkey
    foreign key (amendment_id) references public.amendments (id) on delete set null;

comment on table public.amendments is
  'Amendments to introduced draft resolutions: add, change or strike one clause.';
comment on column public.amendments.target_clause_id is
  'The clause changed or struck; for an addition, the clause it follows, null for the start.';
comment on column public.amendments.is_friendly is
  'Every sponsor of the draft accepted it, so the dais writes it in rather than putting it to a vote.';
comment on column public.amendments.ruling is
  'The dais''s reason for ruling the amendment out of order.';


-- -----------------------------------------------------------------------------
-- amendment_seats
-- -----------------------------------------------------------------------------
-- Two kinds of row, told apart by role:
--   sponsor_answer  a sponsor of the draft, asked whether the amendment is
--                   friendly; accepts is their answer, null until they give
--                   it
--   signatory       a seat supporting an unfriendly amendment so that it
--                   reaches the dais
-- A sponsor who accepted may also sign once another sponsor has declined,
-- hence role in the primary key.

create table public.amendment_seats (
  amendment_id uuid not null references public.amendments (id) on delete cascade,
  seat_id uuid not null references public.seats (id) on delete cascade,
  role text not null,
  accepts boolean,
  answered_at timestamptz,
  added_at timestamptz not null default now(),
  primary key (amendment_id, seat_id, role),
  constraint amendment_seats_role_is_known check (role in ('signatory', 'sponsor_answer')),
  constraint amendment_seats_answer_from_sponsors check (role = 'sponsor_answer' or accepts is null),
  constraint amendment_seats_answered_when_answered check ((accepts is null) = (answered_at is null))
);

create index amendment_seats_seat_id_idx on public.amendment_seats (seat_id);

comment on table public.amendment_seats is
  'The sponsors asked about an amendment, with their answers, and the seats that sign an unfriendly one.';


-- -----------------------------------------------------------------------------
-- paper_comment_threads and paper_comments
-- -----------------------------------------------------------------------------
-- Comments are a conversation about a text and never part of it, so they live
-- here rather than in the Yjs document, where Row Level Security can decide
-- who reads them (may_read_thread). A thread is on a committee paper or on a
-- position paper's draft, exactly one, so position papers share the tables.
--
-- anchor_start and anchor_end are Yjs relative positions, encoded by the
-- editor, which keep pointing at the same words however the text around them
-- changes; both are null for a comment on the whole paper. anchor_fragment is
-- the part of the document they are in. quoted_text keeps the words selected,
-- shown when they have been deleted.

create table public.paper_comment_threads (
  id uuid primary key default gen_random_uuid(),
  committee_paper_id uuid references public.committee_papers (id) on delete cascade,
  position_paper_seat_id uuid references public.seats (id) on delete cascade,
  anchor_fragment text not null default 'body',
  anchor_start text,
  anchor_end text,
  quoted_text text,
  started_by uuid default auth.uid() references auth.users (id) on delete set null,
  started_by_seat_id uuid references public.seats (id) on delete set null,
  is_from_dais boolean not null default false,
  -- The suggestion the thread argues about, by the id of its mark in the
  -- Yjs document.
  suggestion_id text,
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint paper_comment_threads_on_one_paper
    check (num_nonnulls(committee_paper_id, position_paper_seat_id) = 1),
  constraint paper_comment_threads_fragment_is_known
    check (anchor_fragment in ('body', 'preamble', 'operative')),
  constraint paper_comment_threads_anchors_together check (
    (anchor_start is null) = (anchor_end is null)
    and coalesce(char_length(anchor_start), 0) <= 1000
    and coalesce(char_length(anchor_end), 0) <= 1000
  ),
  constraint paper_comment_threads_quote_length check (char_length(quoted_text) <= 10000),
  constraint paper_comment_threads_suggestion_id_length check (char_length(suggestion_id) <= 100),
  constraint paper_comment_threads_resolved_when_resolved
    check (resolved_by is null or resolved_at is not null)
);

create index paper_comment_threads_committee_paper_id_idx
  on public.paper_comment_threads (committee_paper_id);
create index paper_comment_threads_position_paper_seat_id_idx
  on public.paper_comment_threads (position_paper_seat_id);

comment on table public.paper_comment_threads is
  'Comment threads on the text of a committee paper or a position paper''s draft.';
comment on column public.paper_comment_threads.is_from_dais is
  'Started by the dais on a paper with the dais, so the whole dais reads it.';

-- A comment is plain text, links shown as links and nothing else. A deleted
-- comment that has replies stays as "Comment deleted": its body is emptied
-- and deleted_at says when.

create table public.paper_comments (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.paper_comment_threads (id) on delete cascade,
  written_by uuid default auth.uid() references auth.users (id) on delete set null,
  body text not null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint paper_comments_body_is_written check (
    char_length(body) <= 2000
    and case
      when deleted_at is null then body ~ '[^[:space:]]'
      else body = ''
    end
  )
);

create index paper_comments_thread_id_created_at_idx
  on public.paper_comments (thread_id, created_at);

comment on table public.paper_comments is
  'The comments of a thread, the first one opening it, in the order written.';


-- =============================================================================
-- Helpers
-- =============================================================================
-- The questions the policies, the functions and the pages ask. Like every
-- helper in the codebase they are security definer with search_path = '', so
-- a policy that calls one is not itself filtered by the policies of the
-- tables it reads, and they read auth.uid() through a subquery so it is worked
-- out once per statement rather than once per row. The ones a page may ask
-- are granted to authenticated; the internal ones, which take somebody else's
-- id or write notifications, are granted to nobody.


-- -----------------------------------------------------------------------------
-- committee_offers_paper_kind: does a committee of this format write papers of
-- this kind?
-- -----------------------------------------------------------------------------
-- Section 4: a standard committee writes working papers and draft
-- resolutions; a crisis committee writes the four crisis kinds, and the
-- standard two as well when crisis_allows_resolutions says so. Whether
-- working papers are switched off (has_working_papers) is asked separately,
-- by start_paper, because a committee that turns them off keeps the working
-- papers it already has.

create or replace function public.committee_offers_paper_kind(
  format public.committee_format,
  crisis_allows_resolutions boolean,
  kind public.paper_kind
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when committee_offers_paper_kind.kind in ('working_paper', 'draft_resolution') then
      committee_offers_paper_kind.format = 'standard'
      or committee_offers_paper_kind.crisis_allows_resolutions
    else
      committee_offers_paper_kind.format = 'crisis'
  end;
$$;

revoke execute on function public.committee_offers_paper_kind(public.committee_format, boolean, public.paper_kind)
  from public, anon;
grant execute on function public.committee_offers_paper_kind(public.committee_format, boolean, public.paper_kind)
  to authenticated;


-- -----------------------------------------------------------------------------
-- my_committee_seat_id: which seat of this committee is mine?
-- -----------------------------------------------------------------------------
-- A person holds at most one seat in a conference, so at most one here; the
-- order only makes the answer certain if that ever changed. Null when the
-- caller has no seat in the committee.

create or replace function public.my_committee_seat_id(committee_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select seat.id
  from public.seats as seat
  where seat.committee_id = my_committee_seat_id.committee_id
    and seat.user_id = (select auth.uid())
  order by seat.created_at, seat.id
  limit 1;
$$;

revoke execute on function public.my_committee_seat_id(uuid) from public, anon;
grant execute on function public.my_committee_seat_id(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- is_paper_author, is_paper_lead: does my seat write, or lead, this paper?
-- -----------------------------------------------------------------------------
-- Seats write, people type (section 3, rule 2): the question is always about
-- the seat the caller holds now, so a seat that changes hands takes its
-- papers to its new delegate and away from its old one.

create or replace function public.is_paper_author(paper_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.committee_paper_seats as paper_seat
    join public.seats as seat on seat.id = paper_seat.seat_id
    where paper_seat.paper_id = is_paper_author.paper_id
      and paper_seat.role = 'author'
      and seat.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_paper_author(uuid) from public, anon;
grant execute on function public.is_paper_author(uuid) to authenticated;

create or replace function public.is_paper_lead(paper_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.committee_papers as paper
    join public.seats as seat on seat.id = paper.lead_seat_id
    where paper.id = is_paper_lead.paper_id
      and seat.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_paper_lead(uuid) from public, anon;
grant execute on function public.is_paper_lead(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- may_write_paper: may I type in this paper?
-- -----------------------------------------------------------------------------
-- An author, while the paper is being written. Submitting freezes the text
-- (section 3, rule 5), and a return makes it writable again.

create or replace function public.may_write_paper(paper_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.committee_papers as paper
    where paper.id = may_write_paper.paper_id
      and paper.status = 'writing'
  )
  and public.is_paper_author(may_write_paper.paper_id);
$$;

revoke execute on function public.may_write_paper(uuid) from public, anon;
grant execute on function public.may_write_paper(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- may_read_paper: may I open this paper?
-- -----------------------------------------------------------------------------
-- Section 3, rule 3, in SQL. A paper is private to its authors until they show
-- it to somebody:
--
--   * its authors and signatories always. A signatory keeps the paper when
--     the dais returns it, because they may take their signature back until
--     it is submitted again (rule 6).
--   * for the three kinds that go to the dais (working papers, draft
--     resolutions, committee directives):
--       - the dais from the moment it is opened for signatures or submitted.
--         A returned paper keeps submitted_at, so the dais that returned it
--         still reads it while its authors fix it.
--       - the committee's delegates while it is open for signatures and
--         once it is introduced.
--       - the conference team once it is introduced.
--       - the crisis staff once a committee directive has passed and waits
--         for their answer. Every holder of a role is on the conference team,
--         so they read it from its introduction anyway; the line says the
--         rule out loud rather than leaning on that.
--   * joint and personal directives and press releases: the crisis staff once
--     sent. Nobody else ever reads a directive; a published press release is
--     read by the committee and the conference team.

create or replace function public.may_read_paper(paper_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.committee_papers as paper
    join public.committees as committee on committee.id = paper.committee_id
    where paper.id = may_read_paper.paper_id
      and (
        exists (
          select 1
          from public.committee_paper_seats as paper_seat
          join public.seats as seat on seat.id = paper_seat.seat_id
          where paper_seat.paper_id = paper.id
            and seat.user_id = (select auth.uid())
        )
        or (
          paper.kind in ('working_paper', 'draft_resolution', 'committee_directive')
          and (
            (
              (paper.is_open_for_signatures or paper.submitted_at is not null)
              and public.has_committee_permission(paper.committee_id, 'run_room')
            )
            or (
              (paper.is_open_for_signatures or paper.introduced_at is not null)
              and public.is_committee_delegate(paper.committee_id)
            )
            or (
              paper.introduced_at is not null
              and public.is_conference_staff(committee.conference_id)
            )
          )
        )
        or (
          paper.kind = 'committee_directive'
          and paper.status in ('passed', 'carried_out', 'refused')
          and public.has_committee_permission(paper.committee_id, 'answer_directives')
        )
        or (
          paper.kind in ('joint_directive', 'personal_directive', 'press_release')
          and paper.submitted_at is not null
          and public.has_committee_permission(paper.committee_id, 'answer_directives')
        )
        or (
          paper.kind = 'press_release'
          and paper.status = 'published'
          and (
            public.is_committee_delegate(paper.committee_id)
            or public.is_conference_staff(committee.conference_id)
          )
        )
      )
  );
$$;

revoke execute on function public.may_read_paper(uuid) from public, anon;
grant execute on function public.may_read_paper(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- may_read_thread: may I read this comment thread?
-- -----------------------------------------------------------------------------
-- Section 4, "Who comments, who reads", and section 10, decision 12: a thread
-- is read by the paper's authors and by whoever started it, and a thread the
-- dais started by the whole dais as well, always within the people who may
-- read the paper at all. So the authors' own threads are never read by
-- anybody else, not even once the paper is introduced, and a would-be
-- signatory's question stays between them and the bloc.
--
-- On a position paper everybody who may edit the draft counts as its author
-- (decision 15), which is may_edit_paper_draft.

create or replace function public.may_read_thread(thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.paper_comment_threads as thread
    left join public.committee_papers as paper on paper.id = thread.committee_paper_id
    where thread.id = may_read_thread.thread_id
      and case
        when thread.committee_paper_id is not null then
          public.may_read_paper(paper.id)
          and (
            public.is_paper_author(paper.id)
            or thread.started_by = (select auth.uid())
            or (
              thread.is_from_dais
              and public.has_committee_permission(paper.committee_id, 'run_room')
            )
          )
        else
          public.may_edit_paper_draft(thread.position_paper_seat_id)
      end
  );
$$;

revoke execute on function public.may_read_thread(uuid) from public, anon;
grant execute on function public.may_read_thread(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- may_join_paper_writing_channel: may I hear and speak on this live channel?
-- -----------------------------------------------------------------------------
-- The Realtime topic is "committee-paper:" and the paper's id, the protocol of
-- the position paper's "paper:<seat id>" channel (20260929120000). Only the
-- people who may type in the paper may hear it, since the channel carries the
-- text as it is typed. Anything that is not exactly that shape is refused
-- before it is cast to a uuid, which would raise for a malformed topic.

create or replace function public.may_join_paper_writing_channel(topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when may_join_paper_writing_channel.topic
      ~ '^committee-paper:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.may_write_paper(substr(may_join_paper_writing_channel.topic, 17)::uuid)
    else false
  end;
$$;

revoke execute on function public.may_join_paper_writing_channel(text) from public, anon;
grant execute on function public.may_join_paper_writing_channel(text) to authenticated;


-- -----------------------------------------------------------------------------
-- paper_support_needed: how many supporters does this minimum come to?
-- -----------------------------------------------------------------------------
-- A minimum is a number of seats, or a share of the seats that have a
-- delegate, rounded up (section 5): 20% of a committee of 23 delegates is 5.
-- Seats nobody holds are not counted, because they can neither sign nor vote.
--
-- Unlike the helpers above this one is security invoker. The functions that
-- check support run as the owner and so count every seat; a page that asks
-- counts the seats its reader may see, which for a delegate or the team is
-- every seat of the committee, and for anybody else none.

create or replace function public.paper_support_needed(
  committee_id uuid,
  minimum integer,
  unit public.support_unit
)
returns integer
language sql
stable
set search_path = ''
as $$
  select case paper_support_needed.unit
    when 'seats' then paper_support_needed.minimum
    else ceil(
      paper_support_needed.minimum * (
        select count(*)
        from public.seats as seat
        where seat.committee_id = paper_support_needed.committee_id
          and seat.user_id is not null
      ) / 100.0
    )::integer
  end;
$$;

revoke execute on function public.paper_support_needed(uuid, integer, public.support_unit)
  from public, anon;
grant execute on function public.paper_support_needed(uuid, integer, public.support_unit)
  to authenticated;


-- -----------------------------------------------------------------------------
-- holder_has_committee_permission: does this person hold this permission in
-- this committee?
-- -----------------------------------------------------------------------------
-- has_committee_permission for somebody other than the caller, as
-- holder_has_permission (20261007120000) is has_permission. A reply in a
-- thread the dais started notifies the members of the dais in it only while
-- they are still the dais. Internal: it answers for any person.

create or replace function public.holder_has_committee_permission(
  committee_id uuid,
  user_id uuid,
  permission public.permission
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.committees as committee
    where committee.id = holder_has_committee_permission.committee_id
      and public.holder_has_permission(
        committee.conference_id,
        holder_has_committee_permission.user_id,
        holder_has_committee_permission.permission
      )
  )
  or exists (
    select 1
    from public.committee_chairs as assignment
    join public.committees as committee on committee.id = assignment.committee_id
    join public.conference_role_members as member
      on member.conference_id = committee.conference_id
     and member.user_id = assignment.user_id
    join public.conference_roles as role on role.id = member.role_id
    where assignment.committee_id = holder_has_committee_permission.committee_id
      and assignment.user_id = holder_has_committee_permission.user_id
      and role.scope = 'committees'
      and role.permissions
        && array['administrator', holder_has_committee_permission.permission]::public.permission[]
  );
$$;

revoke execute on function public.holder_has_committee_permission(uuid, uuid, public.permission)
  from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- The clauses of a paper's versions
-- -----------------------------------------------------------------------------
-- committee_paper_versions.content holds a draft resolution or a committee
-- directive as clauses with ids:
--
--   { "preamble":  [ { "id": "p1", "markdown": "Recalling ...," } ],
--     "operative": [ { "id": "o1", "markdown": "Calls upon ...:",
--                      "children": [ { "id": "o1a", "markdown": "...;",
--                                      "children": [] } ] } ] }
--
-- Levels: the preamble is level 0, with no children; operative clauses are
-- level 1, their sub-clauses (a, b, c) level 2 and theirs (i, ii, iii) level
-- 3, which has none. Ids are made once at submission by $lib/paper-clauses.ts:
-- p1, p2 in the preamble; o1, o2 for operative clauses; the parent's id and a
-- letter (o1a ... o1z, o1aa) a level down; the parent's id and a number
-- (o1a1) a level below that. A clause an amendment adds is "a" and the
-- amendment's number, which cannot collide with an id that starts with p or o.
-- These functions are the database's half of that file, so an amendment the
-- database writes in gives the text the page would show; a database test
-- holds the two to the same answers. They are internal: nothing outside the
-- functions below needs them.

-- is_valid_clause_list: is this a list of well-formed clauses at this level?
create or replace function public.is_valid_clause_list(clauses jsonb, level integer)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  clause jsonb;
  clause_keys text[];
begin
  if jsonb_typeof(clauses) is distinct from 'array' then
    return false;
  end if;

  for clause in
    select element.value
    from jsonb_array_elements(clauses) as element (value)
  loop
    if jsonb_typeof(clause) is distinct from 'object' then
      return false;
    end if;

    select array_agg(clause_key order by clause_key)
    into clause_keys
    from jsonb_object_keys(clause) as clause_key;

    -- Exactly these keys, so nothing rides along unseen in a version that
    -- every reader renders. The case is in brackets because PL/pgSQL ends an
    -- if's condition at the first "then" outside them.
    if clause_keys is distinct from (
      case
        when level = 0 then array['id', 'markdown']
        else array['children', 'id', 'markdown']
      end
    ) then
      return false;
    end if;

    if jsonb_typeof(clause -> 'id') is distinct from 'string'
      or (clause ->> 'id') !~ '^[A-Za-z0-9_-]{1,100}$'
      or jsonb_typeof(clause -> 'markdown') is distinct from 'string'
      or (clause ->> 'markdown') !~ '[^[:space:]]'
    then
      return false;
    end if;

    if level = 3 then
      if clause -> 'children' is distinct from '[]'::jsonb then
        return false;
      end if;
    elsif level > 0 then
      if not public.is_valid_clause_list(clause -> 'children', level + 1) then
        return false;
      end if;
    end if;
  end loop;

  return true;
end;
$$;

revoke execute on function public.is_valid_clause_list(jsonb, integer) from public, anon, authenticated;

-- is_valid_paper_content: is this a version a paper of this kind may have?
-- A draft resolution has both parts; a committee directive has operative
-- clauses only, and an empty preamble so every reader finds the same two
-- keys; no id appears twice anywhere in it. The free-text kinds are one
-- Markdown text. Never null: a caller that tests "not valid" must not let a
-- null through.
create or replace function public.is_valid_paper_content(kind public.paper_kind, content jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  content_keys text[];
begin
  if jsonb_typeof(content) is distinct from 'object'
    or octet_length(content::text) > 1000000
  then
    return false;
  end if;

  select array_agg(content_key order by content_key)
  into content_keys
  from jsonb_object_keys(content) as content_key;

  if kind in ('draft_resolution', 'committee_directive') then
    return coalesce(
      content_keys is not distinct from array['operative', 'preamble']
      and public.is_valid_clause_list(content -> 'preamble', 0)
      and public.is_valid_clause_list(content -> 'operative', 1)
      and (kind = 'draft_resolution' or content -> 'preamble' = '[]'::jsonb)
      and not exists (
        select 1
        from jsonb_path_query(
          content,
          'strict $.** ? (@.type() == "object" && exists(@.id)).id'
        ) as clause_id
        group by clause_id
        having count(*) > 1
      ),
      false
    );
  end if;

  return coalesce(
    content_keys is not distinct from array['markdown']
    and jsonb_typeof(content -> 'markdown') = 'string',
    false
  );
end;
$$;

revoke execute on function public.is_valid_paper_content(public.paper_kind, jsonb)
  from public, anon, authenticated;

-- paper_content_has_clause: is there a clause with this id, at any level, in
-- this part of the content?
create or replace function public.paper_content_has_clause(content jsonb, part text, clause_id text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    jsonb_path_exists(
      paper_content_has_clause.content -> paper_content_has_clause.part,
      'strict $.** ? (@.type() == "object" && @.id == $id)',
      jsonb_build_object('id', paper_content_has_clause.clause_id),
      true
    ),
    false
  );
$$;

revoke execute on function public.paper_content_has_clause(jsonb, text, text)
  from public, anon, authenticated;

-- amend_clause_list: one list of clauses with the amendment made, looking for
-- its clause at every level. A change keeps the clause's sub-clauses; a
-- strike takes them with it; an addition goes straight after its clause, at
-- the same level, after that clause's own sub-clauses.
create or replace function public.amend_clause_list(
  clauses jsonb,
  action public.amendment_action,
  target_clause_id text,
  text_markdown text,
  new_clause jsonb
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  amended jsonb := '[]'::jsonb;
  clause jsonb;
begin
  for clause in
    select element.value
    from jsonb_array_elements(clauses) with ordinality as element (value, clause_position)
    order by element.clause_position
  loop
    if clause ->> 'id' = target_clause_id then
      if action = 'change' then
        amended := amended || jsonb_build_array(jsonb_set(clause, '{markdown}', to_jsonb(text_markdown)));
      elsif action = 'add' then
        amended := amended || jsonb_build_array(clause, new_clause);
      end if;
      -- A strike leaves the clause out.
    elsif clause ? 'children' then
      amended := amended || jsonb_build_array(
        jsonb_set(
          clause,
          '{children}',
          public.amend_clause_list(clause -> 'children', action, target_clause_id, text_markdown, new_clause)
        )
      );
    else
      amended := amended || jsonb_build_array(clause);
    end if;
  end loop;

  return amended;
end;
$$;

revoke execute on function public.amend_clause_list(jsonb, public.amendment_action, text, text, jsonb)
  from public, anon, authenticated;

-- apply_amendment_to_content: the content with one amendment made. An
-- addition with no clause goes at the start of its part. new_clause_id is the
-- id an addition's clause takes ("a" and the amendment's number); the other
-- actions ignore it. A new clause has the shape of its part, so an operative
-- one has no sub-clauses yet.
create or replace function public.apply_amendment_to_content(
  content jsonb,
  action public.amendment_action,
  target_part text,
  target_clause_id text,
  text_markdown text,
  new_clause_id text
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  new_clause jsonb;
begin
  if action = 'add' then
    new_clause := case
      when target_part = 'preamble' then
        jsonb_build_object('id', new_clause_id, 'markdown', text_markdown)
      else
        jsonb_build_object('id', new_clause_id, 'markdown', text_markdown, 'children', '[]'::jsonb)
    end;

    if target_clause_id is null then
      return jsonb_set(content, array[target_part], jsonb_build_array(new_clause) || (content -> target_part));
    end if;
  end if;

  return jsonb_set(
    content,
    array[target_part],
    public.amend_clause_list(content -> target_part, action, target_clause_id, text_markdown, new_clause)
  );
end;
$$;

revoke execute on function public.apply_amendment_to_content(jsonb, public.amendment_action, text, text, text, text)
  from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- Words and links for notifications
-- -----------------------------------------------------------------------------
-- Internal: the functions below use them to tell people what happened, in the
-- words a chair would use ("Draft resolution 1.2 was introduced").

-- paper_link_path: where a paper is read. Every kind is under resolutions,
-- whose tab says "Directives" in a crisis committee (section 10, decision 5).
-- A thread or an amendment adds its anchor to this.
create or replace function public.paper_link_path(paper_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select '/conferences/' || conference.slug
    || '/committees/' || committee.slug
    || '/resolutions/' || paper.id
  from public.committee_papers as paper
  join public.committees as committee on committee.id = paper.committee_id
  join public.conferences as conference on conference.id = committee.conference_id
  where paper.id = paper_link_path.paper_id;
$$;

revoke execute on function public.paper_link_path(uuid) from public, anon, authenticated;

-- paper_conference_id: the conference a paper's notifications belong to.
create or replace function public.paper_conference_id(paper_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select committee.conference_id
  from public.committee_papers as paper
  join public.committees as committee on committee.id = paper.committee_id
  where paper.id = paper_conference_id.paper_id;
$$;

revoke execute on function public.paper_conference_id(uuid) from public, anon, authenticated;

-- paper_kind_name: a kind as words in a sentence.
create or replace function public.paper_kind_name(kind public.paper_kind)
returns text
language sql
immutable
set search_path = ''
as $$
  select case paper_kind_name.kind
    when 'working_paper' then 'working paper'
    when 'draft_resolution' then 'draft resolution'
    when 'committee_directive' then 'committee directive'
    when 'joint_directive' then 'joint directive'
    when 'personal_directive' then 'personal directive'
    when 'press_release' then 'press release'
  end;
$$;

revoke execute on function public.paper_kind_name(public.paper_kind) from public, anon, authenticated;

-- paper_label: what a paper is called. Its number once the dais has given it
-- one ("Draft resolution 1.2"), its title in quotation marks before.
create or replace function public.paper_label(
  kind public.paper_kind,
  topic_number integer,
  sequence integer,
  title text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when paper_label.topic_number is not null then
      upper(left(public.paper_kind_name(paper_label.kind), 1))
        || substr(public.paper_kind_name(paper_label.kind), 2)
        || ' ' || paper_label.topic_number || '.' || paper_label.sequence
    else
      '“' || paper_label.title || '”'
  end;
$$;

revoke execute on function public.paper_label(public.paper_kind, integer, integer, text)
  from public, anon, authenticated;

-- notify_paper_users: one notification each to these people, never to the
-- person whose press caused it, and not again while an unread one says the
-- same thing about the same place. That is what makes comment notifications
-- one per thread rather than one per comment (section 4): the second reply to
-- a thread finds the first one's notification still unread.
create or replace function public.notify_paper_users(
  user_ids uuid[],
  conference_id uuid,
  kind public.notification_kind,
  title text,
  link_path text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, conference_id, kind, title, link_path)
  select distinct
    recipient.user_id,
    notify_paper_users.conference_id,
    notify_paper_users.kind,
    notify_paper_users.title,
    notify_paper_users.link_path
  from unnest(notify_paper_users.user_ids) as recipient (user_id)
  where recipient.user_id is not null
    and recipient.user_id is distinct from (select auth.uid())
    and not exists (
      select 1
      from public.notifications as earlier
      where earlier.user_id = recipient.user_id
        and earlier.kind = notify_paper_users.kind
        and earlier.title = notify_paper_users.title
        and earlier.link_path is not distinct from notify_paper_users.link_path
        and earlier.read_at is null
    );
$$;

revoke execute on function public.notify_paper_users(uuid[], uuid, public.notification_kind, text, text)
  from public, anon, authenticated;

-- notify_paper_seats: the same, to the delegates in the seats that write or
-- sign a paper, by role.
create or replace function public.notify_paper_seats(
  paper_id uuid,
  roles public.paper_seat_role[],
  kind public.notification_kind,
  title text,
  link_path text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.notify_paper_users(
    array(
      select seat.user_id
      from public.committee_paper_seats as paper_seat
      join public.seats as seat on seat.id = paper_seat.seat_id
      where paper_seat.paper_id = notify_paper_seats.paper_id
        and paper_seat.role = any (notify_paper_seats.roles)
    ),
    public.paper_conference_id(notify_paper_seats.paper_id),
    notify_paper_seats.kind,
    notify_paper_seats.title,
    notify_paper_seats.link_path
  );
$$;

revoke execute on function public.notify_paper_seats(uuid, public.paper_seat_role[], public.notification_kind, text, text)
  from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- thread_accepts_comments: may anybody still write in this thread?
-- -----------------------------------------------------------------------------
-- A committee paper's threads take comments while it is written and while it
-- is with the dais. Once it is introduced they are closed and kept, read only
-- (section 4, "When it ends"): from then on the paper changes by amendment,
-- the public way to argue about its text. A position paper's threads take
-- comments while its draft exists, which is until it is submitted.

create or replace function public.thread_accepts_comments(thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.paper_comment_threads as thread
    left join public.committee_papers as paper on paper.id = thread.committee_paper_id
    where thread.id = thread_accepts_comments.thread_id
      and case
        when thread.committee_paper_id is not null then
          paper.status in ('writing', 'submitted', 'approved')
        else
          exists (
            select 1
            from public.position_paper_drafts as draft
            where draft.seat_id = thread.position_paper_seat_id
          )
      end
  );
$$;

revoke execute on function public.thread_accepts_comments(uuid) from public, anon, authenticated;


-- =============================================================================
-- Functions: a paper from start to introduction
-- =============================================================================
-- One function per thing a person does (section 7, "The helpers and
-- policies"), so each rule lives in one place and every change of status is
-- atomic. They are security definer: the tables have no write policies for
-- these changes, and each function checks who is pressing before it writes.
-- A paper the caller may not read is "That paper does not exist." (P0002),
-- the same answer the page gives (section 3, rule 12); a paper they may read
-- but not change this way is 42501; a press at the wrong moment, such as
-- signing a paper that has been submitted, is 22023.
--
-- Typing is not here: the authors save the text straight into the row, under
-- the policy "Authors can save a paper they are writing", exactly as a
-- position paper's draft is saved.


-- -----------------------------------------------------------------------------
-- lock_paper: the paper a function is about to change
-- -----------------------------------------------------------------------------
-- Locked until the function's transaction ends, so two presses on the same
-- paper at the same moment (two authors submitting, a chair approving as an
-- author withdraws) happen one after the other and the second sees what the
-- first did. Internal.

create or replace function public.lock_paper(paper_id uuid)
returns public.committee_papers
language plpgsql
security definer
set search_path = ''
as $$
declare
  paper public.committee_papers;
begin
  select candidate.*
  into paper
  from public.committee_papers as candidate
  where candidate.id = lock_paper.paper_id
  for update;

  if not found or not public.may_read_paper(paper.id) then
    raise exception 'That paper does not exist.' using errcode = 'P0002';
  end if;

  return paper;
end;
$$;

revoke execute on function public.lock_paper(uuid) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- start_paper: "Start writing"
-- -----------------------------------------------------------------------------
-- A delegate of the committee starts a paper of a kind the committee writes.
-- Their seat is its first author and its lead (section 3, rule 4). Observers
-- sign but never write (section 5). The text starts empty in the parts its
-- kind has, and a draft resolution may name the introduced working papers it
-- is based on, which the committee_paper_sources trigger checks.

create or replace function public.start_paper(
  committee_id uuid,
  kind public.paper_kind,
  title text,
  topic text default null,
  source_paper_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  committee public.committees;
  my_seat public.seats;
  trimmed_title text;
  new_paper_id uuid;
begin
  select candidate.*
  into committee
  from public.committees as candidate
  where candidate.id = start_paper.committee_id;

  select seat.*
  into my_seat
  from public.seats as seat
  where seat.id = public.my_committee_seat_id(start_paper.committee_id);

  -- No seat also covers a committee that does not exist, without saying so.
  if committee.id is null or my_seat.id is null then
    raise exception 'Only a delegate of this committee can start a paper.' using errcode = '42501';
  end if;

  if my_seat.kind = 'observer' then
    raise exception 'An observer may sign a paper but not write one.' using errcode = '42501';
  end if;

  -- A committee that turns working papers off keeps the ones it has, so the
  -- setting stops new ones here rather than in committee_offers_paper_kind.
  if not public.committee_offers_paper_kind(
      committee.format, committee.crisis_allows_resolutions, start_paper.kind
    )
    or (start_paper.kind = 'working_paper' and not committee.has_working_papers)
  then
    raise exception 'This committee does not write that kind of paper.' using errcode = '22023';
  end if;

  trimmed_title := btrim(start_paper.title);

  if trimmed_title is null
    or trimmed_title !~ '[^[:space:]]'
    or char_length(trimmed_title) > 200
  then
    raise exception 'A paper needs a title of at most 200 characters.' using errcode = '22023';
  end if;

  -- The dais numbers a paper by its topic ("1.2" is the second paper on the
  -- first topic), so a paper that goes to the dais says which topic it is on
  -- whenever the committee has any.
  if start_paper.topic is not null and not (start_paper.topic = any (committee.topics)) then
    raise exception 'That topic is not on this committee''s agenda.' using errcode = '22023';
  end if;

  if start_paper.topic is null
    and cardinality(committee.topics) > 0
    and start_paper.kind in ('working_paper', 'draft_resolution', 'committee_directive')
  then
    raise exception 'Choose the topic the paper is on.' using errcode = '22023';
  end if;

  if cardinality(start_paper.source_paper_ids) > 0 and start_paper.kind <> 'draft_resolution' then
    raise exception 'Only a draft resolution is based on working papers.' using errcode = '22023';
  end if;

  insert into public.committee_papers (
    committee_id, kind, title, topic, started_by_seat_id, lead_seat_id,
    body_markdown, preamble_markdown, operative_markdown
  )
  values (
    start_paper.committee_id,
    start_paper.kind,
    trimmed_title,
    start_paper.topic,
    my_seat.id,
    my_seat.id,
    case when start_paper.kind not in ('draft_resolution', 'committee_directive') then '' end,
    case when start_paper.kind = 'draft_resolution' then '' end,
    case when start_paper.kind in ('draft_resolution', 'committee_directive') then '' end
  )
  returning id into new_paper_id;

  insert into public.committee_paper_seats (paper_id, seat_id, role)
  values (new_paper_id, my_seat.id, 'author');

  insert into public.committee_paper_sources (paper_id, source_paper_id)
  select distinct new_paper_id, source.source_paper_id
  from unnest(start_paper.source_paper_ids) as source (source_paper_id);

  return new_paper_id;
end;
$$;

revoke execute on function public.start_paper(uuid, public.paper_kind, text, text, uuid[])
  from public, anon;
grant execute on function public.start_paper(uuid, public.paper_kind, text, text, uuid[])
  to authenticated;


-- -----------------------------------------------------------------------------
-- add_paper_author: "Add an author"
-- -----------------------------------------------------------------------------
-- Any author adds another seat of the committee while the paper is written
-- (rule 4): a seat somebody holds, since a seat with nobody in it can neither
-- type nor answer (rule 2), and not an observer's. A seat that had signed
-- becomes an author, its signature turning into authorship, and counts as
-- an author from now on when the longest-standing one is looked for. Adding
-- a seat that already writes the paper changes nothing. A personal directive
-- has one author by definition.

create or replace function public.add_paper_author(paper_id uuid, seat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  paper public.committee_papers;
  new_author public.seats;
  changed integer;
begin
  paper := public.lock_paper(add_paper_author.paper_id);

  if not public.is_paper_author(paper.id) then
    raise exception 'Only an author of this paper can add another.' using errcode = '42501';
  end if;

  if paper.status <> 'writing' then
    raise exception 'Authors are added only while the paper is being written.' using errcode = '22023';
  end if;

  if paper.kind = 'personal_directive' then
    raise exception 'A personal directive has one author.' using errcode = '22023';
  end if;

  select seat.*
  into new_author
  from public.seats as seat
  where seat.id = add_paper_author.seat_id;

  if not found or new_author.committee_id <> paper.committee_id then
    raise exception 'That seat is not in this committee.' using errcode = '22023';
  end if;

  if new_author.user_id is null then
    raise exception 'Nobody holds that seat yet.' using errcode = '22023';
  end if;

  if new_author.kind = 'observer' then
    raise exception 'An observer may sign a paper but not write one.' using errcode = '22023';
  end if;

  -- The conflict is named by its constraint: the column names would clash
  -- with this function's parameters.
  insert into public.committee_paper_seats as existing (paper_id, seat_id, role)
  values (paper.id, new_author.id, 'author')
  on conflict on constraint committee_paper_seats_pkey do update
    set role = 'author',
        added_by = (select auth.uid()),
        added_at = now()
    where existing.role = 'signatory';

  get diagnostics changed = row_count;

  if changed > 0 then
    perform public.notify_paper_users(
      array[new_author.user_id],
      public.paper_conference_id(paper.id),
      'paper_author_added',
      'You were added to the ' || public.paper_kind_name(paper.kind) || ' “' || paper.title || '”',
      public.paper_link_path(paper.id)
    );
  end if;
end;
$$;

revoke execute on function public.add_paper_author(uuid, uuid) from public, anon;
grant execute on function public.add_paper_author(uuid, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- leave_paper: "Leave"
-- -----------------------------------------------------------------------------
-- An author leaves while another remains (rule 4); a paper nobody writes
-- would be stuck, so the last author withdraws it or, never submitted,
-- deletes it instead. The authors freeze at submission, so leaving is only
-- while the paper is written. If the lead leaves, the
-- committee_paper_seats_hand_on_lead trigger gives the lead to the
-- longest-standing author.

create or replace function public.leave_paper(paper_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  paper public.committee_papers;
  my_seat_id uuid;
begin
  paper := public.lock_paper(leave_paper.paper_id);

  if not public.is_paper_author(paper.id) then
    raise exception 'Only an author can leave a paper.' using errcode = '42501';
  end if;

  if paper.status <> 'writing' then
    raise exception 'Authors leave only while the paper is being written.' using errcode = '22023';
  end if;

  my_seat_id := public.my_committee_seat_id(paper.committee_id);

  if not exists (
    select 1
    from public.committee_paper_seats as other_author
    where other_author.paper_id = paper.id
      and other_author.role = 'author'
      and other_author.seat_id <> my_seat_id
  ) then
    raise exception 'Another author has to remain. Withdraw the paper instead.' using errcode = '22023';
  end if;

  delete from public.committee_paper_seats as leaving
  where leaving.paper_id = paper.id
    and leaving.seat_id = my_seat_id;
end;
$$;

revoke execute on function public.leave_paper(uuid) from public, anon;
grant execute on function public.leave_paper(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- hand_paper_lead: "Make lead"
-- -----------------------------------------------------------------------------
-- The lead hands the lead to another author while the paper is written; with
-- THIMUN's words that makes them the main submitter.

create or replace function public.hand_paper_lead(paper_id uuid, seat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  paper public.committee_papers;
begin
  paper := public.lock_paper(hand_paper_lead.paper_id);

  if not public.is_paper_lead(paper.id) then
    raise exception 'Only the lead author can hand the lead on.' using errcode = '42501';
  end if;

  if paper.status <> 'writing' then
    raise exception 'The lead is handed on only while the paper is being written.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.committee_paper_seats as author
    where author.paper_id = paper.id
      and author.seat_id = hand_paper_lead.seat_id
      and author.role = 'author'
  ) then
    raise exception 'The lead goes to another author of the paper.' using errcode = '22023';
  end if;

  update public.committee_papers as target
  set lead_seat_id = hand_paper_lead.seat_id
  where target.id = paper.id;
end;
$$;

revoke execute on function public.hand_paper_lead(uuid, uuid) from public, anon;
grant execute on function public.hand_paper_lead(uuid, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- set_paper_signatures_open: "Open for signatures" and closing them again
-- -----------------------------------------------------------------------------
-- Only the papers that collect signatures, draft resolutions and committee
-- directives. Opening shows the paper to the dais and the committee (rule 3);
-- closing keeps the signatures already given.

create or replace function public.set_paper_signatures_open(paper_id uuid, is_open boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  paper public.committee_papers;
begin
  paper := public.lock_paper(set_paper_signatures_open.paper_id);

  if not public.is_paper_author(paper.id) then
    raise exception 'Only an author of this paper can open it for signatures.' using errcode = '42501';
  end if;

  if paper.kind not in ('draft_resolution', 'committee_directive') then
    raise exception 'Only a draft resolution or a committee directive collects signatures.'
      using errcode = '22023';
  end if;

  if paper.status <> 'writing' then
    raise exception 'A paper is open for signatures only while it is being written.'
      using errcode = '22023';
  end if;

  update public.committee_papers as target
  set is_open_for_signatures = coalesce(set_paper_signatures_open.is_open, false)
  where target.id = paper.id;
end;
$$;

revoke execute on function public.set_paper_signatures_open(uuid, boolean) from public, anon;
grant execute on function public.set_paper_signatures_open(uuid, boolean) to authenticated;


-- -----------------------------------------------------------------------------
-- sign_paper: "Sign"
-- -----------------------------------------------------------------------------
-- A delegate of the committee signs a paper open for signatures that their
-- seat does not write. Observers may sign (section 5). Signing twice changes
-- nothing.

create or replace function public.sign_paper(paper_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  paper public.committee_papers;
  my_seat_id uuid;
begin
  paper := public.lock_paper(sign_paper.paper_id);
  my_seat_id := public.my_committee_seat_id(paper.committee_id);

  if my_seat_id is null then
    raise exception 'Only a delegate of this committee can sign its papers.' using errcode = '42501';
  end if;

  if paper.status <> 'writing' or not paper.is_open_for_signatures then
    raise exception 'This paper is not open for signatures.' using errcode = '22023';
  end if;

  if public.is_paper_author(paper.id) then
    raise exception 'An author does not sign their own paper.' using errcode = '22023';
  end if;

  insert into public.committee_paper_seats (paper_id, seat_id, role)
  values (paper.id, my_seat_id, 'signatory')
  on conflict do nothing;
end;
$$;

revoke execute on function public.sign_paper(uuid) from public, anon;
grant execute on function public.sign_paper(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- remove_signature: "Remove my signature"
-- -----------------------------------------------------------------------------
-- Until the paper is submitted, again after a return (rule 6). Whether or not
-- it is still open: a signatory told that the paper came back may take their
-- signature off while the bloc fixes it. Removing one that is not there
-- changes nothing, so a second press is harmless.

create or replace function public.remove_signature(paper_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  paper public.committee_papers;
begin
  paper := public.lock_paper(remove_signature.paper_id);

  if paper.status <> 'writing' then
    raise exception 'A signature is taken off only before the paper is submitted.'
      using errcode = '22023';
  end if;

  delete from public.committee_paper_seats as signature
  where signature.paper_id = paper.id
    and signature.role = 'signatory'
    and signature.seat_id = public.my_committee_seat_id(paper.committee_id);
end;
$$;

revoke execute on function public.remove_signature(uuid) from public, anon;
grant execute on function public.remove_signature(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- submit_paper: "Submit to the dais", or "Send" for the crisis kinds
-- -----------------------------------------------------------------------------
-- Freezes the text into version 1 (rule 5). For a draft resolution or a
-- committee directive the page turns the agreed text into clauses with ids
-- ($lib/paper-clauses.ts) and passes them as content; for the other kinds the
-- text is the version as it is. expected_revision is the revision the page
-- read that text at, so a save that lands between the page reading the paper
-- and this function freezing it is never lost: the submission is refused
-- (40001) and the page tries again with the newer text.
--
-- The page also refuses a paper whose Yjs document still holds suggestions
-- (section 7), reading document_state on the server; SQL cannot read a Yjs
-- document. An author who skipped the page would freeze the agreed text,
-- which is what the Markdown columns hold, so nothing private is exposed.
--
-- The rules of section 5 are checked now, against the committee's settings as
-- they are now (section 5: settings are never written into papers): the most
-- sponsors, the support needed, and one sponsorship per topic.

create or replace function public.submit_paper(
  paper_id uuid,
  expected_revision integer,
  content jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  paper public.committee_papers;
  committee public.committees;
  frozen_content jsonb;
  author_count integer;
  signatory_count integer;
  support integer;
  support_needed integer;
  clashing_seat_name text;
  clashing_title text;
begin
  paper := public.lock_paper(submit_paper.paper_id);

  if not public.is_paper_author(paper.id) then
    raise exception 'Only an author of this paper can submit it.' using errcode = '42501';
  end if;

  if paper.status <> 'writing' then
    raise exception 'Only a paper being written can be submitted.' using errcode = '22023';
  end if;

  if paper.revision is distinct from submit_paper.expected_revision then
    raise exception 'The text changed while it was being submitted. Read it again and submit.'
      using errcode = '40001';
  end if;

  select candidate.*
  into committee
  from public.committees as candidate
  where candidate.id = paper.committee_id;

  if paper.kind in ('draft_resolution', 'committee_directive') then
    if submit_paper.content is null
      or not public.is_valid_paper_content(paper.kind, submit_paper.content)
    then
      raise exception 'The text could not be turned into clauses.' using errcode = '22023';
    end if;

    if jsonb_array_length(submit_paper.content -> 'operative') = 0 then
      raise exception 'Write at least one operative clause before submitting.' using errcode = '22023';
    end if;

    frozen_content := submit_paper.content;
  else
    if paper.body_markdown !~ '[^[:space:]]' then
      raise exception 'Write the paper before submitting it.' using errcode = '22023';
    end if;

    frozen_content := jsonb_build_object('markdown', paper.body_markdown);
  end if;

  select
    count(*) filter (where paper_seat.role = 'author'),
    count(*) filter (where paper_seat.role = 'signatory')
  into author_count, signatory_count
  from public.committee_paper_seats as paper_seat
  where paper_seat.paper_id = paper.id;

  if paper.kind in ('draft_resolution', 'committee_directive') then
    if committee.sponsor_limit is not null and author_count > committee.sponsor_limit then
      raise exception 'This paper has % authors, more than the % the committee allows.',
        author_count, committee.sponsor_limit
        using errcode = '22023';
    end if;

    -- Run as this function's owner, paper_support_needed counts every seat
    -- of the committee that has a delegate.
    support := signatory_count + case when committee.support_counts_sponsors then author_count else 0 end;
    support_needed := public.paper_support_needed(
      paper.committee_id, committee.support_minimum, committee.support_unit
    );

    if support < support_needed then
      raise exception 'Not enough support yet: % of the % needed.', support, support_needed
        using errcode = '22023';
    end if;
  end if;

  -- One sponsorship per topic counts the drafts still in play or passed; a
  -- draft that failed or was withdrawn frees its sponsors, and drafts still
  -- being written do not count yet, since a bloc may try two before choosing.
  if paper.kind = 'draft_resolution' and committee.one_sponsorship_per_topic then
    select seat.name, other_paper.title
    into clashing_seat_name, clashing_title
    from public.committee_paper_seats as author
    join public.seats as seat on seat.id = author.seat_id
    join public.committee_paper_seats as other_author
      on other_author.seat_id = author.seat_id
     and other_author.role = 'author'
    join public.committee_papers as other_paper on other_paper.id = other_author.paper_id
    where author.paper_id = paper.id
      and author.role = 'author'
      and other_paper.id <> paper.id
      and other_paper.committee_id = paper.committee_id
      and other_paper.kind = 'draft_resolution'
      and other_paper.topic is not distinct from paper.topic
      and other_paper.status in ('submitted', 'approved', 'introduced', 'passed')
    order by seat.name
    limit 1;

    if found then
      raise exception '% already sponsors “%”, and a seat may sponsor one draft resolution per topic.',
        clashing_seat_name, clashing_title
        using errcode = '22023';
    end if;
  end if;

  if paper.kind = 'joint_directive' and author_count < 2 then
    raise exception 'A joint directive needs at least two authors.' using errcode = '22023';
  end if;

  -- A resubmitted paper loses the decision it was returned with; the
  -- return comment stays, so the dais can see what it asked for.
  update public.committee_papers as target
  set status = 'submitted',
      submitted_at = now(),
      is_open_for_signatures = false,
      decided_at = null,
      decided_by = null
  where target.id = paper.id;

  insert into public.committee_paper_versions (paper_id, version_number, content)
  values (paper.id, 1, frozen_content);
end;
$$;

revoke execute on function public.submit_paper(uuid, integer, jsonb) from public, anon;
grant execute on function public.submit_paper(uuid, integer, jsonb) to authenticated;


-- -----------------------------------------------------------------------------
-- approve_paper: "Approve as Draft resolution 1.2"
-- -----------------------------------------------------------------------------
-- The dais approves a submitted paper and gives it its number (rule 6): the
-- topic's place on the agenda and the next free number for that kind and
-- topic, unless the dais types others. Working papers and draft resolutions
-- are numbered apart, so Working paper 1.1 and Draft resolution 1.1 can both
-- exist. A number is never given twice, even after its paper is withdrawn.
-- The advisory lock makes two approvals in the same committee take turns, so
-- they cannot both pick the same next number.

create or replace function public.approve_paper(
  paper_id uuid,
  topic_number integer default null,
  sequence integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  paper public.committee_papers;
  agenda text[];
  chosen_topic_number integer;
  chosen_sequence integer;
begin
  paper := public.lock_paper(approve_paper.paper_id);

  if not public.has_committee_permission(paper.committee_id, 'run_room') then
    raise exception 'Only the dais of this committee can approve a paper.' using errcode = '42501';
  end if;

  if paper.kind not in ('working_paper', 'draft_resolution', 'committee_directive') then
    raise exception 'The crisis staff answer this kind of paper; the dais does not approve it.'
      using errcode = '22023';
  end if;

  if paper.status <> 'submitted' then
    raise exception 'Only a submitted paper can be approved.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('paper-numbers:' || paper.committee_id::text));

  select candidate.topics
  into agenda
  from public.committees as candidate
  where candidate.id = paper.committee_id;

  chosen_topic_number := coalesce(
    approve_paper.topic_number,
    array_position(agenda, paper.topic),
    1
  );

  chosen_sequence := coalesce(
    approve_paper.sequence,
    (
      select coalesce(max(numbered.sequence), 0) + 1
      from public.committee_papers as numbered
      where numbered.committee_id = paper.committee_id
        and numbered.kind = paper.kind
        and numbered.topic_number = chosen_topic_number
    )
  );

  if chosen_topic_number < 1 or chosen_sequence < 1 then
    raise exception 'A paper''s number is two whole numbers from 1, such as 1.2.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.committee_papers as numbered
    where numbered.committee_id = paper.committee_id
      and numbered.kind = paper.kind
      and numbered.topic_number = chosen_topic_number
      and numbered.sequence = chosen_sequence
  ) then
    raise exception '% is already taken.',
      public.paper_label(paper.kind, chosen_topic_number, chosen_sequence, paper.title)
      using errcode = '22023';
  end if;

  update public.committee_papers as target
  set status = 'approved',
      topic_number = chosen_topic_number,
      sequence = chosen_sequence,
      decided_at = now(),
      decided_by = (select auth.uid())
  where target.id = paper.id;

  perform public.notify_paper_seats(
    paper.id,
    array['author']::public.paper_seat_role[],
    'paper_approved',
    '“' || paper.title || '” was approved as '
      || public.paper_label(paper.kind, chosen_topic_number, chosen_sequence, paper.title),
    public.paper_link_path(paper.id)
  );
end;
$$;

revoke execute on function public.approve_paper(uuid, integer, integer) from public, anon;
grant execute on function public.approve_paper(uuid, integer, integer) to authenticated;


-- -----------------------------------------------------------------------------
-- return_paper: "Return to the authors"
-- -----------------------------------------------------------------------------
-- The dais sends a submitted paper back with a comment (rule 6). It is
-- written again, so its versions go and the next submission is version 1.
-- Signatures are kept (section 10, decision 7), and the authors and
-- signatories are told. The dais's comments on the text stay with it.

create or replace function public.return_paper(paper_id uuid, comment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  paper public.committee_papers;
  trimmed_comment text;
begin
  paper := public.lock_paper(return_paper.paper_id);

  if not public.has_committee_permission(paper.committee_id, 'run_room') then
    raise exception 'Only the dais of this committee can return a paper.' using errcode = '42501';
  end if;

  if paper.kind not in ('working_paper', 'draft_resolution', 'committee_directive')
    or paper.status <> 'submitted'
  then
    raise exception 'Only a submitted paper can be returned.' using errcode = '22023';
  end if;

  trimmed_comment := btrim(return_paper.comment);

  if trimmed_comment is null
    or trimmed_comment !~ '[^[:space:]]'
    or char_length(trimmed_comment) > 2000
  then
    raise exception 'Say in at most 2,000 characters what the authors should change.'
      using errcode = '22023';
  end if;

  update public.committee_papers as target
  set status = 'writing',
      return_comment = trimmed_comment,
      decided_at = now(),
      decided_by = (select auth.uid())
  where target.id = paper.id;

  delete from public.committee_paper_versions as version
  where version.paper_id = paper.id;

  perform public.notify_paper_seats(
    paper.id,
    array['author', 'signatory']::public.paper_seat_role[],
    'paper_returned',
    '“' || paper.title || '” was returned to its authors',
    public.paper_link_path(paper.id)
  );
end;
$$;

revoke execute on function public.return_paper(uuid, text) from public, anon;
grant execute on function public.return_paper(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- withdraw_paper: "Withdraw", and "Withdraw at the sponsors' request"
-- -----------------------------------------------------------------------------
-- The authors withdraw a paper until it is introduced; after that it belongs
-- to the committee and the dais withdraws it, at the sponsors' request, as a
-- chair would announce it. Not while a vote on it or on one of its
-- amendments is open, since that vote would have nothing to settle. Its
-- waiting amendments lapse, and it leaves the projector.
--
-- plpgsql, because it reads columns that are added further down this file
-- (votes.paper_id, votes.amendment_id, committee_state.displayed_paper_id).

create or replace function public.withdraw_paper(paper_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  paper public.committee_papers;
begin
  paper := public.lock_paper(withdraw_paper.paper_id);

  if paper.status in ('writing', 'submitted', 'approved') then
    if not public.is_paper_author(paper.id) then
      raise exception 'Only an author of this paper can withdraw it.' using errcode = '42501';
    end if;
  elsif paper.status = 'introduced' then
    if not public.has_committee_permission(paper.committee_id, 'run_room') then
      raise exception 'Once a paper is introduced, the dais withdraws it.' using errcode = '42501';
    end if;
  else
    raise exception 'This paper can no longer be withdrawn.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.votes as vote
    where vote.status = 'open'
      and (
        vote.paper_id = paper.id
        or vote.amendment_id in (
          select pending.id
          from public.amendments as pending
          where pending.paper_id = paper.id
        )
      )
  ) then
    raise exception 'Close the open vote first.' using errcode = '22023';
  end if;

  update public.amendments as pending
  set status = 'lapsed',
      queue_position = null,
      decided_at = now()
  where pending.paper_id = paper.id
    and pending.status in ('awaiting_sponsors', 'collecting_support', 'with_the_dais', 'approved');

  update public.committee_papers as target
  set status = 'withdrawn',
      is_open_for_signatures = false
  where target.id = paper.id;

  update public.committee_state as state
  set displayed_paper_id = null
  where state.committee_id = paper.committee_id
    and state.displayed_paper_id = paper.id;
end;
$$;

revoke execute on function public.withdraw_paper(uuid) from public, anon;
grant execute on function public.withdraw_paper(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- introduce_paper: what a passed motion to introduce a paper does
-- -----------------------------------------------------------------------------
-- Introducing is a motion, as today (rule 8), so this runs from
-- apply_passed_motion once the motion has passed, with the moment the chair
-- pressed: the paper is introduced, by that motion, and goes on the
-- projector. apply_passed_motion runs as the chair, which is why this is
-- granted to them; it still asks for the passed motion, so it introduces
-- nothing on its own. A paper withdrawn while its motion was on the floor
-- refuses, and the chair drops the motion.
--
-- plpgsql, because it reads columns that are added further down this file
-- (motions.paper_id, committee_state.displayed_paper_id).

create or replace function public.introduce_paper(
  paper_id uuid,
  motion_id uuid,
  moment timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  paper public.committee_papers;
begin
  paper := public.lock_paper(introduce_paper.paper_id);

  if not public.has_committee_permission(paper.committee_id, 'run_room') then
    raise exception 'Only the dais of this committee can introduce a paper.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.motions as introducing
    where introducing.id = introduce_paper.motion_id
      and introducing.committee_id = paper.committee_id
      and introducing.kind = 'introduce_document'
      and introducing.paper_id = paper.id
      and introducing.status = 'passed'
  ) then
    raise exception 'A paper is introduced by passing a motion to introduce it.' using errcode = '22023';
  end if;

  if paper.status <> 'approved' then
    raise exception 'That paper is no longer waiting to be introduced. Drop the motion.'
      using errcode = '22023';
  end if;

  update public.committee_papers as target
  set status = 'introduced',
      introduced_at = coalesce(introduce_paper.moment, now()),
      introduced_by_motion_id = introduce_paper.motion_id
  where target.id = paper.id;

  update public.committee_state as state
  set displayed_paper_id = paper.id
  where state.committee_id = paper.committee_id;

  perform public.notify_paper_seats(
    paper.id,
    array['author']::public.paper_seat_role[],
    'paper_introduced',
    public.paper_label(paper.kind, paper.topic_number, paper.sequence, paper.title) || ' was introduced',
    public.paper_link_path(paper.id)
  );
end;
$$;

revoke execute on function public.introduce_paper(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.introduce_paper(uuid, uuid, timestamptz) to authenticated;


-- =============================================================================
-- Functions: amendments
-- =============================================================================
-- An amendment changes one clause of an introduced draft resolution (section
-- 3, rule 9). Where friendly amendments are on, the draft's sponsors are
-- asked first: when every one accepts, the amendment is friendly and goes to
-- the dais, which writes it in when it approves it; the first decline makes
-- it unfriendly. An unfriendly amendment gathers signatures until it has the
-- support the committee asks for, goes to the dais, and once approved waits
-- for its vote, which settles it (votes_settle_paper, below).
--
-- An amendment is waiting while it is awaiting_sponsors, collecting_support,
-- with_the_dais or approved; every other status is how it ended. Every
-- function here locks the draft before the amendment, as withdraw_paper and
-- the vote that settles one do, so two of them never wait on each other in
-- opposite orders.


-- -----------------------------------------------------------------------------
-- lock_amendment: the amendment a function is about to change
-- -----------------------------------------------------------------------------
-- Its draft first, then the amendment, until the transaction ends. An
-- amendment on a draft the caller may not read does not exist for them.
-- Internal.

create or replace function public.lock_amendment(amendment_id uuid)
returns public.amendments
language plpgsql
security definer
set search_path = ''
as $$
declare
  amendment public.amendments;
begin
  perform 1
  from public.committee_papers as amended_paper
  join public.amendments as candidate on candidate.paper_id = amended_paper.id
  where candidate.id = lock_amendment.amendment_id
  for update of amended_paper;

  select candidate.*
  into amendment
  from public.amendments as candidate
  where candidate.id = lock_amendment.amendment_id
  for update;

  if not found or not public.may_read_paper(amendment.paper_id) then
    raise exception 'That amendment does not exist.' using errcode = 'P0002';
  end if;

  return amendment;
end;
$$;

revoke execute on function public.lock_amendment(uuid) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- notify_amendment_proposer: tell the proposer what became of their amendment
-- -----------------------------------------------------------------------------
-- "Amendment 3 to Draft resolution 1.2 was ruled out of order". Internal.

create or replace function public.notify_amendment_proposer(amendment_id uuid, outcome text)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.notify_paper_users(
    array[seat.user_id],
    public.paper_conference_id(amended_paper.id),
    'amendment_decided',
    'Amendment ' || amendment.sequence || ' to '
      || public.paper_label(
        amended_paper.kind, amended_paper.topic_number, amended_paper.sequence, amended_paper.title
      )
      || ' ' || notify_amendment_proposer.outcome,
    public.paper_link_path(amended_paper.id) || '#amendment-' || amendment.sequence
  )
  from public.amendments as amendment
  join public.committee_papers as amended_paper on amended_paper.id = amendment.paper_id
  join public.seats as seat on seat.id = amendment.proposed_by_seat_id
  where amendment.id = notify_amendment_proposer.amendment_id;
$$;

revoke execute on function public.notify_amendment_proposer(uuid, text) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- send_amendment_to_the_dais: an amendment joins the end of the dais's queue
-- -----------------------------------------------------------------------------
-- One queue across every draft of the committee, in the order the dais will
-- take them. The lock makes two amendments that arrive at the same moment
-- take turns, so each gets a place of its own. Internal.

create or replace function public.send_amendment_to_the_dais(amendment_id uuid, is_friendly boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  queue_committee_id uuid;
begin
  select amended_paper.committee_id
  into queue_committee_id
  from public.amendments as sent
  join public.committee_papers as amended_paper on amended_paper.id = sent.paper_id
  where sent.id = send_amendment_to_the_dais.amendment_id;

  perform pg_advisory_xact_lock(hashtext('amendment-queue:' || queue_committee_id::text));

  update public.amendments as target
  set status = 'with_the_dais',
      is_friendly = send_amendment_to_the_dais.is_friendly,
      queue_position = (
        select coalesce(max(queued.queue_position), 0) + 1
        from public.amendments as queued
        join public.committee_papers as queued_paper on queued_paper.id = queued.paper_id
        where queued_paper.committee_id = queue_committee_id
      )
  where target.id = send_amendment_to_the_dais.amendment_id;
end;
$$;

revoke execute on function public.send_amendment_to_the_dais(uuid, boolean)
  from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- route_unfriendly_amendment: to the dais with enough support, or collecting it
-- -----------------------------------------------------------------------------
-- The proposer counts towards the support (section 5), so with a minimum of
-- none, or of one seat, an unfriendly amendment goes to the dais at once.
-- Called again after every signature. Internal.

create or replace function public.route_unfriendly_amendment(amendment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  committee public.committees;
  support integer;
begin
  select candidate.*
  into committee
  from public.committees as candidate
  join public.committee_papers as amended_paper on amended_paper.committee_id = candidate.id
  join public.amendments as routed on routed.paper_id = amended_paper.id
  where routed.id = route_unfriendly_amendment.amendment_id;

  select 1 + count(*)
  into support
  from public.amendment_seats as signature
  where signature.amendment_id = route_unfriendly_amendment.amendment_id
    and signature.role = 'signatory';

  if support >= public.paper_support_needed(
    committee.id, committee.amendment_support_minimum, committee.amendment_support_unit
  ) then
    perform public.send_amendment_to_the_dais(route_unfriendly_amendment.amendment_id, false);
  else
    update public.amendments as target
    set status = 'collecting_support',
        is_friendly = false
    where target.id = route_unfriendly_amendment.amendment_id;
  end if;
end;
$$;

revoke execute on function public.route_unfriendly_amendment(uuid) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- lapse_pending_children: the amendments to an amendment end with it
-- -----------------------------------------------------------------------------
-- An amendment to an amendment changes its parent's words, so once the parent
-- is written in, passed, failed, ruled out of order or withdrawn there is
-- nothing left for it to change. Internal.

create or replace function public.lapse_pending_children(amendment_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.amendments as pending
  set status = 'lapsed',
      queue_position = null,
      decided_at = now()
  where pending.parent_amendment_id = lapse_pending_children.amendment_id
    and pending.status in ('awaiting_sponsors', 'collecting_support', 'with_the_dais', 'approved');
$$;

revoke execute on function public.lapse_pending_children(uuid) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- apply_amendment_to_paper: write an amendment into its draft
-- -----------------------------------------------------------------------------
-- A friendly amendment the dais approves (written_in) and an unfriendly one
-- the committee passes (passed) both make the draft's next version from its
-- latest one. A clause the amendment adds takes the id "a" and the
-- amendment's number. The amendments to it lapse, and so do the waiting
-- amendments whose clause it struck. Touching updated_at tells every open
-- page, through the realtime publication, that the draft has a new version.
--
-- Not while a vote on the draft or on one of its amendments is open: the
-- committee would be voting on a text that changed under it. A vote that is
-- being settled has closed already when this runs.
--
-- Internal: decide_amendment and votes_settle_paper call it. It reads the
-- draft and the amendment without asking whether the caller may, because
-- closing a vote settles it whoever closes it.

create or replace function public.apply_amendment_to_paper(
  amendment_id uuid,
  final_status public.amendment_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  paper public.committee_papers;
  amendment public.amendments;
  latest public.committee_paper_versions;
  amended_content jsonb;
begin
  select candidate.*
  into paper
  from public.committee_papers as candidate
  where candidate.id = (
    select amended.paper_id
    from public.amendments as amended
    where amended.id = apply_amendment_to_paper.amendment_id
  )
  for update;

  select candidate.*
  into amendment
  from public.amendments as candidate
  where candidate.id = apply_amendment_to_paper.amendment_id
  for update;

  if paper.status is distinct from 'introduced' then
    raise exception 'The draft is no longer on the floor.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.votes as vote
    where vote.status = 'open'
      and (
        vote.paper_id = paper.id
        or vote.amendment_id in (
          select sibling.id
          from public.amendments as sibling
          where sibling.paper_id = paper.id
        )
      )
  ) then
    raise exception 'Close the open vote on this draft first.' using errcode = '22023';
  end if;

  select version.*
  into latest
  from public.committee_paper_versions as version
  where version.paper_id = paper.id
  order by version.version_number desc
  limit 1;

  if not (amendment.action = 'add' and amendment.target_clause_id is null)
    and not public.paper_content_has_clause(
      latest.content, amendment.target_part, amendment.target_clause_id
    )
  then
    raise exception 'The clause this amendment changes is no longer in the draft.' using errcode = '22023';
  end if;

  amended_content := public.apply_amendment_to_content(
    latest.content,
    amendment.action,
    amendment.target_part,
    amendment.target_clause_id,
    amendment.text_markdown,
    'a' || amendment.sequence
  );

  insert into public.committee_paper_versions (paper_id, version_number, content, amendment_id)
  values (paper.id, latest.version_number + 1, amended_content, amendment.id);

  update public.amendments as target
  set status = apply_amendment_to_paper.final_status,
      queue_position = null,
      decided_at = now()
  where target.id = amendment.id;

  perform public.lapse_pending_children(amendment.id);

  update public.amendments as pending
  set status = 'lapsed',
      queue_position = null,
      decided_at = now()
  where pending.paper_id = paper.id
    and pending.status in ('awaiting_sponsors', 'collecting_support', 'with_the_dais', 'approved')
    and pending.target_clause_id is not null
    and not public.paper_content_has_clause(amended_content, pending.target_part, pending.target_clause_id);

  update public.committee_papers as target
  set updated_at = now()
  where target.id = paper.id;
end;
$$;

revoke execute on function public.apply_amendment_to_paper(uuid, public.amendment_status)
  from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- propose_amendment: "Propose an amendment"
-- -----------------------------------------------------------------------------
-- A delegate of the committee, not an observer (section 5), proposes adding a
-- clause after another (or at the start), changing a clause's words or
-- striking it, on an introduced draft resolution: operative clauses always,
-- preambulatory ones where the committee allows it. It points at the clause's
-- id in the latest version, so amendments passed before it never make it
-- point at the wrong clause.
--
-- With parent_amendment_id it is an amendment to an amendment, where the
-- committee allows them: it changes the words of a waiting unfriendly
-- amendment that has no parent of its own, and takes its parent's part and
-- clause so the screens show it there. It is never friendly; it goes straight
-- to the committee for support and is voted on before its parent.

create or replace function public.propose_amendment(
  paper_id uuid,
  action public.amendment_action,
  target_part text,
  target_clause_id text,
  text_markdown text,
  parent_amendment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  paper public.committee_papers;
  committee public.committees;
  my_seat public.seats;
  parent public.amendments;
  latest public.committee_paper_versions;
  chosen_part text;
  chosen_clause_id text;
  trimmed_text text;
  new_amendment_id uuid;
  new_sequence integer;
  asked_count integer;
begin
  paper := public.lock_paper(propose_amendment.paper_id);

  select candidate.*
  into committee
  from public.committees as candidate
  where candidate.id = paper.committee_id;

  select seat.*
  into my_seat
  from public.seats as seat
  where seat.id = public.my_committee_seat_id(paper.committee_id);

  if my_seat.id is null then
    raise exception 'Only a delegate of this committee can propose an amendment.' using errcode = '42501';
  end if;

  if my_seat.kind = 'observer' then
    raise exception 'An observer may sign an amendment but not propose one.' using errcode = '42501';
  end if;

  if paper.kind <> 'draft_resolution' or paper.status <> 'introduced' then
    raise exception 'Amendments are proposed to a draft resolution once it is introduced.'
      using errcode = '22023';
  end if;

  select version.*
  into latest
  from public.committee_paper_versions as version
  where version.paper_id = paper.id
  order by version.version_number desc
  limit 1;

  if propose_amendment.parent_amendment_id is not null then
    if not committee.has_second_degree_amendments then
      raise exception 'This committee does not amend amendments.' using errcode = '22023';
    end if;

    select candidate.*
    into parent
    from public.amendments as candidate
    where candidate.id = propose_amendment.parent_amendment_id
      and candidate.paper_id = paper.id
    for update;

    if not found then
      raise exception 'That amendment is not on this draft.' using errcode = '22023';
    end if;

    if parent.parent_amendment_id is not null then
      raise exception 'An amendment to an amendment is not amended again.' using errcode = '22023';
    end if;

    if parent.is_friendly
      or parent.status not in ('collecting_support', 'with_the_dais', 'approved')
    then
      raise exception 'Only an unfriendly amendment waiting for its vote can be amended.'
        using errcode = '22023';
    end if;

    if parent.action = 'strike' then
      raise exception 'An amendment that strikes a clause has no words to amend.' using errcode = '22023';
    end if;

    if propose_amendment.action <> 'change' then
      raise exception 'An amendment to an amendment changes its words.' using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.votes as vote
      where vote.amendment_id = parent.id
        and vote.status = 'open'
    ) then
      raise exception 'The committee is already voting on that amendment.' using errcode = '22023';
    end if;

    chosen_part := parent.target_part;
    chosen_clause_id := parent.target_clause_id;
  else
    if propose_amendment.target_part is null
      or propose_amendment.target_part not in ('preamble', 'operative')
    then
      raise exception 'An amendment changes the preamble or the operative clauses.' using errcode = '22023';
    end if;

    if propose_amendment.target_part = 'preamble' and not committee.preamble_amendable then
      raise exception 'This committee amends operative clauses only.' using errcode = '22023';
    end if;

    if not (propose_amendment.action = 'add' and propose_amendment.target_clause_id is null)
      and not public.paper_content_has_clause(
        latest.content, propose_amendment.target_part, propose_amendment.target_clause_id
      )
    then
      raise exception 'That clause is not in the draft.' using errcode = '22023';
    end if;

    chosen_part := propose_amendment.target_part;
    chosen_clause_id := propose_amendment.target_clause_id;
  end if;

  -- A strike has no words; anything sent with one is ignored.
  if propose_amendment.action <> 'strike' then
    trimmed_text := btrim(propose_amendment.text_markdown);

    if trimmed_text is null
      or trimmed_text !~ '[^[:space:]]'
      or char_length(trimmed_text) > 10000
    then
      raise exception 'Write the words of the amendment, in at most 10,000 characters.'
        using errcode = '22023';
    end if;
  end if;

  -- The draft is locked, so two proposals at once cannot take the same number.
  -- It starts as collecting support and is routed below.
  insert into public.amendments (
    paper_id, sequence, proposed_by_seat_id, action, target_part, target_clause_id,
    text_markdown, parent_amendment_id, status, based_on_version_id
  )
  values (
    paper.id,
    (
      select coalesce(max(numbered.sequence), 0) + 1
      from public.amendments as numbered
      where numbered.paper_id = paper.id
    ),
    my_seat.id,
    propose_amendment.action,
    chosen_part,
    chosen_clause_id,
    trimmed_text,
    propose_amendment.parent_amendment_id,
    'collecting_support',
    latest.id
  )
  returning id, sequence into new_amendment_id, new_sequence;

  if propose_amendment.parent_amendment_id is null and committee.has_friendly_amendments then
    -- The sponsors with a delegate are asked; a proposer who is a sponsor
    -- has said yes by proposing it.
    insert into public.amendment_seats (amendment_id, seat_id, role)
    select new_amendment_id, sponsor.seat_id, 'sponsor_answer'
    from public.committee_paper_seats as sponsor
    join public.seats as seat on seat.id = sponsor.seat_id
    where sponsor.paper_id = paper.id
      and sponsor.role = 'author'
      and sponsor.seat_id <> my_seat.id
      and seat.user_id is not null;

    get diagnostics asked_count = row_count;

    if asked_count > 0 then
      update public.amendments as target
      set status = 'awaiting_sponsors'
      where target.id = new_amendment_id;

      perform public.notify_paper_users(
        array(
          select seat.user_id
          from public.amendment_seats as asked
          join public.seats as seat on seat.id = asked.seat_id
          where asked.amendment_id = new_amendment_id
            and asked.role = 'sponsor_answer'
        ),
        public.paper_conference_id(paper.id),
        'amendment_awaits_answer',
        'Amendment ' || new_sequence || ' to '
          || public.paper_label(paper.kind, paper.topic_number, paper.sequence, paper.title)
          || ' waits for your answer',
        public.paper_link_path(paper.id) || '#amendment-' || new_sequence
      );

      return new_amendment_id;
    end if;

    -- Nobody else to ask: a sponsor's own amendment is friendly at once.
    if public.is_paper_author(paper.id) then
      perform public.send_amendment_to_the_dais(new_amendment_id, true);
      return new_amendment_id;
    end if;
  end if;

  perform public.route_unfriendly_amendment(new_amendment_id);
  return new_amendment_id;
end;
$$;

revoke execute on function public.propose_amendment(
  uuid, public.amendment_action, text, text, text, uuid
) from public, anon;
grant execute on function public.propose_amendment(
  uuid, public.amendment_action, text, text, text, uuid
) to authenticated;


-- -----------------------------------------------------------------------------
-- answer_amendment: a sponsor's "Accept" or "Decline"
-- -----------------------------------------------------------------------------
-- A sponsor asked about an amendment answers while it waits for the sponsors,
-- and may change an acceptance while the others answer. The first decline
-- makes it unfriendly, and it goes to the committee for support; when every
-- sponsor asked has accepted, it is friendly and goes to the dais. The
-- proposer is told either way.

create or replace function public.answer_amendment(amendment_id uuid, accepts boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  amendment public.amendments;
begin
  amendment := public.lock_amendment(answer_amendment.amendment_id);

  if not exists (
    select 1
    from public.amendment_seats as sponsor_answer
    join public.seats as seat on seat.id = sponsor_answer.seat_id
    where sponsor_answer.amendment_id = amendment.id
      and sponsor_answer.role = 'sponsor_answer'
      and seat.user_id = (select auth.uid())
  ) then
    raise exception 'Only a sponsor of the draft answers whether an amendment is friendly.'
      using errcode = '42501';
  end if;

  if amendment.status <> 'awaiting_sponsors' then
    raise exception 'This amendment is no longer waiting for the sponsors.' using errcode = '22023';
  end if;

  if answer_amendment.accepts is null then
    raise exception 'Accept or decline the amendment.' using errcode = '22023';
  end if;

  update public.amendment_seats as sponsor_answer
  set accepts = answer_amendment.accepts,
      answered_at = now()
  from public.seats as seat
  where sponsor_answer.amendment_id = amendment.id
    and sponsor_answer.role = 'sponsor_answer'
    and seat.id = sponsor_answer.seat_id
    and seat.user_id = (select auth.uid());

  if not answer_amendment.accepts then
    perform public.notify_amendment_proposer(amendment.id, 'was declined by a sponsor');
    perform public.route_unfriendly_amendment(amendment.id);
  elsif not exists (
    select 1
    from public.amendment_seats as sponsor_answer
    where sponsor_answer.amendment_id = amendment.id
      and sponsor_answer.role = 'sponsor_answer'
      and sponsor_answer.accepts is distinct from true
  ) then
    perform public.notify_amendment_proposer(amendment.id, 'was accepted by the sponsors');
    perform public.send_amendment_to_the_dais(amendment.id, true);
  end if;
end;
$$;

revoke execute on function public.answer_amendment(uuid, boolean) from public, anon;
grant execute on function public.answer_amendment(uuid, boolean) to authenticated;


-- -----------------------------------------------------------------------------
-- make_amendment_unfriendly: the proposer's "Treat as unfriendly"
-- -----------------------------------------------------------------------------
-- The proposer stops waiting for the sponsors (section 7, amendment_seats):
-- the amendment goes to the committee for support at once. The answers given
-- so far stay, as the record of them.

create or replace function public.make_amendment_unfriendly(amendment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  amendment public.amendments;
begin
  amendment := public.lock_amendment(make_amendment_unfriendly.amendment_id);

  if amendment.proposed_by_seat_id is distinct from public.my_committee_seat_id(
    (select amended_paper.committee_id from public.committee_papers as amended_paper where amended_paper.id = amendment.paper_id)
  ) then
    raise exception 'Only the delegate who proposed an amendment can do that.' using errcode = '42501';
  end if;

  if amendment.status <> 'awaiting_sponsors' then
    raise exception 'This amendment is no longer waiting for the sponsors.' using errcode = '22023';
  end if;

  perform public.route_unfriendly_amendment(amendment.id);
end;
$$;

revoke execute on function public.make_amendment_unfriendly(uuid) from public, anon;
grant execute on function public.make_amendment_unfriendly(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- sign_amendment: "Support this amendment"
-- -----------------------------------------------------------------------------
-- A delegate of the committee signs an unfriendly amendment collecting
-- support. Observers may, as they may sign a paper. The proposer is counted
-- already. Signing twice changes nothing.

create or replace function public.sign_amendment(amendment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  amendment public.amendments;
  my_seat_id uuid;
begin
  amendment := public.lock_amendment(sign_amendment.amendment_id);

  my_seat_id := public.my_committee_seat_id(
    (select amended_paper.committee_id from public.committee_papers as amended_paper where amended_paper.id = amendment.paper_id)
  );

  if my_seat_id is null then
    raise exception 'Only a delegate of this committee can sign an amendment.' using errcode = '42501';
  end if;

  if amendment.status <> 'collecting_support' then
    raise exception 'This amendment is not collecting signatures.' using errcode = '22023';
  end if;

  if my_seat_id = amendment.proposed_by_seat_id then
    raise exception 'The proposer''s support is counted already.' using errcode = '22023';
  end if;

  insert into public.amendment_seats (amendment_id, seat_id, role)
  values (amendment.id, my_seat_id, 'signatory')
  on conflict do nothing;

  perform public.route_unfriendly_amendment(amendment.id);
end;
$$;

revoke execute on function public.sign_amendment(uuid) from public, anon;
grant execute on function public.sign_amendment(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- decide_amendment: the dais's "Approve" or "Rule out of order"
-- -----------------------------------------------------------------------------
-- An amendment waiting for the dais is approved or ruled out of order, with
-- the reason. Approving a friendly amendment writes it in at once; approving
-- an unfriendly one sends it to its vote, which the dais holds when the
-- committee's procedure says. Ruling it out of order ends it and the
-- amendments to it. The proposer is told.

create or replace function public.decide_amendment(
  amendment_id uuid,
  decision text,
  ruling text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  amendment public.amendments;
  trimmed_ruling text;
begin
  amendment := public.lock_amendment(decide_amendment.amendment_id);

  if not public.has_committee_permission(
    (select amended_paper.committee_id from public.committee_papers as amended_paper where amended_paper.id = amendment.paper_id),
    'run_room'
  ) then
    raise exception 'Only the dais of this committee decides an amendment.' using errcode = '42501';
  end if;

  if amendment.status <> 'with_the_dais' then
    raise exception 'This amendment is not waiting for the dais.' using errcode = '22023';
  end if;

  if decide_amendment.decision = 'approve' then
    if amendment.is_friendly then
      perform public.apply_amendment_to_paper(amendment.id, 'written_in');
      perform public.notify_amendment_proposer(amendment.id, 'was approved and written in');
    else
      update public.amendments as target
      set status = 'approved',
          queue_position = null
      where target.id = amendment.id;

      perform public.notify_amendment_proposer(amendment.id, 'was approved and waits for its vote');
    end if;
  elsif decide_amendment.decision = 'out_of_order' then
    trimmed_ruling := btrim(decide_amendment.ruling);

    if trimmed_ruling is null
      or trimmed_ruling !~ '[^[:space:]]'
      or char_length(trimmed_ruling) > 2000
    then
      raise exception 'Say in at most 2,000 characters why the amendment is out of order.'
        using errcode = '22023';
    end if;

    update public.amendments as target
    set status = 'out_of_order',
        ruling = trimmed_ruling,
        queue_position = null,
        decided_at = now()
    where target.id = amendment.id;

    perform public.lapse_pending_children(amendment.id);
    perform public.notify_amendment_proposer(amendment.id, 'was ruled out of order');
  else
    raise exception 'An amendment is approved or ruled out of order.' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.decide_amendment(uuid, text, text) from public, anon;
grant execute on function public.decide_amendment(uuid, text, text) to authenticated;


-- -----------------------------------------------------------------------------
-- withdraw_amendment: the proposer's "Withdraw"
-- -----------------------------------------------------------------------------
-- While the amendment waits, but not during its vote or the vote on an
-- amendment to it, which belongs to that amendment and would settle nothing
-- once it had lapsed (rule 10). The amendments to it go with it.

create or replace function public.withdraw_amendment(amendment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  amendment public.amendments;
begin
  amendment := public.lock_amendment(withdraw_amendment.amendment_id);

  if amendment.proposed_by_seat_id is distinct from public.my_committee_seat_id(
    (select amended_paper.committee_id from public.committee_papers as amended_paper where amended_paper.id = amendment.paper_id)
  ) then
    raise exception 'Only the delegate who proposed an amendment can withdraw it.' using errcode = '42501';
  end if;

  if amendment.status not in ('awaiting_sponsors', 'collecting_support', 'with_the_dais', 'approved') then
    raise exception 'This amendment can no longer be withdrawn.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.votes as vote
    where vote.amendment_id = amendment.id
      and vote.status = 'open'
  ) then
    raise exception 'Close the open vote on this amendment first.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.votes as vote
    join public.amendments as child on child.id = vote.amendment_id
    where child.parent_amendment_id = amendment.id
      and vote.status = 'open'
  ) then
    raise exception 'Close the open vote on the amendment to this amendment first.'
      using errcode = '22023';
  end if;

  update public.amendments as target
  set status = 'withdrawn',
      queue_position = null,
      decided_at = now()
  where target.id = amendment.id;

  perform public.lapse_pending_children(amendment.id);
end;
$$;

revoke execute on function public.withdraw_amendment(uuid) from public, anon;
grant execute on function public.withdraw_amendment(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- reorder_amendments: the dais drags its queue into a new order
-- -----------------------------------------------------------------------------
-- amendment_ids is the order the dais wants. The queue is renumbered from 1;
-- an amendment that reached the dais after the page was drawn, and so is not
-- in the list, keeps its place behind the ones that are.

create or replace function public.reorder_amendments(committee_id uuid, amendment_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_committee_permission(reorder_amendments.committee_id, 'run_room') then
    raise exception 'Only the dais of this committee orders its amendments.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('amendment-queue:' || reorder_amendments.committee_id::text));

  update public.amendments as target
  set queue_position = ordered.new_position
  from (
    select
      queued.id,
      row_number() over (
        order by
          array_position(reorder_amendments.amendment_ids, queued.id) nulls last,
          queued.queue_position,
          queued.created_at
      ) as new_position
    from public.amendments as queued
    join public.committee_papers as queued_paper on queued_paper.id = queued.paper_id
    where queued_paper.committee_id = reorder_amendments.committee_id
      and queued.status = 'with_the_dais'
  ) as ordered
  where target.id = ordered.id
    and target.status = 'with_the_dais';
end;
$$;

revoke execute on function public.reorder_amendments(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_amendments(uuid, uuid[]) to authenticated;


-- =============================================================================
-- Functions: the crisis staff, and a committee's procedure
-- =============================================================================


-- -----------------------------------------------------------------------------
-- answer_directive: the crisis staff's "Carried out", "Refused" or "Publish"
-- -----------------------------------------------------------------------------
-- Directives and press releases go to the crisis staff, who hold
-- answer_directives, rather than to the dais. A committee directive is
-- answered once the committee has passed it; a joint or personal directive or
-- a press release once its authors have sent it. The answer is the crisis
-- staff's words back, which may be empty when the backroom answers on paper
-- (section 10, decision 10). The authors are told.

create or replace function public.answer_directive(
  paper_id uuid,
  outcome public.paper_status,
  answer text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  paper public.committee_papers;
  trimmed_answer text;
begin
  paper := public.lock_paper(answer_directive.paper_id);

  if not public.has_committee_permission(paper.committee_id, 'answer_directives') then
    raise exception 'Only the crisis staff answer directives.' using errcode = '42501';
  end if;

  if paper.kind not in ('committee_directive', 'joint_directive', 'personal_directive', 'press_release') then
    raise exception 'Only directives and press releases are answered.' using errcode = '22023';
  end if;

  if (paper.kind = 'committee_directive' and paper.status <> 'passed')
    or (paper.kind <> 'committee_directive' and paper.status <> 'submitted')
  then
    raise exception 'This paper is not waiting for an answer.' using errcode = '22023';
  end if;

  if paper.kind = 'press_release' then
    if answer_directive.outcome is null or answer_directive.outcome not in ('published', 'refused') then
      raise exception 'A press release is published or refused.' using errcode = '22023';
    end if;
  elsif answer_directive.outcome is null or answer_directive.outcome not in ('carried_out', 'refused') then
    raise exception 'A directive is carried out or refused.' using errcode = '22023';
  end if;

  trimmed_answer := btrim(answer_directive.answer);

  if trimmed_answer !~ '[^[:space:]]' then
    trimmed_answer := null;
  end if;

  if char_length(trimmed_answer) > 100000 then
    raise exception 'An answer is at most 100,000 characters.' using errcode = '22023';
  end if;

  update public.committee_papers as target
  set status = answer_directive.outcome,
      answer_markdown = trimmed_answer,
      decided_at = now(),
      decided_by = (select auth.uid())
  where target.id = paper.id;

  perform public.notify_paper_seats(
    paper.id,
    array['author']::public.paper_seat_role[],
    'directive_answered',
    public.paper_label(paper.kind, paper.topic_number, paper.sequence, paper.title)
      || case answer_directive.outcome
        when 'carried_out' then ' was carried out'
        when 'published' then ' was published'
        else ' was refused'
      end,
    public.paper_link_path(paper.id)
  );
end;
$$;

revoke execute on function public.answer_directive(uuid, public.paper_status, text) from public, anon;
grant execute on function public.answer_directive(uuid, public.paper_status, text) to authenticated;


-- -----------------------------------------------------------------------------
-- send_crisis_update: "Send update"
-- -----------------------------------------------------------------------------
-- One line from the backroom, shown at the top of the crisis committee's
-- pages and on its projector until the next replaces it (section 6). An empty
-- message takes it down. It lives on committee_state, which the room's pages
-- already hear through Realtime, rather than in a table of its own.

create or replace function public.send_crisis_update(committee_id uuid, message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  committee public.committees;
  trimmed_message text;
begin
  select candidate.*
  into committee
  from public.committees as candidate
  where candidate.id = send_crisis_update.committee_id;

  if not found or not public.has_committee_permission(committee.id, 'answer_directives') then
    raise exception 'Only the crisis staff send crisis updates.' using errcode = '42501';
  end if;

  if committee.format <> 'crisis' then
    raise exception 'Only a crisis committee has crisis updates.' using errcode = '22023';
  end if;

  trimmed_message := btrim(send_crisis_update.message);

  if trimmed_message !~ '[^[:space:]]' then
    trimmed_message := null;
  end if;

  if char_length(trimmed_message) > 1000 then
    raise exception 'A crisis update is at most 1,000 characters.' using errcode = '22023';
  end if;

  update public.committee_state as state
  set crisis_update = trimmed_message,
      crisis_update_at = case when trimmed_message is null then null else now() end
  where state.committee_id = committee.id;
end;
$$;

revoke execute on function public.send_crisis_update(uuid, text) from public, anon;
grant execute on function public.send_crisis_update(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- apply_committee_procedure: "Start from" North American or THIMUN
-- -----------------------------------------------------------------------------
-- Fills every setting of section 5 from one procedure in one press; each can
-- be changed afterwards. The format is not a procedure (a crisis committee
-- stays one), so it is never touched here. The values are the two columns of
-- section 5's table, and the North American ones are the column defaults.

create or replace function public.apply_committee_procedure(committee_id uuid, procedure_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_committee_permission(apply_committee_procedure.committee_id, 'manage_committees') then
    raise exception 'Only the people who edit this committee can change its procedure.' using errcode = '42501';
  end if;

  if apply_committee_procedure.procedure_name = 'north_american' then
    update public.committees as target
    set crisis_allows_resolutions = false,
        paper_words = 'sponsors_and_signatories',
        has_working_papers = true,
        sponsor_limit = 5,
        support_minimum = 20,
        support_unit = 'percent',
        support_counts_sponsors = true,
        one_sponsorship_per_topic = false,
        has_friendly_amendments = true,
        amendment_support_minimum = 10,
        amendment_support_unit = 'percent',
        preamble_amendable = false,
        has_second_degree_amendments = false,
        checks_format = true
    where target.id = apply_committee_procedure.committee_id;
  elsif apply_committee_procedure.procedure_name = 'thimun' then
    update public.committees as target
    set crisis_allows_resolutions = false,
        paper_words = 'submitters',
        has_working_papers = false,
        sponsor_limit = null,
        support_minimum = 3,
        support_unit = 'seats',
        support_counts_sponsors = true,
        one_sponsorship_per_topic = false,
        has_friendly_amendments = false,
        amendment_support_minimum = 0,
        amendment_support_unit = 'seats',
        preamble_amendable = false,
        has_second_degree_amendments = true,
        checks_format = true
    where target.id = apply_committee_procedure.committee_id;
  else
    raise exception 'Choose North American or THIMUN procedure.' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.apply_committee_procedure(uuid, text) from public, anon;
grant execute on function public.apply_committee_procedure(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- copy_committee_procedure: "Copy to other committees"
-- -----------------------------------------------------------------------------
-- An organiser who has set one committee up copies its settings to others of
-- the same conference in one press. Every setting but the format, which says
-- what a committee is rather than how it works. The caller must be able to
-- edit the committee copied from and every committee copied to.

create or replace function public.copy_committee_procedure(
  from_committee_id uuid,
  to_committee_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  original public.committees;
begin
  select candidate.*
  into original
  from public.committees as candidate
  where candidate.id = copy_committee_procedure.from_committee_id;

  if not found
    or not public.has_committee_permission(original.id, 'manage_committees')
    or exists (
      select 1
      from unnest(copy_committee_procedure.to_committee_ids) as chosen (committee_id)
      left join public.committees as target on target.id = chosen.committee_id
      where target.id is null
        or target.conference_id <> original.conference_id
        or not public.has_committee_permission(target.id, 'manage_committees')
    )
  then
    raise exception 'Only the people who edit these committees can copy a procedure between them.'
      using errcode = '42501';
  end if;

  update public.committees as target
  set crisis_allows_resolutions = original.crisis_allows_resolutions,
      paper_words = original.paper_words,
      has_working_papers = original.has_working_papers,
      sponsor_limit = original.sponsor_limit,
      support_minimum = original.support_minimum,
      support_unit = original.support_unit,
      support_counts_sponsors = original.support_counts_sponsors,
      one_sponsorship_per_topic = original.one_sponsorship_per_topic,
      has_friendly_amendments = original.has_friendly_amendments,
      amendment_support_minimum = original.amendment_support_minimum,
      amendment_support_unit = original.amendment_support_unit,
      preamble_amendable = original.preamble_amendable,
      has_second_degree_amendments = original.has_second_degree_amendments,
      checks_format = original.checks_format
  where target.id = any (copy_committee_procedure.to_committee_ids)
    and target.id <> original.id;
end;
$$;

revoke execute on function public.copy_committee_procedure(uuid, uuid[]) from public, anon;
grant execute on function public.copy_committee_procedure(uuid, uuid[]) to authenticated;


-- =============================================================================
-- Functions: comments
-- =============================================================================
-- Section 4, "Comments and suggestions". A thread is on a passage of a paper
-- or on the whole paper, and its comments are plain text, one level of
-- replies in the order written. may_read_thread says who reads a thread;
-- these functions say who writes in one and when, and tell the people in a
-- thread when somebody else writes in it. A suggestion is part of the text,
-- so making and deciding one is the authors' save, not a function here.
--
-- A comment the caller may not read is "That comment does not exist."
-- (P0002), as a paper is.


-- -----------------------------------------------------------------------------
-- checked_comment_body: a comment's words, or the reason they cannot be posted
-- -----------------------------------------------------------------------------
-- Plain text of at most 2,000 characters, without the spaces around it.
-- Internal.

create or replace function public.checked_comment_body(body text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  trimmed_body text := btrim(checked_comment_body.body);
begin
  if trimmed_body is null
    or trimmed_body !~ '[^[:space:]]'
    or char_length(trimmed_body) > 2000
  then
    raise exception 'Write a comment of at most 2,000 characters.' using errcode = '22023';
  end if;

  return trimmed_body;
end;
$$;

revoke execute on function public.checked_comment_body(text) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- start_thread: "Comment"
-- -----------------------------------------------------------------------------
-- A new thread with its first comment, on the passage between anchor_start
-- and anchor_end in one part of the paper (anchor_fragment), or on the whole
-- paper when both are null. Who may start one (section 4, "Who comments, who
-- reads"):
--
--   * on a committee paper still with its authors or the dais: an author;
--     a delegate of the committee while it is open for signatures, to ask
--     before signing; the dais once it is submitted, which makes the thread
--     the dais's, read by the whole dais. Somebody outside the authors
--     starting a thread tells the authors.
--   * on a position paper while its draft exists: everybody who may work on
--     it, who all count as its authors, so nobody is told.

create or replace function public.start_thread(
  body text,
  committee_paper_id uuid default null,
  position_paper_seat_id uuid default null,
  anchor_fragment text default 'body',
  anchor_start text default null,
  anchor_end text default null,
  quoted_text text default null,
  suggestion_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  paper public.committee_papers;
  trimmed_body text;
  fragment text := coalesce(start_thread.anchor_fragment, 'body');
  is_on_passage boolean := start_thread.anchor_start is not null;
  starter_seat_id uuid;
  starts_from_dais boolean := false;
  new_thread_id uuid;
begin
  if num_nonnulls(start_thread.committee_paper_id, start_thread.position_paper_seat_id) <> 1 then
    raise exception 'A comment is on one paper.' using errcode = '22023';
  end if;

  trimmed_body := public.checked_comment_body(start_thread.body);

  if (start_thread.anchor_start is null) <> (start_thread.anchor_end is null)
    or coalesce(char_length(start_thread.anchor_start), 0) > 1000
    or coalesce(char_length(start_thread.anchor_end), 0) > 1000
  then
    raise exception 'A comment is on a passage, with its start and end, or on the whole paper.'
      using errcode = '22023';
  end if;

  if start_thread.committee_paper_id is not null then
    paper := public.lock_paper(start_thread.committee_paper_id);

    if paper.status not in ('writing', 'submitted', 'approved') then
      raise exception 'Comments on this paper are closed.' using errcode = '22023';
    end if;

    starter_seat_id := public.my_committee_seat_id(paper.committee_id);

    if public.is_paper_author(paper.id) then
      null;
    elsif paper.is_open_for_signatures and starter_seat_id is not null then
      null;
    elsif paper.status in ('submitted', 'approved')
      and paper.kind in ('working_paper', 'draft_resolution', 'committee_directive')
      and public.has_committee_permission(paper.committee_id, 'run_room')
    then
      starts_from_dais := true;
    else
      raise exception 'You cannot comment on this paper.' using errcode = '42501';
    end if;

    -- A comment on the whole paper is in no part of it.
    if (not is_on_passage and fragment <> 'body')
      or (
        is_on_passage
        and not case paper.kind
          when 'draft_resolution' then fragment in ('preamble', 'operative')
          when 'committee_directive' then fragment = 'operative'
          else fragment = 'body'
        end
      )
    then
      raise exception 'That part is not in this paper.' using errcode = '22023';
    end if;

    insert into public.paper_comment_threads (
      committee_paper_id, anchor_fragment, anchor_start, anchor_end, quoted_text,
      started_by_seat_id, is_from_dais, suggestion_id
    )
    values (
      paper.id,
      fragment,
      start_thread.anchor_start,
      start_thread.anchor_end,
      case when is_on_passage then left(start_thread.quoted_text, 10000) end,
      starter_seat_id,
      starts_from_dais,
      start_thread.suggestion_id
    )
    returning id into new_thread_id;

    if not public.is_paper_author(paper.id) then
      perform public.notify_paper_seats(
        paper.id,
        array['author']::public.paper_seat_role[],
        'paper_comment_thread',
        'New comment on ' || public.paper_label(paper.kind, paper.topic_number, paper.sequence, paper.title),
        public.paper_link_path(paper.id) || '#thread-' || new_thread_id
      );
    end if;
  else
    if not public.may_edit_paper_draft(start_thread.position_paper_seat_id) then
      raise exception 'You cannot comment on this paper.' using errcode = '42501';
    end if;

    -- Key share is enough to keep the draft from being submitted, which
    -- deletes it, until this thread is in; the authors' saves go on.
    perform 1
    from public.position_paper_drafts as draft
    where draft.seat_id = start_thread.position_paper_seat_id
    for key share;

    if not found then
      raise exception 'Comments on this paper are closed.' using errcode = '22023';
    end if;

    if fragment <> 'body' then
      raise exception 'That part is not in this paper.' using errcode = '22023';
    end if;

    -- Null for a member of the delegation who sits in no seat of the
    -- committee, such as an adviser.
    select public.my_committee_seat_id(seat.committee_id)
    into starter_seat_id
    from public.seats as seat
    where seat.id = start_thread.position_paper_seat_id;

    insert into public.paper_comment_threads (
      position_paper_seat_id, anchor_fragment, anchor_start, anchor_end, quoted_text,
      started_by_seat_id, suggestion_id
    )
    values (
      start_thread.position_paper_seat_id,
      fragment,
      start_thread.anchor_start,
      start_thread.anchor_end,
      case when is_on_passage then left(start_thread.quoted_text, 10000) end,
      starter_seat_id,
      start_thread.suggestion_id
    )
    returning id into new_thread_id;
  end if;

  insert into public.paper_comments (thread_id, body)
  values (new_thread_id, trimmed_body);

  return new_thread_id;
end;
$$;

revoke execute on function public.start_thread(text, uuid, uuid, text, text, text, text, text)
  from public, anon;
grant execute on function public.start_thread(text, uuid, uuid, text, text, text, text, text)
  to authenticated;


-- -----------------------------------------------------------------------------
-- reply_to_thread: "Reply"
-- -----------------------------------------------------------------------------
-- Anybody who reads a thread may reply while it takes comments. A reply opens
-- a resolved thread again, since it is somebody saying it is not settled.
--
-- The people in the thread, whoever started it and whoever has written in it,
-- are told, each at the page they read it on and only while they may still
-- read it: a delegate who asked before signing and was answered after
-- signatures closed hears nothing. notify_paper_users sends nobody a second
-- notification while the first is unread, which makes it one per thread
-- rather than one per reply.

create or replace function public.reply_to_thread(thread_id uuid, body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  thread public.paper_comment_threads;
  paper public.committee_papers;
  trimmed_body text;
  participant_ids uuid[];
  delegate_ids uuid[];
  reply_title text;
  holder_id uuid;
  seat_name text;
  committee_name text;
  seat_conference_id uuid;
  committee_path text;
  new_comment_id uuid;
begin
  select candidate.*
  into thread
  from public.paper_comment_threads as candidate
  where candidate.id = reply_to_thread.thread_id
  for update;

  if not found or not public.may_read_thread(thread.id) then
    raise exception 'That comment does not exist.' using errcode = 'P0002';
  end if;

  if not public.thread_accepts_comments(thread.id) then
    raise exception 'Comments on this paper are closed.' using errcode = '22023';
  end if;

  trimmed_body := public.checked_comment_body(reply_to_thread.body);

  insert into public.paper_comments (thread_id, body)
  values (thread.id, trimmed_body)
  returning id into new_comment_id;

  if thread.resolved_at is not null then
    update public.paper_comment_threads as target
    set resolved_at = null,
        resolved_by = null
    where target.id = thread.id;
  end if;

  participant_ids := array(
    select distinct participant.user_id
    from (
      select thread.started_by as user_id
      union
      select written.written_by
      from public.paper_comments as written
      where written.thread_id = thread.id
    ) as participant
    where participant.user_id is not null
  );

  if thread.committee_paper_id is not null then
    select candidate.*
    into paper
    from public.committee_papers as candidate
    where candidate.id = thread.committee_paper_id;

    reply_title := 'New reply on '
      || public.paper_label(paper.kind, paper.topic_number, paper.sequence, paper.title);

    -- The delegates in it, at the delegates' page: a seat on the paper, or a
    -- seat in the committee while the paper is open for signatures.
    delegate_ids := array(
      select recipient.user_id
      from unnest(participant_ids) as recipient (user_id)
      where exists (
          select 1
          from public.committee_paper_seats as paper_seat
          join public.seats as seat on seat.id = paper_seat.seat_id
          where paper_seat.paper_id = paper.id
            and seat.user_id = recipient.user_id
        )
        or (
          paper.is_open_for_signatures
          and exists (
            select 1
            from public.seats as seat
            where seat.committee_id = paper.committee_id
              and seat.user_id = recipient.user_id
          )
        )
    );

    perform public.notify_paper_users(
      delegate_ids,
      public.paper_conference_id(paper.id),
      'paper_comment_reply',
      reply_title,
      public.paper_link_path(paper.id) || '#thread-' || thread.id
    );

    -- The rest of the dais in a thread the dais started, at the dais's page
    -- for the paper.
    if thread.is_from_dais then
      perform public.notify_paper_users(
        array(
          select recipient.user_id
          from unnest(participant_ids) as recipient (user_id)
          where not recipient.user_id = any (delegate_ids)
            and public.holder_has_committee_permission(paper.committee_id, recipient.user_id, 'run_room')
        ),
        public.paper_conference_id(paper.id),
        'paper_comment_reply',
        reply_title,
        (
          select '/conferences/' || conference.slug
            || '/committees/' || committee.slug
            || '/chair/resolutions/' || paper.id
            || '#thread-' || thread.id
          from public.committees as committee
          join public.conferences as conference on conference.id = committee.conference_id
          where committee.id = paper.committee_id
        )
      );
    end if;
  else
    select seat.user_id,
           seat.name,
           committee.name,
           committee.conference_id,
           '/conferences/' || conference.slug || '/committees/' || committee.slug
    into holder_id, seat_name, committee_name, seat_conference_id, committee_path
    from public.seats as seat
    join public.committees as committee on committee.id = seat.committee_id
    join public.conferences as conference on conference.id = committee.conference_id
    where seat.id = thread.position_paper_seat_id;

    -- A position paper: its delegate at their own position paper page.
    if holder_id = any (participant_ids) then
      perform public.notify_paper_users(
        array[holder_id],
        seat_conference_id,
        'paper_comment_reply',
        'New reply on your position paper for ' || committee_name,
        committee_path || '/position-paper?way=write#thread-' || thread.id
      );
    end if;

    -- The rest of the delegation at the delegation's copy of it, which is
    -- under the delegation they share with the delegate. Somebody who no
    -- longer shares one has left the paper and hears nothing.
    perform public.notify_paper_users(
      array[recipient.user_id],
      seat_conference_id,
      'paper_comment_reply',
      'New reply on the position paper for ' || seat_name || ' in ' || committee_name,
      '/delegations/' || shared.delegation_id
        || '/papers/' || thread.position_paper_seat_id
        || '#thread-' || thread.id
    )
    from unnest(participant_ids) as recipient (user_id)
    cross join lateral (
      select holder.delegation_id
      from public.delegation_members as holder
      join public.delegations as delegation on delegation.id = holder.delegation_id
      join public.delegation_members as reader on reader.delegation_id = holder.delegation_id
      where holder.user_id = holder_id
        and delegation.conference_id = seat_conference_id
        and reader.user_id = recipient.user_id
      order by holder.delegation_id
      limit 1
    ) as shared
    where recipient.user_id <> holder_id;
  end if;

  return new_comment_id;
end;
$$;

revoke execute on function public.reply_to_thread(uuid, text) from public, anon;
grant execute on function public.reply_to_thread(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- edit_comment: "Edit" on one's own comment
-- -----------------------------------------------------------------------------
-- Only by its writer, and only while the thread takes comments. The comment
-- says it was edited.

create or replace function public.edit_comment(comment_id uuid, body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  own_comment public.paper_comments;
  trimmed_body text;
begin
  select candidate.*
  into own_comment
  from public.paper_comments as candidate
  where candidate.id = edit_comment.comment_id
  for update;

  if not found
    or own_comment.deleted_at is not null
    or not public.may_read_thread(own_comment.thread_id)
  then
    raise exception 'That comment does not exist.' using errcode = 'P0002';
  end if;

  if own_comment.written_by is distinct from (select auth.uid()) then
    raise exception 'Only the person who wrote a comment can change it.' using errcode = '42501';
  end if;

  if not public.thread_accepts_comments(own_comment.thread_id) then
    raise exception 'Comments on this paper are closed.' using errcode = '22023';
  end if;

  trimmed_body := public.checked_comment_body(edit_comment.body);

  update public.paper_comments as target
  set body = trimmed_body,
      edited_at = now()
  where target.id = own_comment.id
    and target.body is distinct from trimmed_body;
end;
$$;

revoke execute on function public.edit_comment(uuid, text) from public, anon;
grant execute on function public.edit_comment(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- delete_comment: "Delete" on one's own comment
-- -----------------------------------------------------------------------------
-- Only by its writer, while the thread takes comments. Replies are one level
-- deep, so only the comment that opened a thread can have replies: with
-- replies it stays as "Comment deleted", its words gone, so the replies still
-- read as answers to something; without them it takes the thread with it. A
-- thread left with nothing but "Comment deleted" goes as well.

create or replace function public.delete_comment(comment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  own_comment public.paper_comments;
  opening_comment_id uuid;
  other_comment_count integer;
begin
  -- The thread first, as reply_to_thread locks it, so a reply and this
  -- deletion take turns.
  perform 1
  from public.paper_comment_threads as locked
  join public.paper_comments as candidate on candidate.thread_id = locked.id
  where candidate.id = delete_comment.comment_id
  for update of locked;

  select candidate.*
  into own_comment
  from public.paper_comments as candidate
  where candidate.id = delete_comment.comment_id
  for update;

  if not found
    or own_comment.deleted_at is not null
    or not public.may_read_thread(own_comment.thread_id)
  then
    raise exception 'That comment does not exist.' using errcode = 'P0002';
  end if;

  if own_comment.written_by is distinct from (select auth.uid()) then
    raise exception 'Only the person who wrote a comment can delete it.' using errcode = '42501';
  end if;

  if not public.thread_accepts_comments(own_comment.thread_id) then
    raise exception 'Comments on this paper are closed.' using errcode = '22023';
  end if;

  select opening.id
  into opening_comment_id
  from public.paper_comments as opening
  where opening.thread_id = own_comment.thread_id
  order by opening.created_at, opening.id
  limit 1;

  select count(*)
  into other_comment_count
  from public.paper_comments as other_comment
  where other_comment.thread_id = own_comment.thread_id
    and other_comment.id <> own_comment.id
    and other_comment.deleted_at is null;

  if other_comment_count = 0 then
    delete from public.paper_comment_threads as target
    where target.id = own_comment.thread_id;
  elsif own_comment.id = opening_comment_id then
    update public.paper_comments as target
    set body = '',
        deleted_at = now()
    where target.id = own_comment.id;
  else
    delete from public.paper_comments as target
    where target.id = own_comment.id;
  end if;
end;
$$;

revoke execute on function public.delete_comment(uuid) from public, anon;
grant execute on function public.delete_comment(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- resolve_thread and reopen_thread: "Resolve" and "Reopen"
-- -----------------------------------------------------------------------------
-- Any reader of a thread may resolve it, which folds it away, and reopen it,
-- while it takes comments. Resolving one that is resolved already keeps who
-- resolved it first.

create or replace function public.resolve_thread(thread_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  thread public.paper_comment_threads;
begin
  select candidate.*
  into thread
  from public.paper_comment_threads as candidate
  where candidate.id = resolve_thread.thread_id
  for update;

  if not found or not public.may_read_thread(thread.id) then
    raise exception 'That comment does not exist.' using errcode = 'P0002';
  end if;

  if not public.thread_accepts_comments(thread.id) then
    raise exception 'Comments on this paper are closed.' using errcode = '22023';
  end if;

  update public.paper_comment_threads as target
  set resolved_at = now(),
      resolved_by = (select auth.uid())
  where target.id = thread.id
    and target.resolved_at is null;
end;
$$;

revoke execute on function public.resolve_thread(uuid) from public, anon;
grant execute on function public.resolve_thread(uuid) to authenticated;

create or replace function public.reopen_thread(thread_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  thread public.paper_comment_threads;
begin
  select candidate.*
  into thread
  from public.paper_comment_threads as candidate
  where candidate.id = reopen_thread.thread_id
  for update;

  if not found or not public.may_read_thread(thread.id) then
    raise exception 'That comment does not exist.' using errcode = 'P0002';
  end if;

  if not public.thread_accepts_comments(thread.id) then
    raise exception 'Comments on this paper are closed.' using errcode = '22023';
  end if;

  update public.paper_comment_threads as target
  set resolved_at = null,
      resolved_by = null
  where target.id = thread.id;
end;
$$;

revoke execute on function public.reopen_thread(uuid) from public, anon;
grant execute on function public.reopen_thread(uuid) to authenticated;


-- =============================================================================
-- Triggers
-- =============================================================================
-- The rules the functions above check before they write, kept by the tables
-- as well, so a seed file or a test that writes a row straight in keeps them
-- too, and the two writes a browser makes itself (the authors' save and the
-- working papers a draft is based on) are held to them.


-- -----------------------------------------------------------------------------
-- committee_papers: only a kind the committee writes
-- -----------------------------------------------------------------------------
-- start_paper asks the same. A committee that turns working papers off, or
-- whose format changes, keeps the papers it has, so the kind is checked when
-- a paper is made and never again.

create or replace function public.check_committee_paper_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.committees as committee
    where committee.id = new.committee_id
      and public.committee_offers_paper_kind(
        committee.format, committee.crisis_allows_resolutions, new.kind
      )
  ) then
    raise exception 'This committee does not write that kind of paper.' using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke execute on function public.check_committee_paper_kind() from public, anon, authenticated;

create trigger committee_papers_check_kind
  before insert on public.committee_papers
  for each row
  execute function public.check_committee_paper_kind();


-- -----------------------------------------------------------------------------
-- committee_papers: what a save from the browser may change
-- -----------------------------------------------------------------------------
-- The policy "Authors can save a paper they are writing" lets an author
-- update the row, which is how the live writer saves. A save is the text and
-- the title. Everything else about a paper, its status, its number, its lead,
-- its signatures being open, changes through the functions above, which run
-- as the database's own user and so are not limited here.

create or replace function public.protect_committee_papers_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- What an author's save may change. committee_papers_stamp_save sets the
  -- last three whatever the browser sends.
  saved_columns constant text[] := array[
    'document_state', 'body_markdown', 'preamble_markdown', 'operative_markdown', 'title',
    'revision', 'updated_by', 'updated_at'
  ];
begin
  if current_user in ('anon', 'authenticated')
    and to_jsonb(new) - saved_columns is distinct from to_jsonb(old) - saved_columns
  then
    raise exception 'A save changes only the text and the title of a paper.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_committee_papers_columns() from public, anon, authenticated;

create trigger committee_papers_protect_columns
  before update on public.committee_papers
  for each row
  execute function public.protect_committee_papers_columns();


-- -----------------------------------------------------------------------------
-- committee_papers: the revision, and who saved last
-- -----------------------------------------------------------------------------
-- The revision moves on with every change to the text or the title, and only
-- then. So a save is refused when somebody else's landed first, and a
-- submission says which text it froze (submit_paper's expected_revision),
-- while opening for signatures or a new lead clashes with nobody's typing. A
-- save from a browser records who made it and when; the functions and the
-- seed files keep their own times, as position paper drafts do.
--
-- Triggers of the same kind run in the order of their names, and this one's
-- sorts after committee_papers_protect_columns, so the browser's columns are
-- checked before they are stamped.

create or replace function public.stamp_committee_paper_save()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.document_state is distinct from old.document_state
    or new.body_markdown is distinct from old.body_markdown
    or new.preamble_markdown is distinct from old.preamble_markdown
    or new.operative_markdown is distinct from old.operative_markdown
    or new.title is distinct from old.title
  then
    new.revision := old.revision + 1;
  else
    new.revision := old.revision;
  end if;

  if current_user in ('anon', 'authenticated') then
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;

  return new;
end;
$$;

revoke execute on function public.stamp_committee_paper_save() from public, anon, authenticated;

create trigger committee_papers_stamp_save
  before update on public.committee_papers
  for each row
  execute function public.stamp_committee_paper_save();


-- -----------------------------------------------------------------------------
-- committee_paper_seats: who may be on a paper
-- -----------------------------------------------------------------------------
-- A seat of the paper's own committee, held by somebody when it joins (rule
-- 2); only while the paper is being written, since the authors and
-- signatories freeze at submission (rule 5); never an observer as an author
-- (section 5). A signatory who becomes an author counts as one from that
-- moment when the longest-standing author is looked for. Deleting is not
-- checked: a seat that goes, or a paper that is deleted, takes its rows with
-- it whatever the paper's status.
--
-- Security definer, because the seat and the paper it reads are not always
-- readable by whoever wrote the row.

create or replace function public.check_committee_paper_seat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  paper public.committee_papers;
  seat public.seats;
begin
  if tg_op = 'UPDATE' and (new.paper_id <> old.paper_id or new.seat_id <> old.seat_id) then
    raise exception 'A seat on a paper stays that seat on that paper.' using errcode = '42501';
  end if;

  select candidate.*
  into paper
  from public.committee_papers as candidate
  where candidate.id = new.paper_id;

  select candidate.*
  into seat
  from public.seats as candidate
  where candidate.id = new.seat_id;

  if paper.status is distinct from 'writing' then
    raise exception 'The authors and signatories are fixed once the paper is submitted.'
      using errcode = '22023';
  end if;

  if seat.committee_id is distinct from paper.committee_id then
    raise exception 'That seat is not in this committee.' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' and seat.user_id is null then
    raise exception 'Nobody holds that seat yet.' using errcode = '22023';
  end if;

  if new.role = 'author' and seat.kind = 'observer' then
    raise exception 'An observer may sign a paper but not write one.' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' and old.role = 'signatory' and new.role = 'author' then
    new.added_at := now();
  end if;

  return new;
end;
$$;

revoke execute on function public.check_committee_paper_seat() from public, anon, authenticated;

create trigger committee_paper_seats_check
  before insert or update on public.committee_paper_seats
  for each row
  execute function public.check_committee_paper_seat();


-- -----------------------------------------------------------------------------
-- committee_paper_seats: the lead passes to the longest-standing author
-- -----------------------------------------------------------------------------
-- Rule 4: when the lead leaves, or their seat goes, the author who has
-- written the paper longest leads it. The join to seats passes over a seat
-- deleted in the same statement, such as when a whole committee's seats go,
-- whose row on the paper has not been removed yet.

create or replace function public.hand_on_paper_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.committee_papers as target
  set lead_seat_id = (
    select author.seat_id
    from public.committee_paper_seats as author
    join public.seats as seat on seat.id = author.seat_id
    where author.paper_id = old.paper_id
      and author.role = 'author'
    order by author.added_at, author.seat_id
    limit 1
  )
  where target.id = old.paper_id
    and (target.lead_seat_id is null or target.lead_seat_id = old.seat_id);

  return null;
end;
$$;

revoke execute on function public.hand_on_paper_lead() from public, anon, authenticated;

create trigger committee_paper_seats_hand_on_lead
  after delete on public.committee_paper_seats
  for each row
  execute function public.hand_on_paper_lead();


-- -----------------------------------------------------------------------------
-- committee_paper_sources: a draft is based on introduced working papers
-- -----------------------------------------------------------------------------
-- A draft resolution may say which working papers it grew from, and those are
-- working papers its own committee has seen introduced (section 4). The
-- authors add and remove these rows themselves, under the policies below, so
-- the rule is kept here rather than in a function.

create or replace function public.check_committee_paper_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.committee_papers as draft
    join public.committee_papers as based_on on based_on.committee_id = draft.committee_id
    where draft.id = new.paper_id
      and draft.kind = 'draft_resolution'
      and based_on.id = new.source_paper_id
      and based_on.kind = 'working_paper'
      and based_on.introduced_at is not null
  ) then
    raise exception 'A draft resolution can only be based on working papers introduced in its committee.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke execute on function public.check_committee_paper_source() from public, anon, authenticated;

create trigger committee_paper_sources_check
  before insert or update on public.committee_paper_sources
  for each row
  execute function public.check_committee_paper_source();


-- -----------------------------------------------------------------------------
-- position_paper_drafts: a draft's comments go with it
-- -----------------------------------------------------------------------------
-- A position paper's threads are about its draft, and are read by whoever may
-- work on the seat's paper. When the draft goes, because it was submitted or
-- because the seat changed hands (clear_position_paper_draft_on_seat_change),
-- its threads go too: the submitted paper is reviewed as it is today, and the
-- next delegate in the seat must not read the last one's notes.

create or replace function public.delete_position_paper_threads()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.paper_comment_threads as thread
  where thread.position_paper_seat_id = old.seat_id;

  return null;
end;
$$;

revoke execute on function public.delete_position_paper_threads() from public, anon, authenticated;

create trigger position_paper_drafts_delete_threads
  after delete on public.position_paper_drafts
  for each row
  execute function public.delete_position_paper_threads();


-- =============================================================================
-- Row Level Security
-- =============================================================================
-- Reading is the helpers of section 7: may_read_paper for a paper and
-- everything hung on it, may_read_thread for a comment thread and its
-- comments. Writing is the functions above, except the three plain writes
-- an author makes: saving the text, choosing the working papers a draft is
-- based on, and, for the lead, deleting a paper never submitted.
--
-- A visitor who is not signed in has no business with any of it, so anon
-- loses every grant on the new tables, as it did on position_paper_drafts.


-- -----------------------------------------------------------------------------
-- committee_papers
-- -----------------------------------------------------------------------------
-- No insert policy: a paper is started by start_paper, which makes its first
-- author in the same breath.

alter table public.committee_papers enable row level security;

create policy "Readers can read a paper"
  on public.committee_papers
  for select
  to authenticated
  using (public.may_read_paper(id));

-- The live writer's save. committee_papers_protect_columns limits it to the
-- text and the title, and committee_papers_stamp_save keeps the revision.
create policy "Authors can save a paper they are writing"
  on public.committee_papers
  for update
  to authenticated
  using (status = 'writing' and public.is_paper_author(id))
  with check (status = 'writing' and public.is_paper_author(id));

-- Rule 4. Once submitted a paper has been read by the dais, so from then on
-- it is withdrawn, never deleted. Its seats, sources and threads go with it.
create policy "The lead author can delete a paper never submitted"
  on public.committee_papers
  for delete
  to authenticated
  using (submitted_at is null and public.is_paper_lead(id));

revoke all on public.committee_papers from anon;


-- -----------------------------------------------------------------------------
-- committee_paper_seats
-- -----------------------------------------------------------------------------
-- Whoever reads a paper reads who wrote and signed it. Seats are added and
-- removed by add_paper_author, leave_paper, sign_paper and the rest.

alter table public.committee_paper_seats enable row level security;

create policy "Readers of a paper can read its authors and signatories"
  on public.committee_paper_seats
  for select
  to authenticated
  using (public.may_read_paper(paper_id));

revoke all on public.committee_paper_seats from anon;


-- -----------------------------------------------------------------------------
-- committee_paper_sources
-- -----------------------------------------------------------------------------
-- The authors say which working papers their draft is based on while they
-- write it. committee_paper_sources_check makes sure each is an introduced
-- working paper of the same committee.

alter table public.committee_paper_sources enable row level security;

create policy "Readers of a paper can read what it is based on"
  on public.committee_paper_sources
  for select
  to authenticated
  using (public.may_read_paper(paper_id));

create policy "Authors can say what their paper is based on"
  on public.committee_paper_sources
  for insert
  to authenticated
  with check (public.may_write_paper(paper_id));

create policy "Authors can take a working paper off what their paper is based on"
  on public.committee_paper_sources
  for delete
  to authenticated
  using (public.may_write_paper(paper_id));

revoke all on public.committee_paper_sources from anon;


-- -----------------------------------------------------------------------------
-- committee_paper_versions
-- -----------------------------------------------------------------------------
-- Written by submit_paper and by every amendment written in; never by hand.

alter table public.committee_paper_versions enable row level security;

create policy "Readers of a paper can read its versions"
  on public.committee_paper_versions
  for select
  to authenticated
  using (public.may_read_paper(paper_id));

revoke all on public.committee_paper_versions from anon;


-- -----------------------------------------------------------------------------
-- amendments and amendment_seats
-- -----------------------------------------------------------------------------
-- An amendment is the committee's public argument about an introduced
-- draft, so whoever reads the draft reads its amendments, who proposed them,
-- the sponsors' answers and who supports them.

alter table public.amendments enable row level security;

create policy "Readers of a paper can read its amendments"
  on public.amendments
  for select
  to authenticated
  using (public.may_read_paper(paper_id));

revoke all on public.amendments from anon;

alter table public.amendment_seats enable row level security;

create policy "Readers of a paper can read who answered and supported its amendments"
  on public.amendment_seats
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.amendments as amendment
      where amendment.id = amendment_seats.amendment_id
        and public.may_read_paper(amendment.paper_id)
    )
  );

revoke all on public.amendment_seats from anon;


-- -----------------------------------------------------------------------------
-- paper_comment_threads and paper_comments
-- -----------------------------------------------------------------------------
-- Section 7: threads live here rather than in the Yjs document so that these
-- two policies decide who reads them. Every write is start_thread,
-- reply_to_thread, edit_comment, delete_comment, resolve_thread or
-- reopen_thread.

alter table public.paper_comment_threads enable row level security;

create policy "The people a thread is for can read it"
  on public.paper_comment_threads
  for select
  to authenticated
  using (public.may_read_thread(id));

revoke all on public.paper_comment_threads from anon;

alter table public.paper_comments enable row level security;

create policy "The people a thread is for can read its comments"
  on public.paper_comments
  for select
  to authenticated
  using (public.may_read_thread(thread_id));

revoke all on public.paper_comments from anon;


-- -----------------------------------------------------------------------------
-- The live writing channel
-- -----------------------------------------------------------------------------
-- committee-paper:<paper id>, private and broadcast only, exactly as the
-- position paper's paper:<seat id> channel (20260929120000_live_paper_editing):
-- the authors' editors send one another Yjs updates and awareness on it while
-- they type. Only the authors of a paper being written may join, hear or
-- speak, which may_join_paper_writing_channel asks. Presence and database
-- changes are not used on these channels.

create policy "Authors can hear a paper's writing channel"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and public.may_join_paper_writing_channel((select realtime.topic()))
  );

create policy "Authors can speak on a paper's writing channel"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and public.may_join_paper_writing_channel((select realtime.topic()))
  );


-- -----------------------------------------------------------------------------
-- The realtime publication
-- -----------------------------------------------------------------------------
-- A paper's page hears it change as it happens: a new author or signature,
-- the dais's answer, an amendment moving on, a comment as it is posted
-- (section 7). Realtime applies each table's select policy to every listener,
-- so a paper somebody may not read, and a thread that is not for them, never
-- reach them.
--
-- No replica identity full, for the reason the first publication migration
-- gives. A delete carries only the row's primary key, and Realtime sends it to
-- every listener of the table, since no policy can be asked about a row that
-- is gone: for a seat taken off a paper that is the paper's id and the seat's,
-- and nothing of the paper itself.
--
-- committee_paper_sources, committee_paper_versions and amendment_seats are
-- left out. The sources change only on the authors' own page; a new version
-- comes with a change to its paper and its amendment, which are heard
-- (apply_amendment_to_paper touches the paper's updated_at for that); and an
-- amendment's own row changes, and is heard, when its sponsors' answers or
-- its support move it on.

alter publication supabase_realtime add table
  public.committee_papers,
  public.committee_paper_seats,
  public.amendments,
  public.paper_comment_threads,
  public.paper_comments;


-- =============================================================================
-- The tables that were here before
-- =============================================================================
-- motions, votes, committee_state and documents, and the Chair preset. Every
-- change below adds something, except two: votes.document_id and the
-- documents policy for working papers go, because nothing ever wrote either
-- (section 9, checked 8 October 2026). The columns come first, because the
-- functions, policies and triggers that follow name them.


-- -----------------------------------------------------------------------------
-- motions.paper_id: a motion to introduce a paper names it
-- -----------------------------------------------------------------------------
-- Until now "Introduce working paper 1.1" was typed into the motion's topic.
-- The motion composer now picks an approved paper of the committee, and
-- passing the motion introduces it (rule 8). A typed topic stays possible for
-- a document that is not on the platform.

alter table public.motions
  add column paper_id uuid references public.committee_papers (id) on delete set null,
  add constraint motions_paper_is_introduce_document
    check (paper_id is null or kind = 'introduce_document');

create index motions_paper_id_idx on public.motions (paper_id);

comment on column public.motions.paper_id is
  'The paper a motion to introduce a document introduces. Null for a document typed by name.';

-- The paper is checked when the motion is written down, or when it is changed
-- to another paper: an approved paper of the motion's own committee. A paper
-- withdrawn while its motion is on the floor is refused when the motion
-- passes (introduce_paper), and the chair drops the motion. A deleted paper
-- sets the column to null, which passes.
create or replace function public.check_motion_paper()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.paper_id is null
    or (
      tg_op = 'UPDATE'
      and new.paper_id is not distinct from old.paper_id
      and new.committee_id is not distinct from old.committee_id
    )
  then
    return new;
  end if;

  if not exists (
    select 1
    from public.committee_papers as paper
    where paper.id = new.paper_id
      and paper.committee_id = new.committee_id
      and paper.status = 'approved'
  ) then
    raise exception 'Only an approved paper of this committee can be introduced.' using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke execute on function public.check_motion_paper() from public, anon, authenticated;

create trigger motions_check_paper
  before insert or update of paper_id, committee_id on public.motions
  for each row
  execute function public.check_motion_paper();


-- -----------------------------------------------------------------------------
-- apply_passed_motion: passing a motion to introduce a paper introduces it
-- -----------------------------------------------------------------------------
-- As it was (20261007180000), with one branch more: a motion to introduce a
-- document that names a paper introduces that paper (introduce_paper), at the
-- moment the chair pressed, and puts it on the projector. A motion to
-- introduce a document typed by name is recorded and changes nothing more, as
-- before. It runs as the chair still; introduce_paper asks for the passed
-- motion, which this function has just marked passed.

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

  elsif motion.kind = 'introduce_document' and motion.paper_id is not null then
    -- The room carries on as it was; the paper is introduced and goes on the
    -- projector (rule 8).
    perform public.introduce_paper(motion.paper_id, motion.id, moment);
  end if;

  -- introduce_document without a paper, and other, are recorded and change
  -- nothing more.

  return query select unnest(dropped_ids);
end;
$$;

revoke execute on function public.apply_passed_motion(uuid, integer, integer, timestamptz)
  from public, anon;
grant execute on function public.apply_passed_motion(uuid, integer, integer, timestamptz)
  to authenticated;


-- -----------------------------------------------------------------------------
-- votes.paper_id and votes.amendment_id: a vote on a paper or an amendment
-- -----------------------------------------------------------------------------
-- Until now chairs typed "Draft resolution 1.1" into the subject. A vote
-- opened from the vote form's list now names the draft or the amendment it is
-- on, and closing it settles it (rule 10). A vote is on one thing at most: a
-- motion, a paper, or an amendment, whose draft is reached through it. A
-- typed subject stays possible for anything else (section 6), and
-- votes_check_paper writes one for a vote on a paper, so the record still
-- says what was voted on once the paper is gone.
--
-- document_id goes, with the check that named it. It was waiting for working
-- papers, which arrive as committee papers instead, and nothing wrote it.

alter table public.votes
  drop constraint votes_says_what_it_is_about;

alter table public.votes
  drop column document_id;

alter table public.votes
  add column paper_id uuid references public.committee_papers (id) on delete set null,
  add column amendment_id uuid references public.amendments (id) on delete set null,
  add constraint votes_says_what_it_is_about check (
    subject is not null or motion_id is not null or paper_id is not null or amendment_id is not null
  ),
  add constraint votes_on_one_thing check (num_nonnulls(motion_id, paper_id, amendment_id) <= 1);

create index votes_paper_id_idx on public.votes (paper_id);
create index votes_amendment_id_idx on public.votes (amendment_id);

comment on column public.votes.paper_id is
  'The draft resolution or committee directive voted on. Closing the vote passes or fails it.';
comment on column public.votes.amendment_id is
  'The amendment voted on. Closing the vote passes it, which writes it in, or fails it.';


-- What a vote on a paper or an amendment may be on (section 6, the vote
-- view). It is a substantive vote of the paper's own committee. It is opened
-- on an introduced draft resolution or committee directive, or on one of its
-- amendments that the dais has approved, an amendment to an amendment before
-- the amendment it changes, and never while another vote on the same draft is
-- open: the committee would be voting on a text that could change under it.
-- The database does not ask whether debate was closed first, because the dais
-- may vote on an amendment at any time and the procedure decides the rest.
--
-- The draft is locked, as every function that changes it locks it first, so
-- two votes cannot open on it at once and nothing changes it while a vote
-- opens. On a change to a vote the kind and the committee are checked again;
-- protect_vote_ties keeps a person from moving a vote to another paper.
create or replace function public.check_vote_paper()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  paper public.committee_papers;
  amendment public.amendments;
begin
  if new.paper_id is null and new.amendment_id is null then
    return new;
  end if;

  if new.kind <> 'substantive' then
    raise exception 'A vote on a paper or an amendment is substantive.' using errcode = '22023';
  end if;

  if new.amendment_id is not null then
    select candidate.*
    into paper
    from public.committee_papers as candidate
    where candidate.id = (
      select amended.paper_id
      from public.amendments as amended
      where amended.id = new.amendment_id
    )
    for update;

    select candidate.*
    into amendment
    from public.amendments as candidate
    where candidate.id = new.amendment_id
    for update;
  else
    select candidate.*
    into paper
    from public.committee_papers as candidate
    where candidate.id = new.paper_id
    for update;
  end if;

  if paper.id is null or paper.committee_id <> new.committee_id then
    raise exception 'That paper is not in this committee.' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    return new;
  end if;

  if paper.kind not in ('draft_resolution', 'committee_directive') or paper.status <> 'introduced' then
    raise exception 'Only an introduced draft resolution or committee directive is voted on.'
      using errcode = '22023';
  end if;

  if amendment.id is not null then
    if amendment.status <> 'approved' then
      raise exception 'Only an amendment the dais has approved is voted on.' using errcode = '22023';
    end if;

    if amendment.parent_amendment_id is not null and not exists (
      select 1
      from public.amendments as parent
      where parent.id = amendment.parent_amendment_id
        and parent.status = 'approved'
    ) then
      raise exception 'Approve the amendment it changes first.' using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.amendments as child
      where child.parent_amendment_id = amendment.id
        and child.status = 'approved'
    ) then
      raise exception 'Vote on the amendment to this amendment first.' using errcode = '22023';
    end if;

    -- One that has found its support is decided first, so it is not lost
    -- without a word by the vote on the amendment it changes.
    if exists (
      select 1
      from public.amendments as child
      where child.parent_amendment_id = amendment.id
        and child.status = 'with_the_dais'
    ) then
      raise exception 'Decide the amendment to this amendment first.' using errcode = '22023';
    end if;
  end if;

  if exists (
    select 1
    from public.votes as vote
    where vote.status = 'open'
      and (
        vote.paper_id = paper.id
        or vote.amendment_id in (
          select sibling.id
          from public.amendments as sibling
          where sibling.paper_id = paper.id
        )
      )
  ) then
    raise exception 'Close the open vote on this draft first.' using errcode = '22023';
  end if;

  -- What the existing vote screens and the record show, in the words of
  -- notify_amendment_proposer: "Draft resolution 1.2", "Amendment 3 to Draft
  -- resolution 1.2".
  new.subject := coalesce(
    new.subject,
    case
      when amendment.id is not null then 'Amendment ' || amendment.sequence || ' to '
      else ''
    end
      || public.paper_label(paper.kind, paper.topic_number, paper.sequence, paper.title)
  );

  return new;
end;
$$;

revoke execute on function public.check_vote_paper() from public, anon, authenticated;

create trigger votes_check_paper
  before insert or update of paper_id, amendment_id, kind, committee_id on public.votes
  for each row
  execute function public.check_vote_paper();


-- A vote stays on what it was opened on, and once closed it is the record of
-- what the committee decided (rule 10): closing it settled its paper or
-- amendment, so a person cannot change or delete it afterwards. An open vote
-- is still cancelled (deleted) as before, since it settled nothing.
--
-- Not security definer, so that current_user is the person's role. A deleted
-- paper or amendment sets these columns to null as the table's owner, and a
-- deleted committee takes its votes the same way; both pass.
create or replace function public.protect_vote_ties()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if old.status = 'closed' and (old.paper_id is not null or old.amendment_id is not null) then
      raise exception 'A closed vote on a paper or an amendment stays as it closed.' using errcode = '42501';
    end if;

    if tg_op = 'UPDATE'
      and (new.paper_id, new.amendment_id) is distinct from (old.paper_id, old.amendment_id)
    then
      raise exception 'A vote stays on the paper or amendment it was opened on.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_vote_ties() from public, anon, authenticated;

create trigger votes_protect_ties
  before update or delete on public.votes
  for each row
  execute function public.protect_vote_ties();


-- Closing a vote settles what it was on (rule 10), whoever closes it and
-- however: closeVote's update is the only write the room makes. Only the
-- first close counts, and only while the amendment still waits for its vote
-- or the draft is still on the floor.
--
--   * A passed amendment is written in as the draft's next version
--     (apply_amendment_to_paper), and the waiting amendments whose clause it
--     struck lapse. A passed amendment to an amendment rewrites its parent's
--     words instead, and the parent goes on to its own vote with them.
--   * A failed amendment ends, and the amendments to it lapse.
--   * A passed draft becomes a resolution, 'passed'; a failed one 'failed'.
--     Either way its waiting amendments lapse, since there is nothing left to
--     amend.
--
-- The proposer of an amendment is told how its vote went. A draft's authors
-- were in the room when theirs was taken, so no notification is made for it.
create or replace function public.settle_vote_paper()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  paper public.committee_papers;
  amendment public.amendments;
begin
  if new.amendment_id is not null then
    select candidate.*
    into paper
    from public.committee_papers as candidate
    where candidate.id = (
      select amended.paper_id
      from public.amendments as amended
      where amended.id = new.amendment_id
    )
    for update;

    select candidate.*
    into amendment
    from public.amendments as candidate
    where candidate.id = new.amendment_id
    for update;

    if amendment.status is distinct from 'approved' or paper.status is distinct from 'introduced' then
      return null;
    end if;

    if new.passed and amendment.parent_amendment_id is null then
      perform public.apply_amendment_to_paper(amendment.id, 'passed');
    elsif new.passed then
      update public.amendments as parent
      set text_markdown = amendment.text_markdown
      where parent.id = amendment.parent_amendment_id;

      update public.amendments as target
      set status = 'passed',
          queue_position = null,
          decided_at = now()
      where target.id = amendment.id;
    else
      update public.amendments as target
      set status = 'failed',
          queue_position = null,
          decided_at = now()
      where target.id = amendment.id;

      perform public.lapse_pending_children(amendment.id);
    end if;

    perform public.notify_amendment_proposer(
      amendment.id,
      case when new.passed then 'passed' else 'failed' end
    );
  else
    select candidate.*
    into paper
    from public.committee_papers as candidate
    where candidate.id = new.paper_id
    for update;

    if paper.status is distinct from 'introduced' then
      return null;
    end if;

    update public.committee_papers as target
    set status = case when new.passed then 'passed' else 'failed' end::public.paper_status,
        decided_at = now(),
        decided_by = (select auth.uid())
    where target.id = paper.id;

    update public.amendments as pending
    set status = 'lapsed',
        queue_position = null,
        decided_at = now()
    where pending.paper_id = paper.id
      and pending.status in ('awaiting_sponsors', 'collecting_support', 'with_the_dais', 'approved');
  end if;

  return null;
end;
$$;

revoke execute on function public.settle_vote_paper() from public, anon, authenticated;

create trigger votes_settle_paper
  after update of status on public.votes
  for each row
  when (
    old.status = 'open'
    and new.status = 'closed'
    and new.passed is not null
    and (new.paper_id is not null or new.amendment_id is not null)
  )
  execute function public.settle_vote_paper();


-- -----------------------------------------------------------------------------
-- committee_state: the paper on the projector, and the crisis update
-- -----------------------------------------------------------------------------
-- displayed_paper_id is the paper the dais put on screen ("Show on screen"),
-- which introducing a paper sets and withdrawing it clears. crisis_update is
-- the one line from the backroom shown at the top of a crisis committee's
-- pages and on its projector until the next replaces it (send_crisis_update).
-- Both live on the room's state because every screen of the room already
-- hears it change.

alter table public.committee_state
  add column displayed_paper_id uuid references public.committee_papers (id) on delete set null,
  add column crisis_update text,
  add column crisis_update_at timestamptz,
  add constraint committee_state_crisis_update_is_written check (
    crisis_update is null or (crisis_update ~ '[^[:space:]]' and char_length(crisis_update) <= 1000)
  ),
  add constraint committee_state_crisis_update_has_time
    check ((crisis_update is null) = (crisis_update_at is null));

comment on column public.committee_state.displayed_paper_id is
  'The paper on the projector. Only a paper the committee has seen introduced.';
comment on column public.committee_state.crisis_update is
  'The crisis staff''s latest update to a crisis committee. Null for none.';

-- The chair's own update of the room, as it was (20261007180000), and the
-- projector shows only a paper of this committee that has been introduced:
-- before that it is private to its authors and the dais (rule 3, rule 8).
alter policy "A chair can run the room"
  on public.committee_state
  with check (
    public.has_committee_permission(committee_id, 'run_room')
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
    and (
      displayed_paper_id is null
      or exists (
        select 1
        from public.committee_papers as paper
        where paper.id = committee_state.displayed_paper_id
          and paper.committee_id = committee_state.committee_id
          and paper.introduced_at is not null
      )
    )
  );

-- The chair's update can change every column of the room, and the crisis
-- update belongs to the crisis staff, who need not run the room. So a
-- person's own update leaves it alone, and send_crisis_update, which runs as
-- the database's own user, writes it.
create or replace function public.protect_committee_state_crisis_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
    and (new.crisis_update, new.crisis_update_at) is distinct from (old.crisis_update, old.crisis_update_at)
  then
    raise exception 'Only the crisis staff send crisis updates.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_committee_state_crisis_update() from public, anon, authenticated;

create trigger committee_state_protect_crisis_update
  before update of crisis_update, crisis_update_at on public.committee_state
  for each row
  execute function public.protect_committee_state_crisis_update();


-- -----------------------------------------------------------------------------
-- documents: working papers and draft resolutions are committee papers now
-- -----------------------------------------------------------------------------
-- The policy was written for rows nothing could insert: no insert policy
-- allowed the two kinds, so none exist. Postgres cannot take a value out of
-- an enum, so document_kind keeps both, and the check keeps any row from
-- using them.

drop policy "Delegates and staff can read working papers" on public.documents;

alter table public.documents
  add constraint documents_kind_is_not_a_committee_paper
    check (kind not in ('working_paper', 'draft_resolution'));


-- -----------------------------------------------------------------------------
-- The Chair preset holds answer_directives
-- -----------------------------------------------------------------------------
-- Section 8: so that a crisis committee run by its chairs works on the day. A
-- conference with a backroom team makes a Crisis staff role with it alone.
-- The function is as it was (20261007120000) but for that, and
-- $lib/permissions.ts repeats it; a test keeps the two copies the same.

create or replace function public.preset_conference_roles()
returns table (
  name text,
  role_position integer,
  scope public.role_scope,
  permissions public.permission[],
  is_public boolean
)
language sql
immutable
set search_path = ''
as $$
  select preset.name, preset.role_position, preset.scope, preset.permissions, preset.is_public
  from (
    values
      ('Organiser', 0, 'conference'::public.role_scope,
        array['administrator']::public.permission[], true),
      ('Chair', 1, 'committees'::public.role_scope,
        array[
          'run_room', 'review_papers', 'write_chair_notes', 'propose_awards',
          'send_announcements', 'manage_committees', 'read_participants',
          'answer_directives'
        ]::public.permission[], true),
      ('Volunteer', 2, 'conference'::public.role_scope,
        array[]::public.permission[], false)
  ) as preset (name, role_position, scope, permissions, is_public)
$$;

revoke execute on function public.preset_conference_roles() from public, anon;
grant execute on function public.preset_conference_roles() to authenticated;

-- The conferences that exist today have their Chair role already. Only a role
-- still called Chair and scoped to committees gains the permission: one an
-- organiser has renamed or rescoped is theirs now. It matters only to a crisis
-- committee, and every committee is a standard one until somebody says
-- otherwise, so nobody can do anything today they could not do yesterday.
update public.conference_roles as role
set permissions = role.permissions || 'answer_directives'::public.permission
where role.name = 'Chair'
  and role.scope = 'committees'
  and not ('answer_directives' = any (role.permissions));


-- Never edit this file once it has been applied anywhere. Add a new migration.
