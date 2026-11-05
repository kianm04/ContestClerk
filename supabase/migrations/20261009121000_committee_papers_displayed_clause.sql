-- =============================================================================
-- Which clause of the paper on the projector is on screen
-- =============================================================================
-- docs/committee-papers.md, section 6: "The projector shows the paper the
-- dais put on screen, large, with its clause numbers". As drawn, it shows a
-- draft resolution one part at a time, as a chair takes the room through it:
-- its preambulatory clauses, then operative clause 1, 2, 3 in turn, which
-- the dais steps through with "Previous clause" and "Next clause".
--
-- committee_state.displayed_clause says where the projector stands: 0 for
-- the preambulatory clauses, n for operative clause n, and null for the
-- paper's start. The database does not read the clauses, so the application
-- keeps the number inside the paper ($lib/papers-on-floor.ts) and draws a
-- number past the last clause as the last.
--
-- It lives on the room's state beside displayed_paper_id, so the projector
-- hears it change the way it hears everything else, and the policy "A chair
-- can run the room" already lets whoever may run the room change it. A
-- trigger puts it back to the start whenever the paper on screen changes, so
-- every way of changing the paper (introduce_paper, "Show on screen",
-- withdraw_paper, a paper deleted) starts the next one at the top without
-- knowing about it.

alter table public.committee_state
  add column displayed_clause integer,
  add constraint committee_state_displayed_clause_is_in_a_paper check (
    displayed_clause is null or (displayed_clause >= 0 and displayed_paper_id is not null)
  );

comment on column public.committee_state.displayed_clause is
  'Where the projector stands in the displayed paper: 0 for its preambulatory clauses, n for operative clause n, null for its start. Reset by a trigger when the paper changes.';

create or replace function public.reset_displayed_clause()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.displayed_paper_id is distinct from old.displayed_paper_id then
    new.displayed_clause := null;
  end if;

  return new;
end;
$$;

revoke execute on function public.reset_displayed_clause() from public, anon, authenticated;

create trigger committee_state_reset_displayed_clause
  before update of displayed_paper_id
  on public.committee_state
  for each row
  execute function public.reset_displayed_clause();


-- Never edit this file once it has been applied anywhere. Add a new migration.
