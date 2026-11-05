-- =============================================================================
-- A delegation's members work on their position papers together (T147)
-- =============================================================================
-- T145 gave the working draft of a written position paper to the delegate
-- sitting in the seat and to nobody else. T147 widens that to the delegation:
-- the members and heads of one delegation may read, start and save the
-- drafts of every seat held by one of its members.
--
-- 1. may_edit_paper_draft(seat), a helper that says whether the signed-in
--    user may work on a seat's draft. The select, insert and update policies
--    of position_paper_drafts are written again with it. T148's Realtime
--    Authorization policies are meant to ask the same helper.
--
-- 2. delegation_papers(delegation), the list the delegation's "Position
--    papers" view draws: every seat a member holds, with the state of its
--    paper and its draft. It answers only a member of the delegation.
--
-- Only the seat's delegate submits or drops a draft: the delete policy of
-- position_paper_drafts and every documents policy stay as they are, so a
-- head cannot hand a paper in on a member's behalf (T147 decision in
-- open-questions.md). Chairs and organisers still never read a draft.
--
-- Access follows membership and seating, and nothing is copied or stored for
-- it. A member who leaves the delegation is no longer one of its members, and
-- a seat that changes hands loses its draft through T145's
-- seats_clear_position_paper_draft.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- may_edit_paper_draft
-- -----------------------------------------------------------------------------
-- True when the signed-in user sits in the seat, or when they and the
-- delegate in it are members of the same delegation of the seat's
-- conference. A user is in at most one delegation per conference
-- (check_one_route_per_conference), so asking about the seat's conference is
-- what keeps a delegation of another conference out.
--
-- Security definer, stable and granted to authenticated only, like every
-- helper in permissions.md, so the policies below can look at seats,
-- committees and delegation members without each table's own policies
-- deciding for them.

create or replace function public.may_edit_paper_draft(target_seat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.seats as seat
    join public.committees as committee on committee.id = seat.committee_id
    where seat.id = target_seat_id
      and seat.user_id is not null
      and (
        seat.user_id = (select auth.uid())
        or exists (
          select 1
          from public.delegation_members as holder
          join public.delegations as delegation
            on delegation.id = holder.delegation_id
          join public.delegation_members as reader
            on reader.delegation_id = holder.delegation_id
          where holder.user_id = seat.user_id
            and delegation.conference_id = committee.conference_id
            and reader.user_id = (select auth.uid())
        )
      )
  );
$$;

revoke execute on function public.may_edit_paper_draft(uuid) from public, anon;
grant execute on function public.may_edit_paper_draft(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- position_paper_drafts: the delegation reads, starts and saves
-- -----------------------------------------------------------------------------
-- T145's three policies, each asking the helper above instead of "the seat is
-- mine". The delete policy is left alone: dropping a draft is what submitting
-- does, and only the seat's delegate submits.

drop policy "A delegate can read the draft of their own seat"
  on public.position_paper_drafts;
drop policy "A delegate can start the draft of their own seat"
  on public.position_paper_drafts;
drop policy "A delegate can save the draft of their own seat"
  on public.position_paper_drafts;

create policy "The delegation can read the draft of a member's seat"
  on public.position_paper_drafts
  for select
  to authenticated
  using (public.may_edit_paper_draft(seat_id));

create policy "The delegation can start the draft of a member's seat"
  on public.position_paper_drafts
  for insert
  to authenticated
  with check (public.may_edit_paper_draft(seat_id));

create policy "The delegation can save the draft of a member's seat"
  on public.position_paper_drafts
  for update
  to authenticated
  using (public.may_edit_paper_draft(seat_id))
  with check (public.may_edit_paper_draft(seat_id));

comment on table public.position_paper_drafts is
  'The working draft of a written position paper. The seat''s delegate and their delegation read it.';


-- -----------------------------------------------------------------------------
-- delegation_papers
-- -----------------------------------------------------------------------------
-- One row per seat held by a member of the delegation, in the delegation's
-- conference, for its "Position papers" view: who sits there, the seat and
-- committee, how far the paper has got, and who last saved its draft.
--
-- Security definer because a member may not read a fellow member's documents
-- row: the chair's comment and the review status are given here, the file and
-- the submitted text are not. Anybody who is not a member of the delegation
-- gets no rows at all.
--
-- word_count counts the draft when there is one, else the submitted written
-- paper, else nothing. It is countWords in src/lib/paper-writing.ts written
-- in SQL: the pieces between runs of white space that hold a letter or a
-- digit.

create or replace function public.delegation_papers(target_delegation_id uuid)
returns table (
  seat_id uuid,
  seat_name text,
  country_code text,
  committee_id uuid,
  committee_name text,
  committee_slug text,
  holder_id uuid,
  holder_name text,
  paper_kind text,
  review_status public.review_status,
  review_comment text,
  draft_updated_by uuid,
  draft_updated_by_name text,
  draft_updated_at timestamptz,
  word_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    seat.id,
    seat.name,
    seat.country_code::text,
    committee.id,
    committee.name,
    committee.slug,
    seat.user_id,
    holder_profile.full_name,
    case
      when paper.id is null then null
      when paper.body_markdown is null then 'uploaded'
      else 'written'
    end,
    paper.review_status,
    paper.review_comment,
    draft.updated_by,
    editor_profile.full_name,
    draft.updated_at,
    (
      select count(*)::integer
      from regexp_split_to_table(
        coalesce(draft.body_markdown, paper.body_markdown, ''),
        '\s+'
      ) as piece
      where piece ~ '[[:alnum:]]'
    )
  from public.delegations as delegation
  join public.delegation_members as holder
    on holder.delegation_id = delegation.id
  join public.seats as seat
    on seat.user_id = holder.user_id
  join public.committees as committee
    on committee.id = seat.committee_id
    and committee.conference_id = delegation.conference_id
  left join public.profiles as holder_profile
    on holder_profile.id = seat.user_id
  left join public.documents as paper
    on paper.seat_id = seat.id
    and paper.kind = 'position_paper'
  left join public.position_paper_drafts as draft
    on draft.seat_id = seat.id
  left join public.profiles as editor_profile
    on editor_profile.id = draft.updated_by
  where delegation.id = target_delegation_id
    and public.is_delegation_member(target_delegation_id)
  order by holder_profile.full_name, committee.position, seat.position;
$$;

revoke execute on function public.delegation_papers(uuid) from public, anon;
grant execute on function public.delegation_papers(uuid) to authenticated;
