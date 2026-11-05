-- Security review I2. `holds_public_role` and `role_is_public` are the security
-- definer helpers behind two read rules (the participants' view of the team on
-- conference_staff and conference_role_members), and because they lived in the
-- `public` schema PostgREST also served them as RPCs to every signed-in caller.
-- Called directly they answer yes or no about any conference or role, a draft
-- conference the caller may not see included: a one-bit leak.
--
-- Revoking execute would break the two rules, which run as the caller. So the
-- functions move to a schema the API does not serve: PostgREST exposes only the
-- schemas `api.schemas` in supabase/config.toml lists. The rules keep working
-- unchanged, because a policy holds the functions it calls by id, not by name.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.

create schema if not exists private;

comment on schema private is
  'Helpers the database calls from its own rules and nobody calls through the API. PostgREST serves only the schemas supabase/config.toml lists under [api], and this is not one of them.';

-- The rules run as the signed-in caller, who has to be allowed to look inside
-- the schema. Nothing else is granted on it.
revoke all on schema private from public;
grant usage on schema private to authenticated;

alter function public.holds_public_role(uuid, uuid) set schema private;
alter function public.role_is_public(uuid) set schema private;
