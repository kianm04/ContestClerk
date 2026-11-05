# Supabase

Everything about the database lives here: the local development stack, the migrations
that define the schema, and the sample data.

## Local development

The app runs against a local Supabase in Docker, not against the cloud project. Every
developer and every test gets the same database, built from the migrations in this folder.

All commands run from `client/`:

```
pnpm db:start     # start Postgres, Auth, Storage, Realtime and Studio in Docker
pnpm db:stop      # stop them (data is kept)
pnpm db:status    # print the local URLs and keys
pnpm db:reset     # drop everything, run every migration, then the seed files
pnpm db:types     # regenerate client/src/lib/database.types.ts from the local schema
```

First time:

1. Install Docker and make sure `docker ps` works without `sudo`.
2. `pnpm install` in `client/` (this installs the Supabase CLI as a dev dependency).
3. `pnpm db:start`. The first run downloads the images and takes a few minutes.
4. Copy `client/.env.example` to `client/.env`. It already holds the local URL, the
   publishable (anon) key and the service-role key, which are the same on every machine;
   `pnpm db:status` prints them if you want to check. Leaving out
   `SUPABASE_SERVICE_ROLE_KEY`, which only the database tests read, makes `pnpm test:db`
   fail with `SUPABASE_SERVICE_ROLE_KEY is not set`.
5. `pnpm dev`.

Useful local addresses, all from `pnpm db:status`:

- Studio (table editor, SQL editor): `http://127.0.0.1:54323`
- Emails the local Auth sends (sign-up confirmations, password resets): `http://127.0.0.1:54324`

Local Auth has email confirmation switched off (`enable_confirmations = false` in
`config.toml`), so a sign-up signs in at once. The redirect URLs allow the dev server on
port 5173 and the preview server on 4173.

## Migrations

`migrations/` holds the schema as a series of SQL files that run once each, in filename
order. This is the only way the schema changes:

- Never change the database through Studio or the dashboard and leave it at that. Write a
  migration.
- Never edit a migration that has been applied anywhere. Add a new one.
- A migration holds everything for its change: tables, indexes, enums, functions,
  triggers, grants and Row Level Security policies, with comments in the style of the
  first file.
- After adding one: `pnpm db:reset`, then `pnpm db:types`, then write database tests in
  `client/tests/db/` for every new policy and function.
- `specs/02-architecture/data-model.md` and `permissions.md` describe what the schema
  must be. Keep them and the migrations in step.

The first migration recreates the tables that were made by hand in the dashboard before
September 2026. `dashboard-era/policies.sql` is the file that used to be pasted into the
SQL editor; it is kept for reference only and is superseded by the migrations.

## Sample data

`seed.sql` runs after the migrations on every `pnpm db:reset`. It gives every page
something to show and gives the database tests known rows to look for. Rows use fixed ids
in the ranges the file explains, so they are easy to recognise and safe to re-run.

It holds three organisations and eleven conferences: eight published and still to come,
one that is over, and two drafts. Every published conference still to come has committees
and seats, except Copenhagen Schools MUN 2027, which is the one left empty so the
"Committees will be announced soon." state has somewhere to appear.

### Signing in locally

The seed makes three accounts, all with the password `sample-password-123`. It is written
down on purpose: it is sample data on a throwaway local database, not a secret.

| Email                           | Who they are                                                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `sample.delegate@example.test`  | Sofia Almeida, who holds the Morocco seat in a committee of Amsterdam Open MUN 2027                                                             |
| `sample.head@example.test`      | Jasper de Vries, head of the Rotterdam Grammar Delegation                                                                                       |
| `sample.organiser@example.test` | Hugo Meijer, an owner of Sample Europe MUN Network, so `/manage` and every dashboard, applications queue and team page under it are open to him |

Sign in as the organiser to see the organiser half of the app; the other two show what a
delegate and a delegation head see.

### The demo conference

`demo-seed.sql` runs straight after `seed.sql` on the same reset, because `config.toml`
lists both under `[db.seed]`. It adds one organisation, Atlantic Debate Society, and one
conference it has already finished, Lisbon Atlantic MUN, for showing the app on a sales
call: three full committees, delegates and two school delegations, invoices, a schedule,
announcements, background guides, position papers, a played Security Council session and
published awards. Its dates are counted from the day of the reset, so the conference
always ended twelve days ago. The PDFs its documents point at are in
`media/documents/`, and the same reset uploads them into the `documents` bucket.

Every account it makes shares the password `sample-password-123`. The four to sign in as:

| Email                         | Who they are                                                             |
| ----------------------------- | ------------------------------------------------------------------------ |
| `demo.organiser@example.test` | Inês Carvalho, Secretary-General and an owner of Atlantic Debate Society |
| `demo.chair@example.test`     | Daniel Okoro, chair of the Security Council                              |
| `demo.head@example.test`      | Catarina Lopes, head of the Colégio Atlântico delegation                 |
| `demo.delegate@example.test`  | Beatriz Santos, who held France in the Security Council                  |

**Never run `demo-seed.sql` against the production project.** It writes accounts straight
into `auth.users` with a password that is printed in this file. It belongs on a local
database, or on a separate project kept only for demos. `db push` below leaves the seed
files alone unless it is given `--include-seed`, so never give it that flag.

### The walkthrough conferences

`walkthrough-seed.sql` runs third, after `demo-seed.sql`, and is for testing the app by
hand. It adds one organisation, Northbridge MUN Society, with a conference in every phase.
Each name says its phase, and the dates are counted from the day of the reset, so each
stays in its phase:

| Conference                            | What is in it                                                                                                                                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Northbridge MUN (draft)               | Not published, so only its organisers see it. One committee, no seats.                                                                                                                                                      |
| Northbridge MUN (opening soon)        | Published. Applications open in three days, and it takes them from then on its own.                                                                                                                                         |
| Northbridge MUN (applications open)   | One application in each status and two more waiting, answers to five optional questions (one of each type), an applicant under the minimum age, and three school delegations: forming, waiting for a decision, turned down. |
| Northbridge MUN (about to start)      | Starts in four days. Seats given out, invoices paid, unpaid, waived and void, a schedule, announcements, background guides, position papers, and Harbour View College, a school delegation with three seats in DISEC.       |
| Northbridge MUN (running today)       | Started yesterday. The Security Council debates its agenda (roll call taken, China speaking, a caucus proposed) after a practice session whose record is kept. SOCHUM has five delegates and no agenda yet.                 |
| Lisbon Atlantic MUN (`demo-seed.sql`) | The finished phase, with its awards published. The walkthrough does not make a second finished conference.                                                                                                                  |

Every account shares the password `sample-password-123`. Each address says the role and
the phase:

| Email                                  | Who they are                                                              | What to try                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `walk.organiser@example.test`          | Eleanor Whitfield, owner of Northbridge MUN Society, on every team        | `/manage`: publish the draft, decide Aarav's application and Riverside's delegation, mark an invoice paid |
| `walk.org.admin@example.test`          | Priya Nair, an admin of the society, on no conference's team              | What an organisation admin can manage without being on a conference's staff                               |
| `walk.organiser.upcoming@example.test` | Marcus Adeyemi, an organiser of "about to start" only, not of the society | Manage that one conference, and see that the others are not his                                           |
| `walk.usg.upcoming@example.test`       | Olivia Grant, USG delegate affairs of "about to start"                    | Decide applications and read every private detail, but not touch an invoice                               |
| `walk.finance.upcoming@example.test`   | Rohan Mehta, Finance of "about to start"                                  | The fees and invoices, and the participants' emails without their welfare details                         |
| `walk.desk.upcoming@example.test`      | Ellie Watson, the registration desk of "about to start"                   | The participants and their welfare details, and nothing else in `/manage`                                 |
| `walk.chair.live@example.test`         | Fiona Campbell, chair of the running Security Council                     | The committee room: move to the next speaker, put Brazil's motion to a vote, read the practice session    |
| `walk.chair.upcoming@example.test`     | Samuel Osei, chair of the Human Rights Council of "about to start"        | Review Mexico's position paper, written on MUNMeet, and Japan's PDF; both are waiting                     |
| `walk.chair.thimun@example.test`       | Pieter de Vries, chair of ECOFIN of "running today", run to THIMUN rules  | Approve India's draft resolution, or return it; submitters and co-submitters, no working papers           |
| `walk.chair.crisis@example.test`       | Catherine Doyle, chair of ExComm, the crisis committee of "running today" | The crisis room: the passed directive waiting for its answer, and the crisis update                       |
| `walk.crisis.staff@example.test`       | Ahmed Karim, crisis staff of ExComm, with `answer_directives` alone       | The crisis desk: answer the directive and the personal directive waiting, publish the press release       |
| `walk.volunteer.live@example.test`     | Tom Hughes, a volunteer at "running today", by an invitation he accepted  | What a volunteer on the staff can and cannot open                                                         |
| `walk.head.open@example.test`          | Rachel Morgan, head of St Aidan's Academy, a draft delegation of three    | Share the join code `NRTHBG42`, then send the delegation to the organisers                                |
| `walk.head.submitted@example.test`     | Daniel Okafor, head of Riverside Grammar School, waiting for a decision   | A delegation sent to the organisers: wait for the decision, or withdraw it                                |
| `walk.head.upcoming@example.test`      | Andrew Blake, head of Harbour View College, accepted in "about to start"  | Put Ruby in the empty seat, read the void and the unpaid group invoice, write in Zoe's shared paper       |
| `walk.delegate.live@example.test`      | James Wilson, the United Kingdom in the running Security Council          | The delegate's live view: next on the speakers' list, China speaking                                      |
| `walk.delegate.upcoming@example.test`  | Maya Thompson, Canada in the Human Rights Council of "about to start"     | Read the chair's comment and upload a new paper; see the unpaid invoice                                   |
| `walk.applicant.open@example.test`     | Aarav Patel, whose application to "applications open" is waiting          | The applicant's view of a submitted application                                                           |
| `walk.newcomer@example.test`           | Noor Rahman, who has just signed up                                       | Onboarding at `/welcome`, then the invitation to volunteer in her bell, or apply to "applications open"   |

Invitations are links (`/invites/<token>`), not emails. Three are waiting: Noor's, one to
join the society as an admin (`/invites/WalkInviteOrganisationMember0002`, for
`new.admin@example.test`) and one to chair ECOSOC of "applications open"
(`/invites/WalkInviteChairEconomicSocial003`, for `guest.chair@example.test`). Sign up as
that address to accept one. `/invites/WalkInviteExpiredVolunteer000004` has expired.

`docs/TESTING-GUIDE.md` walks through every account and feature with a checklist.

"Running today" also has a committee day of papers. In the Security Council a working
paper is introduced, Draft resolution 1.1 has passed with its amendments, 1.2 is on the
floor with amendments in every status, and James, Camille and Emily are writing a bloc's
working paper together. ECOFIN is run to THIMUN procedure, and ExComm is a crisis
committee with directives answered, refused and waiting. Sections 4.24 to 4.32 of the
guide walk through them.

The other accounts in the file, `walk.<first name>.<last name>@example.test`, fill the
seats, lists and queues. Its documents' PDFs are in `media/documents/`, next to the demo
conference's.

One of them has a position paper written on MUNMeet in progress (T145): Felix Schmidt,
`walk.felix.schmidt@example.test`, Germany in DISEC of "about to start", has a saved draft and nothing submitted yet. Sign in as Felix and open the position
paper page to see the editor carry on from the draft.

Invoices are settled by hand (bank transfer). Paying by card is left out until Stripe is
set up.

The same rule as for `demo-seed.sql` applies: **never run `walkthrough-seed.sql` against
the production project.**

## The cloud project

Nothing here talks to the cloud project until it is linked. When the time comes:

```
pnpm exec supabase --workdir .. login
pnpm exec supabase --workdir .. link --project-ref <ref>
pnpm exec supabase --workdir .. db push
```

`db push` applies the migrations in order. Because the cloud project already has hand-made
tables, reset it first from the dashboard so the migration history starts clean. Do not
reach for `db reset --linked` to do that: `[db.seed]` in `config.toml` is on, so a linked
reset would load `seed.sql`, `demo-seed.sql` and `walkthrough-seed.sql` into the real
project as well, about a hundred accounts with the published password among them. If a
reset from the command line cannot be avoided, keep the seeds out of it:

```
pnpm exec supabase --workdir .. db reset --linked --no-seed
```
