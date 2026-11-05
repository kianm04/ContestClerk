-- =============================================================================
-- A conference's life, and bounds on free text (security review 2026-10-10)
-- =============================================================================
-- Findings M2, L74, I1, I18, I10, L57, L65, L66, L67, L69, L70, L71 and L72 of
-- docs/security-review-2026-10-10.md all come down to one thing: the forms
-- enforce rules the database does not, so a request that skips the form and
-- talks to PostgREST directly is held to nothing.
--
-- THE LIFE OF A CONFERENCE (M2, L74, I1)
-- The dashboard refuses to unpublish once a delegate is seated, and offers
-- "Delete draft" only for a draft; the database knew neither rule. An
-- edit_conference holder could set a published conference back to draft with
-- delegates seated at it, then delete it, and everything hanging off it
-- (applications, invoices, seats, papers) went with it. Archived to draft was
-- not refused either, and a conference could be inserted as published without
-- ever meeting the publish checklist. This file:
--
--   * adds conferences.first_published_at, which the column guard stamps the
--     first time a conference goes public and which no browser may write;
--   * recreates protect_conferences_columns with every rule it already had
--     (the organisation never changes; awards publishing is confirm_awards')
--     and three more: first_published_at is the database's, archived never
--     goes back to draft, and published goes back to draft only while no seat
--     of the conference has somebody in it;
--   * narrows the insert policy to drafts and the delete policy to drafts that
--     were never public.
--
-- BOUNDS ON FREE TEXT (L57, L65, L66, L67, L69, L70, L71, L72, I10, I18)
-- Every CHECK below matches a constant the forms already use (named in the
-- comment beside it) or, where the app had no limit, a generous bound that is
-- said to be one. Slugs get the shape `slugify` in client/src/lib/slugs.ts
-- makes, because three exports put them in a Content-Disposition header (L71).
-- Web addresses must start with http:// or https://, as `isWebAddress` in
-- client/src/lib/conference-details.ts insists before saving and `safeWebAddress`
-- insists before linking (I18). The checks use `~*` because `isWebAddress`
-- reads the scheme through `URL`, which lower-cases it, so the form says yes
-- to `HTTPS://thimun.org`; a case-sensitive check would refuse the save the form
-- had just allowed. Each constraint is added `not valid` and then validated, so
-- a seed row that breaks it stops the migration with the constraint's name
-- rather than being waved through.
--
-- create_quick_session (L65) is not touched: it writes committees.name,
-- committees.slug and seats.name, and the bounds here hold for it as for
-- anybody else. Its per-user cap belongs to the organisation-governance work.
--
-- BEFORE RUNNING THIS ON A DATABASE WITH REAL ROWS
-- Each `validate constraint` below aborts the whole migration, naming the
-- constraint, if one existing row breaks it. On the seeds nothing does. On a
-- database that has been used, these questions find the rows to put right
-- first; every one should answer zero:
--
--   select count(*) from public.organizations where slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(slug) > 100;
--   select count(*) from public.conferences   where slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(slug) > 100;
--   select count(*) from public.committees    where slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(slug) > 100;
--     (the committee editor used to accept ^[a-z0-9-]+$, so a slug with a
--      leading, trailing or doubled hyphen is the likeliest find)
--   select count(*) from public.organizations where char_length(name) > 120 or char_length(description) > 1000 or char_length(city) > 120;
--   select count(*) from public.organizations where website_url is not null and (website_url !~* '^https?://' or char_length(website_url) > 2048);
--   select count(*) from public.conferences   where currency !~ '^[A-Z]{3}$';
--   select count(*) from public.conferences   where website_url   is not null and (website_url   !~* '^https?://' or char_length(website_url)   > 2048)
--                                                or instagram_url is not null and (instagram_url !~* '^https?://' or char_length(instagram_url) > 2048)
--                                                or facebook_url  is not null and (facebook_url  !~* '^https?://' or char_length(facebook_url)  > 2048)
--                                                or linkedin_url  is not null and (linkedin_url  !~* '^https?://' or char_length(linkedin_url)  > 2048)
--                                                or youtube_url   is not null and (youtube_url   !~* '^https?://' or char_length(youtube_url)   > 2048)
--                                                or tiktok_url    is not null and (tiktok_url    !~* '^https?://' or char_length(tiktok_url)    > 2048);
--     (an address saved without a scheme, "thimun.org", is the likeliest find)
--   select count(*) from public.committees         where char_length(name) > 120;
--   select count(*) from public.seats              where char_length(name) > 120;
--   select count(*) from public.committee_sessions where char_length(name) > 120;
--   select count(*) from public.profiles           where char_length(full_name) > 100 or char_length(institution_name) > 120 or char_length(pronouns) > 30;
--   select count(*) from public.announcements      where char_length(title) > 120 or char_length(body) > 4000;
--   select count(*) from public.schedule_events    where char_length(title) > 120 or char_length(description) > 1000 or char_length(location) > 80;
--
-- The database tests are in
-- client/tests/db/security-conference-lifecycle-limits.test.ts.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- conferences.first_published_at
-- -----------------------------------------------------------------------------
-- Null until the conference is published for the first time, then the moment
-- it was. A conference that has been public has been seen, linked to and
-- applied to, so it may be unpublished or archived but never deleted. The
-- column guard below writes it; the application only reads it.
--
-- Conferences that are already public when this runs get their creation moment,
-- the closest thing on record to when they went public; the exact instant does
-- not matter, only that the column is not null for them.
--
-- Two edges, on record so nobody rediscovers them:
--
--   * delete_my_account (20261001120700) runs as its owner and deletes the
--     caller's quick sessions whatever this column says. That is fine: a quick
--     session is kept a draft for life by conferences_quick_session_is_draft,
--     so the stamp below is never set on one and nothing once public goes.
--   * The guard refuses archived -> draft but not draft -> archived, so a
--     request that skips the dashboard (whose archive action takes only a
--     published conference past its last day) can archive a draft outright.
--     That stamps it and the row is then neither deletable nor a draft again;
--     the organiser has only hurt their own draft, and several database tests
--     archive a draft fixture this way, so it is left as it is.

alter table public.conferences
  add column first_published_at timestamptz;

comment on column public.conferences.first_published_at is
  'When the conference first went public, set by the database. Null while it has only ever been a draft. A conference with a value here is never deleted.';

update public.conferences
set first_published_at = created_at
where status in ('published', 'archived')
  and first_published_at is null;


-- -----------------------------------------------------------------------------
-- The conferences column guard, made again
-- -----------------------------------------------------------------------------
-- The two rules it had (20260919140000 and 20261007180000) stay as they were.
-- The three new ones are all about status and first_published_at.
--
-- Only the app's own roles are held to the browser rules: "current_user in
-- ('anon', 'authenticated')" is how every column guard says so, and the
-- service role, the seeds and a support script keep their freedom. The stamp
-- is kept for them too, though, so that a conference the seeds insert as
-- published counts as having been public.
--
-- The seated-delegate check reads seats and committees as the person making
-- the change, so Row Level Security applies to it. That is safe here because
-- only an edit_conference holder reaches an update of conferences at all, and
-- every such holder is staff of the conference (a role membership points at a
-- staff row; organisation owners and admins and platform admins are staff by
-- definition in staff_conference_ids), and staff read every committee and
-- every seat of their conference. A security definer helper would hide the
-- browser from current_user, which is what the whole guard turns on.

create or replace function public.protect_conferences_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  is_browser constant boolean := current_user in ('anon', 'authenticated');
begin
  if tg_op = 'INSERT' then
    if is_browser and new.first_published_at is not null then
      raise exception 'first_published_at is written by the database when a conference first goes public';
    end if;

    -- The insert policy only lets a browser insert a draft, so this stamp is
    -- for the service role and the seeds inserting a conference that is
    -- already public.
    if new.status <> 'draft' and new.first_published_at is null then
      new.first_published_at := now();
    end if;

    return new;
  end if;

  if is_browser then
    if new.first_published_at is distinct from old.first_published_at then
      raise exception 'first_published_at is written by the database when a conference first goes public';
    end if;

    if new.organization_id is distinct from old.organization_id then
      raise exception 'A conference cannot be moved to another organisation';
    end if;

    -- set_awards_published_at runs as its owner, so it never reaches this.
    if new.awards_published_at is distinct from old.awards_published_at
      and not public.has_permission(new.id, 'confirm_awards')
    then
      raise exception 'Only the people who confirm awards can publish them';
    end if;

    -- An archived conference is finished. Its participants keep their access
    -- to what happened; a draft would take that away and open the door to a
    -- delete.
    if old.status = 'archived' and new.status = 'draft' then
      raise exception 'An archived conference cannot go back to being a draft. It stays archived.';
    end if;

    -- The same sentence the dashboard's unpublish action says, so the page
    -- and the database agree whichever one is asked first.
    if old.status = 'published'
      and new.status = 'draft'
      and exists (
        select 1
        from public.seats as seat
        join public.committees as committee on committee.id = seat.committee_id
        where committee.conference_id = new.id
          and seat.user_id is not null
      )
    then
      raise exception 'You cannot unpublish once delegates are seated. Archive it after the conference instead.';
    end if;
  end if;

  -- The first time the conference is anything but a draft, remember when.
  -- Later publishes leave the first moment alone.
  if new.status <> 'draft' and new.first_published_at is null then
    new.first_published_at := now();
  end if;

  return new;
end;
$$;

-- The trigger used to run on update only. It now runs on insert as well, for
-- the stamp and the browser's first_published_at rule above.
drop trigger conferences_protect_columns on public.conferences;

create trigger conferences_protect_columns
  before insert or update on public.conferences
  for each row
  execute function public.protect_conferences_columns();


-- -----------------------------------------------------------------------------
-- conferences insert and delete policies
-- -----------------------------------------------------------------------------
-- A new conference is a draft: publishing is the end of the checklist at
-- /manage/[slug]/publish, never a column on the way in (I1). Every insert the
-- app makes (createConference and createCreationDraft in client/src/lib/server,
-- create_quick_session, the database tests' fixtures) already sends 'draft' or
-- leaves the column to its default; the browser tests insert their published
-- fixtures with the service role, which no policy holds.

drop policy "Members can create conferences for their organization" on public.conferences;

create policy "Members can create a draft conference for their organization"
  on public.conferences
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and public.is_organization_member(organization_id)
    and status = 'draft'
  );

-- "Still a draft" is no longer enough: a draft that has been public before
-- has first_published_at set, and goes nowhere. The publish page and the
-- organiser area check the same column before offering "Delete draft".

drop policy "Conference editors can delete a conference that is still a draft" on public.conferences;

create policy "Conference editors can delete a draft that was never public"
  on public.conferences
  for delete
  to authenticated
  using (
    id in (select public.permitted_conference_ids('edit_conference'))
    and status = 'draft'
    and first_published_at is null
  );


-- -----------------------------------------------------------------------------
-- Slugs (L71, L70, L66)
-- -----------------------------------------------------------------------------
-- Lowercase letters and digits in words joined by single hyphens: what
-- `slugify` makes, what the committee editor accepts, and nothing a
-- Content-Disposition header or a URL has to escape. 100 characters is well
-- over the 67 `makeUniqueSlug` can produce (60 of name, a hyphen, 6 random).

alter table public.organizations
  add constraint organizations_slug_shape
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100)
  not valid;
alter table public.organizations validate constraint organizations_slug_shape;

alter table public.conferences
  add constraint conferences_slug_shape
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100)
  not valid;
alter table public.conferences validate constraint conferences_slug_shape;

alter table public.committees
  add constraint committees_slug_shape
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100)
  not valid;
alter table public.committees validate constraint committees_slug_shape;


-- -----------------------------------------------------------------------------
-- organizations (L69, L70, I18)
-- -----------------------------------------------------------------------------
-- name and description match ORGANIZATION_NAME_MAX_LENGTH (120) and
-- ORGANIZATION_DESCRIPTION_MAX_LENGTH (1000) in client/src/lib/organizations.ts.
-- The city had no limit anywhere; 120 is generous for a city's name and is the
-- bound the Organisation step now applies as well. A web address is at most
-- 2048 characters, the longest the common browsers agree to carry, and the
-- forms refuse anything longer through `isWebAddress`; its scheme may be in
-- any case, as the file's header explains.

alter table public.organizations
  add constraint organizations_name_length check (char_length(name) <= 120) not valid;
alter table public.organizations validate constraint organizations_name_length;

alter table public.organizations
  add constraint organizations_description_length check (char_length(description) <= 1000) not valid;
alter table public.organizations validate constraint organizations_description_length;

alter table public.organizations
  add constraint organizations_city_length check (char_length(city) <= 120) not valid;
alter table public.organizations validate constraint organizations_city_length;

alter table public.organizations
  add constraint organizations_website_url_shape
  check (website_url is null or (website_url ~* '^https?://' and char_length(website_url) <= 2048))
  not valid;
alter table public.organizations validate constraint organizations_website_url_shape;


-- -----------------------------------------------------------------------------
-- conferences: currency and the seven web addresses (I10, I18)
-- -----------------------------------------------------------------------------
-- A currency is an ISO 4217 code: three capital letters, as the currency choices
-- in client/src/lib/conference-details.ts offer them and as Stripe reads them. The
-- addresses are what `isWebAddress` accepts and `safeWebAddress` links to; a
-- `javascript:` address written straight to the table would otherwise become a
-- link on the public page wherever a read path forgot the mapper.

alter table public.conferences
  add constraint conferences_currency_shape check (currency ~ '^[A-Z]{3}$') not valid;
alter table public.conferences validate constraint conferences_currency_shape;

alter table public.conferences
  add constraint conferences_website_url_shape
  check (website_url is null or (website_url ~* '^https?://' and char_length(website_url) <= 2048))
  not valid;
alter table public.conferences validate constraint conferences_website_url_shape;

alter table public.conferences
  add constraint conferences_instagram_url_shape
  check (instagram_url is null or (instagram_url ~* '^https?://' and char_length(instagram_url) <= 2048))
  not valid;
alter table public.conferences validate constraint conferences_instagram_url_shape;

alter table public.conferences
  add constraint conferences_facebook_url_shape
  check (facebook_url is null or (facebook_url ~* '^https?://' and char_length(facebook_url) <= 2048))
  not valid;
alter table public.conferences validate constraint conferences_facebook_url_shape;

alter table public.conferences
  add constraint conferences_linkedin_url_shape
  check (linkedin_url is null or (linkedin_url ~* '^https?://' and char_length(linkedin_url) <= 2048))
  not valid;
alter table public.conferences validate constraint conferences_linkedin_url_shape;

alter table public.conferences
  add constraint conferences_youtube_url_shape
  check (youtube_url is null or (youtube_url ~* '^https?://' and char_length(youtube_url) <= 2048))
  not valid;
alter table public.conferences validate constraint conferences_youtube_url_shape;

alter table public.conferences
  add constraint conferences_tiktok_url_shape
  check (tiktok_url is null or (tiktok_url ~* '^https?://' and char_length(tiktok_url) <= 2048))
  not valid;
alter table public.conferences validate constraint conferences_tiktok_url_shape;


-- -----------------------------------------------------------------------------
-- committees and seats (L65, L66)
-- -----------------------------------------------------------------------------
-- committees.name matches NAME_MAX_LENGTH (120) in client/src/lib/committee-details.ts
-- and the setup dialog's maxlength. A seat's name had no limit anywhere: it is
-- a country or a title such as "Secretary-General", so 120 is generous and is
-- said to be so here.

alter table public.committees
  add constraint committees_name_length check (char_length(name) <= 120) not valid;
alter table public.committees validate constraint committees_name_length;

alter table public.seats
  add constraint seats_name_length check (char_length(name) <= 120) not valid;
alter table public.seats validate constraint seats_name_length;


-- -----------------------------------------------------------------------------
-- committee_sessions (L57)
-- -----------------------------------------------------------------------------
-- A session is "Session II" or "Opening ceremony"; the chair's form had no
-- limit. 120 is generous and is SESSION_NAME_MAX_LENGTH in
-- client/src/lib/chair-room.ts, which the start-session action now applies.

alter table public.committee_sessions
  add constraint committee_sessions_name_length check (char_length(name) <= 120) not valid;
alter table public.committee_sessions validate constraint committee_sessions_name_length;


-- -----------------------------------------------------------------------------
-- profiles (L67)
-- -----------------------------------------------------------------------------
-- full_name is bounded by the register form's MAXIMUM_FULL_NAME_LENGTH (100) in
-- client/src/lib/auth.ts, which is what handle_new_user copies into the row;
-- the profile editor's own bound (80) is tighter and stays as it is.
-- institution_name and pronouns match INSTITUTION_NAME_MAX_LENGTH (120) and
-- PRONOUNS_MAX_LENGTH (30) in client/src/lib/profiles.ts. bio already has
-- profiles_bio_length (500).

alter table public.profiles
  add constraint profiles_full_name_length check (char_length(full_name) <= 100) not valid;
alter table public.profiles validate constraint profiles_full_name_length;

alter table public.profiles
  add constraint profiles_institution_name_length check (char_length(institution_name) <= 120) not valid;
alter table public.profiles validate constraint profiles_institution_name_length;

alter table public.profiles
  add constraint profiles_pronouns_length check (char_length(pronouns) <= 30) not valid;
alter table public.profiles validate constraint profiles_pronouns_length;


-- -----------------------------------------------------------------------------
-- announcements and schedule_events (L72)
-- -----------------------------------------------------------------------------
-- ANNOUNCEMENT_TITLE_MAX_LENGTH (120) and ANNOUNCEMENT_BODY_MAX_LENGTH (4000) in
-- client/src/lib/announcement-form.ts; EVENT_TITLE_MAX_LENGTH (120),
-- EVENT_DESCRIPTION_MAX_LENGTH (1000) and EVENT_LOCATION_MAX_LENGTH (80) in
-- client/src/lib/schedule-form.ts.

alter table public.announcements
  add constraint announcements_title_length check (char_length(title) <= 120) not valid;
alter table public.announcements validate constraint announcements_title_length;

alter table public.announcements
  add constraint announcements_body_length check (char_length(body) <= 4000) not valid;
alter table public.announcements validate constraint announcements_body_length;

alter table public.schedule_events
  add constraint schedule_events_title_length check (char_length(title) <= 120) not valid;
alter table public.schedule_events validate constraint schedule_events_title_length;

alter table public.schedule_events
  add constraint schedule_events_description_length check (char_length(description) <= 1000) not valid;
alter table public.schedule_events validate constraint schedule_events_description_length;

alter table public.schedule_events
  add constraint schedule_events_location_length check (char_length(location) <= 80) not valid;
alter table public.schedule_events validate constraint schedule_events_location_length;
