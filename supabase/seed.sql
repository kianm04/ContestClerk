-- =============================================================================
-- MUNMeet: sample data (3 organizations, 12 conferences, 3 accounts)
-- File: supabase/seed.sql
-- =============================================================================
--
-- WHAT THIS IS FOR
-- Fills the database with made-up rows so that every page of the app has
-- something real to show. There are few conferences on purpose, and each one is
-- set up the way an organiser would set it up: it has a level, an application
-- window, committees and seats, rather than being a name and a date.
--
-- The rows are chosen so that every control and every empty state has work to
-- do:
-- * 9 published conferences that have not finished yet. The directory lists
--   them all on one page.
-- * Conferences at each of the three levels (high school, university, mixed),
--   for the level filter, in 8 different countries for the country filter.
-- * Application windows of every kind: open right now, not yet open, already
--   shut, and none at all, which counts as open on both sides.
-- * 1 published conference that is already over, so a test can prove that the
--   directory leaves a finished conference out.
-- * 2 conferences that are still drafts, so the database tests can prove that
--   visitors never see them.
-- * Committees and seats on every published conference that is still to come,
--   except Copenhagen and Brussels. Those two are published with nothing under
--   them yet; Copenhagen is what gives the "Committees will be announced soon."
--   empty state a page to appear on, and Brussels is a plain conference for
--   `tests/e2e/home.spec.ts` to put a temporary organiser and event on.
-- * 3 accounts: a delegate holding a seat, the head of a delegation, and an
--   organiser who owns the first organization and can therefore run everything
--   it puts on.
--
-- HOW TO RUN
-- It runs by itself: `pnpm db:reset` (from client/) applies every migration and
-- then this file. See supabase/README.md.
--
-- It runs as the "postgres" user, which Row Level Security does not limit. That
-- is why these inserts work although no policy allows them. The app cannot do
-- this.
--
-- RUNNING IT MORE THAN ONCE
-- Every row has a fixed id. "on conflict (id) do nothing" means "if a row with
-- this id already exists, skip it", so a second run adds and changes nothing.
-- That also means editing a row below and running again does NOT update it. Run
-- the clean-up block at the bottom first.
--
-- THE IDS
-- Any uuid works. These are picked to be easy to recognise:
--   10000000-0000-4000-8000-00000000000N   sample organization N
--   20000000-0000-4000-8000-00000000000N   sample conference N
--   30000000-0000-4000-8000-00000000000N   sample committee N
--   40000000-0000-4000-8000-00000000000N   the uuid in a sample picture's file
--                                          name, N matching the row it belongs to
--   50000000-0000-4000-8000-00000000000N   sample account N
--   60000000-0000-4000-8000-00000000000N   the sample application and delegation
--
-- The conference numbers have gaps in them. They used to run from 1 to 17, and
-- the rows that were only there to fill the directory up have since been taken
-- out; the numbers of the rows that stayed did not change, because the browser
-- tests name conferences by id.
--
-- Seats have no fixed ids. They are unique on (committee_id, name), so
-- "on conflict (committee_id, name) do nothing" makes them safe to re-run
-- without a hundred more uuids to keep track of.


-- -----------------------------------------------------------------------------
-- Organizations
-- -----------------------------------------------------------------------------
-- created_by is null because no real user created these. The organiser account
-- further down is made an owner of the first one with an explicit
-- organization_members row instead, because that account does not exist yet at
-- this point in the file.
--
-- Add the three sample organizations, skipping any whose id already exists.
--
-- Only the first has a website_url. The public organisation page shows a link to
-- it, and with both of them having one there would be nothing to prove that the
-- link is built and checked the way it should be. The second is left without,
-- so the "no website" half of that page is real sample data too.
--
-- All three have a logo_path, and the file behind each one is uploaded into the
-- public-media bucket by the same `pnpm db:reset` that runs this file; see
-- supabase/media/README.md. Each logo is an invented crest, never a real
-- school's. The Avatar component falls back to the initials when the column is
-- null, and /styleguide is where that half is shown now.
insert into public.organizations (id, name, slug, description, country_code, website_url, logo_path, created_by)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'Sample Europe MUN Network',
    'sample-europe-mun-network',
    'A made-up organization that runs the sample conferences in Europe.',
    'NL',
    'https://sample-europe-mun.example',
    'organizations/10000000-0000-4000-8000-000000000001/logo-b1000000-0000-4000-8000-000000000001.png',
    null
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'Sample Global MUN Circle',
    'sample-global-mun-circle',
    'A made-up organization that runs the sample conferences outside Europe.',
    'US',
    null,
    'organizations/10000000-0000-4000-8000-000000000002/logo-b1000000-0000-4000-8000-000000000002.png',
    null
  ),
  -- The third one runs nothing a visitor may see: its only conference is the
  -- draft added below. Its public page is therefore the one that shows the empty
  -- state, which is the edge case `05-pages/public/organization.md` names, and
  -- there is no other organization in this file that can show it.
  (
    '10000000-0000-4000-8000-000000000003',
    'Sample First-Year MUN Society',
    'sample-first-year-mun-society',
    'A made-up organization that is still setting up its first conference.',
    'IE',
    null,
    'organizations/10000000-0000-4000-8000-000000000003/logo-b1000000-0000-4000-8000-000000000003.png',
    null
  )
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- Conferences
-- -----------------------------------------------------------------------------
-- Nine published conferences, eight of them still to come and one that is over.
-- Every row fills in the same columns, so a value can be matched to its column
-- by position, and so that every conference page has a full set of facts to
-- show rather than a handful of blanks.
--
-- status is 'published' on all nine, so visitors who are not signed in see
-- them. The two drafts are their own insert below.
--
-- organization_id points at one of the organizations above, so this insert has
-- to come after that one. created_by is null for the same reason as above.
-- Slugs only use a-z, 0-9 and hyphens, because they become part of a link, such
-- as /conferences/bermun-2026.
--
-- WHY THE DATES ARE WORKED OUT FROM now()
-- Every date below is written as an offset, such as
-- (now() + interval '45 days')::date, and never as a fixed day. The directory
-- at /conferences lists published conferences that have not finished yet, and
-- the browser tests count what is on a page, so a fixed date would quietly drop
-- a conference out of the list on the day it passed and fail tests months later
-- for a reason that has nothing to do with the code. The offsets keep the same
-- spread and the same order every time this file is run.
--
-- The year in a conference's name ("BERMUN 2026", "Amsterdam Open MUN 2027") is
-- part of the name and nothing more. It is what the tests look these rows up
-- by, so it does not change; do not read it as a promise about the dates.
--
-- THE FOUR KINDS OF APPLICATION WINDOW
-- The first three rows have no window at all, which counts as open on both
-- sides: that is how a conference looks before its organisers have decided when
-- to take applications, and the landing page's featured row is made of these.
-- Vienna and Amsterdam are open right now, Copenhagen has not opened yet,
-- Madrid shut a fortnight ago, and Rotterdam shut long before it took place.
--
-- Every row has a banner_path and a logo_path (T149): a photograph of its city
-- and an invented crest, so the directory, the conference pages and the home
-- page show pictures the way the design mockup does, and a shared link carries
-- the banner rather than the site's og-default.jpg. The files are uploaded by
-- the same `pnpm db:reset` that runs this file; supabase/media/README.md lists
-- them and supabase/media/CREDITS.md says where each photograph came from. The
-- initials gradient ConferenceBanner falls back to is shown on /styleguide.

insert into public.conferences (
  id, name, slug,
  tagline,
  description,
  banner_path, logo_path,
  city, venue_name, venue_address, country_code, timezone, start_date, end_date,
  contact_email, level, language, expected_delegates, min_age, max_age, currency,
  status, applications_open_at, applications_close_at,
  accepts_individual_applications, accepts_delegations, committee_preference_count,
  position_paper_required,
  organization_id, created_by
)
values
  -- 1. Netherlands, six weeks out. The soonest of them all, so it is this row
  -- that decides how long a database can go without a reset before the
  -- directory starts to look thin.
  (
    '20000000-0000-4000-8000-000000000001', 'The Hague International MUN Junior', 'hagueimun-2026',
    'Three days for delegates doing this for the first time.',
    'A three-day conference for younger delegates taking part in their first MUN. Every committee is a beginner committee, and the chairs explain each rule of procedure before it is used.',
    'conferences/20000000-0000-4000-8000-000000000001/banner-b2000000-0000-4000-8000-000000000001.jpg',
    'conferences/20000000-0000-4000-8000-000000000001/logo-b1000000-0000-4000-8000-000000000001.png',
    'The Hague', null, null, 'NL', 'Europe/Amsterdam', (now() + interval '45 days')::date, (now() + interval '47 days')::date,
    'hello@hagueimun.example', 'mixed', 'English', 200, 13, 18, 'EUR',
    'published', null, null,
    true, true, 2,
    false,
    '10000000-0000-4000-8000-000000000001', null
  ),
  -- 2. Germany, two months out. It has a venue, where the row above has none.
  (
    '20000000-0000-4000-8000-000000000003', 'BERMUN 2026', 'bermun-2026',
    'Five days of debate in Berlin.',
    'A five-day conference hosted by an international school in Berlin, and one of the oldest in Europe. Delegations come from thirty countries.',
    'conferences/20000000-0000-4000-8000-000000000003/banner-b2000000-0000-4000-8000-000000000003.jpg',
    'conferences/20000000-0000-4000-8000-000000000003/logo-b1000000-0000-4000-8000-000000000003.png',
    'Berlin', 'John F. Kennedy School Berlin', 'Teltower Damm 87-93, 14167 Berlin', 'DE', 'Europe/Berlin', (now() + interval '62 days')::date, (now() + interval '66 days')::date,
    'hello@bermun.example', 'high_school', 'English', 350, 14, 19, 'EUR',
    'published', null, null,
    true, true, 3,
    true,
    '10000000-0000-4000-8000-000000000001', null
  ),
  -- 3. United States, four months out. The first of the two the other
  -- organization runs, which is what the search test looks for.
  (
    '20000000-0000-4000-8000-000000000005', 'Harvard Model United Nations 2027', 'hmun-2027',
    'Four days of debate in Boston.',
    'A four-day conference run by university students for high school delegates, with a crisis committee that runs from the first morning to the last.',
    'conferences/20000000-0000-4000-8000-000000000005/banner-b2000000-0000-4000-8000-000000000005.jpg',
    'conferences/20000000-0000-4000-8000-000000000005/logo-b1000000-0000-4000-8000-000000000005.png',
    'Boston', null, null, 'US', 'America/New_York', (now() + interval '133 days')::date, (now() + interval '136 days')::date,
    'hello@hmun.example', 'high_school', 'English', 400, 14, 19, 'USD',
    'published', null, null,
    true, true, 2,
    true,
    '10000000-0000-4000-8000-000000000002', null
  ),
  -- 4. Austria, five months out. University level, open for applications now,
  -- and the one conference here that takes no delegations: a university
  -- society signs its own members up rather than whole schools.
  (
    '20000000-0000-4000-8000-000000000010', 'Vienna University MUN 2027', 'viennamun-2027',
    'Four days of debate where the UN works.',
    'A four-day conference for university delegates, held in the city that hosts one of the four United Nations headquarters.',
    'conferences/20000000-0000-4000-8000-000000000010/banner-b2000000-0000-4000-8000-000000000010.jpg',
    'conferences/20000000-0000-4000-8000-000000000010/logo-b1000000-0000-4000-8000-000000000010.png',
    'Vienna', 'Vienna International Centre', 'Wagramer Strasse 5, 1220 Vienna', 'AT', 'Europe/Vienna', (now() + interval '146 days')::date, (now() + interval '149 days')::date,
    'hello@viennamun.example', 'university', 'English', 250, 18, 26, 'EUR',
    'published', now() - interval '10 days', now() + interval '60 days',
    true, false, 2,
    true,
    '10000000-0000-4000-8000-000000000001', null
  ),
  -- 5. Denmark, five months out. High school level, and applications have not
  -- opened yet, so a card can show the "Opens {date}" badge. It is also the one
  -- published conference with no committees: see the committees insert below.
  (
    '20000000-0000-4000-8000-000000000011', 'Copenhagen Schools MUN 2027', 'copenhagenmun-2027',
    'A first conference worth travelling for.',
    'A weekend conference for secondary school delegates, with committees that welcome anyone taking part for the first time.',
    'conferences/20000000-0000-4000-8000-000000000011/banner-b2000000-0000-4000-8000-000000000011.jpg',
    'conferences/20000000-0000-4000-8000-000000000011/logo-b1000000-0000-4000-8000-000000000011.png',
    'Copenhagen', null, null, 'DK', 'Europe/Copenhagen', (now() + interval '155 days')::date, (now() + interval '157 days')::date,
    'hello@copenhagenmun.example', 'high_school', 'English', 180, 14, 19, 'DKK',
    'published', now() + interval '45 days', now() + interval '120 days',
    true, true, 3,
    false,
    '10000000-0000-4000-8000-000000000001', null
  ),
  -- 6. Spain, six months out. Mixed level, and the application window has
  -- already shut, so the "open for applications" filter has something it must
  -- leave out.
  (
    '20000000-0000-4000-8000-000000000012', 'Madrid International MUN 2027', 'madridmun-2027',
    'Four days of debate in the heart of Madrid.',
    'A large spring conference where school and university delegates sit in the same committees and take turns chairing.',
    'conferences/20000000-0000-4000-8000-000000000012/banner-b2000000-0000-4000-8000-000000000012.jpg',
    'conferences/20000000-0000-4000-8000-000000000012/logo-b1000000-0000-4000-8000-000000000012.png',
    'Madrid', null, null, 'ES', 'Europe/Madrid', (now() + interval '176 days')::date, (now() + interval '179 days')::date,
    'hello@madridmun.example', 'mixed', 'Spanish and English', 400, 15, 25, 'EUR',
    'published', now() - interval '90 days', now() - interval '14 days',
    true, true, 2,
    true,
    '10000000-0000-4000-8000-000000000001', null
  ),
  -- 7. Japan, eight months out. The second of the two the other organization
  -- runs, and the only conference here outside Europe and North America.
  (
    '20000000-0000-4000-8000-000000000007', 'Tokyo Global MUN 2027', 'tokyomun-2027',
    'Four days of debate across Asia and beyond.',
    'A four-day conference that brings university delegates from across Asia together with visitors from further afield.',
    'conferences/20000000-0000-4000-8000-000000000007/banner-b2000000-0000-4000-8000-000000000007.jpg',
    'conferences/20000000-0000-4000-8000-000000000007/logo-b1000000-0000-4000-8000-000000000007.png',
    'Tokyo', null, null, 'JP', 'Asia/Tokyo', (now() + interval '246 days')::date, (now() + interval '249 days')::date,
    'hello@tokyomun.example', 'university', 'English', 300, 18, 26, 'JPY',
    'published', null, null,
    true, true, 2,
    false,
    '10000000-0000-4000-8000-000000000002', null
  ),
  -- 8. Netherlands, nine months out. The conference the apply, allocation and
  -- committee pages work with: it is open for applications and it has the three
  -- committees with seats in them.
  (
    '20000000-0000-4000-8000-000000000009', 'Amsterdam Open MUN 2027', 'amsterdammun-2027',
    'Three days of debate on the water.',
    'A three-day conference in Amsterdam, open to delegates from any school or university. Applications are open now.

Committees run from beginner to advanced, and the organisers place first-time delegates with an experienced partner wherever they can.',
    'conferences/20000000-0000-4000-8000-000000000009/banner-40000000-0000-4000-8000-000000000009.jpg',
    'conferences/20000000-0000-4000-8000-000000000009/logo-b1000000-0000-4000-8000-000000000009.png',
    'Amsterdam', 'Beurs van Berlage', 'Damrak 243, 1012 ZJ Amsterdam', 'NL', 'Europe/Amsterdam', (now() + interval '274 days')::date, (now() + interval '276 days')::date,
    'hello@amsterdammun.example', 'mixed', 'English', 300, 14, 24, 'EUR',
    'published', now() - interval '14 days', now() + interval '90 days',
    true, true, 2,
    true,
    '10000000-0000-4000-8000-000000000001', null
  ),
  -- 9. Netherlands, six months ago. This conference is over: its last day has
  -- passed, and its applications shut long before that. It is here so a test can
  -- prove that the directory leaves a finished conference out, even though it is
  -- published. It has no committees of its own, which is what lets
  -- `tests/e2e/committees.spec.ts` make one on it and delete it again.
  (
    '20000000-0000-4000-8000-000000000016', 'Rotterdam Spring MUN 2026', 'rotterdammun-2026',
    'Three days of debate in the port city.',
    'A three-day conference in Rotterdam for school and university delegates, kept in the sample data as one that has already taken place.',
    'conferences/20000000-0000-4000-8000-000000000016/banner-b2000000-0000-4000-8000-000000000016.jpg',
    'conferences/20000000-0000-4000-8000-000000000016/logo-b1000000-0000-4000-8000-000000000016.png',
    'Rotterdam', null, null, 'NL', 'Europe/Amsterdam', (now() - interval '195 days')::date, (now() - interval '193 days')::date,
    'hello@rotterdammun.example', 'mixed', 'English', 200, 15, 24, 'EUR',
    'published', now() - interval '400 days', now() - interval '300 days',
    true, true, 2,
    true,
    '10000000-0000-4000-8000-000000000001', null
  ),
  -- 10. Belgium, seven months out. Its own row rather than a shared one, because
  -- `tests/e2e/home.spec.ts` puts a fresh test account on its staff and writes
  -- an event to its programme in every browser project at once, and none of the
  -- conferences above is free of a role or a fixture some other test relies on
  -- staying put. It has no committees of its own, the same as Copenhagen.
  (
    '20000000-0000-4000-8000-000000000004', 'Brussels European MUN 2027', 'brusselsmun-2027',
    'Four days of debate steps from the European institutions.',
    'A four-day conference for school delegates, held in the city that hosts the European Parliament, with committees modelled on both the UN and the EU.',
    'conferences/20000000-0000-4000-8000-000000000004/banner-b2000000-0000-4000-8000-000000000004.jpg',
    'conferences/20000000-0000-4000-8000-000000000004/logo-b1000000-0000-4000-8000-000000000004.png',
    'Brussels', null, null, 'BE', 'Europe/Brussels', (now() + interval '215 days')::date, (now() + interval '218 days')::date,
    'hello@brusselsmun.example', 'high_school', 'English and French', 220, 14, 19, 'EUR',
    'published', null, null,
    true, true, 2,
    false,
    '10000000-0000-4000-8000-000000000001', null
  )
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- The two conferences nobody but their organisers may see
-- -----------------------------------------------------------------------------
-- A draft is a conference an organiser is still setting up, and Row Level
-- Security keeps it out of every visitor's results. The first belongs to the
-- organization that runs most of the sample data; the second is the only
-- conference the third organization has, which is why its public page shows
-- "No upcoming conferences." to a visitor although the organization is busy.
-- That is the edge case `05-pages/public/organization.md` names.
--
-- WHY THIS INSERT NAMES SO FEW COLUMNS
-- These are the columns the app's "create a conference" form saves, and nothing
-- else. If this insert works, the app's own insert will not trip over a missing
-- column default either. If you get 'null value in column "x" violates not-null
-- constraint', the app would hit the same error, so give that column a default
-- instead of only changing this file.

insert into public.conferences (
  id, name, slug,
  description,
  city, country_code, start_date, end_date,
  status, organization_id, created_by
)
values
  (
    '20000000-0000-4000-8000-000000000008', 'Draft Conference (not public)', 'draft-conference-2027',
    'A conference that is still being set up and has not been made public.',
    'Utrecht', 'NL', (now() + interval '260 days')::date, (now() + interval '262 days')::date,
    'draft', '10000000-0000-4000-8000-000000000001', null
  ),
  (
    '20000000-0000-4000-8000-000000000017', 'First-Year MUN 2027 (not public)', 'first-year-mun-2027',
    'A first conference that is still being set up and has not been made public.',
    'Cork', 'IE', (now() + interval '300 days')::date, (now() + interval '302 days')::date,
    'draft', '10000000-0000-4000-8000-000000000003', null
  )
on conflict (id) do nothing;

-- The two drafts get their pictures afterwards, the way an organiser adds them
-- on the details page after creating the conference, so the insert above stays
-- the create form's columns and nothing else. `is null` leaves alone a picture
-- somebody has already changed.
update public.conferences
set
  banner_path = 'conferences/20000000-0000-4000-8000-000000000008/banner-b2000000-0000-4000-8000-000000000008.jpg',
  logo_path = 'conferences/20000000-0000-4000-8000-000000000008/logo-b1000000-0000-4000-8000-000000000008.png'
where id = '20000000-0000-4000-8000-000000000008'
  and banner_path is null
  and logo_path is null;

update public.conferences
set
  banner_path = 'conferences/20000000-0000-4000-8000-000000000017/banner-b2000000-0000-4000-8000-000000000017.jpg',
  logo_path = 'conferences/20000000-0000-4000-8000-000000000017/logo-b1000000-0000-4000-8000-000000000017.png'
where id = '20000000-0000-4000-8000-000000000017'
  and banner_path is null
  and logo_path is null;

-- How each published conference opens its applications. The column's default
-- is 'manual', which keeps applications shut until an organiser opens them by
-- hand, so without this every row above with no opening date would be closed.
-- These were written as "open as soon as published" (no date) or "open on a
-- date" (a date), so they say so. Drafts keep the default, as a new one would.
update public.conferences
set application_open_mode = case
  when applications_open_at is null then 'on_publish'
  else 'scheduled'
end::public.application_open_mode
where status <> 'draft'
  and id::text like '20000000-0000-4000-8000-%';


-- -----------------------------------------------------------------------------
-- Committees
-- -----------------------------------------------------------------------------
-- Two committees for each published conference that is still to come, and three
-- for Amsterdam Open MUN 2027, which is the conference the apply, allocation
-- and committee pages work with. They are at different levels, so the level
-- badge and the "which committee suits me" part of the apply form have
-- something real to show.
--
-- The one published conference with no committees is Copenhagen Schools MUN
-- 2027. A conference is published before its committees are decided, and
-- `specs/05-pages/public/conference.md` asks the page to say
-- "Committees will be announced soon." when that is where an organiser has got
-- to. Copenhagen is the row that says it. Rotterdam Spring MUN 2026 has none
-- either, for the reason its own comment above gives.
--
-- The committees are listed here in the order their conferences appear above.
-- Amsterdam's three keep the numbers 1 to 3 although they come last, because
-- the browser tests name them by id and those ids may not move.
--
-- There are no committee_chairs rows: a chair is a real account from auth.users
-- and this file has only the three it makes further down, none of which chairs
-- anything. Chairs appear when an organiser invites somebody in the app.

insert into public.committees (
  id, conference_id, slug,
  name, abbreviation,
  description,
  topics,
  level, room, position, default_speaking_time_seconds
)
values
  -- The Hague International MUN Junior: two beginner committees, because every
  -- delegate at this conference is taking part for the first time.
  (
    '30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'general-assembly-first',
    'United Nations General Assembly First Committee', 'GA1',
    'Disarmament and international security, in the biggest room at the conference. Every delegation has a seat and every delegation may speak.',
    array['Small arms in West Africa', 'Keeping outer space free of weapons'],
    'beginner', 'Zaal 1', 1, 120
  ),
  (
    '30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', 'unicef',
    'United Nations Children''s Fund', 'UNICEF',
    'A small committee for delegates who have never done this before. The chairs explain each rule of procedure before it is used.',
    array['Education for children in refugee camps', 'Ending child labour in supply chains'],
    'beginner', 'Zaal 2', 2, 120
  ),

  -- BERMUN 2026: one ordinary committee and one crisis cabinet, which is where
  -- the seats are people rather than countries.
  (
    '30000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000003', 'world-health-assembly',
    'World Health Assembly', 'WHA',
    'The health committee of the United Nations system, where every member state has a vote and the resolutions are long.',
    array['Access to vaccines in low-income countries', 'Mental health care for young people'],
    'intermediate', 'Aula', 1, 90
  ),
  (
    '30000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000003', 'arctic-crisis-cabinet',
    'Arctic Crisis Cabinet', 'ACC',
    'A crisis committee. Each delegate takes one seat in a national cabinet rather than a country, and the crisis updates arrive through the weekend.',
    array['A shipping lane opens through the Arctic', 'Who owns the seabed'],
    'advanced', 'Bibliothek', 2, 60
  ),

  -- Harvard Model United Nations 2027.
  (
    '30000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000005', 'economic-and-social-council',
    'Economic and Social Council', 'ECOSOC',
    'Where the money questions are argued: development, trade and the funding of everything the other committees ask for.',
    array['Financing the Sustainable Development Goals', 'Fair pay in global supply chains'],
    'intermediate', 'Grand Ballroom', 1, 90
  ),
  (
    '30000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000005', 'disarmament-commission',
    'United Nations Disarmament Commission', 'UNDC',
    'Fast debate for delegates who have chaired before. Position papers are read before the conference and quoted back at their authors.',
    array['Autonomous weapons systems', 'Rebuilding the nuclear test ban regime'],
    'advanced', 'Back Bay Room', 2, 60
  ),

  -- Vienna University MUN 2027, in the city both of these bodies really sit in.
  (
    '30000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000010', 'atomic-energy-agency',
    'International Atomic Energy Agency', 'IAEA',
    'A technical committee. Delegates are expected to know the difference between a safeguards agreement and a protocol before the first session.',
    array['Safeguards on civilian nuclear programmes', 'Nuclear power and the energy transition'],
    'advanced', 'Board Room C', 1, 60
  ),
  (
    '30000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000010', 'office-on-drugs-and-crime',
    'United Nations Office on Drugs and Crime', 'UNODC',
    'Two days on organised crime across borders, with a joint session with the committee above on the last morning.',
    array['Trafficking routes through Central Asia', 'Treating addiction as a health question'],
    'intermediate', 'Board Room D', 2, 90
  ),

  -- Madrid International MUN 2027, where school and university delegates sit
  -- together.
  (
    '30000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000012', 'general-assembly-plenary',
    'United Nations General Assembly Plenary', 'GA',
    'The whole assembly in one room, including the observers, who may speak but not vote.',
    array['The right to water', 'Reforming the Security Council'],
    'beginner', 'Sala Goya', 1, 120
  ),
  (
    '30000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000012', 'refugee-agency',
    'United Nations High Commissioner for Refugees', 'UNHCR',
    'A committee about people rather than states, and the one at this conference that asks delegates to agree on numbers.',
    array['Resettlement quotas in Europe', 'Schooling for children in long-term camps'],
    'intermediate', 'Sala Velazquez', 2, 90
  ),

  -- Tokyo Global MUN 2027.
  (
    '30000000-0000-4000-8000-000000000014', '20000000-0000-4000-8000-000000000007', 'general-assembly-third',
    'United Nations General Assembly Third Committee', 'GA3',
    'Social, humanitarian and cultural questions. The committee most delegates start with, and the one with the longest speakers list.',
    array['Freedom of assembly', 'The rights of migrant workers'],
    'beginner', 'Hall 1', 1, 120
  ),
  (
    '30000000-0000-4000-8000-000000000015', '20000000-0000-4000-8000-000000000007', 'asia-pacific-forum',
    'Asia-Pacific Regional Forum', 'APRF',
    'A regional body invented for this conference, so that the delegations nearest to it have something of their own to argue about.',
    array['Disaster relief across the Pacific', 'Fishing rights in the South China Sea'],
    'intermediate', 'Hall 2', 2, 90
  ),

  -- Amsterdam Open MUN 2027: three committees, one at each level.
  (
    '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000009', 'security-council',
    'United Nations Security Council', 'UNSC',
    'The fifteen-member council that decides on peace and security. Fast debate, a crisis on the second day, and the veto in the hands of the five permanent members.',
    array['The situation in the Sahel', 'Maritime security in the Gulf of Guinea'],
    'advanced', 'Grote Zaal', 1, 60
  ),
  (
    '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000009', 'human-rights-council',
    'United Nations Human Rights Council', 'UNHRC',
    'Ten delegations debating two resolutions on the rights of people who have had to leave their homes.',
    array['Protecting climate-displaced people', 'Freedom of the press in conflict zones'],
    'intermediate', 'Effectenbeurszaal', 2, 90
  ),
  (
    '30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000009', 'environment-assembly',
    'United Nations Environment Assembly', 'UNEA',
    'A beginner committee. The chairs explain every rule of procedure before it is used, and the topics are written so a first-time delegate can research them in an evening.',
    array['Plastic waste in the North Sea', 'Funding the transition to clean energy'],
    'beginner', 'Berlagezaal', 3, 120
  )
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- Seats
-- -----------------------------------------------------------------------------
-- Every seat starts free: user_id is null. Two of Amsterdam's are filled at the
-- bottom of this file, once the accounts that sit in them exist.
--
-- The country_code is what puts a flag next to the name. A seat whose kind is
-- 'character' or 'observer' is a person or a body rather than a country, so it
-- has no flag and its country_code is null; the Arctic Crisis Cabinet is made
-- of those, and the Madrid plenary has one observer among its countries.
--
-- The committees are in the same order as the insert above. The Security
-- Council seats are its real fifteen members, five permanent and ten elected.
-- The last UNEA seat is is_available = false, an example of a seat an organiser
-- has decided not to offer this year; visitors never see it, because the
-- public_seats view leaves those rows out.

insert into public.seats (committee_id, name, kind, country_code, position, is_available)
values
  -- The Hague: General Assembly First Committee.
  ('30000000-0000-4000-8000-000000000004', 'Brazil', 'country', 'BR', 1, true),
  ('30000000-0000-4000-8000-000000000004', 'Egypt', 'country', 'EG', 2, true),
  ('30000000-0000-4000-8000-000000000004', 'France', 'country', 'FR', 3, true),
  ('30000000-0000-4000-8000-000000000004', 'India', 'country', 'IN', 4, true),
  ('30000000-0000-4000-8000-000000000004', 'Nigeria', 'country', 'NG', 5, true),
  ('30000000-0000-4000-8000-000000000004', 'Poland', 'country', 'PL', 6, true),

  -- The Hague: UNICEF.
  ('30000000-0000-4000-8000-000000000005', 'Colombia', 'country', 'CO', 1, true),
  ('30000000-0000-4000-8000-000000000005', 'Ghana', 'country', 'GH', 2, true),
  ('30000000-0000-4000-8000-000000000005', 'Ireland', 'country', 'IE', 3, true),
  ('30000000-0000-4000-8000-000000000005', 'Jordan', 'country', 'JO', 4, true),
  ('30000000-0000-4000-8000-000000000005', 'Thailand', 'country', 'TH', 5, true),
  ('30000000-0000-4000-8000-000000000005', 'Ukraine', 'country', 'UA', 6, true),

  -- BERMUN: World Health Assembly.
  ('30000000-0000-4000-8000-000000000006', 'Argentina', 'country', 'AR', 1, true),
  ('30000000-0000-4000-8000-000000000006', 'Ethiopia', 'country', 'ET', 2, true),
  ('30000000-0000-4000-8000-000000000006', 'Italy', 'country', 'IT', 3, true),
  ('30000000-0000-4000-8000-000000000006', 'Malaysia', 'country', 'MY', 4, true),
  ('30000000-0000-4000-8000-000000000006', 'South Africa', 'country', 'ZA', 5, true),
  ('30000000-0000-4000-8000-000000000006', 'Switzerland', 'country', 'CH', 6, true),

  -- BERMUN: Arctic Crisis Cabinet. Seats in a cabinet, so no country and no flag.
  ('30000000-0000-4000-8000-000000000007', 'Minister of Foreign Affairs', 'character', null, 1, true),
  ('30000000-0000-4000-8000-000000000007', 'Minister of Defence', 'character', null, 2, true),
  ('30000000-0000-4000-8000-000000000007', 'Minister of Energy', 'character', null, 3, true),
  ('30000000-0000-4000-8000-000000000007', 'Chief of the Coast Guard', 'character', null, 4, true),
  ('30000000-0000-4000-8000-000000000007', 'National Security Adviser', 'character', null, 5, true),
  ('30000000-0000-4000-8000-000000000007', 'Special Envoy for the Arctic', 'character', null, 6, true),

  -- Harvard: Economic and Social Council.
  ('30000000-0000-4000-8000-000000000008', 'Bangladesh', 'country', 'BD', 1, true),
  ('30000000-0000-4000-8000-000000000008', 'Canada', 'country', 'CA', 2, true),
  ('30000000-0000-4000-8000-000000000008', 'Chile', 'country', 'CL', 3, true),
  ('30000000-0000-4000-8000-000000000008', 'Japan', 'country', 'JP', 4, true),
  ('30000000-0000-4000-8000-000000000008', 'Kenya', 'country', 'KE', 5, true),
  ('30000000-0000-4000-8000-000000000008', 'Norway', 'country', 'NO', 6, true),

  -- Harvard: Disarmament Commission.
  ('30000000-0000-4000-8000-000000000009', 'Australia', 'country', 'AU', 1, true),
  ('30000000-0000-4000-8000-000000000009', 'Germany', 'country', 'DE', 2, true),
  ('30000000-0000-4000-8000-000000000009', 'Mexico', 'country', 'MX', 3, true),
  ('30000000-0000-4000-8000-000000000009', 'Pakistan', 'country', 'PK', 4, true),
  ('30000000-0000-4000-8000-000000000009', 'Sweden', 'country', 'SE', 5, true),
  ('30000000-0000-4000-8000-000000000009', 'United Kingdom', 'country', 'GB', 6, true),

  -- Vienna: International Atomic Energy Agency.
  ('30000000-0000-4000-8000-000000000010', 'Argentina', 'country', 'AR', 1, true),
  ('30000000-0000-4000-8000-000000000010', 'Canada', 'country', 'CA', 2, true),
  ('30000000-0000-4000-8000-000000000010', 'France', 'country', 'FR', 3, true),
  ('30000000-0000-4000-8000-000000000010', 'Japan', 'country', 'JP', 4, true),
  ('30000000-0000-4000-8000-000000000010', 'Russian Federation', 'country', 'RU', 5, true),
  ('30000000-0000-4000-8000-000000000010', 'United States', 'country', 'US', 6, true),

  -- Vienna: Office on Drugs and Crime.
  ('30000000-0000-4000-8000-000000000011', 'Afghanistan', 'country', 'AF', 1, true),
  ('30000000-0000-4000-8000-000000000011', 'Colombia', 'country', 'CO', 2, true),
  ('30000000-0000-4000-8000-000000000011', 'Netherlands', 'country', 'NL', 3, true),
  ('30000000-0000-4000-8000-000000000011', 'Peru', 'country', 'PE', 4, true),
  ('30000000-0000-4000-8000-000000000011', 'Portugal', 'country', 'PT', 5, true),
  ('30000000-0000-4000-8000-000000000011', 'Viet Nam', 'country', 'VN', 6, true),

  -- Madrid: General Assembly Plenary, with one observer among the member states.
  ('30000000-0000-4000-8000-000000000012', 'Brazil', 'country', 'BR', 1, true),
  ('30000000-0000-4000-8000-000000000012', 'Egypt', 'country', 'EG', 2, true),
  ('30000000-0000-4000-8000-000000000012', 'Indonesia', 'country', 'ID', 3, true),
  ('30000000-0000-4000-8000-000000000012', 'Mexico', 'country', 'MX', 4, true),
  ('30000000-0000-4000-8000-000000000012', 'Spain', 'country', 'ES', 5, true),
  ('30000000-0000-4000-8000-000000000012', 'Turkey', 'country', 'TR', 6, true),
  ('30000000-0000-4000-8000-000000000012', 'Holy See', 'observer', null, 7, true),

  -- Madrid: High Commissioner for Refugees.
  ('30000000-0000-4000-8000-000000000013', 'Bangladesh', 'country', 'BD', 1, true),
  ('30000000-0000-4000-8000-000000000013', 'Greece', 'country', 'GR', 2, true),
  ('30000000-0000-4000-8000-000000000013', 'Jordan', 'country', 'JO', 3, true),
  ('30000000-0000-4000-8000-000000000013', 'Lebanon', 'country', 'LB', 4, true),
  ('30000000-0000-4000-8000-000000000013', 'Sweden', 'country', 'SE', 5, true),
  ('30000000-0000-4000-8000-000000000013', 'Uganda', 'country', 'UG', 6, true),

  -- Tokyo: General Assembly Third Committee.
  ('30000000-0000-4000-8000-000000000014', 'Cambodia', 'country', 'KH', 1, true),
  ('30000000-0000-4000-8000-000000000014', 'Philippines', 'country', 'PH', 2, true),
  ('30000000-0000-4000-8000-000000000014', 'Qatar', 'country', 'QA', 3, true),
  ('30000000-0000-4000-8000-000000000014', 'Republic of Korea', 'country', 'KR', 4, true),
  ('30000000-0000-4000-8000-000000000014', 'South Africa', 'country', 'ZA', 5, true),
  ('30000000-0000-4000-8000-000000000014', 'United Arab Emirates', 'country', 'AE', 6, true),

  -- Tokyo: Asia-Pacific Regional Forum.
  ('30000000-0000-4000-8000-000000000015', 'Australia', 'country', 'AU', 1, true),
  ('30000000-0000-4000-8000-000000000015', 'Fiji', 'country', 'FJ', 2, true),
  ('30000000-0000-4000-8000-000000000015', 'India', 'country', 'IN', 3, true),
  ('30000000-0000-4000-8000-000000000015', 'Indonesia', 'country', 'ID', 4, true),
  ('30000000-0000-4000-8000-000000000015', 'Japan', 'country', 'JP', 5, true),
  ('30000000-0000-4000-8000-000000000015', 'New Zealand', 'country', 'NZ', 6, true),

  -- Amsterdam: the Security Council's five permanent members first.
  ('30000000-0000-4000-8000-000000000001', 'China', 'country', 'CN', 1, true),
  ('30000000-0000-4000-8000-000000000001', 'France', 'country', 'FR', 2, true),
  ('30000000-0000-4000-8000-000000000001', 'Russian Federation', 'country', 'RU', 3, true),
  ('30000000-0000-4000-8000-000000000001', 'United Kingdom', 'country', 'GB', 4, true),
  ('30000000-0000-4000-8000-000000000001', 'United States', 'country', 'US', 5, true),
  -- Then the ten elected members.
  ('30000000-0000-4000-8000-000000000001', 'Algeria', 'country', 'DZ', 6, true),
  ('30000000-0000-4000-8000-000000000001', 'Denmark', 'country', 'DK', 7, true),
  ('30000000-0000-4000-8000-000000000001', 'Greece', 'country', 'GR', 8, true),
  ('30000000-0000-4000-8000-000000000001', 'Guyana', 'country', 'GY', 9, true),
  ('30000000-0000-4000-8000-000000000001', 'Japan', 'country', 'JP', 10, true),
  ('30000000-0000-4000-8000-000000000001', 'Pakistan', 'country', 'PK', 11, true),
  ('30000000-0000-4000-8000-000000000001', 'Panama', 'country', 'PA', 12, true),
  ('30000000-0000-4000-8000-000000000001', 'Sierra Leone', 'country', 'SL', 13, true),
  ('30000000-0000-4000-8000-000000000001', 'Slovenia', 'country', 'SI', 14, true),
  ('30000000-0000-4000-8000-000000000001', 'Somalia', 'country', 'SO', 15, true),

  -- Amsterdam: United Nations Human Rights Council.
  ('30000000-0000-4000-8000-000000000002', 'Argentina', 'country', 'AR', 1, true),
  ('30000000-0000-4000-8000-000000000002', 'Bangladesh', 'country', 'BD', 2, true),
  ('30000000-0000-4000-8000-000000000002', 'Brazil', 'country', 'BR', 3, true),
  ('30000000-0000-4000-8000-000000000002', 'Germany', 'country', 'DE', 4, true),
  ('30000000-0000-4000-8000-000000000002', 'India', 'country', 'IN', 5, true),
  ('30000000-0000-4000-8000-000000000002', 'Kenya', 'country', 'KE', 6, true),
  ('30000000-0000-4000-8000-000000000002', 'Morocco', 'country', 'MA', 7, true),
  ('30000000-0000-4000-8000-000000000002', 'Netherlands', 'country', 'NL', 8, true),
  ('30000000-0000-4000-8000-000000000002', 'Philippines', 'country', 'PH', 9, true),
  ('30000000-0000-4000-8000-000000000002', 'South Africa', 'country', 'ZA', 10, true),

  -- Amsterdam: United Nations Environment Assembly.
  ('30000000-0000-4000-8000-000000000003', 'Australia', 'country', 'AU', 1, true),
  ('30000000-0000-4000-8000-000000000003', 'Canada', 'country', 'CA', 2, true),
  ('30000000-0000-4000-8000-000000000003', 'Chile', 'country', 'CL', 3, true),
  ('30000000-0000-4000-8000-000000000003', 'Egypt', 'country', 'EG', 4, true),
  ('30000000-0000-4000-8000-000000000003', 'Indonesia', 'country', 'ID', 5, true),
  ('30000000-0000-4000-8000-000000000003', 'Norway', 'country', 'NO', 6, true),
  ('30000000-0000-4000-8000-000000000003', 'Sweden', 'country', 'SE', 7, true),
  -- Not offered this year. Visitors never see this row.
  ('30000000-0000-4000-8000-000000000003', 'Tuvalu', 'country', 'TV', 8, false)
on conflict (committee_id, name) do nothing;


-- -----------------------------------------------------------------------------
-- Three sample accounts
-- -----------------------------------------------------------------------------
-- Everything above this line is rows nobody owns. Three things cannot be shown
-- that way: an accepted delegate is an account sitting in a seat, a delegation
-- is an account that registered one, and the whole organiser side of the app is
-- only reachable by an account that belongs to an organization. So this file
-- makes three accounts, and it is the only place in the repository that writes
-- to auth.users by hand.
--
-- WHY THIS IS SAFE HERE AND NOWHERE ELSE
-- auth.users belongs to Supabase Auth, and the application may never touch it;
-- the handle_new_user trigger is what fills profiles and profile_details from
-- it. This file runs as the "postgres" user on a throwaway local database that
-- `pnpm db:reset` rebuilds from nothing, and these three rows never leave it.
-- The browser and database tests still make their own accounts through the real
-- sign-up, because that is the thing they are testing.
--
-- The password below is the same for all three and is written down on purpose:
-- it is the local sample data, not a secret. Sign in with "sample-password-123"
-- as
--   sample.delegate@example.test   a delegate with a seat in a committee
--   sample.head@example.test       the head of a school's delegation
--   sample.organiser@example.test  an owner of Sample Europe MUN Network, so
--                                  /manage, the conference dashboards and the
--                                  applications queues all have something in them
--
-- The four empty strings at the end are columns Supabase Auth declares "not
-- null" and fills with an empty string when there is no token outstanding.
-- Leaving them out makes sign-in fail with an error that says nothing useful.

insert into auth.users (
  instance_id, id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '50000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated',
    'sample.delegate@example.test',
    extensions.crypt('sample-password-123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Sofia Almeida"}'::jsonb,
    now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '50000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated',
    'sample.head@example.test',
    extensions.crypt('sample-password-123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Jasper de Vries"}'::jsonb,
    now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '50000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated',
    'sample.organiser@example.test',
    extensions.crypt('sample-password-123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Hugo Meijer"}'::jsonb,
    now(), now(),
    '', '', '', ''
  )
on conflict (id) do nothing;

-- Supabase Auth keeps one row per way of signing in. Without an "email" row
-- here the account exists but the password is never checked against anything,
-- and signing in fails.
insert into auth.identities (
  id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
)
values
  (
    '50000000-0000-4000-8000-00000000000a',
    '50000000-0000-4000-8000-000000000001',
    'email',
    '50000000-0000-4000-8000-000000000001',
    '{"sub":"50000000-0000-4000-8000-000000000001","email":"sample.delegate@example.test","email_verified":true,"phone_verified":false}'::jsonb,
    now(), now(), now()
  ),
  (
    '50000000-0000-4000-8000-00000000000b',
    '50000000-0000-4000-8000-000000000002',
    'email',
    '50000000-0000-4000-8000-000000000002',
    '{"sub":"50000000-0000-4000-8000-000000000002","email":"sample.head@example.test","email_verified":true,"phone_verified":false}'::jsonb,
    now(), now(), now()
  ),
  (
    '50000000-0000-4000-8000-00000000000c',
    '50000000-0000-4000-8000-000000000003',
    'email',
    '50000000-0000-4000-8000-000000000003',
    '{"sub":"50000000-0000-4000-8000-000000000003","email":"sample.organiser@example.test","email_verified":true,"phone_verified":false}'::jsonb,
    now(), now(), now()
  )
on conflict (id) do nothing;

-- handle_new_user made a profile for each of them with the name from
-- raw_user_meta_data. These updates fill in the rest, so the seat list, the
-- delegation page and the team page have a country and an institution to show,
-- and finish the onboarding so none of the three is sent to /welcome.
update public.profiles
set institution_name = 'Universidade de Lisboa',
    country_code = 'PT',
    experience_level = 'intermediate',
    onboarding_completed_at = now()
where id = '50000000-0000-4000-8000-000000000001';

update public.profiles
set institution_name = 'Rotterdam Grammar School',
    country_code = 'NL',
    experience_level = 'advanced',
    onboarding_completed_at = now()
where id = '50000000-0000-4000-8000-000000000002';

update public.profiles
set institution_name = 'Sample Europe MUN Network',
    country_code = 'NL',
    experience_level = 'advanced',
    onboarding_completed_at = now()
where id = '50000000-0000-4000-8000-000000000003';


-- -----------------------------------------------------------------------------
-- The organiser's membership
-- -----------------------------------------------------------------------------
-- What makes the third account an organiser rather than another delegate. An
-- owner of an organization may run every conference it puts on, which
-- can_manage_conference spells out, so this one row opens /manage, every
-- conference dashboard of Sample Europe MUN Network, and the applications,
-- allocation and team pages under each of them.
--
-- The app never writes a row like this by hand: the
-- add_organization_creator_as_owner trigger writes it when somebody creates an
-- organization, and accept_invite writes it when somebody accepts an
-- invitation. Neither can run here, because the organizations above were
-- inserted before this account existed and nobody has sent an invitation, so
-- the row is written out.
--
-- The other two organizations are left without members on purpose. Sample
-- Global MUN Circle is the organisation a test names when it needs one no
-- account here belongs to, and Sample First-Year MUN Society is the one
-- `tests/e2e/manage.spec.ts` invites an account into.

insert into public.organization_members (organization_id, user_id, role)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000003',
    'owner'
  )
on conflict (organization_id, user_id) do nothing;


-- -----------------------------------------------------------------------------
-- The first road into a seat: one accepted individual application
-- -----------------------------------------------------------------------------
-- Sofia applied to Amsterdam Open MUN 2027 on her own, the organisers accepted
-- her, and she represents Morocco in the Human Rights Council.
--
-- WHICH SEATS THIS FILE MAY USE
-- The browser tests hand seats to their own throwaway delegates and expect to
-- find them free, so every one of those is out of bounds here:
--   Human Rights Council: Argentina, Brazil and Kenya (committee-page.spec.ts),
--     Bangladesh, Germany and India (profile.spec.ts)
--   Environment Assembly: Egypt, Indonesia, Norway, Sweden and Canada
--     (home.spec.ts)
--   Security Council: all fifteen, because committee-page.spec.ts checks that a
--     visitor sees no "Taken" badge anywhere on that committee's page
-- That leaves Morocco, the Netherlands, the Philippines and South Africa in the
-- Human Rights Council, and Australia and Chile in the Environment Assembly.
-- Add a seat to one of those lists and this file has to give one back. The
-- seats of the other conferences are all free and no test reads them.

insert into public.applications (
  id, conference_id, user_id, status,
  committee_preferences, seat_preferences, motivation,
  submitted_at, decided_at
)
values
  (
    '60000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000009',
    '50000000-0000-4000-8000-000000000001',
    'accepted',
    array['30000000-0000-4000-8000-000000000002'::uuid, '30000000-0000-4000-8000-000000000001'::uuid],
    'A European seat, ideally one with a climate portfolio.',
    'I chaired twice at school and I would like to sit as a delegate again before I graduate.',
    now() - interval '20 days', now() - interval '12 days'
  )
on conflict (id) do nothing;

-- Seats have no fixed ids, so this one is found by its committee and name. The
-- check_seat_allocation trigger checks that the application belongs to the same
-- conference, which it does.
update public.seats
set user_id = '50000000-0000-4000-8000-000000000001',
    application_id = '60000000-0000-4000-8000-000000000001',
    allocated_at = now() - interval '12 days'
where committee_id = '30000000-0000-4000-8000-000000000002'
  and name = 'Morocco';


-- -----------------------------------------------------------------------------
-- The second road into a seat: one delegation with seats reserved for it
-- -----------------------------------------------------------------------------
-- Jasper registered his school as a group and the organisers reserved two
-- Environment Assembly seats for it, Australia and Chile, the two that list
-- above leaves free. Neither is filled: that is what the head does on
-- /delegations/[id]/seats, and it is the state the allocation grid and the seat
-- list have to be able to draw.
--
-- A reserved seat is not a taken seat. public_seats.is_taken asks about user_id
-- alone, so a visitor still sees Australia and Chile as seats on offer, which
-- is what the committee page's browser tests count on.

insert into public.delegations (
  id, conference_id, name, institution_name, country_code,
  status, requested_seats, note, join_code, submitted_at, decided_at
)
values
  (
    '60000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000009',
    'Rotterdam Grammar Delegation',
    'Rotterdam Grammar School',
    'NL',
    'accepted', 4,
    'We would like to bring four students, two of them first-timers.',
    'RGSMUN27',
    now() - interval '18 days', now() - interval '10 days'
  )
on conflict (id) do nothing;

insert into public.delegation_members (delegation_id, user_id, role)
values
  (
    '60000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000002',
    'head'
  )
on conflict (delegation_id, user_id) do nothing;

update public.seats
set delegation_id = '60000000-0000-4000-8000-000000000002',
    allocated_at = now() - interval '10 days'
where committee_id = '30000000-0000-4000-8000-000000000003'
  and name in ('Australia', 'Chile');


-- -----------------------------------------------------------------------------
-- Fees and invoices, on the conference that has already taken place
-- -----------------------------------------------------------------------------
-- The two invoice pages need invoices to show, and nothing in the app writes
-- one until an organiser is finished with Stripe onboarding. A conference that
-- collects its money outside MUNMeet needs no Stripe at all -- canAddFees in
-- client/src/lib/fees.ts is "isStripeConnected or collectsPaymentsManually" --
-- so Rotterdam Spring MUN 2026 becomes that conference here, and the invoices
-- below are written straight into the table.
--
-- WHY THIS CONFERENCE AND NOT ANOTHER
-- Rotterdam Spring MUN 2026 is the one conference in this file that has already
-- happened. The directory leaves those out, so the counts the browser tests
-- make of it do not move, and no apply page can grow a fee line underneath a
-- test that was not expecting one.
--
-- WHY THE ROWS CAN BE WRITTEN BY HAND AT ALL
-- guard_invoice_insert, which numbers an invoice and forces it to be born
-- unpaid, returns early for anybody who is not "anon" or "authenticated". This
-- file runs as "postgres", so it has to supply the number, the currency and the
-- status itself. compute_invoice_amount still runs for everyone, so
-- amount_cents and platform_fee_cents are left out and worked out by the
-- database. The numbers follow next_invoice_number's own format, "<slug>-0001",
-- so that an invoice an organiser adds afterwards carries on the count.

update public.conferences
set collects_payments_manually = true,
    payment_instructions = 'Transfer the amount to NL91 ABNA 0417 1643 00, in the name of Stichting Rotterdam MUN, quoting your invoice number. We mark your invoice as paid within three working days.'
where id = '20000000-0000-4000-8000-000000000016';

insert into public.fees (id, conference_id, name, amount_cents, applies_to, position)
values
  (
    '70000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000016',
    'Delegate fee', 6500, 'individual', 0
  ),
  (
    '70000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000016',
    'School delegate fee', 5500, 'delegation_member', 1
  )
on conflict (id) do nothing;

-- Jasper brought three students from his school to this one, so there is a
-- group invoice as well as Sofia's two individual ones. He is its head, which
-- is the other way somebody reads an invoice: listMyInvoices in
-- client/src/lib/server/invoices.ts asks for the invoices of every delegation
-- the reader heads as well as the ones they were named on.

insert into public.delegations (
  id, conference_id, name, institution_name, country_code,
  status, requested_seats, note, join_code, submitted_at, decided_at
)
values
  (
    '60000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000016',
    'Rotterdam Grammar Spring Delegation',
    'Rotterdam Grammar School',
    'NL',
    'accepted', 3,
    'Three students, all of them in their second year.',
    'RGSMUN26',
    now() - interval '260 days', now() - interval '250 days'
  )
on conflict (id) do nothing;

insert into public.delegation_members (delegation_id, user_id, role)
values
  (
    '60000000-0000-4000-8000-000000000003',
    '50000000-0000-4000-8000-000000000002',
    'head'
  )
on conflict (delegation_id, user_id) do nothing;

-- Three invoices in three different states, so the list page can show what each
-- one looks like and the invoice page has something to say under every heading.
-- The first is unpaid and its due date has gone by, which is the row the list
-- marks as overdue.

insert into public.invoices (
  id, conference_id, number, payer_user_id, delegation_id, fee_id,
  description, quantity, unit_amount_cents, currency,
  status, due_at, paid_at, paid_method, created_at
)
values
  (
    '80000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000016',
    'rotterdammun-2026-0001',
    '50000000-0000-4000-8000-000000000001',
    null,
    '70000000-0000-4000-8000-000000000001',
    'Delegate fee · Rotterdam Spring MUN 2026', 1, 6500, 'EUR',
    'unpaid', now() - interval '210 days', null, null,
    now() - interval '240 days'
  ),
  (
    '80000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000016',
    'rotterdammun-2026-0002',
    '50000000-0000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000003',
    '70000000-0000-4000-8000-000000000002',
    '3 × School delegate fee · Rotterdam Spring MUN 2026', 3, 5500, 'EUR',
    'paid', now() - interval '210 days', now() - interval '215 days', 'manual',
    now() - interval '240 days'
  ),
  (
    '80000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000016',
    'rotterdammun-2026-0003',
    '50000000-0000-4000-8000-000000000001',
    null,
    null,
    'Late registration fee · Rotterdam Spring MUN 2026', 1, 2500, 'EUR',
    'waived', now() - interval '200 days', null, null,
    now() - interval '235 days'
  )
on conflict (id) do nothing;

-- What the organisers wrote for themselves when they settled the two. The note
-- lives in its own table since migration 20261022130000, which only invoice
-- readers and managers may read; the payer never sees it.
insert into public.invoice_internal_notes (invoice_id, note)
values
  ('80000000-0000-4000-8000-000000000002', 'Paid by bank transfer.'),
  ('80000000-0000-4000-8000-000000000003', 'Waived: she chaired a session at short notice.')
on conflict (invoice_id) do nothing;

/* -----------------------------------------------------------------------------
   CHECK THE RESULT (read-only, optional)
   -----------------------------------------------------------------------------
   Copy the query below into a new query tab and run it. You should see 11 rows,
   soonest first, each with the name of its organization and how many committees
   it has. Only Copenhagen, Rotterdam and the two drafts have none.

-- List the sample conferences with the organization running each one.
select
  conference.start_date,
  conference.name,
  conference.country_code,
  conference.status,
  organization.name as organization_name,
  count(committee.id) as committees
from public.conferences as conference
join public.organizations as organization on organization.id = conference.organization_id
left join public.committees as committee on committee.conference_id = conference.id
where conference.organization_id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003'
)
group by conference.id, organization.name
order by conference.start_date;
*/


/* -----------------------------------------------------------------------------
   CLEAN-UP (optional): remove the sample data again
   -----------------------------------------------------------------------------
   Copy the statements below into a new query tab and run them together. They
   delete the three sample organizations and the three sample accounts, and
   everything attached to either, children first, because foreign keys do not
   allow deleting a row that others still point at. This also removes any
   conference or membership somebody created for a sample organization through
   the app.

-- Remove the invoices of those conferences first. invoices.conference_id is
-- "on delete restrict", so a paid invoice deliberately refuses to let the
-- conference it belongs to be deleted out from under it. Their fees go with
-- the conference, because fees.conference_id cascades.
delete from public.invoices
where conference_id in (
  select conference.id
  from public.conferences as conference
  where conference.organization_id in (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003'
  )
);

-- Remove committees that belong to a sample organization's conferences. Their
-- seats go with them, because seats.committee_id cascades.
delete from public.committees
where conference_id in (
  select conference.id
  from public.conferences as conference
  where conference.organization_id in (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003'
  )
);

-- Remove every conference that belongs to a sample organization. The sample
-- application and delegation go with it, because both cascade from the
-- conference.
delete from public.conferences
where organization_id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003'
);

-- Remove memberships of the sample organizations, including the organiser's.
delete from public.organization_members
where organization_id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003'
);

-- Remove the three sample organizations themselves.
delete from public.organizations
where id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003'
);

-- Remove the three sample accounts. Their profiles, profile_details and
-- identities go with them, because all three cascade from auth.users.
delete from auth.users
where id in (
  '50000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000003'
);
*/
