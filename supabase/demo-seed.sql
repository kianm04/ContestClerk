-- =============================================================================
-- MUNMeet: the demo conference (1 organisation, 1 finished conference, 39 accounts)
-- File: supabase/demo-seed.sql
-- =============================================================================
--
-- WHAT THIS IS FOR
-- A sales call needs a conference that has already happened, from the first
-- application to the last award, so that every part of the app has something
-- believable to show. seed.sql cannot be that conference: its rows are chosen
-- to give the tests an example of every state, and a demo would look odd with
-- an application window that is "none at all" or a conference with no
-- committees.
--
-- So this file adds one more organisation with one finished conference:
--   Atlantic Debate Society, which ran Lisbon Atlantic MUN
--   * 3 committees (DISEC, the Human Rights Council and the Security Council),
--     8 seats each, every seat taken.
--   * 12 individual delegates, 2 school delegations of 6, and 3 applicants
--     who were rejected, waitlisted or withdrew.
--   * An organising team, and a chair and a vice-chair for each committee.
--   * Fees and invoices, most paid by bank transfer, one waived, one unpaid.
--   * A three-day schedule, announcements, background guides, resources and
--     23 position papers (21 approved, 1 sent back, 1 never reviewed).
--   * Three ended sessions per committee. Session 1 of the Security Council is
--     the played session: roll call, speeches, motions and a roll-call vote on
--     a draft resolution.
--   * Confirmed and published awards.
--
-- THE DATES MOVE WITH TODAY
-- The conference always ended twelve days before the day the database was
-- last reset, so it stays "finished" however long this file lives. Every date
-- below is written as a day relative to the first conference day and a clock
-- time in Lisbon, through the helper pg_temp.demo_moment further down.
--
-- DEMO ACCOUNTS
-- The password for every account in this file is "sample-password-123", the
-- same one seed.sql uses. The four worth signing in as:
--   demo.organiser@example.test  Inês Carvalho, the Secretary-General; owner
--                                of Atlantic Debate Society
--   demo.chair@example.test      Daniel Okoro, chair of the Security Council
--   demo.head@example.test       Catarina Lopes, head of the Colégio Atlântico
--                                delegation
--   demo.delegate@example.test   Beatriz Santos, France in the Security Council
-- Every other account is demo.<first name>.<last name>@example.test.
--
-- NEVER RUN THIS AGAINST PRODUCTION
-- It writes accounts straight into auth.users with a password printed in this
-- comment. It is for the local database and for a database kept only for
-- demos. supabase/README.md says the same.
--
-- HOW TO RUN
-- It runs by itself: `pnpm db:reset` (from client/) loads seed.sql and then
-- this file, because supabase/config.toml lists both under [db.seed]. The PDFs
-- the documents rows point at are in supabase/media/documents/, which the same
-- reset uploads into the "documents" bucket.
--
-- Like seed.sql, it runs as the "postgres" user, which Row Level Security does
-- not limit and which the guard triggers let through. That is why it can write
-- rows in their final state (an accepted application, a paid invoice, a
-- confirmed award) that the app could only reach one step at a time.
--
-- It adds rows of its own and never changes a row of seed.sql, so no test that
-- relies on the shared sample data notices it. The conference is over, so the
-- directory and the landing page leave it out.
--
-- RUNNING IT MORE THAN ONCE
-- Every row has a fixed id, or a natural key, and "on conflict do nothing", so
-- a second run adds nothing. As in seed.sql, editing a row and running again
-- does NOT update it; reset the database instead.
--
-- THE IDS
-- Every id starts with a letter, so they cannot collide with seed.sql's, whose
-- start with a digit. The first two characters say what the row is:
--   d1  the organisation          d9  seats: the last two digits are the
--   d2  the conference                committee (0, 1, 2) and the position
--   d3  committees 1 to 3         da  documents (same numbers as their file)
--   d4  the uuid in a file name   db  sessions: committee, then session
--   d5  accounts                  dc  motions
--   d6  applications (01-15)      dd  speakers' lists
--       and delegations (101-102) de  votes
--   d7  fees                      df  roll calls (same numbers as sessions)
--   d8  invoices                  e0  chair notes
--   e1  schedule events           e2  announcements
--   e3  the application question  e4  speakers' list entries


-- -----------------------------------------------------------------------------
-- Two helpers that only live while this file runs
-- -----------------------------------------------------------------------------
-- "pg_temp" is the schema of temporary objects: a function made in it belongs
-- to this database session and disappears when the session ends. It must always
-- be called with the "pg_temp." prefix, because Postgres never looks there for
-- a function otherwise.
--
-- demo_day(0) is the first day of the conference, fourteen days before today.
-- demo_day(-35) is thirty-five days before the conference started.
create function pg_temp.demo_day(day_offset integer)
returns date
language sql
stable
as $$
  select current_date - 14 + day_offset
$$;

-- demo_moment(1, '09:30') is half past nine on the second conference day, in
-- Lisbon. Adding a time to a date gives a time with no zone, and "at time zone"
-- says which city's clock it was read from.
create function pg_temp.demo_moment(day_offset integer, clock time)
returns timestamptz
language sql
stable
as $$
  select (pg_temp.demo_day(day_offset) + clock) at time zone 'Europe/Lisbon'
$$;


-- -----------------------------------------------------------------------------
-- Accounts
-- -----------------------------------------------------------------------------
-- Thirty-nine people is too many to write out three times (auth.users,
-- auth.identities, profiles), so they are listed once in a temporary table and
-- the three inserts read from it. The table is dropped at the end of the file.
--
-- Why writing auth.users by hand is safe here, and the four columns of empty
-- strings, are explained at the accounts in seed.sql.
create temporary table demo_people (
  id uuid primary key,
  email text not null,
  full_name text not null,
  institution_name text not null,
  country_code char(2) not null,
  experience_level public.experience_level not null
);

insert into demo_people (id, email, full_name, institution_name, country_code, experience_level)
values
  -- The organising team.
  ('d5000000-0000-4000-8000-000000000001', 'demo.organiser@example.test', 'Inês Carvalho', 'Atlantic Debate Society', 'PT', 'advanced'),
  ('d5000000-0000-4000-8000-000000000002', 'demo.tomas.ribeiro@example.test', 'Tomás Ribeiro', 'Atlantic Debate Society', 'PT', 'advanced'),
  ('d5000000-0000-4000-8000-000000000003', 'demo.sofia.marques@example.test', 'Sofia Marques', 'Universidade de Lisboa', 'PT', 'intermediate'),
  -- The chairs and vice-chairs, two per committee.
  ('d5000000-0000-4000-8000-000000000011', 'demo.hannah.weber@example.test', 'Hannah Weber', 'Humboldt-Universität zu Berlin', 'DE', 'advanced'),
  ('d5000000-0000-4000-8000-000000000012', 'demo.rafael.costa@example.test', 'Rafael Costa', 'Universidade do Porto', 'PT', 'advanced'),
  ('d5000000-0000-4000-8000-000000000013', 'demo.aisha.bello@example.test', 'Aisha Bello', 'University of Lagos', 'NG', 'advanced'),
  ('d5000000-0000-4000-8000-000000000014', 'demo.lukas.novak@example.test', 'Lukas Novak', 'Charles University', 'CZ', 'advanced'),
  ('d5000000-0000-4000-8000-000000000015', 'demo.chair@example.test', 'Daniel Okoro', 'King''s College London', 'GB', 'advanced'),
  ('d5000000-0000-4000-8000-000000000016', 'demo.maria.fernandes@example.test', 'Maria Fernandes', 'Universidade Nova de Lisboa', 'PT', 'advanced'),
  -- The heads of the two school delegations.
  ('d5000000-0000-4000-8000-000000000021', 'demo.head@example.test', 'Catarina Lopes', 'Colégio Atlântico', 'PT', 'advanced'),
  ('d5000000-0000-4000-8000-000000000022', 'demo.javier.ortega@example.test', 'Javier Ortega', 'Colegio Internacional de Vigo', 'ES', 'advanced'),
  -- The twelve individual delegates.
  ('d5000000-0000-4000-8000-000000000031', 'demo.delegate@example.test', 'Beatriz Santos', 'Universidade Católica Portuguesa', 'PT', 'intermediate'),
  ('d5000000-0000-4000-8000-000000000032', 'demo.oliver.grant@example.test', 'Oliver Grant', 'University of Edinburgh', 'GB', 'advanced'),
  ('d5000000-0000-4000-8000-000000000033', 'demo.mei.tan@example.test', 'Mei Lin Tan', 'National University of Singapore', 'SG', 'advanced'),
  ('d5000000-0000-4000-8000-000000000034', 'demo.yusuf.demir@example.test', 'Yusuf Demir', 'Boğaziçi University', 'TR', 'intermediate'),
  ('d5000000-0000-4000-8000-000000000035', 'demo.emma.laurent@example.test', 'Emma Laurent', 'Sciences Po', 'FR', 'intermediate'),
  ('d5000000-0000-4000-8000-000000000036', 'demo.noah.fischer@example.test', 'Noah Fischer', 'Universität Zürich', 'CH', 'intermediate'),
  ('d5000000-0000-4000-8000-000000000037', 'demo.priya.raman@example.test', 'Priya Raman', 'Leiden University', 'IN', 'intermediate'),
  ('d5000000-0000-4000-8000-000000000038', 'demo.chidi.eze@example.test', 'Chidi Eze', 'University College Dublin', 'IE', 'intermediate'),
  ('d5000000-0000-4000-8000-000000000039', 'demo.sara.lindqvist@example.test', 'Sara Lindqvist', 'Uppsala University', 'SE', 'beginner'),
  ('d5000000-0000-4000-8000-000000000040', 'demo.pedro.almeida@example.test', 'Pedro Almeida', 'Universidade de Coimbra', 'PT', 'beginner'),
  ('d5000000-0000-4000-8000-000000000041', 'demo.anna.kowalska@example.test', 'Anna Kowalska', 'University of Warsaw', 'PL', 'beginner'),
  ('d5000000-0000-4000-8000-000000000042', 'demo.thabo.nkosi@example.test', 'Thabo Nkosi', 'University of Cape Town', 'ZA', 'beginner'),
  -- The six members of the Colégio Atlântico delegation.
  ('d5000000-0000-4000-8000-000000000043', 'demo.leonor.silva@example.test', 'Leonor Silva', 'Colégio Atlântico', 'PT', 'intermediate'),
  ('d5000000-0000-4000-8000-000000000044', 'demo.duarte.martins@example.test', 'Duarte Martins', 'Colégio Atlântico', 'PT', 'intermediate'),
  ('d5000000-0000-4000-8000-000000000045', 'demo.matilde.sousa@example.test', 'Matilde Sousa', 'Colégio Atlântico', 'PT', 'beginner'),
  ('d5000000-0000-4000-8000-000000000046', 'demo.goncalo.pereira@example.test', 'Gonçalo Pereira', 'Colégio Atlântico', 'PT', 'beginner'),
  ('d5000000-0000-4000-8000-000000000047', 'demo.carolina.ferreira@example.test', 'Carolina Ferreira', 'Colégio Atlântico', 'PT', 'advanced'),
  ('d5000000-0000-4000-8000-000000000048', 'demo.rodrigo.gomes@example.test', 'Rodrigo Gomes', 'Colégio Atlântico', 'PT', 'intermediate'),
  -- The six members of the Vigo delegation.
  ('d5000000-0000-4000-8000-000000000049', 'demo.lucia.fernandez@example.test', 'Lucía Fernández', 'Colegio Internacional de Vigo', 'ES', 'intermediate'),
  ('d5000000-0000-4000-8000-000000000050', 'demo.pablo.romero@example.test', 'Pablo Romero', 'Colegio Internacional de Vigo', 'ES', 'intermediate'),
  ('d5000000-0000-4000-8000-000000000051', 'demo.carmen.navarro@example.test', 'Carmen Navarro', 'Colegio Internacional de Vigo', 'ES', 'beginner'),
  ('d5000000-0000-4000-8000-000000000052', 'demo.alejandro.ruiz@example.test', 'Alejandro Ruiz', 'Colegio Internacional de Vigo', 'ES', 'beginner'),
  ('d5000000-0000-4000-8000-000000000053', 'demo.elena.castro@example.test', 'Elena Castro', 'Colegio Internacional de Vigo', 'ES', 'advanced'),
  ('d5000000-0000-4000-8000-000000000054', 'demo.hugo.morales@example.test', 'Hugo Morales', 'Colegio Internacional de Vigo', 'ES', 'intermediate'),
  -- Three applicants who did not get a seat.
  ('d5000000-0000-4000-8000-000000000061', 'demo.felix.braun@example.test', 'Felix Braun', 'Universität Wien', 'AT', 'none'),
  ('d5000000-0000-4000-8000-000000000062', 'demo.zoe.papadopoulos@example.test', 'Zoe Papadopoulos', 'National and Kapodistrian University of Athens', 'GR', 'beginner'),
  ('d5000000-0000-4000-8000-000000000063', 'demo.jonas.berg@example.test', 'Jonas Berg', 'University of Oslo', 'NO', 'beginner');

-- Everybody signed up about five months before the conference.
insert into auth.users (
  instance_id, id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000',
  person.id,
  'authenticated', 'authenticated',
  person.email,
  extensions.crypt('sample-password-123', extensions.gen_salt('bf')),
  pg_temp.demo_moment(-150, '12:00'),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', person.full_name),
  pg_temp.demo_moment(-150, '12:00'),
  pg_temp.demo_moment(-150, '12:00'),
  '', '', '', ''
from demo_people as person
on conflict (id) do nothing;

-- One email identity per account, which is what lets it sign in with a
-- password. The identity reuses the account's id, because nothing else points
-- at it.
insert into auth.identities (
  id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
)
select
  person.id,
  person.id,
  'email',
  person.id::text,
  jsonb_build_object(
    'sub', person.id::text,
    'email', person.email,
    'email_verified', true,
    'phone_verified', false
  ),
  pg_temp.demo_moment(-150, '12:00'),
  pg_temp.demo_moment(-150, '12:00'),
  pg_temp.demo_moment(-150, '12:00')
from demo_people as person
on conflict (id) do nothing;

-- handle_new_user made each profile with the name. This fills in the rest and
-- finishes onboarding, so nobody is sent to /welcome.
update public.profiles as profile
set institution_name = person.institution_name,
    country_code = person.country_code,
    experience_level = person.experience_level,
    onboarding_completed_at = pg_temp.demo_moment(-150, '12:05')
from demo_people as person
where profile.id = person.id
  and profile.onboarding_completed_at is null;


-- -----------------------------------------------------------------------------
-- The organisation and its team
-- -----------------------------------------------------------------------------
-- The logo is an invented crest, never a real society's. Its file, like the
-- conference's pictures below, is in supabase/media/public-media (T149).
insert into public.organizations (id, name, slug, description, country_code, website_url, logo_path, created_at)
values (
  'd1000000-0000-4000-8000-000000000001',
  'Atlantic Debate Society',
  'atlantic-debate-society',
  'A student society in Lisbon that has run Model United Nations conferences for secondary school and university students since 2015.',
  'PT',
  'https://atlantic-debate.example',
  'organizations/d1000000-0000-4000-8000-000000000001/logo-b1000000-0000-4000-8000-000000000001.png',
  pg_temp.demo_moment(-150, '12:10')
)
on conflict (id) do nothing;

-- Inês owns the organisation and Tomás helps run it, so both can manage the
-- conference.
insert into public.organization_members (organization_id, user_id, role, created_at)
values
  ('d1000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'owner', pg_temp.demo_moment(-150, '12:10')),
  ('d1000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000002', 'admin', pg_temp.demo_moment(-149, '10:00'))
on conflict do nothing;


-- -----------------------------------------------------------------------------
-- The conference
-- -----------------------------------------------------------------------------
-- Three days, fourteen to twelve days ago. Applications opened four months
-- before and shut five weeks before; position papers were due a week before.
-- Payment was by bank transfer, so it needs no Stripe account.
--
-- awards_published_at is left empty here and set at the very end of the file,
-- once the awards exist, because setting it is what tells the award winners.
insert into public.conferences (
  id, organization_id, slug, name, tagline, description,
  city, venue_name, venue_address, country_code, timezone,
  start_date, end_date, website_url, contact_email, created_by, created_at,
  level, language, expected_delegates, min_age, max_age, currency, status,
  applications_open_at, applications_close_at,
  accepts_individual_applications, accepts_delegations, committee_preference_count,
  ask_motivation, position_paper_required, position_paper_deadline,
  collects_payments_manually, payment_instructions, show_schedule_publicly,
  banner_path, logo_path
)
values (
  'd2000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'lisbon-atlantic-mun',
  'Lisbon Atlantic MUN',
  'Three days of diplomacy on the banks of the Tagus',
  'Lisbon Atlantic MUN brings secondary school and university students together for three days of debate in three committees, from disarmament to the Security Council. Beginners are welcome in the Human Rights Council; the Security Council is for experienced delegates.',
  'Lisbon',
  'Centro de Congressos do Tejo',
  'Avenida da Índia 12, 1300-001 Lisboa',
  'PT',
  'Europe/Lisbon',
  pg_temp.demo_day(0),
  pg_temp.demo_day(2),
  'https://atlantic-debate.example/lisbon-mun',
  'hello@atlantic-debate.example',
  'd5000000-0000-4000-8000-000000000001',
  pg_temp.demo_moment(-140, '10:00'),
  'mixed',
  'English',
  36,
  15,
  26,
  'EUR',
  'published',
  pg_temp.demo_moment(-120, '09:00'),
  pg_temp.demo_moment(-35, '23:59'),
  true,
  true,
  2,
  true,
  true,
  pg_temp.demo_moment(-7, '23:59'),
  true,
  'Pay by bank transfer to Atlantic Debate Society, IBAN PT50 0000 0000 0000 0000 0000 0, within two weeks. Put your invoice number in the transfer description.',
  true,
  'conferences/d2000000-0000-4000-8000-000000000001/banner-b2000000-0000-4000-8000-000000000001.jpg',
  'conferences/d2000000-0000-4000-8000-000000000001/logo-b1000000-0000-4000-8000-000000000001.png'
)
on conflict (id) do nothing;

-- The organising team as the conference lists it. The chairs get their staff
-- rows from committee_chairs further down.
insert into public.conference_staff (conference_id, user_id, title, created_at)
values
  ('d2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'Secretary-General', pg_temp.demo_moment(-140, '10:00')),
  ('d2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000002', 'Director-General', pg_temp.demo_moment(-140, '10:05')),
  ('d2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000003', 'Logistics', pg_temp.demo_moment(-60, '18:00'))
on conflict do nothing;

-- Their roles. A conference gets its three preset roles the moment it is
-- inserted (trigger conferences_add_presets), so they are looked up by name.
insert into public.conference_role_members (conference_id, user_id, role_id)
select person.conference_id::uuid, person.user_id::uuid, role.id
from (
  values
    ('d2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'Organiser'),
    ('d2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000002', 'Organiser'),
    ('d2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000003', 'Volunteer')
) as person (conference_id, user_id, role_name)
join public.conference_roles as role
  on role.conference_id = person.conference_id::uuid
 and role.name = person.role_name
on conflict do nothing;

-- The one question on the application form besides the usual ones. It is
-- optional, and applications answer it by the question's id.
insert into public.application_questions (id, conference_id, label, type, options, is_required, position)
values (
  'e3000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'How did you hear about Lisbon Atlantic MUN?',
  'single_choice',
  array['A friend or classmate', 'My school or university', 'Instagram', 'Another conference'],
  false,
  0
)
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- Committees, their chairs and their seats
-- -----------------------------------------------------------------------------
-- Adding a committee also adds its committee_state row, in the idle mode a
-- finished conference is left in (trigger committees_create_state).
insert into public.committees (
  id, conference_id, slug, name, abbreviation, description, topics, room, position, level
)
values
  (
    'd3000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001',
    'disec',
    'Disarmament and International Security Committee',
    'DISEC',
    'The First Committee of the General Assembly, on weapons and the threats they pose to peace.',
    array['Lethal autonomous weapons systems', 'Preventing an arms race in outer space'],
    'Room 2.14',
    0,
    'intermediate'
  ),
  (
    'd3000000-0000-4000-8000-000000000002',
    'd2000000-0000-4000-8000-000000000001',
    'unhrc',
    'Human Rights Council',
    'UNHRC',
    'Forty-seven states that watch over human rights around the world. A good first committee.',
    array['The right to privacy in the digital age', 'Protecting people displaced by climate change'],
    'Room 2.16',
    1,
    'beginner'
  ),
  (
    'd3000000-0000-4000-8000-000000000003',
    'd2000000-0000-4000-8000-000000000001',
    'unsc',
    'Security Council',
    'UNSC',
    'Fifteen members, five of them permanent, with the power to bind every member state. For experienced delegates.',
    array['The situation in the Sahel', 'Maritime security in the Gulf of Guinea'],
    'Room 3.02',
    2,
    'advanced'
  )
on conflict (id) do nothing;

-- A chair and a vice-chair for each committee. Each row also puts its person
-- on the conference's staff list (trigger committee_chairs_ensure_staff), and
-- the insert after it gives them the Chair role, which is what lets them run
-- the room.
insert into public.committee_chairs (committee_id, user_id, title, created_at)
values
  ('d3000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000011', 'Chair', pg_temp.demo_moment(-100, '10:00')),
  ('d3000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000012', 'Vice Chair', pg_temp.demo_moment(-100, '10:00')),
  ('d3000000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000013', 'Chair', pg_temp.demo_moment(-100, '10:00')),
  ('d3000000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000014', 'Vice Chair', pg_temp.demo_moment(-100, '10:00')),
  ('d3000000-0000-4000-8000-000000000003', 'd5000000-0000-4000-8000-000000000015', 'Chair', pg_temp.demo_moment(-100, '10:00')),
  ('d3000000-0000-4000-8000-000000000003', 'd5000000-0000-4000-8000-000000000016', 'Vice Chair', pg_temp.demo_moment(-100, '10:00'))
on conflict do nothing;

insert into public.conference_role_members (conference_id, user_id, role_id)
select committee.conference_id, chair.user_id, role.id
from public.committee_chairs as chair
join public.committees as committee on committee.id = chair.committee_id
join public.conference_roles as role
  on role.conference_id = committee.conference_id
 and role.name = 'Chair'
where committee.conference_id = 'd2000000-0000-4000-8000-000000000001'
on conflict do nothing;


-- -----------------------------------------------------------------------------
-- Applications and delegations
-- -----------------------------------------------------------------------------
-- All decided by Inês. The first twelve were accepted and got seats; the last
-- three show the other ways an application ends. Most of them answered the
-- optional question, which is why "answers" is keyed by its id.
insert into public.applications (
  id, conference_id, user_id, status, committee_preferences, seat_preferences, motivation,
  answers, submitted_at, decided_at, decided_by, decision_note, created_at
)
values
  ('d6000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000031', 'accepted',
    array['d3000000-0000-4000-8000-000000000003', 'd3000000-0000-4000-8000-000000000001']::uuid[], 'France or the United Kingdom',
    'I chaired my university''s first conference last spring and would like to go back to the floor, in the Security Council this time.',
    '{"e3000000-0000-4000-8000-000000000001": "A friend or classmate"}'::jsonb,
    pg_temp.demo_moment(-100, '21:14'), pg_temp.demo_moment(-38, '10:00'), 'd5000000-0000-4000-8000-000000000001', null, pg_temp.demo_moment(-100, '20:40')),
  ('d6000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000032', 'accepted',
    array['d3000000-0000-4000-8000-000000000003']::uuid[], 'Russian Federation',
    'Six conferences as a delegate, two awards. I enjoy representing positions I do not share.',
    '{"e3000000-0000-4000-8000-000000000001": "Another conference"}'::jsonb,
    pg_temp.demo_moment(-95, '18:02'), pg_temp.demo_moment(-38, '10:05'), 'd5000000-0000-4000-8000-000000000001', null, pg_temp.demo_moment(-95, '17:30')),
  ('d6000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000033', 'accepted',
    array['d3000000-0000-4000-8000-000000000003', 'd3000000-0000-4000-8000-000000000002']::uuid[], 'United States',
    'I am on exchange in Lisbon this year and want to meet the local MUN community.',
    '{"e3000000-0000-4000-8000-000000000001": "Instagram"}'::jsonb,
    pg_temp.demo_moment(-80, '12:45'), pg_temp.demo_moment(-38, '10:10'), 'd5000000-0000-4000-8000-000000000001', null, pg_temp.demo_moment(-80, '12:10')),
  ('d6000000-0000-4000-8000-000000000004', 'd2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000034', 'accepted',
    array['d3000000-0000-4000-8000-000000000003', 'd3000000-0000-4000-8000-000000000001']::uuid[], 'A Gulf state',
    'My thesis is on maritime security, which is the Security Council''s second topic.',
    '{}'::jsonb,
    pg_temp.demo_moment(-50, '09:20'), pg_temp.demo_moment(-38, '10:15'), 'd5000000-0000-4000-8000-000000000001', null, pg_temp.demo_moment(-50, '09:00')),
  ('d6000000-0000-4000-8000-000000000005', 'd2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000035', 'accepted',
    array['d3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000002']::uuid[], null,
    'I study international security and want to debate autonomous weapons before writing about them.',
    '{"e3000000-0000-4000-8000-000000000001": "My school or university"}'::jsonb,
    pg_temp.demo_moment(-70, '16:33'), pg_temp.demo_moment(-38, '10:20'), 'd5000000-0000-4000-8000-000000000001', null, pg_temp.demo_moment(-70, '16:00')),
  ('d6000000-0000-4000-8000-000000000006', 'd2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000036', 'accepted',
    array['d3000000-0000-4000-8000-000000000001']::uuid[], null,
    'Second conference. I would like a committee with a technical topic.',
    '{"e3000000-0000-4000-8000-000000000001": "A friend or classmate"}'::jsonb,
    pg_temp.demo_moment(-45, '22:10'), pg_temp.demo_moment(-38, '10:25'), 'd5000000-0000-4000-8000-000000000001', null, pg_temp.demo_moment(-45, '21:40')),
  ('d6000000-0000-4000-8000-000000000007', 'd2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000037', 'accepted',
    array['d3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000003']::uuid[], 'India',
    'I have followed the talks on autonomous weapons in Geneva and would love to argue them out.',
    '{"e3000000-0000-4000-8000-000000000001": "Instagram"}'::jsonb,
    pg_temp.demo_moment(-65, '11:05'), pg_temp.demo_moment(-38, '10:30'), 'd5000000-0000-4000-8000-000000000001', null, pg_temp.demo_moment(-65, '10:40')),
  ('d6000000-0000-4000-8000-000000000008', 'd2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000038', 'accepted',
    array['d3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000002']::uuid[], 'Nigeria',
    'Third conference; the first one outside Ireland.',
    '{}'::jsonb,
    pg_temp.demo_moment(-42, '19:50'), pg_temp.demo_moment(-38, '10:35'), 'd5000000-0000-4000-8000-000000000001', null, pg_temp.demo_moment(-42, '19:20')),
  ('d6000000-0000-4000-8000-000000000009', 'd2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000039', 'accepted',
    array['d3000000-0000-4000-8000-000000000002']::uuid[], null,
    'This will be my first Model UN. A friend told me the Human Rights Council is the place to start.',
    '{"e3000000-0000-4000-8000-000000000001": "A friend or classmate"}'::jsonb,
    pg_temp.demo_moment(-58, '14:15'), pg_temp.demo_moment(-38, '10:40'), 'd5000000-0000-4000-8000-000000000001', null, pg_temp.demo_moment(-58, '13:50')),
  ('d6000000-0000-4000-8000-000000000010', 'd2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000040', 'accepted',
    array['d3000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000001']::uuid[], null,
    'I study law in Coimbra and want to practise public speaking.',
    '{"e3000000-0000-4000-8000-000000000001": "My school or university"}'::jsonb,
    pg_temp.demo_moment(-40, '23:02'), pg_temp.demo_moment(-38, '10:45'), 'd5000000-0000-4000-8000-000000000001', null, pg_temp.demo_moment(-40, '22:30')),
  ('d6000000-0000-4000-8000-000000000011', 'd2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000041', 'accepted',
    array['d3000000-0000-4000-8000-000000000002']::uuid[], 'The Netherlands',
    'Climate displacement is the subject of my master''s thesis.',
    '{}'::jsonb,
    pg_temp.demo_moment(-75, '08:40'), pg_temp.demo_moment(-38, '10:50'), 'd5000000-0000-4000-8000-000000000001', null, pg_temp.demo_moment(-75, '08:15')),
  ('d6000000-0000-4000-8000-000000000012', 'd2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000042', 'accepted',
    array['d3000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000003']::uuid[], 'South Africa',
    'I would like to bring a southern African view to the debate on digital privacy.',
    '{"e3000000-0000-4000-8000-000000000001": "Instagram"}'::jsonb,
    pg_temp.demo_moment(-44, '17:25'), pg_temp.demo_moment(-38, '10:55'), 'd5000000-0000-4000-8000-000000000001', null, pg_temp.demo_moment(-44, '17:00')),
  ('d6000000-0000-4000-8000-000000000013', 'd2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000061', 'rejected',
    array['d3000000-0000-4000-8000-000000000003']::uuid[], null,
    'I have not done Model UN before but I watch a lot of politics.',
    '{}'::jsonb,
    pg_temp.demo_moment(-36, '23:40'), pg_temp.demo_moment(-34, '09:30'), 'd5000000-0000-4000-8000-000000000001',
    'Thank you for applying. The Security Council is for experienced delegates, and our other committees were full. We hope to see you next year.',
    pg_temp.demo_moment(-36, '23:10')),
  ('d6000000-0000-4000-8000-000000000014', 'd2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000062', 'waitlisted',
    array['d3000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000001']::uuid[], null,
    'Two conferences in Athens so far. I would love to take part in my first one abroad.',
    '{"e3000000-0000-4000-8000-000000000001": "Another conference"}'::jsonb,
    pg_temp.demo_moment(-37, '15:00'), pg_temp.demo_moment(-34, '09:35'), 'd5000000-0000-4000-8000-000000000001',
    'Every seat is taken for now. We will write to you if one opens up.',
    pg_temp.demo_moment(-37, '14:30')),
  ('d6000000-0000-4000-8000-000000000015', 'd2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000063', 'withdrawn',
    array['d3000000-0000-4000-8000-000000000002']::uuid[], null,
    'Looking forward to my first conference.',
    '{}'::jsonb,
    pg_temp.demo_moment(-60, '10:00'), null, null, null, pg_temp.demo_moment(-60, '09:30'))
on conflict (id) do nothing;

-- Two schools that each registered six students, both accepted.
insert into public.delegations (
  id, conference_id, name, institution_name, country_code, status, requested_seats, note,
  join_code, submitted_at, decided_at, decided_by, created_at
)
values
  (
    'd6000000-0000-4000-8000-000000000101',
    'd2000000-0000-4000-8000-000000000001',
    'Colégio Atlântico',
    'Colégio Atlântico',
    'PT',
    'accepted',
    6,
    'Six students from our Year 11 and 12 debating club.',
    'ATLNTC26',
    pg_temp.demo_moment(-90, '16:00'),
    pg_temp.demo_moment(-85, '11:00'),
    'd5000000-0000-4000-8000-000000000001',
    pg_temp.demo_moment(-91, '15:30')
  ),
  (
    'd6000000-0000-4000-8000-000000000102',
    'd2000000-0000-4000-8000-000000000001',
    'Colegio Internacional de Vigo',
    'Colegio Internacional de Vigo',
    'ES',
    'accepted',
    6,
    'Our first conference outside Spain.',
    'VGSCHL27',
    pg_temp.demo_moment(-82, '12:00'),
    pg_temp.demo_moment(-80, '10:00'),
    'd5000000-0000-4000-8000-000000000001',
    pg_temp.demo_moment(-83, '18:00')
  )
on conflict (id) do nothing;

-- Each head, then the six students who joined with the school's join code.
insert into public.delegation_members (delegation_id, user_id, role, joined_at)
values
  ('d6000000-0000-4000-8000-000000000101', 'd5000000-0000-4000-8000-000000000021', 'head', pg_temp.demo_moment(-91, '15:30')),
  ('d6000000-0000-4000-8000-000000000101', 'd5000000-0000-4000-8000-000000000043', 'member', pg_temp.demo_moment(-84, '18:00')),
  ('d6000000-0000-4000-8000-000000000101', 'd5000000-0000-4000-8000-000000000044', 'member', pg_temp.demo_moment(-84, '18:20')),
  ('d6000000-0000-4000-8000-000000000101', 'd5000000-0000-4000-8000-000000000045', 'member', pg_temp.demo_moment(-83, '20:10')),
  ('d6000000-0000-4000-8000-000000000101', 'd5000000-0000-4000-8000-000000000046', 'member', pg_temp.demo_moment(-80, '17:45')),
  ('d6000000-0000-4000-8000-000000000101', 'd5000000-0000-4000-8000-000000000047', 'member', pg_temp.demo_moment(-78, '19:00')),
  ('d6000000-0000-4000-8000-000000000101', 'd5000000-0000-4000-8000-000000000048', 'member', pg_temp.demo_moment(-72, '16:30')),
  ('d6000000-0000-4000-8000-000000000102', 'd5000000-0000-4000-8000-000000000022', 'head', pg_temp.demo_moment(-83, '18:00')),
  ('d6000000-0000-4000-8000-000000000102', 'd5000000-0000-4000-8000-000000000049', 'member', pg_temp.demo_moment(-79, '12:00')),
  ('d6000000-0000-4000-8000-000000000102', 'd5000000-0000-4000-8000-000000000050', 'member', pg_temp.demo_moment(-79, '12:30')),
  ('d6000000-0000-4000-8000-000000000102', 'd5000000-0000-4000-8000-000000000051', 'member', pg_temp.demo_moment(-77, '09:15')),
  ('d6000000-0000-4000-8000-000000000102', 'd5000000-0000-4000-8000-000000000052', 'member', pg_temp.demo_moment(-77, '10:00')),
  ('d6000000-0000-4000-8000-000000000102', 'd5000000-0000-4000-8000-000000000053', 'member', pg_temp.demo_moment(-75, '21:30')),
  ('d6000000-0000-4000-8000-000000000102', 'd5000000-0000-4000-8000-000000000054', 'member', pg_temp.demo_moment(-70, '18:40'))
on conflict do nothing;

-- Every seat, and who sat in it. A seat taken through an application points at
-- that application; a seat given to a school points at its delegation, and the
-- head then put one of the school's students in it. All were handed out on the
-- same morning, a month before the conference.
insert into public.seats (
  id, committee_id, name, country_code, position, user_id, application_id, delegation_id, allocated_at
)
values
  -- DISEC
  ('d9000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'Argentina', 'AR', 1, 'd5000000-0000-4000-8000-000000000049', null, 'd6000000-0000-4000-8000-000000000102', pg_temp.demo_moment(-33, '10:00')),
  ('d9000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000001', 'Australia', 'AU', 2, 'd5000000-0000-4000-8000-000000000035', 'd6000000-0000-4000-8000-000000000005', null, pg_temp.demo_moment(-33, '10:00')),
  ('d9000000-0000-4000-8000-000000000003', 'd3000000-0000-4000-8000-000000000001', 'Canada', 'CA', 3, 'd5000000-0000-4000-8000-000000000036', 'd6000000-0000-4000-8000-000000000006', null, pg_temp.demo_moment(-33, '10:00')),
  ('d9000000-0000-4000-8000-000000000004', 'd3000000-0000-4000-8000-000000000001', 'Egypt', 'EG', 4, 'd5000000-0000-4000-8000-000000000050', null, 'd6000000-0000-4000-8000-000000000102', pg_temp.demo_moment(-33, '10:00')),
  ('d9000000-0000-4000-8000-000000000005', 'd3000000-0000-4000-8000-000000000001', 'Germany', 'DE', 5, 'd5000000-0000-4000-8000-000000000043', null, 'd6000000-0000-4000-8000-000000000101', pg_temp.demo_moment(-33, '10:00')),
  ('d9000000-0000-4000-8000-000000000006', 'd3000000-0000-4000-8000-000000000001', 'India', 'IN', 6, 'd5000000-0000-4000-8000-000000000037', 'd6000000-0000-4000-8000-000000000007', null, pg_temp.demo_moment(-33, '10:00')),
  ('d9000000-0000-4000-8000-000000000007', 'd3000000-0000-4000-8000-000000000001', 'Japan', 'JP', 7, 'd5000000-0000-4000-8000-000000000044', null, 'd6000000-0000-4000-8000-000000000101', pg_temp.demo_moment(-33, '10:00')),
  ('d9000000-0000-4000-8000-000000000008', 'd3000000-0000-4000-8000-000000000001', 'Nigeria', 'NG', 8, 'd5000000-0000-4000-8000-000000000038', 'd6000000-0000-4000-8000-000000000008', null, pg_temp.demo_moment(-33, '10:00')),
  -- UNHRC
  ('d9000000-0000-4000-8000-000000000011', 'd3000000-0000-4000-8000-000000000002', 'Brazil', 'BR', 1, 'd5000000-0000-4000-8000-000000000045', null, 'd6000000-0000-4000-8000-000000000101', pg_temp.demo_moment(-33, '10:00')),
  ('d9000000-0000-4000-8000-000000000012', 'd3000000-0000-4000-8000-000000000002', 'Chile', 'CL', 2, 'd5000000-0000-4000-8000-000000000052', null, 'd6000000-0000-4000-8000-000000000102', pg_temp.demo_moment(-33, '10:00')),
  ('d9000000-0000-4000-8000-000000000013', 'd3000000-0000-4000-8000-000000000002', 'Indonesia', 'ID', 3, 'd5000000-0000-4000-8000-000000000039', 'd6000000-0000-4000-8000-000000000009', null, pg_temp.demo_moment(-33, '10:00')),
  ('d9000000-0000-4000-8000-000000000014', 'd3000000-0000-4000-8000-000000000002', 'Kenya', 'KE', 4, 'd5000000-0000-4000-8000-000000000040', 'd6000000-0000-4000-8000-000000000010', null, pg_temp.demo_moment(-33, '10:00')),
  ('d9000000-0000-4000-8000-000000000015', 'd3000000-0000-4000-8000-000000000002', 'Mexico', 'MX', 5, 'd5000000-0000-4000-8000-000000000051', null, 'd6000000-0000-4000-8000-000000000102', pg_temp.demo_moment(-33, '10:00')),
  ('d9000000-0000-4000-8000-000000000016', 'd3000000-0000-4000-8000-000000000002', 'Netherlands', 'NL', 6, 'd5000000-0000-4000-8000-000000000041', 'd6000000-0000-4000-8000-000000000011', null, pg_temp.demo_moment(-33, '10:00')),
  ('d9000000-0000-4000-8000-000000000017', 'd3000000-0000-4000-8000-000000000002', 'Norway', 'NO', 7, 'd5000000-0000-4000-8000-000000000046', null, 'd6000000-0000-4000-8000-000000000101', pg_temp.demo_moment(-33, '10:00')),
  ('d9000000-0000-4000-8000-000000000018', 'd3000000-0000-4000-8000-000000000002', 'South Africa', 'ZA', 8, 'd5000000-0000-4000-8000-000000000042', 'd6000000-0000-4000-8000-000000000012', null, pg_temp.demo_moment(-33, '10:00')),
  -- UNSC
  ('d9000000-0000-4000-8000-000000000021', 'd3000000-0000-4000-8000-000000000003', 'China', 'CN', 1, 'd5000000-0000-4000-8000-000000000047', null, 'd6000000-0000-4000-8000-000000000101', pg_temp.demo_moment(-33, '10:00')),
  ('d9000000-0000-4000-8000-000000000022', 'd3000000-0000-4000-8000-000000000003', 'France', 'FR', 2, 'd5000000-0000-4000-8000-000000000031', 'd6000000-0000-4000-8000-000000000001', null, pg_temp.demo_moment(-33, '10:00')),
  ('d9000000-0000-4000-8000-000000000023', 'd3000000-0000-4000-8000-000000000003', 'Russian Federation', 'RU', 3, 'd5000000-0000-4000-8000-000000000032', 'd6000000-0000-4000-8000-000000000002', null, pg_temp.demo_moment(-33, '10:00')),
  ('d9000000-0000-4000-8000-000000000024', 'd3000000-0000-4000-8000-000000000003', 'United Kingdom', 'GB', 4, 'd5000000-0000-4000-8000-000000000054', null, 'd6000000-0000-4000-8000-000000000102', pg_temp.demo_moment(-33, '10:00')),
  ('d9000000-0000-4000-8000-000000000025', 'd3000000-0000-4000-8000-000000000003', 'United States', 'US', 5, 'd5000000-0000-4000-8000-000000000033', 'd6000000-0000-4000-8000-000000000003', null, pg_temp.demo_moment(-33, '10:00')),
  ('d9000000-0000-4000-8000-000000000026', 'd3000000-0000-4000-8000-000000000003', 'Ghana', 'GH', 6, 'd5000000-0000-4000-8000-000000000048', null, 'd6000000-0000-4000-8000-000000000101', pg_temp.demo_moment(-33, '10:00')),
  ('d9000000-0000-4000-8000-000000000027', 'd3000000-0000-4000-8000-000000000003', 'Switzerland', 'CH', 7, 'd5000000-0000-4000-8000-000000000053', null, 'd6000000-0000-4000-8000-000000000102', pg_temp.demo_moment(-33, '10:00')),
  ('d9000000-0000-4000-8000-000000000028', 'd3000000-0000-4000-8000-000000000003', 'United Arab Emirates', 'AE', 8, 'd5000000-0000-4000-8000-000000000034', 'd6000000-0000-4000-8000-000000000004', null, pg_temp.demo_moment(-33, '10:00'))
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- Fees and invoices
-- -----------------------------------------------------------------------------
-- The invoices were raised the morning the seats went out and were due two
-- weeks before the conference. Individual delegates each got one for their
-- seat; each school got one for its six students, addressed to its head.
-- Invoice 0007 was waived through the society's bursary and invoice 0010 was
-- never paid, which the organiser's payments page shows as outstanding.
--
-- amount_cents and platform_fee_cents are left out because the
-- invoices_compute_amount trigger works them out from the quantity. Adding an
-- invoice sends its payer an "invoice created" notification; the end of this
-- file moves those back to the day the invoice was raised.
insert into public.fees (id, conference_id, name, amount_cents, applies_to, position, created_at)
values
  ('d7000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'Delegate fee', 5500, 'individual', 0, pg_temp.demo_moment(-130, '10:00')),
  ('d7000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000001', 'School delegate fee', 5000, 'delegation_member', 1, pg_temp.demo_moment(-130, '10:00'))
on conflict (id) do nothing;

insert into public.invoices (
  id, conference_id, number, payer_user_id, seat_id, delegation_id, fee_id,
  description, quantity, unit_amount_cents, currency,
  status, due_at, paid_at, paid_method, created_at
)
values
  ('d8000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'lisbon-atlantic-mun-0001', 'd5000000-0000-4000-8000-000000000031', 'd9000000-0000-4000-8000-000000000022', null, 'd7000000-0000-4000-8000-000000000001',
    'Delegate fee · Lisbon Atlantic MUN', 1, 5500, 'EUR', 'paid', pg_temp.demo_moment(-14, '23:59'), pg_temp.demo_moment(-30, '15:00'), 'manual', pg_temp.demo_moment(-33, '10:05')),
  ('d8000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000001', 'lisbon-atlantic-mun-0002', 'd5000000-0000-4000-8000-000000000032', 'd9000000-0000-4000-8000-000000000023', null, 'd7000000-0000-4000-8000-000000000001',
    'Delegate fee · Lisbon Atlantic MUN', 1, 5500, 'EUR', 'paid', pg_temp.demo_moment(-14, '23:59'), pg_temp.demo_moment(-29, '11:20'), 'manual', pg_temp.demo_moment(-33, '10:05')),
  ('d8000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000001', 'lisbon-atlantic-mun-0003', 'd5000000-0000-4000-8000-000000000033', 'd9000000-0000-4000-8000-000000000025', null, 'd7000000-0000-4000-8000-000000000001',
    'Delegate fee · Lisbon Atlantic MUN', 1, 5500, 'EUR', 'paid', pg_temp.demo_moment(-14, '23:59'), pg_temp.demo_moment(-31, '09:45'), 'manual', pg_temp.demo_moment(-33, '10:05')),
  ('d8000000-0000-4000-8000-000000000004', 'd2000000-0000-4000-8000-000000000001', 'lisbon-atlantic-mun-0004', 'd5000000-0000-4000-8000-000000000034', 'd9000000-0000-4000-8000-000000000028', null, 'd7000000-0000-4000-8000-000000000001',
    'Delegate fee · Lisbon Atlantic MUN', 1, 5500, 'EUR', 'paid', pg_temp.demo_moment(-14, '23:59'), pg_temp.demo_moment(-20, '16:10'), 'manual', pg_temp.demo_moment(-33, '10:05')),
  ('d8000000-0000-4000-8000-000000000005', 'd2000000-0000-4000-8000-000000000001', 'lisbon-atlantic-mun-0005', 'd5000000-0000-4000-8000-000000000035', 'd9000000-0000-4000-8000-000000000002', null, 'd7000000-0000-4000-8000-000000000001',
    'Delegate fee · Lisbon Atlantic MUN', 1, 5500, 'EUR', 'paid', pg_temp.demo_moment(-14, '23:59'), pg_temp.demo_moment(-28, '14:00'), 'manual', pg_temp.demo_moment(-33, '10:05')),
  ('d8000000-0000-4000-8000-000000000006', 'd2000000-0000-4000-8000-000000000001', 'lisbon-atlantic-mun-0006', 'd5000000-0000-4000-8000-000000000036', 'd9000000-0000-4000-8000-000000000003', null, 'd7000000-0000-4000-8000-000000000001',
    'Delegate fee · Lisbon Atlantic MUN', 1, 5500, 'EUR', 'paid', pg_temp.demo_moment(-14, '23:59'), pg_temp.demo_moment(-18, '10:30'), 'manual', pg_temp.demo_moment(-33, '10:05')),
  ('d8000000-0000-4000-8000-000000000007', 'd2000000-0000-4000-8000-000000000001', 'lisbon-atlantic-mun-0007', 'd5000000-0000-4000-8000-000000000037', 'd9000000-0000-4000-8000-000000000006', null, 'd7000000-0000-4000-8000-000000000001',
    'Delegate fee · Lisbon Atlantic MUN', 1, 5500, 'EUR', 'waived', pg_temp.demo_moment(-14, '23:59'), null, null, pg_temp.demo_moment(-33, '10:05')),
  ('d8000000-0000-4000-8000-000000000008', 'd2000000-0000-4000-8000-000000000001', 'lisbon-atlantic-mun-0008', 'd5000000-0000-4000-8000-000000000038', 'd9000000-0000-4000-8000-000000000008', null, 'd7000000-0000-4000-8000-000000000001',
    'Delegate fee · Lisbon Atlantic MUN', 1, 5500, 'EUR', 'paid', pg_temp.demo_moment(-14, '23:59'), pg_temp.demo_moment(-16, '12:15'), 'manual', pg_temp.demo_moment(-33, '10:05')),
  ('d8000000-0000-4000-8000-000000000009', 'd2000000-0000-4000-8000-000000000001', 'lisbon-atlantic-mun-0009', 'd5000000-0000-4000-8000-000000000039', 'd9000000-0000-4000-8000-000000000013', null, 'd7000000-0000-4000-8000-000000000001',
    'Delegate fee · Lisbon Atlantic MUN', 1, 5500, 'EUR', 'paid', pg_temp.demo_moment(-14, '23:59'), pg_temp.demo_moment(-25, '17:40'), 'manual', pg_temp.demo_moment(-33, '10:05')),
  ('d8000000-0000-4000-8000-000000000010', 'd2000000-0000-4000-8000-000000000001', 'lisbon-atlantic-mun-0010', 'd5000000-0000-4000-8000-000000000040', 'd9000000-0000-4000-8000-000000000014', null, 'd7000000-0000-4000-8000-000000000001',
    'Delegate fee · Lisbon Atlantic MUN', 1, 5500, 'EUR', 'unpaid', pg_temp.demo_moment(-14, '23:59'), null, null, pg_temp.demo_moment(-33, '10:05')),
  ('d8000000-0000-4000-8000-000000000011', 'd2000000-0000-4000-8000-000000000001', 'lisbon-atlantic-mun-0011', 'd5000000-0000-4000-8000-000000000041', 'd9000000-0000-4000-8000-000000000016', null, 'd7000000-0000-4000-8000-000000000001',
    'Delegate fee · Lisbon Atlantic MUN', 1, 5500, 'EUR', 'paid', pg_temp.demo_moment(-14, '23:59'), pg_temp.demo_moment(-27, '08:50'), 'manual', pg_temp.demo_moment(-33, '10:05')),
  ('d8000000-0000-4000-8000-000000000012', 'd2000000-0000-4000-8000-000000000001', 'lisbon-atlantic-mun-0012', 'd5000000-0000-4000-8000-000000000042', 'd9000000-0000-4000-8000-000000000018', null, 'd7000000-0000-4000-8000-000000000001',
    'Delegate fee · Lisbon Atlantic MUN', 1, 5500, 'EUR', 'paid', pg_temp.demo_moment(-14, '23:59'), pg_temp.demo_moment(-15, '19:05'), 'manual', pg_temp.demo_moment(-33, '10:05')),
  ('d8000000-0000-4000-8000-000000000013', 'd2000000-0000-4000-8000-000000000001', 'lisbon-atlantic-mun-0013', 'd5000000-0000-4000-8000-000000000021', null, 'd6000000-0000-4000-8000-000000000101', 'd7000000-0000-4000-8000-000000000002',
    '6 × School delegate fee · Lisbon Atlantic MUN', 6, 5000, 'EUR', 'paid', pg_temp.demo_moment(-14, '23:59'), pg_temp.demo_moment(-22, '10:00'), 'manual', pg_temp.demo_moment(-33, '10:10')),
  ('d8000000-0000-4000-8000-000000000014', 'd2000000-0000-4000-8000-000000000001', 'lisbon-atlantic-mun-0014', 'd5000000-0000-4000-8000-000000000022', null, 'd6000000-0000-4000-8000-000000000102', 'd7000000-0000-4000-8000-000000000002',
    '6 × School delegate fee · Lisbon Atlantic MUN', 6, 5000, 'EUR', 'paid', pg_temp.demo_moment(-14, '23:59'), pg_temp.demo_moment(-19, '13:30'), 'manual', pg_temp.demo_moment(-33, '10:10'))
on conflict (id) do nothing;

-- What the organisers wrote for themselves when they settled each one. The note
-- lives in its own table since migration 20261022130000, which only invoice
-- readers and managers may read; the payer never sees it.
insert into public.invoice_internal_notes (invoice_id, note)
values
  ('d8000000-0000-4000-8000-000000000001', 'Bank transfer received.'),
  ('d8000000-0000-4000-8000-000000000002', 'Bank transfer received.'),
  ('d8000000-0000-4000-8000-000000000003', 'Bank transfer received.'),
  ('d8000000-0000-4000-8000-000000000004', 'Bank transfer received.'),
  ('d8000000-0000-4000-8000-000000000005', 'Bank transfer received.'),
  ('d8000000-0000-4000-8000-000000000006', 'Bank transfer received.'),
  ('d8000000-0000-4000-8000-000000000007', 'Waived: a bursary from the Atlantic Debate Society access fund.'),
  ('d8000000-0000-4000-8000-000000000008', 'Bank transfer received.'),
  ('d8000000-0000-4000-8000-000000000009', 'Bank transfer received.'),
  ('d8000000-0000-4000-8000-000000000011', 'Bank transfer received.'),
  ('d8000000-0000-4000-8000-000000000012', 'Bank transfer received.'),
  ('d8000000-0000-4000-8000-000000000013', 'Paid by the school in one transfer.'),
  ('d8000000-0000-4000-8000-000000000014', 'Paid by the school in one transfer.')
on conflict (invoice_id) do nothing;


-- -----------------------------------------------------------------------------
-- Documents
-- -----------------------------------------------------------------------------
-- Each row describes one PDF in supabase/media/documents/, and its
-- storage_path is where the reset uploads that file. file_size_bytes is the
-- file's real size, so the size shown on the page is true;
-- client/tests/db/demo-conference.test.ts checks that each file is there and
-- that its size matches.
--
-- The background guides went out six weeks before the conference, the
-- resources three weeks before; one of those is for staff only.
insert into public.documents (
  id, conference_id, committee_id, uploaded_by, kind, title, storage_path, file_name,
  file_size_bytes, mime_type, audience, created_at, updated_at
)
values
  ('da000000-0000-4000-8000-000000000101', 'd2000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000011', 'background_guide',
    'DISEC background guide',
    'd2000000-0000-4000-8000-000000000001/background-guides/d3000000-0000-4000-8000-000000000001-d4000000-0000-4000-8000-000000000101.pdf',
    'DISEC background guide.pdf', 1583, 'application/pdf', 'delegates', pg_temp.demo_moment(-45, '18:00'), pg_temp.demo_moment(-45, '18:00')),
  ('da000000-0000-4000-8000-000000000102', 'd2000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000013', 'background_guide',
    'UNHRC background guide',
    'd2000000-0000-4000-8000-000000000001/background-guides/d3000000-0000-4000-8000-000000000002-d4000000-0000-4000-8000-000000000102.pdf',
    'UNHRC background guide.pdf', 1540, 'application/pdf', 'delegates', pg_temp.demo_moment(-45, '18:10'), pg_temp.demo_moment(-45, '18:10')),
  ('da000000-0000-4000-8000-000000000103', 'd2000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000003', 'd5000000-0000-4000-8000-000000000015', 'background_guide',
    'UNSC background guide',
    'd2000000-0000-4000-8000-000000000001/background-guides/d3000000-0000-4000-8000-000000000003-d4000000-0000-4000-8000-000000000103.pdf',
    'UNSC background guide.pdf', 1481, 'application/pdf', 'delegates', pg_temp.demo_moment(-44, '09:30'), pg_temp.demo_moment(-44, '09:30')),
  ('da000000-0000-4000-8000-000000000201', 'd2000000-0000-4000-8000-000000000001', null, 'd5000000-0000-4000-8000-000000000001', 'resource',
    'Rules of procedure',
    'd2000000-0000-4000-8000-000000000001/resources/d4000000-0000-4000-8000-000000000201.pdf',
    'Rules of procedure.pdf', 1317, 'application/pdf', 'everyone', pg_temp.demo_moment(-21, '12:00'), pg_temp.demo_moment(-21, '12:00')),
  ('da000000-0000-4000-8000-000000000202', 'd2000000-0000-4000-8000-000000000001', null, 'd5000000-0000-4000-8000-000000000001', 'resource',
    'Delegate handbook',
    'd2000000-0000-4000-8000-000000000001/resources/d4000000-0000-4000-8000-000000000202.pdf',
    'Delegate handbook.pdf', 1217, 'application/pdf', 'delegates', pg_temp.demo_moment(-21, '12:05'), pg_temp.demo_moment(-21, '12:05')),
  ('da000000-0000-4000-8000-000000000203', 'd2000000-0000-4000-8000-000000000001', null, 'd5000000-0000-4000-8000-000000000002', 'resource',
    'Chair briefing notes',
    'd2000000-0000-4000-8000-000000000001/resources/d4000000-0000-4000-8000-000000000203.pdf',
    'Chair briefing notes.pdf', 1270, 'application/pdf', 'staff', pg_temp.demo_moment(-10, '20:00'), pg_temp.demo_moment(-10, '20:00'))
on conflict (id) do nothing;

-- Position papers, one per seat except the United Arab Emirates, whose
-- delegate never sent one. Each was uploaded by the delegate in the seat and
-- reviewed by the committee's chair. Egypt's was sent back with a comment and
-- Chile's was never reviewed; the rest were approved. The title is the one the
-- app gives a paper (see position-papers.ts). Switzerland's was written on
-- MUNMeet rather than uploaded, and has its own insert below.
insert into public.documents (
  id, conference_id, committee_id, seat_id, uploaded_by, kind, title, storage_path, file_name,
  file_size_bytes, mime_type, audience, review_status, review_comment, reviewed_by, reviewed_at,
  created_at, updated_at
)
select
  paper.id,
  'd2000000-0000-4000-8000-000000000001',
  seat.committee_id,
  seat.id,
  seat.user_id,
  'position_paper',
  'Position paper — ' || seat.name || ' (' || committee.abbreviation || ')',
  'd2000000-0000-4000-8000-000000000001/position-papers/' || seat.id || '-' || paper.file_uuid || '.pdf',
  seat.name || ' - ' || committee.abbreviation || ' position paper.pdf',
  paper.file_size_bytes,
  'application/pdf',
  'delegates',
  paper.review_status::public.review_status,
  paper.review_comment,
  chair.user_id,
  paper.reviewed_at,
  paper.uploaded_at,
  coalesce(paper.reviewed_at, paper.uploaded_at)
from (
  values
    -- DISEC
    ('da000000-0000-4000-8000-000000000001'::uuid, 'd9000000-0000-4000-8000-000000000001'::uuid, 'd4000000-0000-4000-8000-000000000001', 1942, 'approved', null, pg_temp.demo_moment(-12, '19:10'), pg_temp.demo_moment(-5, '10:00')),
    ('da000000-0000-4000-8000-000000000002'::uuid, 'd9000000-0000-4000-8000-000000000002'::uuid, 'd4000000-0000-4000-8000-000000000002', 1942, 'approved', null, pg_temp.demo_moment(-11, '22:45'), pg_temp.demo_moment(-5, '10:05')),
    ('da000000-0000-4000-8000-000000000003'::uuid, 'd9000000-0000-4000-8000-000000000003'::uuid, 'd4000000-0000-4000-8000-000000000003', 1927, 'approved', null, pg_temp.demo_moment(-10, '17:30'), pg_temp.demo_moment(-5, '10:10')),
    ('da000000-0000-4000-8000-000000000004'::uuid, 'd9000000-0000-4000-8000-000000000004'::uuid, 'd4000000-0000-4000-8000-000000000004', 1922, 'changes_requested', 'Please add your country''s position on the second topic.', pg_temp.demo_moment(-8, '23:30'), pg_temp.demo_moment(-5, '10:15')),
    ('da000000-0000-4000-8000-000000000005'::uuid, 'd9000000-0000-4000-8000-000000000005'::uuid, 'd4000000-0000-4000-8000-000000000005', 1932, 'approved', null, pg_temp.demo_moment(-12, '16:00'), pg_temp.demo_moment(-5, '10:20')),
    ('da000000-0000-4000-8000-000000000006'::uuid, 'd9000000-0000-4000-8000-000000000006'::uuid, 'd4000000-0000-4000-8000-000000000006', 1922, 'approved', null, pg_temp.demo_moment(-9, '21:15'), pg_temp.demo_moment(-5, '10:25')),
    ('da000000-0000-4000-8000-000000000007'::uuid, 'd9000000-0000-4000-8000-000000000007'::uuid, 'd4000000-0000-4000-8000-000000000007', 1922, 'approved', null, pg_temp.demo_moment(-11, '18:40'), pg_temp.demo_moment(-5, '10:30')),
    ('da000000-0000-4000-8000-000000000008'::uuid, 'd9000000-0000-4000-8000-000000000008'::uuid, 'd4000000-0000-4000-8000-000000000008', 1932, 'approved', null, pg_temp.demo_moment(-8, '20:05'), pg_temp.demo_moment(-5, '10:35')),
    -- UNHRC
    ('da000000-0000-4000-8000-000000000011'::uuid, 'd9000000-0000-4000-8000-000000000011'::uuid, 'd4000000-0000-4000-8000-000000000011', 1912, 'approved', null, pg_temp.demo_moment(-10, '19:00'), pg_temp.demo_moment(-4, '11:00')),
    ('da000000-0000-4000-8000-000000000012'::uuid, 'd9000000-0000-4000-8000-000000000012'::uuid, 'd4000000-0000-4000-8000-000000000012', 1907, 'submitted', null, pg_temp.demo_moment(-7, '23:50'), null),
    ('da000000-0000-4000-8000-000000000013'::uuid, 'd9000000-0000-4000-8000-000000000013'::uuid, 'd4000000-0000-4000-8000-000000000013', 1927, 'approved', null, pg_temp.demo_moment(-12, '12:30'), pg_temp.demo_moment(-4, '11:05')),
    ('da000000-0000-4000-8000-000000000014'::uuid, 'd9000000-0000-4000-8000-000000000014'::uuid, 'd4000000-0000-4000-8000-000000000014', 1907, 'approved', null, pg_temp.demo_moment(-9, '15:20'), pg_temp.demo_moment(-4, '11:10')),
    ('da000000-0000-4000-8000-000000000015'::uuid, 'd9000000-0000-4000-8000-000000000015'::uuid, 'd4000000-0000-4000-8000-000000000015', 1912, 'approved', null, pg_temp.demo_moment(-11, '20:10'), pg_temp.demo_moment(-4, '11:15')),
    ('da000000-0000-4000-8000-000000000016'::uuid, 'd9000000-0000-4000-8000-000000000016'::uuid, 'd4000000-0000-4000-8000-000000000016', 1937, 'approved', null, pg_temp.demo_moment(-12, '09:45'), pg_temp.demo_moment(-4, '11:20')),
    ('da000000-0000-4000-8000-000000000017'::uuid, 'd9000000-0000-4000-8000-000000000017'::uuid, 'd4000000-0000-4000-8000-000000000017', 1912, 'approved', null, pg_temp.demo_moment(-8, '18:00'), pg_temp.demo_moment(-4, '11:25')),
    ('da000000-0000-4000-8000-000000000018'::uuid, 'd9000000-0000-4000-8000-000000000018'::uuid, 'd4000000-0000-4000-8000-000000000018', 1942, 'approved', null, pg_temp.demo_moment(-10, '22:30'), pg_temp.demo_moment(-4, '11:30')),
    -- UNSC
    ('da000000-0000-4000-8000-000000000021'::uuid, 'd9000000-0000-4000-8000-000000000021'::uuid, 'd4000000-0000-4000-8000-000000000021', 1883, 'approved', null, pg_temp.demo_moment(-9, '19:30'), pg_temp.demo_moment(-5, '14:00')),
    ('da000000-0000-4000-8000-000000000022'::uuid, 'd9000000-0000-4000-8000-000000000022'::uuid, 'd4000000-0000-4000-8000-000000000022', 1888, 'approved', null, pg_temp.demo_moment(-12, '21:00'), pg_temp.demo_moment(-5, '14:05')),
    ('da000000-0000-4000-8000-000000000023'::uuid, 'd9000000-0000-4000-8000-000000000023'::uuid, 'd4000000-0000-4000-8000-000000000023', 1948, 'approved', null, pg_temp.demo_moment(-11, '16:15'), pg_temp.demo_moment(-5, '14:10')),
    ('da000000-0000-4000-8000-000000000024'::uuid, 'd9000000-0000-4000-8000-000000000024'::uuid, 'd4000000-0000-4000-8000-000000000024', 1928, 'approved', null, pg_temp.demo_moment(-10, '20:40'), pg_temp.demo_moment(-5, '14:15')),
    ('da000000-0000-4000-8000-000000000025'::uuid, 'd9000000-0000-4000-8000-000000000025'::uuid, 'd4000000-0000-4000-8000-000000000025', 1923, 'approved', null, pg_temp.demo_moment(-12, '11:10'), pg_temp.demo_moment(-5, '14:20')),
    ('da000000-0000-4000-8000-000000000026'::uuid, 'd9000000-0000-4000-8000-000000000026'::uuid, 'd4000000-0000-4000-8000-000000000026', 1883, 'approved', null, pg_temp.demo_moment(-8, '21:35'), pg_temp.demo_moment(-5, '14:25'))
) as paper (id, seat_id, file_uuid, file_size_bytes, review_status, review_comment, uploaded_at, reviewed_at)
join public.seats as seat on seat.id = paper.seat_id
join public.committees as committee on committee.id = seat.committee_id
-- The paper is reviewed by the committee's chair, not the vice-chair, and an
-- unreviewed paper has no reviewer at all.
left join public.committee_chairs as chair
  on chair.committee_id = seat.committee_id
  and chair.title = 'Chair'
  and paper.reviewed_at is not null
on conflict (id) do nothing;

-- Switzerland's paper in the Security Council was written on MUNMeet (T145)
-- and approved by the committee's chair, so the demo has a written paper to
-- read on the chair's reading page (T146). A written paper keeps its text in
-- body_markdown and has no file, which `documents_file_or_body` requires.
insert into public.documents (
  id, conference_id, committee_id, seat_id, uploaded_by, kind, title, body_markdown,
  audience, review_status, reviewed_by, reviewed_at, created_at, updated_at
)
values (
  'da000000-0000-4000-8000-000000000027',
  'd2000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000003',
  'd9000000-0000-4000-8000-000000000027',
  'd5000000-0000-4000-8000-000000000053',
  'position_paper',
  'Position paper — Switzerland (UNSC)',
  E'## The situation in the Sahel\n\nSwitzerland supports a **political settlement** led by the states of the region, and asks the Council to protect humanitarian access in every mandate it renews.\n\n- Mediation through the African Union\n- Safe passage for aid convoys\n\n## Maritime security in the Gulf of Guinea\n\nSwitzerland backs the Yaoundé Code of Conduct and shared patrols, with prosecutions under the law of the coastal states.\n',
  'delegates',
  'approved',
  'd5000000-0000-4000-8000-000000000015',
  pg_temp.demo_moment(-5, '14:30'),
  pg_temp.demo_moment(-9, '17:50'),
  pg_temp.demo_moment(-5, '14:30')
)
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- The schedule
-- -----------------------------------------------------------------------------
-- Three days. Most events are for everyone; the chairs' award meeting is for
-- staff only and the Security Council's crisis briefing is for its members.
insert into public.schedule_events (
  id, conference_id, committee_id, title, description, location, starts_at, ends_at, audience, created_at
)
values
  ('e1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', null, 'Registration and badge collection', 'Bring a photo ID. Your badge has your committee and country on it.', 'Main hall', pg_temp.demo_moment(0, '09:00'), pg_temp.demo_moment(0, '10:30'), 'everyone', pg_temp.demo_moment(-40, '10:00')),
  ('e1000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000001', null, 'Opening ceremony', 'Welcome from the Secretary-General and a keynote on the future of multilateralism.', 'Auditorium', pg_temp.demo_moment(0, '11:00'), pg_temp.demo_moment(0, '12:30'), 'everyone', pg_temp.demo_moment(-40, '10:00')),
  ('e1000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000001', null, 'Committee session I', null, 'Committee rooms', pg_temp.demo_moment(0, '14:00'), pg_temp.demo_moment(0, '17:30'), 'everyone', pg_temp.demo_moment(-40, '10:00')),
  ('e1000000-0000-4000-8000-000000000004', 'd2000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000003', 'Security Council crisis briefing', 'A short update on events in the Sahel overnight. Be on time.', 'Room 3.02', pg_temp.demo_moment(1, '08:45'), pg_temp.demo_moment(1, '09:15'), 'committee', pg_temp.demo_moment(-3, '18:00')),
  ('e1000000-0000-4000-8000-000000000005', 'd2000000-0000-4000-8000-000000000001', null, 'Committee session II', null, 'Committee rooms', pg_temp.demo_moment(1, '09:30'), pg_temp.demo_moment(1, '12:30'), 'everyone', pg_temp.demo_moment(-40, '10:00')),
  ('e1000000-0000-4000-8000-000000000006', 'd2000000-0000-4000-8000-000000000001', null, 'Committee session III', null, 'Committee rooms', pg_temp.demo_moment(1, '14:00'), pg_temp.demo_moment(1, '17:30'), 'everyone', pg_temp.demo_moment(-40, '10:00')),
  ('e1000000-0000-4000-8000-000000000007', 'd2000000-0000-4000-8000-000000000001', null, 'Delegates'' social', 'Dinner and music by the river. Badges required.', 'Terraço do Rio', pg_temp.demo_moment(1, '20:00'), pg_temp.demo_moment(1, '23:00'), 'everyone', pg_temp.demo_moment(-40, '10:00')),
  ('e1000000-0000-4000-8000-000000000008', 'd2000000-0000-4000-8000-000000000001', null, 'Chairs'' meeting: awards', 'Each committee brings its shortlist.', 'Secretariat office', pg_temp.demo_moment(2, '08:30'), pg_temp.demo_moment(2, '09:15'), 'staff', pg_temp.demo_moment(-40, '10:00')),
  ('e1000000-0000-4000-8000-000000000009', 'd2000000-0000-4000-8000-000000000001', null, 'General Assembly plenary', 'Each committee presents the resolution it passed.', 'Auditorium', pg_temp.demo_moment(2, '09:30'), pg_temp.demo_moment(2, '12:30'), 'everyone', pg_temp.demo_moment(-40, '10:00')),
  ('e1000000-0000-4000-8000-000000000010', 'd2000000-0000-4000-8000-000000000001', null, 'Closing ceremony and awards', null, 'Auditorium', pg_temp.demo_moment(2, '16:00'), pg_temp.demo_moment(2, '18:00'), 'everyone', pg_temp.demo_moment(-40, '10:00'))
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- Announcements
-- -----------------------------------------------------------------------------
-- Publishing an announcement notifies everybody in its audience (trigger
-- notify_announcement), and the trigger first checks that the author is allowed
-- to write to that audience. It asks "who is signed in?" through auth.uid(),
-- which reads the request's claims, so each author is set as the signed-in user
-- for the insert with set_config, and cleared again afterwards. The "false"
-- means the setting lasts until it is changed, not only to the end of a
-- transaction.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd5000000-0000-4000-8000-000000000001')::text,
  false
);

insert into public.announcements (
  id, conference_id, author_id, title, body, audience, committee_id, delegation_id, is_pinned,
  published_at, created_at, updated_at
)
values
  ('e2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
    'Seats are out',
    'Every delegate now has a seat. Your committee, your country and your invoice are on your dashboard, and each committee''s background guide is with the conference documents.',
    'everyone', null, null, false,
    pg_temp.demo_moment(-33, '11:00'), pg_temp.demo_moment(-33, '11:00'), pg_temp.demo_moment(-33, '11:00')),
  ('e2000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
    'Position papers are due in three days',
    'Upload your position paper as a PDF from your seat page before midnight on the deadline. Your chair reads every paper and may ask for changes.',
    'delegates', null, null, false,
    pg_temp.demo_moment(-10, '09:00'), pg_temp.demo_moment(-10, '09:00'), pg_temp.demo_moment(-10, '09:00')),
  ('e2000000-0000-4000-8000-000000000004', 'd2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
    'Colégio Atlântico: meeting point on day one',
    'Meet at the main entrance at 08:45 on the first day. Catarina will hand out badges before registration opens.',
    'delegation', null, 'd6000000-0000-4000-8000-000000000101', false,
    pg_temp.demo_moment(-1, '17:00'), pg_temp.demo_moment(-1, '17:00'), pg_temp.demo_moment(-1, '17:00')),
  ('e2000000-0000-4000-8000-000000000005', 'd2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
    'Staff briefing',
    'All staff at the Secretariat office at 08:00 on day one for radios, room keys and the running order.',
    'staff', null, null, false,
    pg_temp.demo_moment(-2, '12:00'), pg_temp.demo_moment(-2, '12:00'), pg_temp.demo_moment(-2, '12:00')),
  ('e2000000-0000-4000-8000-000000000006', 'd2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
    'Thank you for Lisbon Atlantic MUN',
    'Thank you to every delegate, chair and volunteer for three brilliant days. The awards are now on your dashboards, and the photos will follow next week. See you next year!',
    'everyone', null, null, true,
    pg_temp.demo_moment(2, '19:00'), pg_temp.demo_moment(2, '19:00'), pg_temp.demo_moment(2, '19:00'))
on conflict (id) do nothing;

-- The Security Council's chair writes to his own committee, which a chair may
-- do, so he is the signed-in user for this one.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd5000000-0000-4000-8000-000000000015')::text,
  false
);

insert into public.announcements (
  id, conference_id, author_id, title, body, audience, committee_id, delegation_id, is_pinned,
  published_at, created_at, updated_at
)
values
  ('e2000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000015',
    'Security Council: reading before day one',
    'Please read the latest Secretary-General report on the Sahel before the first session. We will open with the General Speakers'' List on the situation in the Sahel.',
    'committee', 'd3000000-0000-4000-8000-000000000003', null, false,
    pg_temp.demo_moment(-3, '18:00'), pg_temp.demo_moment(-3, '18:00'), pg_temp.demo_moment(-3, '18:00'))
on conflict (id) do nothing;

-- Nobody is signed in any more.
select set_config('request.jwt.claims', '', false);


-- -----------------------------------------------------------------------------
-- The committee room: sessions, roll calls, speeches, motions and votes
-- -----------------------------------------------------------------------------
-- Every committee met three times and every session has ended. The ids of the
-- sessions (db...) and their roll calls (df...) end in the committee's number
-- and then the session's: ...31 is the Security Council's Session 1.
insert into public.committee_sessions (id, committee_id, name, status, started_at, ended_at, created_at)
values
  ('db000000-0000-4000-8000-000000000011', 'd3000000-0000-4000-8000-000000000001', 'Session 1', 'ended', pg_temp.demo_moment(0, '14:00'), pg_temp.demo_moment(0, '17:30'), pg_temp.demo_moment(0, '14:00')),
  ('db000000-0000-4000-8000-000000000012', 'd3000000-0000-4000-8000-000000000001', 'Session 2', 'ended', pg_temp.demo_moment(1, '09:30'), pg_temp.demo_moment(1, '12:30'), pg_temp.demo_moment(1, '09:30')),
  ('db000000-0000-4000-8000-000000000013', 'd3000000-0000-4000-8000-000000000001', 'Session 3', 'ended', pg_temp.demo_moment(1, '14:00'), pg_temp.demo_moment(1, '17:30'), pg_temp.demo_moment(1, '14:00')),
  ('db000000-0000-4000-8000-000000000021', 'd3000000-0000-4000-8000-000000000002', 'Session 1', 'ended', pg_temp.demo_moment(0, '14:00'), pg_temp.demo_moment(0, '17:30'), pg_temp.demo_moment(0, '14:00')),
  ('db000000-0000-4000-8000-000000000022', 'd3000000-0000-4000-8000-000000000002', 'Session 2', 'ended', pg_temp.demo_moment(1, '09:30'), pg_temp.demo_moment(1, '12:30'), pg_temp.demo_moment(1, '09:30')),
  ('db000000-0000-4000-8000-000000000023', 'd3000000-0000-4000-8000-000000000002', 'Session 3', 'ended', pg_temp.demo_moment(1, '14:00'), pg_temp.demo_moment(1, '17:30'), pg_temp.demo_moment(1, '14:00')),
  ('db000000-0000-4000-8000-000000000031', 'd3000000-0000-4000-8000-000000000003', 'Session 1', 'ended', pg_temp.demo_moment(0, '14:00'), pg_temp.demo_moment(0, '17:30'), pg_temp.demo_moment(0, '14:00')),
  ('db000000-0000-4000-8000-000000000032', 'd3000000-0000-4000-8000-000000000003', 'Session 2', 'ended', pg_temp.demo_moment(1, '09:30'), pg_temp.demo_moment(1, '12:30'), pg_temp.demo_moment(1, '09:30')),
  ('db000000-0000-4000-8000-000000000033', 'd3000000-0000-4000-8000-000000000003', 'Session 3', 'ended', pg_temp.demo_moment(1, '14:00'), pg_temp.demo_moment(1, '17:30'), pg_temp.demo_moment(1, '14:00'))
on conflict (id) do nothing;

-- Each session opened with a roll call taken by the committee's chair. A roll
-- call's id is its session's with "df" in place of the first two characters
-- "db", which substr(..., 3) keeps the rest of.
insert into public.roll_calls (id, session_id, taken_by, taken_at)
select
  ('df' || substr(session.id::text, 3))::uuid,
  session.id,
  chair.user_id,
  session.started_at + interval '5 minutes'
from public.committee_sessions as session
join public.committee_chairs as chair
  on chair.committee_id = session.committee_id
  and chair.title = 'Chair'
where session.committee_id in (
  'd3000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000002',
  'd3000000-0000-4000-8000-000000000003'
)
on conflict (id) do nothing;

-- Everybody answered "present and voting" at every roll call, except the two
-- changed straight after: Nigeria missed DISEC's second session, and
-- Switzerland answered only "present" in the Security Council's first.
insert into public.roll_call_entries (roll_call_id, seat_id, status, created_at)
select roll_call.id, seat.id, 'present_and_voting', roll_call.taken_at
from public.roll_calls as roll_call
join public.committee_sessions as session on session.id = roll_call.session_id
join public.seats as seat on seat.committee_id = session.committee_id
where session.committee_id in (
  'd3000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000002',
  'd3000000-0000-4000-8000-000000000003'
)
on conflict do nothing;

update public.roll_call_entries
set status = 'absent'
where roll_call_id = 'df000000-0000-4000-8000-000000000012'
  and seat_id = 'd9000000-0000-4000-8000-000000000008';

update public.roll_call_entries
set status = 'present'
where roll_call_id = 'df000000-0000-4000-8000-000000000031'
  and seat_id = 'd9000000-0000-4000-8000-000000000027';

-- Every session has a General Speakers' List, as the app opens one when a
-- session starts. They are closed, because the sessions are over. The
-- moderated caucus in the Security Council's Session 1 has a list of its own,
-- which is added with its motion further down.
insert into public.speakers_lists (id, committee_id, session_id, motion_id, kind, name, speaking_time_seconds, is_open, created_at)
select
  -- The session's id with "dd" in place of "db", as for the roll calls.
  ('dd' || substr(session.id::text, 3))::uuid,
  session.committee_id,
  session.id,
  null,
  'general',
  'General Speakers'' List',
  90,
  false,
  session.started_at
from public.committee_sessions as session
where session.committee_id in (
  'd3000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000002',
  'd3000000-0000-4000-8000-000000000003'
)
on conflict (id) do nothing;

-- In the first session of DISEC and the Human Rights Council every delegate
-- gave an opening speech from the General Speakers' List, in seat order,
-- two minutes apart. "not exists" keeps a second run of this file from adding
-- the speeches again, because these rows have no fixed ids.
insert into public.speakers_list_entries (speakers_list_id, seat_id, position, status, started_at, finished_at, spoke_seconds, created_at)
select
  list.id,
  seat.id,
  seat.position,
  'spoken',
  session.started_at + make_interval(mins => 10 + seat.position * 2),
  session.started_at + make_interval(mins => 10 + seat.position * 2, secs => 80),
  80,
  session.started_at + interval '8 minutes'
from public.speakers_lists as list
join public.committee_sessions as session on session.id = list.session_id
join public.seats as seat on seat.committee_id = list.committee_id
where list.id in ('dd000000-0000-4000-8000-000000000011', 'dd000000-0000-4000-8000-000000000021')
  and not exists (
    select 1
    from public.speakers_list_entries as entry
    where entry.speakers_list_id = list.id
  );

-- The Security Council's Session 1, speech by speech. Seven delegates spoke
-- on the General Speakers' List; Switzerland took its name off the list.
insert into public.speakers_list_entries (id, speakers_list_id, seat_id, position, status, started_at, finished_at, spoke_seconds, created_at)
values
  ('e4000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000031', 'd9000000-0000-4000-8000-000000000022', 1, 'spoken', pg_temp.demo_moment(0, '14:08:00'), pg_temp.demo_moment(0, '14:09:25'), 85, pg_temp.demo_moment(0, '14:06')),
  ('e4000000-0000-4000-8000-000000000002', 'dd000000-0000-4000-8000-000000000031', 'd9000000-0000-4000-8000-000000000024', 2, 'spoken', pg_temp.demo_moment(0, '14:09:40'), pg_temp.demo_moment(0, '14:11:10'), 90, pg_temp.demo_moment(0, '14:06')),
  ('e4000000-0000-4000-8000-000000000003', 'dd000000-0000-4000-8000-000000000031', 'd9000000-0000-4000-8000-000000000025', 3, 'spoken', pg_temp.demo_moment(0, '14:11:20'), pg_temp.demo_moment(0, '14:12:44'), 84, pg_temp.demo_moment(0, '14:06')),
  ('e4000000-0000-4000-8000-000000000004', 'dd000000-0000-4000-8000-000000000031', 'd9000000-0000-4000-8000-000000000021', 4, 'spoken', pg_temp.demo_moment(0, '14:13:00'), pg_temp.demo_moment(0, '14:14:30'), 90, pg_temp.demo_moment(0, '14:06')),
  ('e4000000-0000-4000-8000-000000000005', 'dd000000-0000-4000-8000-000000000031', 'd9000000-0000-4000-8000-000000000023', 5, 'spoken', pg_temp.demo_moment(0, '14:14:40'), pg_temp.demo_moment(0, '14:16:02'), 82, pg_temp.demo_moment(0, '14:06')),
  ('e4000000-0000-4000-8000-000000000006', 'dd000000-0000-4000-8000-000000000031', 'd9000000-0000-4000-8000-000000000026', 6, 'spoken', pg_temp.demo_moment(0, '14:16:10'), pg_temp.demo_moment(0, '14:17:21'), 71, pg_temp.demo_moment(0, '14:07')),
  ('e4000000-0000-4000-8000-000000000007', 'dd000000-0000-4000-8000-000000000031', 'd9000000-0000-4000-8000-000000000028', 7, 'spoken', pg_temp.demo_moment(0, '14:17:30'), pg_temp.demo_moment(0, '14:18:58'), 88, pg_temp.demo_moment(0, '14:07')),
  ('e4000000-0000-4000-8000-000000000008', 'dd000000-0000-4000-8000-000000000031', 'd9000000-0000-4000-8000-000000000027', 8, 'removed', null, null, null, pg_temp.demo_moment(0, '14:07'))
on conflict (id) do nothing;

-- The motions of that session, in the order they were raised: a moderated
-- caucus that passed, an unmoderated caucus that failed, a longer one that
-- passed for drafting, and closure of debate before the vote.
insert into public.motions (
  id, committee_id, session_id, proposed_by_seat_id, kind, topic, total_time_seconds,
  speaking_time_seconds, status, votes_for, votes_against, decided_at, created_at
)
values
  ('dc000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000003', 'db000000-0000-4000-8000-000000000031', 'd9000000-0000-4000-8000-000000000022',
    'moderated_caucus', 'Protecting civilians in the Sahel', 600, 60, 'passed', 6, 2, pg_temp.demo_moment(0, '14:21'), pg_temp.demo_moment(0, '14:19')),
  ('dc000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000003', 'db000000-0000-4000-8000-000000000031', 'd9000000-0000-4000-8000-000000000023',
    'unmoderated_caucus', null, 900, null, 'failed', 3, 5, pg_temp.demo_moment(0, '14:33'), pg_temp.demo_moment(0, '14:32')),
  ('dc000000-0000-4000-8000-000000000003', 'd3000000-0000-4000-8000-000000000003', 'db000000-0000-4000-8000-000000000031', 'd9000000-0000-4000-8000-000000000026',
    'unmoderated_caucus', null, 1200, null, 'passed', 6, 2, pg_temp.demo_moment(0, '14:36'), pg_temp.demo_moment(0, '14:35')),
  ('dc000000-0000-4000-8000-000000000004', 'd3000000-0000-4000-8000-000000000003', 'db000000-0000-4000-8000-000000000031', 'd9000000-0000-4000-8000-000000000024',
    'close_debate', null, null, null, 'passed', 7, 1, pg_temp.demo_moment(0, '17:01'), pg_temp.demo_moment(0, '17:00'))
on conflict (id) do nothing;

-- The moderated caucus got its own speakers' list, named after its topic, as
-- the app does when such a motion passes.
insert into public.speakers_lists (id, committee_id, session_id, motion_id, kind, name, speaking_time_seconds, is_open, created_at)
values (
  'dd000000-0000-4000-8000-000000000131',
  'd3000000-0000-4000-8000-000000000003',
  'db000000-0000-4000-8000-000000000031',
  'dc000000-0000-4000-8000-000000000001',
  'caucus',
  'Protecting civilians in the Sahel',
  60,
  false,
  pg_temp.demo_moment(0, '14:21')
)
on conflict (id) do nothing;

insert into public.speakers_list_entries (id, speakers_list_id, seat_id, position, status, started_at, finished_at, spoke_seconds, created_at)
values
  ('e4000000-0000-4000-8000-000000000011', 'dd000000-0000-4000-8000-000000000131', 'd9000000-0000-4000-8000-000000000022', 1, 'spoken', pg_temp.demo_moment(0, '14:21:30'), pg_temp.demo_moment(0, '14:22:30'), 60, pg_temp.demo_moment(0, '14:21')),
  ('e4000000-0000-4000-8000-000000000012', 'dd000000-0000-4000-8000-000000000131', 'd9000000-0000-4000-8000-000000000026', 2, 'spoken', pg_temp.demo_moment(0, '14:22:40'), pg_temp.demo_moment(0, '14:23:38'), 58, pg_temp.demo_moment(0, '14:21')),
  ('e4000000-0000-4000-8000-000000000013', 'dd000000-0000-4000-8000-000000000131', 'd9000000-0000-4000-8000-000000000025', 3, 'spoken', pg_temp.demo_moment(0, '14:23:50'), pg_temp.demo_moment(0, '14:24:50'), 60, pg_temp.demo_moment(0, '14:21')),
  ('e4000000-0000-4000-8000-000000000014', 'dd000000-0000-4000-8000-000000000131', 'd9000000-0000-4000-8000-000000000021', 4, 'spoken', pg_temp.demo_moment(0, '14:25:00'), pg_temp.demo_moment(0, '14:25:55'), 55, pg_temp.demo_moment(0, '14:22')),
  ('e4000000-0000-4000-8000-000000000015', 'dd000000-0000-4000-8000-000000000131', 'd9000000-0000-4000-8000-000000000024', 5, 'spoken', pg_temp.demo_moment(0, '14:26:05'), pg_temp.demo_moment(0, '14:27:05'), 60, pg_temp.demo_moment(0, '14:22')),
  ('e4000000-0000-4000-8000-000000000016', 'dd000000-0000-4000-8000-000000000131', 'd9000000-0000-4000-8000-000000000023', 6, 'spoken', pg_temp.demo_moment(0, '14:27:15'), pg_temp.demo_moment(0, '14:28:12'), 57, pg_temp.demo_moment(0, '14:23'))
on conflict (id) do nothing;

-- Each committee passed its first draft resolution. The Security Council voted
-- by roll call, so its vote has one entry per seat; the other two voted by show
-- of hands, which only keeps the totals.
insert into public.votes (
  id, committee_id, session_id, kind, subject, method, majority, status,
  votes_for, votes_against, votes_abstain, passed, opened_at, closed_at
)
values
  ('de000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000003', 'db000000-0000-4000-8000-000000000031', 'substantive',
    'Draft Resolution 1.1 · The situation in the Sahel', 'roll_call', 'simple', 'closed',
    6, 0, 2, true, pg_temp.demo_moment(0, '17:05'), pg_temp.demo_moment(0, '17:12')),
  ('de000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000001', 'db000000-0000-4000-8000-000000000013', 'substantive',
    'Draft Resolution 1.1 · Lethal autonomous weapons systems', 'show_of_hands', 'simple', 'closed',
    6, 1, 1, true, pg_temp.demo_moment(1, '17:00'), pg_temp.demo_moment(1, '17:03')),
  ('de000000-0000-4000-8000-000000000003', 'd3000000-0000-4000-8000-000000000002', 'db000000-0000-4000-8000-000000000023', 'substantive',
    'Draft Resolution 1.1 · The right to privacy in the digital age', 'show_of_hands', 'simple', 'closed',
    5, 2, 1, true, pg_temp.demo_moment(1, '17:05'), pg_temp.demo_moment(1, '17:08'))
on conflict (id) do nothing;

insert into public.vote_entries (vote_id, seat_id, choice, created_at)
values
  ('de000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000021', 'abstain', pg_temp.demo_moment(0, '17:06')),
  ('de000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000022', 'for', pg_temp.demo_moment(0, '17:06')),
  ('de000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000023', 'abstain', pg_temp.demo_moment(0, '17:07')),
  ('de000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000024', 'for', pg_temp.demo_moment(0, '17:07')),
  ('de000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000025', 'for', pg_temp.demo_moment(0, '17:08')),
  ('de000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000026', 'for', pg_temp.demo_moment(0, '17:09')),
  ('de000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000027', 'for', pg_temp.demo_moment(0, '17:10')),
  ('de000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000028', 'for', pg_temp.demo_moment(0, '17:11'))
on conflict do nothing;

-- The Security Council chair's private notes on three delegates, which only
-- the committee's chairs can read.
insert into public.chair_notes (id, committee_id, seat_id, author_id, body, created_at)
values
  ('e0000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000003', 'd9000000-0000-4000-8000-000000000022', 'd5000000-0000-4000-8000-000000000015',
    'Strong opening speech. Led the drafting bloc on the Sahel resolution.', pg_temp.demo_moment(0, '15:10')),
  ('e0000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000003', 'd9000000-0000-4000-8000-000000000023', 'd5000000-0000-4000-8000-000000000015',
    'Stayed firmly in character on sovereignty; good use of points of information.', pg_temp.demo_moment(0, '16:20')),
  ('e0000000-0000-4000-8000-000000000003', 'd3000000-0000-4000-8000-000000000003', 'd9000000-0000-4000-8000-000000000026', 'd5000000-0000-4000-8000-000000000015',
    'Quiet in the first hour, then found their voice in the moderated caucus.', pg_temp.demo_moment(1, '11:45'))
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- Awards
-- -----------------------------------------------------------------------------
-- Four awards per committee, proposed and confirmed by its chair on the last
-- morning. Each names the person in the seat, which is what the app records
-- when the awards are published.
insert into public.awards (committee_id, seat_id, user_id, kind, title, status, created_by, created_at)
select
  seat.committee_id,
  seat.id,
  seat.user_id,
  award.kind::public.award_kind,
  award.title,
  'confirmed',
  chair.user_id,
  pg_temp.demo_moment(2, '13:00')
from (
  values
    -- DISEC
    ('d9000000-0000-4000-8000-000000000006'::uuid, 'best_delegate', 'Best Delegate'),
    ('d9000000-0000-4000-8000-000000000005'::uuid, 'outstanding_delegate', 'Outstanding Delegate'),
    ('d9000000-0000-4000-8000-000000000008'::uuid, 'honourable_mention', 'Honourable Mention'),
    ('d9000000-0000-4000-8000-000000000003'::uuid, 'best_position_paper', 'Best Position Paper'),
    -- UNHRC
    ('d9000000-0000-4000-8000-000000000018'::uuid, 'best_delegate', 'Best Delegate'),
    ('d9000000-0000-4000-8000-000000000011'::uuid, 'outstanding_delegate', 'Outstanding Delegate'),
    ('d9000000-0000-4000-8000-000000000016'::uuid, 'honourable_mention', 'Honourable Mention'),
    ('d9000000-0000-4000-8000-000000000014'::uuid, 'verbal_commendation', 'Verbal Commendation'),
    -- UNSC
    ('d9000000-0000-4000-8000-000000000022'::uuid, 'best_delegate', 'Best Delegate'),
    ('d9000000-0000-4000-8000-000000000025'::uuid, 'outstanding_delegate', 'Outstanding Delegate'),
    ('d9000000-0000-4000-8000-000000000021'::uuid, 'honourable_mention', 'Honourable Mention'),
    ('d9000000-0000-4000-8000-000000000024'::uuid, 'best_position_paper', 'Best Position Paper')
) as award (seat_id, kind, title)
join public.seats as seat on seat.id = award.seat_id
join public.committee_chairs as chair
  on chair.committee_id = seat.committee_id
  and chair.title = 'Chair'
on conflict (committee_id, seat_id, kind) do nothing;

-- Publishing the awards is the last thing the organisers did, at the closing
-- ceremony. Setting awards_published_at sends each winner an "award" notification
-- (trigger notify_awards_published), dated at the moment of publishing. The
-- "is null" check stops a second run from sending them again.
update public.conferences
set awards_published_at = pg_temp.demo_moment(2, '18:30')
where id = 'd2000000-0000-4000-8000-000000000001'
  and awards_published_at is null;


-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------
-- The invoice and announcement triggers above dated their notifications today,
-- because they use now(). Here they are moved back to when their invoice or
-- announcement came out, and marked read an hour later, except for the closing
-- announcement, which is left unread along with the award notifications. That
-- way the bell shows only what came at the end of the conference.
update public.notifications as notification
set created_at = invoice.created_at,
    read_at = invoice.created_at + interval '1 hour'
from public.invoices as invoice
where invoice.conference_id = 'd2000000-0000-4000-8000-000000000001'
  and notification.link_path = '/invoices/' || invoice.id
  and notification.kind = 'invoice_created';

update public.notifications as notification
set created_at = announcement.published_at,
    read_at = case
      when announcement.is_pinned then null
      else announcement.published_at + interval '1 hour'
    end
from public.announcements as announcement
where announcement.conference_id = 'd2000000-0000-4000-8000-000000000001'
  and notification.link_path like '%announcement=' || announcement.id
  and notification.kind = 'announcement';


-- -----------------------------------------------------------------------------
-- Clean up the helpers
-- -----------------------------------------------------------------------------
-- They would vanish at the end of the session anyway; dropping them here keeps
-- them from being mistaken for part of the schema by anything run afterwards
-- in the same session.
drop table demo_people;
drop function pg_temp.demo_moment(integer, time);
drop function pg_temp.demo_day(integer);
