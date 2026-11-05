# MUNMeet security review, 10 October 2026

Branch `feature/mvp` at `dbffc502`. Read-only review: nothing was changed, started, migrated or reset.

## Summary

| Severity | Count | What it means here |
| --- | --- | --- |
| Critical | 5 | Anyone on the internet, or any fresh account, can read or change data they must not, at scale |
| High | 5 | A signed-in participant or a LAN neighbour can escalate or read other people's private data |
| Medium | 20 | Limited disclosure or abuse that needs an existing role, or a bypass of a rule the UI enforces |
| Low | 81 | Hardening: races, missing limits, retention, headers, supply chain |
| Informational | 28 | Observations, controls that hold, design decisions worth recording |

Three refuted findings are listed at the end, with the reason each one fell.

The single biggest fact: the live site is a Supabase CLI development stack published to the internet through the Cloudflare tunnel, with the CLI's built-in secrets, Studio, pg-meta and the S3 endpoint all reachable on `supabase-munmeet.umarbek.dev`. Until that is fixed, nothing in the database or buckets is private, and every RLS finding below is moot for an anonymous attacker because they do not need to go through RLS at all. The data there today is fabricated test data that is reset nightly, which limits the damage now, but the same compose file and config are the path to a real launch, and the Stripe and invite findings become real money and real accounts the day they are configured.

### Do these first

1. Stop the stack being an open database (C1, C2, C3, H2): generate signing keys and non-default API keys for the deploy stack, switch Studio, analytics and the S3 protocol off there, add Cloudflare rules that only pass `/auth/v1/`, `/rest/v1/`, `/storage/v1/` (not `/storage/v1/s3/`) and `/realtime/v1/`, turn OrbStack's expose-ports-to-LAN off, and change the Postgres password. Then rebuild the app with the new publishable key.
2. Add a column guard on `seats` so browsers cannot write `user_id`, and tighten `private_details_user_ids` (C4).
3. Before `STRIPE_SECRET_KEY` is ever set: insert guard on the Stripe columns, metadata check on every account-link path, unique index on `stripe_account_id`, and stop publishing the id (C5).
4. Make invitations depend on a confirmed email, or turn confirmations on with real SMTP, and stop `list_my_invites` returning tokens (H1).
5. Column guards on `organizations.created_by` / `is_personal` and `conference_roles.conference_id`, and owner-only rules on `organization_members` (H3, H4, M1, M15, M16).
6. Column-level privileges or separate tables for `internal_note` on applications and delegations, the Stripe columns and the profile flags (M7, M8, L3, L4).
7. Auth hardening: OTP length 10 and a 15-minute expiry, Cloudflare rate limits on the auth endpoints, Turnstile, `minimum_password_length = 8`, `secure_password_change = true` (H5, M20).
8. The three quick code fixes: `safeRedirectPath` (M13), CSV formula escaping (M9), and a Content-Security-Policy (L41).

### How this was done

27 parallel finders, each with one shard of the surface (9 database shards over all 58 migrations, 8 server shards over `client/src/lib/server` and every route server file, 10 cross-cutting sweeps such as XSS, redirects and sessions, infrastructure, secrets and supply chain, authorisation consistency, realtime, storage, money and codes, input validation, framework pitfalls). 211 raw findings were merged to 124, each verified by an independent agent prompted to refute it and another prompted to confirm and rate it, with a tiebreak on disagreement. A completeness critic then briefed five targeted second-round sweeps (the seat-insert chain, insert-versus-update guard parity, the roles spec against the live policies, minors' data lifecycle, auth rate-limit keying), which added 20 findings. 221 agents ran, none failed. The first attempt hit the Fable usage cap, so the 9 cross-cutting finders, all verification, the critic and round two ran on Opus; the 18 finders that had already finished were replayed from cache.

I spot-checked the code behind every critical and high item myself: the seats policies and `private_details_user_ids`, `set_stripe_account` and the update-only Stripe trigger, the `organization_members` and `conference_roles` policies, `safeRedirectPath`, the absence of any `email_confirmed_at` check or column-level grant in the migrations, `supabase/config.toml`, `docker-compose.yaml`, the published port bindings of the running containers, and the Kong route table of the running stack (read from the container; `/pg/`, `/mcp`, `/rest-admin/v1/` and `/analytics/v1/` carry only the cors plugin). I did not read the deploy checkout under `~/MunMeet/deploy` or the `.env` files myself; the agents did, with values redacted, and reported that the deploy config differs from the repo's only in project id and ports, that the publishable key in use is the CLI default, and that `STRIPE_SECRET_KEY` is unset.

---

## Critical

### C1. The published Supabase stack runs on the CLI's built-in secrets

- Where: `supabase/config.toml:208` (`signing_keys_path` commented out, no `jwt_secret`), `docker-compose.yaml:71` (tunnel maps `supabase-munmeet.umarbek.dev` to Kong), `client/.env.example:6-8` (the default secret key, with a comment that it is the same on every machine).
- Who: anyone on the internet, with no account. The CLI's JWT secret, ES256 signing key, publishable key and secret key are compiled into the CLI binary and published in its docs.
- What: the public hostname fronts the Kong of a Supabase CLI stack started with those defaults. An agent read the running deploy stack's environment and confirmed it. With the default secret key a request runs as `service_role`, which bypasses every RLS policy on PostgREST, Storage and Realtime and reaches the GoTrue admin API, so any account can be taken over and any row read or written. With the default JWT secret, a token can be signed for any user id. Nothing in the repo filters paths or keys at the tunnel.
- Fix: for the deploy checkout, run `supabase gen signing-key`, store the file outside the repo and set `auth.signing_keys_path` to it; set non-default API keys for that stack; stop and start it; rebuild the app with the new publishable key; treat every existing session as compromised. At the edge, block requests whose `apikey` or `Authorization` header carries the default secret key or the legacy `service_role` JWT, and block `/auth/v1/admin`. Longer term, serve production from hosted Supabase or a self-hosted stack whose Kong has key-auth and ACLs on the admin routes. The CLI stack is a development tool.

### C2. pg-meta and the Studio MCP endpoint answer on the public hostname with no authentication

- Where: `supabase/config.toml:99-100` (`[studio] enabled = true`); the Kong route table of the running stack: `/pg/` to pg-meta, `/mcp` to Studio, `/rest-admin/v1/` and `/analytics/v1/`, each with only the cors plugin.
- Who: anyone; the hostname is compiled into the app's JavaScript as `PUBLIC_SUPABASE_URL`.
- What: pg-meta runs whatever SQL it is sent as the `postgres` role, so a visitor can read and change every application table and `auth.users` without any key. Rotating the keys in C1 does not close this route.
- Fix: in the Cloudflare dashboard, allow only `/auth/v1/`, `/rest/v1/`, `/storage/v1/` (excluding `/storage/v1/s3/`), `/realtime/v1/` and `/graphql/v1` if used; block `/pg/`, `/mcp`, `/rest-admin/`, `/analytics/`, `/pooler/`, `/functions/`. In the deploy checkout's `config.toml` set `[studio] enabled = false` and `[analytics] enabled = false` (or start with `-x studio,postgres-meta,logflare,vector`), record it in the list of local changes `redeploy.sh` carries forward, restart, and confirm `/pg/` and `/mcp` fail through the tunnel.

### C3. The S3 protocol is on, with the CLI's default access keys, and bypasses RLS

- Where: `supabase/config.toml:163-164`.
- Who: anyone who can reach the hostname and knows the CLI's default S3 key pair, which `supabase status` prints on every machine.
- What: S3 keys act as `service_role` for Storage. Every `storage.objects` policy (the careful `may_upload_conference_document` and `may_change_conference_document` checks) is skipped, so every private position paper, background guide and resource in `documents` can be listed, downloaded, replaced or deleted, and every public avatar, logo and banner replaced. The app never uses S3.
- Fix: set `[storage.s3_protocol] enabled = false` explicitly (the CLI default is `true`, so removing the section is not enough), restart, and check `pnpm db:status` prints no S3 section. Block `/storage/v1/s3/*` at the edge as defence in depth.

### C4. Any signed-in user can seat any account in a conference of their own and read that person's email, phone, date of birth, dietary needs and emergency contact

- Where: seats insert and update policies `supabase/migrations/20261007180000_committee_permissions.sql:93-125`; the seat branch of `private_details_user_ids` in `supabase/migrations/20261007140000_private_details.sql:62-67`; the two views at `:80-104`; every profile readable by every signed-in user `supabase/migrations/20260915130000_people_conferences_staff_invites_notifications.sql:1063-1067`; the one-seat-per-person check in `check_seat_allocation` `supabase/migrations/20261007150000_applications_permissions.sql:918-983`.
- Who: any account. Sign-up is open and needs no confirmation.
- What: creating an organisation needs only `created_by = auth.uid()`, and a trigger makes the creator its owner. Owners hold every permission on every conference of the organisation, draft or not. The seats policies ask only for `manage_committees` and let the caller write any column, including `user_id`, and no trigger checks that the seated person applied, was invited or agreed. `private_details_user_ids` then counts that seat as participation and the two staff views return the person's whole `profile_details` row. The seat notification triggers fire only on update, so an insert tells the victim nothing. The per-committee scoping of the views and the column filtering in the exports are correct in themselves; they only limit staff of a genuine conference, not a self-made one. The existing `private-details.test.ts` fixture seats a stranger directly and expects their details back, so the test suite documents the hole.
- Fix: add a `BEFORE INSERT OR UPDATE` guard on `seats` that, for `current_user in ('anon','authenticated')`, refuses a non-null `user_id`, `application_id` or `allocated_at` on insert and any change to them on update, with one exception for a delegation head changing `user_id` to a member of the same delegation. Seating then goes only through the security-definer allocation functions, which already check `decide_applications` and the existence of an application or delegation. Tighten the seat branch of `private_details_user_ids` to seats whose `application_id` is a non-draft application by the same user or whose `delegation_id` is a delegation the user belongs to. Rewrite the `giveSeatTo` fixture to use `accept_application`, and add tests that a fresh owner cannot insert a stranger's `user_id`, that a stranger never appears in either view, and that the head's narrow write still works.

### C5. Any organisation admin can bind another organisation's Stripe account id, and the server then mints login and onboarding links for it

- Where: `set_stripe_account` `supabase/migrations/20260919120000_fees_and_invoices.sql:665-683` (security definer, only `is_organization_admin`, granted to authenticated); `protect_stripe_columns` is `before update` only, `supabase/migrations/20260915130000_people_conferences_staff_invites_notifications.sql:709-712`; `organizations` readable by anon including `stripe_account_id`, `supabase/migrations/20260915120000_initial_schema.sql:172-176`; `openStripeDashboard` and `connectStripe` in `client/src/routes/manage/organizations/[orgSlug]/+page.server.ts:590-656`; `createLoginLink` in `client/src/lib/server/stripe.ts:173-180`.
- Who: any signed-in user, since anyone can create an organisation and own it. Latent today: `STRIPE_SECRET_KEY` is unset in the deployment, so both Stripe actions refuse. It becomes live the moment the key is set. What works today is forging `stripe_onboarding_completed_at`, which is the publish checklist's "Stripe connected" gate.
- What: two write paths. The RPC accepts any text as the account id with no provenance check, and because it runs as its owner the update trigger never fires. Separately, the trigger does not cover inserts, so an organisation can be created with both Stripe columns already set. Every organisation's `stripe_account_id` is public, so a real onboarded id is easy to copy. Once bound, the dashboard action calls `accounts.createLoginLink` with the platform key and redirects the caller into the victim's Express dashboard (balance, payouts, bank account); the connect action and `/api/stripe/connect/refresh` open onboarding for it; the planned webhook and Checkout would route the attacker's conference payments to whatever id is stored. Stripe's SMS gate on Express login may stop part of this.
- Fix: create accounts with `metadata.organization_id` and, on every path that uses a stored id (connect, dashboard, refresh, return, future webhook and Checkout), call `accounts.retrieve` and refuse unless the metadata matches. New migration: extend `protect_stripe_columns` to `before insert or update` and refuse non-null Stripe columns from anon or authenticated on insert; make `set_stripe_account` refuse when an id is already stored, or revoke it from authenticated and call it with the service role right after account creation; add a partial unique index on `organizations(stripe_account_id)`; stop publishing the id with column-level select grants. Add tests for the insert path, a foreign id, and two organisations sharing one id.

---

## High

### H1. Email confirmation is off, so whoever registers an invitee's address first can accept their invitations

- Where: `supabase/config.toml:265` (`enable_confirmations = false`); `accept_invite` compares `invite.email` with `auth.users.email` and never checks `email_confirmed_at`, `supabase/migrations/20261007120000_conference_roles.sql:1266-1292`; `list_my_invites` returns the secret token for every pending invite matching the caller's unproven email, `:1403-1433`; register signs the visitor straight in, `client/src/routes/register/+page.server.ts:87-89`.
- Who: an anonymous visitor who knows or guesses an invitee's address before that person has an account. They can also squat an address first and wait: `list_my_invites` will show any invite sent to it later, token included.
- What: this reaches organisation `owner` and `admin` roles and any conference team role. The attacker can sign up through GoTrue directly, so changing only the register page would not help. Auth mail goes to the local sink today (L36), so the real invitee never gets a link to claim the invite first.
- Fix: in a new migration, add `and account.email_confirmed_at is not null` to the email lookups in `accept_invite` and `list_my_invites`; stop returning `token` from `list_my_invites` and accept by invite id for a matching confirmed caller; turn `enable_confirmations` on once real SMTP exists, since until then confirmed-only acceptance would block every new invitee; add a db test for a matching but unconfirmed account.

### H2. Postgres with the default password, Studio and the mail sink listen on every network interface of the Mac mini

- Where: `supabase/config.toml:78-80` (`network_restrictions` off and ignored locally); `docker ps` shows every Supabase port of the dev, clone and deploy stacks bound to `0.0.0.0`; `docker-compose.yaml:109-110` says nothing is published on the host, which is true of the app container only.
- Who: anyone on the home or office LAN, and peers on the Tailscale-style interface, with no account and without touching Cloudflare.
- What: on the deploy stack that exposes Postgres on 54422 with the CLI's default `postgres` password (bypasses RLS even where it is not a literal superuser), Studio on 54423 with no login, and Mailpit on 54424 holding every confirmation and reset email, which is an account-takeover path on its own. OrbStack's `docker.expose_ports_to_lan` is on and the macOS firewall allows the OrbStack helper.
- Fix: `orbctl config set docker.expose_ports_to_lan false` (and `machines.expose_ports_to_lan false`), then restart OrbStack; the tunnel is unaffected because it reaches Kong over the Docker network. As depth: block incoming for OrbStack Helper and Docker in the macOS firewall or add a pf rule dropping 54320 to 54429 off loopback; change the deploy database's `postgres` and `supabase_admin` passwords; stop Studio and Mailpit on the deploy stack.

### H3. An organisation admin can rewrite `created_by` and `is_personal`, hijacking another user's personal "Quick sessions" organisation

- Where: organizations update policy `supabase/migrations/20260915130000_people_conferences_staff_invites_notifications.sql:1106-1111` (only `is_organization_admin` on both halves; the sole column guard covers the two Stripe columns); `create_quick_session` finds the personal organisation by `created_by = me and is_personal`, `supabase/migrations/20261001120700_quick_sessions.sql:241-245`; the partial unique index at `:84-86`; "Organization admins can add a member" lets an admin insert any `user_id`, `:1151-1155`.
- Who: any signed-in user who creates an organisation, against any user who has not yet started a quick session. Profile ids are readable by every account.
- What: re-pointing `created_by` to the victim and setting `is_personal` makes the attacker's organisation the victim's personal one, and the unique index stops the victim ever getting their own. Alone that is a permanent denial of quick sessions. Adding the victim as a member without consent completes the hijack: every quick session they start lands in the attacker's organisation, where the attacker is an owner and so an administrator of the session (room, speakers, votes, chair notes). The victim never sees the organisation because `manage.ts` hides personal ones.
- Fix: new migration with a `before update` trigger on `organizations` that raises when `created_by` or `is_personal` changes and `current_user in ('anon','authenticated')`; in `create_quick_session` also require an owner row in `organization_members` for the caller and report a mismatch rather than use the organisation; narrow the member insert policy so membership comes only through `accept_invite` (or at least refuse inserts into personal organisations).

### H4. A role manager can move a role to another conference and rewrite it to administrator while its memberships stay on the victim conference

- Where: `conference_roles` update policy `supabase/migrations/20261007120000_conference_roles.sql:926-938` (USING checks the old row, WITH CHECK the new row, nothing pins `conference_id`); `holder_has_permission` and its siblings join `member.role_id = role.id` without `role.conference_id = member.conference_id`, `:327-335`; the only trigger on the table is `set_updated_at`, `:116-119`.
- Who: a team member with `manage_roles` conference-wide who is not an administrator. Everyone can own a second conference, since anyone can create an organisation.
- What: moving a role below their rank to a conference they administer, then setting `permissions = {administrator}` with scope `conference`, passes both halves of the policy. The membership rows stay on the victim conference, so every holder of that role (the preset Chair or Volunteer, or an accomplice added through `manage_team`) becomes an administrator of it: every private detail, invoice, application and seat. They can move the role back afterwards.
- Fix: new migration with a `before update` trigger on `conference_roles` that raises when `conference_id` changes; add `unique (id, conference_id)` on `conference_roles` and a composite FK `(role_id, conference_id)` on `conference_role_members` and on `invites`; add `role.conference_id = member.conference_id` to the joins in the permission helpers; db test where a deputy who owns a second conference tries to move a role.

### H5. Email OTP verification has no throttle, so a 6-digit recovery or magic-link code can be guessed within its hour

- Where: `supabase/config.toml:246-248` (limits that this stack never applies), `:271` (`otp_length = 6`), `:273` (`otp_expiry = 3600`), `:253` (captcha off); `client/src/routes/forgot-password/+page.server.ts:44`; `client/src/routes/auth/confirm/+server.ts:44` (GET, no throttle).
- Who: an anonymous attacker, against any account made since the last reset.
- What: GoTrue only keys its per-IP limits on a header named by `GOTRUE_RATE_LIMIT_HEADER` or on `sb-forwarded-for`, and the CLI sets neither, so the `[auth.rate_limit]` values are inert, not shared. The verify handler has no failed-attempt counter or lockout. A fresh code can be minted for any address through recovery or magic link, stays valid for an hour, and can be guessed against `/auth/v1/verify` on the public hostname or the app's `/auth/confirm`. Because auth mail goes to the local sink, the target is never warned. This was established by reading the pinned CLI binary and GoTrue version, not by testing.
- Fix: in `[auth.email]` set `otp_length = 10` and `otp_expiry = 900`; the app's links carry `token_hash`, so nobody types the code. Add Cloudflare rate-limit rules keyed on client IP for `/auth/v1/verify`, `/auth/v1/recover`, `/auth/v1/otp` and `/auth/v1/magiclink` on the Supabase hostname and for `GET /auth/confirm` and `POST /forgot-password` on the app. Configure real SMTP so users learn when a reset was requested.

---

## Medium

### M1. An organisation admin can make themselves owner and demote or remove the real owners
`supabase/migrations/20260915130000_people_conferences_staff_invites_notifications.sql:1151-1171`. All three `organization_members` policies stop at `is_organization_admin`, which counts owner and admin alike, and `prevent_last_owner_removal` returns early when the old role is not owner, so promotion is never checked. The owner-only rule lives only in the `changeRole` action. Fix: add `is_organization_owner(org_id)` and require it in insert, update (USING for the old role, WITH CHECK for the new) and delete whenever the row is or becomes `owner`; tests for self-promotion, inserting an owner, demoting and removing one.

### M2. A published conference can be set back to draft and then deleted with its applications
`supabase/migrations/20261007160000_money_permissions.sql:176-190`; `client/src/lib/server/conferences.ts:1021-1037`. The UI reaches it in two clicks (unpublish is allowed while nobody is seated, "Delete draft" checks only status), and through PostgREST an `edit_conference` holder can unpublish a free conference even with seated delegates, then delete it with everything cascading; `archived` to `draft` is not refused either. Fix: add `first_published_at`, set it in the conferences trigger and refuse changes from browsers; extend the delete policy with `first_published_at is null`; move the "nobody seated" and archived checks into the trigger; tests.

### M3. A seated delegate can overwrite or delete the bytes of an approved or past-deadline position paper in Storage
`supabase/migrations/20260921120000_documents_schedule_announcements.sql:1286-1300` (storage update policy, owner branch); `supabase/migrations/20261007180000_committee_permissions.sql:597-605` (`may_upload` has no deadline or review check). The review rules exist only on the `documents` row; an upsert on the existing path replaces the PDF a chair approved while the row still says approved, and delete plus re-insert does the same. Fix: drop the `owner` branch for the `position-papers` folder in the update policy; let the owner delete a position-paper object only when no row points at it or the row is still unreviewed and before the deadline; make `may_upload_conference_document` refuse a path a row already points at; tests.

### M4. A conference-wide `manage_committees` holder can seat, unseat and re-point delegates by writing seat columns directly
`supabase/migrations/20261007180000_committee_permissions.sql:93-125`. The policies have no column restriction, so a "Head of academics" style role can set or clear `user_id` (clearing deletes the delegate's paper and draft), change `application_id`, `delegation_id` and `allocated_at`, and empty then delete a committee around the `committee_has_delegates` guard. Invoices and application statuses drift from seats. Fix: the same `protect_seats_columns` trigger as C4, allowing the writes only for `decide_applications` holders and the delegation-head exception; tests that a manage_committees-only member can still rename, reorder and add empty seats.

### M5. `is_conference_participant` admits rejected, withdrawn and self-made draft delegations
`supabase/migrations/20260918120000_applications_delegations_seat_links.sql:247-259`; used by the announcement, document and schedule read policies in `20260921120000:836-844`. The delegation branch has no status filter, so one `create_delegation` call at an open conference makes a stranger a participant, and rejected or withdrawn applicants keep the status for ever. Fix: new definitions of `is_conference_participant` and `participant_conference_ids` with status filters, plus an `is_conference_admitted` (seat, accepted application or accepted delegation) for the `delegates` audience; tests.

### M6. Applications and delegations can be submitted to a published conference whose organiser has not opened applications
`supabase/migrations/20260918120000_applications_delegations_seat_links.sql:2364-2367` and `:2440-2444`, `create_delegation` at `:1266-1268`. `application_open_mode = 'manual'` (the creation default) with a null `applications_open_at` means "not yet open" to the client and "open" to every database check, and the early submitters sit first in the review queue. Fix: one helper `conference_takes_applications(conference_id, route)` used by both insert policies and `create_delegation`; refuse a draft-to-submitted change while the window is shut; tests for the manual-unopened case.

### M7. Applicants can read the organisers' internal note and who decided, on their own application
`supabase/migrations/20260918120000_applications_delegations_seat_links.sql:2339-2343`; `applications_with_applicant` is `security_invoker`, `supabase/migrations/20261010120000_application_teams.sql:61-74`. Policies decide rows, not columns, and no column-level grant exists anywhere in the migrations; only the server's column lists hide the note, and the browser holds the user's JWT. The UI promises the note stays with the organisers. Fix: revoke table-level select from `authenticated` and grant an explicit column list without `internal_note` and `decided_by`; give organisers a security-definer path or a separate notes table; adjust the view and the tests.

### M8. Any delegation member, and any chair with `read_participants`, can read the delegation's `internal_note`
`supabase/migrations/20260918120000_applications_delegations_seat_links.sql:2416-2420`; `supabase/migrations/20261007140000_private_details.sql:135-139`. Same shape as M7 on `delegations`; the second policy hands the note to chairs for every delegation seated in their committee. Fix: move the note to `delegation_internal_notes` with policies on `read_applications` and `decide_applications`, or revoke and re-grant columns plus a definer function for organisers; test that a member and a head cannot select it.

### M9. CSV exports write applicant-typed cells verbatim, so a leading `=`, `+`, `-` or `@` becomes a spreadsheet formula on the organiser's machine
`client/src/lib/csv.ts:29-49`; rows built in `client/src/lib/applications.ts:1416-1435`, `client/src/lib/participants.ts:482-505`, and the fees export. Name, institution, motivation, answers, phone and emergency contact are all unrestricted. `;` is not quoted, so European Excel can start a formula mid-cell. Fix: in `toCsvCell`, prefix cells that start (after spaces) with `=`, `+`, `-`, `@`, tab or CR with `'` and quote them; add `;` and tab to the quote list; unit tests for each case and update the existing semicolon test.

### M10. Invoice managers can raise an invoice against any user on the platform
`supabase/migrations/20260919120000_fees_and_invoices.sql:454-489` (`guard_invoice_insert` checks only that a payer is named); policy in `20261007160000_money_permissions.sql:150-154`. Anyone can own an organisation and so hold `manage_invoices`; profile ids are enumerable. The victim gets a notification and an invoice page showing attacker-written payment instructions, so this is a payment-phishing channel at scale, and once Checkout exists the pay button would charge the victim into the attacker's connected account. Fix: in `guard_invoice_insert`, for browser callers require the seat's `user_id` to be the payer, the payer to head the delegation, or an application, membership or seat of the payer at that conference; update the `createInvoiceOwedByNewPayer` fixture and add a stranger test.

### M11. A team manager can invite their own address and accept it, taking any role below their rank
`supabase/migrations/20261007120000_conference_roles.sql:1211-1226` (invites insert policy, nothing about email), `accept_invite` at `:1288-1317` inserts the membership and upserts the caller's own title as security definer, bypassing the `user_id <> auth.uid()` rule at `:966-974`. Reachable through the committee page's `inviteChair` action without PostgREST. Roles below one's rank can carry permissions one lacks (contact and welfare details, for example). Fix: in `accept_invite` refuse `invite.invited_by = me` for conference invites; in the insert policy refuse one's own email; tests.

### M12. `submit_paper` freezes caller-supplied clause content that is never compared with the paper's stored text
`supabase/migrations/20261008120100_committee_papers.sql:2038-2088` and `:2167-2168`; `is_valid_paper_content` checks shape only, `:1185-1234`. The version is what the committee introduces, amends, projects and prints, while the dais approved and signatories signed the Markdown. The test "freezes only clauses it can read" accepts differing content, so it documents the gap. Fix: derive the clauses in SQL from `preamble_markdown` and `operative_markdown` and drop the parameter, or canonicalise and compare, refusing with `22023`; add a test for mismatching content.

### M13. `safeRedirectPath` lets `/\host` through, so every `next` redirect is an open redirect
`client/src/lib/auth.ts:143-150`; used by login, register, welcome, `/auth/confirm` and the notification open action; `isFlashUndo` in `client/src/lib/flash.ts:94` has the same regex. Browsers treat a backslash after the leading slash as a second slash, and tab or newline forms slip through too. A signed-in victim who opens such a `/login?next=` link is sent off-site with no click. `sameSitePath` in `client/src/lib/confirmation.ts:98-109` already does this right. Fix: parse with `new URL(next, 'https://munmeet.invalid')`, return `/` when the origin differs, else return `pathname + search + hash`; use it in `isFlashUndo`; unit tests.

### M14. Applicants can change a submitted application, or submit a draft, after the window closes
`supabase/migrations/20260918120000_applications_delegations_seat_links.sql:2373-2381` (update policy has no window test, unlike the insert policy); `guard_application_update` at `:583-640` re-stamps `submitted_at`. Only the apply page checks `canApply`. Fix: in the applicant branch of `guard_application_update`, allow only a pure withdrawal unless the conference is published, takes individual applications, and is inside its window (matching `canApply`, including manual mode); tests for each late case and for withdrawal still working.

### M15. An organisation admin can issue an `owner` invitation
`supabase/migrations/20261007120000_conference_roles.sql:1211-1226` (organisation branch asks only `is_organization_admin`), `accept_invite` at `:1292-1298` honours any of the three roles; the form's exclusion of owner lives in `client/src/lib/organizations.ts` only. Fix: in the policy require an owner for `role = 'owner'` or refuse owner invitations outright; have `accept_invite` refuse `owner` or check `invited_by` is still an owner, so pre-fix rows cannot be redeemed; tests.

### M16. `removeMember` lets an admin remove an owner
`client/src/routes/manage/organizations/[orgSlug]/+page.server.ts:531-533`; the delete policy at `20260915130000:1164-1170` is equally permissive; `prevent_last_owner_removal` protects only the last owner. With M1 the last one goes too. Fix: in `removeMember`, refuse an admin removing an owner; hide the button for admins on owner rows; replace the delete policy with the owner rule from M1.

### M17. Session notes are keyed to `run_room` while the page and the spec require `write_chair_notes`
`supabase/migrations/20261007180000_committee_permissions.sql:1544-1556` (all three policies on `committee_session_notes`); page checks in `client/src/routes/conferences/[slug]/committees/[committeeSlug]/chair/notes/sessions/[sessionId]/+page.server.ts:17-43`; spec `docs/roles-and-permissions.md:568` and `:643`. A trimmed "runs the clock only" role reads and overwrites every session's notes (attributed, not anonymous; no delete). Fix: `alter policy` the three to `permitted_committee_ids('write_chair_notes')` / `has_committee_permission(..., 'write_chair_notes')`, like `chair_notes`; tests with `teamMemberWith(room, ['run_room'], 'committees')`.

### M18. Chairs can read whole delegation rows, including the join code, and use it to join the delegation
`supabase/migrations/20261007140000_private_details.sql:122-139` (`participant_list_delegation_ids` and the read policy); `join_delegation` in `supabase/migrations/20260920190000_join_delegation_conference_gate.sql:32-101` has no staff exclusion. A chair becomes a member and reads the delegation's position-paper drafts in every committee and its announcements. Fix: drop the row policy and replace it with a `security_invoker = false` view of id, conference, name, institution, country and status; refuse staff in `join_delegation` or the members insert trigger; tests.

### M19. A delegation head reads members' whole private-details row, with no end date
`supabase/migrations/20260918120000_applications_delegations_seat_links.sql:2605-2617`; the app reads only phone, dietary needs and date of birth, `client/src/lib/server/delegations.ts:2010-2013`. Members consent on joining and are told, so this is minimisation and retention, not a missing check: email, date of birth and the emergency contact are exposed for as long as the membership row exists, through draft, rejected, withdrawn and archived states. Fix: replace the policy with a definer view returning `user_id`, `phone` and `dietary_requirements` for members of delegations the caller heads; drop date of birth from the head's read; add an end-date rule if retention is wanted; update the privacy text and join card; test that a head cannot select email or emergency contact.

### M20. Password sign-in has no throttle, no captcha and a 6-character server minimum
`supabase/config.toml:221-224`, `:246` (inert, see H5), `:253`; `client/src/routes/login/+page.server.ts:53`; app minimum is 8 in `client/src/lib/auth.ts:14` but GoTrue's `/signup` and `/user` accept 6. Dictionary and credential-stuffing attempts are limited only by bcrypt cost, through the app or `/auth/v1/token` directly. Fix: Cloudflare rate limits on `POST /auth/v1/token*` and on the app's login, register and forgot-password actions; enable `[auth.captcha]` with Turnstile and pass `captchaToken` from the three actions; `minimum_password_length = 8` and `password_requirements = "letters_digits"` with matching app wording.

---

## Low

Grouped by theme. Each line: what, where, fix.

### Organisation and team governance

- **L1.** Any signed-in user can push free text into any registered user's notification bell through an organisation invitation; `invites.role`, the organisation name and the inviter's name all go into the title unchecked. `supabase/migrations/20261007120000_conference_roles.sql:1491`. Add a role check constraint, fixed wording in `notify_invite`, length limits, and a per-inviter hourly cap.
- **L2.** `prevent_last_owner_removal` counts owners without a lock, so two owners leaving at once can leave none. `supabase/migrations/20260915130000_people_conferences_staff_invites_notifications.sql:784`. Take `pg_advisory_xact_lock` on the organisation id before counting.
- **L3.** `organizations` exposes `stripe_account_id`, `stripe_onboarding_completed_at` and `created_by` to anonymous visitors. `supabase/migrations/20260915120000_initial_schema.sql:172`. Revoke table-level select and grant the public columns only.
- **L4.** Every signed-in user can read every profile, including `is_platform_admin` and onboarding state, 1000 rows a page. `supabase/migrations/20260915130000_people_conferences_staff_invites_notifications.sql:1063`. Same column-grant treatment.
- **L5.** Team managers can assign themselves to any committee and unassign people above their rank. `supabase/migrations/20261007120000_conference_roles.sql:1089`. Add `can_manage_member(conference, user_id)` to the `committee_chairs` policies rather than a bare self-check.
- **L6.** `conference_staff` update applies no rank rule and no length limit, so a team manager can rewrite the public title of anyone above them. `supabase/migrations/20261007120000_conference_roles.sql:1052`. Recreate the policy with `can_manage_member` and cap the title.
- **L7.** Role giving is governed by position alone: a manager can hand a lower-positioned role carrying `administrator` to a second account of their own. `supabase/migrations/20261007120000_conference_roles.sql:966`. Check `can_grant` against the role's permissions in the membership and invite insert policies.
- **L8.** Team managers can insert `conference_staff` rows for any account without an invitation, directly or via `committee_chairs` and `ensure_chair_is_staff`. `supabase/migrations/20261007120000_conference_roles.sql:1044`. Drop the direct insert policy so staff rows come only from `accept_invite` and `add_conference_presets`.
- **L9.** `conference_role_members.granted_by` is not pinned on insert, so attribution can be forged. `supabase/migrations/20261007120000_conference_roles.sql:966`. Add `granted_by = auth.uid()` to the WITH CHECK.
- **L10.** The participants page gates `removeFromSeat` on `read_applications`, weaker than the `decide_applications` the step needs, and shows the button to people who cannot use it. `client/src/routes/manage/[slug]/participants/+page.server.ts:173`, `client/src/lib/participant-access.ts:47`. Use `requirePermissionAndRank(..., 'decide_applications')` and the same check for the button.

### Data exposure through row policies and helpers

- **L11.** Payers and delegation heads can read the organiser's `note`, the platform fee and the Stripe ids on their invoices. `supabase/migrations/20260919120000_fees_and_invoices.sql:1546`. Label the box honestly or move the note to a staff-only table.
- **L12.** `fee_has_invoices` answers for any fee id with no permission check. `supabase/migrations/20261007160000_money_permissions.sql:59`. Gate on `is_conference_staff(invoice.conference_id)` inside the exists.
- **L13.** Every team member can read invoice counts per fee without `read_invoices`. `supabase/migrations/20261007160000_money_permissions.sql:40`. Gate `fee_invoice_counts` on `edit_conference`, `read_invoices` or `manage_invoices`.
- **L14.** Published awards of every conference, with `user_id`, `seat_id` and `created_by`, are readable by every signed-in account. `supabase/migrations/20260921130000_committee_room_and_awards.sql:1212`. Serve non-staff through a view or RPC returning only the display fields.
- **L15.** `read_applications` readers can read draft, unsubmitted applications. `supabase/migrations/20261007150000_applications_permissions.sql:49`. Add `status <> 'draft'` to the select and update policies.
- **L16.** The two private-details views run as owner without `security_barrier`, so caller predicates can run on rows outside the gate. `supabase/migrations/20261007140000_private_details.sql:80`. `alter view ... set (security_barrier = true)` on both.
- **L17.** `document_state`, the live Yjs document with open suggestions and suggester ids, is readable by every reader of the paper row. `supabase/migrations/20261008120100_committee_papers.sql:261`. Move it to its own table with author-only policies and leave it out of the realtime publication.
- **L18.** The invite page hands the invited address to any holder of the link, redirects signed-out visitors to `/register?email=...`, and `get_invite` answers for used and expired tokens. `client/src/routes/invites/[token]/+page.server.ts:107`. Return identifying columns only while the invite is live, and a status otherwise.
- **L19.** Staff keep access to applicants' and members' private details after withdrawal, rejection or the end of the conference. `supabase/migrations/20261007140000_private_details.sql:44`. Filter the application branch of `private_details_user_ids` by status and decide a grace period with the owner.
- **L20.** Account deletion leaves invitations holding the deleted person's address and role. `supabase/migrations/20260915130000_people_conferences_staff_invites_notifications.sql:425`. Delete their invites in `delete_my_account`.
- **L21.** Realtime DELETE events on the nine published room tables bypass RLS and reach any subscriber holding the publishable key. `supabase/migrations/20261001120600_publish_vote_entries.sql:24`. Revoke all on those tables from `anon` and correct the comments in `realtime-auth.ts` and `committee-room-live.ts`.
- **L22.** The same for `committee_paper_seats` and `amendment_seats`: every signed-in user can receive the primary key of every delete. `supabase/migrations/20261008120100_committee_papers.sql:4819`. Take them out of the publication and bump `committee_papers.updated_at` from a trigger instead.

### Applications, delegations and seats

- **L23.** The delegations insert policy lets any signed-in user create headless delegations with a chosen `join_code` and status `submitted` at any open conference. `supabase/migrations/20260918120000_applications_delegations_seat_links.sql:2432`. Drop the direct insert policy so `create_delegation` is the only writer, and refuse a caller-supplied code in the guard.
- **L24.** Delegation join codes come from `random()`, never rotate, and can be guessed without limit (40-bit space). `supabase/migrations/20260918120000_applications_delegations_seat_links.sql:1298`. Generate from `gen_random_bytes`, lengthen to 10 or more, and consider rotation.
- **L25.** Application team join codes are 6 characters from `random()` and guessable through an unthrottled RPC. `supabase/migrations/20261010120000_application_teams.sql:122`. Same fix, at least 8 characters.
- **L26.** No length or shape limits on `applications.answers`, `seat_preferences` or the delegation text columns; delegations are not limited to one per person on direct insert. `supabase/migrations/20260918120000_applications_delegations_seat_links.sql:106`. Add CHECK constraints matching the app's constants.
- **L27.** `applications.answers` has no shape check, so one applicant can make the review page and the CSV export fail for the default tab. `supabase/migrations/20260918120000_applications_delegations_seat_links.sql:106`. An immutable SQL helper in a CHECK requiring an object of bounded strings or string arrays.
- **L28.** Deciders can drive the application state machine directly by table update, including moving an accepted, seated application to rejected or draft. `supabase/migrations/20260918120000_applications_delegations_seat_links.sql:643`. Allow only the transitions the app makes in the organiser branch of `guard_application_update`.
- **L29.** A sole delegation head cannot delete their account unless the delegation is a draft or has another head. `supabase/migrations/20261001120700_quick_sessions.sql:491`. Name the delegation in `delete_my_account`'s refusal and offer a path out.

### Money

- **L30.** `allocate_delegation_seats` checks seats are free, then updates without a lock, so two concurrent allocations both succeed and the first delegation is invoiced for seats it no longer holds. Live body in `supabase/migrations/20261007150000_applications_permissions.sql:328-454`. Put the free-seat predicate in the UPDATE and compare the row count.
- **L31.** `remove_delegation_seat` reads the newest unpaid group invoice without a lock, so two concurrent removals void once and reissue twice. `supabase/migrations/20260919120000_fees_and_invoices.sql:1204`. `for update` on the read.
- **L32.** `protect_invoice_columns` lets an invoice manager rewrite `paid_at` and `paid_method` at any status, including turning a future card payment into a manual one. `supabase/migrations/20260919120000_fees_and_invoices.sql:600`. Require `paid_method = 'manual'` and set `paid_at = now()` in the trigger on the unpaid-to-paid transition.
- **L33.** `set_invoice_checkout_session` accepts any text from the payer on any invoice they owe. `supabase/migrations/20260919120000_fees_and_invoices.sql:696`. Revoke from `authenticated`; have the server write the id with the service role after creating the session; never resolve an invoice by the stored id in the webhook.
- **L34.** `accept_application` and the allocation functions read seats and applications without row locks, so a double-submitted accept gives one seat and two invoices. `supabase/migrations/20261007150000_applications_permissions.sql:247`. Lock the application and the seat `for update` and repeat the state in each UPDATE.
- **L35.** `move_delegate` and `swap_delegates` have the same race: two moves into one free seat silently drop a delegate and delete their paper. `supabase/migrations/20261007150000_applications_permissions.sql:505`. Lock both seats in id order first.

### Auth, sessions and mail

- **L36.** Production sends auth mail to the local sink, so reset and email-change links never arrive while the UI says they are on the way. `client/src/routes/forgot-password/+page.server.ts:44`. Known test-site limit; say so on the page, or configure SMTP.
- **L37.** `/reset-password` changes the password for any signed-in session without the current password. `client/src/routes/reset-password/+page.server.ts:52`. Accept only a session whose `amr` holds a recent `recovery` or `otp` entry.
- **L38.** The root layout serialises every cookie, httpOnly ones included, into the page HTML. `client/src/routes/+layout.server.ts:36`. Pass only the `sb-` cookies, or build the server client from `locals`.
- **L39.** Register and change-email reveal whether an address has an account; the oracle is GoTrue's `/signup` itself while confirmations are off. `client/src/routes/register/+page.server.ts:76`. Fixed by turning confirmations on with SMTP.
- **L40.** The session cookies are readable by JavaScript and the browser client drops `Secure`; a comment in login says the opposite. `client/src/hooks.server.ts:26`. Pass `cookieOptions: { secure: true, sameSite: 'lax' }` to `createBrowserClient` and send HSTS.
- **L41.** No Content-Security-Policy, frame-ancestors, nosniff, Referrer-Policy or HSTS on any page, confirmed on the live response. `client/vite.config.ts:13`. Add `kit.csp` in `svelte.config.js` with the Supabase origin, flagcdn and Stripe allowed, and the rest at the edge.
- **L42.** `GET /auth/confirm` with `token_hash` consumes the token and signs the browser in on a plain GET, a login-CSRF shape once real mail exists. `client/src/routes/auth/confirm/+server.ts:34`. Render a one-button POST form for the `token_hash` branch.
- **L43.** Account deletion needs no re-authentication in the action or in `delete_my_account`. `client/src/routes/settings/+page.server.ts:145`. `secure_password_change = true`, and a recency check in the function.
- **L44.** Weak password policy and password change without reauthentication. `supabase/config.toml:221`. `minimum_password_length = 8`, and the same setting as L43.
- **L45.** `email_sent = 2` is overridden to 360000 today and GoTrue does not apply it while confirmations are off. `supabase/config.toml:238`. Edge rate limits on the mail-sending auth endpoints when SMTP is added.
- **L46.** The `/test-site` reset form is anonymous and unthrottled, so the shared code can be guessed and each hit wipes the deployment. `client/src/routes/test-site/+page.server.ts:35`. A failed-attempt counter in `site-reset.ts` (single process) with a cool-down.

### Room, votes and papers

- **L47.** A closed vote and its answers can be rewritten or deleted by any `run_room` holder with no trace; `protect_vote_ties` covers paper votes only. `supabase/migrations/20260921130000_committee_room_and_awards.sql:747`. A `before update or delete` guard for closed votes from browser roles.
- **L48.** A `run_room` holder can insert a vote already closed with a result, so `settle_vote_paper` never runs and the row becomes permanent. `supabase/migrations/20261008120100_committee_papers.sql:5560`. Require `status = 'open'` and null results in the insert policy.
- **L49.** `protect_documents_columns` lets a delegate null the review when replacing a paper because NULL propagates through `is_review_reset`. `supabase/migrations/20261007180000_committee_permissions.sql:535`. A CHECK that position papers always have a `review_status`.
- **L50.** An uploader keeps update and delete rights on a background guide or resource after losing the permission. `supabase/migrations/20261007180000_committee_permissions.sql:462`. Recreate the uploader policy for administrators only.
- **L51.** A paper reviewer can rewrite a delegate's position paper, not only review it. `supabase/migrations/20261007180000_committee_permissions.sql:510`. In the trigger, compare OLD and NEW minus the review columns for `review_papers` holders who are not the uploader.
- **L52.** `document_state` accepts arbitrary bytes from any delegation member, and a malformed value breaks the paper page for the whole seat. `supabase/migrations/20260929120000_live_paper_editing.sql:36`. Decode inside try/catch in `readStoredDocument` and fall back to the Markdown body.
- **L53.** A delegate can send unlimited notifications with chosen text to any delegate of the committee through `start_paper` plus `add_paper_author`. `supabase/migrations/20261008120100_committee_papers.sql:1787`. Cap papers in `writing` per seat.
- **L54.** No cap on amendments or threads a delegate may open; each fans out notifications and, under THIMUN settings, lands straight in the dais queue. `supabase/migrations/20261008120100_committee_papers.sql:2976`. Count live amendments per seat under the paper lock.
- **L55.** A writer who loses access stays on the live writing channel until their JWT expires, because Realtime cached the policy at subscribe time. `client/src/lib/paper-live-channel.ts:176`. Put an epoch in the topic and bump it from triggers.
- **L56.** Writer identity on the live channel (cursor name, "X is editing", suggestion author) comes from the sender's own payload. `client/src/lib/live-writers.ts:38`. Look the awareness id up in the server-provided writer list and drop unknown ids.
- **L57.** Session name has no length limit at any layer and is writable by any `run_room` holder directly. `client/src/routes/conferences/[slug]/committees/[committeeSlug]/chair/chair/+page.server.ts:124`. A CHECK on `committee_sessions.name`.
- **L58.** Every schedule move inside the next 24 hours notifies the whole audience again, with no dedupe or throttle; a filtered PATCH multiplies it. `supabase/migrations/20260921120000_documents_schedule_announcements.sql:1615`. A per-event cool-down column set by the trigger.

### Storage and files

- **L59.** `documents.storage_path` is not tied to the row's conference, kind, committee or seat. `supabase/migrations/20260921120000_documents_schedule_announcements.sql:68`. Check the prefix in `check_document_scope`.
- **L60.** Anonymous callers can list the whole `public-media` bucket: every avatar owner's user id, every organisation id, and the banners and logos of unpublished conferences. `supabase/migrations/20260916140000_public_media_bucket.sql:142`. Drop the open select policy (public downloads keep working) and cover the copy sources `creation.ts` uses.
- **L61.** Unlimited uploads into a caller's own avatar and position-paper folders, never swept. `supabase/migrations/20260916140000_public_media_bucket.sql:148`. Queue replaced paths from a trigger and run the sweep on a schedule.
- **L62.** Three storage helper functions are executable by `anon` through RPC because the default PUBLIC grant was never revoked; they return false today. `supabase/migrations/20260916140000_public_media_bucket.sql:132`. Revoke from `public, anon`.
- **L63.** Replaced position-paper files are never deleted: the cleanup `remove` matches nothing (Storage answers 200 with an empty list) and nothing queues them. `client/src/lib/server/position-papers.ts:346`. An `after update of storage_path` trigger that queues the old path.
- **L64.** Account deletion leaves the person's avatar files publicly readable and listable. `supabase/migrations/20261001120700_quick_sessions.sql:491`. A public-media cleanup queue mirroring `orphaned_document_files`.

### Input limits and validation

- **L65.** `create_quick_session` lets any signed-in user create unlimited conferences, committees and up to 300 seats per call with unbounded text. `supabase/migrations/20261001121500_quick_session_timezone_check.sql:33`. Table-level bounds and a per-user cap.
- **L66.** `create_quick_session` accepts any committee slug, name and seat names when called directly. `supabase/migrations/20261001121500_quick_session_timezone_check.sql:74`. CHECK constraints on `committees.slug`, `committees.name`, `seats.name`.
- **L67.** Profile text has no length limits in the database and none on the welcome form. `client/src/lib/profiles.ts:232`. CHECKs matching the app constants, added `not valid` then validated.
- **L68.** Delegation name, institution and note are unbounded free text on direct writes. `client/src/lib/delegations.ts:571`. CHECKs on `delegations`.
- **L69.** A new organisation's city is stored without a length limit, and name, description and website have none either. `client/src/lib/creation-start.ts:63`. CHECKs on `organizations`.
- **L70.** Organisation and delegation free text is unconstrained on direct writes, and slugs have no pattern. `supabase/migrations/20260915120000_initial_schema.sql:39`. Same migration as L69 plus a slug pattern.
- **L71.** Slugs have no shape CHECK and flow unescaped into the `Content-Disposition` header of three exports; a double quote breaks out of the filename and CR, LF or NUL cause a 500. `supabase/migrations/20260915120000_initial_schema.sql:67`. `check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')` on organizations, conferences and committees.
- **L72.** Announcement title and body and schedule event text have no length limit in the database; the 120/4000 limits live only in the form. `client/src/lib/announcement-form.ts:14`. CHECKs on both tables.
- **L73.** An unvalidated `?committee=` reaches the `uuid[]` contains filter and turns the applications table, board, export and review page into a 500. `client/src/lib/server/application-table.ts:202`. Keep the value only when it matches a uuid pattern.
- **L74.** Conference status is writable directly by any `edit_conference` holder; the publish checklist and the no-unpublish-with-seated-delegates rule exist only in SvelteKit actions. `client/src/lib/server/conferences.ts:1032`. A `before update of status` trigger (shared with M2).

### Deployment, supply chain and operator tooling

- **L75.** `db.seed` loads about 100 privileged accounts with the published password on every reset of the public site. `supabase/config.toml:67`. Accepted for the test site; fix the `db reset --linked` advice in `supabase/README.md:193` so a linked reset never seeds a real project.
- **L76.** The tunnel container that holds `TUNNEL_TOKEN` runs `cloudflare/cloudflared:latest`, and the dev server's `allowedHosts` is a wildcard. `docker-compose.yaml:61`. Pin to a release tag and digest.
- **L77.** The Node base image is a floating tag despite the comment saying it is pinned. `client/Dockerfile:9`. Pin version and digest, or correct the comment.
- **L78.** `devalue` 5.9.2 with several high advisories is bundled into the server; no input reaches the affected paths today. `client/pnpm-lock.yaml:1312`. Override to `>=5.9.3` and add `pnpm audit --prod --audit-level=high` to `pnpm verify`.
- **L79.** Trello attachment names are joined into a path without sanitising. `.claude/scripts/trello.mjs:103`. Use `basename` plus a character allow-list and check the resolved path stays inside the folder.
- **L80.** The agent on the production host runs any pnpm command, git merge and commit without a prompt while treating untrusted Trello card text as instructions. `.claude/settings.json:4`, `.claude/skills/trello-card/SKILL.md`. Scope the allows to the repo, deny reads of the deploy folder, `.env` and the Trello config, and state in the skill that card text describes a change, never a command.
- **L81.** The Cloudflare origin certificate and the `.env` files on the host are readable by the other local staff-group account. `.gitignore:265`. Delete the unused `data/tunnel/cert.pem` and revoke it; `chmod 600` the env files.

---

## Informational

- **I1.** A conference can be inserted directly as `published`, bypassing the publish checklist. `supabase/migrations/20260915120000_initial_schema.sql:206`. Add `status = 'draft'` to the insert policy if the checklist should be a database rule.
- **I2.** `holds_public_role` and `role_is_public` answer for any conference or role to any signed-in user, a one-bit leak about draft conferences. `supabase/migrations/20261007120000_conference_roles.sql:683`. Move them to a non-exposed schema; do not revoke execute, which would break the staff select policies.
- **I3.** `delegation_papers` shows the chair's review comment to every member of the delegation, by design and tested. `supabase/migrations/20260928120000_delegation_paper_drafts.sql:133`.
- **I4.** Every committee-scoped Chair role holds `answer_directives`, so in crisis committees the chair reads and decides personal directives and press releases. `supabase/migrations/20261008120100_committee_papers.sql:5748`. Document it; a conference with a separate crisis staff removes it from Chair.
- **I5.** Unexpected-error logging writes the request path, so invite tokens and join codes reach the container log. `client/src/hooks.server.ts:101`. Log `event.route.id` instead.
- **I6.** A plain organisation member can create and publish a fee-charging conference under the organisation, by design; RLS allows it directly. `client/src/routes/create/+page.server.ts:116`.
- **I7.** The quick-session "Edit delegations" page checks `run_room` but the save needs conference-wide `manage_committees`; the write is refused, nothing changes. `client/src/routes/quick/[slug]/delegations/+page.server.ts:43`. Gate the page on the same check.
- **I8.** `/api/stripe/connect/refresh` is a GET that creates an account link and redirects; inherent to Stripe's return URLs and correctly guarded. `client/src/routes/api/stripe/connect/refresh/+server.ts:34`. Add `cache-control: no-store`.
- **I9.** Bulk waitlist and reject act on ticked ids without scoping them to the URL's conference; the policies keep other conferences out. `client/src/routes/manage/[slug]/applications/+page.server.ts:608`. Add `.eq('conference_id', ...)`.
- **I10.** The platform fee is stamped per seat in the invoice's own minor unit regardless of currency, even on zero-amount fees. `client/src/lib/server/platform-fee.ts:30`. Skip Checkout for zero invoices and cap the application fee at the amount; constrain `conferences.currency`.
- **I11.** The orphaned-file sweep runs with the service role inside ordinary seat-change requests and never on a schedule. `client/src/lib/server/orphaned-document-files.ts:65`.
- **I12.** The service-role key is not given to the app container, so the sweep never runs and fails silently; the house-rules allowlist names a file that does not exist. `client/src/lib/server/service-role.ts:1`. Rotate first (C1), then pass only the new key, or run the sweep as a separate job.
- **I13.** File type checks trust the declared `Content-Type`; documents are served inline from the Supabase origin. `client/src/lib/server/document-storage.ts:103`. Sniff leading bytes and pass `download` to signed URLs.
- **I14.** The notes page ships every delegate's auth user id to the browser although only "is the seat filled" is used. `client/src/routes/conferences/[slug]/committees/[committeeSlug]/chair/notes/+page.server.ts:51`. Return `isFilled`.
- **I15.** `clearRollCall` passes an unvalidated seat id to the database; the delete is scoped by RLS, so at worst a 500. `client/src/lib/server/vote-view.ts:256`. Check the seat is in the frame first.
- **I16.** "Show on screen" and the clause buttons on the delegate paper page rely on the `committee_state` policy alone; staff such as volunteers can post the action. `client/src/routes/conferences/[slug]/committees/[committeeSlug]/resolutions/[paperId]/+page.server.ts:466`. Call `mayRunRoom` before any write.
- **I17.** Comment actions take thread and comment ids from the form without tying them to the paper in the URL; the five definer functions carry the authorisation. `client/src/lib/server/paper-comment-actions.ts:100`.
- **I18.** Organiser URL columns rely on the server row mapper (`safeWebAddress`), and the database accepts any text; the mapper is not on every read path. `client/src/lib/server/conferences.ts:201`. A `https?://` CHECK on the seven URL columns.
- **I19.** All `{@html}` sinks (13, in 13 components) trace to the server sanitiser in `client/src/lib/server/markdown.ts:80-117`; configuration verified end to end. A control that holds.
- **I20.** The other `pnpm audit` advisories are unreachable or dev-only. `client/pnpm-lock.yaml:1`. Pick up with the next dependency update.
- **I21.** Public Realtime channels are allowed; the room, amendment and thread listeners are public and safe only because they carry `postgres_changes` alone. `supabase/config.toml:92`. A house rule that any `broadcast` or `presence` listener must be on a private channel.
- **I22.** `avatar_path`, `logo_path` and `banner_path` are free text concatenated into public URLs; cosmetic only because Storage RLS prevents misuse. `client/src/lib/media.ts:32`. CHECKs tying each path to its owner's folder.
- **I23.** The other routes into the private-details read set (applications, delegation members, delegation heads) are closed. `supabase/migrations/20260918120000_applications_delegations_seat_links.sql:2354`. Add the missing test for a head moving a delegation to another conference.
- **I24.** Of the update-guarded tables without an insert guard, committees, conferences, fees, committee_state, notifications and profiles are covered by other controls; seats (C4) and organizations (C5, H3) are not. `supabase/migrations/20260915130000_people_conferences_staff_invites_notifications.sql:226`.
- **I25.** `administrator` on a committees-scoped role grants every per-committee permission, contrary to section 4 of the roles spec but matching the migration comment and the roles editor. `supabase/migrations/20261007120000_conference_roles.sql:399`. Pick one model and make the docs and code agree.
- **I26.** `confirm_awards` counts only conference-wide, as specified. A control that holds. `supabase/migrations/20261007180000_committee_permissions.sql:154`. Optionally add the test.
- **I27.** Page data for conference A's participants and review pages carries private details the reader holds through another conference B. `client/src/lib/server/participants.ts:466`. Null the fields the current conference's access does not grant.
- **I28.** Age limits are advisory; there is no age or guardian-consent gate for under-age applicants, and the reviewer warning depends on welfare access. `client/src/routes/conferences/[slug]/apply/+page.server.ts:224`. A product decision; store consent on the application if required.

---

## Refuted

- **`add_paper_author` traps a delegate as sponsor without consent.** The facts hold (any author can add any held seat, and `submit_paper` freezes the seats), but the added delegate holds an author seat and `withdraw_paper` lets any author withdraw while the paper is writing, submitted or approved, so there is a way out. The consent gap remains worth a product look.
- **Server-side sign-ins share one IP, so 30 bad passwords lock everyone out.** GoTrue's limiter never runs in this stack because the CLI sets no rate-limit header, so there is no shared bucket to fill. The absence of any limit is H5 and M20.
- **`getClaims` falls back to a network `getUser` on HS256 and tokens stay valid after sign-out.** The running auth server publishes an ES256 key (the CLI's built-in one), so access tokens carry `alg: ES256` and are verified locally. Tokens outliving sign-out by up to an hour is standard JWT behaviour. The built-in key itself is C1.

## Controls that hold

- Every `{@html}` sink goes through the server-side Markdown sanitiser (I19); no `javascript:` URL survives `safeWebAddress`; no server-side fetch of user URLs exists, so SSRF does not apply.
- Search and filter text is sanitised before PostgREST `.or()` filters; sort columns are allow-listed; error hooks return fixed text.
- Private details are scoped per committee for staff, and the applications, participants and fees exports drop the contact, welfare and invoice columns the reader lacks (the C4 chain gets round this from outside, not through it).
- `confirm_awards` and `set_awards_published_at` are conference-wide only; `protect_conferences_columns` blocks direct writes to `awards_published_at`.
- Every security-definer function pins `search_path = ''`; every table has RLS enabled; the committee-papers tables revoke `anon`.
- The Stripe return and refresh endpoints verify the JWT, resolve the organisation through RLS, and require owner or admin.

## Coverage and limits

- All 58 migrations were read in full by at least one finder, and the newest one (`20261010130000_conference_contact_channels.sql`) by the critic. Every file under `client/src/lib/server` and every `+page.server.ts`, `+layout.server.ts` and `+server.ts` was assigned to a shard and read. The `.claude` scripts and settings, both Dockerfiles and compose files, `supabase/config.toml`, the pnpm lockfile and audit output, and the deploy mirror under `~/MunMeet/deploy` were read by the infrastructure and supply-chain sweeps.
- Verification was by reading code, the pinned CLI binary's strings and the GoTrue source for its version, plus read-only requests to the local stack (the JWKS endpoint, the Kong route table, the live site's response headers). Nothing was tested against the public hostname beyond a header read, and no exploit was attempted.
- Not covered: the Cloudflare dashboard (tunnel routing, WAF and rate-limit rules live there and are invisible from the repo); the e2e and db tests as test quality, beyond the cases cited; the Svelte components for anything other than `{@html}` sinks; `pg_graphql`, which the critic noted exposes schema introspection to anonymous callers under the same RLS but did not brief as a finding.
- I could not read the host's `.env` files myself (the harness refused the read as credential access); the agents compared them with the committed examples and reported only whether values match the CLI defaults.
- Raw agent output: `~/.claude/projects/-Users-macmini-MunMeet-munmeet/9e9a6846-1fd0-4772-bbfd-68cb7380d92c/subagents/workflows/wf_83800528-ee4/journal.jsonl` (one result line per agent, with full evidence and fix text for every finding).
