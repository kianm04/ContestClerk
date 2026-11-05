-- How conferences that already exist open their applications (Trello fe3reN7Y).
--
-- 20261003120000_conference_creation_redesign.sql added
-- conferences.application_open_mode with the default 'manual', which keeps
-- applications shut until an organiser opens them by hand. Before that column
-- existed, a published conference with no opening date was open from the
-- moment it was published, so those rows are told so here. Drafts keep the
-- default, as a new draft would, and a conference with an opening date keeps
-- whatever its organiser decides next.

update public.conferences
set application_open_mode = 'on_publish'
where status <> 'draft'
  and applications_open_at is null;

comment on column public.conferences.prefill_sources is
  'Where each prefilled value of a draft came from, by column name: organization, previous_conference, system_default or user. The creation flow shows a chip for the first two and never overwrites a value marked user.';
