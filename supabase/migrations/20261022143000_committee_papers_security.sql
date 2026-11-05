-- =============================================================================
-- Committee papers: the security review's findings M12, L17, L53, L54 and L55
-- =============================================================================
-- docs/security-review-2026-10-10.md, read against 20261008120100_committee_papers:
--
--   * M12. submit_paper froze the clauses the page sent as version 1 without
--     ever comparing them with the paper's Markdown, which is what the dais
--     approved and the signatories signed. The database now reads the clauses
--     out of the Markdown itself, with its own copy of $lib/paper-clauses.ts,
--     and refuses clauses a page sends that are not that text.
--   * L17. document_state, the live Yjs document with every open suggestion,
--     every suggester's id and everything ever typed and deleted, was a column
--     of committee_papers and so read by everybody who may read the paper:
--     every delegate once it is open for signatures, the whole conference
--     team once introduced. It moves to committee_paper_documents, read by
--     the paper's authors, and by the dais once the paper is with it, whose
--     review anchors its notes in that document. The table is not in the
--     realtime publication.
--   * L53. A delegate could start any number of papers and add any delegate
--     of the committee to each, a notification with chosen words every time.
--     A seat now has at most five papers it started still being written, and
--     "Add an author" tells one seat about another at most three times a day,
--     however often the papers are deleted and started again, and tells at
--     most thirty seats a day for one adder. Past either, the seat is still
--     added, without being told.
--   * L54. A delegate could propose any number of amendments, each a round of
--     notifications and, under THIMUN settings, a row in the dais's queue,
--     and start any number of comment threads, each one telling every author.
--     A seat now has at most ten amendments waiting on one draft and proposes
--     at most twenty to it in a day, withdrawn ones included. A person has at
--     most fifty open threads on one paper, and tells its authors of at most
--     twenty new ones a day, however many are deleted; past that the thread
--     is still started, without telling.
--   * L55. Realtime decides who may hear a channel when the browser joins it
--     and not again until the token is refreshed, so a writer who lost access
--     stayed on the writing channel. The channel's name now carries the
--     paper's live_epoch, which moves on whenever the authors change, so the
--     writers still on the paper move to a new channel and the one who left
--     is alone on the old one, and refused when they next join. A seat that
--     changes hands while the dais has the paper moves it on too, so the
--     newcomer does not write on the old holder's channel once it is returned.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- =============================================================================
-- M12: the clauses of a paper, read by the database itself
-- =============================================================================
-- These are the database's copy of preambulatoryClausesFromMarkdown and
-- operativeClausesFromMarkdown in $lib/paper-clauses.ts, step for step, so a
-- version frozen here is the text the page showed. A database test holds the
-- two to the same answers over a corpus of awkward texts. The functions are
-- immutable: the same text always gives the same clauses.
--
-- The Markdown is split into lines as the page does, each line is blank, the
-- start of a list item ("1.", "b)", "iv.", a bullet) or text, and the words of
-- a line are what is left once the space round it, and a backslash that ends
-- it (a Markdown line break), are gone. "Space" here is what a browser's
-- String.prototype.trim removes, not what Postgres calls space, so a
-- no-break space pasted at the end of a clause reads the same on both sides.
--
-- Nobody calls these but submit_paper, which runs as their owner, so none is
-- granted to anon or authenticated: the API does not serve them, and a
-- signed-in user cannot make the database split a text of any size on
-- request. Each runs in time that grows with the length of the text, not its
-- square, so the longest text a paper may hold (100,000 characters a part)
-- splits in well under a second. The database tests call them through the
-- service role.


-- paper_clause_whitespace: the characters JavaScript's trim takes off.
create or replace function public.paper_clause_whitespace()
returns text
language sql
immutable
set search_path = ''
as $$
  select E'\t\n\x0B\f\r                  　﻿';
$$;

revoke execute on function public.paper_clause_whitespace() from public, anon, authenticated;


-- paper_clause_words: a line's words without the space round them and a
-- trailing Markdown line break, as wordsOf reads them.
create or replace function public.paper_clause_words(line text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(
    regexp_replace(btrim(paper_clause_words.line, public.paper_clause_whitespace()), '\\$', ''),
    public.paper_clause_whitespace()
  );
$$;

revoke execute on function public.paper_clause_words(text) from public, anon, authenticated;


-- paper_preamble_clauses: one clause per paragraph, p1, p2 and so on. A line
-- that starts like a list item starts a clause and loses its marker, and a
-- paragraph with no words is no clause.
create or replace function public.paper_preamble_clauses(markdown text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  -- The start of a list item, the pattern the page reads: a number, one or
  -- two letters or a roman numeral then a full stop or a bracket, or a
  -- bullet, then the words after a space or nothing. The E'' string puts the
  -- tab, the carriage return and the two Unicode line separators into the
  -- pattern as the characters themselves, as the page's "." leaves them out.
  list_item_line constant text :=
    E'^([ \t]*)(?:(?:[0-9]+|[ivxlcdm]+|[a-z]{1,2})[.)]|[-*+])(?:[ \t]+([^\r  ]*))?$';
  line text;
  item text[];
  words text;
  paragraphs text[] := '{}';
  is_in_paragraph boolean := false;
begin
  foreach line in array regexp_split_to_array(coalesce(markdown, ''), E'\r?\n') loop
    if btrim(line, public.paper_clause_whitespace()) = '' then
      is_in_paragraph := false;
      continue;
    end if;

    item := regexp_match(line, list_item_line, 'i');
    words := public.paper_clause_words(
      case when item is null then line else coalesce(item[2], '') end
    );

    if item is not null or not is_in_paragraph then
      paragraphs := paragraphs || words;
      is_in_paragraph := true;
    else
      -- The next line of the same paragraph joins it with a space.
      paragraphs[cardinality(paragraphs)] := concat_ws(
        ' ', nullif(paragraphs[cardinality(paragraphs)], ''), nullif(words, '')
      );
    end if;
  end loop;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object('id', 'p' || numbered.position, 'markdown', numbered.words)
        order by numbered.position
      )
      from (
        select written.words, row_number() over (order by written.ordinality) as position
        from unnest(paragraphs) with ordinality as written (words, ordinality)
        where written.words <> ''
      ) as numbered
    ),
    '[]'::jsonb
  );
end;
$$;

revoke execute on function public.paper_preamble_clauses(text) from public, anon, authenticated;


-- paper_list_items_from_markdown: the list items in the order written, each
-- { "indent": how far in it starts, "text": its words }, as
-- listItemsFromMarkdown reads them. Text straight after an item carries it on,
-- as does an indented paragraph after a blank line; any other text is an item
-- of its own.
--
-- The lines are kept in arrays, which grow in place, and an item's words are
-- joined once at the end: building the answer with jsonb_set or a growing
-- string copies everything so far on every line, and a text of the longest
-- size allowed then took minutes.
create or replace function public.paper_list_items_from_markdown(markdown text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  list_item_line constant text :=
    E'^([ \t]*)(?:(?:[0-9]+|[ivxlcdm]+|[a-z]{1,2})[.)]|[-*+])(?:[ \t]+([^\r  ]*))?$';
  line text;
  item text[];
  indent integer;
  is_text boolean;
  -- One entry per item: how far in it starts.
  item_indents integer[] := '{}';
  -- One entry per line that is not blank: the item it belongs to, and its words.
  line_items integer[] := '{}';
  line_words text[] := '{}';
  is_after_blank_line boolean := false;
begin
  foreach line in array regexp_split_to_array(coalesce(markdown, ''), E'\r?\n') loop
    if btrim(line, public.paper_clause_whitespace()) = '' then
      is_after_blank_line := true;
      continue;
    end if;

    item := regexp_match(line, list_item_line, 'i');

    if item is null then
      -- A tab counts as four spaces, as it does on the page.
      indent := length(replace(substring(line from E'^[ \t]*'), E'\t', '    '));
      is_text := true;
    else
      indent := length(replace(item[1], E'\t', '    '));
      is_text := false;
    end if;

    if not (cardinality(item_indents) > 0 and is_text and (not is_after_blank_line or indent > 0)) then
      item_indents := array_append(item_indents, indent);
    end if;

    line_items := array_append(line_items, cardinality(item_indents));
    line_words := array_append(
      line_words,
      public.paper_clause_words(case when item is null then line else coalesce(item[2], '') end)
    );
    is_after_blank_line := false;
  end loop;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object('indent', item_indents[joined.item_number], 'text', joined.words)
        order by joined.item_number
      )
      from (
        -- The lines of one item join with a space, leaving out lines with no
        -- words, as joinLines does.
        select
          written.item_number,
          coalesce(string_agg(nullif(written.words, ''), ' ' order by written.position), '') as words
        from unnest(line_items, line_words) with ordinality as written (item_number, words, position)
        group by written.item_number
      ) as joined
    ),
    '[]'::jsonb
  );
end;
$$;

revoke execute on function public.paper_list_items_from_markdown(text) from public, anon, authenticated;


-- paper_nest_list_items: list items as clauses and sub-clauses by how far in
-- they start, as nestListItems does. The items that start least far in are
-- clauses at this level; an item further in is a sub-clause of the clause
-- before it. Items further in than the third level stay at the third.
--
-- Each item that starts a clause is counted, and the running count says which
-- clause every item belongs to, so the groups come out of one query rather
-- than by copying the answer for every item.
create or replace function public.paper_nest_list_items(items jsonb, level integer)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  deepest_level constant integer := 3;
begin
  return coalesce(
    (
      with listed as (
        select element.value, element.ordinality as position, (element.value ->> 'indent')::integer as indent
        from jsonb_array_elements(items) with ordinality as element (value, ordinality)
      ),
      marked as (
        select
          listed.value,
          listed.position,
          -- What nestListItems calls not isSubClause.
          listed.position = 1
            or listed.indent <= (select min(every_item.indent) from listed as every_item)
            or paper_nest_list_items.level >= deepest_level as starts_clause
        from listed
      ),
      grouped as (
        select
          marked.*,
          sum(case when marked.starts_clause then 1 else 0 end) over (order by marked.position) as clause_number
        from marked
      ),
      clause as (
        select
          grouped.clause_number,
          max(grouped.value ->> 'text') filter (where grouped.starts_clause) as text,
          coalesce(
            jsonb_agg(grouped.value order by grouped.position) filter (where not grouped.starts_clause),
            '[]'::jsonb
          ) as below
        from grouped
        group by grouped.clause_number
      )
      select jsonb_agg(
        jsonb_build_object(
          'markdown', clause.text,
          'children', case
            when clause.below = '[]'::jsonb then '[]'::jsonb
            else public.paper_nest_list_items(clause.below, paper_nest_list_items.level + 1)
          end
        )
        order by clause.clause_number
      )
      from clause
    ),
    '[]'::jsonb
  );
end;
$$;

revoke execute on function public.paper_nest_list_items(jsonb, integer) from public, anon, authenticated;


-- paper_clauses_without_empty: leaves out the clauses with no words, putting
-- their sub-clauses in their place, as withoutEmptyClauses does. One query,
-- in order, rather than appending to the answer clause by clause.
create or replace function public.paper_clauses_without_empty(clauses jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  return coalesce(
    (
      with cleaned as (
        select
          element.ordinality as position,
          element.value ->> 'markdown' as markdown,
          case
            when coalesce(jsonb_array_length(element.value -> 'children'), 0) = 0 then '[]'::jsonb
            else public.paper_clauses_without_empty(element.value -> 'children')
          end as children
        from jsonb_array_elements(clauses) with ordinality as element (value, ordinality)
      )
      select jsonb_agg(kept.clause order by kept.position, kept.child_position)
      from (
        select
          cleaned.position,
          0::bigint as child_position,
          jsonb_build_object('markdown', cleaned.markdown, 'children', cleaned.children) as clause
        from cleaned
        where cleaned.markdown is distinct from ''
        union all
        select cleaned.position, child.ordinality, child.value
        from cleaned
        cross join lateral jsonb_array_elements(cleaned.children) with ordinality as child (value, ordinality)
        where cleaned.markdown = ''
      ) as kept
    ),
    '[]'::jsonb
  );
end;
$$;

revoke execute on function public.paper_clauses_without_empty(jsonb) from public, anon, authenticated;


-- paper_position_letters: letters for a position the way a spreadsheet names
-- its columns, as positionLetters does: 1 is a, 26 is z, 27 is aa.
create or replace function public.paper_position_letters(place integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  letters text := '';
  remaining integer := place;
begin
  while remaining > 0 loop
    letters := chr(97 + (remaining - 1) % 26) || letters;
    remaining := (remaining - 1) / 26;
  end loop;

  return letters;
end;
$$;

revoke execute on function public.paper_position_letters(integer) from public, anon, authenticated;


-- paper_clauses_with_ids: o1, o2 at the top; the parent's id and a letter a
-- level down (o1a, o1b); the parent's id and a number below that (o1a1), as
-- withIds does.
create or replace function public.paper_clauses_with_ids(clauses jsonb, parent_id text, level integer)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', named.id,
          'markdown', named.value ->> 'markdown',
          'children', case
            when coalesce(jsonb_array_length(named.value -> 'children'), 0) = 0 then '[]'::jsonb
            else public.paper_clauses_with_ids(named.value -> 'children', named.id, level + 1)
          end
        )
        order by named.ordinality
      )
      from (
        select
          element.value,
          element.ordinality,
          parent_id || case
            when level = 2 then public.paper_position_letters(element.ordinality::integer)
            else element.ordinality::text
          end as id
        from jsonb_array_elements(clauses) with ordinality as element (value, ordinality)
      ) as named
    ),
    '[]'::jsonb
  );
end;
$$;

revoke execute on function public.paper_clauses_with_ids(jsonb, text, integer) from public, anon, authenticated;


-- paper_operative_clauses: the operative clauses with their sub-clauses and
-- ids, from the numbered list, as operativeClausesFromMarkdown reads them.
create or replace function public.paper_operative_clauses(markdown text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select public.paper_clauses_with_ids(
    public.paper_clauses_without_empty(
      public.paper_nest_list_items(public.paper_list_items_from_markdown(markdown), 1)
    ),
    'o',
    1
  );
$$;

revoke execute on function public.paper_operative_clauses(text) from public, anon, authenticated;


-- paper_clauses_from_markdown: the text of a paper being submitted as
-- clauses with ids, as clauseContentFromMarkdown gives them. A committee
-- directive has no preamble, so its preamble_markdown is null and its
-- clauses are [].
create or replace function public.paper_clauses_from_markdown(
  preamble_markdown text,
  operative_markdown text
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'preamble', public.paper_preamble_clauses(coalesce(paper_clauses_from_markdown.preamble_markdown, '')),
    'operative', public.paper_operative_clauses(coalesce(paper_clauses_from_markdown.operative_markdown, ''))
  );
$$;

revoke execute on function public.paper_clauses_from_markdown(text, text) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- submit_paper: freezes the clauses of the paper's own text
-- -----------------------------------------------------------------------------
-- As in 20261008120100, with one change: for a draft resolution or a
-- committee directive the version is paper_clauses_from_markdown of the
-- stored text, never the content the page sent. The page still sends what it
-- showed the author, and if that is not the same split of the same text the
-- page is out of step with the paper and the submission is refused (22023)
-- rather than freezing words nobody approved. A page that sends nothing is
-- answered with the clauses of the text as stored.

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
    -- The clauses are read out of the paper's own text (M12). The page's
    -- copy, when it sends one, has to be the same, or it read another text.
    frozen_content := public.paper_clauses_from_markdown(
      paper.preamble_markdown, paper.operative_markdown
    );

    if submit_paper.content is not null and submit_paper.content is distinct from frozen_content then
      raise exception 'The clauses sent are not the paper''s text. Open the paper again and submit it.'
        using errcode = '22023';
    end if;

    if not public.is_valid_paper_content(paper.kind, frozen_content) then
      raise exception 'The text could not be turned into clauses.' using errcode = '22023';
    end if;

    if jsonb_array_length(frozen_content -> 'operative') = 0 then
      raise exception 'Write at least one operative clause before submitting.' using errcode = '22023';
    end if;
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


-- =============================================================================
-- L17: the live document in a table of its own
-- =============================================================================
-- committee_paper_documents holds what committee_papers.document_state held:
-- the paper as a Yjs document while it is written, merged on every save and
-- kept as it was submitted. One row per paper, made by the first live save
-- and gone with the paper.
--
-- Who reads it: the paper's authors, who type in it, and the dais once the
-- paper has been sent to it and is no longer being written, because the
-- dais's review opens the document to anchor its notes in the very words
-- ($lib/server/chair-resolutions.ts). While the authors fix a returned paper
-- the dais reads the paper (may_read_paper) but not the document again.
-- Nobody writes it but save_committee_paper_text below.

create table public.committee_paper_documents (
  paper_id uuid primary key references public.committee_papers (id) on delete cascade,
  document_state bytea not null,
  updated_at timestamptz not null default now(),

  -- The same limit as a position paper's draft: a save stays well inside
  -- what one request may carry.
  constraint committee_paper_documents_state_size
    check (octet_length(document_state) <= 1000000)
);

comment on table public.committee_paper_documents is
  'The live Yjs document of a committee paper while it is written, kept as it was submitted. Read by its authors and the dais.';
comment on column public.committee_paper_documents.document_state is
  'The paper as a Yjs document, merged on every save; the Markdown columns of committee_papers are written from it.';

insert into public.committee_paper_documents (paper_id, document_state, updated_at)
select paper.id, paper.document_state, paper.updated_at
from public.committee_papers as paper
where paper.document_state is not null;

alter table public.committee_papers drop column document_state;

alter table public.committee_paper_documents enable row level security;

create policy "Authors can read the live document of their paper"
  on public.committee_paper_documents
  for select
  to authenticated
  using (public.is_paper_author(paper_id));

create policy "The dais can read the document of a paper sent to it"
  on public.committee_paper_documents
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.committee_papers as paper
      where paper.id = committee_paper_documents.paper_id
        and paper.kind in ('working_paper', 'draft_resolution', 'committee_directive')
        and paper.status <> 'writing'
        and paper.submitted_at is not null
        and public.has_committee_permission(paper.committee_id, 'run_room')
    )
  );

-- Reads go through the policies above and writes through
-- save_committee_paper_text alone, so a browser holds the grant to read and
-- nothing else: a write policy added by mistake later still writes nothing.
revoke all on public.committee_paper_documents from anon, authenticated;
grant select on public.committee_paper_documents to authenticated;


-- -----------------------------------------------------------------------------
-- committee_papers: what a save from the browser may change
-- -----------------------------------------------------------------------------
-- As in 20261008120100, without document_state, which is no longer a column
-- of the paper. live_epoch is not in the list either: only the triggers
-- below move it on.

create or replace function public.protect_committee_papers_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- What an author's save may change. committee_papers_stamp_save sets the
  -- last three whatever the browser sends.
  saved_columns constant text[] := array[
    'body_markdown', 'preamble_markdown', 'operative_markdown', 'title',
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


-- -----------------------------------------------------------------------------
-- committee_papers: the revision, and who saved last
-- -----------------------------------------------------------------------------
-- As in 20261008120100, with two changes. The document is no longer a column
-- here, so a change to it alone cannot move the revision on from this
-- trigger: save_committee_paper_text, which writes the document, sets the
-- revision itself, and a revision a function sets is now kept. A browser's
-- own save, of the title or of plain Markdown, still moves it on only when
-- the text or the title changed, and still cannot set it.

create or replace function public.stamp_committee_paper_save()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  is_text_changed boolean :=
    new.body_markdown is distinct from old.body_markdown
    or new.preamble_markdown is distinct from old.preamble_markdown
    or new.operative_markdown is distinct from old.operative_markdown
    or new.title is distinct from old.title;
begin
  if current_user in ('anon', 'authenticated') then
    new.revision := old.revision + case when is_text_changed then 1 else 0 end;
    new.updated_by := auth.uid();
    new.updated_at := now();
  elsif is_text_changed and new.revision = old.revision then
    new.revision := old.revision + 1;
  end if;

  return new;
end;
$$;

revoke execute on function public.stamp_committee_paper_save() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- save_committee_paper_text: the live editor's save
-- -----------------------------------------------------------------------------
-- The text and the document are stored together, in one transaction, over
-- the revision the page read and no other, so two authors' saves take turns
-- and neither overwrites what the other merged. Answers the new revision, or
-- null when another save landed first or the caller may no longer write the
-- paper, which is what the page's store expects of an update. Security
-- definer like the other paper functions: committee_paper_documents has no
-- write policy, and the function checks who is pressing before it writes.
--
-- The revision moves on by one with every save, whether the Markdown changed
-- or only the document did (a suggestion made, say): a submission or a plain
-- Markdown save that read the paper before then meets its clash. The text
-- columns a paper's kind does not use are left out by the page and stay null,
-- as committee_papers_text_fits_kind asks.

create or replace function public.save_committee_paper_text(
  paper_id uuid,
  expected_revision integer,
  document_state bytea,
  body_markdown text default null,
  preamble_markdown text default null,
  operative_markdown text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  paper public.committee_papers;
  new_revision integer;
begin
  if save_committee_paper_text.document_state is null then
    raise exception 'A save carries the paper''s document.' using errcode = '22023';
  end if;

  select candidate.*
  into paper
  from public.committee_papers as candidate
  where candidate.id = save_committee_paper_text.paper_id
  for update;

  -- Only an author of a paper being written saves (the policy "Authors can
  -- save a paper they are writing" says the same for a plain save). A paper
  -- the caller may not write is answered as a save that did not land.
  if not found or paper.status <> 'writing' or not public.is_paper_author(paper.id) then
    return null;
  end if;

  if paper.revision <> save_committee_paper_text.expected_revision then
    return null;
  end if;

  update public.committee_papers as target
  set body_markdown = save_committee_paper_text.body_markdown,
      preamble_markdown = save_committee_paper_text.preamble_markdown,
      operative_markdown = save_committee_paper_text.operative_markdown,
      revision = paper.revision + 1,
      updated_by = (select auth.uid()),
      updated_at = now()
  where target.id = paper.id
  returning target.revision into new_revision;

  -- The conflict is named by its constraint: the column name would clash
  -- with this function's parameter.
  insert into public.committee_paper_documents as document (paper_id, document_state, updated_at)
  values (paper.id, save_committee_paper_text.document_state, now())
  on conflict on constraint committee_paper_documents_pkey do update
    set document_state = excluded.document_state,
        updated_at = excluded.updated_at;

  return new_revision;
end;
$$;

revoke execute on function public.save_committee_paper_text(uuid, integer, bytea, text, text, text)
  from public, anon;
grant execute on function public.save_committee_paper_text(uuid, integer, bytea, text, text, text)
  to authenticated;


-- =============================================================================
-- L53 and L54: how much one seat may start
-- =============================================================================

-- -----------------------------------------------------------------------------
-- start_paper: "Start writing", at most five of a seat's own papers at a time
-- -----------------------------------------------------------------------------
-- As in 20261008120100, with one more rule: a seat has at most five papers it
-- started still being written. Only the papers it started count, so nobody
-- uses up another seat's places by adding it as an author, and leaving a
-- paper does not give the place back while the others still write it. The
-- advisory lock on the seat makes two starts at the same moment take turns,
-- so the count holds.

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
  papers_in_writing_limit constant integer := 5;
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

  -- L53: a seat with five of its own papers still being written finishes
  -- one first, so there is a ceiling on how many a delegate keeps open.
  perform pg_advisory_xact_lock(hashtext('papers-in-writing:' || my_seat.id::text));

  if (
    select count(*)
    from public.committee_papers as written
    where written.committee_id = start_paper.committee_id
      and written.started_by_seat_id = my_seat.id
      and written.status = 'writing'
  ) >= papers_in_writing_limit then
    raise exception
      'This seat has started five papers that are still being written. Submit, withdraw or delete one before starting another.'
      using errcode = '22023';
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
-- paper_author_notices: who "Add an author" told, and when
-- -----------------------------------------------------------------------------
-- One row for every "You were added to ..." notification add_paper_author
-- sends. The rows outlive the paper, which is the point: starting a paper,
-- adding a seat and deleting the paper again no longer resets anything.
-- Nobody but add_paper_author reads or writes it, so it has no policy and no
-- grant; rows older than a day are of no use and the adder's own are cleared
-- as it adds again.

create table public.paper_author_notices (
  adder_seat_id uuid not null references public.seats (id) on delete cascade,
  added_seat_id uuid not null references public.seats (id) on delete cascade,
  sent_at timestamptz not null default now()
);

comment on table public.paper_author_notices is
  'Every "You were added to a paper" notification, by the seat that added and the seat added, so add_paper_author tells a seat a few times a day at most.';

create index paper_author_notices_adder_sent_at
  on public.paper_author_notices (adder_seat_id, sent_at);
create index paper_author_notices_pair_sent_at
  on public.paper_author_notices (adder_seat_id, added_seat_id, sent_at);

alter table public.paper_author_notices enable row level security;

revoke all on public.paper_author_notices from anon, authenticated;


-- -----------------------------------------------------------------------------
-- add_paper_author: "Add an author", telling the seat a few times a day
-- -----------------------------------------------------------------------------
-- As in 20261008120100, with one more rule: the seat added is told at most
-- three times a day by one seat, and one seat tells at most thirty seats a
-- day, counted in paper_author_notices. Past either the seat is added all the
-- same, and finds the paper in its list. Under the advisory lock on the
-- adder's seat two adds at the same moment take turns, so the counts hold;
-- one lock and not two, so two seats adding each other cannot deadlock.

create or replace function public.add_paper_author(paper_id uuid, seat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  notices_per_pair_limit constant integer := 3;
  notices_per_adder_limit constant integer := 30;
  paper public.committee_papers;
  new_author public.seats;
  my_seat_id uuid;
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

  if changed = 0 then
    return;
  end if;

  -- The caller's own seat on this paper, which is_paper_author found above.
  -- Somebody who holds two author seats on it is always counted under the
  -- same one, so the limits below cannot be doubled by taking turns.
  select author.seat_id
  into my_seat_id
  from public.committee_paper_seats as author
  join public.seats as seat on seat.id = author.seat_id
  where author.paper_id = paper.id
    and author.role = 'author'
    and seat.user_id = (select auth.uid())
  order by author.seat_id
  limit 1;

  -- L53: the notification carries words the adder chose, the paper's title,
  -- so it is what the counts limit.
  perform pg_advisory_xact_lock(hashtext('paper-author-notices:' || my_seat_id::text));

  delete from public.paper_author_notices as notice
  where notice.adder_seat_id = my_seat_id
    and notice.sent_at <= now() - interval '1 day';

  if (
      select count(*)
      from public.paper_author_notices as notice
      where notice.adder_seat_id = my_seat_id
        and notice.added_seat_id = new_author.id
        and notice.sent_at > now() - interval '1 day'
    ) >= notices_per_pair_limit
    or (
      select count(*)
      from public.paper_author_notices as notice
      where notice.adder_seat_id = my_seat_id
        and notice.sent_at > now() - interval '1 day'
    ) >= notices_per_adder_limit
  then
    return;
  end if;

  insert into public.paper_author_notices (adder_seat_id, added_seat_id)
  values (my_seat_id, new_author.id);

  perform public.notify_paper_users(
    array[new_author.user_id],
    public.paper_conference_id(paper.id),
    'paper_author_added',
    'You were added to the ' || public.paper_kind_name(paper.kind) || ' “' || paper.title || '”',
    public.paper_link_path(paper.id)
  );
end;
$$;

revoke execute on function public.add_paper_author(uuid, uuid) from public, anon;
grant execute on function public.add_paper_author(uuid, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- propose_amendment: at most ten of one seat's amendments waiting on a draft
-- -----------------------------------------------------------------------------
-- As in 20261008120100, with two more rules. A seat has at most ten
-- amendments still waiting (for the sponsors, for support, for the dais or
-- for their vote) on one draft; one that ended, however it ended, makes room.
-- And a seat proposes at most twenty amendments to one draft in a day,
-- counting the ones it withdrew: each proposal asks the other sponsors for
-- an answer under its own number, so proposing and withdrawing over and over
-- would otherwise tell them without end. The draft is locked for the whole
-- function, so both counts hold.

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
  amendments_waiting_limit constant integer := 10;
  amendments_a_day_limit constant integer := 20;
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

  -- L54: counted under the lock on the draft, so two proposals at once take turns.
  if (
    select count(*)
    from public.amendments as waiting
    where waiting.paper_id = paper.id
      and waiting.proposed_by_seat_id = my_seat.id
      and waiting.status in ('awaiting_sponsors', 'collecting_support', 'with_the_dais', 'approved')
  ) >= amendments_waiting_limit then
    raise exception
      'This seat already has ten amendments waiting on this draft. Withdraw one before proposing another.'
      using errcode = '22023';
  end if;

  -- Amendments are never deleted, so a withdrawn one still counts here.
  if (
    select count(*)
    from public.amendments as proposed
    where proposed.paper_id = paper.id
      and proposed.proposed_by_seat_id = my_seat.id
      and proposed.created_at > now() - interval '1 day'
  ) >= amendments_a_day_limit then
    raise exception
      'This seat has proposed twenty amendments to this draft in the last day. Propose the next one tomorrow.'
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
-- paper_thread_notices: who told the authors of a new thread, and when
-- -----------------------------------------------------------------------------
-- One row for every "New comment on ..." notification start_thread sends.
-- The rows outlive the thread, so deleting it gives nothing back. Nobody but
-- start_thread reads or writes it, so it has no policy and no grant; rows
-- older than a day are of no use, and the starter's own on that paper are
-- cleared as they start another.

create table public.paper_thread_notices (
  paper_id uuid not null references public.committee_papers (id) on delete cascade,
  started_by uuid not null references auth.users (id) on delete cascade,
  sent_at timestamptz not null default now()
);

comment on table public.paper_thread_notices is
  'Every "New comment on a paper" notification, by the paper and the person who started the thread, so start_thread tells the authors of a few dozen a day at most.';

create index paper_thread_notices_paper_starter_sent_at
  on public.paper_thread_notices (paper_id, started_by, sent_at);

alter table public.paper_thread_notices enable row level security;

revoke all on public.paper_thread_notices from anon, authenticated;


-- -----------------------------------------------------------------------------
-- start_thread: at most fifty open threads of one person's on a paper
-- -----------------------------------------------------------------------------
-- As in 20261008120100, with two more rules. A person has at most fifty
-- threads they started still open on one paper, a committee paper or a
-- position paper; resolving or deleting one makes room. And a person tells
-- the authors of a committee paper of at most twenty new threads on it in a
-- day, counted in paper_thread_notices: each notice opens its own thread, so
-- nothing else stops one being sent for every thread started and deleted
-- again. Past that the thread is started all the same, and the authors find
-- it on the paper.

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
  open_threads_limit constant integer := 50;
  thread_notices_a_day_limit constant integer := 20;
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

    -- Counted under the lock on the paper, so two threads at once take turns.
    if (
      select count(*)
      from public.paper_comment_threads as open_thread
      where open_thread.committee_paper_id = paper.id
        and open_thread.started_by = (select auth.uid())
        and open_thread.resolved_at is null
    ) >= open_threads_limit then
      raise exception
        'You have fifty open comments on this paper. Resolve one before starting another.'
        using errcode = '22023';
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

    -- Under the lock on the paper, so the count of notices holds too.
    if not public.is_paper_author(paper.id) then
      delete from public.paper_thread_notices as old_notice
      where old_notice.paper_id = paper.id
        and old_notice.started_by = (select auth.uid())
        and old_notice.sent_at <= now() - interval '1 day';

      if (
        select count(*)
        from public.paper_thread_notices as sent
        where sent.paper_id = paper.id
          and sent.started_by = (select auth.uid())
      ) < thread_notices_a_day_limit then
        insert into public.paper_thread_notices (paper_id, started_by)
        values (paper.id, (select auth.uid()));

        perform public.notify_paper_seats(
          paper.id,
          array['author']::public.paper_seat_role[],
          'paper_comment_thread',
          'New comment on ' || public.paper_label(paper.kind, paper.topic_number, paper.sequence, paper.title),
          public.paper_link_path(paper.id) || '#thread-' || new_thread_id
        );
      end if;
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

    -- The draft is only key-shared above, so two threads started at once
    -- take turns here for the count to hold.
    perform pg_advisory_xact_lock(
      hashtext('paper-threads:' || start_thread.position_paper_seat_id::text || ':' || (select auth.uid())::text)
    );

    if (
      select count(*)
      from public.paper_comment_threads as open_thread
      where open_thread.position_paper_seat_id = start_thread.position_paper_seat_id
        and open_thread.started_by = (select auth.uid())
        and open_thread.resolved_at is null
    ) >= open_threads_limit then
      raise exception
        'You have fifty open comments on this paper. Resolve one before starting another.'
        using errcode = '22023';
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


-- =============================================================================
-- L55: the writing channel is named after the authors as they stand
-- =============================================================================
-- committee_papers.live_epoch counts the changes to who writes the paper. The
-- writing channel is "committee-paper:<paper id>:<live_epoch>", so when an
-- author leaves, or a seat changes hands, the remaining writers' pages hear
-- the paper change and move to the new name, while the writer who lost
-- access is alone on the old one and refused when they next join
-- ($lib/paper-live-channel.ts).

alter table public.committee_papers
  add column live_epoch integer not null default 1,
  add constraint committee_papers_live_epoch_from_one check (live_epoch >= 1);

comment on column public.committee_papers.live_epoch is
  'Moves on whenever the authors change. Names the live writing channel, so a writer who loses access falls off it.';


-- bump_paper_live_epoch: a seat starts or stops writing the paper.
-- Security definer, as hand_on_paper_lead is: the paper's row is not the
-- caller's to update.
create or replace function public.bump_paper_live_epoch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_author_set_changed boolean;
  changed_paper_id uuid;
begin
  if tg_op = 'INSERT' then
    is_author_set_changed := new.role = 'author';
    changed_paper_id := new.paper_id;
  elsif tg_op = 'DELETE' then
    is_author_set_changed := old.role = 'author';
    changed_paper_id := old.paper_id;
  else
    is_author_set_changed := old.role = 'author' or new.role = 'author';
    changed_paper_id := new.paper_id;
  end if;

  if is_author_set_changed then
    update public.committee_papers as paper
    set live_epoch = paper.live_epoch + 1
    where paper.id = changed_paper_id;
  end if;

  return null;
end;
$$;

revoke execute on function public.bump_paper_live_epoch() from public, anon, authenticated;

create trigger committee_paper_seats_bump_live_epoch
  after insert or update or delete on public.committee_paper_seats
  for each row
  execute function public.bump_paper_live_epoch();


-- bump_seat_papers_live_epoch: a seat changes hands, so the papers it writes
-- have a new writer and have lost one. Whatever the paper's status: a paper
-- with the dais goes back to writing when it is returned (return_paper), and
-- Realtime may still let the old holder's page into the channel it wrote on
-- before the paper was sent, so the newcomer must write on another.
create or replace function public.bump_seat_papers_live_epoch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    update public.committee_papers as paper
    set live_epoch = paper.live_epoch + 1
    where exists (
      select 1
      from public.committee_paper_seats as author
      where author.paper_id = paper.id
        and author.seat_id = new.id
        and author.role = 'author'
    );
  end if;

  return null;
end;
$$;

revoke execute on function public.bump_seat_papers_live_epoch() from public, anon, authenticated;

create trigger seats_bump_paper_live_epoch
  after update of user_id on public.seats
  for each row
  execute function public.bump_seat_papers_live_epoch();


-- -----------------------------------------------------------------------------
-- may_join_paper_writing_channel: may I hear and speak on this live channel?
-- -----------------------------------------------------------------------------
-- As in 20261008120100, for the new shape of the name: the paper's id and its
-- live_epoch as it stands now. A name with an old epoch, or none, opens to
-- nobody. The epoch is written as the page writes it, from 1 and without a
-- leading zero, so each epoch has one name, and it is at most nine digits so
-- it is read as an integer safely.

create or replace function public.may_join_paper_writing_channel(topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when may_join_paper_writing_channel.topic
      ~ '^committee-paper:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[1-9][0-9]{0,8}$'
    then
      public.may_write_paper(split_part(may_join_paper_writing_channel.topic, ':', 2)::uuid)
      and exists (
        select 1
        from public.committee_papers as paper
        where paper.id = split_part(may_join_paper_writing_channel.topic, ':', 2)::uuid
          and paper.live_epoch = split_part(may_join_paper_writing_channel.topic, ':', 3)::integer
      )
    else false
  end;
$$;

revoke execute on function public.may_join_paper_writing_channel(text) from public, anon;
grant execute on function public.may_join_paper_writing_channel(text) to authenticated;
