-- =============================================================================
-- The topic under debate (T127)
-- =============================================================================
-- A committee lists its topics in `committees.topics`, but nothing recorded
-- which one is on the floor. The session mockup's top bar names it, or warns
-- "Agenda not set". This migration:
--
--   * adds `committee_state.agenda_topic`, one of the committee's topics or
--     null. The column sits on the state row, so the existing update policy
--     ("A chair can run the room") decides who may change it: a chair of the
--     committee or an organiser of its conference, like every other column of
--     the row. `committee_state` is already in the realtime publication, so a
--     change reaches every open screen with no further work.
--   * adds a trigger that refuses an agenda which is not one of the topics.
--   * adds a trigger that clears the agenda when an organiser edits the topics
--     and the agenda is no longer one of them.
--
-- Starting and ending a session do not touch the column, so the agenda of the
-- last session carries over to the next one.

alter table public.committee_state
  add column agenda_topic text;

comment on column public.committee_state.agenda_topic is
  'The topic under debate: one of committees.topics, or null while the agenda is not set.';


-- -----------------------------------------------------------------------------
-- check_committee_agenda_topic()
-- -----------------------------------------------------------------------------
-- A check constraint cannot read another table, and the update policy cannot
-- tell a new agenda from one that was already there. That matters: if the
-- policy checked the agenda on every update, a chair could not even pause the
-- timer after an organiser renamed the topic under debate. So the rule lives in
-- a trigger, which sees the old row and the new one and only looks when the
-- agenda really changes.
--
-- It is "security definer" so that it reads the committee's topics whatever
-- the caller's own select policies say; it reads nothing else and returns
-- nothing but the row it was given.

create or replace function public.check_committee_agenda_topic()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.agenda_topic is null
    or new.agenda_topic is not distinct from old.agenda_topic then
    return new;
  end if;

  if not exists (
    select 1
    from public.committees as committee
    where committee.id = new.committee_id
      and new.agenda_topic = any (committee.topics)
  ) then
    -- 23514 is check_violation, the code a check constraint would have raised.
    raise exception 'The agenda must be one of the committee''s topics.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function public.check_committee_agenda_topic() from public, anon, authenticated;

create trigger committee_state_check_agenda_topic
  before update of agenda_topic on public.committee_state
  for each row
  execute function public.check_committee_agenda_topic();


-- -----------------------------------------------------------------------------
-- clear_stale_committee_agenda()
-- -----------------------------------------------------------------------------
-- When an organiser removes or renames the topic under debate, the room should
-- say "Agenda not set" rather than keep naming a topic the committee no longer
-- has. "security definer" because an organiser edits `committees`, and the
-- state row it clears belongs to the same committee.

create or replace function public.clear_stale_committee_agenda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.committee_state as state
  set agenda_topic = null
  where state.committee_id = new.id
    and state.agenda_topic is not null
    and not (state.agenda_topic = any (new.topics));

  return new;
end;
$$;

revoke execute on function public.clear_stale_committee_agenda() from public, anon, authenticated;

create trigger committees_clear_stale_agenda
  after update of topics on public.committees
  for each row
  when (old.topics is distinct from new.topics)
  execute function public.clear_stale_committee_agenda();
