-- =============================================================================
-- committee_session_notes.body becomes Markdown (T144)
-- =============================================================================
-- Until now the Chair Notes pad stored the HTML its old editor wrote. The pad
-- now uses the shared Markdown editor (T143), so the notes are stored as
-- Markdown and turned into HTML on the server only when they are shown
-- (src/lib/server/markdown.ts).
--
-- The notes that exist are converted here, from the only tags the old editor
-- could save (the server cleaned everything else away before storing it):
-- b, strong, i, em, u, h3, ul, ol, li, a, div, p, br, and the &nbsp; a browser
-- writes for a second space. There are no real conferences on MUNMeet yet
-- (T55), so converting in SQL is enough; nobody's notes need a finer tool.


-- -----------------------------------------------------------------------------
-- session_notes_markdown_from_html
-- -----------------------------------------------------------------------------
-- The old notes HTML as Markdown. Step by step:
--
--   1. Characters that would mean something in Markdown (such as `*` or `[`)
--      are written with a backslash in front, so text keeps looking like text.
--   2. Bold, italic and underline become `**`, `*` and `++`, and a link
--      becomes `[words](<address>)`.
--   3. Headings, list items, paragraphs and line breaks become lines.
--   4. Anything left that looks like a tag goes, the characters the server
--      wrote as entities (`&lt;`) are turned back, and extra blank lines go.
--
-- It stays after the conversion so tests/db/committee-session-notes.test.ts
-- can check it, but only the service role may call it.

create or replace function public.session_notes_markdown_from_html(html text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  markdown text := coalesce(html, '');
  list_start integer;
  list_end integer;
  list_items text;
begin
  -- A second space, and the apostrophe some cleaners write as a number.
  markdown := replace(markdown, '&nbsp;', ' ');
  markdown := replace(markdown, '&#39;', '''');

  -- 1. A backslash in front of every character Markdown would read as formatting.
  markdown := regexp_replace(markdown, '([\\`*_\[\]~+])', '\\\1', 'g');

  -- 2. Formatting around nothing would leave stray `**`, so it goes first.
  markdown := regexp_replace(markdown, '<(b|strong|i|em|u)></\1>', '', 'gi');
  markdown := regexp_replace(markdown, '</?(b|strong)>', '**', 'gi');
  markdown := regexp_replace(markdown, '</?(i|em)>', '*', 'gi');
  markdown := regexp_replace(markdown, '</?u>', '++', 'gi');
  -- The address sits in `<…>` so a `)` in it cannot end the link early. Its
  -- `<` and `>` are stand-ins until step 4, which would take them for a tag.
  markdown := regexp_replace(
    markdown,
    '<a\s[^>]*href="([^"]*)"[^>]*>([^<]*)</a>',
    '[\2](' || chr(1) || '\1' || chr(2) || ')',
    'gi'
  );

  -- 3. A browser keeps an empty line open with a `<br>` just before the line
  -- ends, as in `<p><br></p>`. That one is only a placeholder, so it goes;
  -- any other `<br>` is a line break inside a paragraph (a backslash, then a
  -- new line, in Markdown).
  markdown := regexp_replace(markdown, '<br\s*/?>(\s*</(p|div|h3|li)>)', '\1', 'gi');
  markdown := regexp_replace(markdown, '<br\s*/?>', E'\\\\\n', 'gi');
  markdown := regexp_replace(markdown, '<h3>', E'\n\n### ', 'gi');

  -- A numbered list's items become `1.` lines, one list at a time.
  loop
    list_start := strpos(markdown, '<ol>');
    exit when list_start = 0;

    list_end := strpos(substr(markdown, list_start), '</ol>');
    exit when list_end = 0;
    list_end := list_start + list_end - 1;

    list_items := substr(markdown, list_start + 4, list_end - list_start - 4);
    list_items := replace(replace(list_items, '<li>', '1. '), '</li>', E'\n');
    markdown := left(markdown, list_start - 1)
      || E'\n\n' || list_items || E'\n\n'
      || substr(markdown, list_end + 5);
  end loop;

  -- Every item left is in a bulleted list.
  markdown := regexp_replace(markdown, '</?ul>', E'\n\n', 'gi');
  markdown := regexp_replace(markdown, '<li>', '- ', 'gi');
  markdown := regexp_replace(markdown, '</li>', E'\n', 'gi');
  markdown := regexp_replace(markdown, '</(p|div|h3)>', E'\n\n', 'gi');

  -- 4. Opening paragraphs and anything unexpected leave no trace.
  markdown := regexp_replace(markdown, '<[^>]*>', '', 'g');
  markdown := replace(markdown, '&lt;', '\<');
  markdown := replace(markdown, '&gt;', '\>');
  markdown := replace(markdown, '&quot;', '"');
  markdown := replace(markdown, '&amp;', '&');
  markdown := replace(replace(markdown, chr(1), '<'), chr(2), '>');
  -- Spaces at the start of a line would make Markdown read it as code.
  markdown := regexp_replace(markdown, '^[ \t]+', '', 'gn');
  markdown := regexp_replace(markdown, E'[ \t]+\n', E'\n', 'g');
  markdown := regexp_replace(markdown, E'\n{3,}', E'\n\n', 'g');

  return btrim(markdown, E' \n');
end;
$$;

-- Only this migration and the database tests use it.
revoke execute on function public.session_notes_markdown_from_html(text)
  from public, anon, authenticated;

-- The stamp trigger would put nobody's name on every pad and move its
-- revision on. Converting is not a save, so it is off while the rows change.
alter table public.committee_session_notes disable trigger committee_session_notes_stamp;

update public.committee_session_notes
set body = public.session_notes_markdown_from_html(body)
where body <> '';

alter table public.committee_session_notes enable trigger committee_session_notes_stamp;

comment on column public.committee_session_notes.body is
  'The notes as Markdown (T144). Turned into safe HTML on the server when shown.';
