-- =============================================================================
-- When a paper was opened for signatures
-- =============================================================================
-- docs/committee-papers.md, section 6: an author's page says how long the
-- paper has been open, "Open for signatures since 17:05", beside "Close
-- signatures". Opening is a flag, `is_open_for_signatures`, and the flag
-- alone does not say when it was set.
--
-- A trigger keeps the time in step with the flag, so every function that
-- opens or closes a paper (set_paper_signatures_open, submit_paper, and the
-- dais's return in later steps) sets it without knowing about it: the time
-- the flag turned on, kept while it stays on, and none once it is off.

alter table public.committee_papers
  add column signatures_opened_at timestamptz;

comment on column public.committee_papers.signatures_opened_at is
  'When the paper was last opened for signatures; null while it is not open. Kept by a trigger.';

create or replace function public.keep_signatures_opened_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.is_open_for_signatures then
    new.signatures_opened_at := null;
  elsif tg_op = 'INSERT' or not old.is_open_for_signatures then
    new.signatures_opened_at := now();
  else
    -- Still open: the time it opened stays, whatever an update says.
    new.signatures_opened_at := old.signatures_opened_at;
  end if;

  return new;
end;
$$;

revoke execute on function public.keep_signatures_opened_at() from public, anon, authenticated;

create trigger committee_papers_keep_signatures_opened_at
  before insert or update of is_open_for_signatures, signatures_opened_at
  on public.committee_papers
  for each row
  execute function public.keep_signatures_opened_at();
