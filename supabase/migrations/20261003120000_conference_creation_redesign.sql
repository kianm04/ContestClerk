-- =============================================================================
-- Conference creation redesign (Trello fe3reN7Y)
-- =============================================================================
-- The new /create flow lets an organiser reach "Launch" without inventing what
-- they do not know yet: a venue, the times of day, whether there will be a
-- fee, when applications open. Each of those unknowns used to be a null that
-- every page had to guess the meaning of. This migration gives each one an
-- explicit state column, so "the venue is to be announced" and "nobody has
-- said anything about the venue" are different rows:
--
--   * conferences.location_mode: in person, online or hybrid. An online
--     conference needs no city, so conferences_place_unless_quick_session is
--     made again to allow that, and to allow a draft still being set up;
--   * conferences.venue_status and conferences.conference_time_status:
--     known or tba, with start_time and end_time for the times of day;
--   * conferences.fee_status: free, paid or undecided;
--   * conferences.application_open_mode and application_close_rule, with
--     application_close_offset_days: how the application window is decided.
--     applications_open_at and applications_close_at stay the stored answer,
--     so every page that reads them works unchanged;
--   * conferences.creation_step: the step of /create a draft carries on from;
--   * conferences.prefill_sources: where each prefilled value came from, so a
--     value the organiser typed is never written over by a later suggestion;
--   * organizations.city: the organisation's home city, which prefills the
--     next conference's;
--   * fees.description and committees.planned_seat_count, which the Setup
--     step's dialogs ask for.
--
-- Existing published conferences keep working: every new column has a default
-- that describes what their rows already mean, and the backfills below set the
-- state columns from the values each row already holds. Existing drafts keep
-- their data and resume at the Setup step.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- =============================================================================
-- The state enums
-- =============================================================================

create type public.location_mode as enum ('in_person', 'online', 'hybrid');
create type public.known_or_tba as enum ('known', 'tba');
create type public.fee_status as enum ('free', 'paid', 'undecided');
create type public.application_open_mode as enum ('manual', 'on_publish', 'scheduled');
create type public.application_close_rule as enum ('relative', 'fixed');
create type public.creation_step as enum ('basics', 'when', 'setup', 'launch');


-- =============================================================================
-- conferences: the explicit states
-- =============================================================================

alter table public.conferences
  add column location_mode public.location_mode not null default 'in_person',
  add column venue_status public.known_or_tba not null default 'tba',
  add column conference_time_status public.known_or_tba not null default 'tba',
  add column start_time time,
  add column end_time time,
  add column fee_status public.fee_status not null default 'undecided',
  add column application_open_mode public.application_open_mode not null default 'manual',
  add column application_close_rule public.application_close_rule not null default 'relative',
  -- Negative counts back from the first day: -14 is "two weeks before".
  add column application_close_offset_days integer not null default -14,
  add column creation_step public.creation_step not null default 'basics',
  add column prefill_sources jsonb not null default '{}'::jsonb;

comment on column public.conferences.location_mode is
  'Where the conference happens: in a venue, online, or both. Online needs no city.';
comment on column public.conferences.venue_status is
  'known when venue_name is the real venue; tba when the organiser has not decided.';
comment on column public.conferences.conference_time_status is
  'known when start_time and end_time are decided; tba when only the days are.';
comment on column public.conferences.fee_status is
  'free, paid or undecided. Fees rows exist only when it is paid.';
comment on column public.conferences.application_open_mode is
  'manual: the organiser opens applications; on_publish: publishing opens them; scheduled: applications_open_at says when.';
comment on column public.conferences.application_close_rule is
  'relative: applications_close_at follows start_date by application_close_offset_days; fixed: it is a date the organiser chose.';
comment on column public.conferences.creation_step is
  'The step of /create a draft carries on from. Nothing reads it once the conference is published.';
comment on column public.conferences.prefill_sources is
  'Column name to where its value came from: organisation, previous_conference, system_default or user.';

alter table public.conferences
  add constraint conferences_times_known_together check (
    conference_time_status = 'tba' or (start_time is not null and end_time is not null)
  ),
  add constraint conferences_close_offset_in_past check (
    application_close_offset_days <= 0
  );

-- What the rows already there mean. A conference with a venue named has a
-- known venue; one with fees is paid; one with an opening date was scheduled
-- and one with a closing date chose it. Every other row keeps the defaults.
update public.conferences
set venue_status = 'known'
where venue_name is not null;

update public.conferences as conference
set fee_status = 'paid'
where exists (
  select 1 from public.fees as fee where fee.conference_id = conference.id
);

update public.conferences
set application_open_mode = 'scheduled'
where applications_open_at is not null;

update public.conferences
set application_close_rule = 'fixed'
where applications_close_at is not null;

-- A draft made before this migration went through the old form, which asked
-- for everything the Basics and When steps ask for, so it resumes at Setup.
update public.conferences
set creation_step = 'setup'
where status = 'draft' and kind = 'conference';

-- An online conference happens nowhere in particular, and a draft may not have
-- said where yet. Publishing an in-person or hybrid conference without a city
-- is still refused here, which is what /create's Launch step tells the
-- organiser before they press the button.
alter table public.conferences
  drop constraint conferences_place_unless_quick_session;

alter table public.conferences
  add constraint conferences_place_unless_quick_session check (
    kind = 'quick_session'
    or status = 'draft'
    or location_mode = 'online'
    or (city is not null and country_code is not null)
  );


-- =============================================================================
-- organizations.city
-- =============================================================================
-- The organisation's home city. The Organisation step shows it on the card and
-- the next conference starts out there. country_code already existed.

alter table public.organizations
  add column city text;

comment on column public.organizations.city is
  'The organisation''s home city, which a new conference of theirs starts out in.';


-- =============================================================================
-- fees.description and committees.planned_seat_count
-- =============================================================================

alter table public.fees
  add column description text;

comment on column public.fees.description is
  'One line under the fee''s name on the Setup step and the apply page.';

-- How many seats the organiser expects, before any seat rows exist. The
-- committees imported from last year carry last year''s count here as a
-- suggestion, and the Setup step shows it as "Not decided" when it is null.
alter table public.committees
  add column planned_seat_count integer,
  add constraint committees_planned_seat_count_positive check (
    planned_seat_count is null or planned_seat_count > 0
  );

comment on column public.committees.planned_seat_count is
  'How many seats the organiser plans, before seats exist. Null means not decided.';


-- =============================================================================
-- conferences_with_organization, made again
-- =============================================================================
-- The view expanded "conference.*" into a fixed list of columns when it was
-- made, so none of the new columns is in it until it is made again, the same
-- way 20261001120700 added kind. Everything else is as before: security_invoker
-- = true, so the conferences and organizations policies decide what comes
-- back, and its own grant.

drop view public.conferences_with_organization;

create view public.conferences_with_organization
with (security_invoker = true) as
select
  conference.*,
  organization.name as organization_name,
  organization.slug as organization_slug
from public.conferences as conference
join public.organizations as organization
  on organization.id = conference.organization_id;

grant select on public.conferences_with_organization to anon, authenticated;
