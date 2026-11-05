-- =============================================================================
-- MUNMeet: the walkthrough (1 organisation, 5 conferences, 56 accounts)
-- File: supabase/walkthrough-seed.sql
-- =============================================================================
--
-- WHAT THIS IS FOR
-- Testing the app by hand. After one `pnpm db:reset` a person should be able
-- to sign in as any role the app has and find a conference in every phase a
-- conference goes through. seed.sql cannot do that, because its rows are
-- chosen for the automated tests, and demo-seed.sql has only one conference,
-- which is over.
--
-- So this file adds one organisation, Northbridge MUN Society, with one
-- conference per phase. Each conference's name says its phase:
--   Northbridge MUN (draft)              being set up; not in the directory
--   Northbridge MUN (opening soon)       published; applications open in
--                                        three days
--   Northbridge MUN (applications open)  applications in every status, with
--                                        answers to the conference's own
--                                        questions, and three school
--                                        delegations: one still forming, one
--                                        waiting for a decision, one turned
--                                        down
--   Northbridge MUN (about to start)     applications closed and the first
--                                        day four days away: seats, invoices,
--                                        a schedule, announcements, background
--                                        guides, position papers, and a school
--                                        delegation with seats kept for it and
--                                        an invoice of its own
--   Northbridge MUN (running today)      a Security Council session in
--                                        progress: agenda set, roll call
--                                        taken, a speaker on the floor and a
--                                        motion proposed, after a practice
--                                        session the day before whose record
--                                        (motions, a vote, notes, proposed
--                                        awards) is kept; a Third Committee
--                                        session just opened, with five
--                                        delegates seated and no agenda set
--                                        yet; and a committee day of papers:
--                                        the Security Council's working
--                                        papers, drafts, amendments and a
--                                        passed resolution, a committee run
--                                        to THIMUN procedure and a crisis
--                                        committee with its directives
-- The finished phase is demo-seed.sql's Lisbon Atlantic MUN, so there is no
-- second finished conference here. Invitations to join the society or a
-- conference's team are here too: waiting, expired and accepted. Every kind
-- of notification is in somebody's bell, some read, except "award published",
-- which only a finished conference sends: demo.delegate@example.test has one.
--
-- Card payments are not here. Every invoice is settled by hand (bank
-- transfer), because paying by card needs a Stripe account (task T32).
--
-- THE DATES MOVE WITH TODAY
-- Every date is a number of days from the day the database was reset, through
-- the helpers pg_temp.walk_day and pg_temp.walk_moment below. So "about to
-- start" is always four days away and "running today" always runs today,
-- however long this file lives. client/tests/db/walkthrough-seed.test.ts
-- checks each conference is in the phase its name claims.
--
-- WALKTHROUGH ACCOUNTS
-- The password for every account in this file is "sample-password-123", the
-- same one the other two seed files use. The address says the role and the
-- phase; supabase/README.md has a table of what to try with each one.
--   walk.organiser@example.test           owner of Northbridge MUN Society
--   walk.org.admin@example.test           an admin of the society, on no
--                                         conference's staff
--   walk.organiser.upcoming@example.test  an organiser on the staff of the
--                                         "about to start" conference only
--   walk.usg.upcoming@example.test        USG delegate affairs of "about to
--                                         start": applications, delegations
--                                         and every private detail, no money
--                                         beyond reading it
--   walk.finance.upcoming@example.test    Finance of "about to start":
--                                         invoices, the fee list, addresses
--                                         and no welfare details
--   walk.desk.upcoming@example.test       the registration desk of "about to
--                                         start": the participants and their
--                                         welfare details, nothing else
--   walk.chair.live@example.test          chair of the running Security Council
--   walk.chair.upcoming@example.test      chair of the Human Rights Council of
--                                         "about to start"; reviews its papers,
--                                         one uploaded and one written
--   walk.chair.thimun@example.test        chair of ECOFIN, run to THIMUN
--                                         procedure in "running today", with
--                                         a draft resolution to decide
--   walk.chair.crisis@example.test        chair of ExComm, the crisis
--                                         committee of "running today"
--   walk.crisis.staff@example.test        the crisis staff of ExComm: answers
--                                         its directives, and nothing else
--   walk.volunteer.live@example.test      a volunteer at "running today"
--   walk.head.open@example.test           head of a school delegation forming
--                                         in "applications open"
--   walk.head.submitted@example.test      head of a school delegation waiting
--                                         for a decision in "applications open"
--   walk.head.upcoming@example.test       head of an accepted school delegation
--                                         in "about to start", with a seat to
--                                         fill and an unpaid invoice
--   walk.delegate.live@example.test       the United Kingdom in the running
--                                         Security Council, waiting to speak
--   walk.delegate.upcoming@example.test   Canada in "about to start", with a
--                                         paper sent back and an unpaid invoice
--   walk.applicant.open@example.test      an application waiting for a decision
--   walk.newcomer@example.test            a new account that has not finished
--                                         onboarding and has no conference,
--                                         only an invitation to volunteer
-- Every other account is walk.<first name>.<last name>@example.test.
--
-- NEVER RUN THIS AGAINST PRODUCTION
-- It writes accounts straight into auth.users with a password printed in this
-- comment, exactly as demo-seed.sql does. It is for the local database only.
--
-- HOW TO RUN
-- It runs by itself: `pnpm db:reset` (from client/) loads seed.sql, then
-- demo-seed.sql, then this file, because supabase/config.toml lists all three
-- under [db.seed]. The PDFs the documents rows point at are in
-- supabase/media/documents/, which the same reset uploads into the
-- "documents" bucket.
--
-- Like the other two, it runs as the "postgres" user, which Row Level Security
-- does not limit and which the guard triggers let through, so it can write
-- rows in their final state.
--
-- It adds rows of its own and never changes a row of the other two files. Its
-- four published conferences all end today or later, so they are in the
-- directory; the two that start soonest start before every conference in
-- seed.sql, and the two taking or about to take applications start after
-- every one of them. specs/02-architecture/testing.md says which browser
-- tests that touches.
--
-- RUNNING IT MORE THAN ONCE
-- Every row has a fixed id, or a natural key, and "on conflict do nothing", so
-- a second run adds nothing. Editing a row and running again does NOT update
-- it; reset the database instead.
--
-- THE IDS
-- Every id starts with "f", which neither of the other files uses: seed.sql's
-- start with a digit and demo-seed.sql's with d or e. The second character
-- says what the row is:
--   f1  the organisation           f9  seats: conference, committee, position
--   f2  conferences 1 to 5         fa  documents (same numbers as their file)
--   f3  committees: conference,    fb  the sessions
--       then committee             fc  the motions
--   f4  the uuid in a file name    fd  the speakers' lists
--   f5  accounts                   fe  speakers' list entries
--   f6  applications (conference,  ff  the roll calls
--       then a number) and the     f0  schedule events (0xx), announcements
--       delegations (101-104)          (1xx), invitations (2xx), application
--   f7  the fees                       questions (3xx), votes (4xx) and chair
--   f8  invoices                       notes (6xx)
-- Conference numbers: 1 draft, 2 opening soon, 3 applications open, 4 about
-- to start, 5 running today. The Security Council's practice session, and
-- everything that happened in it, is numbered from 151. The committee day of
-- papers has its own numbers, which its section lists: papers, versions and
-- amendments in f0 (7xx, 8xx and 9xx), their comment threads (50x) and
-- comments (55x), and its votes from f0…411.


-- -----------------------------------------------------------------------------
-- Two helpers that only live while this file runs
-- -----------------------------------------------------------------------------
-- They are made in "pg_temp", the schema of temporary objects, the way
-- demo-seed.sql explains at its own helpers.
--
-- walk_day(0) is the day of the reset, walk_day(4) four days later and
-- walk_day(-1) yesterday.
create function pg_temp.walk_day(day_offset integer)
returns date
language sql
stable
as $$
  select current_date + day_offset
$$;

-- walk_moment(4, '09:30') is half past nine, four days from now, on a clock in
-- London, where every Northbridge conference takes place.
create function pg_temp.walk_moment(day_offset integer, clock time)
returns timestamptz
language sql
stable
as $$
  select (pg_temp.walk_day(day_offset) + clock) at time zone 'Europe/London'
$$;

-- walk_role('f2…004', 'Chair') is the id of one of a conference's preset roles,
-- which the conferences_add_presets trigger made when the conference row was
-- inserted. Invitations name a role by id, so the inserts below ask this.
create function pg_temp.walk_role(conference_id text, role_name text)
returns uuid
language sql
stable
as $$
  select role.id
  from public.conference_roles as role
  where role.conference_id = walk_role.conference_id::uuid
    and role.name = walk_role.role_name
$$;


-- -----------------------------------------------------------------------------
-- Accounts
-- -----------------------------------------------------------------------------
-- Listed once in a temporary table and read by the three inserts that follow,
-- as in demo-seed.sql. The table is dropped at the end of the file.
create temporary table walk_people (
  id uuid primary key,
  email text not null,
  full_name text not null,
  institution_name text not null,
  country_code char(2) not null,
  experience_level public.experience_level not null
);

insert into walk_people (id, email, full_name, institution_name, country_code, experience_level)
values
  -- The organisers.
  ('f5000000-0000-4000-8000-000000000001', 'walk.organiser@example.test', 'Eleanor Whitfield', 'Northbridge MUN Society', 'GB', 'advanced'),
  ('f5000000-0000-4000-8000-000000000002', 'walk.organiser.upcoming@example.test', 'Marcus Adeyemi', 'Northbridge MUN Society', 'GB', 'advanced'),
  ('f5000000-0000-4000-8000-000000000003', 'walk.org.admin@example.test', 'Priya Nair', 'Northbridge MUN Society', 'GB', 'advanced'),
  -- The three roles "about to start" made for itself, one person each.
  ('f5000000-0000-4000-8000-000000000004', 'walk.usg.upcoming@example.test', 'Olivia Grant', 'Northbridge MUN Society', 'GB', 'advanced'),
  ('f5000000-0000-4000-8000-000000000005', 'walk.finance.upcoming@example.test', 'Rohan Mehta', 'Northbridge MUN Society', 'GB', 'intermediate'),
  ('f5000000-0000-4000-8000-000000000006', 'walk.desk.upcoming@example.test', 'Ellie Watson', 'Northbridge Sixth Form College', 'GB', 'beginner'),
  -- The chairs and the volunteer.
  ('f5000000-0000-4000-8000-000000000011', 'walk.chair.live@example.test', 'Fiona Campbell', 'University of Glasgow', 'GB', 'advanced'),
  ('f5000000-0000-4000-8000-000000000012', 'walk.chair.upcoming@example.test', 'Samuel Osei', 'University of Manchester', 'GB', 'advanced'),
  ('f5000000-0000-4000-8000-000000000013', 'walk.nadia.haddad@example.test', 'Nadia Haddad', 'University of Leeds', 'GB', 'advanced'),
  ('f5000000-0000-4000-8000-000000000021', 'walk.volunteer.live@example.test', 'Tom Hughes', 'Northbridge Sixth Form College', 'GB', 'beginner'),
  -- The school delegation forming in "applications open": its head and the
  -- two students who have joined so far.
  ('f5000000-0000-4000-8000-000000000031', 'walk.head.open@example.test', 'Rachel Morgan', 'St Aidan''s Academy', 'GB', 'advanced'),
  ('f5000000-0000-4000-8000-000000000032', 'walk.owen.price@example.test', 'Owen Price', 'St Aidan''s Academy', 'GB', 'beginner'),
  ('f5000000-0000-4000-8000-000000000033', 'walk.lily.evans@example.test', 'Lily Evans', 'St Aidan''s Academy', 'GB', 'none'),
  -- The applicants to "applications open": one per status, then two more
  -- waiting for a decision.
  ('f5000000-0000-4000-8000-000000000041', 'walk.applicant.open@example.test', 'Aarav Patel', 'University of Birmingham', 'GB', 'intermediate'),
  ('f5000000-0000-4000-8000-000000000042', 'walk.grace.oconnor@example.test', 'Grace O''Connor', 'Trinity College Dublin', 'IE', 'beginner'),
  ('f5000000-0000-4000-8000-000000000043', 'walk.jakub.wisniewski@example.test', 'Jakub Wiśniewski', 'University of Warsaw', 'PL', 'advanced'),
  ('f5000000-0000-4000-8000-000000000044', 'walk.chloe.martin@example.test', 'Chloé Martin', 'Université de Lille', 'FR', 'intermediate'),
  ('f5000000-0000-4000-8000-000000000045', 'walk.ben.carter@example.test', 'Ben Carter', 'University of York', 'GB', 'none'),
  ('f5000000-0000-4000-8000-000000000046', 'walk.sofia.rossi@example.test', 'Sofia Rossi', 'Università di Bologna', 'IT', 'beginner'),
  ('f5000000-0000-4000-8000-000000000047', 'walk.ethan.brooks@example.test', 'Ethan Brooks', 'Hollin Park School', 'GB', 'none'),
  ('f5000000-0000-4000-8000-000000000048', 'walk.mei.tan@example.test', 'Mei Tan', 'National University of Singapore', 'SG', 'advanced'),
  -- The two other school delegations of "applications open": Riverside's
  -- head and one student, who have sent theirs in, and Kingsway's head,
  -- whose delegation was turned down.
  ('f5000000-0000-4000-8000-000000000085', 'walk.head.submitted@example.test', 'Daniel Okafor', 'Riverside Grammar School', 'GB', 'advanced'),
  ('f5000000-0000-4000-8000-000000000086', 'walk.isla.fraser@example.test', 'Isla Fraser', 'Riverside Grammar School', 'GB', 'beginner'),
  ('f5000000-0000-4000-8000-000000000087', 'walk.helen.clarke@example.test', 'Helen Clarke', 'Kingsway Sixth Form', 'GB', 'advanced'),
  -- The seven delegates of "about to start".
  ('f5000000-0000-4000-8000-000000000051', 'walk.delegate.upcoming@example.test', 'Maya Thompson', 'University of Toronto', 'CA', 'intermediate'),
  ('f5000000-0000-4000-8000-000000000052', 'walk.lucas.oliveira@example.test', 'Lucas Oliveira', 'Universidade de São Paulo', 'BR', 'intermediate'),
  ('f5000000-0000-4000-8000-000000000053', 'walk.hana.sato@example.test', 'Hana Sato', 'Keio University', 'JP', 'advanced'),
  ('f5000000-0000-4000-8000-000000000054', 'walk.louis.bernard@example.test', 'Louis Bernard', 'Sciences Po', 'FR', 'advanced'),
  ('f5000000-0000-4000-8000-000000000055', 'walk.amani.wanjiru@example.test', 'Amani Wanjiru', 'University of Nairobi', 'KE', 'beginner'),
  ('f5000000-0000-4000-8000-000000000056', 'walk.felix.schmidt@example.test', 'Felix Schmidt', 'Universität Heidelberg', 'DE', 'intermediate'),
  ('f5000000-0000-4000-8000-000000000057', 'walk.sofia.hernandez@example.test', 'Sofía Hernández', 'Universidad Nacional Autónoma de México', 'MX', 'intermediate'),
  -- The school delegation of "about to start": its head, two students with a
  -- seat each and one still waiting for the third seat.
  ('f5000000-0000-4000-8000-000000000081', 'walk.head.upcoming@example.test', 'Andrew Blake', 'Harbour View College', 'GB', 'advanced'),
  ('f5000000-0000-4000-8000-000000000082', 'walk.zoe.adams@example.test', 'Zoe Adams', 'Harbour View College', 'GB', 'beginner'),
  ('f5000000-0000-4000-8000-000000000083', 'walk.kwame.mensah@example.test', 'Kwame Mensah', 'Harbour View College', 'GH', 'beginner'),
  ('f5000000-0000-4000-8000-000000000084', 'walk.ruby.hall@example.test', 'Ruby Hall', 'Harbour View College', 'GB', 'none'),
  -- The six delegates of the running Security Council.
  ('f5000000-0000-4000-8000-000000000061', 'walk.delegate.live@example.test', 'James Wilson', 'University of Bristol', 'GB', 'intermediate'),
  ('f5000000-0000-4000-8000-000000000062', 'walk.wei.zhang@example.test', 'Wei Zhang', 'University of Edinburgh', 'CN', 'advanced'),
  ('f5000000-0000-4000-8000-000000000063', 'walk.camille.dubois@example.test', 'Camille Dubois', 'University College London', 'FR', 'advanced'),
  ('f5000000-0000-4000-8000-000000000064', 'walk.ivan.petrov@example.test', 'Ivan Petrov', 'University of Warwick', 'BG', 'intermediate'),
  ('f5000000-0000-4000-8000-000000000065', 'walk.emily.johnson@example.test', 'Emily Johnson', 'Durham University', 'US', 'intermediate'),
  ('f5000000-0000-4000-8000-000000000066', 'walk.gabriel.santos@example.test', 'Gabriel Santos', 'University of Nottingham', 'BR', 'beginner'),
  -- The five delegates of the Third Committee, which has just opened.
  ('f5000000-0000-4000-8000-000000000071', 'walk.aisha.bello@example.test', 'Aisha Bello', 'University of Sheffield', 'NG', 'intermediate'),
  ('f5000000-0000-4000-8000-000000000072', 'walk.mateo.garcia@example.test', 'Mateo García', 'Universidad Complutense de Madrid', 'ES', 'beginner'),
  ('f5000000-0000-4000-8000-000000000073', 'walk.sara.lindqvist@example.test', 'Sara Lindqvist', 'Lund University', 'SE', 'intermediate'),
  ('f5000000-0000-4000-8000-000000000074', 'walk.omar.farouk@example.test', 'Omar Farouk', 'King''s College London', 'EG', 'advanced'),
  ('f5000000-0000-4000-8000-000000000075', 'walk.anna.kowalska@example.test', 'Anna Kowalska', 'Jagiellonian University', 'PL', 'beginner'),
  -- The two chairs, the crisis staff and the six delegates of the committees
  -- added to "running today" for its papers: ECOFIN, run to THIMUN
  -- procedure, and ExComm, a crisis committee.
  ('f5000000-0000-4000-8000-000000000014', 'walk.chair.thimun@example.test', 'Pieter de Vries', 'Leiden University', 'NL', 'advanced'),
  ('f5000000-0000-4000-8000-000000000015', 'walk.chair.crisis@example.test', 'Catherine Doyle', 'University College Cork', 'IE', 'advanced'),
  ('f5000000-0000-4000-8000-000000000022', 'walk.crisis.staff@example.test', 'Ahmed Karim', 'University of Exeter', 'GB', 'intermediate'),
  ('f5000000-0000-4000-8000-000000000101', 'walk.keisha.bynoe@example.test', 'Keisha Bynoe', 'University of the West Indies', 'BB', 'intermediate'),
  ('f5000000-0000-4000-8000-000000000102', 'walk.arjun.rao@example.test', 'Arjun Rao', 'University of Cambridge', 'IN', 'advanced'),
  ('f5000000-0000-4000-8000-000000000103', 'walk.chidi.okonkwo@example.test', 'Chidi Okonkwo', 'University of Lagos', 'NG', 'beginner'),
  ('f5000000-0000-4000-8000-000000000111', 'walk.thomas.reid@example.test', 'Thomas Reid', 'University of St Andrews', 'GB', 'advanced'),
  ('f5000000-0000-4000-8000-000000000112', 'walk.lena.hoffmann@example.test', 'Lena Hoffmann', 'Freie Universität Berlin', 'DE', 'intermediate'),
  ('f5000000-0000-4000-8000-000000000113', 'walk.jonah.levy@example.test', 'Jonah Levy', 'University of Oxford', 'GB', 'intermediate'),
  -- Somebody who has only just signed up.
  ('f5000000-0000-4000-8000-000000000091', 'walk.newcomer@example.test', 'Noor Rahman', 'Northbridge Sixth Form College', 'GB', 'none');

-- Everybody signed up five months ago, except the newcomer, who signed up
-- this morning.
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
  signed_up.at,
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', person.full_name),
  signed_up.at,
  signed_up.at,
  '', '', '', ''
from walk_people as person
cross join lateral (
  select case
    when person.email = 'walk.newcomer@example.test' then pg_temp.walk_moment(0, '07:00')
    else pg_temp.walk_moment(-150, '12:00')
  end as at
) as signed_up
on conflict (id) do nothing;

-- One email identity per account, which is what lets it sign in with a
-- password. The identity reuses the account's id, as in demo-seed.sql.
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
  pg_temp.walk_moment(-150, '12:00'),
  pg_temp.walk_moment(-150, '12:00'),
  pg_temp.walk_moment(-150, '12:00')
from walk_people as person
on conflict (id) do nothing;

-- handle_new_user made each profile with the name. This fills in the rest and
-- finishes onboarding for everybody but the newcomer, who is sent to /welcome
-- on first sign-in, the way a real new account is.
update public.profiles as profile
set institution_name = person.institution_name,
    country_code = person.country_code,
    experience_level = person.experience_level,
    onboarding_completed_at = pg_temp.walk_moment(-150, '12:05')
from walk_people as person
where profile.id = person.id
  and person.email <> 'walk.newcomer@example.test'
  and profile.onboarding_completed_at is null;

-- A few people have said more about themselves, so a profile has something in
-- every field to look at. The bio may be up to 500 characters.
update public.profiles as profile
set pronouns = extra.pronouns,
    bio = extra.bio
from (
  values
    ('f5000000-0000-4000-8000-000000000001', 'she/her', 'Secretary-General of Northbridge MUN Society. Six years of conferences, three of them as a chair.'),
    ('f5000000-0000-4000-8000-000000000011', 'she/her', 'Security Council chair. Ask me about the rules of procedure before the session, not during it.'),
    ('f5000000-0000-4000-8000-000000000051', 'she/her', 'Second-year politics student. Human rights committees are my favourite.'),
    ('f5000000-0000-4000-8000-000000000061', 'he/him', 'Law student in Bristol. Has spoken at nine conferences and been heckled at one.'),
    ('f5000000-0000-4000-8000-000000000041', 'he/him', null),
    ('f5000000-0000-4000-8000-000000000048', 'she/her', 'Chaired twice at Singapore MUN, now looking for a first conference in London.')
) as extra (id, pronouns, bio)
where profile.id = extra.id::uuid
  and profile.pronouns is null;

-- The private details only the person and the organisers of a conference they
-- apply to may read. handle_new_user made each row with the email address, so
-- the rest is filled in here. Ethan is thirteen, younger than "applications
-- open" allows, so his application shows the organisers an age warning.
update public.profile_details as details
set date_of_birth = extra.date_of_birth,
    phone = extra.phone,
    dietary_requirements = extra.dietary_requirements,
    emergency_contact_name = extra.emergency_contact_name,
    emergency_contact_phone = extra.emergency_contact_phone
from (
  values
    ('f5000000-0000-4000-8000-000000000041', (current_date - interval '20 years 3 months')::date, '+44 7700 900041', 'Vegetarian', 'Meera Patel', '+44 7700 900141'),
    ('f5000000-0000-4000-8000-000000000047', (current_date - interval '13 years 1 month')::date, '+44 7700 900047', null, 'Laura Brooks', '+44 7700 900147'),
    ('f5000000-0000-4000-8000-000000000048', (current_date - interval '22 years 7 months')::date, '+65 8000 0048', 'No nuts, please', 'Tan Wei Ming', '+65 8000 0148'),
    ('f5000000-0000-4000-8000-000000000051', (current_date - interval '19 years 8 months')::date, '+44 7700 900051', null, 'Karen Thompson', '+44 7700 900151'),
    ('f5000000-0000-4000-8000-000000000061', (current_date - interval '21 years 2 months')::date, '+44 7700 900061', 'Halal', 'Peter Wilson', '+44 7700 900161')
) as extra (user_id, date_of_birth, phone, dietary_requirements, emergency_contact_name, emergency_contact_phone)
where details.user_id = extra.user_id::uuid
  and details.date_of_birth is null;


-- -----------------------------------------------------------------------------
-- The organisation
-- -----------------------------------------------------------------------------
-- Eleanor owns it and Priya is an admin, which lets her manage every one of
-- its conferences without being on any conference's staff. Marcus is not a
-- member: he is an organiser of one conference only, so he shows what an
-- invited organiser can and cannot see.
-- The logo is an invented crest; its file is in supabase/media/public-media.
insert into public.organizations (id, name, slug, description, country_code, website_url, logo_path, created_at)
values (
  'f1000000-0000-4000-8000-000000000001',
  'Northbridge MUN Society',
  'northbridge-mun-society',
  'A made-up society that runs a conference in every phase, so every part of MUNMeet can be tried by hand.',
  'GB',
  'https://northbridge-mun.example',
  'organizations/f1000000-0000-4000-8000-000000000001/logo-b1000000-0000-4000-8000-000000000001.png',
  pg_temp.walk_moment(-150, '12:10')
)
on conflict (id) do nothing;

insert into public.organization_members (organization_id, user_id, role, created_at)
values
  ('f1000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', 'owner', pg_temp.walk_moment(-150, '12:10')),
  ('f1000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000003', 'admin', pg_temp.walk_moment(-140, '09:00'))
on conflict do nothing;


-- -----------------------------------------------------------------------------
-- The five conferences
-- -----------------------------------------------------------------------------
-- Every one is in London and charges in pounds. Payment is by bank transfer
-- where there is a fee at all (see "Card payments" at the top).
insert into public.conferences (
  id, organization_id, slug, name, tagline, description,
  city, venue_name, venue_address, country_code, timezone,
  start_date, end_date, website_url, contact_email, created_by, created_at,
  level, language, expected_delegates, min_age, max_age, currency, status,
  applications_open_at, applications_close_at,
  accepts_individual_applications, accepts_delegations, committee_preference_count,
  ask_motivation, position_paper_required, position_paper_deadline,
  collects_payments_manually, payment_instructions, show_schedule_publicly
)
values
  -- 1. Draft: four months out, no application window yet.
  (
    'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
    'northbridge-draft', 'Northbridge MUN (draft)',
    'Still being set up',
    'A conference the organisers have started setting up but not published. Only its organisers can see it.',
    'London', 'Northbridge Hall', '1 Bridge Street, London', 'GB', 'Europe/London',
    pg_temp.walk_day(120), pg_temp.walk_day(122),
    null, 'draft@northbridge-mun.example', 'f5000000-0000-4000-8000-000000000001', pg_temp.walk_moment(-5, '10:00'),
    'mixed', 'English', 60, 14, 25, 'GBP', 'draft',
    null, null,
    true, true, 2,
    true, false, null,
    false, null, false
  ),
  -- 2. Opening soon: published, and applications open in three days.
  (
    'f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001',
    'northbridge-opening-soon', 'Northbridge MUN (opening soon)',
    'Applications open in a few days',
    'A published conference whose applications have not opened yet. It turns into an open one by itself when the day comes.',
    'London', 'Northbridge Hall', '1 Bridge Street, London', 'GB', 'Europe/London',
    pg_temp.walk_day(320), pg_temp.walk_day(322),
    'https://northbridge-mun.example/opening-soon', 'hello@northbridge-mun.example', 'f5000000-0000-4000-8000-000000000001', pg_temp.walk_moment(-30, '10:00'),
    'mixed', 'English', 60, 14, 25, 'GBP', 'published',
    pg_temp.walk_moment(3, '09:00'), pg_temp.walk_moment(60, '23:59'),
    true, true, 2,
    true, false, null,
    false, null, false
  ),
  -- 3. Applications open: opened three weeks ago, close in forty days.
  (
    'f2000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000001',
    'northbridge-applications-open', 'Northbridge MUN (applications open)',
    'Applications are open now',
    'A published conference taking applications from individuals and from school delegations.',
    'London', 'Northbridge Hall', '1 Bridge Street, London', 'GB', 'Europe/London',
    pg_temp.walk_day(310), pg_temp.walk_day(312),
    'https://northbridge-mun.example/applications-open', 'hello@northbridge-mun.example', 'f5000000-0000-4000-8000-000000000001', pg_temp.walk_moment(-40, '10:00'),
    'mixed', 'English', 60, 14, 25, 'GBP', 'published',
    pg_temp.walk_moment(-20, '09:00'), pg_temp.walk_moment(40, '23:59'),
    true, true, 1,
    true, false, null,
    false, null, false
  ),
  -- 4. About to start: applications closed ten days ago, the first day is in
  -- four days, and position papers are due in two. It took school delegations
  -- as well as individual delegates.
  (
    'f2000000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000001',
    'northbridge-about-to-start', 'Northbridge MUN (about to start)',
    'Four days to go',
    'A conference whose seats are given out, invoices sent and position papers coming in. The first day is four days away.',
    'London', 'Northbridge Hall', '1 Bridge Street, London', 'GB', 'Europe/London',
    pg_temp.walk_day(4), pg_temp.walk_day(6),
    'https://northbridge-mun.example/about-to-start', 'hello@northbridge-mun.example', 'f5000000-0000-4000-8000-000000000001', pg_temp.walk_moment(-120, '10:00'),
    'mixed', 'English', 12, 15, 25, 'GBP', 'published',
    pg_temp.walk_moment(-90, '09:00'), pg_temp.walk_moment(-10, '23:59'),
    true, true, 2,
    true, true, pg_temp.walk_moment(2, '23:59'),
    true,
    'Pay by bank transfer to Northbridge MUN Society, sort code 00-00-00, account 00000000. Put your invoice number in the reference.',
    true
  ),
  -- 5. Running today: it started yesterday and ends tomorrow, so it is on
  -- today wherever in the world the database happens to be.
  (
    'f2000000-0000-4000-8000-000000000005', 'f1000000-0000-4000-8000-000000000001',
    'northbridge-running-today', 'Northbridge MUN (running today)',
    'In session right now',
    'A conference in its middle day, with the Security Council sitting.',
    'London', 'Northbridge Hall', '1 Bridge Street, London', 'GB', 'Europe/London',
    pg_temp.walk_day(-1), pg_temp.walk_day(1),
    'https://northbridge-mun.example/running-today', 'hello@northbridge-mun.example', 'f5000000-0000-4000-8000-000000000001', pg_temp.walk_moment(-150, '10:00'),
    'university', 'English', 12, 16, 25, 'GBP', 'published',
    pg_temp.walk_moment(-120, '09:00'), pg_temp.walk_moment(-30, '23:59'),
    true, false, 1,
    true, false, null,
    false, null, true
  )
on conflict (id) do nothing;

-- Every Northbridge conference shows the same hall photograph and the
-- society's crest (T149). Each has its own copy of the files, because a
-- picture is stored under the conference it belongs to. The update is kept
-- apart from the insert above so its fifty lines stay about the phases.
-- `from (values ...)` is a small table written inline: one row per conference.
-- `is null` leaves alone a picture somebody has already changed by hand.
update public.conferences as conference
set banner_path = picture.banner_path, logo_path = picture.logo_path
from (
  values
  ('f2000000-0000-4000-8000-000000000001',
    'conferences/f2000000-0000-4000-8000-000000000001/banner-b2000000-0000-4000-8000-000000000001.jpg',
    'conferences/f2000000-0000-4000-8000-000000000001/logo-b1000000-0000-4000-8000-000000000001.png'),
  ('f2000000-0000-4000-8000-000000000002',
    'conferences/f2000000-0000-4000-8000-000000000002/banner-b2000000-0000-4000-8000-000000000002.jpg',
    'conferences/f2000000-0000-4000-8000-000000000002/logo-b1000000-0000-4000-8000-000000000002.png'),
  ('f2000000-0000-4000-8000-000000000003',
    'conferences/f2000000-0000-4000-8000-000000000003/banner-b2000000-0000-4000-8000-000000000003.jpg',
    'conferences/f2000000-0000-4000-8000-000000000003/logo-b1000000-0000-4000-8000-000000000003.png'),
  ('f2000000-0000-4000-8000-000000000004',
    'conferences/f2000000-0000-4000-8000-000000000004/banner-b2000000-0000-4000-8000-000000000004.jpg',
    'conferences/f2000000-0000-4000-8000-000000000004/logo-b1000000-0000-4000-8000-000000000004.png'),
  ('f2000000-0000-4000-8000-000000000005',
    'conferences/f2000000-0000-4000-8000-000000000005/banner-b2000000-0000-4000-8000-000000000005.jpg',
    'conferences/f2000000-0000-4000-8000-000000000005/logo-b1000000-0000-4000-8000-000000000005.png')
) as picture (conference_id, banner_path, logo_path)
where conference.id = picture.conference_id::uuid
  and conference.banner_path is null
  and conference.logo_path is null;

-- Eleanor is on the organising team of every conference, and Marcus of the
-- one about to start, with Olivia, Rohan and Ellie in the roles it made.
-- Tom volunteers at the one running today. The chairs get their staff rows
-- from committee_chairs further down.
insert into public.conference_staff (conference_id, user_id, title, created_at)
values
  ('f2000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', 'Secretary-General', pg_temp.walk_moment(-5, '10:00')),
  ('f2000000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000001', 'Secretary-General', pg_temp.walk_moment(-30, '10:00')),
  ('f2000000-0000-4000-8000-000000000003', 'f5000000-0000-4000-8000-000000000001', 'Secretary-General', pg_temp.walk_moment(-40, '10:00')),
  ('f2000000-0000-4000-8000-000000000004', 'f5000000-0000-4000-8000-000000000001', 'Secretary-General', pg_temp.walk_moment(-120, '10:00')),
  ('f2000000-0000-4000-8000-000000000004', 'f5000000-0000-4000-8000-000000000002', 'Director-General', pg_temp.walk_moment(-118, '10:00')),
  ('f2000000-0000-4000-8000-000000000004', 'f5000000-0000-4000-8000-000000000004', 'Under-Secretary-General for Delegate Affairs', pg_temp.walk_moment(-110, '10:00')),
  ('f2000000-0000-4000-8000-000000000004', 'f5000000-0000-4000-8000-000000000005', 'Director of Finance', pg_temp.walk_moment(-110, '11:00')),
  ('f2000000-0000-4000-8000-000000000004', 'f5000000-0000-4000-8000-000000000006', 'Registration', pg_temp.walk_moment(-60, '10:00')),
  ('f2000000-0000-4000-8000-000000000005', 'f5000000-0000-4000-8000-000000000001', 'Secretary-General', pg_temp.walk_moment(-150, '10:00')),
  ('f2000000-0000-4000-8000-000000000005', 'f5000000-0000-4000-8000-000000000021', 'Runner', pg_temp.walk_moment(-20, '10:00'))
on conflict do nothing;

-- "About to start" made three roles of its own, the ones section 4 of
-- docs/roles-and-permissions.md expects a conference to make, and put them
-- between Organiser and Chair. USG delegate affairs is public, so Olivia is
-- on the conference page's team list; the other two are not.
insert into public.conference_roles (conference_id, name, position, scope, permissions, is_public)
values
  ('f2000000-0000-4000-8000-000000000004', 'USG delegate affairs', 1, 'conference',
    array['read_applications', 'decide_applications', 'read_participants', 'read_contact_details',
      'read_welfare_details', 'read_invoices', 'send_announcements']::public.permission[], true),
  ('f2000000-0000-4000-8000-000000000004', 'Finance', 2, 'conference',
    array['edit_conference', 'read_invoices', 'manage_invoices', 'read_participants',
      'read_contact_details']::public.permission[], false),
  ('f2000000-0000-4000-8000-000000000004', 'Registration desk', 3, 'conference',
    array['read_participants', 'read_welfare_details']::public.permission[], false)
on conflict do nothing;

-- The presets below them move down, so the order reads Organiser, the three
-- new roles, Chair, Volunteer.
update public.conference_roles
set position = case name when 'Chair' then 4 when 'Volunteer' then 5 end
where conference_id = 'f2000000-0000-4000-8000-000000000004'
  and name in ('Chair', 'Volunteer');

-- Their roles. A conference gets its three preset roles the moment it is
-- inserted (trigger conferences_add_presets), so they are looked up by name.
insert into public.conference_role_members (conference_id, user_id, role_id)
select person.conference_id::uuid, person.user_id::uuid, role.id
from (
  values
    ('f2000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', 'Organiser'),
    ('f2000000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000001', 'Organiser'),
    ('f2000000-0000-4000-8000-000000000003', 'f5000000-0000-4000-8000-000000000001', 'Organiser'),
    ('f2000000-0000-4000-8000-000000000004', 'f5000000-0000-4000-8000-000000000001', 'Organiser'),
    ('f2000000-0000-4000-8000-000000000004', 'f5000000-0000-4000-8000-000000000002', 'Organiser'),
    ('f2000000-0000-4000-8000-000000000004', 'f5000000-0000-4000-8000-000000000004', 'USG delegate affairs'),
    ('f2000000-0000-4000-8000-000000000004', 'f5000000-0000-4000-8000-000000000005', 'Finance'),
    ('f2000000-0000-4000-8000-000000000004', 'f5000000-0000-4000-8000-000000000006', 'Registration desk'),
    ('f2000000-0000-4000-8000-000000000005', 'f5000000-0000-4000-8000-000000000001', 'Organiser'),
    ('f2000000-0000-4000-8000-000000000005', 'f5000000-0000-4000-8000-000000000021', 'Volunteer')
) as person (conference_id, user_id, role_name)
join public.conference_roles as role
  on role.conference_id = person.conference_id::uuid
 and role.name = person.role_name
on conflict do nothing;


-- -----------------------------------------------------------------------------
-- Committees, their chairs and their seats
-- -----------------------------------------------------------------------------
-- Adding a committee also adds its committee_state row, in the idle mode
-- (trigger committees_create_state). The running one is moved into formal
-- debate at the end of the committee room section.
insert into public.committees (
  id, conference_id, slug, name, abbreviation, description, topics, room, position, level
)
values
  ('f3000000-0000-4000-8000-000000000011', 'f2000000-0000-4000-8000-000000000001', 'unep', 'United Nations Environment Programme', 'UNEP',
    'The first committee of a conference still being planned.', array['Plastic in the oceans'], null, 0, 'beginner'),
  ('f3000000-0000-4000-8000-000000000021', 'f2000000-0000-4000-8000-000000000002', 'who', 'World Health Assembly', 'WHA',
    'Health ministers of the member states.', array['Preparing for the next pandemic'], 'Room 1', 0, 'beginner'),
  ('f3000000-0000-4000-8000-000000000031', 'f2000000-0000-4000-8000-000000000003', 'ecosoc', 'Economic and Social Council', 'ECOSOC',
    'Fifty-four members that coordinate the economic and social work of the UN.', array['Financing clean energy'], 'Room 1', 0, 'intermediate'),
  ('f3000000-0000-4000-8000-000000000041', 'f2000000-0000-4000-8000-000000000004', 'hrc', 'Human Rights Council', 'HRC',
    'Forty-seven states that watch over human rights around the world.', array['The right to education in emergencies', 'Freedom of expression online'], 'Room 1', 0, 'beginner'),
  ('f3000000-0000-4000-8000-000000000042', 'f2000000-0000-4000-8000-000000000004', 'disec', 'Disarmament and International Security Committee', 'DISEC',
    'The First Committee of the General Assembly.', array['Small arms and light weapons', 'Cyber operations against civilian infrastructure'], 'Room 2', 1, 'intermediate'),
  ('f3000000-0000-4000-8000-000000000051', 'f2000000-0000-4000-8000-000000000005', 'unsc', 'Security Council', 'UNSC',
    'Fifteen members, five of them permanent. Six are sitting in this walkthrough.', array['Humanitarian access in armed conflict'], 'Council Chamber', 0, 'advanced'),
  ('f3000000-0000-4000-8000-000000000052', 'f2000000-0000-4000-8000-000000000005', 'sochum', 'Social, Humanitarian and Cultural Committee', 'SOCHUM',
    'The Third Committee of the General Assembly.', array['The rights of refugee children', 'Protecting cultural heritage in conflict'], 'Room 2', 1, 'beginner')
on conflict (id) do nothing;

-- Each row also puts its person on the conference's staff list (trigger
-- committee_chairs_ensure_staff), and the insert after it gives them the Chair
-- role, which is what lets them run the room.
insert into public.committee_chairs (committee_id, user_id, title, created_at)
values
  ('f3000000-0000-4000-8000-000000000041', 'f5000000-0000-4000-8000-000000000012', 'Chair', pg_temp.walk_moment(-60, '10:00')),
  ('f3000000-0000-4000-8000-000000000042', 'f5000000-0000-4000-8000-000000000013', 'Chair', pg_temp.walk_moment(-60, '10:00')),
  ('f3000000-0000-4000-8000-000000000051', 'f5000000-0000-4000-8000-000000000011', 'Chair', pg_temp.walk_moment(-90, '10:00')),
  ('f3000000-0000-4000-8000-000000000052', 'f5000000-0000-4000-8000-000000000013', 'Chair', pg_temp.walk_moment(-90, '10:00'))
on conflict do nothing;

insert into public.conference_role_members (conference_id, user_id, role_id)
select committee.conference_id, chair.user_id, role.id
from public.committee_chairs as chair
join public.committees as committee on committee.id = chair.committee_id
join public.conference_roles as role
  on role.conference_id = committee.conference_id
 and role.name = 'Chair'
where committee.conference_id in (
  'f2000000-0000-4000-8000-000000000004',
  'f2000000-0000-4000-8000-000000000005'
)
on conflict do nothing;

-- The seats with nobody in them. The draft's committee has none yet; the
-- filled seats follow the applications they came from, further down.
insert into public.seats (id, committee_id, name, country_code, position)
values
  ('f9000000-0000-4000-8000-000000000211', 'f3000000-0000-4000-8000-000000000021', 'Argentina', 'AR', 1),
  ('f9000000-0000-4000-8000-000000000212', 'f3000000-0000-4000-8000-000000000021', 'Egypt', 'EG', 2),
  ('f9000000-0000-4000-8000-000000000213', 'f3000000-0000-4000-8000-000000000021', 'India', 'IN', 3),
  ('f9000000-0000-4000-8000-000000000214', 'f3000000-0000-4000-8000-000000000021', 'Sweden', 'SE', 4),
  ('f9000000-0000-4000-8000-000000000302', 'f3000000-0000-4000-8000-000000000031', 'Chile', 'CL', 2),
  ('f9000000-0000-4000-8000-000000000303', 'f3000000-0000-4000-8000-000000000031', 'Ghana', 'GH', 3),
  ('f9000000-0000-4000-8000-000000000304', 'f3000000-0000-4000-8000-000000000031', 'Norway', 'NO', 4),
  ('f9000000-0000-4000-8000-000000000305', 'f3000000-0000-4000-8000-000000000031', 'Viet Nam', 'VN', 5),
  ('f9000000-0000-4000-8000-000000000306', 'f3000000-0000-4000-8000-000000000031', 'Mexico', 'MX', 6),
  ('f9000000-0000-4000-8000-000000000424', 'f3000000-0000-4000-8000-000000000042', 'India', 'IN', 4)
on conflict (id) do nothing;

-- An observer seat in ECOSOC that the organisers have hidden while they decide
-- whether to offer it, so applicants and the allocation screen do not offer
-- it. An observer is not a country, so it has no country code.
insert into public.seats (id, committee_id, name, kind, country_code, position, is_available)
values
  ('f9000000-0000-4000-8000-000000000307', 'f3000000-0000-4000-8000-000000000031', 'European Union', 'observer', null, 7, false)
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- Applications open: applications in every status, and school delegations
-- -----------------------------------------------------------------------------
-- Aarav's is waiting for a decision, like two more further down. Grace has not
-- sent hers yet, so it has no submitted_at. Eleanor decided the rest.
insert into public.applications (
  id, conference_id, user_id, status, committee_preferences, seat_preferences, motivation,
  answers, submitted_at, decided_at, decided_by, decision_note, created_at
)
values
  ('f6000000-0000-4000-8000-000000000301', 'f2000000-0000-4000-8000-000000000003', 'f5000000-0000-4000-8000-000000000041', 'submitted',
    array['f3000000-0000-4000-8000-000000000031']::uuid[], 'India or Brazil',
    'I have been to two conferences and would like to try an economic committee.',
    '{}'::jsonb, pg_temp.walk_moment(-3, '20:15'), null, null, null, pg_temp.walk_moment(-3, '19:50')),
  ('f6000000-0000-4000-8000-000000000302', 'f2000000-0000-4000-8000-000000000003', 'f5000000-0000-4000-8000-000000000042', 'draft',
    array['f3000000-0000-4000-8000-000000000031']::uuid[], null,
    'This would be my first conference.',
    '{}'::jsonb, null, null, null, null, pg_temp.walk_moment(-1, '21:30')),
  ('f6000000-0000-4000-8000-000000000303', 'f2000000-0000-4000-8000-000000000003', 'f5000000-0000-4000-8000-000000000043', 'accepted',
    array['f3000000-0000-4000-8000-000000000031']::uuid[], 'Poland',
    'I chaired ECOSOC at my university conference last year.',
    '{}'::jsonb, pg_temp.walk_moment(-18, '11:00'), pg_temp.walk_moment(-10, '10:00'), 'f5000000-0000-4000-8000-000000000001', null, pg_temp.walk_moment(-18, '10:30')),
  ('f6000000-0000-4000-8000-000000000304', 'f2000000-0000-4000-8000-000000000003', 'f5000000-0000-4000-8000-000000000044', 'waitlisted',
    array['f3000000-0000-4000-8000-000000000031']::uuid[], null,
    'I would like to practise debating in English.',
    '{}'::jsonb, pg_temp.walk_moment(-15, '16:40'), pg_temp.walk_moment(-10, '10:05'), 'f5000000-0000-4000-8000-000000000001',
    'Every seat we have planned is promised for now. We will write if one opens up.', pg_temp.walk_moment(-15, '16:00')),
  ('f6000000-0000-4000-8000-000000000305', 'f2000000-0000-4000-8000-000000000003', 'f5000000-0000-4000-8000-000000000045', 'rejected',
    array['f3000000-0000-4000-8000-000000000031']::uuid[], null,
    'I am interested in economics.',
    '{}'::jsonb, pg_temp.walk_moment(-14, '09:10'), pg_temp.walk_moment(-10, '10:10'), 'f5000000-0000-4000-8000-000000000001',
    'Thank you for applying. ECOSOC asks for some experience; please try the World Health Assembly at our next conference.', pg_temp.walk_moment(-14, '09:00')),
  ('f6000000-0000-4000-8000-000000000306', 'f2000000-0000-4000-8000-000000000003', 'f5000000-0000-4000-8000-000000000046', 'withdrawn',
    array['f3000000-0000-4000-8000-000000000031']::uuid[], null,
    'Looking forward to my first conference in London.',
    '{}'::jsonb, pg_temp.walk_moment(-16, '13:00'), null, null, null, pg_temp.walk_moment(-16, '12:30'))
on conflict (id) do nothing;

-- The delegation is still a draft: Rachel has made it and two students have
-- joined with its join code, but she has not sent it to the organisers.
insert into public.delegations (
  id, conference_id, name, institution_name, country_code, status, requested_seats, note,
  join_code, submitted_at, decided_at, decided_by, created_at
)
values (
  'f6000000-0000-4000-8000-000000000101',
  'f2000000-0000-4000-8000-000000000003',
  'St Aidan''s Academy',
  'St Aidan''s Academy',
  'GB',
  'draft',
  6,
  'Six students from our Year 12 debating club, if all of them join in time.',
  'NRTHBG42',
  null, null, null,
  pg_temp.walk_moment(-6, '16:00')
)
on conflict (id) do nothing;

insert into public.delegation_members (delegation_id, user_id, role, joined_at)
values
  ('f6000000-0000-4000-8000-000000000101', 'f5000000-0000-4000-8000-000000000031', 'head', pg_temp.walk_moment(-6, '16:00')),
  ('f6000000-0000-4000-8000-000000000101', 'f5000000-0000-4000-8000-000000000032', 'member', pg_temp.walk_moment(-5, '18:30')),
  ('f6000000-0000-4000-8000-000000000101', 'f5000000-0000-4000-8000-000000000033', 'member', pg_temp.walk_moment(-2, '17:45'))
on conflict do nothing;

-- Jakub, who was accepted, already has his seat.
insert into public.seats (id, committee_id, name, country_code, position, user_id, application_id, allocated_at)
values
  ('f9000000-0000-4000-8000-000000000301', 'f3000000-0000-4000-8000-000000000031', 'Poland', 'PL', 1,
    'f5000000-0000-4000-8000-000000000043', 'f6000000-0000-4000-8000-000000000303', pg_temp.walk_moment(-9, '10:00'))
on conflict (id) do nothing;

-- Two more school delegations. Riverside has sent theirs in and waits for a
-- decision, which is what an organiser tries accepting or rejecting. Kingsway
-- asked for more seats than one school may have and Eleanor turned it down.
insert into public.delegations (
  id, conference_id, name, institution_name, country_code, status, requested_seats, note,
  join_code, submitted_at, decided_at, decided_by, decision_note, created_at
)
values
  ('f6000000-0000-4000-8000-000000000102', 'f2000000-0000-4000-8000-000000000003',
    'Riverside Grammar School', 'Riverside Grammar School', 'GB', 'submitted', 4,
    'Four Year 13 students; two of them have been to a conference before.',
    'RVRSDE31', pg_temp.walk_moment(-4, '17:00'), null, null, null,
    pg_temp.walk_moment(-5, '15:00')),
  ('f6000000-0000-4000-8000-000000000103', 'f2000000-0000-4000-8000-000000000003',
    'Kingsway Sixth Form', 'Kingsway Sixth Form', 'GB', 'rejected', 10,
    'Our whole Model UN club.',
    'KNGSWY19', pg_temp.walk_moment(-12, '15:00'), pg_temp.walk_moment(-7, '10:00'), 'f5000000-0000-4000-8000-000000000001',
    'We can offer at most six seats to one school this year. Please apply again with a smaller group.',
    pg_temp.walk_moment(-13, '09:00'))
on conflict (id) do nothing;

-- Eleanor's private note on Riverside. The organisers' notes live in a table of
-- their own since 20261022132000_internal_notes_grants.sql, so that the head and
-- the members, who may read the delegation, cannot read it.
insert into public.delegation_internal_notes (delegation_id, note)
values
  ('f6000000-0000-4000-8000-000000000102', 'Check that a teacher is coming with them.')
on conflict (delegation_id) do nothing;

insert into public.delegation_members (delegation_id, user_id, role, joined_at)
values
  ('f6000000-0000-4000-8000-000000000102', 'f5000000-0000-4000-8000-000000000085', 'head', pg_temp.walk_moment(-5, '15:00')),
  ('f6000000-0000-4000-8000-000000000102', 'f5000000-0000-4000-8000-000000000086', 'member', pg_temp.walk_moment(-4, '16:30')),
  ('f6000000-0000-4000-8000-000000000103', 'f5000000-0000-4000-8000-000000000087', 'head', pg_temp.walk_moment(-13, '09:00'))
on conflict do nothing;

-- The conference asks five questions of its own, one of each kind the form
-- builder offers. None is required, so an application sent before they were
-- added is still complete.
insert into public.application_questions (id, conference_id, label, help_text, type, options, is_required, position)
values
  ('f0000000-0000-4000-8000-000000000301', 'f2000000-0000-4000-8000-000000000003', 'Name for your placard',
    'Only if it is not the name on your account.', 'short_text', '{}', false, 0),
  ('f0000000-0000-4000-8000-000000000302', 'f2000000-0000-4000-8000-000000000003', 'Tell us about a debate you enjoyed',
    'A few sentences are plenty.', 'long_text', '{}', false, 1),
  ('f0000000-0000-4000-8000-000000000303', 'f2000000-0000-4000-8000-000000000003', 'T-shirt size',
    null, 'single_choice', array['S', 'M', 'L', 'XL'], false, 2),
  ('f0000000-0000-4000-8000-000000000304', 'f2000000-0000-4000-8000-000000000003', 'Which social events will you come to?',
    null, 'multiple_choice', array['Opening dinner', 'Delegates'' social', 'Museum trip'], false, 3),
  ('f0000000-0000-4000-8000-000000000305', 'f2000000-0000-4000-8000-000000000003', 'I need step-free access to the venue',
    'We will send you the accessible entrance and route.', 'checkbox', '{}', false, 4)
on conflict (id) do nothing;

-- The answers, keyed by question id: text for most kinds, a list for the
-- multiple choice, and "yes" or "" for the tick box. Grace's draft answers
-- only one so far. `answers = '{}'` leaves alone anything changed by hand.
update public.applications as application
set answers = answer.answers::jsonb
from (
  values
    ('f6000000-0000-4000-8000-000000000301', '{
      "f0000000-0000-4000-8000-000000000302": "At my school conference we argued about carbon taxes for an hour, and I changed my mind twice.",
      "f0000000-0000-4000-8000-000000000303": "M",
      "f0000000-0000-4000-8000-000000000304": ["Opening dinner", "Delegates'' social"],
      "f0000000-0000-4000-8000-000000000305": ""
    }'),
    ('f6000000-0000-4000-8000-000000000302', '{
      "f0000000-0000-4000-8000-000000000303": "S"
    }'),
    ('f6000000-0000-4000-8000-000000000303', '{
      "f0000000-0000-4000-8000-000000000301": "Kuba",
      "f0000000-0000-4000-8000-000000000302": "Chairing ECOSOC taught me how much one good moderated caucus can do.",
      "f0000000-0000-4000-8000-000000000303": "L",
      "f0000000-0000-4000-8000-000000000304": ["Opening dinner", "Delegates'' social", "Museum trip"],
      "f0000000-0000-4000-8000-000000000305": ""
    }'),
    ('f6000000-0000-4000-8000-000000000304', '{
      "f0000000-0000-4000-8000-000000000303": "S",
      "f0000000-0000-4000-8000-000000000304": ["Museum trip"],
      "f0000000-0000-4000-8000-000000000305": ""
    }'),
    ('f6000000-0000-4000-8000-000000000305', '{
      "f0000000-0000-4000-8000-000000000303": "XL",
      "f0000000-0000-4000-8000-000000000304": [],
      "f0000000-0000-4000-8000-000000000305": "yes"
    }'),
    ('f6000000-0000-4000-8000-000000000306', '{
      "f0000000-0000-4000-8000-000000000303": "M"
    }')
) as answer (application_id, answers)
where application.id = answer.application_id::uuid
  and application.answers = '{}'::jsonb;

-- Two more applications waiting for a decision. Ethan is thirteen (see the
-- profile details above), so the organisers see an age warning on his. Mei
-- answered everything, and Eleanor has left herself a private note on hers.
insert into public.applications (
  id, conference_id, user_id, status, committee_preferences, seat_preferences, motivation,
  answers, submitted_at, created_at
)
values
  ('f6000000-0000-4000-8000-000000000307', 'f2000000-0000-4000-8000-000000000003', 'f5000000-0000-4000-8000-000000000047', 'submitted',
    array['f3000000-0000-4000-8000-000000000031']::uuid[], null,
    'My teacher says I am ready for a real conference.',
    '{
      "f0000000-0000-4000-8000-000000000302": "We debated school uniforms in class and I liked finding arguments for both sides.",
      "f0000000-0000-4000-8000-000000000303": "S",
      "f0000000-0000-4000-8000-000000000304": ["Delegates'' social"],
      "f0000000-0000-4000-8000-000000000305": ""
    }'::jsonb,
    pg_temp.walk_moment(-2, '17:30'), pg_temp.walk_moment(-2, '17:00')),
  ('f6000000-0000-4000-8000-000000000308', 'f2000000-0000-4000-8000-000000000003', 'f5000000-0000-4000-8000-000000000048', 'submitted',
    array['f3000000-0000-4000-8000-000000000031']::uuid[], 'Singapore or Japan',
    'I have chaired twice and would like to be back on the floor as a delegate.',
    '{
      "f0000000-0000-4000-8000-000000000301": "Mei",
      "f0000000-0000-4000-8000-000000000302": "A crisis committee on water rights that ran until midnight. Nobody gave up.",
      "f0000000-0000-4000-8000-000000000303": "M",
      "f0000000-0000-4000-8000-000000000304": ["Opening dinner", "Museum trip"],
      "f0000000-0000-4000-8000-000000000305": "yes"
    }'::jsonb,
    pg_temp.walk_moment(-1, '12:10'), pg_temp.walk_moment(-1, '11:40'))
on conflict (id) do nothing;

-- Eleanor's private note on Mei's application, in the organisers' own table
-- (20261022132000_internal_notes_grants.sql) rather than on the row Mei reads.
insert into public.application_internal_notes (application_id, note)
values
  ('f6000000-0000-4000-8000-000000000308', 'Chaired twice in Singapore: ask her about chairing for us next year.')
on conflict (application_id) do nothing;


-- -----------------------------------------------------------------------------
-- About to start and running today: the accepted applications and their seats
-- -----------------------------------------------------------------------------
-- Every delegate of these two conferences applied alone and was accepted by
-- Eleanor. Each seat points at the application it came from.
insert into public.applications (
  id, conference_id, user_id, status, committee_preferences, seat_preferences, motivation,
  answers, submitted_at, decided_at, decided_by, decision_note, created_at
)
select
  application.id,
  application.conference_id,
  application.user_id,
  'accepted',
  array[application.committee_id]::uuid[],
  null,
  'I would like a seat in this committee.',
  '{}'::jsonb,
  application.submitted_at,
  application.submitted_at + interval '20 days',
  'f5000000-0000-4000-8000-000000000001',
  null,
  application.submitted_at - interval '30 minutes'
from (
  values
    -- About to start
    ('f6000000-0000-4000-8000-000000000401'::uuid, 'f2000000-0000-4000-8000-000000000004'::uuid, 'f5000000-0000-4000-8000-000000000051'::uuid, 'f3000000-0000-4000-8000-000000000041'::uuid, pg_temp.walk_moment(-60, '19:00')),
    ('f6000000-0000-4000-8000-000000000402'::uuid, 'f2000000-0000-4000-8000-000000000004'::uuid, 'f5000000-0000-4000-8000-000000000052'::uuid, 'f3000000-0000-4000-8000-000000000041'::uuid, pg_temp.walk_moment(-58, '12:00')),
    ('f6000000-0000-4000-8000-000000000403'::uuid, 'f2000000-0000-4000-8000-000000000004'::uuid, 'f5000000-0000-4000-8000-000000000053'::uuid, 'f3000000-0000-4000-8000-000000000041'::uuid, pg_temp.walk_moment(-55, '08:30')),
    ('f6000000-0000-4000-8000-000000000404'::uuid, 'f2000000-0000-4000-8000-000000000004'::uuid, 'f5000000-0000-4000-8000-000000000054'::uuid, 'f3000000-0000-4000-8000-000000000042'::uuid, pg_temp.walk_moment(-52, '17:15')),
    ('f6000000-0000-4000-8000-000000000405'::uuid, 'f2000000-0000-4000-8000-000000000004'::uuid, 'f5000000-0000-4000-8000-000000000055'::uuid, 'f3000000-0000-4000-8000-000000000042'::uuid, pg_temp.walk_moment(-50, '21:40')),
    ('f6000000-0000-4000-8000-000000000406'::uuid, 'f2000000-0000-4000-8000-000000000004'::uuid, 'f5000000-0000-4000-8000-000000000056'::uuid, 'f3000000-0000-4000-8000-000000000042'::uuid, pg_temp.walk_moment(-45, '10:10')),
    ('f6000000-0000-4000-8000-000000000407'::uuid, 'f2000000-0000-4000-8000-000000000004'::uuid, 'f5000000-0000-4000-8000-000000000057'::uuid, 'f3000000-0000-4000-8000-000000000041'::uuid, pg_temp.walk_moment(-44, '14:25')),
    -- Running today
    ('f6000000-0000-4000-8000-000000000501'::uuid, 'f2000000-0000-4000-8000-000000000005'::uuid, 'f5000000-0000-4000-8000-000000000061'::uuid, 'f3000000-0000-4000-8000-000000000051'::uuid, pg_temp.walk_moment(-100, '18:00')),
    ('f6000000-0000-4000-8000-000000000502'::uuid, 'f2000000-0000-4000-8000-000000000005'::uuid, 'f5000000-0000-4000-8000-000000000062'::uuid, 'f3000000-0000-4000-8000-000000000051'::uuid, pg_temp.walk_moment(-98, '11:20')),
    ('f6000000-0000-4000-8000-000000000503'::uuid, 'f2000000-0000-4000-8000-000000000005'::uuid, 'f5000000-0000-4000-8000-000000000063'::uuid, 'f3000000-0000-4000-8000-000000000051'::uuid, pg_temp.walk_moment(-95, '15:45')),
    ('f6000000-0000-4000-8000-000000000504'::uuid, 'f2000000-0000-4000-8000-000000000005'::uuid, 'f5000000-0000-4000-8000-000000000064'::uuid, 'f3000000-0000-4000-8000-000000000051'::uuid, pg_temp.walk_moment(-90, '09:05')),
    ('f6000000-0000-4000-8000-000000000505'::uuid, 'f2000000-0000-4000-8000-000000000005'::uuid, 'f5000000-0000-4000-8000-000000000065'::uuid, 'f3000000-0000-4000-8000-000000000051'::uuid, pg_temp.walk_moment(-85, '20:30')),
    ('f6000000-0000-4000-8000-000000000506'::uuid, 'f2000000-0000-4000-8000-000000000005'::uuid, 'f5000000-0000-4000-8000-000000000066'::uuid, 'f3000000-0000-4000-8000-000000000051'::uuid, pg_temp.walk_moment(-80, '13:00')),
    ('f6000000-0000-4000-8000-000000000507'::uuid, 'f2000000-0000-4000-8000-000000000005'::uuid, 'f5000000-0000-4000-8000-000000000071'::uuid, 'f3000000-0000-4000-8000-000000000052'::uuid, pg_temp.walk_moment(-78, '10:00')),
    ('f6000000-0000-4000-8000-000000000508'::uuid, 'f2000000-0000-4000-8000-000000000005'::uuid, 'f5000000-0000-4000-8000-000000000072'::uuid, 'f3000000-0000-4000-8000-000000000052'::uuid, pg_temp.walk_moment(-76, '16:30')),
    ('f6000000-0000-4000-8000-000000000509'::uuid, 'f2000000-0000-4000-8000-000000000005'::uuid, 'f5000000-0000-4000-8000-000000000073'::uuid, 'f3000000-0000-4000-8000-000000000052'::uuid, pg_temp.walk_moment(-75, '09:45')),
    ('f6000000-0000-4000-8000-000000000510'::uuid, 'f2000000-0000-4000-8000-000000000005'::uuid, 'f5000000-0000-4000-8000-000000000074'::uuid, 'f3000000-0000-4000-8000-000000000052'::uuid, pg_temp.walk_moment(-72, '19:20')),
    ('f6000000-0000-4000-8000-000000000511'::uuid, 'f2000000-0000-4000-8000-000000000005'::uuid, 'f5000000-0000-4000-8000-000000000075'::uuid, 'f3000000-0000-4000-8000-000000000052'::uuid, pg_temp.walk_moment(-70, '12:00'))
) as application (id, conference_id, user_id, committee_id, submitted_at)
on conflict (id) do nothing;

insert into public.seats (id, committee_id, name, country_code, position, user_id, application_id, allocated_at)
values
  -- About to start: the Human Rights Council
  ('f9000000-0000-4000-8000-000000000411', 'f3000000-0000-4000-8000-000000000041', 'Brazil', 'BR', 1, 'f5000000-0000-4000-8000-000000000052', 'f6000000-0000-4000-8000-000000000402', pg_temp.walk_moment(-25, '10:00')),
  ('f9000000-0000-4000-8000-000000000412', 'f3000000-0000-4000-8000-000000000041', 'Canada', 'CA', 2, 'f5000000-0000-4000-8000-000000000051', 'f6000000-0000-4000-8000-000000000401', pg_temp.walk_moment(-25, '10:00')),
  ('f9000000-0000-4000-8000-000000000413', 'f3000000-0000-4000-8000-000000000041', 'Japan', 'JP', 3, 'f5000000-0000-4000-8000-000000000053', 'f6000000-0000-4000-8000-000000000403', pg_temp.walk_moment(-25, '10:00')),
  ('f9000000-0000-4000-8000-000000000414', 'f3000000-0000-4000-8000-000000000041', 'Mexico', 'MX', 4, 'f5000000-0000-4000-8000-000000000057', 'f6000000-0000-4000-8000-000000000407', pg_temp.walk_moment(-25, '10:00')),
  -- About to start: DISEC
  ('f9000000-0000-4000-8000-000000000421', 'f3000000-0000-4000-8000-000000000042', 'France', 'FR', 1, 'f5000000-0000-4000-8000-000000000054', 'f6000000-0000-4000-8000-000000000404', pg_temp.walk_moment(-25, '10:00')),
  ('f9000000-0000-4000-8000-000000000422', 'f3000000-0000-4000-8000-000000000042', 'Kenya', 'KE', 2, 'f5000000-0000-4000-8000-000000000055', 'f6000000-0000-4000-8000-000000000405', pg_temp.walk_moment(-25, '10:00')),
  ('f9000000-0000-4000-8000-000000000423', 'f3000000-0000-4000-8000-000000000042', 'Germany', 'DE', 3, 'f5000000-0000-4000-8000-000000000056', 'f6000000-0000-4000-8000-000000000406', pg_temp.walk_moment(-25, '10:00')),
  -- Running today: the Security Council
  ('f9000000-0000-4000-8000-000000000511', 'f3000000-0000-4000-8000-000000000051', 'China', 'CN', 1, 'f5000000-0000-4000-8000-000000000062', 'f6000000-0000-4000-8000-000000000502', pg_temp.walk_moment(-28, '10:00')),
  ('f9000000-0000-4000-8000-000000000512', 'f3000000-0000-4000-8000-000000000051', 'France', 'FR', 2, 'f5000000-0000-4000-8000-000000000063', 'f6000000-0000-4000-8000-000000000503', pg_temp.walk_moment(-28, '10:00')),
  ('f9000000-0000-4000-8000-000000000513', 'f3000000-0000-4000-8000-000000000051', 'Russian Federation', 'RU', 3, 'f5000000-0000-4000-8000-000000000064', 'f6000000-0000-4000-8000-000000000504', pg_temp.walk_moment(-28, '10:00')),
  ('f9000000-0000-4000-8000-000000000514', 'f3000000-0000-4000-8000-000000000051', 'United Kingdom', 'GB', 4, 'f5000000-0000-4000-8000-000000000061', 'f6000000-0000-4000-8000-000000000501', pg_temp.walk_moment(-28, '10:00')),
  ('f9000000-0000-4000-8000-000000000515', 'f3000000-0000-4000-8000-000000000051', 'United States', 'US', 5, 'f5000000-0000-4000-8000-000000000065', 'f6000000-0000-4000-8000-000000000505', pg_temp.walk_moment(-28, '10:00')),
  ('f9000000-0000-4000-8000-000000000516', 'f3000000-0000-4000-8000-000000000051', 'Brazil', 'BR', 6, 'f5000000-0000-4000-8000-000000000066', 'f6000000-0000-4000-8000-000000000506', pg_temp.walk_moment(-28, '10:00')),
  -- Running today: the Third Committee
  ('f9000000-0000-4000-8000-000000000521', 'f3000000-0000-4000-8000-000000000052', 'Jordan', 'JO', 1, 'f5000000-0000-4000-8000-000000000071', 'f6000000-0000-4000-8000-000000000507', pg_temp.walk_moment(-28, '10:00')),
  ('f9000000-0000-4000-8000-000000000522', 'f3000000-0000-4000-8000-000000000052', 'Colombia', 'CO', 2, 'f5000000-0000-4000-8000-000000000072', 'f6000000-0000-4000-8000-000000000508', pg_temp.walk_moment(-28, '10:00')),
  ('f9000000-0000-4000-8000-000000000523', 'f3000000-0000-4000-8000-000000000052', 'Germany', 'DE', 3, 'f5000000-0000-4000-8000-000000000073', 'f6000000-0000-4000-8000-000000000509', pg_temp.walk_moment(-28, '10:00')),
  ('f9000000-0000-4000-8000-000000000524', 'f3000000-0000-4000-8000-000000000052', 'Türkiye', 'TR', 4, 'f5000000-0000-4000-8000-000000000074', 'f6000000-0000-4000-8000-000000000510', pg_temp.walk_moment(-28, '10:00')),
  ('f9000000-0000-4000-8000-000000000525', 'f3000000-0000-4000-8000-000000000052', 'Lebanon', 'LB', 5, 'f5000000-0000-4000-8000-000000000075', 'f6000000-0000-4000-8000-000000000511', pg_temp.walk_moment(-28, '10:00'))
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- About to start: the fee and the invoices
-- -----------------------------------------------------------------------------
-- One invoice per seat, raised the morning the seats went out and due the day
-- before the conference. Four are paid, Maya's (Canada) and Amani's (Kenya)
-- are not yet, and Felix's (Germany) was waived.
--
-- amount_cents and platform_fee_cents are left out because the
-- invoices_compute_amount trigger works them out. Adding an invoice sends its
-- payer an "invoice created" notification.
insert into public.fees (id, conference_id, name, amount_cents, applies_to, position, created_at)
values
  ('f7000000-0000-4000-8000-000000000004', 'f2000000-0000-4000-8000-000000000004', 'Delegate fee', 4500, 'individual', 0, pg_temp.walk_moment(-100, '10:00'))
on conflict (id) do nothing;

insert into public.invoices (
  id, conference_id, number, payer_user_id, seat_id, delegation_id, fee_id,
  description, quantity, unit_amount_cents, currency,
  status, due_at, paid_at, paid_method, created_at
)
values
  ('f8000000-0000-4000-8000-000000000401', 'f2000000-0000-4000-8000-000000000004', 'northbridge-about-to-start-0001', 'f5000000-0000-4000-8000-000000000051', 'f9000000-0000-4000-8000-000000000412', null, 'f7000000-0000-4000-8000-000000000004',
    'Delegate fee · Northbridge MUN (about to start)', 1, 4500, 'GBP', 'unpaid', pg_temp.walk_moment(3, '23:59'), null, null, pg_temp.walk_moment(-25, '10:05')),
  ('f8000000-0000-4000-8000-000000000402', 'f2000000-0000-4000-8000-000000000004', 'northbridge-about-to-start-0002', 'f5000000-0000-4000-8000-000000000052', 'f9000000-0000-4000-8000-000000000411', null, 'f7000000-0000-4000-8000-000000000004',
    'Delegate fee · Northbridge MUN (about to start)', 1, 4500, 'GBP', 'paid', pg_temp.walk_moment(3, '23:59'), pg_temp.walk_moment(-20, '14:00'), 'manual', pg_temp.walk_moment(-25, '10:05')),
  ('f8000000-0000-4000-8000-000000000403', 'f2000000-0000-4000-8000-000000000004', 'northbridge-about-to-start-0003', 'f5000000-0000-4000-8000-000000000053', 'f9000000-0000-4000-8000-000000000413', null, 'f7000000-0000-4000-8000-000000000004',
    'Delegate fee · Northbridge MUN (about to start)', 1, 4500, 'GBP', 'paid', pg_temp.walk_moment(3, '23:59'), pg_temp.walk_moment(-15, '09:30'), 'manual', pg_temp.walk_moment(-25, '10:05')),
  ('f8000000-0000-4000-8000-000000000404', 'f2000000-0000-4000-8000-000000000004', 'northbridge-about-to-start-0004', 'f5000000-0000-4000-8000-000000000054', 'f9000000-0000-4000-8000-000000000421', null, 'f7000000-0000-4000-8000-000000000004',
    'Delegate fee · Northbridge MUN (about to start)', 1, 4500, 'GBP', 'paid', pg_temp.walk_moment(3, '23:59'), pg_temp.walk_moment(-12, '16:20'), 'manual', pg_temp.walk_moment(-25, '10:05')),
  ('f8000000-0000-4000-8000-000000000405', 'f2000000-0000-4000-8000-000000000004', 'northbridge-about-to-start-0005', 'f5000000-0000-4000-8000-000000000055', 'f9000000-0000-4000-8000-000000000422', null, 'f7000000-0000-4000-8000-000000000004',
    'Delegate fee · Northbridge MUN (about to start)', 1, 4500, 'GBP', 'unpaid', pg_temp.walk_moment(3, '23:59'), null, null, pg_temp.walk_moment(-25, '10:05')),
  ('f8000000-0000-4000-8000-000000000406', 'f2000000-0000-4000-8000-000000000004', 'northbridge-about-to-start-0006', 'f5000000-0000-4000-8000-000000000056', 'f9000000-0000-4000-8000-000000000423', null, 'f7000000-0000-4000-8000-000000000004',
    'Delegate fee · Northbridge MUN (about to start)', 1, 4500, 'GBP', 'waived', pg_temp.walk_moment(3, '23:59'), null, null, pg_temp.walk_moment(-25, '10:05')),
  ('f8000000-0000-4000-8000-000000000407', 'f2000000-0000-4000-8000-000000000004', 'northbridge-about-to-start-0007', 'f5000000-0000-4000-8000-000000000057', 'f9000000-0000-4000-8000-000000000414', null, 'f7000000-0000-4000-8000-000000000004',
    'Delegate fee · Northbridge MUN (about to start)', 1, 4500, 'GBP', 'paid', pg_temp.walk_moment(3, '23:59'), pg_temp.walk_moment(-10, '11:45'), 'manual', pg_temp.walk_moment(-25, '10:05'))
on conflict (id) do nothing;

-- What the organisers wrote for themselves when they settled each one. The note
-- lives in its own table since migration 20261022130000, which only invoice
-- readers and managers may read; the payer never sees it.
insert into public.invoice_internal_notes (invoice_id, note)
values
  ('f8000000-0000-4000-8000-000000000402', 'Bank transfer received.'),
  ('f8000000-0000-4000-8000-000000000403', 'Bank transfer received.'),
  ('f8000000-0000-4000-8000-000000000404', 'Bank transfer received.'),
  ('f8000000-0000-4000-8000-000000000406', 'Waived: a bursary from the society.'),
  ('f8000000-0000-4000-8000-000000000407', 'Bank transfer received.')
on conflict (invoice_id) do nothing;


-- -----------------------------------------------------------------------------
-- About to start: a school delegation
-- -----------------------------------------------------------------------------
-- Harbour View College asked for four seats and was given three, all in DISEC.
-- Andrew, its head, has put two students in their seats; the third seat is
-- kept for the delegation but empty, and Ruby has not been seated yet, so the
-- head has one seat to fill. A seat kept for a delegation has its
-- delegation_id set, and only one of its members may sit in it.
insert into public.delegations (
  id, conference_id, name, institution_name, country_code, status, requested_seats, note,
  join_code, submitted_at, decided_at, decided_by, decision_note, created_at
)
values (
  'f6000000-0000-4000-8000-000000000104',
  'f2000000-0000-4000-8000-000000000004',
  'Harbour View College',
  'Harbour View College',
  'GB',
  'accepted',
  4,
  'Four students from our debating society.',
  'HRBRVW57',
  pg_temp.walk_moment(-40, '16:00'),
  pg_temp.walk_moment(-12, '10:00'),
  'f5000000-0000-4000-8000-000000000001',
  'We can give you three seats, all in DISEC.',
  pg_temp.walk_moment(-42, '09:00')
)
on conflict (id) do nothing;

insert into public.delegation_members (delegation_id, user_id, role, joined_at)
values
  ('f6000000-0000-4000-8000-000000000104', 'f5000000-0000-4000-8000-000000000081', 'head', pg_temp.walk_moment(-42, '09:00')),
  ('f6000000-0000-4000-8000-000000000104', 'f5000000-0000-4000-8000-000000000082', 'member', pg_temp.walk_moment(-41, '18:00')),
  ('f6000000-0000-4000-8000-000000000104', 'f5000000-0000-4000-8000-000000000083', 'member', pg_temp.walk_moment(-41, '19:30')),
  ('f6000000-0000-4000-8000-000000000104', 'f5000000-0000-4000-8000-000000000084', 'member', pg_temp.walk_moment(-38, '12:15'))
on conflict do nothing;

insert into public.seats (id, committee_id, name, country_code, position, user_id, delegation_id, allocated_at)
values
  ('f9000000-0000-4000-8000-000000000425', 'f3000000-0000-4000-8000-000000000042', 'Nigeria', 'NG', 5,
    'f5000000-0000-4000-8000-000000000082', 'f6000000-0000-4000-8000-000000000104', pg_temp.walk_moment(-12, '10:00')),
  ('f9000000-0000-4000-8000-000000000426', 'f3000000-0000-4000-8000-000000000042', 'Indonesia', 'ID', 6,
    'f5000000-0000-4000-8000-000000000083', 'f6000000-0000-4000-8000-000000000104', pg_temp.walk_moment(-12, '10:00')),
  ('f9000000-0000-4000-8000-000000000427', 'f3000000-0000-4000-8000-000000000042', 'Argentina', 'AR', 7,
    null, 'f6000000-0000-4000-8000-000000000104', pg_temp.walk_moment(-12, '10:00'))
on conflict (id) do nothing;

-- A school pays one invoice for all its students, at a fee per student. The
-- first invoice was raised for four students by mistake and made void; the
-- one that replaced it, for three, is not paid yet. Only the head sees them.
insert into public.fees (id, conference_id, name, amount_cents, applies_to, position, created_at)
values
  ('f7000000-0000-4000-8000-000000000005', 'f2000000-0000-4000-8000-000000000004', 'School delegation fee', 4000, 'delegation_member', 1, pg_temp.walk_moment(-100, '10:00'))
on conflict (id) do nothing;

insert into public.invoices (
  id, conference_id, number, payer_user_id, seat_id, delegation_id, fee_id,
  description, quantity, unit_amount_cents, currency,
  status, due_at, paid_at, paid_method, created_at
)
values
  ('f8000000-0000-4000-8000-000000000408', 'f2000000-0000-4000-8000-000000000004', 'northbridge-about-to-start-0008', 'f5000000-0000-4000-8000-000000000081', null, 'f6000000-0000-4000-8000-000000000104', 'f7000000-0000-4000-8000-000000000005',
    'School delegation fee · Northbridge MUN (about to start)', 4, 4000, 'GBP', 'void', pg_temp.walk_moment(3, '23:59'), null, null, pg_temp.walk_moment(-12, '10:15')),
  ('f8000000-0000-4000-8000-000000000409', 'f2000000-0000-4000-8000-000000000004', 'northbridge-about-to-start-0009', 'f5000000-0000-4000-8000-000000000081', null, 'f6000000-0000-4000-8000-000000000104', 'f7000000-0000-4000-8000-000000000005',
    'School delegation fee · Northbridge MUN (about to start)', 3, 4000, 'GBP', 'unpaid', pg_temp.walk_moment(3, '23:59'), null, null, pg_temp.walk_moment(-11, '09:00'))
on conflict (id) do nothing;

-- The organisers' own note on the voided invoice, in the staff-only table.
insert into public.invoice_internal_notes (invoice_id, note)
values
  ('f8000000-0000-4000-8000-000000000408', 'Raised for four students by mistake; replaced by northbridge-about-to-start-0009.')
on conflict (invoice_id) do nothing;


-- Zoe is writing Nigeria's position paper on MUNMeet, and because she is in a
-- delegation the paper is shared: Andrew and the other members can open it
-- and write in it with her (T147, T148). Andrew made the last change. The
-- draft has only ever been Markdown, so it has no live document_state yet.
insert into public.position_paper_drafts (seat_id, body_markdown, updated_by, updated_at)
values (
  'f9000000-0000-4000-8000-000000000425',
  E'## Small arms and light weapons\n\nNigeria asks for **regional** help to trace weapons crossing the Sahel, and for stockpile security at home.\n\n- Marking at the point of manufacture\n- Shared records between ECOWAS members\n\n## Cyber operations against civilian infrastructure\n\nAndrew: add what Nigeria said at the last General Assembly.\n',
  'f5000000-0000-4000-8000-000000000081',
  pg_temp.walk_moment(-1, '21:15')
)
on conflict (seat_id) do nothing;


-- -----------------------------------------------------------------------------
-- About to start: an application never sent
-- -----------------------------------------------------------------------------
-- Mei started an application to this conference and did not send it before
-- applications closed. It stays a draft she can read but no longer submit.
insert into public.applications (
  id, conference_id, user_id, status, committee_preferences, seat_preferences, motivation,
  answers, created_at
)
values (
  'f6000000-0000-4000-8000-000000000408',
  'f2000000-0000-4000-8000-000000000004',
  'f5000000-0000-4000-8000-000000000048',
  'draft',
  array['f3000000-0000-4000-8000-000000000041']::uuid[],
  null,
  'I would like a seat in the Human Rights Council because',
  '{}'::jsonb,
  pg_temp.walk_moment(-30, '22:10')
)
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- About to start: documents
-- -----------------------------------------------------------------------------
-- Each row describes one PDF in supabase/media/documents/, and its
-- storage_path is where the reset uploads that file. file_size_bytes is the
-- file's real size; client/tests/db/walkthrough-seed.test.ts checks both.
--
-- Each chair uploaded their committee's background guide.
insert into public.documents (
  id, conference_id, committee_id, uploaded_by, kind, title, storage_path, file_name,
  file_size_bytes, mime_type, audience, created_at, updated_at
)
values
  ('fa000000-0000-4000-8000-000000001041', 'f2000000-0000-4000-8000-000000000004', 'f3000000-0000-4000-8000-000000000041', 'f5000000-0000-4000-8000-000000000012', 'background_guide',
    'HRC background guide',
    'f2000000-0000-4000-8000-000000000004/background-guides/f3000000-0000-4000-8000-000000000041-f4000000-0000-4000-8000-000000001041.pdf',
    'HRC background guide.pdf', 1193, 'application/pdf', 'delegates', pg_temp.walk_moment(-20, '18:00'), pg_temp.walk_moment(-20, '18:00')),
  ('fa000000-0000-4000-8000-000000001042', 'f2000000-0000-4000-8000-000000000004', 'f3000000-0000-4000-8000-000000000042', 'f5000000-0000-4000-8000-000000000013', 'background_guide',
    'DISEC background guide',
    'f2000000-0000-4000-8000-000000000004/background-guides/f3000000-0000-4000-8000-000000000042-f4000000-0000-4000-8000-000000001042.pdf',
    'DISEC background guide.pdf', 1191, 'application/pdf', 'delegates', pg_temp.walk_moment(-19, '09:30'), pg_temp.walk_moment(-19, '09:30'))
on conflict (id) do nothing;

-- Five position papers, uploaded by the delegate in each seat. In the Human
-- Rights Council Brazil's is approved, Canada's (Maya's) was sent back and
-- Japan's waits for review; in DISEC France's is approved and Kenya's waits.
-- Germany has not sent one yet. The committee's chair reviewed the ones that
-- were reviewed. The title is the one the app gives a paper (see
-- position-papers.ts).
insert into public.documents (
  id, conference_id, committee_id, seat_id, uploaded_by, kind, title, storage_path, file_name,
  file_size_bytes, mime_type, audience, review_status, review_comment, reviewed_by, reviewed_at,
  created_at, updated_at
)
select
  paper.id,
  'f2000000-0000-4000-8000-000000000004',
  seat.committee_id,
  seat.id,
  seat.user_id,
  'position_paper',
  'Position paper — ' || seat.name || ' (' || committee.abbreviation || ')',
  'f2000000-0000-4000-8000-000000000004/position-papers/' || seat.id || '-' || paper.file_uuid || '.pdf',
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
    ('fa000000-0000-4000-8000-000000000411'::uuid, 'f9000000-0000-4000-8000-000000000411'::uuid, 'f4000000-0000-4000-8000-000000000411', 1097, 'approved', null, pg_temp.walk_moment(-6, '19:10'), pg_temp.walk_moment(-3, '10:00')),
    ('fa000000-0000-4000-8000-000000000412'::uuid, 'f9000000-0000-4000-8000-000000000412'::uuid, 'f4000000-0000-4000-8000-000000000412', 1096, 'changes_requested', 'Please add Canada''s position on the second topic.', pg_temp.walk_moment(-5, '22:45'), pg_temp.walk_moment(-3, '10:05')),
    ('fa000000-0000-4000-8000-000000000413'::uuid, 'f9000000-0000-4000-8000-000000000413'::uuid, 'f4000000-0000-4000-8000-000000000413', 1089, 'submitted', null, pg_temp.walk_moment(-1, '17:30'), null),
    ('fa000000-0000-4000-8000-000000000421'::uuid, 'f9000000-0000-4000-8000-000000000421'::uuid, 'f4000000-0000-4000-8000-000000000421', 1092, 'approved', null, pg_temp.walk_moment(-7, '16:00'), pg_temp.walk_moment(-2, '11:00')),
    ('fa000000-0000-4000-8000-000000000422'::uuid, 'f9000000-0000-4000-8000-000000000422'::uuid, 'f4000000-0000-4000-8000-000000000422', 1090, 'submitted', null, pg_temp.walk_moment(-1, '21:15'), null)
) as paper (id, seat_id, file_uuid, file_size_bytes, review_status, review_comment, uploaded_at, reviewed_at)
join public.seats as seat on seat.id = paper.seat_id
join public.committees as committee on committee.id = seat.committee_id
-- An unreviewed paper has no reviewer at all.
left join public.committee_chairs as chair
  on chair.committee_id = seat.committee_id
  and chair.title = 'Chair'
  and paper.reviewed_at is not null
on conflict (id) do nothing;

-- Sofía (Mexico in the Human Rights Council) wrote her paper on MUNMeet
-- rather than uploading one (T145), and it waits for review beside Japan's
-- PDF, so the committee's chair can try both kinds (T146). A written paper has
-- its text in body_markdown and no file, which `documents_file_or_body`
-- requires, so this row has no PDF in supabase/media/documents/.
insert into public.documents (
  id, conference_id, committee_id, seat_id, uploaded_by, kind, title, body_markdown,
  audience, review_status, created_at, updated_at
)
values (
  'fa000000-0000-4000-8000-000000000414',
  'f2000000-0000-4000-8000-000000000004',
  'f3000000-0000-4000-8000-000000000041',
  'f9000000-0000-4000-8000-000000000414',
  'f5000000-0000-4000-8000-000000000057',
  'position_paper',
  'Position paper — Mexico (HRC)',
  E'## The right to a healthy environment\n\nMexico recognises the right to a clean, healthy and sustainable environment in its constitution, and asks the Council to give it **full effect** in the work of every special procedure.\n\n- A yearly report on environmental defenders at risk\n- Help for states writing the right into national law\n\n## Migrants in transit\n\nAs a country of origin, transit and destination, Mexico supports shared standards for the humane treatment of migrants at every border, and regional cooperation on search and rescue.\n',
  'delegates',
  'submitted',
  pg_temp.walk_moment(0, '08:15'),
  pg_temp.walk_moment(0, '08:15')
)
on conflict (id) do nothing;

-- Felix (Germany in DISEC) is writing his paper on MUNMeet rather than
-- uploading one (T145): a draft in progress, not yet submitted, so his seat
-- still counts as missing a paper. Only he can read it.
insert into public.position_paper_drafts (seat_id, body_markdown, updated_by, updated_at)
values (
  'f9000000-0000-4000-8000-000000000423',
  E'## Small arms and light weapons\n\nGermany supports a **binding** marking and tracing regime, building on the International Tracing Instrument.\n\n- Shared export records between member states\n- Help for border agencies in the Sahel\n\n## Cyber operations against civilian infrastructure\n\n',
  'f5000000-0000-4000-8000-000000000056',
  pg_temp.walk_moment(-1, '20:40')
)
on conflict (seat_id) do nothing;


-- -----------------------------------------------------------------------------
-- Schedules
-- -----------------------------------------------------------------------------
-- Three days for each of the two conferences. The one running today has its
-- committee sessions today, one of which is under way.
insert into public.schedule_events (
  id, conference_id, committee_id, title, description, location, starts_at, ends_at, audience, created_at
)
values
  -- About to start
  ('f0000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000004', null, 'Registration', 'Bring a photo ID.', 'Front hall', pg_temp.walk_moment(4, '09:00'), pg_temp.walk_moment(4, '10:00'), 'everyone', pg_temp.walk_moment(-30, '10:00')),
  ('f0000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000004', null, 'Opening ceremony', null, 'Main hall', pg_temp.walk_moment(4, '10:30'), pg_temp.walk_moment(4, '11:30'), 'everyone', pg_temp.walk_moment(-30, '10:00')),
  ('f0000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000004', null, 'Committee session I', null, 'Committee rooms', pg_temp.walk_moment(4, '13:00'), pg_temp.walk_moment(4, '17:00'), 'everyone', pg_temp.walk_moment(-30, '10:00')),
  ('f0000000-0000-4000-8000-000000000004', 'f2000000-0000-4000-8000-000000000004', null, 'Chairs'' briefing', 'Radios, room keys and the running order.', 'Secretariat office', pg_temp.walk_moment(4, '08:00'), pg_temp.walk_moment(4, '08:45'), 'staff', pg_temp.walk_moment(-30, '10:00')),
  ('f0000000-0000-4000-8000-000000000005', 'f2000000-0000-4000-8000-000000000004', null, 'Committee session II', null, 'Committee rooms', pg_temp.walk_moment(5, '09:30'), pg_temp.walk_moment(5, '17:00'), 'everyone', pg_temp.walk_moment(-30, '10:00')),
  ('f0000000-0000-4000-8000-000000000006', 'f2000000-0000-4000-8000-000000000004', null, 'Closing ceremony', null, 'Main hall', pg_temp.walk_moment(6, '15:00'), pg_temp.walk_moment(6, '16:30'), 'everyone', pg_temp.walk_moment(-30, '10:00')),
  -- Running today
  ('f0000000-0000-4000-8000-000000000011', 'f2000000-0000-4000-8000-000000000005', null, 'Opening ceremony', null, 'Main hall', pg_temp.walk_moment(-1, '10:00'), pg_temp.walk_moment(-1, '11:00'), 'everyone', pg_temp.walk_moment(-40, '10:00')),
  ('f0000000-0000-4000-8000-000000000012', 'f2000000-0000-4000-8000-000000000005', 'f3000000-0000-4000-8000-000000000051', 'Security Council session', 'The session continues all day, with a break for lunch.', 'Council Chamber', pg_temp.walk_moment(0, '09:00'), pg_temp.walk_moment(0, '17:30'), 'committee', pg_temp.walk_moment(-40, '10:00')),
  ('f0000000-0000-4000-8000-000000000013', 'f2000000-0000-4000-8000-000000000005', null, 'Delegates'' social', null, 'The Bridge Room', pg_temp.walk_moment(0, '19:30'), pg_temp.walk_moment(0, '22:00'), 'everyone', pg_temp.walk_moment(-40, '10:00')),
  ('f0000000-0000-4000-8000-000000000014', 'f2000000-0000-4000-8000-000000000005', null, 'Closing ceremony', null, 'Main hall', pg_temp.walk_moment(1, '15:00'), pg_temp.walk_moment(1, '16:30'), 'everyone', pg_temp.walk_moment(-40, '10:00'))
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- Announcements
-- -----------------------------------------------------------------------------
-- The notify_announcement trigger checks the author through auth.uid(), so
-- each author is set as the signed-in user for their insert, as demo-seed.sql
-- explains at its own announcements.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f5000000-0000-4000-8000-000000000001')::text,
  false
);

insert into public.announcements (
  id, conference_id, author_id, title, body, audience, committee_id, delegation_id, is_pinned,
  published_at, created_at, updated_at
)
values
  ('f0000000-0000-4000-8000-000000000101', 'f2000000-0000-4000-8000-000000000004', 'f5000000-0000-4000-8000-000000000001',
    'Seats are out',
    'Every delegate now has a seat. Your committee, your country and your invoice are on your dashboard.',
    'everyone', null, null, false,
    pg_temp.walk_moment(-25, '11:00'), pg_temp.walk_moment(-25, '11:00'), pg_temp.walk_moment(-25, '11:00')),
  ('f0000000-0000-4000-8000-000000000102', 'f2000000-0000-4000-8000-000000000004', 'f5000000-0000-4000-8000-000000000001',
    'Position papers are due in two days',
    'Upload your position paper as a PDF from your seat page before midnight on the deadline.',
    'delegates', null, null, true,
    pg_temp.walk_moment(0, '08:00'), pg_temp.walk_moment(0, '08:00'), pg_temp.walk_moment(0, '08:00')),
  ('f0000000-0000-4000-8000-000000000111', 'f2000000-0000-4000-8000-000000000005', 'f5000000-0000-4000-8000-000000000001',
    'Welcome to day two',
    'The Security Council sits all day in the Council Chamber. The social starts at half past seven.',
    'everyone', null, null, true,
    pg_temp.walk_moment(0, '07:30'), pg_temp.walk_moment(0, '07:30'), pg_temp.walk_moment(0, '07:30')),
  -- Written to one delegation only, and to the conference's own team only.
  ('f0000000-0000-4000-8000-000000000104', 'f2000000-0000-4000-8000-000000000004', 'f5000000-0000-4000-8000-000000000001',
    'Harbour View College: your seats are in DISEC',
    'Your three seats are Nigeria, Indonesia and Argentina, all in DISEC. Please seat your third student before the position paper deadline.',
    'delegation', null, 'f6000000-0000-4000-8000-000000000104', false,
    pg_temp.walk_moment(-11, '09:30'), pg_temp.walk_moment(-11, '09:30'), pg_temp.walk_moment(-11, '09:30')),
  ('f0000000-0000-4000-8000-000000000105', 'f2000000-0000-4000-8000-000000000004', 'f5000000-0000-4000-8000-000000000001',
    'Chairs: briefing at eight on the first morning',
    'We go through the running order, the radios and the room keys. It is on the staff schedule as "Chairs'' briefing".',
    'staff', null, null, false,
    pg_temp.walk_moment(-2, '12:00'), pg_temp.walk_moment(-2, '12:00'), pg_temp.walk_moment(-2, '12:00'))
on conflict (id) do nothing;

-- Samuel writes to his own committee, which a chair may do.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f5000000-0000-4000-8000-000000000012')::text,
  false
);

insert into public.announcements (
  id, conference_id, author_id, title, body, audience, committee_id, delegation_id, is_pinned,
  published_at, created_at, updated_at
)
values
  ('f0000000-0000-4000-8000-000000000103', 'f2000000-0000-4000-8000-000000000004', 'f5000000-0000-4000-8000-000000000012',
    'Human Rights Council: read the guide first',
    'Please read the background guide before you write your position paper. Both topics will be debated.',
    'committee', 'f3000000-0000-4000-8000-000000000041', null, false,
    pg_temp.walk_moment(-18, '18:00'), pg_temp.walk_moment(-18, '18:00'), pg_temp.walk_moment(-18, '18:00'))
on conflict (id) do nothing;

-- Nobody is signed in any more.
select set_config('request.jwt.claims', '', false);


-- -----------------------------------------------------------------------------
-- Running today: the Security Council's practice session
-- -----------------------------------------------------------------------------
-- Fiona ran a practice session the afternoon before the first day, and what
-- it left behind is kept, so a chair can read a finished session's record: a
-- roll call with one seat absent, a speakers' list with one delegate taken
-- off it, three motions (passed, failed and withdrawn) and the moderated
-- caucus the first one opened, a roll-call vote lost on a tie, her notes on
-- three delegates and on the session, and two awards she has proposed.
--
-- It started before the conference's first day, which is what makes it a
-- practice session. The app counts only sessions from the first day on when
-- it names the next one (defaultSessionName in chair-room.ts), so the room
-- still offers "Start Session 2" once Session 1 ends.
insert into public.committee_sessions (id, committee_id, name, status, started_at, ended_at, created_at)
values (
  'fb000000-0000-4000-8000-000000000151',
  'f3000000-0000-4000-8000-000000000051',
  'Practice session',
  'ended',
  pg_temp.walk_moment(-2, '16:00'),
  pg_temp.walk_moment(-2, '17:30'),
  pg_temp.walk_moment(-2, '16:00')
)
on conflict (id) do nothing;

-- The Russian Federation missed it, and the United States answered only
-- "present", which lets a delegation abstain in a substantive vote.
insert into public.roll_calls (id, session_id, taken_by, taken_at)
values (
  'ff000000-0000-4000-8000-000000000151',
  'fb000000-0000-4000-8000-000000000151',
  'f5000000-0000-4000-8000-000000000011',
  pg_temp.walk_moment(-2, '16:02')
)
on conflict (id) do nothing;

insert into public.roll_call_entries (roll_call_id, seat_id, status, created_at)
select
  'ff000000-0000-4000-8000-000000000151',
  seat.id,
  case seat.name
    when 'Russian Federation' then 'absent'
    when 'United States' then 'present'
    else 'present_and_voting'
  end::public.attendance_status,
  pg_temp.walk_moment(-2, '16:02')
from public.seats as seat
where seat.committee_id = 'f3000000-0000-4000-8000-000000000051'
on conflict do nothing;

-- France's moderated caucus passed, the United Kingdom's unmoderated caucus
-- failed, and Brazil withdrew its motion to suspend before it was voted on.
insert into public.motions (
  id, committee_id, session_id, proposed_by_seat_id, kind, topic, total_time_seconds,
  speaking_time_seconds, status, votes_for, votes_against, decided_at, created_at
)
values
  ('fc000000-0000-4000-8000-000000000151', 'f3000000-0000-4000-8000-000000000051', 'fb000000-0000-4000-8000-000000000151', 'f9000000-0000-4000-8000-000000000512',
    'moderated_caucus', 'Protecting aid workers', 480, 60, 'passed', 4, 1,
    pg_temp.walk_moment(-2, '16:30'), pg_temp.walk_moment(-2, '16:28')),
  ('fc000000-0000-4000-8000-000000000152', 'f3000000-0000-4000-8000-000000000051', 'fb000000-0000-4000-8000-000000000151', 'f9000000-0000-4000-8000-000000000514',
    'unmoderated_caucus', null, 600, null, 'failed', 2, 3,
    pg_temp.walk_moment(-2, '16:50'), pg_temp.walk_moment(-2, '16:49')),
  ('fc000000-0000-4000-8000-000000000153', 'f3000000-0000-4000-8000-000000000051', 'fb000000-0000-4000-8000-000000000151', 'f9000000-0000-4000-8000-000000000516',
    'suspend_meeting', null, null, null, 'withdrawn', null, null,
    pg_temp.walk_moment(-2, '17:09'), pg_temp.walk_moment(-2, '17:08'))
on conflict (id) do nothing;

-- The General Speakers' List, closed when the session ended, and the list the
-- moderated caucus opened, named after its topic as the app names it.
insert into public.speakers_lists (id, committee_id, session_id, motion_id, kind, name, speaking_time_seconds, is_open, created_at)
values
  ('fd000000-0000-4000-8000-000000000151', 'f3000000-0000-4000-8000-000000000051', 'fb000000-0000-4000-8000-000000000151', null,
    'general', 'General Speakers'' List', 60, false, pg_temp.walk_moment(-2, '16:03')),
  ('fd000000-0000-4000-8000-000000000152', 'f3000000-0000-4000-8000-000000000051', 'fb000000-0000-4000-8000-000000000151', 'fc000000-0000-4000-8000-000000000151',
    'caucus', 'Protecting aid workers', 60, false, pg_temp.walk_moment(-2, '16:30'))
on conflict (id) do nothing;

-- Brazil asked to come off the General Speakers' List before its turn.
insert into public.speakers_list_entries (id, speakers_list_id, seat_id, position, status, started_at, finished_at, spoke_seconds, created_at)
values
  ('fe000000-0000-4000-8000-000000000151', 'fd000000-0000-4000-8000-000000000151', 'f9000000-0000-4000-8000-000000000511', 1, 'spoken',
    pg_temp.walk_moment(-2, '16:04:00'), pg_temp.walk_moment(-2, '16:05:00'), 60, pg_temp.walk_moment(-2, '16:03')),
  ('fe000000-0000-4000-8000-000000000152', 'fd000000-0000-4000-8000-000000000151', 'f9000000-0000-4000-8000-000000000514', 2, 'spoken',
    pg_temp.walk_moment(-2, '16:05:10'), pg_temp.walk_moment(-2, '16:06:08'), 58, pg_temp.walk_moment(-2, '16:03')),
  ('fe000000-0000-4000-8000-000000000153', 'fd000000-0000-4000-8000-000000000151', 'f9000000-0000-4000-8000-000000000516', 3, 'removed',
    null, null, null, pg_temp.walk_moment(-2, '16:03')),
  ('fe000000-0000-4000-8000-000000000154', 'fd000000-0000-4000-8000-000000000151', 'f9000000-0000-4000-8000-000000000512', 4, 'spoken',
    pg_temp.walk_moment(-2, '16:06:20'), pg_temp.walk_moment(-2, '16:07:20'), 60, pg_temp.walk_moment(-2, '16:04')),
  ('fe000000-0000-4000-8000-000000000155', 'fd000000-0000-4000-8000-000000000151', 'f9000000-0000-4000-8000-000000000515', 5, 'spoken',
    pg_temp.walk_moment(-2, '16:07:30'), pg_temp.walk_moment(-2, '16:08:15'), 45, pg_temp.walk_moment(-2, '16:05')),
  ('fe000000-0000-4000-8000-000000000156', 'fd000000-0000-4000-8000-000000000152', 'f9000000-0000-4000-8000-000000000512', 1, 'spoken',
    pg_temp.walk_moment(-2, '16:31:00'), pg_temp.walk_moment(-2, '16:32:00'), 60, pg_temp.walk_moment(-2, '16:30')),
  ('fe000000-0000-4000-8000-000000000157', 'fd000000-0000-4000-8000-000000000152', 'f9000000-0000-4000-8000-000000000511', 2, 'spoken',
    pg_temp.walk_moment(-2, '16:32:10'), pg_temp.walk_moment(-2, '16:33:05'), 55, pg_temp.walk_moment(-2, '16:30')),
  ('fe000000-0000-4000-8000-000000000158', 'fd000000-0000-4000-8000-000000000152', 'f9000000-0000-4000-8000-000000000515', 3, 'spoken',
    pg_temp.walk_moment(-2, '16:33:15'), pg_temp.walk_moment(-2, '16:34:15'), 60, pg_temp.walk_moment(-2, '16:31'))
on conflict (id) do nothing;

-- A roll-call vote on a working paper, lost on a tie. A roll-call vote keeps
-- one entry per seat that voted; the absent Russian Federation has none.
insert into public.votes (
  id, committee_id, session_id, kind, subject, method, majority, status,
  votes_for, votes_against, votes_abstain, passed, opened_at, closed_at
)
values (
  'f0000000-0000-4000-8000-000000000401', 'f3000000-0000-4000-8000-000000000051', 'fb000000-0000-4000-8000-000000000151', 'substantive',
  'Working paper 1 · Safe passage for aid convoys', 'roll_call', 'simple', 'closed',
  2, 2, 1, false, pg_temp.walk_moment(-2, '17:15'), pg_temp.walk_moment(-2, '17:20')
)
on conflict (id) do nothing;

insert into public.vote_entries (vote_id, seat_id, choice, created_at)
values
  ('f0000000-0000-4000-8000-000000000401', 'f9000000-0000-4000-8000-000000000511', 'against', pg_temp.walk_moment(-2, '17:16')),
  ('f0000000-0000-4000-8000-000000000401', 'f9000000-0000-4000-8000-000000000512', 'for', pg_temp.walk_moment(-2, '17:16')),
  ('f0000000-0000-4000-8000-000000000401', 'f9000000-0000-4000-8000-000000000514', 'against', pg_temp.walk_moment(-2, '17:17')),
  ('f0000000-0000-4000-8000-000000000401', 'f9000000-0000-4000-8000-000000000515', 'abstain', pg_temp.walk_moment(-2, '17:18')),
  ('f0000000-0000-4000-8000-000000000401', 'f9000000-0000-4000-8000-000000000516', 'for', pg_temp.walk_moment(-2, '17:19'))
on conflict do nothing;

-- Fiona's private notes on three delegates, which only the committee's chairs
-- can read.
insert into public.chair_notes (id, committee_id, seat_id, author_id, body, created_at)
values
  ('f0000000-0000-4000-8000-000000000601', 'f3000000-0000-4000-8000-000000000051', 'f9000000-0000-4000-8000-000000000511', 'f5000000-0000-4000-8000-000000000011',
    'Clear opening statement. Watch the time: ran right to the end of the minute.', pg_temp.walk_moment(-2, '16:10')),
  ('f0000000-0000-4000-8000-000000000602', 'f3000000-0000-4000-8000-000000000051', 'f9000000-0000-4000-8000-000000000512', 'f5000000-0000-4000-8000-000000000011',
    'Proposed the caucus that passed and kept it on topic.', pg_temp.walk_moment(-2, '16:40')),
  ('f0000000-0000-4000-8000-000000000603', 'f3000000-0000-4000-8000-000000000051', 'f9000000-0000-4000-8000-000000000516', 'f5000000-0000-4000-8000-000000000011',
    'Came off the speakers'' list. Check they are comfortable speaking on day one.', pg_temp.walk_moment(-2, '17:25'))
on conflict (id) do nothing;

-- Her notes on the session itself. The committee_session_notes_stamp trigger
-- records who wrote them through auth.uid(), so Fiona is set as the signed-in
-- user for the insert, as at the announcements above.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f5000000-0000-4000-8000-000000000011')::text,
  false
);

insert into public.committee_session_notes (session_id, committee_id, body)
values (
  'fb000000-0000-4000-8000-000000000151',
  'f3000000-0000-4000-8000-000000000051',
  E'## Practice session\n\n- The Russian Federation did not come. Ask Ivan whether he is here on day one.\n- Remind everybody that a point of order is about procedure, not about what was said.\n- Working paper 1 failed on a tie; France and Brazil want to bring it back.\n'
)
on conflict (session_id) do nothing;

select set_config('request.jwt.claims', '', false);

-- Two awards Fiona has proposed. An organiser confirms and publishes them; a
-- proposed award does not name its holder yet (awards_guard_insert), which
-- the conference fills in when it publishes the awards.
insert into public.awards (committee_id, seat_id, user_id, kind, title, status, created_by, created_at)
values
  ('f3000000-0000-4000-8000-000000000051', 'f9000000-0000-4000-8000-000000000512', null, 'outstanding_delegate', 'Outstanding Delegate', 'proposed', 'f5000000-0000-4000-8000-000000000011', pg_temp.walk_moment(-2, '17:40')),
  ('f3000000-0000-4000-8000-000000000051', 'f9000000-0000-4000-8000-000000000516', null, 'custom', 'Best Newcomer', 'proposed', 'f5000000-0000-4000-8000-000000000011', pg_temp.walk_moment(-2, '17:42'))
on conflict do nothing;


-- -----------------------------------------------------------------------------
-- Running today: the Security Council in session
-- -----------------------------------------------------------------------------
-- The session started fifty minutes before the reset, the way the app starts
-- one (committee-sessions.ts): the session row, then its General Speakers'
-- List, then committee_state pointing at both. Times are counted from now()
-- rather than from a clock time so the session is always "in progress" and
-- never started in the future, whatever the hour of the reset.
insert into public.committee_sessions (id, committee_id, name, status, started_at, ended_at, created_at)
values (
  'fb000000-0000-4000-8000-000000000051',
  'f3000000-0000-4000-8000-000000000051',
  'Session 1',
  'in_progress',
  now() - interval '50 minutes',
  null,
  now() - interval '50 minutes'
)
on conflict (id) do nothing;

-- Fiona took the roll call straight away. Everybody is present and voting
-- except the Russian Federation, which answered only "present".
insert into public.roll_calls (id, session_id, taken_by, taken_at)
values (
  'ff000000-0000-4000-8000-000000000051',
  'fb000000-0000-4000-8000-000000000051',
  'f5000000-0000-4000-8000-000000000011',
  now() - interval '47 minutes'
)
on conflict (id) do nothing;

insert into public.roll_call_entries (roll_call_id, seat_id, status, created_at)
select
  'ff000000-0000-4000-8000-000000000051',
  seat.id,
  case when seat.name = 'Russian Federation' then 'present' else 'present_and_voting' end::public.attendance_status,
  now() - interval '47 minutes'
from public.seats as seat
where seat.committee_id = 'f3000000-0000-4000-8000-000000000051'
on conflict do nothing;

insert into public.speakers_lists (id, committee_id, session_id, motion_id, kind, name, speaking_time_seconds, is_open, created_at)
values (
  'fd000000-0000-4000-8000-000000000051',
  'f3000000-0000-4000-8000-000000000051',
  'fb000000-0000-4000-8000-000000000051',
  null,
  'general',
  'General Speakers'' List',
  90,
  true,
  now() - interval '50 minutes'
)
on conflict (id) do nothing;

-- France and the United States have spoken, China is speaking now, and the
-- United Kingdom (James, walk.delegate.live) and Brazil are waiting.
insert into public.speakers_list_entries (id, speakers_list_id, seat_id, position, status, started_at, finished_at, spoke_seconds, created_at)
values
  ('fe000000-0000-4000-8000-000000000051', 'fd000000-0000-4000-8000-000000000051', 'f9000000-0000-4000-8000-000000000512', 1, 'spoken',
    now() - interval '40 minutes', now() - interval '38 minutes 35 seconds', 85, now() - interval '45 minutes'),
  ('fe000000-0000-4000-8000-000000000052', 'fd000000-0000-4000-8000-000000000051', 'f9000000-0000-4000-8000-000000000515', 2, 'spoken',
    now() - interval '38 minutes', now() - interval '36 minutes 30 seconds', 90, now() - interval '45 minutes'),
  ('fe000000-0000-4000-8000-000000000053', 'fd000000-0000-4000-8000-000000000051', 'f9000000-0000-4000-8000-000000000511', 3, 'speaking',
    now() - interval '38 seconds', null, null, now() - interval '44 minutes'),
  ('fe000000-0000-4000-8000-000000000054', 'fd000000-0000-4000-8000-000000000051', 'f9000000-0000-4000-8000-000000000514', 4, 'waiting',
    null, null, null, now() - interval '44 minutes'),
  ('fe000000-0000-4000-8000-000000000055', 'fd000000-0000-4000-8000-000000000051', 'f9000000-0000-4000-8000-000000000516', 5, 'waiting',
    null, null, null, now() - interval '30 minutes')
on conflict (id) do nothing;

-- Brazil has proposed a moderated caucus, which the chair has not put to the
-- vote yet. A proposed motion is not "the caucus being run", so
-- committee_state.current_motion_id stays empty.
insert into public.motions (
  id, committee_id, session_id, proposed_by_seat_id, kind, topic, total_time_seconds,
  speaking_time_seconds, status, votes_for, votes_against, decided_at, created_at
)
values (
  'fc000000-0000-4000-8000-000000000051',
  'f3000000-0000-4000-8000-000000000051',
  'fb000000-0000-4000-8000-000000000051',
  'f9000000-0000-4000-8000-000000000516',
  'moderated_caucus',
  'Opening humanitarian corridors',
  600,
  60,
  'proposed',
  null, null, null,
  now() - interval '5 minutes'
)
on conflict (id) do nothing;

-- The room itself: formal debate on the General Speakers' List, with China on
-- the floor. The timer is paused with 52 of 90 seconds left, rather than
-- running, so it is still showing time when somebody opens the room an hour
-- after the reset. The table's check allows a timer to run or to be paused,
-- never both, which is why timer_ends_at is empty. The council debates its
-- only topic, so the agenda is set (T127; a trigger checks it is one of the
-- committee's topics).
update public.committee_state
set current_session_id = 'fb000000-0000-4000-8000-000000000051',
    agenda_topic = 'Humanitarian access in armed conflict',
    mode = 'formal_debate',
    active_speakers_list_id = 'fd000000-0000-4000-8000-000000000051',
    current_speaker_entry_id = 'fe000000-0000-4000-8000-000000000053',
    current_motion_id = null,
    current_vote_id = null,
    timer_total_seconds = 90,
    timer_ends_at = null,
    timer_paused_remaining_seconds = 52
where committee_id = 'f3000000-0000-4000-8000-000000000051'
  and current_session_id is null;


-- -----------------------------------------------------------------------------
-- Running today: the Third Committee, just opened
-- -----------------------------------------------------------------------------
-- Nadia Haddad (walk.nadia.haddad) opened the session five minutes before the
-- reset and the room has not chosen between its two topics, so the agenda is
-- still empty and the chair's top strip warns "Agenda not set" (T127). Its
-- five delegates have not answered a roll call yet, so it shows a room at its
-- very start.
insert into public.committee_sessions (id, committee_id, name, status, started_at, ended_at, created_at)
values (
  'fb000000-0000-4000-8000-000000000052',
  'f3000000-0000-4000-8000-000000000052',
  'Session 1',
  'in_progress',
  now() - interval '5 minutes',
  null,
  now() - interval '5 minutes'
)
on conflict (id) do nothing;

insert into public.speakers_lists (id, committee_id, session_id, motion_id, kind, name, speaking_time_seconds, is_open, created_at)
values (
  'fd000000-0000-4000-8000-000000000052',
  'f3000000-0000-4000-8000-000000000052',
  'fb000000-0000-4000-8000-000000000052',
  null,
  'general',
  'General Speakers'' List',
  90,
  true,
  now() - interval '5 minutes'
)
on conflict (id) do nothing;

update public.committee_state
set current_session_id = 'fb000000-0000-4000-8000-000000000052',
    mode = 'formal_debate',
    active_speakers_list_id = 'fd000000-0000-4000-8000-000000000052'
where committee_id = 'f3000000-0000-4000-8000-000000000052'
  and current_session_id is null;


-- -----------------------------------------------------------------------------
-- Running today: a committee day of papers
-- -----------------------------------------------------------------------------
-- What docs/committee-papers.md builds, at every stage at once, so a person
-- can test it by hand (step 10, "Test data and guides"; docs/TESTING-GUIDE.md
-- has the walk through it):
--   the Security Council  a working paper introduced; Draft resolution 1.1,
--                         passed, with a written-in, a passed and a failed
--                         amendment and its record copy; Draft resolution 1.2
--                         on the floor, with amendments in every status; a
--                         bloc's working paper still being written, with
--                         comments and a suggestion; and a draft open for
--                         signatures
--   ECOFIN                a new committee run to THIMUN procedure, with a
--                         draft resolution submitted to the dais
--   ExComm                a new crisis committee, October 1962, with a
--                         passed committee directive waiting for its answer,
--                         directives answered, refused and waiting, press
--                         releases, a crisis update and a crisis-staff account
--
-- The Security Council's papers were decided in "Practice session 2", the
-- evening before the first day, after the practice session above, so the room
-- still offers "Start Session 2" once Session 1 ends (defaultSessionName in
-- chair-room.ts names practice sessions apart). What is still waiting was
-- written this morning, and is dated from now(), like the session in progress,
-- so it is never in the future. Nothing is on the projector: a paper on screen
-- takes the display over, and the room in session shows its speaker.
--
-- The rows are written as the app's functions leave them (start_paper,
-- submit_paper, approve_paper, introduce_paper, propose_amendment and the
-- rest, in supabase/migrations/20261008120100_committee_papers.sql), and the
-- check triggers still run, because postgres passes only the guards. Those
-- triggers fix the order: a paper takes its authors and signatories only
-- while it is being written, a motion to introduce names an approved paper,
-- and a vote names an introduced draft or an approved amendment. So each
-- paper is inserted being written, given its seats, then moved on, each step
-- guarded by the status it leaves, so a second run of the file finds nothing
-- to do. A vote is inserted already closed, which settles nothing
-- (votes_settle_paper fires on closing), so what it decided is written after
-- it. The notifications these steps would have sent are left out: the ones
-- written at the end of the file stay the kinds it has always written.
--
-- A draft keeps the text it was submitted with; each amendment written in or
-- passed adds a version, made by the database's own
-- apply_amendment_to_content, and the pages read the latest version.
--
-- The ids: papers f0…7xx, their versions f0…8xx (same last two digits),
-- amendments f0…9xx, comment threads f0…50x and their comments f0…55x, the
-- votes f0…411 to 416. Committees f3…053 (ECOFIN) and f3…054 (ExComm), their
-- seats f9…53x and f9…54x, their delegates' applications f6…512 to 517.
-- "Practice session 2" and its motions are numbered from 161, ExComm's
-- session and motion from 171.

-- The Security Council asks for two seats behind an unfriendly amendment, the
-- proposer and one more, so an amendment waits in "Collecting support" until
-- a second delegation signs it. Its default, 10 percent of six seats, is one
-- seat, which sends every amendment straight to the dais.
update public.committees
set amendment_support_minimum = 2,
    amendment_support_unit = 'seats'
where id = 'f3000000-0000-4000-8000-000000000051'
  and amendment_support_minimum = 10
  and amendment_support_unit = 'percent';

insert into public.committee_sessions (id, committee_id, name, status, started_at, ended_at, created_at)
values (
  'fb000000-0000-4000-8000-000000000161',
  'f3000000-0000-4000-8000-000000000051',
  'Practice session 2',
  'ended',
  pg_temp.walk_moment(-2, '19:00'),
  pg_temp.walk_moment(-2, '21:00'),
  pg_temp.walk_moment(-2, '19:00')
)
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- Running today's papers: Working paper 1.1, introduced
-- -----------------------------------------------------------------------------
-- France and Brazil brought back the paper that failed in the practice
-- session, now written on MUNMeet. Fiona approved it, and a motion introduced
-- it at the start of Practice session 2. A working paper is not voted on.
insert into public.committee_papers (
  id, committee_id, kind, status, title, topic, started_by_seat_id, lead_seat_id,
  body_markdown, updated_by, created_at, updated_at
)
values (
  'f0000000-0000-4000-8000-000000000701', 'f3000000-0000-4000-8000-000000000051', 'working_paper', 'writing',
  'Safe passage for aid convoys', 'Humanitarian access in armed conflict',
  'f9000000-0000-4000-8000-000000000512', 'f9000000-0000-4000-8000-000000000512',
  E'Alarmed that aid convoys are stopped, searched and turned back at checkpoints,\n\n'
    || E'1. Calls upon all parties to let aid convoys pass checkpoints without delay;\n'
    || E'2. Proposes that convoys carry a single permit recognised by every party;\n'
    || '3. Asks the Secretary-General to name an envoy for humanitarian access.',
  'f5000000-0000-4000-8000-000000000063', pg_temp.walk_moment(-2, '17:45'), pg_temp.walk_moment(-2, '18:10')
)
on conflict (id) do nothing;

-- The seats go on while the paper is being written
-- (committee_paper_seats_check), so each insert of seats below reads the
-- paper's status.
insert into public.committee_paper_seats (paper_id, seat_id, role, added_at)
select paper.id, paper_seat.seat_id::uuid, paper_seat.role::public.paper_seat_role, paper_seat.added_at
from public.committee_papers as paper
cross join (
  values
    ('f9000000-0000-4000-8000-000000000512', 'author', pg_temp.walk_moment(-2, '17:45')),
    ('f9000000-0000-4000-8000-000000000516', 'author', pg_temp.walk_moment(-2, '17:50'))
) as paper_seat (seat_id, role, added_at)
where paper.id = 'f0000000-0000-4000-8000-000000000701'
  and paper.status = 'writing'
on conflict do nothing;

update public.committee_papers
set status = 'approved',
    submitted_at = pg_temp.walk_moment(-2, '18:15'),
    topic_number = 1,
    sequence = 1,
    decided_at = pg_temp.walk_moment(-2, '18:30'),
    decided_by = 'f5000000-0000-4000-8000-000000000011'
where id = 'f0000000-0000-4000-8000-000000000701'
  and status = 'writing';

-- Submitting a working paper keeps its text as version 1.
insert into public.committee_paper_versions (id, paper_id, version_number, content, created_at)
select
  'f0000000-0000-4000-8000-000000000801', paper.id, 1,
  jsonb_build_object('markdown', paper.body_markdown), paper.submitted_at
from public.committee_papers as paper
where paper.id = 'f0000000-0000-4000-8000-000000000701'
on conflict do nothing;

-- A motion to introduce names its paper, which must be approved
-- (motions_check_paper), and its topic is the paper's number, as the
-- composer writes it.
insert into public.motions (
  id, committee_id, session_id, proposed_by_seat_id, kind, topic, status,
  votes_for, votes_against, decided_at, created_at, paper_id
)
select
  'fc000000-0000-4000-8000-000000000161', paper.committee_id, 'fb000000-0000-4000-8000-000000000161',
  'f9000000-0000-4000-8000-000000000512', 'introduce_document', 'Working paper 1.1', 'passed',
  5, 1, pg_temp.walk_moment(-2, '19:05'), pg_temp.walk_moment(-2, '19:03'), paper.id
from public.committee_papers as paper
where paper.id = 'f0000000-0000-4000-8000-000000000701'
  and paper.status = 'approved'
on conflict (id) do nothing;

update public.committee_papers
set status = 'introduced',
    introduced_at = pg_temp.walk_moment(-2, '19:05'),
    introduced_by_motion_id = 'fc000000-0000-4000-8000-000000000161'
where id = 'f0000000-0000-4000-8000-000000000701'
  and status = 'approved';


-- -----------------------------------------------------------------------------
-- Running today's papers: Draft resolution 1.1, passed
-- -----------------------------------------------------------------------------
-- Based on the working paper, sponsored by France, Brazil and the United
-- States and signed by China. On the floor it took three amendments: China's,
-- which the sponsors accepted as friendly and the dais wrote in; the Russian
-- Federation's new clause, which France declined and the committee passed;
-- and China's second, which the committee voted down. Then it passed, 5 to 0
-- with the Russian Federation abstaining, so it is in the committee page's
-- Resolutions and has a record copy.
insert into public.committee_papers (
  id, committee_id, kind, status, title, topic, started_by_seat_id, lead_seat_id,
  preamble_markdown, operative_markdown, updated_by, created_at, updated_at
)
values (
  'f0000000-0000-4000-8000-000000000702', 'f3000000-0000-4000-8000-000000000051', 'draft_resolution', 'writing',
  'Aid convoys and checkpoints', 'Humanitarian access in armed conflict',
  'f9000000-0000-4000-8000-000000000512', 'f9000000-0000-4000-8000-000000000512',
  E'Recalling its earlier resolutions on the protection of civilians in armed conflict,\n\n'
    || 'Alarmed that aid convoys are stopped, searched and turned back at checkpoints,',
  E'1. Demands that all parties let aid convoys pass checkpoints without delay;\n'
    || E'2. Decides that a convoy carrying a permit from the United Nations shall be recognised by every party;\n'
    || '3. Requests the Secretary-General to name an envoy for humanitarian access and to report to the Council within ninety days.',
  'f5000000-0000-4000-8000-000000000063', pg_temp.walk_moment(-2, '19:10'), pg_temp.walk_moment(-2, '19:25')
)
on conflict (id) do nothing;

insert into public.committee_paper_seats (paper_id, seat_id, role, added_at)
select paper.id, paper_seat.seat_id::uuid, paper_seat.role::public.paper_seat_role, paper_seat.added_at
from public.committee_papers as paper
cross join (
  values
    ('f9000000-0000-4000-8000-000000000512', 'author', pg_temp.walk_moment(-2, '19:10')),
    ('f9000000-0000-4000-8000-000000000516', 'author', pg_temp.walk_moment(-2, '19:11')),
    ('f9000000-0000-4000-8000-000000000515', 'author', pg_temp.walk_moment(-2, '19:12')),
    ('f9000000-0000-4000-8000-000000000511', 'signatory', pg_temp.walk_moment(-2, '19:24'))
) as paper_seat (seat_id, role, added_at)
where paper.id = 'f0000000-0000-4000-8000-000000000702'
  and paper.status = 'writing'
on conflict do nothing;

-- A draft resolution can only be based on a working paper already
-- introduced (committee_paper_sources_check), which 1.1 now is.
insert into public.committee_paper_sources (paper_id, source_paper_id)
values ('f0000000-0000-4000-8000-000000000702', 'f0000000-0000-4000-8000-000000000701')
on conflict do nothing;

update public.committee_papers
set status = 'approved',
    submitted_at = pg_temp.walk_moment(-2, '19:30'),
    topic_number = 1,
    sequence = 1,
    decided_at = pg_temp.walk_moment(-2, '19:40'),
    decided_by = 'f5000000-0000-4000-8000-000000000011'
where id = 'f0000000-0000-4000-8000-000000000702'
  and status = 'writing';

-- A draft resolution's version 1 is its clauses, as the editor cut them on
-- submitting. Stored clauses carry no opening-phrase marks; the reader adds
-- them.
insert into public.committee_paper_versions (id, paper_id, version_number, content, created_at)
values (
  'f0000000-0000-4000-8000-000000000802', 'f0000000-0000-4000-8000-000000000702', 1,
  '{"preamble": [{"id": "p1", "markdown": "Recalling its earlier resolutions on the protection of civilians in armed conflict,"}, {"id": "p2", "markdown": "Alarmed that aid convoys are stopped, searched and turned back at checkpoints,"}], "operative": [{"id": "o1", "markdown": "Demands that all parties let aid convoys pass checkpoints without delay;", "children": []}, {"id": "o2", "markdown": "Decides that a convoy carrying a permit from the United Nations shall be recognised by every party;", "children": []}, {"id": "o3", "markdown": "Requests the Secretary-General to name an envoy for humanitarian access and to report to the Council within ninety days.", "children": []}]}'::jsonb,
  pg_temp.walk_moment(-2, '19:30')
)
on conflict do nothing;

insert into public.motions (
  id, committee_id, session_id, proposed_by_seat_id, kind, topic, status,
  votes_for, votes_against, decided_at, created_at, paper_id
)
select
  'fc000000-0000-4000-8000-000000000162', paper.committee_id, 'fb000000-0000-4000-8000-000000000161',
  'f9000000-0000-4000-8000-000000000516', 'introduce_document', 'Draft resolution 1.1', 'passed',
  6, 0, pg_temp.walk_moment(-2, '19:47'), pg_temp.walk_moment(-2, '19:45'), paper.id
from public.committee_papers as paper
where paper.id = 'f0000000-0000-4000-8000-000000000702'
  and paper.status = 'approved'
on conflict (id) do nothing;

update public.committee_papers
set status = 'introduced',
    introduced_at = pg_temp.walk_moment(-2, '19:47'),
    introduced_by_motion_id = 'fc000000-0000-4000-8000-000000000162'
where id = 'f0000000-0000-4000-8000-000000000702'
  and status = 'approved';

-- Its amendments, each based on the version that was latest when it was
-- proposed. Amendments 2 and 3 are inserted as approved, waiting for their
-- votes, and settled after them.
insert into public.amendments (
  id, paper_id, sequence, proposed_by_seat_id, action, target_part, target_clause_id,
  text_markdown, status, is_friendly, based_on_version_id, created_at, decided_at
)
values
  ('f0000000-0000-4000-8000-000000000901', 'f0000000-0000-4000-8000-000000000702', 1, 'f9000000-0000-4000-8000-000000000511',
    'change', 'operative', 'o3',
    'Requests the Secretary-General to name an envoy for humanitarian access and to report to the Council within sixty days.',
    'written_in', true, 'f0000000-0000-4000-8000-000000000802', pg_temp.walk_moment(-2, '19:50'), pg_temp.walk_moment(-2, '19:56')),
  ('f0000000-0000-4000-8000-000000000902', 'f0000000-0000-4000-8000-000000000702', 2, 'f9000000-0000-4000-8000-000000000513',
    'add', 'operative', 'o2',
    'Calls upon all parties to agree the routes of aid convoys with the United Nations in advance;',
    'approved', false, 'f0000000-0000-4000-8000-000000000802', pg_temp.walk_moment(-2, '19:51'), null),
  ('f0000000-0000-4000-8000-000000000903', 'f0000000-0000-4000-8000-000000000702', 3, 'f9000000-0000-4000-8000-000000000511',
    'change', 'operative', 'o1',
    'Calls upon all parties to let aid convoys pass checkpoints without delay;',
    'approved', false, 'f0000000-0000-4000-8000-000000000802', pg_temp.walk_moment(-2, '19:52'), null)
on conflict (id) do nothing;

-- The sponsors other than the proposer are asked (propose_amendment): all
-- three said yes to amendment 1, and France's no made 2 and 3 unfriendly, so
-- the others were not asked again. A second delegation signed each of those.
insert into public.amendment_seats (amendment_id, seat_id, role, accepts, answered_at, added_at)
values
  ('f0000000-0000-4000-8000-000000000901', 'f9000000-0000-4000-8000-000000000512', 'sponsor_answer', true, pg_temp.walk_moment(-2, '19:52'), pg_temp.walk_moment(-2, '19:50')),
  ('f0000000-0000-4000-8000-000000000901', 'f9000000-0000-4000-8000-000000000516', 'sponsor_answer', true, pg_temp.walk_moment(-2, '19:53'), pg_temp.walk_moment(-2, '19:50')),
  ('f0000000-0000-4000-8000-000000000901', 'f9000000-0000-4000-8000-000000000515', 'sponsor_answer', true, pg_temp.walk_moment(-2, '19:54'), pg_temp.walk_moment(-2, '19:50')),
  ('f0000000-0000-4000-8000-000000000902', 'f9000000-0000-4000-8000-000000000512', 'sponsor_answer', false, pg_temp.walk_moment(-2, '19:53'), pg_temp.walk_moment(-2, '19:51')),
  ('f0000000-0000-4000-8000-000000000902', 'f9000000-0000-4000-8000-000000000516', 'sponsor_answer', null, null, pg_temp.walk_moment(-2, '19:51')),
  ('f0000000-0000-4000-8000-000000000902', 'f9000000-0000-4000-8000-000000000515', 'sponsor_answer', null, null, pg_temp.walk_moment(-2, '19:51')),
  ('f0000000-0000-4000-8000-000000000902', 'f9000000-0000-4000-8000-000000000514', 'signatory', null, null, pg_temp.walk_moment(-2, '19:55')),
  ('f0000000-0000-4000-8000-000000000903', 'f9000000-0000-4000-8000-000000000512', 'sponsor_answer', false, pg_temp.walk_moment(-2, '19:54'), pg_temp.walk_moment(-2, '19:52')),
  ('f0000000-0000-4000-8000-000000000903', 'f9000000-0000-4000-8000-000000000516', 'sponsor_answer', null, null, pg_temp.walk_moment(-2, '19:52')),
  ('f0000000-0000-4000-8000-000000000903', 'f9000000-0000-4000-8000-000000000515', 'sponsor_answer', null, null, pg_temp.walk_moment(-2, '19:52')),
  ('f0000000-0000-4000-8000-000000000903', 'f9000000-0000-4000-8000-000000000513', 'signatory', null, null, pg_temp.walk_moment(-2, '19:56'))
on conflict do nothing;

-- Amendment 1 written in: version 2.
insert into public.committee_paper_versions (id, paper_id, version_number, content, amendment_id, created_at)
select
  'f0000000-0000-4000-8000-000000000803', amendment.paper_id, 2,
  public.apply_amendment_to_content(
    previous.content, amendment.action, amendment.target_part, amendment.target_clause_id,
    amendment.text_markdown, 'a' || amendment.sequence
  ),
  amendment.id, amendment.decided_at
from public.amendments as amendment
join public.committee_paper_versions as previous on previous.id = 'f0000000-0000-4000-8000-000000000802'
where amendment.id = 'f0000000-0000-4000-8000-000000000901'
on conflict do nothing;

-- The votes on amendments 2 and 3, by show of hands. A vote on an amendment
-- names the amendment and nothing else (votes_on_one_thing), and
-- votes_check_paper writes its subject, "Amendment 2 to Draft resolution 1.1".
insert into public.votes (
  id, committee_id, session_id, kind, method, majority, status,
  votes_for, votes_against, votes_abstain, passed, opened_at, closed_at, amendment_id
)
select
  vote.id::uuid, paper.committee_id, 'fb000000-0000-4000-8000-000000000161', 'substantive',
  'show_of_hands', 'simple', 'closed',
  vote.votes_for, vote.votes_against, vote.votes_abstain, vote.passed,
  vote.opened_at, vote.closed_at, amendment.id
from (
  values
    ('f0000000-0000-4000-8000-000000000411', 'f0000000-0000-4000-8000-000000000902', 4, 1, 1, true,
      pg_temp.walk_moment(-2, '20:00'), pg_temp.walk_moment(-2, '20:03')),
    ('f0000000-0000-4000-8000-000000000412', 'f0000000-0000-4000-8000-000000000903', 2, 3, 1, false,
      pg_temp.walk_moment(-2, '20:04'), pg_temp.walk_moment(-2, '20:07'))
) as vote (id, amendment_id, votes_for, votes_against, votes_abstain, passed, opened_at, closed_at)
join public.amendments as amendment on amendment.id = vote.amendment_id::uuid
join public.committee_papers as paper on paper.id = amendment.paper_id
where amendment.status = 'approved'
  and paper.status = 'introduced'
on conflict (id) do nothing;

-- What the votes decided, as votes_settle_paper writes it: the passed new
-- clause is version 3, where it is clause 3, under the id a2.
update public.amendments as amendment
set status = case when vote.passed then 'passed' else 'failed' end::public.amendment_status,
    decided_at = vote.closed_at
from public.votes as vote
where vote.amendment_id = amendment.id
  and amendment.id in ('f0000000-0000-4000-8000-000000000902', 'f0000000-0000-4000-8000-000000000903')
  and amendment.status = 'approved';

insert into public.committee_paper_versions (id, paper_id, version_number, content, amendment_id, created_at)
select
  'f0000000-0000-4000-8000-000000000804', amendment.paper_id, 3,
  public.apply_amendment_to_content(
    previous.content, amendment.action, amendment.target_part, amendment.target_clause_id,
    amendment.text_markdown, 'a' || amendment.sequence
  ),
  amendment.id, amendment.decided_at
from public.amendments as amendment
join public.committee_paper_versions as previous on previous.id = 'f0000000-0000-4000-8000-000000000803'
where amendment.id = 'f0000000-0000-4000-8000-000000000902'
on conflict do nothing;

-- The vote on the draft itself, and the resolution it made. A vote on a paper
-- names the paper (votes.paper_id), which is how the record copy finds it.
insert into public.votes (
  id, committee_id, session_id, kind, method, majority, status,
  votes_for, votes_against, votes_abstain, passed, opened_at, closed_at, paper_id
)
select
  'f0000000-0000-4000-8000-000000000413', paper.committee_id, 'fb000000-0000-4000-8000-000000000161', 'substantive',
  'show_of_hands', 'simple', 'closed',
  5, 0, 1, true, pg_temp.walk_moment(-2, '20:10'), pg_temp.walk_moment(-2, '20:13'), paper.id
from public.committee_papers as paper
where paper.id = 'f0000000-0000-4000-8000-000000000702'
  and paper.status = 'introduced'
on conflict (id) do nothing;

update public.committee_papers
set status = 'passed',
    decided_at = pg_temp.walk_moment(-2, '20:13'),
    decided_by = 'f5000000-0000-4000-8000-000000000011',
    updated_at = pg_temp.walk_moment(-2, '20:13')
where id = 'f0000000-0000-4000-8000-000000000702'
  and status = 'introduced';


-- -----------------------------------------------------------------------------
-- Running today's papers: Draft resolution 1.2, on the floor
-- -----------------------------------------------------------------------------
-- The United Kingdom's draft, with France and the United States, signed by
-- Brazil and China, introduced after 1.1 passed. Its amendments end every way
-- an amendment can, and five from this morning are still waiting, one in each
-- of the waiting statuses (two with the dais, to reorder):
--    1  France: strike clause 4. Friendly, written in (version 2).
--    2  Russian Federation: change clause 4. Declined by the United Kingdom,
--       collecting support, then lapsed when clause 4 was struck.
--    3  Brazil: change clause 1. Passed, 4 to 2 (version 3).
--    4  Russian Federation: strike clause 2. Failed, 1 to 4, with 1 abstention.
--    5  China: change clause 2. Ruled out of order.
--    6  United States: add a clause after clause 3. Withdrawn while the other
--       sponsors were still being asked.
--    7  China: change clause 2. Asking the sponsors; France has accepted, the
--       United Kingdom and the United States have not answered.
--    8  Russian Federation: strike clause 3. Declined by the United Kingdom;
--       collecting support, with no other delegation behind it yet.
--    9  Brazil: add a clause after clause 3. With the dais, first in the queue.
--   10  Russian Federation: change the last clause. With the dais, second.
--   11  China: change clause 1. Approved, waiting for its vote.
-- James (the United Kingdom) has amendment 7 to answer, Fiona the queue.
insert into public.committee_papers (
  id, committee_id, kind, status, title, topic, started_by_seat_id, lead_seat_id,
  preamble_markdown, operative_markdown, updated_by, created_at, updated_at
)
values (
  'f0000000-0000-4000-8000-000000000703', 'f3000000-0000-4000-8000-000000000051', 'draft_resolution', 'writing',
  'Humanitarian pauses', 'Humanitarian access in armed conflict',
  'f9000000-0000-4000-8000-000000000514', 'f9000000-0000-4000-8000-000000000514',
  E'Reaffirming the principles of humanity, neutrality, impartiality and independence,\n\n'
    || E'Deeply concerned that civilians cannot reach food, water and medical care while fighting continues,\n\n'
    || 'Noting that pauses agreed in advance have let aid reach besieged towns,',
  E'1. Calls for humanitarian pauses of at least four hours each day in areas of active fighting;\n'
    || E'2. Urges all parties to agree the times and places of each pause with the United Nations in advance;\n'
    || E'3. Requests that the parties keep open the routes aid convoys use during a pause;\n'
    || E'4. Encourages Member States to fund the monitoring of pauses;\n'
    || '5. Decides to remain seized of the matter.',
  'f5000000-0000-4000-8000-000000000061', pg_temp.walk_moment(-2, '18:40'), pg_temp.walk_moment(-2, '19:30')
)
on conflict (id) do nothing;

insert into public.committee_paper_seats (paper_id, seat_id, role, added_at)
select paper.id, paper_seat.seat_id::uuid, paper_seat.role::public.paper_seat_role, paper_seat.added_at
from public.committee_papers as paper
cross join (
  values
    ('f9000000-0000-4000-8000-000000000514', 'author', pg_temp.walk_moment(-2, '18:40')),
    ('f9000000-0000-4000-8000-000000000512', 'author', pg_temp.walk_moment(-2, '18:42')),
    ('f9000000-0000-4000-8000-000000000515', 'author', pg_temp.walk_moment(-2, '18:43')),
    ('f9000000-0000-4000-8000-000000000516', 'signatory', pg_temp.walk_moment(-2, '19:20')),
    ('f9000000-0000-4000-8000-000000000511', 'signatory', pg_temp.walk_moment(-2, '19:22'))
) as paper_seat (seat_id, role, added_at)
where paper.id = 'f0000000-0000-4000-8000-000000000703'
  and paper.status = 'writing'
on conflict do nothing;

update public.committee_papers
set status = 'approved',
    submitted_at = pg_temp.walk_moment(-2, '19:35'),
    topic_number = 1,
    sequence = 2,
    decided_at = pg_temp.walk_moment(-2, '20:15'),
    decided_by = 'f5000000-0000-4000-8000-000000000011'
where id = 'f0000000-0000-4000-8000-000000000703'
  and status = 'writing';

insert into public.committee_paper_versions (id, paper_id, version_number, content, created_at)
values (
  'f0000000-0000-4000-8000-000000000805', 'f0000000-0000-4000-8000-000000000703', 1,
  '{"preamble": [{"id": "p1", "markdown": "Reaffirming the principles of humanity, neutrality, impartiality and independence,"}, {"id": "p2", "markdown": "Deeply concerned that civilians cannot reach food, water and medical care while fighting continues,"}, {"id": "p3", "markdown": "Noting that pauses agreed in advance have let aid reach besieged towns,"}], "operative": [{"id": "o1", "markdown": "Calls for humanitarian pauses of at least four hours each day in areas of active fighting;", "children": []}, {"id": "o2", "markdown": "Urges all parties to agree the times and places of each pause with the United Nations in advance;", "children": []}, {"id": "o3", "markdown": "Requests that the parties keep open the routes aid convoys use during a pause;", "children": []}, {"id": "o4", "markdown": "Encourages Member States to fund the monitoring of pauses;", "children": []}, {"id": "o5", "markdown": "Decides to remain seized of the matter.", "children": []}]}'::jsonb,
  pg_temp.walk_moment(-2, '19:35')
)
on conflict do nothing;

insert into public.motions (
  id, committee_id, session_id, proposed_by_seat_id, kind, topic, status,
  votes_for, votes_against, decided_at, created_at, paper_id
)
select
  'fc000000-0000-4000-8000-000000000163', paper.committee_id, 'fb000000-0000-4000-8000-000000000161',
  'f9000000-0000-4000-8000-000000000514', 'introduce_document', 'Draft resolution 1.2', 'passed',
  5, 1, pg_temp.walk_moment(-2, '20:20'), pg_temp.walk_moment(-2, '20:17'), paper.id
from public.committee_papers as paper
where paper.id = 'f0000000-0000-4000-8000-000000000703'
  and paper.status = 'approved'
on conflict (id) do nothing;

update public.committee_papers
set status = 'introduced',
    introduced_at = pg_temp.walk_moment(-2, '20:20'),
    introduced_by_motion_id = 'fc000000-0000-4000-8000-000000000163'
where id = 'f0000000-0000-4000-8000-000000000703'
  and status = 'approved';

-- Its amendments, in three inserts: each is based on the version that was
-- latest when it was proposed, and that version has to exist first. The
-- first two were proposed on the text as introduced.
insert into public.amendments (
  id, paper_id, sequence, proposed_by_seat_id, action, target_part, target_clause_id,
  text_markdown, status, is_friendly, queue_position, ruling, based_on_version_id, created_at, decided_at
)
values
  ('f0000000-0000-4000-8000-000000000911', 'f0000000-0000-4000-8000-000000000703', 1, 'f9000000-0000-4000-8000-000000000512',
    'strike', 'operative', 'o4', null,
    'written_in', true, null, null, 'f0000000-0000-4000-8000-000000000805',
    pg_temp.walk_moment(-2, '20:22'), pg_temp.walk_moment(-2, '20:27')),
  ('f0000000-0000-4000-8000-000000000912', 'f0000000-0000-4000-8000-000000000703', 2, 'f9000000-0000-4000-8000-000000000513',
    'change', 'operative', 'o4', 'Encourages Member States and regional organisations to fund the monitoring of pauses;',
    'lapsed', false, null, null, 'f0000000-0000-4000-8000-000000000805',
    pg_temp.walk_moment(-2, '20:23'), pg_temp.walk_moment(-2, '20:27'))
on conflict (id) do nothing;

-- Amendment 1 written in, which struck clause 4 and so lapsed amendment 2:
-- version 2.
insert into public.committee_paper_versions (id, paper_id, version_number, content, amendment_id, created_at)
select
  'f0000000-0000-4000-8000-000000000806', amendment.paper_id, 2,
  public.apply_amendment_to_content(
    previous.content, amendment.action, amendment.target_part, amendment.target_clause_id,
    amendment.text_markdown, 'a' || amendment.sequence
  ),
  amendment.id, amendment.decided_at
from public.amendments as amendment
join public.committee_paper_versions as previous on previous.id = 'f0000000-0000-4000-8000-000000000805'
where amendment.id = 'f0000000-0000-4000-8000-000000000911'
on conflict do nothing;

-- Amendments 3 to 5 were proposed on version 2. Amendments 3 and 4 are
-- inserted as approved and settled by their votes below, as on 1.1.
insert into public.amendments (
  id, paper_id, sequence, proposed_by_seat_id, action, target_part, target_clause_id,
  text_markdown, status, is_friendly, queue_position, ruling, based_on_version_id, created_at, decided_at
)
values
  ('f0000000-0000-4000-8000-000000000913', 'f0000000-0000-4000-8000-000000000703', 3, 'f9000000-0000-4000-8000-000000000516',
    'change', 'operative', 'o1', 'Calls for humanitarian pauses of at least six hours each day in areas of active fighting;',
    'approved', false, null, null, 'f0000000-0000-4000-8000-000000000806',
    pg_temp.walk_moment(-2, '20:29'), null),
  ('f0000000-0000-4000-8000-000000000914', 'f0000000-0000-4000-8000-000000000703', 4, 'f9000000-0000-4000-8000-000000000513',
    'strike', 'operative', 'o2', null,
    'approved', false, null, null, 'f0000000-0000-4000-8000-000000000806',
    pg_temp.walk_moment(-2, '20:30'), null),
  ('f0000000-0000-4000-8000-000000000915', 'f0000000-0000-4000-8000-000000000703', 5, 'f9000000-0000-4000-8000-000000000511',
    'change', 'operative', 'o2',
    'Urges all parties to agree the times and places of each pause with the United Nations in advance, and to fund the reconstruction of the towns concerned;',
    'out_of_order', false, null, 'Reconstruction is outside the topic on the agenda, humanitarian access.',
    'f0000000-0000-4000-8000-000000000806', pg_temp.walk_moment(-2, '20:31'), pg_temp.walk_moment(-2, '20:44'))
on conflict (id) do nothing;

insert into public.votes (
  id, committee_id, session_id, kind, method, majority, status,
  votes_for, votes_against, votes_abstain, passed, opened_at, closed_at, amendment_id
)
select
  vote.id::uuid, paper.committee_id, 'fb000000-0000-4000-8000-000000000161', 'substantive',
  'show_of_hands', 'simple', 'closed',
  vote.votes_for, vote.votes_against, vote.votes_abstain, vote.passed,
  vote.opened_at, vote.closed_at, amendment.id
from (
  values
    ('f0000000-0000-4000-8000-000000000414', 'f0000000-0000-4000-8000-000000000913', 4, 2, 0, true,
      pg_temp.walk_moment(-2, '20:34'), pg_temp.walk_moment(-2, '20:37')),
    ('f0000000-0000-4000-8000-000000000415', 'f0000000-0000-4000-8000-000000000914', 1, 4, 1, false,
      pg_temp.walk_moment(-2, '20:39'), pg_temp.walk_moment(-2, '20:42'))
) as vote (id, amendment_id, votes_for, votes_against, votes_abstain, passed, opened_at, closed_at)
join public.amendments as amendment on amendment.id = vote.amendment_id::uuid
join public.committee_papers as paper on paper.id = amendment.paper_id
where amendment.status = 'approved'
  and paper.status = 'introduced'
on conflict (id) do nothing;

update public.amendments as amendment
set status = case when vote.passed then 'passed' else 'failed' end::public.amendment_status,
    decided_at = vote.closed_at
from public.votes as vote
where vote.amendment_id = amendment.id
  and amendment.id in ('f0000000-0000-4000-8000-000000000913', 'f0000000-0000-4000-8000-000000000914')
  and amendment.status = 'approved';

-- Amendment 3 passed: version 3, the text the waiting amendments are on.
insert into public.committee_paper_versions (id, paper_id, version_number, content, amendment_id, created_at)
select
  'f0000000-0000-4000-8000-000000000807', amendment.paper_id, 3,
  public.apply_amendment_to_content(
    previous.content, amendment.action, amendment.target_part, amendment.target_clause_id,
    amendment.text_markdown, 'a' || amendment.sequence
  ),
  amendment.id, amendment.decided_at
from public.amendments as amendment
join public.committee_paper_versions as previous on previous.id = 'f0000000-0000-4000-8000-000000000806'
where amendment.id = 'f0000000-0000-4000-8000-000000000913'
on conflict do nothing;


-- Amendment 6 and this morning's five were proposed on version 3. Only an
-- amendment with the dais has a place in the queue, which counts across the
-- committee.
insert into public.amendments (
  id, paper_id, sequence, proposed_by_seat_id, action, target_part, target_clause_id,
  text_markdown, status, is_friendly, queue_position, ruling, based_on_version_id, created_at, decided_at
)
values
  ('f0000000-0000-4000-8000-000000000916', 'f0000000-0000-4000-8000-000000000703', 6, 'f9000000-0000-4000-8000-000000000515',
    'add', 'operative', 'o3', 'Asks the parties to mark the routes with the emblem of the United Nations;',
    'withdrawn', false, null, null, 'f0000000-0000-4000-8000-000000000807',
    pg_temp.walk_moment(-2, '20:45'), pg_temp.walk_moment(-2, '20:50')),
  ('f0000000-0000-4000-8000-000000000917', 'f0000000-0000-4000-8000-000000000703', 7, 'f9000000-0000-4000-8000-000000000511',
    'change', 'operative', 'o2',
    'Urges all parties to agree the times and places of each pause with the United Nations and the International Committee of the Red Cross in advance;',
    'awaiting_sponsors', false, null, null, 'f0000000-0000-4000-8000-000000000807',
    now() - interval '2 hours', null),
  ('f0000000-0000-4000-8000-000000000918', 'f0000000-0000-4000-8000-000000000703', 8, 'f9000000-0000-4000-8000-000000000513',
    'strike', 'operative', 'o3', null,
    'collecting_support', false, null, null, 'f0000000-0000-4000-8000-000000000807',
    now() - interval '1 hour 50 minutes', null),
  ('f0000000-0000-4000-8000-000000000919', 'f0000000-0000-4000-8000-000000000703', 9, 'f9000000-0000-4000-8000-000000000516',
    'add', 'operative', 'o3', 'Calls upon the parties to let medical workers travel with the convoys during a pause;',
    'with_the_dais', false, 1, null, 'f0000000-0000-4000-8000-000000000807',
    now() - interval '1 hour 40 minutes', null),
  ('f0000000-0000-4000-8000-000000000920', 'f0000000-0000-4000-8000-000000000703', 10, 'f9000000-0000-4000-8000-000000000513',
    'change', 'operative', 'o5', 'Decides to review the pauses in thirty days and to remain seized of the matter.',
    'with_the_dais', false, 2, null, 'f0000000-0000-4000-8000-000000000807',
    now() - interval '1 hour 30 minutes', null),
  ('f0000000-0000-4000-8000-000000000921', 'f0000000-0000-4000-8000-000000000703', 11, 'f9000000-0000-4000-8000-000000000511',
    'change', 'operative', 'o1',
    'Calls for humanitarian pauses of at least six hours each day in areas of active fighting and along the routes of aid convoys;',
    'approved', false, null, null, 'f0000000-0000-4000-8000-000000000807',
    now() - interval '1 hour 20 minutes', null)
on conflict (id) do nothing;

-- Who was asked and who answered, and who signed. France's own amendment
-- asked the other two sponsors, who accepted; the United States' asked the
-- United Kingdom and France, and was withdrawn before either answered.
insert into public.amendment_seats (amendment_id, seat_id, role, accepts, answered_at, added_at)
select
  seat_row.amendment_id::uuid, seat_row.seat_id::uuid, seat_row.role, seat_row.accepts,
  seat_row.answered_at, seat_row.added_at
from (
  values
    -- 1, France
    ('f0000000-0000-4000-8000-000000000911', 'f9000000-0000-4000-8000-000000000514', 'sponsor_answer', true, pg_temp.walk_moment(-2, '20:24'), pg_temp.walk_moment(-2, '20:22')),
    ('f0000000-0000-4000-8000-000000000911', 'f9000000-0000-4000-8000-000000000515', 'sponsor_answer', true, pg_temp.walk_moment(-2, '20:25'), pg_temp.walk_moment(-2, '20:22')),
    -- 2, the Russian Federation
    ('f0000000-0000-4000-8000-000000000912', 'f9000000-0000-4000-8000-000000000514', 'sponsor_answer', false, pg_temp.walk_moment(-2, '20:25'), pg_temp.walk_moment(-2, '20:23')),
    ('f0000000-0000-4000-8000-000000000912', 'f9000000-0000-4000-8000-000000000512', 'sponsor_answer', null, null, pg_temp.walk_moment(-2, '20:23')),
    ('f0000000-0000-4000-8000-000000000912', 'f9000000-0000-4000-8000-000000000515', 'sponsor_answer', null, null, pg_temp.walk_moment(-2, '20:23')),
    -- 3, Brazil
    ('f0000000-0000-4000-8000-000000000913', 'f9000000-0000-4000-8000-000000000514', 'sponsor_answer', false, pg_temp.walk_moment(-2, '20:30'), pg_temp.walk_moment(-2, '20:29')),
    ('f0000000-0000-4000-8000-000000000913', 'f9000000-0000-4000-8000-000000000512', 'sponsor_answer', null, null, pg_temp.walk_moment(-2, '20:29')),
    ('f0000000-0000-4000-8000-000000000913', 'f9000000-0000-4000-8000-000000000515', 'sponsor_answer', null, null, pg_temp.walk_moment(-2, '20:29')),
    ('f0000000-0000-4000-8000-000000000913', 'f9000000-0000-4000-8000-000000000511', 'signatory', null, null, pg_temp.walk_moment(-2, '20:31')),
    -- 4, the Russian Federation
    ('f0000000-0000-4000-8000-000000000914', 'f9000000-0000-4000-8000-000000000514', 'sponsor_answer', false, pg_temp.walk_moment(-2, '20:32'), pg_temp.walk_moment(-2, '20:30')),
    ('f0000000-0000-4000-8000-000000000914', 'f9000000-0000-4000-8000-000000000512', 'sponsor_answer', null, null, pg_temp.walk_moment(-2, '20:30')),
    ('f0000000-0000-4000-8000-000000000914', 'f9000000-0000-4000-8000-000000000515', 'sponsor_answer', null, null, pg_temp.walk_moment(-2, '20:30')),
    ('f0000000-0000-4000-8000-000000000914', 'f9000000-0000-4000-8000-000000000511', 'signatory', null, null, pg_temp.walk_moment(-2, '20:33')),
    -- 5, China
    ('f0000000-0000-4000-8000-000000000915', 'f9000000-0000-4000-8000-000000000514', 'sponsor_answer', false, pg_temp.walk_moment(-2, '20:33'), pg_temp.walk_moment(-2, '20:31')),
    ('f0000000-0000-4000-8000-000000000915', 'f9000000-0000-4000-8000-000000000512', 'sponsor_answer', null, null, pg_temp.walk_moment(-2, '20:31')),
    ('f0000000-0000-4000-8000-000000000915', 'f9000000-0000-4000-8000-000000000515', 'sponsor_answer', null, null, pg_temp.walk_moment(-2, '20:31')),
    ('f0000000-0000-4000-8000-000000000915', 'f9000000-0000-4000-8000-000000000513', 'signatory', null, null, pg_temp.walk_moment(-2, '20:34')),
    -- 6, the United States
    ('f0000000-0000-4000-8000-000000000916', 'f9000000-0000-4000-8000-000000000514', 'sponsor_answer', null, null, pg_temp.walk_moment(-2, '20:45')),
    ('f0000000-0000-4000-8000-000000000916', 'f9000000-0000-4000-8000-000000000512', 'sponsor_answer', null, null, pg_temp.walk_moment(-2, '20:45')),
    -- 7, China, this morning
    ('f0000000-0000-4000-8000-000000000917', 'f9000000-0000-4000-8000-000000000514', 'sponsor_answer', null, null, now() - interval '2 hours'),
    ('f0000000-0000-4000-8000-000000000917', 'f9000000-0000-4000-8000-000000000512', 'sponsor_answer', true, now() - interval '1 hour 45 minutes', now() - interval '2 hours'),
    ('f0000000-0000-4000-8000-000000000917', 'f9000000-0000-4000-8000-000000000515', 'sponsor_answer', null, null, now() - interval '2 hours'),
    -- 8, the Russian Federation
    ('f0000000-0000-4000-8000-000000000918', 'f9000000-0000-4000-8000-000000000514', 'sponsor_answer', false, now() - interval '1 hour 40 minutes', now() - interval '1 hour 50 minutes'),
    ('f0000000-0000-4000-8000-000000000918', 'f9000000-0000-4000-8000-000000000512', 'sponsor_answer', null, null, now() - interval '1 hour 50 minutes'),
    ('f0000000-0000-4000-8000-000000000918', 'f9000000-0000-4000-8000-000000000515', 'sponsor_answer', null, null, now() - interval '1 hour 50 minutes'),
    -- 9, Brazil
    ('f0000000-0000-4000-8000-000000000919', 'f9000000-0000-4000-8000-000000000514', 'sponsor_answer', false, now() - interval '1 hour 35 minutes', now() - interval '1 hour 40 minutes'),
    ('f0000000-0000-4000-8000-000000000919', 'f9000000-0000-4000-8000-000000000512', 'sponsor_answer', null, null, now() - interval '1 hour 40 minutes'),
    ('f0000000-0000-4000-8000-000000000919', 'f9000000-0000-4000-8000-000000000515', 'sponsor_answer', null, null, now() - interval '1 hour 40 minutes'),
    ('f0000000-0000-4000-8000-000000000919', 'f9000000-0000-4000-8000-000000000511', 'signatory', null, null, now() - interval '1 hour 32 minutes'),
    -- 10, the Russian Federation
    ('f0000000-0000-4000-8000-000000000920', 'f9000000-0000-4000-8000-000000000514', 'sponsor_answer', null, null, now() - interval '1 hour 30 minutes'),
    ('f0000000-0000-4000-8000-000000000920', 'f9000000-0000-4000-8000-000000000512', 'sponsor_answer', null, null, now() - interval '1 hour 30 minutes'),
    ('f0000000-0000-4000-8000-000000000920', 'f9000000-0000-4000-8000-000000000515', 'sponsor_answer', false, now() - interval '1 hour 25 minutes', now() - interval '1 hour 30 minutes'),
    ('f0000000-0000-4000-8000-000000000920', 'f9000000-0000-4000-8000-000000000516', 'signatory', null, null, now() - interval '1 hour 22 minutes'),
    -- 11, China
    ('f0000000-0000-4000-8000-000000000921', 'f9000000-0000-4000-8000-000000000514', 'sponsor_answer', false, now() - interval '1 hour 15 minutes', now() - interval '1 hour 20 minutes'),
    ('f0000000-0000-4000-8000-000000000921', 'f9000000-0000-4000-8000-000000000512', 'sponsor_answer', null, null, now() - interval '1 hour 20 minutes'),
    ('f0000000-0000-4000-8000-000000000921', 'f9000000-0000-4000-8000-000000000515', 'sponsor_answer', null, null, now() - interval '1 hour 20 minutes'),
    ('f0000000-0000-4000-8000-000000000921', 'f9000000-0000-4000-8000-000000000513', 'signatory', null, null, now() - interval '1 hour 10 minutes')
) as seat_row (amendment_id, seat_id, role, accepts, answered_at, added_at)
on conflict do nothing;

update public.committee_papers
set updated_at = pg_temp.walk_moment(-2, '20:37')
where id = 'f0000000-0000-4000-8000-000000000703'
  and updated_at < pg_temp.walk_moment(-2, '20:37');


-- -----------------------------------------------------------------------------
-- Running today's papers: a bloc's working paper, being written
-- -----------------------------------------------------------------------------
-- The United Kingdom, France and the United States are writing it together
-- this morning, so James, Camille and Emily can each open it and see the
-- others' changes. Its live document (committee_paper_documents, below) is
-- the editor's own Yjs state, made with $lib/paper-document.ts from the text
-- below, with one suggestion in it: Emily's, to report every three months
-- instead of six.
-- That suggestion is dated in the state itself, so the time is written in
-- here as text, in place of the 2000-01-01 the state was made with. The
-- marks round the opening phrases are the authors' own, typed in the editor.
-- Four comment threads: Camille's question, which James answered; Emily's,
-- which James resolved; Camille's comment on the suggestion; and Emily's on
-- the whole paper.
insert into public.committee_papers (
  id, committee_id, kind, status, title, topic, started_by_seat_id, lead_seat_id,
  body_markdown, revision, updated_by, created_at, updated_at
)
values (
  'f0000000-0000-4000-8000-000000000704', 'f3000000-0000-4000-8000-000000000051', 'working_paper', 'writing',
  'Protecting medical care in armed conflict', 'Humanitarian access in armed conflict',
  'f9000000-0000-4000-8000-000000000514', 'f9000000-0000-4000-8000-000000000514',
  E'*Recalling* the Geneva Conventions of 1949 and their Additional Protocols,\n\n'
    || E'*Gravely concerned* by attacks on hospitals, ambulances and medical workers in armed conflict,\n\n'
    || E'1. ++Demands++ that all parties to armed conflict respect and protect medical workers, their transport and their facilities;\n'
    || E'2. ++Requests++ the Secretary-General to report to the Council every six months on attacks on medical care;\n'
    || '3. ++Encourages++ Member States to train their armed forces in the protection of medical missions.',
  12,
  'f5000000-0000-4000-8000-000000000065', now() - interval '3 hours', now() - interval '40 minutes'
)
on conflict (id) do nothing;

-- Its live document, in committee_paper_documents since
-- 20261022143000_committee_papers_security: its authors read it while they write.
insert into public.committee_paper_documents (paper_id, document_state, updated_at)
select
  paper.id,
  decode(
    replace(
      '0226db8a92cd070028010570617065720473656564017d9b95a49a0f07010764656661756c7403097061726167726170'
      || '680700db8a92cd0701060600db8a92cd0702066974616c6963027b7d84db8a92cd070309526563616c6c696e6786db8a'
      || '92cd070c066974616c6963046e756c6c84db8a92cd070d3f207468652047656e65766120436f6e76656e74696f6e7320'
      || '6f66203139343920616e64207468656972204164646974696f6e616c2050726f746f636f6c732c87db8a92cd07010309'
      || '7061726167726170680700db8a92cd074d060600db8a92cd074e066974616c6963027b7d84db8a92cd074f1147726176'
      || '656c7920636f6e6365726e656486db8a92cd0760066974616c6963046e756c6c84db8a92cd07614b2062792061747461'
      || '636b73206f6e20686f73706974616c732c20616d62756c616e63657320616e64206d65646963616c20776f726b657273'
      || '20696e2061726d656420636f6e666c6963742c87db8a92cd074d030b6f7264657265644c6973740700db8a92cd07ad01'
      || '03086c6973744974656d0700db8a92cd07ae0103097061726167726170680700db8a92cd07af01060600db8a92cd07b0'
      || '0109756e6465726c696e65027b7d84db8a92cd07b1010744656d616e647386db8a92cd07b80109756e6465726c696e65'
      || '046e756c6c84db8a92cd07b9016e207468617420616c6c207061727469657320746f2061726d656420636f6e666c6963'
      || '74207265737065637420616e642070726f74656374206d65646963616c20776f726b6572732c20746865697220747261'
      || '6e73706f727420616e6420746865697220666163696c69746965733b87db8a92cd07ae0103086c6973744974656d0700'
      || 'db8a92cd07a80203097061726167726170680700db8a92cd07a902060600db8a92cd07aa0209756e6465726c696e6502'
      || '7b7d84db8a92cd07ab0208526571756573747386db8a92cd07b30209756e6465726c696e65046e756c6c84db8a92cd07'
      || 'b4023620746865205365637265746172792d47656e6572616c20746f207265706f727420746f2074686520436f756e63'
      || '696c2065766572792084db8a92cd07ea020373697884db8a92cd07ed0223206d6f6e746873206f6e2061747461636b73'
      || '206f6e206d65646963616c20636172653b87db8a92cd07a80203086c6973744974656d0700db8a92cd07910303097061'
      || '726167726170680700db8a92cd079203060600db8a92cd07930309756e6465726c696e65027b7d84db8a92cd0794030a'
      || '456e636f75726167657386db8a92cd079e0309756e6465726c696e65046e756c6c84db8a92cd079f0351204d656d6265'
      || '722053746174657320746f20747261696e2074686569722061726d656420666f7263657320696e207468652070726f74'
      || '656374696f6e206f66206d65646963616c206d697373696f6e732e2800db8a92cd07ad01057374617274017d010686c0'
      || 'df750087db8a92cd07ad010309706172616772617068c4db8a92cd07ed02db8a92cd07ee02057468726565c6db8a92cd'
      || '07ea02db8a92cd07eb021173756767657374656444656c6574696f6e7d7b226964223a2235653665373139632d646632'
      || '392d343437332d613339392d646438356339663062613437222c22757365724964223a2266353030303030302d303030'
      || '302d343030302d383030302d303030303030303030303635222c226174223a22323030302d30312d30315430303a3030'
      || '3a30302e3030305a227dc6db8a92cd07ed0286c0df75011173756767657374656444656c6574696f6e046e756c6cc686'
      || 'c0df750786c0df750112737567676573746564496e73657274696f6e7d7b226964223a2235653665373139632d646632'
      || '392d343437332d613339392d646438356339663062613437222c22757365724964223a2266353030303030302d303030'
      || '302d343030302d383030302d303030303030303030303635222c226174223a22323030302d30312d30315430303a3030'
      || '3a30302e3030305a227dc686c0df7505db8a92cd07ee0212737567676573746564496e73657274696f6e046e756c6c00',
      encode(convert_to('2000-01-01T00:00:00.000Z', 'UTF8'), 'hex'),
      encode(
        convert_to(
          to_char((now() - interval '40 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS".000Z"'),
          'UTF8'
        ),
        'hex'
      )
    ),
    'hex'
  ),
  now() - interval '40 minutes'
from public.committee_papers as paper
where paper.id = 'f0000000-0000-4000-8000-000000000704'
on conflict (paper_id) do nothing;

insert into public.committee_paper_seats (paper_id, seat_id, role, added_at)
select paper.id, paper_seat.seat_id::uuid, paper_seat.role::public.paper_seat_role, paper_seat.added_at
from public.committee_papers as paper
cross join (
  values
    ('f9000000-0000-4000-8000-000000000514', 'author', now() - interval '3 hours'),
    ('f9000000-0000-4000-8000-000000000512', 'author', now() - interval '2 hours 55 minutes'),
    ('f9000000-0000-4000-8000-000000000515', 'author', now() - interval '2 hours 55 minutes')
) as paper_seat (seat_id, role, added_at)
where paper.id = 'f0000000-0000-4000-8000-000000000704'
  and paper.status = 'writing'
on conflict do nothing;

-- A thread on a passage keeps where its words are as two Yjs positions
-- (anchor_start, anchor_end), read from the same state, and the words
-- themselves; one on the suggestion keeps the sentence its card says.
insert into public.paper_comment_threads (
  id, committee_paper_id, anchor_fragment, anchor_start, anchor_end, quoted_text,
  started_by, started_by_seat_id, suggestion_id, resolved_at, resolved_by, created_at
)
values
  ('f0000000-0000-4000-8000-000000000501', 'f0000000-0000-4000-8000-000000000704', 'body',
    'ANuKks0H8QFB', 'ANuKks0HpgJB', 'medical workers, their transport and their facilities',
    'f5000000-0000-4000-8000-000000000063', 'f9000000-0000-4000-8000-000000000512', null, null, null,
    now() - interval '1 hour 10 minutes'),
  ('f0000000-0000-4000-8000-000000000502', 'f0000000-0000-4000-8000-000000000704', 'body',
    'AtuKks0HTkE=', 'ANuKks0HYEE=', 'Gravely concerned',
    'f5000000-0000-4000-8000-000000000065', 'f9000000-0000-4000-8000-000000000515', null,
    now() - interval '50 minutes', 'f5000000-0000-4000-8000-000000000061',
    now() - interval '1 hour 5 minutes'),
  ('f0000000-0000-4000-8000-000000000503', 'f0000000-0000-4000-8000-000000000704', 'body',
    'ANuKks0H6gJB', 'AIbA33UFQQ==', 'Replace ‘six’ with ‘three’',
    'f5000000-0000-4000-8000-000000000063', 'f9000000-0000-4000-8000-000000000512',
    '5e6e719c-df29-4473-a399-dd85c9f0ba47', null, null,
    now() - interval '35 minutes'),
  ('f0000000-0000-4000-8000-000000000504', 'f0000000-0000-4000-8000-000000000704', 'body',
    null, null, null,
    'f5000000-0000-4000-8000-000000000065', 'f9000000-0000-4000-8000-000000000515', null, null, null,
    now() - interval '30 minutes')
on conflict (id) do nothing;

insert into public.paper_comments (id, thread_id, written_by, body, created_at)
values
  ('f0000000-0000-4000-8000-000000000551', 'f0000000-0000-4000-8000-000000000501', 'f5000000-0000-4000-8000-000000000063',
    'Should this name the Red Cross and Red Crescent emblems as well?', now() - interval '1 hour 10 minutes'),
  ('f0000000-0000-4000-8000-000000000552', 'f0000000-0000-4000-8000-000000000501', 'f5000000-0000-4000-8000-000000000061',
    'Yes. I will add a clause on the emblems after the break.', now() - interval '1 hour'),
  ('f0000000-0000-4000-8000-000000000553', 'f0000000-0000-4000-8000-000000000502', 'f5000000-0000-4000-8000-000000000065',
    '"Deeply concerned" would match the Council''s earlier resolutions.', now() - interval '1 hour 5 minutes'),
  ('f0000000-0000-4000-8000-000000000554', 'f0000000-0000-4000-8000-000000000502', 'f5000000-0000-4000-8000-000000000061',
    'Kept "Gravely": the attacks are the point of the paper.', now() - interval '52 minutes'),
  ('f0000000-0000-4000-8000-000000000555', 'f0000000-0000-4000-8000-000000000503', 'f5000000-0000-4000-8000-000000000063',
    'Every three months is a great deal of reporting. Could we live with six?', now() - interval '35 minutes'),
  ('f0000000-0000-4000-8000-000000000556', 'f0000000-0000-4000-8000-000000000504', 'f5000000-0000-4000-8000-000000000065',
    'Ready to submit once the emblems clause is in?', now() - interval '30 minutes')
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- Running today's papers: a draft open for signatures
-- -----------------------------------------------------------------------------
-- China's, with the Russian Federation. Nobody has signed it yet, so James
-- can sign it as the United Kingdom. Its live document is empty: the editor
-- makes one from the text the first time an author opens it.
-- keep_signatures_opened_at dates the opening now(), whatever is written.
insert into public.committee_papers (
  id, committee_id, kind, status, title, topic, started_by_seat_id, lead_seat_id,
  preamble_markdown, operative_markdown, is_open_for_signatures, updated_by, created_at, updated_at
)
values (
  'f0000000-0000-4000-8000-000000000705', 'f3000000-0000-4000-8000-000000000051', 'draft_resolution', 'writing',
  'Consent of the host State', 'Humanitarian access in armed conflict',
  'f9000000-0000-4000-8000-000000000511', 'f9000000-0000-4000-8000-000000000511',
  E'Reaffirming the sovereignty, territorial integrity and political independence of all States,\n\n'
    || 'Bearing in mind that humanitarian assistance is given with the consent of the State concerned,',
  E'1. Calls upon all parties to ask the consent of the host State before aid crosses its borders;\n'
    || '2. Requests the Secretary-General to help host States and aid agencies agree the routes of convoys.',
  true, 'f5000000-0000-4000-8000-000000000062', now() - interval '2 hours 30 minutes', now() - interval '1 hour'
)
on conflict (id) do nothing;

insert into public.committee_paper_seats (paper_id, seat_id, role, added_at)
select paper.id, paper_seat.seat_id::uuid, paper_seat.role::public.paper_seat_role, paper_seat.added_at
from public.committee_papers as paper
cross join (
  values
    ('f9000000-0000-4000-8000-000000000511', 'author', now() - interval '2 hours 30 minutes'),
    ('f9000000-0000-4000-8000-000000000513', 'author', now() - interval '2 hours 20 minutes')
) as paper_seat (seat_id, role, added_at)
where paper.id = 'f0000000-0000-4000-8000-000000000705'
  and paper.status = 'writing'
on conflict do nothing;


-- -----------------------------------------------------------------------------
-- Running today's papers: ECOFIN, run to THIMUN procedure
-- -----------------------------------------------------------------------------
-- A new committee of "running today", chaired by Pieter de Vries
-- (walk.chair.thimun). Its settings are what "THIMUN" sets in the committee's
-- settings (apply_committee_procedure): no working papers, three submitters
-- and co-submitters to submit, no friendly amendments, amendments to
-- amendments. India and Nigeria wrote a draft resolution that Barbados
-- signed, and it waits for Pieter. Japan's seat is empty. No session has
-- started.
insert into public.committees (
  id, conference_id, slug, name, abbreviation, description, topics, room, position, level,
  crisis_allows_resolutions, paper_words, has_working_papers, sponsor_limit, support_minimum,
  support_unit, support_counts_sponsors, one_sponsorship_per_topic, has_friendly_amendments,
  amendment_support_minimum, amendment_support_unit, preamble_amendable,
  has_second_degree_amendments, checks_format
)
values (
  'f3000000-0000-4000-8000-000000000053', 'f2000000-0000-4000-8000-000000000005', 'ecofin',
  'Economic and Financial Committee', 'ECOFIN',
  'The Second Committee of the General Assembly, run to THIMUN procedure.',
  array['Debt relief for climate-vulnerable States'], 'Room 3', 2, 'intermediate',
  false, 'submitters', false, null, 3,
  'seats', true, false, false,
  0, 'seats', false,
  true, true
)
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- Running today's papers: ExComm, a crisis committee
-- -----------------------------------------------------------------------------
-- The Executive Committee of the National Security Council, in October 1962,
-- chaired by Catherine Doyle (walk.chair.crisis). Its delegates are
-- characters, not countries. Ahmed Karim (walk.crisis.staff) is its crisis
-- staff, the backroom: he holds only answer_directives, through a Crisis
-- staff role of the conference, and answers its directives and press releases
-- at /conferences/northbridge-running-today/committees/excomm/crisis.
insert into public.committees (
  id, conference_id, slug, name, abbreviation, description, topics, room, position, level, format
)
values (
  'f3000000-0000-4000-8000-000000000054', 'f2000000-0000-4000-8000-000000000005', 'excomm',
  'Executive Committee of the National Security Council', 'ExComm',
  'The President''s advisers in October 1962. A crisis committee: its members are characters, and the crisis staff answer their directives.',
  array['The Cuban Missile Crisis'], 'Room 4', 3, 'advanced', 'crisis'
)
on conflict (id) do nothing;

insert into public.committee_chairs (committee_id, user_id, title, created_at)
values
  ('f3000000-0000-4000-8000-000000000053', 'f5000000-0000-4000-8000-000000000014', 'Chair', pg_temp.walk_moment(-60, '10:00')),
  ('f3000000-0000-4000-8000-000000000054', 'f5000000-0000-4000-8000-000000000015', 'Chair', pg_temp.walk_moment(-60, '10:00'))
on conflict do nothing;

-- The chairs' role, as for the other chairs above, which ran before these
-- committees existed.
insert into public.conference_role_members (conference_id, user_id, role_id)
select committee.conference_id, chair.user_id, role.id
from public.committee_chairs as chair
join public.committees as committee on committee.id = chair.committee_id
join public.conference_roles as role
  on role.conference_id = committee.conference_id
 and role.name = 'Chair'
where chair.committee_id in (
  'f3000000-0000-4000-8000-000000000053',
  'f3000000-0000-4000-8000-000000000054'
)
on conflict do nothing;

-- The Crisis staff role docs/committee-papers.md (section 8) expects a
-- conference with a backroom to make: answer_directives and nothing else,
-- across the conference, whose only crisis committee is ExComm. It goes
-- between Chair and Volunteer.
insert into public.conference_roles (conference_id, name, position, scope, permissions, is_public)
values (
  'f2000000-0000-4000-8000-000000000005', 'Crisis staff', 2, 'conference',
  array['answer_directives']::public.permission[], false
)
on conflict do nothing;

update public.conference_roles
set position = 3
where conference_id = 'f2000000-0000-4000-8000-000000000005'
  and name = 'Volunteer'
  and position = 2;

insert into public.conference_staff (conference_id, user_id, title, created_at)
values (
  'f2000000-0000-4000-8000-000000000005', 'f5000000-0000-4000-8000-000000000022',
  'Crisis staff, ExComm', pg_temp.walk_moment(-30, '10:00')
)
on conflict do nothing;

insert into public.conference_role_members (conference_id, user_id, role_id)
values (
  'f2000000-0000-4000-8000-000000000005', 'f5000000-0000-4000-8000-000000000022',
  pg_temp.walk_role('f2000000-0000-4000-8000-000000000005', 'Crisis staff')
)
on conflict do nothing;

-- The six delegates applied alone and were accepted, as everybody else in
-- "running today" was, and each seat points at its application.
insert into public.applications (
  id, conference_id, user_id, status, committee_preferences, seat_preferences, motivation,
  answers, submitted_at, decided_at, decided_by, decision_note, created_at
)
select
  application.id,
  'f2000000-0000-4000-8000-000000000005',
  application.user_id,
  'accepted',
  array[application.committee_id]::uuid[],
  null,
  'I would like a seat in this committee.',
  '{}'::jsonb,
  application.submitted_at,
  application.submitted_at + interval '20 days',
  'f5000000-0000-4000-8000-000000000001',
  null,
  application.submitted_at - interval '30 minutes'
from (
  values
    -- ECOFIN
    ('f6000000-0000-4000-8000-000000000512'::uuid, 'f5000000-0000-4000-8000-000000000101'::uuid, 'f3000000-0000-4000-8000-000000000053'::uuid, pg_temp.walk_moment(-68, '18:30')),
    ('f6000000-0000-4000-8000-000000000513'::uuid, 'f5000000-0000-4000-8000-000000000102'::uuid, 'f3000000-0000-4000-8000-000000000053'::uuid, pg_temp.walk_moment(-66, '11:00')),
    ('f6000000-0000-4000-8000-000000000514'::uuid, 'f5000000-0000-4000-8000-000000000103'::uuid, 'f3000000-0000-4000-8000-000000000053'::uuid, pg_temp.walk_moment(-65, '20:15')),
    -- ExComm
    ('f6000000-0000-4000-8000-000000000515'::uuid, 'f5000000-0000-4000-8000-000000000111'::uuid, 'f3000000-0000-4000-8000-000000000054'::uuid, pg_temp.walk_moment(-64, '09:40')),
    ('f6000000-0000-4000-8000-000000000516'::uuid, 'f5000000-0000-4000-8000-000000000112'::uuid, 'f3000000-0000-4000-8000-000000000054'::uuid, pg_temp.walk_moment(-62, '16:05')),
    ('f6000000-0000-4000-8000-000000000517'::uuid, 'f5000000-0000-4000-8000-000000000113'::uuid, 'f3000000-0000-4000-8000-000000000054'::uuid, pg_temp.walk_moment(-61, '13:50'))
) as application (id, user_id, committee_id, submitted_at)
on conflict (id) do nothing;

insert into public.seats (id, committee_id, name, kind, country_code, position, user_id, application_id, allocated_at)
values
  -- ECOFIN, with Japan's seat still empty
  ('f9000000-0000-4000-8000-000000000531', 'f3000000-0000-4000-8000-000000000053', 'Barbados', 'country', 'BB', 1, 'f5000000-0000-4000-8000-000000000101', 'f6000000-0000-4000-8000-000000000512', pg_temp.walk_moment(-28, '10:00')),
  ('f9000000-0000-4000-8000-000000000532', 'f3000000-0000-4000-8000-000000000053', 'India', 'country', 'IN', 2, 'f5000000-0000-4000-8000-000000000102', 'f6000000-0000-4000-8000-000000000513', pg_temp.walk_moment(-28, '10:00')),
  ('f9000000-0000-4000-8000-000000000533', 'f3000000-0000-4000-8000-000000000053', 'Nigeria', 'country', 'NG', 3, 'f5000000-0000-4000-8000-000000000103', 'f6000000-0000-4000-8000-000000000514', pg_temp.walk_moment(-28, '10:00')),
  ('f9000000-0000-4000-8000-000000000534', 'f3000000-0000-4000-8000-000000000053', 'Japan', 'country', 'JP', 4, null, null, null),
  -- ExComm, characters, with the Director of Central Intelligence still empty
  ('f9000000-0000-4000-8000-000000000541', 'f3000000-0000-4000-8000-000000000054', 'Secretary of Defense', 'character', null, 1, 'f5000000-0000-4000-8000-000000000111', 'f6000000-0000-4000-8000-000000000515', pg_temp.walk_moment(-28, '10:00')),
  ('f9000000-0000-4000-8000-000000000542', 'f3000000-0000-4000-8000-000000000054', 'Secretary of State', 'character', null, 2, 'f5000000-0000-4000-8000-000000000112', 'f6000000-0000-4000-8000-000000000516', pg_temp.walk_moment(-28, '10:00')),
  ('f9000000-0000-4000-8000-000000000543', 'f3000000-0000-4000-8000-000000000054', 'Attorney General', 'character', null, 3, 'f5000000-0000-4000-8000-000000000113', 'f6000000-0000-4000-8000-000000000517', pg_temp.walk_moment(-28, '10:00')),
  ('f9000000-0000-4000-8000-000000000544', 'f3000000-0000-4000-8000-000000000054', 'Director of Central Intelligence', 'character', null, 4, null, null, null)
on conflict (id) do nothing;

-- ECOFIN's draft, submitted yesterday afternoon: India and Nigeria are its
-- submitters, India the main one, and Barbados signed, which is the three
-- the committee asks for. Pieter has not decided it yet.
insert into public.committee_papers (
  id, committee_id, kind, status, title, topic, started_by_seat_id, lead_seat_id,
  preamble_markdown, operative_markdown, updated_by, created_at, updated_at
)
values (
  'f0000000-0000-4000-8000-000000000731', 'f3000000-0000-4000-8000-000000000053', 'draft_resolution', 'writing',
  'Debt pauses after natural disasters', 'Debt relief for climate-vulnerable States',
  'f9000000-0000-4000-8000-000000000532', 'f9000000-0000-4000-8000-000000000532',
  E'Recognising that many small island developing States spend more on servicing debt than on adapting to climate change,\n\n'
    || 'Noting with concern that a single hurricane can destroy a year of output of a small economy,',
  E'1. Calls upon creditors to write into their loans a pause in repayments after a natural disaster;\n'
    || E'2. Invites the international financial institutions to exchange part of the debt of climate-vulnerable States for investment in adaptation;\n'
    || '3. Requests the Secretary-General to report on progress to the Second Committee at its next session.',
  'f5000000-0000-4000-8000-000000000102', pg_temp.walk_moment(-1, '13:00'), pg_temp.walk_moment(-1, '16:10')
)
on conflict (id) do nothing;

insert into public.committee_paper_seats (paper_id, seat_id, role, added_at)
select paper.id, paper_seat.seat_id::uuid, paper_seat.role::public.paper_seat_role, paper_seat.added_at
from public.committee_papers as paper
cross join (
  values
    ('f9000000-0000-4000-8000-000000000532', 'author', pg_temp.walk_moment(-1, '13:00')),
    ('f9000000-0000-4000-8000-000000000533', 'author', pg_temp.walk_moment(-1, '13:05')),
    ('f9000000-0000-4000-8000-000000000531', 'signatory', pg_temp.walk_moment(-1, '16:00'))
) as paper_seat (seat_id, role, added_at)
where paper.id = 'f0000000-0000-4000-8000-000000000731'
  and paper.status = 'writing'
on conflict do nothing;

update public.committee_papers
set status = 'submitted',
    submitted_at = pg_temp.walk_moment(-1, '16:30')
where id = 'f0000000-0000-4000-8000-000000000731'
  and status = 'writing';

insert into public.committee_paper_versions (id, paper_id, version_number, content, created_at)
values (
  'f0000000-0000-4000-8000-000000000831', 'f0000000-0000-4000-8000-000000000731', 1,
  '{"preamble": [{"id": "p1", "markdown": "Recognising that many small island developing States spend more on servicing debt than on adapting to climate change,"}, {"id": "p2", "markdown": "Noting with concern that a single hurricane can destroy a year of output of a small economy,"}], "operative": [{"id": "o1", "markdown": "Calls upon creditors to write into their loans a pause in repayments after a natural disaster;", "children": []}, {"id": "o2", "markdown": "Invites the international financial institutions to exchange part of the debt of climate-vulnerable States for investment in adaptation;", "children": []}, {"id": "o3", "markdown": "Requests the Secretary-General to report on progress to the Second Committee at its next session.", "children": []}]}'::jsonb,
  pg_temp.walk_moment(-1, '16:30')
)
on conflict do nothing;


-- -----------------------------------------------------------------------------
-- Running today's papers: ExComm's day of directives
-- -----------------------------------------------------------------------------
-- Session 1 ran yesterday afternoon. The committee passed Committee directive
-- 1.1, the naval quarantine, which now waits on the crisis desk for Ahmed's
-- answer. Ahmed answered the Secretaries' joint directive (carried out),
-- refused the Attorney General's personal directive, and published the
-- Secretary of State's press release; the Secretary of Defense's personal
-- directive and the Attorney General's press release came in later and are
-- waiting. His last crisis update is on the room's live view.
insert into public.committee_sessions (id, committee_id, name, status, started_at, ended_at, created_at)
values (
  'fb000000-0000-4000-8000-000000000171',
  'f3000000-0000-4000-8000-000000000054',
  'Session 1',
  'ended',
  pg_temp.walk_moment(-1, '14:00'),
  pg_temp.walk_moment(-1, '17:00'),
  pg_temp.walk_moment(-1, '14:00')
)
on conflict (id) do nothing;

-- A committee directive has operative clauses only. The others are free
-- text, in body_markdown.
insert into public.committee_papers (
  id, committee_id, kind, status, title, topic, started_by_seat_id, lead_seat_id,
  body_markdown, operative_markdown, updated_by, created_at, updated_at
)
values
  ('f0000000-0000-4000-8000-000000000751', 'f3000000-0000-4000-8000-000000000054', 'committee_directive', 'writing',
    'Naval quarantine of Cuba', 'The Cuban Missile Crisis',
    'f9000000-0000-4000-8000-000000000541', 'f9000000-0000-4000-8000-000000000541',
    null,
    E'1. Directs the Secretary of Defense to place a naval quarantine around Cuba and to stop and search every ship that may carry offensive weapons;\n'
      || E'2. Instructs the Secretary of State to ask the Organization of American States to support the quarantine;\n'
      || '3. Requests that the President announce the quarantine to the nation this evening.',
    'f5000000-0000-4000-8000-000000000111', pg_temp.walk_moment(-1, '14:05'), pg_temp.walk_moment(-1, '14:25')),
  ('f0000000-0000-4000-8000-000000000752', 'f3000000-0000-4000-8000-000000000054', 'joint_directive', 'writing',
    'Reconnaissance flights over Cuba', null,
    'f9000000-0000-4000-8000-000000000541', 'f9000000-0000-4000-8000-000000000541',
    'The Secretary of Defense and the Secretary of State ask for two U-2 flights over the western half of the island at first light, and for the photographs to reach this committee by noon.',
    null,
    'f5000000-0000-4000-8000-000000000111', pg_temp.walk_moment(-1, '14:30'), pg_temp.walk_moment(-1, '14:50')),
  ('f0000000-0000-4000-8000-000000000753', 'f3000000-0000-4000-8000-000000000054', 'personal_directive', 'writing',
    'A private meeting with the Soviet ambassador', null,
    'f9000000-0000-4000-8000-000000000543', 'f9000000-0000-4000-8000-000000000543',
    'The Attorney General asks to meet Ambassador Dobrynin alone tonight, at the Department of Justice, with no note taken.',
    null,
    'f5000000-0000-4000-8000-000000000113', pg_temp.walk_moment(-1, '15:00'), pg_temp.walk_moment(-1, '15:10')),
  ('f0000000-0000-4000-8000-000000000754', 'f3000000-0000-4000-8000-000000000054', 'personal_directive', 'writing',
    'Two squadrons to Florida', null,
    'f9000000-0000-4000-8000-000000000541', 'f9000000-0000-4000-8000-000000000541',
    'The Secretary of Defense orders two squadrons of fighter-bombers to Homestead Air Force Base, ready to fly within the hour.',
    null,
    'f5000000-0000-4000-8000-000000000111', pg_temp.walk_moment(-1, '16:25'), pg_temp.walk_moment(-1, '16:30')),
  ('f0000000-0000-4000-8000-000000000755', 'f3000000-0000-4000-8000-000000000054', 'press_release', 'writing',
    'The United States asks the OAS to meet', null,
    'f9000000-0000-4000-8000-000000000542', 'f9000000-0000-4000-8000-000000000542',
    'The Secretary of State has asked the Council of the Organization of American States to meet tomorrow morning on the threat to the hemisphere.',
    null,
    'f5000000-0000-4000-8000-000000000112', pg_temp.walk_moment(-1, '15:20'), pg_temp.walk_moment(-1, '15:30')),
  ('f0000000-0000-4000-8000-000000000756', 'f3000000-0000-4000-8000-000000000054', 'press_release', 'writing',
    'No decision has been taken', null,
    'f9000000-0000-4000-8000-000000000543', 'f9000000-0000-4000-8000-000000000543',
    'The Attorney General says that the Executive Committee is still meeting and that no decision on Cuba has been taken.',
    null,
    'f5000000-0000-4000-8000-000000000113', pg_temp.walk_moment(-1, '16:45'), pg_temp.walk_moment(-1, '16:50'))
on conflict (id) do nothing;

-- A joint directive has two authors or more; the directive also has the
-- Attorney General's signature.
insert into public.committee_paper_seats (paper_id, seat_id, role, added_at)
select paper.id, paper_seat.seat_id::uuid, paper_seat.role::public.paper_seat_role, paper_seat.added_at
from (
  values
    ('f0000000-0000-4000-8000-000000000751', 'f9000000-0000-4000-8000-000000000541', 'author', pg_temp.walk_moment(-1, '14:05')),
    ('f0000000-0000-4000-8000-000000000751', 'f9000000-0000-4000-8000-000000000542', 'author', pg_temp.walk_moment(-1, '14:06')),
    ('f0000000-0000-4000-8000-000000000751', 'f9000000-0000-4000-8000-000000000543', 'signatory', pg_temp.walk_moment(-1, '14:20')),
    ('f0000000-0000-4000-8000-000000000752', 'f9000000-0000-4000-8000-000000000541', 'author', pg_temp.walk_moment(-1, '14:30')),
    ('f0000000-0000-4000-8000-000000000752', 'f9000000-0000-4000-8000-000000000542', 'author', pg_temp.walk_moment(-1, '14:32')),
    ('f0000000-0000-4000-8000-000000000753', 'f9000000-0000-4000-8000-000000000543', 'author', pg_temp.walk_moment(-1, '15:00')),
    ('f0000000-0000-4000-8000-000000000754', 'f9000000-0000-4000-8000-000000000541', 'author', pg_temp.walk_moment(-1, '16:25')),
    ('f0000000-0000-4000-8000-000000000755', 'f9000000-0000-4000-8000-000000000542', 'author', pg_temp.walk_moment(-1, '15:20')),
    ('f0000000-0000-4000-8000-000000000756', 'f9000000-0000-4000-8000-000000000543', 'author', pg_temp.walk_moment(-1, '16:45'))
) as paper_seat (paper_id, seat_id, role, added_at)
join public.committee_papers as paper on paper.id = paper_seat.paper_id::uuid
where paper.status = 'writing'
on conflict do nothing;

-- Sent to the crisis staff, and answered or not. Ahmed decided the answered
-- ones; a press release that is published needs no answer.
update public.committee_papers as paper
set status = sent.status::public.paper_status,
    submitted_at = sent.submitted_at,
    answer_markdown = sent.answer,
    decided_at = sent.decided_at,
    decided_by = case when sent.decided_at is not null then 'f5000000-0000-4000-8000-000000000022'::uuid end
from (
  values
    ('f0000000-0000-4000-8000-000000000752', 'carried_out', pg_temp.walk_moment(-1, '14:50'),
      'Two U-2 flights went over the island at dawn. The photographs show eight more launch sites under construction.',
      pg_temp.walk_moment(-1, '15:40')),
    ('f0000000-0000-4000-8000-000000000753', 'refused', pg_temp.walk_moment(-1, '15:10'),
      'The President will not open a private channel yet. The ambassador is not told of the request.',
      pg_temp.walk_moment(-1, '15:50')),
    ('f0000000-0000-4000-8000-000000000754', 'submitted', pg_temp.walk_moment(-1, '16:30'), null, null),
    ('f0000000-0000-4000-8000-000000000755', 'published', pg_temp.walk_moment(-1, '15:30'), null,
      pg_temp.walk_moment(-1, '15:45')),
    ('f0000000-0000-4000-8000-000000000756', 'submitted', pg_temp.walk_moment(-1, '16:50'), null, null)
) as sent (id, status, submitted_at, answer, decided_at)
where paper.id = sent.id::uuid
  and paper.status = 'writing';

-- What submit_paper keeps of each: version 1, the text sent.
insert into public.committee_paper_versions (id, paper_id, version_number, content, created_at)
select
  ('f0000000-0000-4000-8000-0000000008' || right(paper.id::text, 2))::uuid, paper.id, 1,
  jsonb_build_object('markdown', paper.body_markdown), paper.submitted_at
from public.committee_papers as paper
where paper.id in (
  'f0000000-0000-4000-8000-000000000752',
  'f0000000-0000-4000-8000-000000000753',
  'f0000000-0000-4000-8000-000000000754',
  'f0000000-0000-4000-8000-000000000755',
  'f0000000-0000-4000-8000-000000000756'
)
on conflict do nothing;

-- The committee directive goes through the dais and a vote, as a draft
-- resolution does.
update public.committee_papers
set status = 'approved',
    submitted_at = pg_temp.walk_moment(-1, '14:25'),
    topic_number = 1,
    sequence = 1,
    decided_at = pg_temp.walk_moment(-1, '14:35'),
    decided_by = 'f5000000-0000-4000-8000-000000000015'
where id = 'f0000000-0000-4000-8000-000000000751'
  and status = 'writing';

insert into public.committee_paper_versions (id, paper_id, version_number, content, created_at)
values (
  'f0000000-0000-4000-8000-000000000851', 'f0000000-0000-4000-8000-000000000751', 1,
  '{"preamble": [], "operative": [{"id": "o1", "markdown": "Directs the Secretary of Defense to place a naval quarantine around Cuba and to stop and search every ship that may carry offensive weapons;", "children": []}, {"id": "o2", "markdown": "Instructs the Secretary of State to ask the Organization of American States to support the quarantine;", "children": []}, {"id": "o3", "markdown": "Requests that the President announce the quarantine to the nation this evening.", "children": []}]}'::jsonb,
  pg_temp.walk_moment(-1, '14:25')
)
on conflict do nothing;

insert into public.motions (
  id, committee_id, session_id, proposed_by_seat_id, kind, topic, status,
  votes_for, votes_against, decided_at, created_at, paper_id
)
select
  'fc000000-0000-4000-8000-000000000171', paper.committee_id, 'fb000000-0000-4000-8000-000000000171',
  'f9000000-0000-4000-8000-000000000541', 'introduce_document', 'Committee directive 1.1', 'passed',
  3, 0, pg_temp.walk_moment(-1, '14:42'), pg_temp.walk_moment(-1, '14:40'), paper.id
from public.committee_papers as paper
where paper.id = 'f0000000-0000-4000-8000-000000000751'
  and paper.status = 'approved'
on conflict (id) do nothing;

update public.committee_papers
set status = 'introduced',
    introduced_at = pg_temp.walk_moment(-1, '14:42'),
    introduced_by_motion_id = 'fc000000-0000-4000-8000-000000000171'
where id = 'f0000000-0000-4000-8000-000000000751'
  and status = 'approved';

insert into public.votes (
  id, committee_id, session_id, kind, method, majority, status,
  votes_for, votes_against, votes_abstain, passed, opened_at, closed_at, paper_id
)
select
  'f0000000-0000-4000-8000-000000000416', paper.committee_id, 'fb000000-0000-4000-8000-000000000171', 'substantive',
  'show_of_hands', 'simple', 'closed',
  3, 0, 0, true, pg_temp.walk_moment(-1, '15:00'), pg_temp.walk_moment(-1, '15:02'), paper.id
from public.committee_papers as paper
where paper.id = 'f0000000-0000-4000-8000-000000000751'
  and paper.status = 'introduced'
on conflict (id) do nothing;

update public.committee_papers
set status = 'passed',
    decided_at = pg_temp.walk_moment(-1, '15:02'),
    decided_by = 'f5000000-0000-4000-8000-000000000015'
where id = 'f0000000-0000-4000-8000-000000000751'
  and status = 'introduced';

-- Ahmed's last crisis update, as send_crisis_update leaves it.
update public.committee_state
set crisis_update = 'Soviet ships have stopped short of the quarantine line. One, the Poltava, is still moving.',
    crisis_update_at = pg_temp.walk_moment(-1, '16:40')
where committee_id = 'f3000000-0000-4000-8000-000000000054'
  and crisis_update is null;


-- -----------------------------------------------------------------------------
-- Invitations
-- -----------------------------------------------------------------------------
-- One of each state. An invitation is a link, /invites/<token>, that the
-- organiser copies and sends; the app sends no email. Pending ones go to an
-- existing account (Noor, who gets a notification for it from the
-- invites_notify_invite trigger) and to three addresses with no account yet,
-- which a tester can sign up as to accept. One has expired, and Tom accepted
-- his three weeks ago, which is how he became a volunteer at "running today".
-- A token is 32 letters and digits, and every address is lowercase.
-- A conference invitation names its role by id (the preset the conference
-- got when it was inserted); an organisation invitation still names its role
-- by word.
insert into public.invites (
  id, kind, organization_id, conference_id, committee_id, email, role, role_id, title, token,
  invited_by, expires_at, accepted_at, accepted_by, created_at
)
values
  ('f0000000-0000-4000-8000-000000000201', 'conference_staff', null,
    'f2000000-0000-4000-8000-000000000004', null, 'walk.newcomer@example.test', null,
    pg_temp.walk_role('f2000000-0000-4000-8000-000000000004', 'Volunteer'),
    'Registration desk', 'WalkInviteVolunteerNoorRahman001',
    'f5000000-0000-4000-8000-000000000002', pg_temp.walk_moment(13, '15:00'), null, null,
    pg_temp.walk_moment(-1, '15:00')),
  ('f0000000-0000-4000-8000-000000000202', 'organization_member',
    'f1000000-0000-4000-8000-000000000001', null, null, 'new.admin@example.test', 'admin', null,
    null, 'WalkInviteOrganisationMember0002',
    'f5000000-0000-4000-8000-000000000001', pg_temp.walk_moment(11, '11:00'), null, null,
    pg_temp.walk_moment(-3, '11:00')),
  ('f0000000-0000-4000-8000-000000000203', 'conference_staff', null,
    'f2000000-0000-4000-8000-000000000003', 'f3000000-0000-4000-8000-000000000031',
    'guest.chair@example.test', null,
    pg_temp.walk_role('f2000000-0000-4000-8000-000000000003', 'Chair'),
    null, 'WalkInviteChairEconomicSocial003',
    'f5000000-0000-4000-8000-000000000001', pg_temp.walk_moment(12, '09:30'), null, null,
    pg_temp.walk_moment(-2, '09:30')),
  ('f0000000-0000-4000-8000-000000000204', 'conference_staff', null,
    'f2000000-0000-4000-8000-000000000004', null, 'late.volunteer@example.test', null,
    pg_temp.walk_role('f2000000-0000-4000-8000-000000000004', 'Volunteer'),
    'Cloakroom', 'WalkInviteExpiredVolunteer000004',
    'f5000000-0000-4000-8000-000000000002', pg_temp.walk_moment(-6, '14:00'), null, null,
    pg_temp.walk_moment(-20, '14:00')),
  ('f0000000-0000-4000-8000-000000000205', 'conference_staff', null,
    'f2000000-0000-4000-8000-000000000005', null, 'walk.volunteer.live@example.test', null,
    pg_temp.walk_role('f2000000-0000-4000-8000-000000000005', 'Volunteer'),
    'Runner', 'WalkInviteAcceptedTomHughes00005',
    'f5000000-0000-4000-8000-000000000002', pg_temp.walk_moment(-7, '10:00'),
    pg_temp.walk_moment(-20, '18:30'), 'f5000000-0000-4000-8000-000000000021',
    pg_temp.walk_moment(-21, '10:00'))
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------
-- The invoice and announcement triggers above dated their notifications now().
-- They are moved back to when their invoice or announcement came out, and left
-- unread, so each account's bell has something in it to try.
update public.notifications as notification
set created_at = invoice.created_at
from public.invoices as invoice
where invoice.conference_id = 'f2000000-0000-4000-8000-000000000004'
  and notification.link_path = '/invoices/' || invoice.id
  and notification.kind = 'invoice_created';

update public.notifications as notification
set created_at = announcement.published_at
from public.announcements as announcement
where announcement.conference_id in (
    'f2000000-0000-4000-8000-000000000004',
    'f2000000-0000-4000-8000-000000000005'
  )
  and notification.link_path like '%announcement=' || announcement.id
  and notification.kind = 'announcement';

-- The first invoice of Harbour View College was made void, and Andrew has
-- already read that one.
update public.notifications
set read_at = created_at + interval '1 hour'
where link_path = '/invoices/f8000000-0000-4000-8000-000000000408'
  and kind = 'invoice_created';

-- The invitation trigger dated Noor's and Tom's notifications now() as well.
-- They go back to when the invitation was sent; Tom's is read, since he has
-- accepted it.
update public.notifications as notification
set
  created_at = invite.created_at,
  read_at = invite.accepted_at
from public.invites as invite
where invite.id in (
    'f0000000-0000-4000-8000-000000000201',
    'f0000000-0000-4000-8000-000000000205'
  )
  and notification.link_path = '/invites/' || invite.token
  and notification.kind = 'invite_received';

-- The other notifications come from triggers that fire when a row changes
-- (an application decided, a seat given, a paper reviewed, an invoice paid),
-- and this file inserts every row already in its final state, so none of them
-- fired. They are written here instead, with the same wording and links the
-- triggers use, dated when the change happened. Anything more than a week
-- old was read an hour after it came; the rest is still unread.
--
-- `not exists` keeps a second run of this file from adding each one again.
create temporary table walk_notifications (
  user_id uuid,
  conference_id uuid,
  kind public.notification_kind,
  title text,
  link_path text,
  created_at timestamptz
);

-- Applications decided (notify_application_decided).
insert into walk_notifications
select
  application.user_id,
  application.conference_id,
  'application_decided',
  'Your application to ' || conference.name || ' was '
    || case application.status
      when 'accepted' then 'accepted'
      when 'waitlisted' then 'waitlisted'
      else 'not accepted'
    end,
  '/applications/' || application.id,
  application.decided_at
from public.applications as application
join public.conferences as conference on conference.id = application.conference_id
where conference.organization_id = 'f1000000-0000-4000-8000-000000000001'
  and application.status in ('accepted', 'rejected', 'waitlisted')
  and application.decided_at is not null;

-- Delegation requests decided, sent to the head (notify_delegation_decided).
insert into walk_notifications
select
  head.user_id,
  delegation.conference_id,
  'delegation_decided',
  'Your delegation request for ' || conference.name || ' was '
    || case delegation.status when 'accepted' then 'accepted' else 'not accepted' end,
  '/delegations/' || delegation.id,
  delegation.decided_at
from public.delegations as delegation
join public.conferences as conference on conference.id = delegation.conference_id
join public.delegation_members as head
  on head.delegation_id = delegation.id and head.role = 'head'
where conference.organization_id = 'f1000000-0000-4000-8000-000000000001'
  and delegation.status in ('accepted', 'rejected')
  and delegation.decided_at is not null;

-- Seats given to a delegate who applied alone (notify_seat_allocated), and
-- seats a head gave a member of their delegation
-- (notify_delegation_seat_assigned).
insert into walk_notifications
select
  seat.user_id,
  conference.id,
  case when seat.delegation_id is null then 'seat_allocated' else 'delegation_seat_assigned' end::public.notification_kind,
  case when seat.delegation_id is null then 'You represent ' else 'You were assigned ' end
    || seat.name || ' in ' || committee.name,
  '/conferences/' || conference.slug || '/committees/' || committee.slug,
  seat.allocated_at
from public.seats as seat
join public.committees as committee on committee.id = seat.committee_id
join public.conferences as conference on conference.id = committee.conference_id
where conference.organization_id = 'f1000000-0000-4000-8000-000000000001'
  and seat.user_id is not null
  and seat.allocated_at is not null;

-- Position papers approved or sent back (notify_document_reviewed).
insert into walk_notifications
select
  paper.uploaded_by,
  paper.conference_id,
  'document_reviewed',
  'Your position paper for ' || committee.name || ' was '
    || case paper.review_status when 'approved' then 'approved' else 'sent back for changes' end,
  '/conferences/' || conference.slug || '/committees/' || committee.slug || '/position-paper',
  paper.reviewed_at
from public.documents as paper
join public.committees as committee on committee.id = paper.committee_id
join public.conferences as conference on conference.id = paper.conference_id
where conference.organization_id = 'f1000000-0000-4000-8000-000000000001'
  and paper.review_status in ('approved', 'changes_requested')
  and paper.reviewed_at is not null;

-- Invoices paid (notify_invoice_paid).
insert into walk_notifications
select
  invoice.payer_user_id,
  invoice.conference_id,
  'invoice_paid',
  'Payment received for ' || invoice.number,
  '/invoices/' || invoice.id,
  invoice.paid_at
from public.invoices as invoice
join public.conferences as conference on conference.id = invoice.conference_id
where conference.organization_id = 'f1000000-0000-4000-8000-000000000001'
  and invoice.status = 'paid'
  and invoice.paid_at is not null;

-- Eleanor moved the delegates' social of "running today" this morning, which
-- notify_schedule_changed tells everybody at the conference about except the
-- person who moved it. The event itself already stands at its new time.
-- conference_audience_user_ids answers only an organiser of the conference,
-- so Eleanor is set as the signed-in user while it runs.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f5000000-0000-4000-8000-000000000001')::text,
  false
);

insert into walk_notifications
select
  recipient,
  event.conference_id,
  'schedule_changed',
  event.title || ' moved to '
    || to_char(event.starts_at at time zone conference.timezone, 'FMDD Mon, HH24:MI'),
  '/conferences/' || conference.slug || '/schedule',
  -- Two hours before the reset, so it is in the bell at whatever time of day
  -- the database was rebuilt.
  now() - interval '2 hours'
from public.schedule_events as event
join public.conferences as conference on conference.id = event.conference_id
cross join public.conference_audience_user_ids(
  event.conference_id,
  event.audience,
  event.committee_id,
  null
) as recipient
where event.id = 'f0000000-0000-4000-8000-000000000013'
  and recipient <> 'f5000000-0000-4000-8000-000000000001';

select set_config('request.jwt.claims', '', false);

insert into public.notifications (user_id, conference_id, kind, title, link_path, created_at, read_at)
select
  new_notification.user_id,
  new_notification.conference_id,
  new_notification.kind,
  new_notification.title,
  new_notification.link_path,
  new_notification.created_at,
  case
    when new_notification.created_at < now() - interval '7 days'
      then new_notification.created_at + interval '1 hour'
    else null
  end
from walk_notifications as new_notification
where not exists (
  select 1
  from public.notifications as already_sent
  where already_sent.user_id = new_notification.user_id
    and already_sent.kind = new_notification.kind
    and already_sent.link_path = new_notification.link_path
    and already_sent.title = new_notification.title
);


-- -----------------------------------------------------------------------------
-- Clean up the helpers
-- -----------------------------------------------------------------------------
drop table walk_people;
drop table walk_notifications;
drop function pg_temp.walk_moment(integer, time);
drop function pg_temp.walk_day(integer);
