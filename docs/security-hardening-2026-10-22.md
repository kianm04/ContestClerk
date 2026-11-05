# Security hardening, 22 October 2026

What was done about the findings in `docs/security-review-2026-10-10.md`, and what is left
for the operator because it lives outside this repository: the Cloudflare dashboard, the
Mac mini's own settings, and the deploy checkout under `~/MunMeet/deploy`.

Part 1 is the operator runbook. Part 2 says what happened to every finding, package by
package.

## Part 1. Operator runbook

Everything here changes the live test site or the machine it runs on, so none of it was done
by the fixing session except where a line says so. Do the sections in order; A and B are the
ones that matter most, and together they close C1, C2, C3 and H2.

### A. Give the deploy stack its own keys and switch off what it does not need (C1, C2, C3)

The test site at `supabase-munmeet.umarbek.dev` fronts the Kong of a Supabase CLI stack
started with the CLI's built-in JWT secret, publishable key and secret key. Anyone holding the
default secret key is `service_role`. This takes the site down for about five minutes and
signs everybody out; the data is test data that is reset nightly.

1. In the deploy checkout, generate a signing key and keep it outside the repository:

   ```sh
   cd ~/MunMeet/deploy/munmeet
   client/node_modules/.bin/supabase --workdir . gen signing-key --algorithm ES256 > ~/MunMeet/deploy/signing_keys.json
   chmod 600 ~/MunMeet/deploy/signing_keys.json
   ```

2. Make three random values and put them in the deploy checkout's `.env` (the one beside
   `docker-compose.yaml`, already `chmod 600`):

   ```sh
   echo "SUPABASE_AUTH_JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n=/+')"
   echo "SUPABASE_AUTH_PUBLISHABLE_KEY=sb_publishable_$(openssl rand -base64 32 | tr -d '\n=/+')"
   echo "SUPABASE_AUTH_SECRET_KEY=sb_secret_$(openssl rand -base64 32 | tr -d '\n=/+')"
   ```

   Also change `PUBLIC_SUPABASE_PUBLISHABLE_KEY` in that file to the new publishable key:
   the app image is built with it.

3. In the deploy checkout's `supabase/config.toml` (the file `redeploy.sh` carries forward
   as a local change; `local-changes.patch` is its backup) add, under `[auth]`:

   ```toml
   signing_keys_path = "../../signing_keys.json"
   jwt_secret = "env(SUPABASE_AUTH_JWT_SECRET)"
   publishable_key = "env(SUPABASE_AUTH_PUBLISHABLE_KEY)"
   secret_key = "env(SUPABASE_AUTH_SECRET_KEY)"
   ```

   and set `[studio] enabled = false`, `[analytics] enabled = false` and
   `[local_smtp] enabled = false`. `[storage.s3_protocol] enabled = false` arrives from the
   repository with this hardening. Paths in `config.toml` are relative to the `supabase/`
   folder.

4. Restart the stack without the services the site never uses, export the values first so
   `env()` can see them, and check what it prints:

   ```sh
   set -a; source .env; set +a
   client/node_modules/.bin/supabase --workdir . stop
   client/node_modules/.bin/supabase --workdir . start -x studio,postgres-meta,logflare,vector,mailpit,edge-runtime
   client/node_modules/.bin/supabase --workdir . status
   ```

   `status` must show the new publishable and secret keys and no S3 section. Then rebuild
   and restart the app so its JavaScript carries the new publishable key:

   ```sh
   docker compose build mymun && docker compose up -d --wait
   ```

5. From another network, confirm the old keys are dead and the admin routes are gone:

   ```sh
   curl -si https://supabase-munmeet.umarbek.dev/rest/v1/conferences?select=id \
     -H 'apikey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' | head -1      # expect 401
   curl -si https://supabase-munmeet.umarbek.dev/pg/ | head -1                    # expect 4xx or 502
   curl -si https://supabase-munmeet.umarbek.dev/storage/v1/s3/ | head -1         # expect 4xx
   ```

6. Treat every session issued before this as compromised (they are, by the restart), and
   never put the new secret key anywhere but that `.env`. The CLI's default values stay in
   the repository's `client/.env.example` on purpose: they are for development stacks only.

### B. Only pass the four API paths through the tunnel (C2, C3, defence for C1)

In the Cloudflare dashboard, zone `umarbek.dev`, add a WAF custom rule for hostname
`supabase-munmeet.umarbek.dev` that blocks every request unless the path starts with one of
`/auth/v1/`, `/rest/v1/`, `/storage/v1/` or `/realtime/v1/`, and a second rule that blocks
paths starting with `/storage/v1/s3/`, `/auth/v1/admin`, `/pg/`, `/mcp`, `/rest-admin/`,
`/analytics/`, `/pooler/`, `/functions/` and `/graphql/v1` (the app does not use GraphQL).
Add a third rule that blocks any request whose `apikey` or `Authorization` header contains
`<your-supabase-secret-key>` or the legacy `service_role` JWT the CLI
prints, so a default key never reaches Kong even if a stack is ever started with it again.

### C. Stop OrbStack publishing every Docker port to the LAN (H2)

Every Supabase port of every stack on this machine is bound to `0.0.0.0`, and OrbStack
forwards them to the LAN. The deploy stack's Postgres (54422, password `postgres`), Studio
(54423) and Mailpit (54424) are reachable from any machine on the network.

```sh
orbctl config set docker.expose_ports_to_lan false
orbctl config set machines.expose_ports_to_lan false
```

then restart OrbStack. The tunnel is unaffected because it reaches Kong over the Docker
network. Check first that nothing on the LAN depends on another container's published port
(`gitetra` publishes 32768 and 32769, and the other project stacks publish their own): after
this change they are reachable from this machine only. As a second layer, the macOS
firewall is on; add a rule denying incoming connections to OrbStack Helper, or a `pf` rule
dropping 54320 to 54829 from anything but loopback. The CLI stack's `postgres` password
cannot be changed through `config.toml`, so these two rules are what protect it.

### D. Rate limits and a captcha on authentication (H5, M20, L45)

GoTrue's own rate limits never apply in this stack (the CLI sets no rate-limit header), so
the edge has to do it. In Cloudflare, rate-limiting rules:

- `supabase-munmeet.umarbek.dev`: `POST /auth/v1/verify`, `/auth/v1/recover`,
  `/auth/v1/otp`, `/auth/v1/magiclink`, `/auth/v1/signup` and `/auth/v1/token*`, each at
  about 10 requests per minute per IP, with a ten-minute block, and each with the
  condition `not ip.src eq <the deploy machine's egress IP>`. The app server reaches
  Supabase through this public hostname too (`PUBLIC_SUPABASE_URL` is compiled into the
  server bundle), so every sign-in, refresh and confirmation it makes for a visitor
  arrives from that one address. Counted there, ten wrong passwords at `/login` from one
  stranger would block sign-in for everybody for ten minutes. If that address can change,
  as a home connection's can, the rule has to be updated with it.
- `munmeet.umarbek.dev`: `POST /login`, `/register`, `/forgot-password`, `/settings`
  (changing the password and deleting the account both sign in on the server) and
  `/auth/confirm` (it confirms the code on the server), and `GET /auth/confirm`, same
  figures. These count the server's sign-ins by the visitor's
  own IP, which the rules above leave out.

Then Turnstile: create a widget for `munmeet.umarbek.dev`, put its secret in the deploy
`.env`, enable `[auth.captcha]` with `provider = "turnstile"` in the deploy `config.toml`,
and pass `captchaToken` from the login, register and forgot-password actions (a code change
to make when the keys exist; the forms work without it today).

The `/test-site` cool-down (L46) counts in the one Node process, so a container restart
resets it: keep the deploy at a single app replica, or add an edge rate limit on
`POST /test-site` as well, at the same figures. It is not in the list above because it
makes no sign-in: its limit guards the reset code, not GoTrue.

### E. Real mail, then confirmations (L36, L39, L45, H1's second half, L43, L44)

Auth mail goes to the local sink, so reset and change-email links never arrive. Configure an
SMTP provider under `[auth.email.smtp]` in the deploy `config.toml` with the credentials in
`.env`, then set `enable_confirmations = true` and `secure_password_change = true` and raise
`[auth.rate_limit] email_sent` to a real figure. The code already requires a confirmed email
to accept an invitation, so the moment confirmations are on, address squatting (H1) stops.
Until SMTP exists, leave both off: with confirmations on and no mail, nobody could sign up.

Set GoTrue's email templates to the `token_hash` shape at the same time, for example
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`,
so every emailed link lands on the new one-button `/auth/confirm` page. Every change to
`config.toml` needs a stack restart (`supabase stop` and `start`, as in A): a database reset
alone leaves the running GoTrue and Storage on their old settings.

### F. File modes and the unused tunnel certificate (L81)

Done by the fixing session on 22 October: `chmod 600` on `~/MunMeet/deploy/munmeet/.env`,
`~/MunMeet/munmeet/.env`, `~/MunMeet/munmeet/client/.env` and
`~/MunMeet/munmeet/data/tunnel/cert.pem`. Still to do: `cert.pem` can create tunnels on the
Cloudflare account and nothing uses it (the tunnel runs on `TUNNEL_TOKEN`). Revoke it in the
Cloudflare dashboard (Zero Trust, Networks, Tunnels, the account's certificate) and delete
the file.

### G. After the deploy checkout is next updated

`redeploy.sh` applies new migrations with `migration up`. The hardening adds migrations
that create guards and constraints; they were tested against fresh databases and the three
seed files, not against rows testers made on the live site. The nightly reseed wipes those
rows, so run the redeploy after 05:00 Amsterdam time, or run `reseed.sh` first.

The deploy path itself was rehearsed once, at `b1f6e395`, on the integration stack: a reset
to the schema before 22 October with that version's seed rows, then `migration up`, then the
whole database suite (1845 tests, all passed) and two browser specs. The schema it ended in
matched a fresh reset's, grants included, and every row the migrations copy arrived intact.
Two catches for anyone who repeats it. The branch's seed files write to tables only the new
migrations create (`invoice_internal_notes`, `application_internal_notes`,
`delegation_internal_notes`, `committee_paper_documents`), so the base reset needs the
`dbffc502` seeds (`git show dbffc502:supabase/seed.sql` and the two others), put back with
`git checkout` afterwards. And the seeds hold no application team, no position paper without
a review status and no pending owner invitation, so the backfills in `20261022141000`,
`20261022142000` and `20261022121000` had nothing to work on; the queries below are still the
guard for rows that were not reseeded. The migrations of the final review and
after it, `20261022170000`, `20261022170100`, `20261022170200`, `20261023120000`,
`20261023121000` and `20261023122000`, came after the rehearsal and were tested by reset
and by applying each to the development database, which held the seed rows and everything
the database tests had left there.

If the migrations ever have to run against rows that were not reseeded, these must all answer
0 first, or the `validate constraint` steps abort:

```sql
select count(*) from public.invites
  where role not in ('owner','admin','member') or char_length(email) > 254
     or char_length(token) not between 32 and 64;
select count(*) from public.conference_role_members m
  join public.conference_roles r on r.id = m.role_id where r.conference_id <> m.conference_id;
select count(*) from public.invites i
  join public.conference_roles r on r.id = i.role_id where r.conference_id <> i.conference_id;
select count(*) from public.conference_staff where char_length(title) > 80;
```

plus the queries listed in the header of
`supabase/migrations/20261022124000_conference_lifecycle_limits.sql` (slug shapes, address
schemes, text lengths). A non-zero answer to the second or third query means H4 was exploited;
repair those rows before applying. Six migrations also change data as they run:
`20261022124000` backfills `first_published_at = created_at` for conferences already published
or archived; `20261022130000` copies every invoice's note into `invoice_internal_notes` and
drops `invoices.note`; `20261022132000` copies every internal note into the new note tables
and empties the old columns; `20261022143000` copies each paper's live document into
`committee_paper_documents` and drops `committee_papers.document_state`; `20261022121000`
makes pending owner invitations unredeemable by design (M15): owners are now raised on the
organisation's members page instead; and `20261022170100` deletes every committee assignment
whose person is no longer on that conference's team (L8), so somebody taken off a team who
was still listed as a committee's chair is listed no more.

Four of the later ones need a look first:

- `20261023121000` adds `invites_token_is_url_safe` without `not valid`, so a token with
  any character but a letter, a digit, `-` or `_` aborts it. `select count(*) from
  public.invites where token !~ '^[A-Za-z0-9_-]*$'` must answer 0; the app's tokens always
  do. From then on an invitation is also refused at acceptance once its sender has left or
  lost the right to send it, so tell organisers that invitations sent by somebody who has
  since left need sending again.
- `20261023122000` adds four bounds on `profile_details` and validates each, so one row over
  a bound aborts it, naming the check. The welcome form did not bound the phone or the
  emergency contact, so on a database that has been used, run this first and trim what it
  finds: `select user_id from public.profile_details where char_length(phone) > 30 or
  char_length(emergency_contact_phone) > 30 or char_length(emergency_contact_name) > 80 or
  char_length(dietary_requirements) > 300`. It should answer no rows. A check left
  unvalidated instead would still be asked on every update of the row, so the person's
  next save of anything, and `sync_user_email` when they change their address, would fail.
- `20261022170200` deletes every committee assignment whose person has no staff row on the
  committee's conference, the way `20261022170100` did, in case a staff row was renamed or
  moved before it landed.
- `20261023120000` changes no rows; a committee with a seat reserved for a delegation can no
  longer be deleted from a browser until the reservation is freed.

Three more checks, for the later migrations:

- Before `20261022141000`, run the pre-flight query in its header. It must print no rows; a
  row it lists is over a new length bound and must be trimmed first.
- `20261022142000` sets `review_status = 'submitted'` on every position paper that has none
  before it adds its check. `select count(*) from public.documents where kind =
  'position_paper' and review_status is null` says how many it will touch.
- After the migrations, look for delegations made without a head through the old direct
  insert policy (L23), and withdraw them or give them a head:

  ```sql
  select d.id, d.conference_id, d.name, d.status, d.created_at from public.delegations d
    where not exists (select 1 from public.delegation_members m
                      where m.delegation_id = d.id and m.role = 'head');
  ```

Two migrations replace codes people may already have shared. Tell the organisers and the
delegation heads after the release: `20261022141000` gives every application team with a
code under eight characters a new one (L25), and `20261022161000` gives every delegation
with a code under ten characters a new one (L24), so the old invitation links stop working.

Tell the organisers one more thing: the team stops seeing the contact and welfare details of
people whose only link to the conference is a rejected or withdrawn application or
delegation (`20261022110000`, C4 and L19). On the seed rows that is two people for
demo.organiser and three for walk.organiser; everybody seated is still listed.

### H. Rebuild the app image and pull the pinned tunnel image (L41, L76, L77, I12)

The Content-Security-Policy is baked in at build time from `PUBLIC_SUPABASE_URL`, so the live
site only sends it after a rebuild with the public Supabase address, and the tunnel only runs
the pinned `cloudflare/cloudflared` release after a pull:

```sh
cd ~/MunMeet/deploy/munmeet
docker compose pull && docker compose up -d --build --wait
curl -sI https://munmeet.umarbek.dev/ | grep -iE 'content-security-policy|strict-transport|x-content-type|x-frame|referrer-policy|permissions-policy'
```

All six headers must appear. Then open the site in Chrome with the console open and browse a
few pages for any "Content Security Policy" line; Cloudflare passes response headers through,
but check it neither strips nor duplicates them. Once Stripe keys exist, press "Connect
Stripe" and "Open Stripe dashboard" on an organisation page and confirm Chrome lands on Stripe
(the policy's `form-action` allows `https://*.stripe.com`; the browser tests cannot exercise
that hop). After the service-role key is rotated (A), give the app container only the new key
(`SUPABASE_SERVICE_ROLE_KEY` under the app's environment in `docker-compose.yaml`, value in the
host `.env`), or the storage sweep keeps printing, once per process, that it is not
removing anything (I12). The sweep runs every fifteen minutes from the server's `init` hook
(L61): it removes replaced and deleted pictures and papers, and uploads that no row has
pointed at for an hour. Without the key, nothing is removed and people's own folders fill up
to their limit of five files.

### I. Decisions for the product owner

Nothing here is a vulnerability; each is a choice the fixing session made the conservative way
and wrote down, so it can be changed deliberately.

- **L19.** Staff lose access to an applicant's private details the moment the application is
  withdrawn or rejected. Add a grace period if the registration desk needs one. Access to
  accepted participants' details does not end with the conference: `private_details_user_ids`
  looks only at the application's and the delegation's status, so the team keeps reading
  dates of birth, phone numbers, dietary requirements and emergency contacts for as long as
  the conference exists, archived or not. Decide when it should stop, for example a set
  number of days after the end date, and it becomes a new migration with a database test.
- **I25.** `administrator` on a per-committee role holds every per-committee permission in
  the holder's committees. The code, the migration comment and the roles editor did this
  already, and `docs/roles-and-permissions.md` now says so too. If it should hold less,
  change `has_committee_permission` and the spec together.
- **M10.** An invoice can only be raised against somebody taking part (a seat, a live
  application or a delegation membership). Conference staff are not invoicable by hand any
  more; extend `invoice_payer_takes_part` if they should be.
- **Invitations.** An invitation now holds only while its sender could still send it
  (migration `20261023121000`): when an organisation admin is removed, or a team manager
  loses `manage_team`, drops below the role they offered or loses one of its permissions,
  their pending invitations stop
  working and somebody else sends them again. Every invitation also runs out after fourteen
  days at most. If invitations should survive their sender, the check in `accept_invite_row`
  is the one place to change.
- **I28.** Age limits stay advisory; there is no guardian-consent gate for under-age
  applicants. If one is wanted, consent belongs on the application.
- **L80.** The repository's `.claude/settings.json` now allows only this repository's `pnpm`
  scripts and denies reading `.env` files and `~/MunMeet/deploy`; `pnpm add`, `pnpm dlx`,
  `pnpm --dir` and `pnpm exec supabase` prompt from now on, and `.env.example` is read with
  `git show HEAD:.env.example`. `pnpm verify` runs `pnpm audit`, which needs the npm registry.

## Part 2. What happened to every finding

The fixes were made in nineteen packages. Each package was its own branch from `feature/mvp`
at `dbffc502`, with its own migration and tests, and a second agent reviewed it before it
was merged into `security/integration`. Integration then regenerated the types, reconciled
the tests that one package's guard broke in another, and finished the four findings no
single package could. Every one of the 139 findings is listed below under the package that
owned it. "Fixed with" means two packages closed one finding between them, and "fixed at
integration" means a commit in the integration section finished it.

### At a glance

- **Not closed in the repository**, because the fix lives on the host or in Cloudflare:
  C1, C2 and H2 (Part 1, A to C), the edge throttles for H5 and M20 (D), mail for L36, L39,
  L44 and L45 and the confirmations H1's address check waits for (E), the tunnel
  certificate for L81 (F), and the service-role key the storage sweep needs for I12 (H). The
  repository half of H1, H5, I12, M20 and L44 is done.
- **Partly fixed, with the rest written down**: L19 (whether staff keep participants'
  private details after the conference ends is the product owner's question, Part 1,
  section I), L74 (only the app enforces the publish checklist) and I27 (a narrow
  per-committee case on the application review page, in its entry). The probes after the
  final review left a few more notes of the same weight in the entries for L19, L20, L65,
  L18, L67 and conference-roles, each saying why it was not changed.
- **Left as a decision**: I28 (age limits stay advisory) and the defaults listed in Part 1,
  section I.
- **Refuted or already held**: the motivation clause of L26 (already bounded); I3 and I6
  (by design); I4 (documented); I17, I19 and I24 (the control holds); I23 (the control held,
  and the missing test was added); the archiving half of the final review's L65 (a quick
  session is always a draft); and the three findings the review itself refuted, at the end
  of this part.
- **Everything else is fixed.** Each fix has a database, unit or browser test that covers
  it, with these exceptions. L16 was checked by reading the views' options, and L75, L76,
  L77 and L80 change configuration only. The race tests for L30, L31, L34 and L35 make
  their calls one after the other, so they pin the end state and would also pass without
  the locks; the locks are proven by reading them and, for `revoke_seat`, by running the
  races by hand in two psql sessions (a swap, a move and a revoke, each against the other).
  `private.lock_place_on_team` (L8) was proven the same way, a removal and an assignment
  against each other in both orders.

### seats-private-details

Branch `security/seats-private-details` (865e6a96); migration `20261022110000_seats_private_details_guard.sql`; review clean after 0 fix rounds.

- **C4** (fixed). Confirmed real: an owner's client could insert or update any user_id into a seat and the two staff views then returned that person's profile_details row.
- **M4** (fixed). Confirmed real: the seats insert/update policies ask only manage_committees and restrict no column. Closed by the same protect_seats_columns trigger; a manage_committees-only member can still add an empty seat, rename, reorder (position) and delete an empty one, and cannot write user_id. Seating a delegation member by hand is refused even for the owner; the head's narrow write still works. Finished after the final review (4c0d9049): the probes of the final review found two ways the guard left open. A committee editor could move a seat to another committee by writing `seats.committee_id`, which took its delegate along, skipped `move_delegate` and its bookkeeping, and let somebody holding a detail permission in one committee only pull a delegate into it and read their details. And the seats delete policy asked only that nobody sat in the seat, so a seat `allocate_delegation_seats` had reserved for a delegation could be deleted, on its own or with its committee, while the group invoice went on charging for it. Migration `20261023120000_seats_stay_in_their_committee.sql` has `protect_seats_columns` refuse a browser change of `committee_id`, lets the delete policy take only a seat that is neither filled nor reserved, and has `committee_has_delegates` count a reserved seat, so a committee goes only once its reservations are freed through `remove_delegation_seat`. `committee_has_delegates` also locks the committee `for no key update` and then takes an advisory lock on the committee's id, which the new trigger `seats_hold_committee` (`hold_committee_for_new_seat`) takes shared for every seat being added, before any seat, so the seat waits for the delete. A committee with a seat already filled or reserved is answered "it has delegates" there and then; otherwise the function locks its seats `for share` in id order while it counts them. Deleting a committee and reserving one of its seats at the same moment therefore run one after the other, a seat added while the delete looks or counts waits for it, and its foreign key refuses it if the committee went, a quick session's upsert of its seats waits or is waited for, and neither a move or swap of its delegates nor a second delete of the same committee can deadlock with it. The committee lock is no stronger on purpose: an earlier version of this fix locked it `for update`, and its recheck found that this deadlocked with `move_delegate` and `swap_delegates` when the delegate had a position paper, because pointing the paper at the new committee takes a key share lock on it while the delete waits for the seats they hold. A later version had the trigger lock the committee's row `for share`, and its recheck found that two transactions each adding a seat and then editing the committee deadlocked, that adding a seat waited for a rename or a copied procedure, and that a delete refused for a delegation's seats could deadlock with a head changing those seats in one statement, or with the delegation being deleted. No edit of a committee takes the advisory lock, only the delete, and the early answer locks no seat once a delegation holds one. A save of the whole committee form, in the setup step or on the committee's page, still holds up a seat being added for one statement, as it did before this fix: it writes the committee's link, which is part of a unique key, and because `committees` has BEFORE UPDATE triggers Postgres then locks the row against the seat's foreign key check even when the link is unchanged. That wait cannot form a circle with the delete. Three cases may still end in "deadlock detected", which trying again clears, and the app sends none of them: a head changing their delegation's seats just as one of the committee's seats is reserved for it between the delete's look and its locks, one statement deleting several committees, and one transaction adding a seat and then editing that committee while it is deleted. For somebody who may not manage the committee the function answers "it has delegates" and locks nothing, so calling it through the API cannot hold a conference's seats. `remove_delegation_seat` now holds the delegation before the seat, the order `allocate_delegation_seats` takes, because with the old order the two and a committee delete could wait in a circle. Each case was run by hand in two or three psql sessions, against the earlier versions as well, which let a seat in, deadlocked, or held the seats for a stranger; with the trigger switched off, a seat was added while a delete counted. The committee editor and the setup step's committee list say so when they refuse. The setup step asks whether the reader manages every committee before adding, importing or deleting one, because the step itself opens with `edit_conference`. It asks the same before a change to a committee. Left to the update policy, the save would change nothing and say nothing for somebody without the permission. For somebody who manages just that committee it would depend on what they touched: the database refuses their save as soon as anything but its description, agenda and resolution settings differs from what is saved, and the step's dialog writes every field and works the link out again from the name, so a rename, a new room or seat count, or a committee imported with last year's link would end on an error page. A check that fails is an error page rather than "your role does not include it". The step hides Add, Import, Edit and Delete from somebody who does not manage every committee, and shows the link to the committees page only to somebody that page opens for, which includes somebody who manages only their own committees, so they edit them there. A dialog opened by its address still shows; saving it answers that their role does not let them add, change or delete committees here, and points somebody who manages some of them to the committees page. The Launch step no longer suggests adding or importing committees to such a reader. Tests: `client/tests/db/seats-stay-in-their-committee.test.ts`. Recorded and not changed: `public_seats.is_taken` asks only whether somebody sits in the seat, so the public seat list shows a seat reserved for a delegation as free. That is a display question, not a leak, and is the product owner's to decide.
- **L19** (partly fixed). Confirmed real: the application branch excluded only drafts. It now excludes draft, withdrawn and rejected applications; the delegation-member branch excludes withdrawn and rejected delegations. No grace period was added (Part 1, section I). The finding's other case is not closed: private_details_user_ids has no end_date or archived condition, so staff keep reading accepted participants' private details after the conference ends. When that access should stop is the product owner's question in Part 1, section I. The probes found one more case of the same kind, which is recorded and not changed: the seat branch asks no delegation status, so an organiser who rejects an accepted delegation by writing the column while a member is still seated keeps that member's details. The app's rejection asks for the seats back first, so only a direct write reaches it, and the reader is an organiser who already had the access.
- **L16** (fixed). Confirmed real: pg_class.reloptions for both views was {security_invoker=false} only. The migration runs alter view ... set (security_barrier = true) on staff_contact_details and staff_welfare_details. The same gap was on three more owner-run views, `participant_delegations` and `delegation_member_details` (from delegation-private-reads) and `public_seats`; migration `20261023122000_private_details_have_bounds.sql` (4c0d9049) sets `security_barrier` on them too, checked in `pg_class.reloptions`.
- **I23** (fixed). The review says the other routes are closed and asks for the missing test. Confirmed: guard_delegation_update (20260918120000) already raises 'A delegation cannot be moved to another conference' for browser roles, and the delegations update policies keep another conference's decider from seeing the row. Added the test; no SQL change was needed for this finding beyond the function tightening already made for C4.

### delegation-private-reads

Branch `security/delegation-private-reads` (22353427); migration `20261022111000_delegation_private_reads.sql`; review clean after 0 fix rounds.

- **M18** (fixed). Confirmed against the unfixed database: a chair holding read_participants selected the whole delegations row (join_code included) through the policy 'Participant readers can read the delegations they list', and join_delegation let a chair, a volunteer and the conference owner join.
- **M19** (fixed). Confirmed against the unfixed database: a head selected email, date_of_birth, emergency_contact_name and emergency_contact_phone of a member from profile_details through 'A delegation head can read the details of their own members'. Fixed by the same migration: that policy is dropped; the view public.delegation_member_details (security_invoker = false) returns user_id, delegation_id, phone, dietary_requirements for members of delegations the caller heads (found once as a set, not per row) while the delegation's status is not withdrawn or rejected.

### auth-hardening

Branch `security/auth-hardening` (14e4467d); no migration; review clean after 0 fix rounds.

- **C3** (fixed). supabase/config.toml [storage.s3_protocol] enabled = false, with a comment that the CLI default is true, that S3 keys act as service_role and skip every storage policy, and that the app never uses S3.
- **H5** (partly fixed, rest operator). [auth.email] otp_length = 10, GoTrue's maximum, and otp_expiry = 900, with comments saying the app's links carry token_hash so nobody types the code. The throttle on GoTrue's /verify is an edge rate limit: Part 1, section D.
- **M20** (partly fixed, rest operator). [auth] minimum_password_length = 8, matching MINIMUM_PASSWORD_LENGTH in client/src/lib/auth.ts. password_requirements stays empty on purpose, because the app's rule is length only. A throttle and a captcha on sign-in are Part 1, section D: an app-side limiter would not help, since GoTrue's token endpoint is reachable directly with the publishable key.
- **L44** (partly fixed, rest operator). minimum_password_length = 8 is in config.toml, and the app checks the current password on the server before a change or a deletion (L43). GoTrue's secure_password_change needs real mail first: Part 1, section E.
- **M13** (fixed). New exported pathOnThisSite(address) in client/src/lib/auth.ts parses with new URL(address, 'https://munmeet.invalid'), refuses anything not starting with '/', any control character and any other origin, and answers pathname + search + hash; safeRedirectPath is pathOnThisSite(next) ?? '/'; isFlashUndo in client/src/lib/flash.ts uses the same helper. Finished at the final review (f84d2ee4): normalising dot segments could itself make a second slash ('/.//evil.example', '/a/..//evil.example', '/%2e//evil.example' and '/./\evil.example' all became '//evil.example', which a browser reads in a Location header as another site), so pathOnThisSite now also refuses a normalised path that starts with '//'. auth.test.ts and flash.test.ts carry the four cases, and Toast.svelte posts the normalised undo action, not the text that came in. Its verifier found that new URL throws on an address that names a website with no name ('//', '///', '/\\', '//:', '//@'), which became an error page; since 04562d7c pathOnThisSite answers null for those as well, and auth.test.ts carries them. The probes found the same two gaps in a third copy of the check: `sameSitePath` in `client/src/lib/confirmation.ts`, which the `/confirm` page uses for its form's action and its Cancel link, and `readAnnouncementLink` in `client/src/lib/announcements.ts`, which the notifications page uses. Both now ask `pathOnThisSite` (4c0d9049), so every redirect and link on the site is checked the same way; `confirmation.test.ts` and `announcements.test.ts` carry the cases. `checkOrigin` already refused a cross-site post to `/confirm`, so no exploit was found.
- **L37** (fixed). Pure passwordRecoveryState(amr, now) in client/src/lib/auth.ts answers recent/stale/none from the token's amr claim (methods 'recovery' or 'otp' with a timestamp inside 15 minutes). reset-password/+page.server.ts load and action both go through requireRecentResetLink: stale → signOut, warning flash 'That reset link has run out. Ask for a new one.', redirect /forgot-password; none → redirect /forgot-password (which forwards a signed-in person to /settings).
- **L43** (fixed). createThrowawayAuthClient() in client/src/lib/server/accounts.ts (publishable key, no persisted session); isMyCurrentPassword signs in on it and revokes the minted session with scope 'local'. changePassword and deleteAccount in settings/+page.server.ts both require a non-empty current password (validateCurrentPassword in client/src/lib/accounts.ts) and verify it there before updateUser / delete_my_account. The probes found that the two halves of L43, merged at integration (617432b4), did not meet: the action checked the password on a throwaway client and then asked `delete_my_account` through the visitor's own session, whose sign-in is usually days old, so the database refused almost everybody with 'You signed in more than 15 minutes ago'. Since 4c0d9049 the action signs in again on the throwaway client (`signInAgain` in `client/src/lib/server/accounts.ts`), asks for the deletion through that session, which is seconds old, and ends it (`endThrowawaySession`) when the account is kept.
- **L38** (fixed). client/src/routes/+layout.server.ts passes only cookies whose name starts with 'sb-' as page data, with a comment saying why (everything a load returns is serialised into the HTML).
- **L40** (fixed). client/src/routes/+layout.ts passes cookieOptions { sameSite: 'lax', secure: window.location.protocol === 'https:' } to createBrowserClient, so https deployments get Secure and local http keeps working; the login action's comment no longer claims the cookie is hidden from JavaScript. HSTS belongs to http-headers-csp.
- **L42** (fixed). src/routes/auth/confirm/+server.ts replaced by +page.server.ts and +page.svelte: for token_hash the load returns describeEmailLink(type) and verifies nothing; the page is an AuthCard with one primary button that POSTs to the same address; the default action calls verifyOtp and keeps the redirects (next, /login?message=confirmed, /auth/error?reason=expired|invalid). The code branch is still exchanged on GET (PKCE verifier cookie). parseEmailLinkType and describeEmailLink added to client/src/lib/auth.ts.
- **L46** (fixed). createFailedAttemptCounter(limit = 5, coolDownMs = 10 min) and the module-level siteResetAttempts in client/src/lib/server/site-reset.ts; test-site/+page.server.ts asks isCoolingDown before comparing the code (429 'Too many wrong codes. Try again in ten minutes.'), records failures and resets on success.
- **I5** (fixed). hooks.server.ts handleError logs event.route.id ('a request that matched no route' for a 404) instead of event.url.pathname.
- **L36** (operator). Production auth mail goes to the local sink. Nothing in the repository fixes it, and the review's other option, saying so on the page, is not taken because the product describes mail as working (the owner's standing instruction). Part 1, section E.
- **L39** (operator). The account-existence oracle is GoTrue's /signup while confirmations are off; the fix is enable_confirmations = true, which needs SMTP first: Part 1, section E.
- **L45** (operator). [auth.rate_limit] values are inert on the CLI stack (no GOTRUE_RATE_LIMIT_HEADER); edge rate limits on the mail-sending auth endpoints are an operator step once SMTP exists: Part 1, sections D and E.

### http-headers-csp

Branch `security/http-headers-csp` (a5136d7f); no migration; review clean after 0 fix rounds.

- **L41** (fixed). No Content-Security-Policy, frame-ancestors, nosniff, Referrer-Policy or HSTS on any page. Confirmed against the code (no `csp` option anywhere, no `setHeaders` of these names, nothing in docker-compose.yaml or the tunnel) and against the preview, which answered without them. Fixed with SvelteKit's `csp` option (mode 'auto', nonce on its inline script) in client/vite.config.ts and five headers set from `handle` in client/src/hooks.server.ts.

### organisation-governance

Branch `security/organisation-governance` (89c1113b); migration `20261022120000_organisation_governance.sql`; review clean after 2 fix rounds.

- **H3** (fixed). Hijack of a personal 'Quick sessions' organisation. trigger organizations_protect_ownership_columns refuses a browser changing organizations.created_by or is_personal; create_quick_session refuses a personal organisation the caller does not own; organization_members has no insert policy and a browser's UPDATE is granted on the role column alone, so a row cannot be re-pointed at another account or organisation; accept_invite stays the only door.
- **M1** (fixed). Admins could promote themselves and demote or remove owners. is_organization_owner (security definer, stable, execute for authenticated only); UPDATE policy asks the old role in USING and the new role in WITH CHECK; DELETE policy asks the old role or user_id = auth.uid(); no INSERT policy. It is closed together with M15 (an admin inserting an 'owner' invitation), in the invites package.
- **M16** (fixed). removeMember in client/src/routes/manage/organizations/[orgSlug]/+page.server.ts refuses an admin removing an owner, MemberRow.svelte hides Remove on an owner's row for an admin, and the DELETE policy refuses the same.
- **L2** (fixed). prevent_last_owner_removal takes pg_advisory_xact_lock(hashtext(old.organization_id::text)) before counting owners.
- **L65** (fixed with conference-lifecycle-limits and at the final review). The cap of 25 live quick sessions was escaped by rezoning, since create_quick_session counts a session as live while end_date >= today in conference.timezone and the personal organisation's owner could UPDATE conferences.timezone through 'Conference editors can update their conference'. protect_quick_session_days (trigger conferences_protect_quick_session_days, BEFORE UPDATE on conferences) now also refuses current_user in ('anon','authenticated') changing timezone when old.kind = 'quick_session', next to start_date, end_date and kind, with the message 'The days and timezone of a quick session are set by the database, and it stays a quick session'. The final review's second route, archiving 25 sessions to make room for 25 more, does not open: the CHECK conferences_quick_session_is_draft (20261001120700) keeps every quick session a draft, so none can be archived and the cap (status <> 'archived' and end_date >= today) counts each one until it ends. client/tests/db/security-final-review.test.ts pins the refusal. One more way round the cap was found by the probes and recorded, not changed: the conferences insert policy does not restrict `kind`, and the trigger only guards an update of a quick session, so a browser can insert a conference with `kind = 'quick_session'` past the 25th, or turn an ordinary draft into one. It gains nothing an ordinary draft does not already have, since drafts with committees and seats are unlimited by design (I6) and no policy treats a quick session differently. If the cap should hold for the table and not only for `create_quick_session`, refuse that kind on a browser insert and any browser change of `kind`.

### invites

Branch `security/invites` (b03fafa5); migration `20261022121000_security_invites.sql`; review clean after 1 fix round.

- **H1** (partly fixed, rest operator (Part 1 E)). accept_invite and list_my_invites matched the caller's address without checking email_confirmed_at, and list_my_invites returned the secret token. Every match (accept_invite, accept_invite_by_id, list_my_invites, notify_invite) now requires auth.users.email_confirmed_at is not null; list_my_invites returns the row id instead of the token; accept_invite_by_id(invite_id uuid) accepts by id. The confirmed-address check refuses nobody yet: supabase/config.toml has enable_confirmations = false, so GoTrue confirms every sign-up at once, and squatting an invited address stops only once real mail and confirmations are on (Part 1, section E). GoTrue will not sign in an unconfirmed account, so the database tests cannot hold one; the unconfirmed refusal is checked by the SQL recipe in the header of client/tests/db/security-invites.test.ts.
- **M11** (fixed). Insert policy now refuses email = invite_sender_email() (security definer helper reading auth.users, lowercased); accept_invite_row refuses invited_by = auth.uid() for both invite kinds, so pre-migration rows cannot be redeemed.
- **M15** (fixed). The insert policy refuses role = 'owner' outright; accept_invite_row refuses an owner invitation however the row got there; list_my_invites omits such rows. The form never offered owner (INVITE_MEMBER_ROLE_OPTIONS).
- **L1** (fixed). CHECKs invites_role_is_organization_role, invites_email_length, invites_token_length; notify_invite rewritten with fixed words, names left() to 80 characters, role never raw, confirmed accounts only. The rate cap the review found bypassable is rebuilt: guard_invite_rate (BEFORE INSERT, now security definer) stamps new.created_at := now() and clears accepted_at/accepted_by for browser roles, takes a per-inviter advisory lock, and counts a new table public.invite_sends (no policies, all grants revoked from public/anon/authenticated) that it alone writes and prunes to the last hour, so neither a client-set created_at nor withdraw-and-resend escapes the fifty-an-hour count.
- **After the final review** (4c0d9049). The probes found five gaps around H1, M11, M15 and L1, closed by migration `20261023121000_invitations_hold_while_sent.sql`, with its tests in `client/tests/db/invitations-hold-while-sent.test.ts`. First, an invitation outlived its sender: an organisation admin who was removed, or a team manager who lost `manage_team` or was moved below the role they had offered, left pending invitations behind that still made people admins or team members (shown by a probe). `accept_invite_row` now asks that the sender still holds what sending asked of them: `manage_team`, a rank above the role, and every permission the role gives. Second, the browser chose `expires_at`, so an invitation could never run out; `guard_invite_rate` caps it at fourteen days. Third, the token was checked for length only, and `notify_invite` builds the bell link from it, so a sender could pick where on the site the invitee's bell went; the CHECK `invites_token_is_url_safe` allows letters, digits, `-` and `_` only. Fourth, any `manage_team` holder could withdraw an invitation to a role above their own; the delete policy now asks `can_manage_role(role_id)` as the roles spec says, and the team page shows "Send again" and "Revoke" only on the invitations the reader may change (`mayChangeInvite` in `client/src/lib/team-access.ts`). Fifth, browsers kept the default UPDATE, TRUNCATE, TRIGGER and REFERENCES grants on `invites`, held back only by the absence of an update policy; they are revoked. Recorded and not changed: a removed admin can still read and withdraw the invitations they sent, through the policies' inviter branch, but no longer have them accepted. And the committee editor's list of pending chair invitations still shows "Withdraw" on every one; for an invitation to a role above the reader the database refuses it, and the page's refusal now names that reason beside the other.
- **L18** (fixed). get_invite answers a status column (pending/used/expired) and identifying columns (email, names, slugs, committee, inviter) only while pending; the page sends a signed-out visitor to /register?next=/invites/<token> only for a pending invite, else /login?next=..., never with the address; InviteSummary drawn only while pending; registerWithEmailUrl removed. It still answers the role's name, scope and permissions for a used or expired invitation; they identify nobody, so this is recorded only.

### conference-roles

Branch `security/conference-roles` (eb63fe29); migration `20261022122000_conference_roles_hardening.sql`; review clean after 0 fix rounds.

- **H4** (fixed). A role can no longer move to another conference: BEFORE UPDATE trigger protect_conference_roles_conference raises for every caller when conference_id changes; unique (id, conference_id) on conference_roles; composite FKs (role_id, conference_id) on conference_role_members (on delete restrict) and invites (on delete cascade), replacing the single-column keys so PostgREST embeds stay unambiguous; holder_has_permission, has_committee_permission, permitted_conference_ids, permitted_committee_ids, my_permissions, user_rank, can_grant, holds_public_role and holder_has_committee_permission recreated with role.conference_id = member.conference_id in the join.
- **L5** (fixed). committee_chairs insert, update and delete policies now also require can_manage_member(committee.conference_id, user_id): a manager assigns, retitles and unassigns only people below their rank and cannot assign themselves (one's own rank is not below one's own); administrators still can, since the rank rule does not bind them. Documented in the migration. Finished in the app after the final review (4c0d9049): the committee editor's Chairs panel did not know the rule. It offered 'Chair it yourself' to every team manager and every per-committee role holder in its picker, and reported each refusal as 'You already chair this committee' or 'That person is already a chair here'. `addCommitteeChair` now tells the primary key's 23505 from the policy's 42501, the picker offers only people below the reader (`mayAssignChair`, with ranks from `listChairStaff`), 'Chair it yourself' is offered to an administrator alone (`mayChairThemselves`), and the team page's committee picker says a refusal instead of reporting success. An administrator still cannot assign an organisation owner who has no staff row (L8 refuses it); the owner uses 'Chair it yourself'. Taking somebody off a committee follows the same rule: the panel shows Remove only on chairs below the reader (`mayRemoveChair`, with ranks from `readTeamRanks` in `client/src/lib/server/team.ts`), `removeChair` asks it before writing, and a refusal no longer reads as 'That person no longer chairs this committee'. Neither the picker nor the panel can see a platform admin, whom a browser cannot identify; the database's own refusal covers them.
- **L6** (fixed). conference_staff update policy adds can_manage_member (keeping 'nobody edits their own row'); CHECK conference_staff_title_length caps the title at 80 characters (the form and invites_title_length stop at 40).
- **L7** (fixed). New definer helper can_grant_role_permissions(role_id) asks can_grant on the role's own permissions and scope. BEFORE INSERT trigger guard_role_member_grant on conference_role_members and guard_invite_role_rank on invites (rows with a role_id; also re-asks can_manage_role) raise 42501 for browser callers (current_user in anon/authenticated) and walk past accept_invite and add_conference_presets.
- **L8** (fixed). Policy 'Team managers can add somebody to the team' on conference_staff dropped: grep of client/src shows the app only selects, updates and deletes conference_staff (team.ts, home.ts, schedule.ts, manage-layout.ts, manage-list.ts); rows arrive through accept_invite and accept_invite_by_id (both through accept_invite_row), ensure_chair_is_staff and, for a creator who is a member of the organisation but not its owner or an admin, add_conference_presets (all definer). The rank rule (L5) did not close the other way in, because can_manage_member ranks somebody with no role below everyone: a team manager could assign any account to a committee, and ensure_chair_is_staff then put it on the team with no invitation. Finished at the final review (f84d2ee4, migration 20261022170000_final_review_fixes.sql): the BEFORE INSERT OR UPDATE trigger committee_chairs_already_on_team (protect_committee_chairs_team, asking the definer helper private.chair_is_off_the_team) refuses a browser assigning to a committee anybody not already on the conference's team, with 42501 and 'Only somebody already on the team can be assigned to a committee. Invite them first.' Its name sorts before committee_chairs_ensure_staff, so the row is refused before anybody is added. Its verifier found one more way back: a person's committee assignments stayed behind when they left the team or were removed from it, and the trigger let through any update that kept the person and the committee, so a team manager could retitle a leftover assignment and ensure_chair_is_staff put its person back on the team. Migration 20261022170100_chairs_leave_with_the_team.sql (04562d7c) closes it: the after delete trigger conference_staff_takes_chairs_along (remove_chairs_of_departed_staff) deletes a person's assignments on a conference's committees when their staff row goes, the migration deletes the assignments left behind before it, and protect_committee_chairs_team now lets through only a chair naming themselves ('Chair it yourself', create_quick_session), owner-run functions such as accept_invite, and the service role. Tests: security-final-review.test.ts, security-conference-roles.test.ts and committee-chairs.test.ts. The probes of that commit found a third way: browsers kept Supabase's default UPDATE on every column of `conference_staff`, so a team manager could take a lower person's roles away and then point their staff row at any account, which joined the team without an invitation, or at another conference they manage, and the old person's committee assignments stayed behind. Migration `20261022170200_team_rows_keep_their_person.sql` (4c0d9049) lets a browser update only the title of a staff row and of a chair row, takes a person's assignments away when a writer the grants do not stop moves their staff row, deletes any assignment left with no staff row behind it, and adds `private.lock_place_on_team`, which `protect_committee_chairs_team` asks, so that an assignment and a removal made at the same moment run one after the other. The race was run by hand in two psql sessions, both ways round; the rest is in `security-final-review.test.ts`.
- **L9** (fixed). conference_role_members.granted_by defaults to auth.uid() and the insert policy WITH CHECK adds granted_by = (select auth.uid()), so a page that omits it records the giver and a forged value is refused.
- **M17** (fixed). The three committee_session_notes policies altered from run_room to write_chair_notes: the read uses committee_id in (select permitted_committee_ids('write_chair_notes')) like chair_notes, the insert and update use has_committee_permission(committee_id, 'write_chair_notes') and keep the session-belongs-to-committee check. docs/roles-and-permissions.md section 8 lists committee_session_notes beside chair_notes.
- **Recorded after the final review, not changed.** `can_grant` counts a per-committee holding when a per-committee role is made for any committee, so a per-committee manager might make committee roles that reach beyond their own committees; suspected from reading, not shown. And a browser may update the `id` of a role nobody holds; the foreign keys refuse it while the role is held and `conference_id` is guarded, so nothing was gained, but a column grant would be tidier.
- **I26** (fixed). The control holds; the missing test was added: a committees-scoped holder of confirm_awards gets no confirmable_committee_ids and cannot confirm, while a conference-wide holder confirms.
- **I25** (fixed at integration). The package reported it as the product owner's decision; at integration the spec was made to say what the code, the migration comment and the roles editor already do (b1f6e395), below.

### account-deletion

Branch `security/account-deletion` (ffea662f); migration `20261022123000_account_deletion_hardening.sql`; review clean after 0 fix rounds.

- **L20** (fixed). delete_my_account now deletes the pending invitations (accepted_at is null) whose lowercase address equals the account's auth.users email, in the same transaction, before deleting auth.users. Accepted invitations keep their row (accepted_by is nulled by the existing FK), since only a pending invitation can still be redeemed. The probes found that the clean-up does not ask whether the address is confirmed, unlike H1's rule. It cannot be reached today: while sign-ups are confirmed at once every address is, and once confirmations are on, GoTrue gives an unconfirmed account no session to call it with. Recorded only.
- **L29** (fixed). The function now checks, before any delete, whether the caller is the only head of a live (draft/submitted/accepted) delegation and raises 'You are the only head of <delegation> at <conference>. Make another member a head, or withdraw the delegation, before deleting your account.' (for an accepted delegation, which guard_delegation_update does not let a head withdraw, only 'Make another member a head before deleting your account.').
- **L43** (fixed). delete_my_account reads current_setting('request.jwt.claims', true)::jsonb -> 'amr' and refuses unless an entry's timestamp is within the last 15 minutes: 'You signed in more than 15 minutes ago. Sign in again before deleting your account.' GoTrue v2.196.0 (the version in this stack) puts amr in every access token as [{method, timestamp}], verified by decoding a fresh signup token, so no iat fallback was needed; iat is deliberately not used even when amr is missing, because a refresh renews it, and a token without amr or with a malformed amr is refused like a stale one (the comment in the migration says so).

### conference-lifecycle-limits

Branch `security/conference-lifecycle-limits` (447a8c46); migration `20261022124000_conference_lifecycle_limits.sql`; review clean after 2 fix rounds.

- **M2** (fixed). conferences.first_published_at is stamped by protect_conferences_columns (BEFORE INSERT OR UPDATE) the first time status leaves draft; no browser may set or clear it; the delete policy requires status = 'draft' and first_published_at is null. Both Delete draft actions ask wasEverPublished and say why; the publish page's load answers isDeletable and DeleteDraftFooter shows the reason instead of the button for a once-public draft.
- **L74** (partly fixed). The guard refuses archived -> draft and published -> draft while any seat of the conference has a user_id, with the dashboard's sentence; setConferenceStatus's doc comment describes both refusals. The publish checklist is still enforced only by the app's publish action, so an edit_conference holder can publish an incomplete conference by writing conferences.status directly. Moving the checklist into protect_conferences_columns would close it.
- **I1** (fixed). Insert policy 'Members can create a draft conference for their organization' requires status = 'draft'; createConference, createCreationDraft and create_quick_session all insert drafts; browser fixtures use the service role, which the guard stamps.
- **I18** (fixed). Seven *_url_shape CHECKs (organizations.website_url and the six conference addresses) match ~* '^https?://' with length <= 2048, agreeing with isWebAddress, which accepts a capitalised scheme; javascript:, data:, www., ftp: refused.
- **I10** (fixed with stripe-organizations). conferences_currency_shape, a CHECK of `^[A-Z]{3}$`. The zero-amount and fee-cap half is in stripe-organizations.
- **L57** (fixed). committee_sessions_name_length (120, said to be generous); SESSION_NAME_MAX_LENGTH in $lib/chair-room.ts bounds the start-session action with a form message and the lobby field carries maxlength.
- **L65** (fixed with organisation-governance, and at the final review). The table bounds: committees_name_length, committees_slug_shape and seats_name_length hold for every row create_quick_session writes. A quick session's topic, and the topics an organiser types, had no ceiling in committees.topics or committee_state.agenda_topic. Migration 20261022170000_final_review_fixes.sql adds committees_topics_bounded (at most 50 topics of at most 200 characters each, through private.topics_are_bounded) and committee_state_agenda_topic_length (200). validateCommitteeForm (client/src/lib/committee-details.ts) and the quick session's 'Add a topic' (readNewTopic and isPastTopicLimit in client/src/lib/chair-room.ts) refuse first with a sentence; LONGEST_AGENDA in quick-session.ts already stopped at 200. The per-user cap is organisation-governance's, above.
- **L66** (fixed). committees_slug_shape, committees_name_length (120) and seats_name_length (120). The editor's SLUG_SHAPE and SLUG_MAX_LENGTH (100) match the database. the organiser 'new' and 'edit' committee actions filled an empty link with slugify(name), which is '' for a name with no Latin letter or digit and reached committees_slug_shape as a thrown 500; both now use committeeSlugFromName in $lib/committee-details.ts, which falls back to 'committee' as the Setup step's uniqueSlug and quickSessionCommitteeSlug already do, and a clash with an existing 'committee' link is still reported by checkSlug.
- **L67** (fixed). profiles_full_name_length (100), profiles_institution_name_length (120), profiles_pronouns_length (30); validateWelcomeForm bounds name and institution and the welcome fields carry maxLength. The probes found `profile_details` unbounded: a person's own row took a 20,000-character phone number, emergency contact or dietary note, which reach the organisers' pages and exports, and the welcome form bounded only the dietary note. Migration `20261023122000_private_details_have_bounds.sql` (4c0d9049) adds `profile_details_phone_length` (30), `profile_details_dietary_requirements_length` (300), `profile_details_emergency_contact_name_length` (80) and `profile_details_emergency_contact_phone_length` (30), the details editor's own limits, and `validateWelcomeForm` now refuses the same lengths first. Writing them showed one more gap: browsers could update every column of `profile_details`, including `email`, the address that organisers and delegation heads read for a person, so anybody could show the team an address that was not their account's. The migration grants update on the five fields the editor writes and no others. Tests: `client/tests/db/private-details-have-bounds.test.ts` and `profiles.test.ts`. Name limits still disagree, the register form and the database at 100 and the welcome form and editor at 80; that is a form's message, not a hole, and is recorded only.
- **L69** (fixed). organizations_name_length (120), organizations_description_length (1000), organizations_city_length (120, generous) and organizations_website_url_shape; the Organisation step validates the city.
- **L70** (fixed with codes-and-shape-checks). Organisation free text is bounded and the organisation, conference and committee slugs are shaped. The delegation text columns are L68, in codes-and-shape-checks.
- **L71** (fixed with exports-and-page-gates). organizations_slug_shape, conferences_slug_shape and committees_slug_shape: `^[a-z0-9]+(-[a-z0-9]+)*$` and at most 100 characters; slugify, makeUniqueSlug, committeeSlugFromName and every fixture slug satisfy it. The Content-Disposition half is in exports-and-page-gates.
- **L72** (fixed). announcements_title_length (120), announcements_body_length (4000), schedule_events_title_length (120), schedule_events_description_length (1000), schedule_events_location_length (80), matching announcement-form.ts and schedule-form.ts.

### stripe-organizations

Branch `security/stripe-organizations` (d5e95467); migration `20261022130000_stripe_organizations_security.sql`; review clean after 1 fix round.

- **C5** (fixed). Database: protect_stripe_columns runs BEFORE INSERT OR UPDATE and refuses non-null Stripe columns from anon/authenticated on insert and any change on update; set_stripe_account (security definer, still gated by is_organization_admin) refuses a blank id and a second binding through one atomic 'update ... where stripe_account_id is null'; partial unique index organizations_stripe_account_id_unique. Application: createConnectAccount (client/src/lib/server/stripe.ts) writes the organisation's id into the new account's metadata.organization_id, and verifyConnectAccountBelongsTo reads it back before the Stripe return and refresh routes and the organisation page's dashboard and onboarding actions use a stored id, so an id copied from another organisation leads nowhere.
- **L3** (fixed). Table-level select on organizations revoked from anon and authenticated; column grants give both roles the 11 public columns (id, name, slug, description, country_code, website_url, created_at, logo_path, updated_at, is_personal, city) and authenticated additionally stripe_onboarding_completed_at and created_by (documented deviation: read for members and conference administrators by home.ts, manage.ts, creation.ts, organizations.ts, fees and publish pages; created_by read as the caller by create_quick_session, owned by organisation-governance). stripe_account_id is reachable only through the view organization_private_settings, now created with (security_invoker = false, security_barrier = true) per the review's advisory, so the is_organization_member row filter cannot be bypassed by a pushed-down filter function.
- **L11** (fixed). invoices.note judged internal and dropped; notes live in public.invoice_internal_notes (invoice_id pk, note with non-blank and length checks, updated_at trigger) behind policies through can_read_invoice_note (read_invoices or manage_invoices) and can_manage_invoice_note (manage_invoices), anon revoked; the three seeds write there (21 seeded notes land after a bare reset, matching the seed files); server/invoices.ts embeds invoice_internal_notes(note) and settleInvoice upserts after a successful move.
- **L32** (fixed). protect_invoice_columns replaced: for browser callers paid_at and paid_method may change only on the unpaid -> paid transition, where 'stripe' is refused and the trigger writes paid_method='manual' and paid_at=now() itself; any other change to the two is refused; refund refusal kept; service role unaffected.
- **L33** (fixed). Execute on set_invoice_checkout_session(uuid, text) revoked from public, anon and authenticated; function kept for the service role. No client/src caller existed; the comment in $lib/invoices.ts says the pay action and webhook write stripe_checkout_session_id with the service role and resolve invoices by their own id in session metadata.
- **I8** (fixed). The refresh endpoint returns the Stripe onboarding link as new Response(null, {status: 303, headers: {location, 'cache-control': 'no-store'}}) rather than a thrown redirect that would drop headers; the foreign-account redirect is rethrown via isRedirect inside the try. The /return endpoint's comment about admitting plain members was updated: readStripeAccountId reads the view, which withholds the id from non-admins, so a member is sent back to the settings page and the membership check only keeps strangers from learning the organisation exists.
- **I10** (fixed). platform-fee.ts gains needsCheckout(invoice) (false for amountCents <= 0) and applicationFeeCents(invoice) (quantity x fee, capped at amountCents, 0 for a zero invoice) for the future Checkout code; the currency CHECK is left to conference-lifecycle-limits.

### money-races

Branch `security/money-races` (a7496ccb); migration `20261022131000_money_races_and_invoice_payers.sql`; review clean after 0 fix rounds.

- **M10** (fixed). guard_invoice_insert accepted any payer_user_id, so any holder of manage_invoices could raise an invoice against any account on the platform. For browser callers the guard now requires the payer to take part in the conference (a seat, a non-draft application or a delegation membership there; the invoice's own seat and delegation are already checked to be the conference's, so their holder and head are covered), through a new security definer helper public.invoice_payer_takes_part(conference_id, payer_user_id) that answers false to anybody without manage_invoices on that conference so it cannot enumerate participants.
- **L30** (fixed). allocate_delegation_seats counted free seats then updated by id alone, so two concurrent allocations both reserved one seat and both invoiced for it. It now locks the delegation row and the seats (perform ... order by id for update), puts the free-and-in-this-conference predicate into the UPDATE itself and compares the row count with the distinct seats asked for, raising the existing 'One of those seats is taken, hidden, or not part of this conference' when they differ (duplicate ids in the list still count once, keeping the existing duplicate-tick-list test).
- **L31** (fixed). remove_delegation_seat read the newest unpaid group invoice without a lock, so two removals voided it once and reissued twice. It now locks the delegation row for update before touching the invoice (so a second removal sees the replacement the first wrote rather than skipping a vanished voided row), reads the seat for update, reads the invoice with for update, and repeats the expected state in the seat and invoice updates with row-count checks. Since the final review's last check, the delegation is locked before the seat rather than after it (M4).
- **L34** (fixed). accept_application read the application and the seat without locks. It now reads both with select ... for update first and repeats status in ('submitted','waitlisted') and the free-seat predicate in each UPDATE's where clause, raising the existing messages when the row count is 0. allocate_delegation_seats likewise locks the delegation and repeats status = 'submitted' in its status update.
- **L35** (fixed). move_delegate and swap_delegates read seats without locks, so two moves into one free seat dropped a delegate and deleted their paper. Both now lock both seats in id order (perform ... where id in (a, b) order by id for update) before reading them and repeat the expected occupancy in every seat UPDATE, raising 'Nobody is sitting in that seat' / 'That seat is not free' when no row matched. At the final review (f84d2ee4) revoke_seat, which still read its seat with a plain select, got the same treatment in 20261022170000_final_review_fixes.sql. It locks the seat and then the application that won it, repeats the occupant in its seat update with a row-count check, and voids only the unpaid invoices of the delegate who loses the seat. It locks in the opposite order to accept_application; if the two ever meet on the same seat and application, Postgres aborts one with a deadlock error and nothing is left half done.
- **L12** (fixed). fee_has_invoices answered any fee id with no permission check. It now answers only when the caller is staff of the invoice's conference (is_conference_staff), which is who the fees delete policy asks on behalf of; a stranger gets false. Note a plain team member is staff and so still gets an answer; the test documents this.
- **L13** (fixed). fee_invoice_counts answered every team member. It now requires edit_conference, read_invoices or manage_invoices on the conference, the same three permissions that open the fees page ($lib/manage-pages.ts fees: [...]), and answers an empty set to anybody else.

### internal-notes-grants

Branch `security/internal-notes-grants` (bcf921f9); migrations `20261022132000_internal_notes_grants.sql`, `20261022132100_applicant_keeps_decision.sql`; review clean after 1 fix round.

- **M7** (fixed). Applicants could read internal_note and decided_by on their own application. the note moved to public.application_internal_notes (select on read_applications, insert/update on decide_applications), the old column copied, emptied and refused by retire_internal_note_column; decided_by hidden by revoking table-level select on applications from authenticated and granting every other column, organisers reading it through public.staff_application_deciders; applications_with_applicant recreated naming its columns.
- **M8** (fixed). Delegation members, heads and chairs with read_participants could read delegations.internal_note. The note lives in public.delegation_internal_notes with select on read_applications and insert/update on decide_applications; the old column is copied, emptied and refused by the retire trigger; delegations keeps its table-level grant (the retired column is always null and other lanes write views over delegations).
- **L4** (fixed). Every signed-in user could read everybody's is_platform_admin and onboarding_completed_at. Table-level select on profiles is revoked from authenticated and the ten public columns granted; a person's own two columns come back through the one-row view public.my_profile_state (security_invoker = false), which requireOnboarded and getMyProfile read.
- **L14** (fixed). Published awards were readable by every signed-in account with user_id, seat_id and created_by. The permissive policy is dropped; non-staff read public.published_awards (security_invoker = false, security_barrier; display fields plus is_mine) granted to authenticated only; the committee page and /profile read the view.

### storage

Branch `security/storage` (b20c811e); migration `20261022133000_storage_hygiene.sql`; review clean after 0 fix rounds.

- **M3** (fixed). Storage update policy on the documents bucket no longer trusts the object's uploader in the position-papers folder; the delete policy trusts the uploader there only through may_delete_own_position_paper (no row points at the file, or the row is unreviewed and the deadline has not passed); may_upload_conference_document refuses any path a documents row already points at. Replacement always goes to a fresh path (positionPaperPath), which position-papers.ts already did.
- **L59** (fixed). check_document_scope now ties documents.storage_path to <conference>/position-papers/<seat>-…, <conference>/background-guides/<committee>-… or <conference>/resources/… with a single file name after the prefix, on insert and on an update that changes the path. Updates that keep the path are left alone because move_delegate and swap_delegates (money-races package) carry a paper to a new seat without moving the file; rows missing the id their kind needs, or of kinds with no folder, fall through to the existing check constraints so their messages are unchanged.
- **L60** (fixed). Dropped 'Anybody may read public media'. Public downloads work through the public address (no select policy needed). creation.ts's copy of the organisation logo and previous edition banner, and the owner's remove of a replaced picture, need to see their source, so one select policy for authenticated remains through the new may_see_public_media: own avatar folder, folders of organisations the caller is a member of (any member may start a draft), folders of published conferences or ones the caller may edit.
- **L61** (fixed at integration). Replaced pictures are queued into public_media_cleanup (queue_replaced_public_media on profiles, organizations and conferences) and replaced paper files into orphaned_document_files (queue_replaced_document_file). Uploads that never get a row, and the sweep on a schedule, came at integration (ff355e62), below.
- **L62** (fixed). Revoked execute from public and anon on may_write_public_media(text), may_upload_conference_document(text) and may_change_conference_document(text); granted to authenticated (same for the two new helpers).
- **L63** (fixed). The remove() calls in position-papers.ts that matched nothing (replaced file at ~346, after-delete at ~468, and the rollback of a failed row write) are removed; the documents_queue_replaced_file trigger (AFTER UPDATE OF storage_path) queues the old path into orphaned_document_files and the existing AFTER DELETE trigger covers removal; the sweep removes them.
- **L64** (fixed). AFTER DELETE on profiles (fired by the auth.users cascade from delete_my_account) queues the avatar path into public_media_cleanup; the sweep removes it. With L60 the avatars are no longer listable either.
- **I13** (fixed). uploadDocumentObject reads the first twelve bytes and refuses a file whose signature does not match its declared type (PDF %PDF-, JPEG FF D8 FF, PNG 89 50 4E 47, WebP RIFF....WEBP, DOCX PK) through the new pure module $lib/file-signatures.ts; background guide uploads in documents.ts now go through uploadDocumentObject too. createSignedUrl/createSignedUrls are called with download set (the file's own name where the caller has it) so documents are not rendered inline from the Supabase origin.
- **I22** (fixed). CHECK constraints profiles_avatar_path_in_own_folder, organizations_logo_path_in_own_folder, conferences_banner_path_in_own_folder and conferences_logo_path_in_own_folder tie each path to '<folder>/<own id>/<at least one character>', added NOT VALID then VALIDATE. The seeds pass. The Launch step's e2e test of the owner's screen gave a new draft last year's banner path; it now puts the photograph in the draft's own folder, as the Organisation step's copy does.

### applications-and-delegations-windows

Branch `security/applications-and-delegations-windows` (68fb0663); migrations `20261022140000_applications_delegations_windows.sql`, `20261022140100_delegation_window.sql`; review clean after 1 fix round.

- **M6** (fixed). conference_takes_applications(conference_id, route) is the single answer to whether the window is open. It is used by the applications insert policy, create_delegation, guard_application_update, and now guard_delegation_update (migration 20261022140100). While the window is shut, a head may only make a pure withdrawal: to_jsonb(new) minus status and updated_at must equal old. A late submission of a draft, a late edit and a late move back to draft are all refused. canSubmitDelegation now mirrors the database: unpublished, delegations not accepted, manual mode with no opening date, a future opening, or closed.
- **M14** (fixed). guard_application_update lets an applicant only withdraw while the conference is not taking applications. The delegation guard now does the same for heads. The delegation page's load returns canEdit = canEditDelegation(status, isTakingDelegations(conference, now)), so the Details form is hidden once the window shuts. The update action refuses with the CANNOT_EDIT flash.
- **L28** (fixed). Applications: an organiser's column write may now only move submitted to rejected or waitlisted, waitlisted to rejected, or rejected to withdrawn. The direct moves from submitted or waitlisted to accepted are gone, so accepting happens only through accept_application. Delegations: the organiser branch refuses any change to a draft. A status change may only go from submitted or accepted to rejected, so nothing reaches accepted without allocate_delegation_seats.
- **L15** (fixed). The select and update policies keep unsent drafts away from read_applications and decide_applications holders. application_team_names (redefined in 20261022140100) now leaves out teammates' drafts for a caller who is not in the team. Team members still see every name.
- **M5** (fixed). is_conference_participant and participant_conference_ids no longer count drafts, withdrawals or rejections. is_conference_admitted (a seat, an accepted application, or membership of an accepted delegation) gates the 'delegates' audience of announcements, documents and schedule_events, and conference_audience_user_ids. delegation_member_holds_seat now returns null to anybody outside the delegation, so it cannot be used to probe seats.
- **L23** (fixed). The direct insert policy on delegations is dropped, so create_delegation is the only writer, and it always seats the creator as head. New headless delegations can no longer be made. Rows that already exist are an operator check, in Part 1, section G.
- **L24** (fixed at integration). create_delegation mints a 10-character join code from gen_random_bytes, and a head cannot choose or change it. The attempt limit and the re-minting of old codes came at integration (f56dc5f8), below.

### codes-and-shape-checks

Branch `security/codes-and-shape-checks` (c743b78c); migration `20261022141000_codes_and_shape_checks.sql`; review clean after 1 fix round.

- **L25** (fixed). Team join codes are 8 characters from a 32-letter alphabet, made by private.new_application_team_code(). Every team whose code is under 8 characters gets a new one in the migration. join_application_team caps wrong codes per person per hour, and a per-person pg_advisory_xact_lock taken before the count means a burst of requests sent at once is counted one by one. The attempts table and its sequence are revoked from anon and authenticated.
- **L26** (fixed, one clause refuted). The answers, seat_preferences and committee_preferences columns and the delegation text columns have CHECKs, added not valid and then validated: answers are an object of at most 50 keys, each key at most 64 characters, each value a string of up to 4000 characters or a list of up to 20 strings, checked by private.application_answers_are_valid. Motivation was already bounded, so that clause is refuted. "One delegation per person on direct insert" is closed by L23: the direct insert policy is gone and create_delegation refuses a second delegation.
- **L27** (fixed). The apply form and the database now use the same limits. ANSWER_MAX_LENGTH is 4000 and MAX_CHOICE_OPTIONS is 20. cleanAnswer cuts each answer to 4000 characters and keeps the first 20 ticks. answerProblem refuses an answer over either limit. The apply text boxes stop at 4000 characters. validateQuestionForm refuses a picking question with more than 20 options. The committee_preferences CHECK (at most 10) is real but can only be reached as postgres: the BEFORE trigger validate_application refuses first.
- **L68** (fixed). The delegations columns name (at most 120), institution_name (at most 120) and note (at most 1000) are bounded by CHECKs, added not valid and then validated. The pre-flight query in the migration header lists any delegations row over a bound.

### room-documents-guards

Branch `security/room-documents-guards` (9968eded); migration `20261022142000_room_documents_guards.sql`; review clean after 2 fix rounds.

- **L47** (fixed). A closed vote and its answers are the record. protect_closed_votes (votes_refuse_closed_changes) and protect_closed_vote_entries (vote_entries_refuse_closed_vote, which checks both old.vote_id and new.vote_id) refuse any browser change. protect_committee_session_record (committee_sessions_keep_record) lets a browser move a session forward only. It also refuses any browser change of committee_id (42501, 'A session stays in the committee it was started in.'), and it refuses removing a session that holds a closed vote.
- **L48** (fixed). The policy 'A chair can open a vote' requires status = 'open' and null votes_for, votes_against, votes_abstain, passed and closed_at, so a vote cannot be inserted already closed with a chosen result.
- **L49** (fixed). A backfill (review_status = 'submitted' for position papers where it is null) runs before CHECK documents_position_paper_has_review_status. protect_documents_columns compares with 'is not distinct from', so a NULL can no longer get through is_review_reset.
- **L50** (fixed at integration). On public.documents, guides and shared files can be changed only by administrators, and a delegate can remove their own paper only while it waits for review. The Storage half came at integration (301761de), below.
- **L51** (fixed). protect_documents_columns lets a review_papers holder who did not upload the paper change only review_status, review_comment, reviewed_by, reviewed_at and updated_at.
- **L58** (fixed). schedule_events.last_notified_at holds a 30-minute cool-down. notify_schedule_changed is a BEFORE UPDATE OF starts_at, ends_at, location trigger that stamps the column, and guard_schedule_event_notified_at refuses a browser writing it.
- **L21** (fixed). All privileges are revoked from anon on the nine room tables. Comments corrected in realtime-auth.ts and committee-room-live.ts.
- **L22** (fixed). committee_paper_seats and amendment_seats are out of supabase_realtime. touch_paper_for_seat_change and touch_amendment_for_seat_change bump committee_papers.updated_at and the new amendments.updated_at instead.
- **I14** (fixed). The chair notes page gets isFilled instead of each seat holder's userId, so account ids no longer reach the browser.
- **I15** (fixed). clearRollCall refuses with 'That seat is not in this committee.' unless the seat is in the frame.
- **I16** (fixed). paperScreenActions calls mayRunRoom before any write and refuses with 'Only the dais changes the screen.'

### papers

Branch `security/papers` (50a97e19); migration `20261022143000_committee_papers_security.sql`; review clean after 2 fix rounds.

- **M12** (fixed). submit_paper works out the clauses in SQL from preamble_markdown and operative_markdown, using ten immutable public.paper_* helpers that run in linear time and that only the definer functions may execute; content sent that is not null and differs raises 22023. The client splitter it mirrors (LIST_ITEM_LINE in $lib/paper-clauses.ts, which the server runs on submit) was quadratic in the spaces after a marker, 6s for 100,000 spaces, and is now linear; a 300,000-line fuzz against the old pattern found no differences.
- **L17** (fixed). document_state lives in public.committee_paper_documents. RLS is on, authenticated has SELECT only and anon has nothing. The paper's authors can read it, and so can the dais once the paper is sent to it. The table is not in supabase_realtime, and the column on committee_papers is dropped. Writes go only through save_committee_paper_text.
- **L52** (fixed). readStoredDocument and readDaisReview decode through decodeStoredDocument inside try/catch, and fall back to the Markdown body when the stored value is malformed.
- **L53** (fixed). start_paper caps a seat at 5 papers it started that are still being written. add_paper_author logs every notice in paper_author_notices, under an advisory lock: 3 a day for one adder and added pair, and 30 a day for one adder. Past either limit the seat is still added, but nobody is told. the adder's seat is picked in a fixed order (order by seat_id limit 1).
- **L54** (fixed). Under the paper lock, propose_amendment allows a seat 10 waiting amendments on one draft, and 20 proposals to it a day, withdrawn ones included. start_thread allows 50 open threads per person per paper, position papers included, and notifies the authors of at most 20 new threads a day, counted in paper_thread_notices.
- **L55** (fixed). bump_seat_papers_live_epoch used to move the epoch only for papers with status 'writing', and return_paper never moves it. So when a seat changed hands while the dais held the paper, the newcomer was back on the old holder's channel once the paper was returned. The trigger now bumps every paper the seat writes, whatever its status. return_paper is the only path back to writing (no other migration sets status = 'writing'), and author-row changes were already bumped in every status, so every change to the author set now moves the epoch.
- **L56** (fixed). live-writers.ts resolves identity from the server's writer list by awareness id and drops unknown ids. createLivePaper reads the latest load's writers, and an unknown id triggers a throttled invalidateAll. Residual, inherent to unsigned awareness: one known co-author can claim another known author's id.

### exports-and-page-gates

Branch `security/exports-and-page-gates` (f2b50d7c); no migration; review clean after 0 fix rounds.

- **M9** (fixed). toCsvCell in client/src/lib/csv.ts now prefixes a cell that starts (after spaces) with =, +, -, @, tab or CR with an apostrophe and wraps it in quotes; ';' and tab were added to the characters that force quoting.
- **L71** (fixed). New client/src/lib/download-filename.ts exports contentDispositionFor(fileName), used by the participants, applications and fees CSV routes; plain filename kept to [a-z0-9.-] (other runs become one hyphen, capitals lowered) plus an RFC 5987 filename* with the real name percent-encoded whenever anything changed. The slug CHECK belongs to conference-lifecycle-limits.
- **L73** (fixed). parseApplicationListQuery in client/src/lib/applications.ts keeps ?committee= only when it has the shape of a uuid (new exported isUuid in client/src/lib/uuid.ts), else '' meaning any committee; application-table.ts gained a comment explaining that no other value reaches the contains filter. No other uuid[] filter exists in application-table.ts.
- **L10** (fixed). removeFromSeat in client/src/routes/manage/[slug]/participants/+page.server.ts now calls requirePermissionAndRank(..., 'decide_applications'); participantColumns.canRemove in client/src/lib/participant-access.ts is hasPermission(mine, 'decide_applications').
- **I7** (fixed). openQuickSession in client/src/routes/quick/[slug]/delegations/+page.server.ts now asks requirePermission(..., 'manage_committees') (conference-wide, the check the seats insert/update policies make) instead of requireCommitteePermission(..., 'run_room').
- **I9** (fixed). decideApplications/waitlistApplications/rejectApplications in client/src/lib/server/application-bulk-decisions.ts take the conference id and add .eq('conference_id', conferenceId) to the update; the applications page passes conference.id for bulkWaitlist and bulkReject, and waitlistOne/rejectOne pass review.application.conferenceId.
- **I27** (partly fixed). client/src/lib/private-details.ts gains privateDetailsAccessIn(mine, committeeId) and withheldPrivateDetails(row, access); withPrivateDetails/withExportDetails in client/src/lib/server/participants.ts take the reader's permissions and null each row by its committee; the review page load and loadReviewPanel null the applicant's details by privateDetailsAccess(permissions) before they reach the browser. At the final review (f84d2ee4), the organisers' delegation review page (manage/[slug]/delegations/[delegationId]) was found sending every member's date of birth, phone and dietary requirements as the views answered them, that is for any conference the reader helps run. withheldMemberDetails in client/src/lib/delegation-review.ts now nulls each member's details by what the reader holds on this conference: on the seat's committee for a seated member, conference-wide for the rest. It is tested in delegation-review.test.ts and the page's page.server.test.ts. What remains is narrow. The application review page and panel null by privateDetailsAccess(permissions), which asks whether the reader holds the permission anywhere on this conference, not on the applicant's committee. So a reader who holds a detail permission on one committee only can see the details of an applicant seated in another committee, and of an unseated applicant. Closing it means carrying committeeId on ReviewSeat (client/src/lib/application-review.ts) and the seat read in client/src/lib/server/application-review.ts, then using privateDetailsAccessIn(mine, seat.committeeId) when seated and no details for a per-committee-only holder when unseated. The applications and fees exports drop whole columns by privateDetailsAccess(permissions) and share only this residual.

### supply-chain-tooling

Branch `security/supply-chain-tooling` (fe8e041d); no migration; review clean after 0 fix rounds.

- **L75** (fixed). supabase/README.md no longer suggests `db reset --linked` for the cloud project; it says to reset from the dashboard, explains that [db.seed] in config.toml would load seed.sql, demo-seed.sql and walkthrough-seed.sql (about a hundred accounts with the published password) into the real project, and gives `db reset --linked --no-seed` for the unavoidable case.
- **L76** (fixed). docker-compose.yaml pins the tunnel to cloudflare/cloudflared:2026.8.3@sha256:51c9cefcb4569df44e1ad403ab1d3d8065aa8e84339bcfc6aee75502e1140339 with a comment on why and how to update; vite allowedHosts is ['.trycloudflare.com'], a suffix for the documented quick tunnel, not a bare wildcard, so it was left alone.
- **L77** (fixed). client/Dockerfile pins node:22.23.4-alpine3.24@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 and the comment now says what is pinned and how to update.
- **L78** (fixed). devalue floored at ^5.9.3 (resolves 5.9.4, inside the ^5.8.1 range svelte and @sveltejs/kit declare) and source-map-js at >=1.2.2 via `overrides` in client/pnpm-workspace.yaml, because pnpm 12.5.1 warns and ignores pnpm.overrides in package.json; `pnpm audit --prod --audit-level=high` added as wave-1 step `audit` in client/scripts/verify.mjs, pinned by a new test; build confirmed and build/ removed.
- **L79** (fixed). .claude/scripts/trello.mjs: safeFileName keeps only basename (either separator), allows [A-Za-z0-9._-], strips leading dots, caps at 120 chars, falls back to 'attachment'; pathInside resolves and refuses anything outside the directory; main-module guard so the helpers can be imported. At the final review (04562d7c) the download got the same care: the attachment's address comes from the card, and downloadAttachments used to send the key and token to whatever host it named. It now goes through trelloDownloadUrl, which answers an https address on api.trello.com (moving trello.com there) and null for any other host, a port or a user name, and the script stops rather than send the token elsewhere. .claude/scripts/trello.test.mjs tests the three helpers, and pnpm test:scripts, part of pnpm verify, runs it.
- **L80** (fixed). .claude/settings.json: Bash(pnpm:*) replaced by the repository's own scripts (verify, test, test:db, test:e2e, db:*, lint, format, check, house-rules, build, install) and the exec forms the checks use (svelte-check, svelte-kit sync, prettier, eslint, vitest run, playwright test); pnpm add/dlx/--dir and arbitrary exec now prompt. Deny rules for Read and Edit of ~/MunMeet/deploy/**, //**/.env, //**/.env.* and ~/.config/trello/**.
- **L81** (operator). The env files are already mode 600 on this host; data/tunnel/cert.pem (mode 600) still exists and must be deleted and the certificate revoked in Cloudflare: Part 1, section F.
- **I11** (fixed). The sweep now reports once per process, in capitals ('ORPHANED DOCUMENT FILES ARE NOT BEING REMOVED on this server: ...'), when it cannot make a service-role client, instead of a quiet line per request; the comments in service-role.ts say which file may call it and that not every environment has the key. The sweep runs on a schedule since integration (L61).
- **I12** (partly fixed, rest operator (Part 1 H)). SERVICE_ROLE_CLIENT_USERS in client/scripts/house-rules.mjs names only client/src/lib/server/orphaned-document-files.ts (stripe-webhook.ts does not exist) with an honest comment; service-role.ts no longer cites specs/02-architecture/*.md or claims every environment has the key, and since 04562d7c neither does orphaned-document-files.ts. The sweep the finding is about still never runs on the deploy: docker-compose.yaml passes no SUPABASE_SERVICE_ROLE_KEY to the app. Giving it the rotated key is the operator's step (Part 1, sections A and H).
- **I20** (fixed). All remaining production advisories were sanitize-html <2.18.0 (two moderate, one low), a direct dependency that sanitises rendered Markdown in client/src/lib/server/markdown.ts, so it was updated within its caret range to 2.18.1; `pnpm audit --prod` now reports no known vulnerabilities, so no audit ignore list was needed. The floors in pnpm-workspace.yaml carry a comment naming each advisory.
- **I21** (fixed). New house rule 'A Realtime channel that carries broadcast or presence is private': any src file (tests excluded) that calls .on('broadcast'|'presence'), sends type: 'broadcast' or calls .track( must open every .channel( with config: { private: true }; postgres_changes-only files may stay public. Comments are blanked, calls read with balanced parentheses. Helpers exported and tested; house-rules.mjs runs its rules only as the main module.

### Outside the packages

- **C1** (operator). The deploy stack runs on the CLI's built-in JWT secret, keys and database password. Nothing in the repository can change keys that live on the host: section A of Part 1 gives the deploy stack its own signing key, keys and password.
- **C2** (operator). pg-meta and the Studio MCP endpoint are reached through the tunnel. Section B limits the tunnel to the four API paths, and section A switches Studio off on the deploy stack.
- **H2** (operator). OrbStack publishes the stacks' ports on every interface of the Mac mini. Section C turns that off and adds a firewall rule as a second layer.
- **I2** (fixed during integration). `holds_public_role` and `role_is_public` moved to a new schema `private`, which PostgREST does not serve. The staff read policies keep working because they hold the functions by id. Migration `20261022150000_hide_public_role_helpers.sql`; test `client/tests/db/security-hidden-helpers.test.ts`, in which a signed-in stranger gets PGRST202 for both and a seated delegate still sees the Organiser and not the Volunteer.
- **I3** (by design, no change). The chair's review comment on a delegation paper is meant for the whole delegation, and a test already covers it.
- **I4** (documented, no change). `docs/roles-and-permissions.md` already says that a committee Chair holds `answer_directives`, and that a conference with a separate crisis staff removes it from Chair.
- **I6** (by design, no change). Any member of an organisation may create and publish a conference under it. Since C5, a browser cannot write the organisation's Stripe columns directly, and `set_stripe_account` binds an account once, for an owner or administrator only.
- **I17** (control that holds, no change). The comment actions take thread and comment ids from the form. The five definer functions they call carry the authorisation, as the review found.
- **I19** (control that holds, no change). Every `{@html}` sink goes through the server sanitiser. The dependency update under I20 moved sanitize-html to 2.18.1.
- **I24** (covered). The two tables the review names, seats and organizations, now have insert guards (C4 in seats-private-details; C5 and H3 in stripe-organizations and organisation-governance). The review found the other tables covered by other controls.
- **Default table grants** (noted, not changed). Supabase grants `anon` and `authenticated` TRUNCATE, TRIGGER and REFERENCES on every table it makes, and they remain on most of them, `organizations` and `organization_members` among them. PostgREST offers no way to use any of the three, so nothing reaches them from a browser; they were revoked on `invites` (migration `20261023121000`) only because that file was already taking its UPDATE grant away. Revoking them everywhere is tidy work for a later migration.
- **I28** (product decision). Age limits stay advisory. Section I of Part 1 asks the product owner whether to store guardian consent on the application.

### Integration

The packages were merged into `security/integration` one at a time. Seventeen of the
nineteen merges resolved conflicts by hand where two packages changed the same file. The
largest were the two `delegations.ts` modules, which internal-notes-grants,
codes-and-shape-checks and applications-and-delegations-windows each changed, and
`database.types.ts`, which every package with a migration regenerated. These commits
followed:

- `7534685f`, `d2843b9f`: I2. Migration `20261022150000_hide_public_role_helpers.sql` and the
  regenerated types, under "Outside the packages" above.
- `04d645fa`: `database.types.ts` regenerated against a stack holding every hardening
  migration, since each package had regenerated it against its own.
- `617432b4`: auth-hardening's current-password check (L43) and account-deletion's refusal
  sentences met in the settings `deleteAccount` action. The two refusal tests now send a
  password.
- `d5c68175`, `c7763368`: sixteen tests that set up their rows in a way another package now
  forbids. Some raised invoices against people not taking part (M10), some added
  organisation members from a browser (H3), and others emptied a seat by writing `user_id`
  (C4), read a delegation through the table (M18), accepted a delegation by a column write
  (L28) or wrote a paper without `review_status` (L49). Each now sets up its rows with the
  service role or the definer functions. No guard was loosened.
- `64a0c9f3`: L55 follows a committee paper's `live_epoch` on a public `postgres_changes`
  channel, and I21's house rule makes private every channel in a file that broadcasts. The
  watch moved to `client/src/lib/paper-epoch-watch.ts`, which broadcasts nothing. Realtime
  still checks the paper's read policy for every listener.
- `301761de`: **L50**, the Storage half. Migration
  `20261022160000_document_files_follow_permission.sql` recreates the update and delete
  policies on the documents bucket so a guide's or a resource's file follows
  `may_change_conference_document` and not its uploader. The uploader's own branch is kept
  only for a delegate taking back a position paper that waits for review.
- `f56dc5f8`: **L24**, the rest. Migration `20261022161000_delegation_join_code_limit.sql`.
  `preview_delegation` and `join_delegation` ask `private.limit_delegation_code_guesses`
  first and refuse after ten wrong codes in an hour, counted in `delegation_code_attempts`.
  Every delegation still holding a short code gets a fresh ten-character one, and the join
  page says "Too many wrong codes." while somebody is locked out.
- `ff355e62`: **L61**, the rest. Migration `20261022162000_unreferenced_uploads.sql`.
  `unreferenced_uploads` lists files in a person's own avatar or position-paper folder that
  no row has pointed at for an hour, and `queue_unreferenced_uploads` puts them on the
  cleanup queues; both are the service role's alone. `upload_folder_has_room` caps such a
  folder at five files, not counting files already queued, and the two upload policies ask
  it. The organisers' folders keep no limit. `client/src/hooks.server.ts` now has an `init`
  hook that runs `sweepStorage` every fifteen minutes; it queues the unreferenced uploads
  and empties both queues.
- `b1f6e395`: **I25**. Section 4 of `docs/roles-and-permissions.md` now says what the code,
  the migration comment and the roles editor already did: `administrator` on a per-committee
  role is every per-committee permission in the holder's committees, and nothing
  conference-wide. `client/tests/db/committee-permissions.test.ts` pins it.
- `f84d2ee4`: the final review. Migration `20261022170000_final_review_fixes.sql` closes
  L8's route through `ensure_chair_is_staff` (`committee_chairs_already_on_team`), bounds
  committee topics and the agenda (L65), and locks `revoke_seat` (L34, L35). In the app it
  tightens `pathOnThisSite` (M13), the delegation review page's member details (I27) and
  the topic forms (L65). The database tests are in
  `client/tests/db/security-final-review.test.ts`.
- `04562d7c`: the final review's verifier. Migration
  `20261022170100_chairs_leave_with_the_team.sql` takes a person's committee assignments
  away with their place on the team (L8). `pathOnThisSite` answers null for an address
  `new URL` cannot parse (M13), `trello.mjs` sends its token to Trello only and has tests
  (L79), and three comments that cited the removed `specs/` folder or a guard that changed
  were corrected.
- `4c0d9049`: what the probes of the final review found, each above under its finding.
  Migrations `20261022170200_team_rows_keep_their_person.sql` (L8),
  `20261023120000_seats_stay_in_their_committee.sql` (M4),
  `20261023121000_invitations_hold_while_sent.sql` (H1, M11, M15, L1) and
  `20261023122000_private_details_have_bounds.sql` (L67, L16). In the app: the committee
  editor's chair forms, adding and removing, follow the rank rule and say why in their
  toasts (L5), the setup step says why a committee was kept, a reserved seat or a role
  without `manage_committees` (M4), the team page offers "Send again" and
  "Revoke" only where the database allows them, deleting an account signs the person in
  again (L43), the `/confirm` page and the notification links ask `pathOnThisSite` (M13),
  and the welcome form bounds the phone and emergency contact (L67).
  `docs/roles-and-permissions.md` now says what the triggers on `committee_chairs` and
  `conference_staff` do, when an administrator may chair a committee without being on the
  team, that a browser changes only the title of a staff or chair row, and that an
  invitation goes with its sender's `manage_team`, rank and permissions. Runbook section D
  leaves the server's own IP out of the Supabase host's rate limits and counts its sign-ins
  on the app's host, so that the limits cannot lock everybody out.
- `cafd5e94`: the third and fourth checks of M4, each above under its finding. Migration
  `20261023120000_seats_stay_in_their_committee.sql`, unreleased and amended in place, has
  a seat being added wait for a committee delete through an advisory lock that no edit of
  the committee takes, answers "it has delegates" before it locks any seat, and has
  `remove_delegation_seat` hold the delegation before the seat (M4, L31). The setup step
  asks `manage_committees` before a change to a committee as well, hides its committee
  controls from somebody who does not manage every committee, and the Launch step no
  longer suggests committees to them. The Launch step's e2e test puts its banner in the
  draft's own folder (I22).

### Refuted by the review itself

The review lists three refuted findings at its end. This work did not change anything for them:
- `add_paper_author` without consent: `withdraw_paper` gives the added delegate a way out. Since the papers package, `start_paper` caps papers in writing per seat (L53).
- One shared IP for server-side sign-ins: no limiter runs on the CLI stack, so nothing can lock the server out today. Section D adds edge limits that count the server's sign-ins by the visitor's IP on the app's own host and leave the server's IP out of the rules on the Supabase host, so that the limits do not bring the lockout with them.
- The `getClaims` HS256 fallback: tokens are ES256. The built-in key is C1.
