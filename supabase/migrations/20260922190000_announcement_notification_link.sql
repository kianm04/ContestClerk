-- =============================================================================
-- Migration 0016: an announcement's notification names the announcement
-- =============================================================================
-- specs/02-architecture/notifications.md asks the notification page's "open"
-- action to check that an announcement still exists before following its link,
-- and to send the reader to the list with ?removed=1 when it does not, so that
-- the list can say "That announcement was removed." (task T36).
--
-- Migration 0013's notify_announcement wrote the link as
-- /conferences/<slug>/announcements and nothing more, and a notification row
-- has no other column that points at the announcement it came from. Without the
-- id, "does it still exist?" has no question to ask.
--
-- So the link gains ?announcement=<id>. It still lands on the list page, which
-- is what "links point at list pages where they can" in notifications.md asks
-- for; the announcements page simply ignores the extra parameter. The body of
-- the function is migration 0013's, word for word, apart from that one line.
--
-- Notifications written before this migration keep their old link. The open
-- action treats a link without an id the way it always did and follows it.

create or replace function public.notify_announcement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conference_slug text;
  short_title text;
begin
  select conference.slug
  into conference_slug
  from public.conferences as conference
  where conference.id = new.conference_id;

  short_title := case
    when char_length(new.title) <= 99 then new.title
    else left(new.title, 98) || '…'
  end;

  insert into public.notifications (user_id, conference_id, kind, title, link_path)
  select
    recipient,
    new.conference_id,
    'announcement',
    short_title,
    '/conferences/' || conference_slug || '/announcements?announcement=' || new.id
  from public.conference_audience_user_ids(
    new.conference_id,
    new.audience,
    new.committee_id,
    new.delegation_id
  ) as recipient
  where recipient is distinct from new.author_id;

  return new;
end;
$$;

-- A replaced function keeps its grants, but saying it again costs nothing and
-- means nobody has to go and check migration 0013 to know who may call it.
revoke execute on function public.notify_announcement() from public, anon, authenticated;
