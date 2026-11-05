-- =============================================================================
-- Private details have lengths, keep the account's address, and the views
-- over them keep their own filters first
-- =============================================================================
-- Findings L67 and L16 of the security review of 2026-10-10
-- (docs/security-review-2026-10-10.md), and one more thing found while
-- checking them.
--
-- 1. L67: nothing in the database bounded profile_details. A person's own row
--    took a 20,000-character phone number, emergency contact or dietary note,
--    and organisers read those on their pages and in their exports. The
--    profile editor bounded each field, but the welcome form bounded only the
--    dietary note.
--
-- 2. Browsers could update every column of their own row, email included.
--    The email column is the account's address, copied in by handle_new_user
--    and kept in step by sync_user_email, and it is the address an organiser
--    or a delegation head reads as the person's. Nothing in the app writes it
--    from a browser; /settings changes the account's address instead. A person
--    could still have shown their organisers an address they never proved.
--
-- 3. L16: participant_delegations, delegation_member_details and public_seats
--    run as their owner and had no security_barrier, so Postgres could run a
--    condition from the reader's own query on rows the view's filter was about
--    to throw away. 20261022110000 closed the same gap on the two staff views.
--
-- This file:
--
--   * adds a length CHECK on phone, dietary_requirements,
--     emergency_contact_name and emergency_contact_phone, at the bounds the
--     profile editor uses (PHONE_MAX_LENGTH, DIETARY_REQUIREMENTS_MAX_LENGTH
--     and EMERGENCY_CONTACT_NAME_MAX_LENGTH in client/src/lib/profiles.ts);
--   * lets a browser update only the five fields the app writes;
--   * sets security_barrier on the three views.
--
-- BEFORE RUNNING THIS ON A DATABASE WITH REAL ROWS
-- Each `validate constraint` below aborts the whole migration, naming the
-- constraint, if one existing row breaks it. On the seeds nothing does. The
-- welcome form did not bound the phone or the emergency contact, so on a
-- database that has been used this question finds the rows to put right
-- first, with their owners; it should answer no rows:
--
--   select user_id from public.profile_details
--   where char_length(phone) > 30
--      or char_length(emergency_contact_phone) > 30
--      or char_length(emergency_contact_name) > 80
--      or char_length(dietary_requirements) > 300;
--
-- The database tests are in client/tests/db/private-details-have-bounds.test.ts.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.


-- -----------------------------------------------------------------------------
-- 1. Lengths
-- -----------------------------------------------------------------------------
-- The app trims each value before it writes it, and so the bound is on what is
-- stored. Each CHECK is added `not valid` and then validated, so a stored row
-- that breaks it stops the migration with the constraint's name, as the
-- header says, rather than being left in place. A CHECK left not valid would
-- still be evaluated on every update of that row, so the person's next save
-- of anything else on it would fail with a message about a field they did not
-- touch.

alter table public.profile_details
  add constraint profile_details_phone_length
    check (phone is null or char_length(phone) <= 30) not valid,
  add constraint profile_details_dietary_requirements_length
    check (dietary_requirements is null or char_length(dietary_requirements) <= 300) not valid,
  add constraint profile_details_emergency_contact_name_length
    check (emergency_contact_name is null or char_length(emergency_contact_name) <= 80) not valid,
  add constraint profile_details_emergency_contact_phone_length
    check (emergency_contact_phone is null or char_length(emergency_contact_phone) <= 30) not valid;

alter table public.profile_details validate constraint profile_details_phone_length;
alter table public.profile_details validate constraint profile_details_dietary_requirements_length;
alter table public.profile_details validate constraint profile_details_emergency_contact_name_length;
alter table public.profile_details validate constraint profile_details_emergency_contact_phone_length;


-- -----------------------------------------------------------------------------
-- 2. A browser writes the five fields and nothing else
-- -----------------------------------------------------------------------------
-- updateMyProfile and updateProfileDetails in client/src/lib/server/profiles.ts
-- write exactly these. Revoking update on the table also revokes it on each
-- column, so the grant afterwards is the whole of what is left. updated_at is
-- set by the set_updated_at trigger, which needs no grant of its own, and the
-- functions that run as the owner are not affected.

revoke update on public.profile_details from anon, authenticated;
grant update (
  date_of_birth,
  phone,
  dietary_requirements,
  emergency_contact_name,
  emergency_contact_phone
) on public.profile_details to authenticated;


-- -----------------------------------------------------------------------------
-- 3. The views keep their own filters first
-- -----------------------------------------------------------------------------
-- A view that runs as its owner is a door past Row Level Security, and its
-- `where` is the rule. security_barrier makes Postgres apply that `where`
-- before any condition of the reader's own, unless the condition is one that
-- cannot leak a value (an `=` on an id, for example), so the pages' filters
-- still use the indexes.

alter view public.participant_delegations set (security_barrier = true);
alter view public.delegation_member_details set (security_barrier = true);
alter view public.public_seats set (security_barrier = true);
