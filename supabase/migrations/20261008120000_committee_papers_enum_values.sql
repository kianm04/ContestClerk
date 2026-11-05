-- =============================================================================
-- Committee papers: the new values of two existing enums
-- (docs/committee-papers.md, section 7, "Enums", and step 1)
-- =============================================================================
--
--   * permission gains 'answer_directives' (section 8): answering directives
--     and press releases and sending crisis updates, per committee. It is the
--     twenty-first permission. It sits after 'confirm_awards', at the end of
--     the Committees and rooms group, so the enum keeps the order the roles
--     editor lists the groups in.
--   * notification_kind gains the nine kinds of section 6, "Notifications".
--
-- WHY THESE LINES HAVE A FILE OF THEIR OWN
-- A value added with "alter type ... add value" cannot be used in the
-- transaction that adds it: Postgres refuses to write it into a row, a check or
-- a default until the transaction has committed. Every migration file runs in
-- one transaction, so 20261008120100_committee_papers.sql, which gives the
-- Chair preset the new permission and writes the new notifications, could not
-- hold them. The specification asks for one migration; this is the one thing
-- that has to sit in front of it. 20261001120000_session_redesign_enum_values
-- did the same.
--
-- "if not exists" makes a second run harmless, which matters for a database
-- that already has a value from a hand-made experiment.
--
-- Never edit this file once it has been applied anywhere. Add a new migration.

alter type public.permission add value if not exists 'answer_directives' after 'confirm_awards';

-- Added as an author of a paper.
alter type public.notification_kind add value if not exists 'paper_author_added';
-- The dais returned a paper, to its authors and its signatories.
alter type public.notification_kind add value if not exists 'paper_returned';
-- The dais approved and numbered a paper.
alter type public.notification_kind add value if not exists 'paper_approved';
-- A paper was introduced to the committee.
alter type public.notification_kind add value if not exists 'paper_introduced';
-- A reply in a comment thread the reader wrote in.
alter type public.notification_kind add value if not exists 'paper_comment_reply';
-- A new thread on the reader's paper from somebody outside its authors.
alter type public.notification_kind add value if not exists 'paper_comment_thread';
-- An amendment waits for the reader's answer as a sponsor.
alter type public.notification_kind add value if not exists 'amendment_awaits_answer';
-- The reader's amendment was accepted, declined, approved, ruled out of
-- order, passed or failed. The title says which.
alter type public.notification_kind add value if not exists 'amendment_decided';
-- The crisis staff answered the reader's directive or press release.
alter type public.notification_kind add value if not exists 'directive_answered';
