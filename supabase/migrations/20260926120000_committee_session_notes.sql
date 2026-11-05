-- =============================================================================
-- committee_session_notes (T130)
-- =============================================================================
-- The chair's running notes on one committee session: the "Chair Notes" pad
-- under the current speaker on the Room page, from the session mockup. One
-- pad per session, shared by every chair of the committee, which is why it is
-- one row that is saved over rather than a list of notes like chair_notes.
--
-- Private in exactly the way chair_notes is: is_committee_chair is the whole
-- rule, and it is true for a chair of the committee and for anybody who can
-- manage its conference. A delegate, a volunteer and a stranger read nothing.
-- The table is not added to the realtime publication, for the same reason
-- chair_notes is not: a delegate's screen must never be told it changed.
--
-- `body` is formatted text from the chair's browser. The page cleans it on the
-- server (src/lib/server/session-notes-html.ts) before saving it and again
-- before showing it, so the database only ever has to hold it.
--
-- `revision` is how two chairs writing at once are kept from wiping each
-- other out. A save names the revision it started from and only changes the
-- row while that is still the stored one; a save that finds a newer revision
-- is told who changed the notes instead (T130 decision in open-questions.md).

create table public.committee_session_notes (
  session_id uuid primary key references public.committee_sessions (id) on delete cascade,
  committee_id uuid not null references public.committees (id) on delete cascade,
  body text not null default '',
  revision integer not null default 1,
  -- Null once the account that saved last is deleted: the notes belong to the
  -- committee and stay, only the name beside them goes.
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint committee_session_notes_body_length check (char_length(body) <= 100000),
  constraint committee_session_notes_revision_positive check (revision >= 1)
);

comment on table public.committee_session_notes is
  'A committee session''s running notes. Chairs and organisers only; never shown to delegates.';

create index committee_session_notes_committee_id_idx
  on public.committee_session_notes (committee_id);
create index committee_session_notes_updated_by_idx
  on public.committee_session_notes (updated_by);


-- -----------------------------------------------------------------------------
-- stamp_committee_session_notes
-- -----------------------------------------------------------------------------
-- Every save records who made it and when, and moves the revision on by one,
-- so a page cannot put somebody else's name on the notes or reuse a revision
-- another chair's save already took. The notes also stay with their session:
-- moving them to another session or committee is refused, because a pad is
-- the record of one sitting.

create or replace function public.stamp_committee_session_notes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.session_id <> old.session_id or new.committee_id <> old.committee_id then
      raise exception 'Session notes stay with their session.'
        using errcode = '42501';
    end if;

    new.revision = old.revision + 1;
  else
    new.revision = 1;
  end if;

  new.updated_by = auth.uid();
  new.updated_at = now();

  return new;
end;
$$;

-- Only the trigger calls it, so nobody may call it on its own.
revoke execute on function public.stamp_committee_session_notes() from public, anon, authenticated;

create trigger committee_session_notes_stamp
  before insert or update on public.committee_session_notes
  for each row
  execute function public.stamp_committee_session_notes();


-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
-- A chair of the committee (or an organiser) reads and writes the pad of any
-- session of that committee, running or ended: the notes are still there, and
-- still editable, after the session ends. The second half of the write rule is
-- the one every committee room table has: the session named must belong to
-- the same committee as the row. There is no delete policy; the pad goes when
-- its session or committee does.

alter table public.committee_session_notes enable row level security;

create policy "Chairs and organisers can read their committee's session notes"
  on public.committee_session_notes
  for select
  to authenticated
  using (public.is_committee_chair(committee_id));

create policy "A chair can start the notes of a session of their own committee"
  on public.committee_session_notes
  for insert
  to authenticated
  with check (
    public.is_committee_chair(committee_id)
    and exists (
      select 1
      from public.committee_sessions as session
      where session.id = committee_session_notes.session_id
        and session.committee_id = committee_session_notes.committee_id
    )
  );

create policy "A chair can save the notes of a session of their own committee"
  on public.committee_session_notes
  for update
  to authenticated
  using (public.is_committee_chair(committee_id))
  with check (
    public.is_committee_chair(committee_id)
    and exists (
      select 1
      from public.committee_sessions as session
      where session.id = committee_session_notes.session_id
        and session.committee_id = committee_session_notes.committee_id
    )
  );
