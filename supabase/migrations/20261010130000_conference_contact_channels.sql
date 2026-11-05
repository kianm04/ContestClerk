-- =============================================================================
-- More ways to reach a conference (Trello Jjf34CcP)
-- =============================================================================
-- "Contact and links" on the details editor took an email address, a website
-- and an Instagram address, and the public page linked to the three. The
-- organisers asked for more: a phone number, and the other networks a
-- conference is on. Five nullable text columns, one per channel, the way
-- `instagram_url` already is. Null means the organisers gave none, and the
-- public page then shows no link for it.
--
-- The addresses are checked by the application before they are saved
-- (`isWebAddress` in client/src/lib/conference-details.ts) and again before
-- they are shown (`safeWebAddress`), so a row written by hand in the dashboard
-- never becomes a link somebody can click. The phone number is kept as the
-- organiser wrote it, spaces and all, because that is how a reader wants to
-- see it; `phoneLinkAddress` makes the dialable form when the page needs one.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.

alter table public.conferences
  add column contact_phone text,
  add column facebook_url text,
  add column linkedin_url text,
  add column youtube_url text,
  add column tiktok_url text;

comment on column public.conferences.contact_phone is
  'Where a reader rings the organisers, as they wrote it. Null when they gave no number.';
comment on column public.conferences.facebook_url is
  'The conference''s Facebook page, an http or https address. Null when there is none.';
comment on column public.conferences.linkedin_url is
  'The conference''s LinkedIn page, an http or https address. Null when there is none.';
comment on column public.conferences.youtube_url is
  'The conference''s YouTube channel, an http or https address. Null when there is none.';
comment on column public.conferences.tiktok_url is
  'The conference''s TikTok account, an http or https address. Null when there is none.';


-- =============================================================================
-- conferences_with_organization, made again
-- =============================================================================
-- The view expanded "conference.*" into a fixed list of columns when it was
-- made, so none of the new columns is in it until it is made again, the same
-- way 20261003120000 did for the creation redesign. Everything else is as
-- before: security_invoker = true, so the conferences and organizations
-- policies decide what comes back, and its own grant.

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
