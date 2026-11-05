# Committee papers: working papers, resolutions, amendments and directives

A specification for what delegates write together during a conference, and for how it
travels from a bloc's first notes to a vote of the committee. Read it before any work on
working papers, draft resolutions, amendments, directives or press releases. Section 2
explains how a committee writes, for readers who have never sat in one; sections 4 to 8 are
the reference; section 9 is the build order and the checklist to tick as steps land;
section 10 records the product decisions.

Written 8 October 2026 from a read of the codebase and from the cofounder's feedback:
delegates must be able to write drafts, amendments and papers during a session, and write
them together, the way people write together in Google Docs: typing at once, comments on
the text, and suggestions the others accept or reject. The same day the product owner
asked for comments and suggestions to be in scope, for the writing screens to be redrawn
to a much higher polish before they are built (section 6), and for the open questions to
be settled so that the product suits every kind of conference (section 10). Nothing in it
is built yet.

## 1. Why

### What a conference has today

- **Position papers are done, and done well.** A delegate uploads a PDF or writes the paper
  in MUNMeet; the members of their delegation write in it with them, live, with each
  other's cursors and names on screen; the chairs approve it or ask for changes. The live
  writing is Tiptap with Yjs over a private Supabase broadcast channel, `paper:<seat id>`
  (`$lib/paper-live-channel.ts`, `$lib/paper-live.svelte.ts`,
  `$lib/server/paper-live-drafts.ts`, migration `20260929120000_live_paper_editing.sql`).
- **The chair room is done.** Sessions, roll call, the speakers' lists, caucuses, a single
  speaker, motions, votes by show of hands or roll call, suspension, a projector display,
  and a read-only live view for delegates.
- **The database was laid out expecting this work and never got it.** `document_kind` has
  `working_paper` and `draft_resolution`, with a read policy and no write policy ("Phase
  2 … the day they arrive it is one policy"). `votes.document_id` is a column "waiting
  for" real draft resolutions. The motion kind `introduce_document` is recorded and
  changes nothing.

### What goes wrong

- **The work of a committee happens outside MUNMeet.** Blocs write in Google Docs, pass
  a laptop to the dais, and chairs type "Draft resolution 1.1" into the vote's subject by
  hand. The for-organisers brief (`docs/for-organisers-handoff.md`, section 10) found a
  competing conference that "approves resolutions through shared folders and a status
  sheet". That is the gap.
- **Delegates have nothing to do on their screen during a session.** The live view is for
  watching. The one thing a delegate produces in committee, a resolution, cannot be
  written here.
- **The record is incomplete.** A conference ends with votes on subjects nobody can open,
  and no copy of what the committee passed.
- **Co-writing stops at the delegation.** A bloc is five to fifteen countries from
  different schools. Today only the members of one delegation may write in the same
  paper.

## 2. How a committee writes

Conferences differ in the details, which is why section 3 makes the numbers settings. The
shape is the same almost everywhere.

1. **Position paper**, before the conference: one country's view of the topic. Built.
2. **Working paper.** During unmoderated caucus, countries that agree form a **bloc** and
   write down their ideas together. A working paper has no fixed format. The bloc hands
   it to the chairs, the **dais**, who check it and give it a number, *Working paper 1.1*
   (topic 1, first paper). A delegate moves to introduce it; once introduced, the whole
   committee may read it and refer to it in debate. Working papers are not voted on.
3. **Draft resolution.** Usually after the working papers, often from two or three of them
   merged, the bloc writes the same ideas in the United Nations' format:
   - A heading: the committee, the topic, the **sponsors** (the authors, usually capped,
     often at five) and the **signatories** (countries that want it debated without
     necessarily agreeing with it; together they must reach a share of the committee,
     often a fifth).
   - **Preambulatory clauses**, the reasons, each starting with an italic phrase and
     ending with a comma: "*Recalling* its resolution 2417 (2018),".
   - **Operative clauses**, the decisions, numbered, each starting with an underlined
     verb and ending with a semicolon, the last with a full stop: "1. <u>Calls upon</u>
     all parties to …;". An operative clause may have sub-clauses a, b, c, and those
     sub-clauses i, ii, iii.
   - The dais checks the format, may send it back for corrections, and gives it a number,
     *Draft resolution 1.1*. It is introduced by motion, its sponsors usually read the
     operative clauses aloud and take questions, and debate on it begins.
4. **Amendments.** While a draft is debated, any country may propose to add, change or
   strike an operative clause. If every sponsor accepts, the amendment is **friendly**
   and is written in at once. If not, it is **unfriendly**: it needs its own signatories,
   the dais approves it, and the committee votes on it before it votes on the draft.
5. **Voting procedure.** A motion to close debate passes; the committee votes on the
   unfriendly amendments, then on each draft resolution. A draft that passes is a
   **resolution**, *Resolution 1.1*, and the committee's record.

Crisis committees work differently. Each delegate is a character ("Minister of Defence")
with powers, not a country. They write **directives**: personal ones, to use their own
powers, read only by the **crisis staff** (the "backroom") who decide what happens; joint
ones from several characters; and committee directives, which the whole committee votes
on like a short resolution. They also write **press releases** that the crisis staff
publish to the room. The crisis staff answer every directive, and the answers drive the
story.

## 3. The model, in rules

Words used from here on: a **paper** is anything a committee writes in this specification:
a working paper, a draft resolution, a committee, joint or personal directive, or a press
release. An **author** is a seat that writes a paper; on a draft resolution the authors
are its sponsors. A **signatory** is a seat that signs a paper it did not write. The
**dais** is anybody who holds `run_room` in the committee. **Crisis staff** are anybody
who holds the new `answer_directives` permission in the committee.

1. **Papers belong to a committee and a topic, not to a session.** A bloc writes across
   lunch and into the next day. Introductions and votes belong to sessions, through the
   motion and the vote that did them.
2. **Seats write, people type.** Authors and signatories are seats, the way a resolution
   names countries. The delegate in the seat is the person who may type, sign and answer.
   A seat with nobody in it can be neither. A seat that changes hands keeps its papers.
3. **A paper is private to its authors until they show it to somebody.** Neither the dais
   nor the rest of the committee can open it while it is being written. It becomes
   readable to the dais and the committee when its authors open it for signatures, and to
   the dais alone when they submit it. Personal and joint directives are only ever read by
   their authors and the crisis staff.
4. **Authors are equal, and one leads.** Any author may type, add another seat of the
   committee as an author, open the paper for signatures, submit it or withdraw it. Any
   author may leave while another remains. The **lead author** is the seat that started
   the paper until it hands the lead to another author; it is the "main submitter" where
   a committee uses THIMUN's words (section 5), and it alone may delete the paper while it
   has never been submitted. If the lead leaves, the longest-standing author leads.
5. **Writing is live; submitting freezes the text.** While a paper is being written, its
   authors type in it together with each other's cursors and names on screen, as on a
   position paper. Submitting turns the text into the paper's first version, which nobody
   types in again. After that the text changes only by an amendment, or by the dais
   returning the paper to its authors.
6. **The dais approves and numbers, or returns.** A submitted paper is approved, which
   gives it its number, or returned with a comment, which reopens it for writing.
   Signatures are kept when a paper is returned: a signatory supports debating the paper,
   not every word of it. Each signatory is told the paper came back, and may take their
   signature off until it is submitted again.
7. **Writers comment and suggest, as in Google Docs.** While a paper is being written its
   authors may comment on any stretch of its text, reply, and resolve a thread, and may
   switch from editing to suggesting, where what they type and delete is shown as a
   proposal the other authors accept or reject. A paper cannot be submitted with an open
   suggestion. Comments are a conversation about the text; they never become part of it.
   Section 4 says who else may comment, and who reads which thread.
8. **The committee reads a paper once it is introduced.** Introducing is a motion, as
   today, which the dais may also start without a vote. Introduced papers are readable by
   every delegate of the committee and every member of the conference team, and the dais
   may put one on the projector.
9. **Amendments change clauses of an introduced draft resolution**, by adding, changing
   or striking one: operative clauses always, preambulatory clauses where the committee
   allows it. Friendly when every sponsor accepts, where the committee has friendly
   amendments; unfriendly otherwise. A friendly amendment the dais approves is written in
   at once. An unfriendly one waits for a vote, which the dais may hold as soon as it has
   been debated or keep for voting procedure; the committee's procedure decides, not the
   product. Where the committee allows them, an amendment to an amendment (the "second
   degree") changes the text of a pending unfriendly amendment and is voted on before it.
   An amendment points at a clause, not a clause number, so one passed before it cannot
   make it point at the wrong clause; if its clause was struck, it lapses.
10. **The chair still records every vote.** Delegates write, sign, submit and propose from
    their own screens; votes stay with the chair, as today (section 10, decision 4). A
    vote on a draft resolution or an amendment belongs to it, and closing the vote
    settles it: a passed amendment is written in, a passed draft becomes a resolution.
11. **The procedure is the committee's settings.** The sponsor cap, the support a draft
    and an amendment need, friendly amendments, the words on screen and the rest of
    section 5 have defaults that match common North American procedure and switch to the
    other common procedures, THIMUN's among them, per committee, by anybody who holds
    `manage_committees` there.
12. **Deny by default, enforced in the database.** As everywhere: Row Level Security
    decides who reads and writes, the page asks the same helpers, and a paper somebody may
    not open is a 404.

## 4. What each paper does

| Kind               | Written by                | Format                                        | Signatures                         | Goes to                     | Ends                                   |
| ------------------ | ------------------------- | --------------------------------------------- | ---------------------------------- | --------------------------- | -------------------------------------- |
| Working paper      | A bloc of country seats   | Free text                                     | None                               | The dais, then the committee | Introduced, kept for reference          |
| Draft resolution   | Sponsors                  | Heading, preambulatory and operative clauses  | Sponsors and signatories together reach the minimum | The dais, then the committee | Resolution, failed, or withdrawn  |
| Committee directive | Sponsors (crisis)        | Operative clauses only                        | As a draft resolution              | The dais, then the committee | Passed (then the crisis staff answer), failed, or withdrawn |
| Joint directive    | Two or more characters    | Free text                                     | None                               | The crisis staff            | Carried out or refused, with an answer |
| Personal directive | One character             | Free text                                     | None                               | The crisis staff            | Carried out or refused, with an answer |
| Press release      | One or more characters    | Free text                                     | None                               | The crisis staff            | Published to the room, or refused      |

A committee's format decides which kinds it offers: a standard committee writes working
papers and draft resolutions; a crisis committee writes the four crisis kinds and, when
the organiser ticks the setting, working papers and draft resolutions as well.

### The life of a paper

```
                       open for signatures (drafts and committee directives)
                       ┌───────────────┐
                       ▼               │
  writing ──submit──▶ submitted ──approve──▶ approved ──introduce──▶ introduced ──vote──▶ passed / failed
     ▲                    │
     └──────return────────┘                     withdrawn: from writing, submitted, approved,
                                                and from introduced by the dais
  crisis staff kinds:  writing ──send──▶ submitted ──answer──▶ carried out / refused
                                                    (a press release: published / refused)
```

Opening for signatures is not a status: it is a flag on a paper being written, set and
cleared by its authors. A working paper skips the vote: it stays introduced. A committee
directive that passes goes to the crisis staff, who answer it like any other directive.

### The draft resolution's text

One shared text in two parts, built from a template the editor provides:

As built in step 4, the two parts are one editor: the preambulatory paragraphs, then the
numbered list. Saving splits them into `preamble_markdown` and `operative_markdown` at the
first numbered clause (`splitResolutionMarkdown`), so the columns of section 7 are kept.
Without JavaScript the two parts are two plain boxes.

- **The heading is not typed.** The committee, the topic, the sponsors and the signatories
  come from the data and are always current.
- **Preambulatory clauses** are paragraphs, one clause each.
- **Operative clauses** are one numbered list. Its items are the clauses; a list inside an
  item gives sub-clauses a, b, c, and a list inside that gives i, ii, iii. Nothing deeper.
- **The opening phrase is styled when the text is shown, not typed.** A clause that starts
  with a phrase from the lists in `$lib/resolution-phrases.ts` has that phrase set in
  italic (preambulatory) or underlined (operative) wherever the paper is read, printed or
  projected. The lists hold the British and American spellings ("Recognising",
  "Recognizing"). A phrase that is on no list is styled the same way when the author
  selects it and presses "Opening phrase", so a committee that writes in French, or likes
  "Urges strongly", is never stuck. Authors never fight the formatting.
- **Format checks are warnings, never blocks.** The writer page and the dais's review list
  what does not follow the format: a clause that starts with no known and no marked
  phrase, a preambulatory clause that does not end with a comma, an operative clause that
  does not end with a semicolon, a last clause without a full stop, a sponsor count above
  the cap, too little support. The dais decides. A committee whose format is its own
  turns the checks off (section 5); the support count is never turned off.
- **Submitting turns the text into clauses with ids** (section 7, versions), which is what
  lets an amendment point at "operative clause 3, sub-clause b" and keep pointing at it.

Working papers, joint and personal directives and press releases are one free text, the
same editor the position paper uses.

A draft resolution may say which introduced working papers it is **based on**. Their text
is shown beside the editor for the authors to work from; nothing is copied.

### Comments and suggestions

What Google Docs does, cut to what a bloc needs in a ninety-minute caucus.

- **A comment** is attached to a stretch of text the commenter selects, or to the whole
  paper. It opens a thread: replies under it, one level deep, in the order written. Any
  reader of the thread may resolve it, which folds it away; anybody who may reply may
  reopen it. A comment is edited or deleted only by its writer, and a deleted comment
  that has replies leaves "Comment deleted" in its place. The text a comment points at
  is shown highlighted in the paper; if that text is deleted the thread stays, marked
  "The text this was about was removed", with the words it quoted.
- **A suggestion** is an edit made in suggesting mode. Each author chooses "Editing" or
  "Suggesting" for themselves; the paper does not change mode for everybody. Inserted
  text is shown as proposed, deleted text as struck through, each with who suggested it
  and when, and with "Accept" and "Reject" for any other author. The suggester may
  withdraw their own. "Accept all" and "Reject all" sit in the paper's suggestion list.
  A suggestion may carry a comment thread, opened from it, for the argument about it.
- **Who comments, who reads.** A thread is read by the paper's authors and by whoever
  started it; a thread the dais starts is read by the whole dais as well. So:
  - Authors comment and suggest among themselves while writing. Nobody else ever reads
    those threads, not even after the paper is introduced.
  - While the paper is open for signatures, any delegate of the committee who may read it
    may comment, to ask the authors something before signing. They do not suggest.
  - While the paper is with the dais, the dais may comment on its text, which is how a
    return comes with notes on the clauses that need fixing; the return comment is the
    summary. The dais does not suggest: the text is frozen, and the authors make the fix.
  - Signatories do not suggest: suggesting is writing, and writing is for authors.
- **When it ends.** Submitting freezes the text, so open suggestions must be decided
  before the paper can be submitted, and the page says how many are left. Threads stay
  as they are. Once a paper is introduced its threads are closed to new replies and kept,
  read-only, for the people who could read them; from then on the paper changes only by
  amendment, and an amendment is the public, procedural way to argue about its text.
- **Position papers gain both.** The seat's delegate and the other members of their
  delegation, who may already write the paper with them, use the same writer, so they
  comment and suggest as a bloc does; all of them count as its authors. A chair's review
  of a position paper stays as it is.
- **Notifications** for comments are one per thread for the people in it: a reply to a
  thread you wrote in, and a new thread from somebody outside the authors. Not one per
  comment, and nothing for an author's own bloc chatter while they have the paper open.

## 5. Settings, per committee

On the committee's page under `/manage/[slug]/committees/[committeeId]`, a section
"Resolutions", for anybody with `manage_committees`. The defaults match common North
American procedure (UNA-USA and the university circuit, which most conferences on the
platform will follow) and need no change for most conferences. At the top, **"Start from"**
fills every setting below from a procedure in one press, after which each can still be
changed: *North American* (the defaults) or *THIMUN* (the procedure of THIMUN and the
many school conferences affiliated with it). An organiser who sets a conference up once
can copy one committee's settings to the others.

| Setting                                                    | North American (default)        | THIMUN                          | Notes                                                                 |
| ---------------------------------------------------------- | ------------------------------- | ------------------------------- | --------------------------------------------------------------------- |
| Format                                                     | Standard                        | Standard                        | Standard or crisis. Not set by "Start from".                         |
| Working papers and draft resolutions in a crisis committee | Off                             | Off                             | Shown only for a crisis committee.                                    |
| Words                                                      | Sponsors and signatories        | Main submitter and co-submitters | Display only. With THIMUN's words the lead author is the main submitter and every other author and signatory is a co-submitter. |
| Working papers                                             | On                              | Off                             | Off hides the kind; blocs write draft resolutions from the start.    |
| Most sponsors on a draft resolution                        | 5                               | No cap                          | Empty means no cap.                                                   |
| Support a draft resolution needs                           | 20% of the committee            | 3 seats                         | A number of seats or a share of the seats with a delegate, rounded up. |
| Sponsors count towards that support                        | Yes                             | Yes                             | No means signatories alone must reach it.                             |
| A seat may sponsor only one draft resolution per topic     | Off                             | Off                             | Some conferences insist on it.                                        |
| Friendly amendments                                        | On                              | Off                             | Off sends every amendment to the dais and the vote.                   |
| Support an unfriendly amendment needs                      | 10% of the committee            | None                            | Seats or a share, as above. The proposer counts.                     |
| Preambulatory clauses can be amended                       | No                              | No                              | Almost no conference allows it; the setting is there for those that do. |
| Amendments to amendments                                   | No                              | Yes                             | The second degree. One level only.                                    |
| Check the format                                           | On                              | On                              | Off for a committee writing in another language or its own format.   |

Observers (`seat_kind` `observer`) may sign but never sponsor or propose an amendment, as
at the United Nations; this is a rule, not a setting.

Settings are read when they matter and never rewritten into papers: changing the support a
draft needs changes what the next submission is checked against, not what has already
been submitted. Changing the words changes every screen at once, since they are only words.

## 6. The screens

This section says what each screen must do and show. It does not say how they look: the
writing screens are to be drawn first, as Claude Design artifacts, at a much higher polish
than the position paper writer has today, and built to those drawings (the next
subsection). Every screen follows `docs/DESIGN.md` unless the drawings the owner approves
say otherwise. The words are the ones a chair would say: "Working paper 1.1", "Draft
resolution 1.2", "Sponsors", "Signatories", "Submit to the dais", "Friendly",
"Unfriendly", "Strike clause 3". A crisis committee says "Directives" where a standard one
says "Resolutions", and a committee with THIMUN's words says "Main submitter" and
"Co-submitters".

### The design comes first

The owner judges today's writer (the position paper's: `$lib/components/markdown-editor/`
and `$lib/components/paper-writing/`) not good enough to build on as it looks. The
position paper writer, the committee paper writer and the readers below are one family
and are redrawn together, before step 2 is built. The drawings should cover:

- **The writer, as the main thing on screen**: the page of text as a sheet, the toolbar,
  who is here, the save state, the paper's people, the next step as the one primary
  button; at the product owner's viewport (about 1265 by 634) and at 390 wide.
- **A draft resolution being written**: the generated heading, the preambulatory and
  operative parts, numbered clauses and sub-clauses, styled opening phrases, the format
  checks and the support count, the working papers it is based on beside it.
- **Comments**: highlighted text, threads in the margin on a wide screen and under the
  text on a phone, replying, resolving, a resolved thread, a thread whose text is gone.
- **Suggestions**: "Editing" and "Suggesting", proposed and struck text, accepting and
  rejecting one, the list with "Accept all", submitting blocked by open suggestions.
- **The other states**: open for signatures (an author's view and a signatory's),
  submitted and frozen, returned with the dais's notes, introduced, and the committee's
  read-only view; the paper on the projector; the dais's review with its comments.
- **The paper as printed**: the record copy of a resolution.

Questions the drawings must answer, because `docs/DESIGN.md` does not: how writers are
told apart (today each is drawn in a colour worked out from their id, in
`$lib/live-writers.ts`, where DESIGN.md elsewhere refuses colours chosen from a name), how
proposed and struck text look without red and green, which mean state on this site, and
how much of the toolbar a bloc needs.

### For delegates, under `/conferences/[slug]/committees/[committeeSlug]`

- **`resolutions`**, the committee's papers. A table, stacked rows on a phone, in four
  sections in the order a delegate needs them: *Yours* (the papers the reader's seat
  writes or has signed, with their status and anything waiting on them, such as an
  amendment the reader's seat has to answer as a sponsor), *Open for signatures*,
  *Introduced* (working papers and drafts, by number), *Resolutions* (passed). The primary
  button is "Start a paper". The committee page's role links and the live view gain a link
  here.
- **`resolutions/new`**, a one-column form: the kind (only the kinds the committee's
  format offers), the title, the topic (the committee's topics; preset to the agenda
  topic), and for a draft resolution the working papers it is based on. "Start writing".
- **`resolutions/[paperId]`**, one paper. What it shows depends on the reader:
  - *An author, while writing*: the live editor, the authors present and their cursors,
    the save line, the format checks for a draft, the paper's people (authors and
    signatories, "Add an author", "Make lead", "Leave"), the comment threads beside the
    text, "Editing" or "Suggesting", and the open suggestions. The primary button is the
    next step: "Submit to the dais", or "Open for signatures" while a draft lacks the
    support it needs. A returned paper shows the dais's comment above the editor and the
    dais's notes on its clauses.
  - *A delegate of the committee, while it is open for signatures or once introduced*: the
    text, read only, with its heading. "Sign" (or "Remove my signature") and "Comment"
    while signatures are open; "Propose an amendment" on an introduced draft resolution.
  - *Anybody who may read it, after submission*: the current version, its number and
    status, its amendments with their status, and how each vote went.
  - Without JavaScript the editor is two plain text areas for a draft (the preambulatory
    clauses one per paragraph, the operative clauses as a Markdown numbered list) or one
    for any other kind, saved with a button, exactly as the position paper writer already
    falls back. Threads are listed under the text with a reply form each, and a new
    comment is on the whole paper. Suggesting needs JavaScript; while a paper has open
    suggestions the plain form says how many and does not save, because saving it would
    throw them away.
- **`resolutions/[paperId]/amendments/new`**: what to do (add a clause, change a clause,
  strike a clause), which clause (a select of the current operative clauses and
  sub-clauses, and the preambulatory ones where the committee allows it, or "after clause
  N" for an addition), the new text. "Propose amendment". Where friendly amendments are
  on, the sponsors are asked at once and the proposer sees the answers arrive; where they
  are off, it goes straight to collecting its support. Where the committee allows
  amendments to amendments, a pending unfriendly amendment offers "Amend this amendment",
  the same form with the amendment's text to change.
- **`resolutions/[paperId]/print`**: the paper in the format a conference prints and
  archives, with its heading. The resolution's record copy.
- **The live view** gains one line under the floor when a paper is introduced, voted on or
  on the projector, linking to it; and a quiet "Waiting for you" line when the reader's
  seat must answer an amendment.

### For the dais, under `chair/`

- **`chair/resolutions`**, a new tab beside Papers (which stays the position papers). In
  the order the dais works: *Submitted* (to review), *Amendments* (waiting for the dais,
  across every introduced draft, in the order the dais will take them; reorderable),
  *Approved, not introduced*, *Introduced*, *Decided*. Empty states are one sentence.
- **`chair/resolutions/[paperId]`**: the paper with its format checks and its support
  count, and comments on its text that the authors will read. "Approve as Draft
  resolution 1.2" (the number proposed from the topic and the count so far; editable) or
  "Return to the authors" with a comment. For an introduced draft: its amendments, each
  approved, ruled out of order with a reason, or put to the vote, with any amendment to
  it first; "Show on screen"; "Withdraw at the sponsors' request".
- **The motion composer**: introducing a document picks an approved paper from a list
  instead of typing its name. The free-text "Other" stays.
- **The vote view**: the vote form lists what may be voted on, in order: the approved
  unfriendly amendments of each introduced draft (an amendment to an amendment before the
  amendment), then, once a motion to close debate has passed, the drafts by number. The
  dais may open a vote on an amendment at any time, which is when THIMUN-style committees
  vote on one, or leave them all for voting procedure, as North American ones do. Opening
  a vote from the list ties it to its paper or amendment. A typed subject stays possible
  for anything else.
- **The projector** shows the paper the dais put on screen, large, with its clause
  numbers; during a vote on an amendment it shows the amendment and the clause it changes.

### For the crisis staff

- **`crisis`** under the committee, for anybody with `answer_directives`: the directives
  and press releases waiting for an answer, oldest first, with the character and the
  time; each one opens to its text, a text area for the answer, and "Carry out" or
  "Refuse" ("Publish" or "Refuse" for a press release). Answered ones below.
- **A crisis update**, a short text the crisis staff send to the room, shown on the live
  view and the projector until the next one. It is new: the room has no message a chair
  sends today (`LiveMessage` is the lobby and suspension screen). It lives on
  `committee_state`, so the room's existing realtime updates carry it.

### Notifications

New `notification_kind` values: added as an author; the paper was returned (to its
authors and its signatories), approved or introduced; a reply in a thread you wrote in; a
new thread on your paper from outside its authors; an amendment waits for your answer as
a sponsor; your amendment was accepted, declined, approved, ruled out of order, passed or
failed; your directive was answered.

## 7. The data model

One migration per step that needs one, each with database tests, never an edit to one
applied. The existing `documents` table stays the table of uploaded files: a co-written
paper is not a file, and the position papers' drafts already live in a table of their own
for the same reason.

### Enums

- `committee_format`: `standard`, `crisis`.
- `paper_kind`: `working_paper`, `draft_resolution`, `committee_directive`,
  `joint_directive`, `personal_directive`, `press_release`.
- `paper_status`: `writing`, `submitted`, `approved`, `introduced`, `passed`, `failed`,
  `withdrawn`, `carried_out`, `refused`, `published`.
- `paper_seat_role`: `author`, `signatory`.
- `amendment_action`: `add`, `change`, `strike`.
- `amendment_status`: `awaiting_sponsors`, `collecting_support`, `with_the_dais`,
  `approved`, `written_in`, `passed`, `failed`, `out_of_order`, `withdrawn`, `lapsed`.
- `paper_words`: `sponsors_and_signatories`, `submitters`.
- `support_unit`: `seats`, `percent`.
- New `notification_kind` values (section 6) and one new `permission`,
  `answer_directives` (section 8).

### Changes to existing tables

- `committees`, one column per setting of section 5: `format`,
  `crisis_allows_resolutions`, `paper_words`, `has_working_papers`, `sponsor_limit` (null
  for no cap), `support_minimum` with `support_unit`, `support_counts_sponsors`,
  `one_sponsorship_per_topic`, `has_friendly_amendments`, `amendment_support_minimum`
  with `amendment_support_unit`, `preamble_amendable`, `has_second_degree_amendments`,
  `checks_format`, each with the North American default and a check on its range. "Start
  from" and "copy to the other committees" are one function each that write these
  columns; nothing stores which procedure was chosen.
- `motions`: `paper_id`, for a motion to introduce a paper. `apply_passed_motion` learns
  that a passed `introduce_document` motion with a paper makes the paper `introduced`,
  records when and by which motion, and puts it on the projector.
- `votes`: `paper_id` and `amendment_id`, both `on delete set null`; the check
  `votes_says_what_it_is_about` accepts either; `document_id`, which nothing ever wrote,
  is dropped.
- `committee_state`: `displayed_paper_id`, the paper on the projector, and
  `crisis_update`, `crisis_update_at`.
- `documents`: the policy "Delegates and staff can read working papers" is dropped. Its
  rows can never exist, and it would let a committee read a bloc's private paper if one
  ever did. A check refuses the two unused `document_kind` values (Postgres cannot drop an
  enum value).

### `committee_papers`

`id`, `committee_id`, `kind`, `status`, `title`, `topic` (one of the committee's topics),
`topic_number` and `sequence` (set on approval; together they are the "1.2"),
`started_by_seat_id`, `lead_seat_id`, `is_open_for_signatures`, `document_state` (bytea, the Yjs document while writing, at most
1 MB), `body_markdown` (working papers and the free-text kinds), `preamble_markdown` and
`operative_markdown` (draft resolutions and committee directives), `revision`,
`updated_by`, `return_comment`, `answer_markdown` (the crisis staff's answer),
`submitted_at`, `decided_at` and `decided_by` (approval, return or answer),
`introduced_at`, `introduced_by_motion_id`, `created_at`, `updated_at`. Checks: the
Markdown columns match the kind; at most 100 000 characters each; a number only from
approval; the kind is one the committee's format offers.

### `committee_paper_seats`

`paper_id`, `seat_id`, `role`, `added_by`, `added_at`; primary key on the first two, so a
seat is an author or a signatory, never both. Triggers enforce the rules of sections 3
and 5: the seat is in the paper's committee and has a delegate; observers only sign; the
sponsor cap and the one-sponsorship setting, checked at submission rather than on every
row so a bloc can be over the cap while it decides who stays a sponsor; the authors and
signatories freeze at submission.

### `committee_paper_sources`

`paper_id`, `source_paper_id`: the introduced working papers a draft is based on.

### `committee_paper_versions`

`id`, `paper_id`, `version_number`, `content` (jsonb), `amendment_id` (null for the
version made by submitting), `created_at`. `content` is the structure every reader
renders and every amendment points into:

```json
{
  "preamble": [{ "id": "p1", "markdown": "Recalling its resolution 2417 (2018)," }],
  "operative": [
    {
      "id": "o1",
      "markdown": "Calls upon all parties to:",
      "children": [{ "id": "o1a", "markdown": "allow safe passage for aid convoys;", "children": [] }]
    }
  ]
}
```

Working papers and the free-text kinds store `{ "markdown": "…" }`. Ids are made once,
at submission, and kept by every later version; numbers and letters are worked out when
the text is shown. The conversion between Markdown and this structure, the numbering and
applying an amendment are pure functions in `$lib/paper-clauses.ts`, with unit tests.

An opening phrase the author marked by hand is stored as the formatting it shows as,
`*Recalling*` in the preamble and `++Calls upon++` in the operative part (underline is
already written `++text++` in this codebase), so it needs no new syntax; a phrase from the
lists is left plain in the text and styled when shown.

### `amendments`

`id`, `paper_id`, `sequence` ("Amendment 3" on that draft), `proposed_by_seat_id`,
`action`, `target_part` (`preamble` or `operative`), `target_clause_id` (the clause
changed or struck; for an addition, the clause it follows, null for the start),
`text_markdown` (null for a strike), `parent_amendment_id` (for an amendment to an
amendment, which changes the parent's `text_markdown`; its own parent must have none),
`status`, `queue_position` (the dais's order), `ruling` (the dais's reason when out of
order), `based_on_version_id`, `created_at`, `decided_at`. A passed amendment to an
amendment rewrites its parent's text and is recorded on it; the parent then goes to its
own vote.

### `amendment_seats`

`amendment_id`, `seat_id`, `role` (`signatory` or `sponsor_answer`), `accepts` (for a
sponsor's answer), `answered_at`. Where friendly amendments are on: when every sponsor
of the draft has accepted, the amendment is friendly and goes to the dais; the first
decline makes it unfriendly. An unfriendly amendment, and every amendment where friendly
ones are off, is `collecting_support` and goes to the dais once its signatories reach the
setting, at once when the setting is none. The proposer may also mark it unfriendly at
once rather than wait for the sponsors.

### Comments: `paper_comment_threads` and `paper_comments`

`paper_comment_threads`: `id`; the paper it is on, `committee_paper_id` or
`position_paper_seat_id` (exactly one, so position papers share the table);
`anchor_fragment` (`body`, `preamble` or `operative`), `anchor_start` and `anchor_end`
(Yjs relative positions, encoded; both null for a comment on the whole paper),
`quoted_text` (the words selected, kept for when they are deleted); `started_by` and
`started_by_seat_id`; `is_from_dais`; `suggestion_id` (when the thread argues about a
suggestion); `resolved_at`, `resolved_by`; `created_at`.

`paper_comments`: `id`, `thread_id`, `written_by`, `body` (plain text, at most 2 000
characters, links shown as links and nothing else), `edited_at`, `deleted_at`,
`created_at`.

Threads live in the database rather than in the Yjs document so that Row Level Security
decides who reads them: `may_read_thread(thread_id)` is the rule of section 4 (the
authors, the thread's starter, and the dais for a dais thread). The anchors are Yjs
relative positions, which keep pointing at the same words however the text around them
changes, and work on a frozen paper too, since its Yjs document is kept as it was
submitted. The editor draws a highlight for each thread the reader may read; a thread
whose anchors no longer resolve shows its `quoted_text`. Both tables join the realtime
publication, so a new comment appears for the others as it is posted.

### Suggestions, in the Yjs document

A suggestion is part of the text, not a conversation about it, so it lives in the
paper's Yjs document as two marks, `suggestedInsertion` and `suggestedDeletion`, each with
an id, the suggester's user id and the time. Accepting an insertion removes the mark;
rejecting it removes the text, and the other way round for a deletion. Every author's
editor carries them through the live channel like any other edit, so they need no table.

- `body_markdown`, `preamble_markdown` and `operative_markdown` are written from the
  document as if every open suggestion were rejected: they are the agreed text, which is
  what word counts, the plain form and the format checks read.
- `submit_paper` refuses a document with any suggestion mark left, read from
  `document_state` on the server, not trusted from the browser.
- The editing is a ProseMirror plugin. Tiptap's own Tracked Changes and Comments are
  paid add-ons from its private registry, and its Comments need Tiptap's cloud server,
  which the Supabase channel replaces (checked 8 October 2026). The candidate is
  `@handlewithcare/prosemirror-suggest-changes` (MIT, 0.1.8, last released December
  2025), which is young: step 3 begins with a short trial with Yjs and the Markdown
  extension, and writes the two marks and their plugin in this codebase if it falls
  short. It is a new dependency, so the owner says yes before it is added.

### The helpers and policies

- `is_paper_author(paper_id)`, `may_read_paper(paper_id)`,
  `may_join_paper_writing_channel(topic)` and `may_read_thread(thread_id)` (for a position
  paper's thread, "author" is `may_edit_paper_draft`), security definer and `search_path = ''`, as every helper in the codebase. `may_read_paper`
  is section 3, rule 3, in SQL: an author; the dais from opening for signatures or
  submission; the committee's delegates while open for signatures or once introduced;
  the conference team once introduced; the crisis staff for the crisis kinds; and for
  personal and joint directives, nobody else ever.
- Writes go through security-definer functions, one per thing a person does, so that each
  rule lives in one place and every status change is atomic: `start_paper`,
  `add_paper_author`, `leave_paper`, `set_paper_signatures_open`, `sign_paper`,
  `remove_signature`, `submit_paper` (freezes the text into version 1),
  `approve_paper`, `return_paper`, `withdraw_paper`, `propose_amendment`,
  `answer_amendment`, `sign_amendment`, `decide_amendment`, `answer_directive`,
  `hand_paper_lead`, `apply_committee_procedure`, `copy_committee_procedure`, and for
  comments `start_thread`, `reply_to_thread`, `edit_comment`, `delete_comment`,
  `resolve_thread`, `reopen_thread`. Typing, including making, accepting and rejecting
  suggestions, is the save of the live draft, as for position papers, allowed only to an
  author of a paper in `writing`.
- A trigger on `votes`: when a vote tied to a paper or an amendment closes, it settles
  it. A passed amendment becomes a new version of the draft; amendments still waiting
  whose clause it struck lapse. A passed amendment to an amendment rewrites its parent.
  A passed draft becomes `passed`; a failed one `failed`. A friendly amendment the dais
  approves is written in by `decide_amendment` the same way.
- `committee_papers`, `committee_paper_seats`, `amendments`, `paper_comment_threads` and
  `paper_comments` join the `supabase_realtime` publication. Realtime applies their read
  policies to every listener, so a private paper's changes, and a thread somebody may not
  read, never reach them.

### The live writing channel

`committee-paper:<paper id>`, private, broadcast only, exactly the protocol of
`paper:<seat id>`: Yjs updates and awareness in "changes", a state vector in "sync",
every browser saving its whole state and the server merging. The two policies on
`realtime.messages` ask `may_join_paper_writing_channel`, which is true for an author of a
paper in `writing`. A draft resolution's Yjs document holds two fragments, `preamble` and
`operative`, one editor each on the page. The position paper code is made general rather
than copied: `$lib/paper-live-channel.ts`, `paper-live.svelte.ts`,
`paper-live-save.svelte.ts`, `live-writers.ts`, `$lib/server/paper-live-drafts.ts` and
the components in `$lib/components/paper-writing/` take the channel and the save target
as arguments.

## 8. Permissions

Under `docs/roles-and-permissions.md`:

- **The dais's work is `run_room`.** Approving, numbering, commenting on and returning
  papers, deciding amendments, the projector, and introducing and voting, which `run_room`
  already covers.
  The Chair preset holds it. A conference that wants a separate approval panel makes a
  role with `run_room` and nothing else.
- **`answer_directives`, new, per committee**, in the Committees and rooms group: "Answer
  directives and press releases, and send crisis updates." The Chair preset gains it, so
  a crisis committee run by its chairs works on the day; a conference with a backroom
  team makes a Crisis staff role with it alone. It is the 21st permission; the roles
  editor lists it.
- **`manage_committees`** covers the settings of section 5.
- **Delegates need no permission.** A delegate of the committee may start, write, sign and
  amend under the rules of section 3. The conference team reads introduced papers and
  resolutions as part of the baseline.

## 9. Build order

The drawings first, then ten steps. Each step is a Trello card, shippable on its own with
`pnpm verify`, the database tests and the browser tests of the pages it touches. As in
the roles work, the policy, the server check and the screen of a step land together.

**Before step 2: the drawings.** The Claude Design artifacts of section 6, "The design
comes first", approved by the owner. Step 1 does not wait for them; steps 2 onwards build
to them. Like earlier redesigns, the approved drawings are what the screens reproduce.

Tick a step here when it is merged into `feature/mvp`, with the date:

- [ ] 0. The drawings approved
- [x] 1. Papers in the database (2026-10-09)
- [x] 2. Writing a working paper together (2026-10-09)
- [x] 3. Comments and suggestions (2026-10-09)
- [x] 4. Draft resolutions and signatures (2026-10-09)
- [x] 5. To the dais (2026-10-09)
- [x] 6. On the floor (2026-10-09)
- [x] 7. Amendments (2026-10-09)
- [x] 8. Voting on papers, and the record (2026-10-09)
- [x] 9. Crisis committees (2026-10-09)
- [x] 10. Test data and guides (2026-10-09)

| Step | Card                                 | What lands                                                                                                                                                                                                                           | Visible change                                                                                   |
| ---- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 1    | Papers in the database               | Every enum, table, column, helper, function and policy of section 7, comments included; the dropped policy and column; `answer_directives`; regenerated `database.types.ts`; `$lib/paper-clauses.ts` and its tests; database tests for every rule of sections 3 and 4. | None.                                                                                            |
| 2    | Writing a working paper together     | The live writing made general (section 7) and redrawn to the approved design, the position paper writer with it; `resolutions`, `resolutions/new` and the writer for working papers; authors added, leaving, the lead; the no-JavaScript fallback; the notification for being added. | A bloc writes a working paper together, live, across delegations, in the new writer. Position papers get the new writer too. |
| 3    | Comments and suggestions             | The trial of section 7 and the suggestion marks; "Editing" and "Suggesting"; accept, reject, accept all; threads on selected text and on the whole paper, replies, resolving, deleted text; the plain-form fallback; comment notifications; position papers get both. | Writers comment and suggest as in Google Docs.                                                   |
| 4    | Draft resolutions and signatures     | The two-part editor and its heading; `$lib/resolution-phrases.ts`, "Opening phrase" and the format checks; "based on" working papers; opening for signatures, signing, comments from would-be signatories and the support count; the settings of section 5, "Start from" and copying, on the committee's manage page. | A bloc writes a draft in the right format and collects signatures.                               |
| 5    | To the dais                          | Submitting, blocked by open suggestions, and the first version; `chair/resolutions` and the review page with the dais's comments; approving and numbering, returning with a comment, withdrawing; notifications to authors and signatories. | The dais receives, numbers and returns papers in MUNMeet instead of on a laptop.                 |
| 6    | On the floor                         | `motions.paper_id` and the composer's list; `apply_passed_motion` introducing; threads closed on introduction; the reading page for the committee; the live view's line; "Show on screen" and the projector.                      | An introduced paper is on every delegate's screen and on the wall.                               |
| 7    | Amendments                           | The amendment form, preambulatory where allowed; the sponsors' answers, friendly and unfriendly, or neither where friendly amendments are off; support; amendments to amendments; the dais's queue with rulings and order; a friendly amendment written in; lapsing. | Delegates propose amendments from their seats; the dais keeps one ordered queue.                 |
| 8    | Voting on papers, and the record     | `votes.paper_id` and `amendment_id`; the vote form's list, amendments at any time; the closing trigger; resolutions on the committee page; the print page; the projector during an amendment vote.                               | A vote settles its paper. The conference ends with every resolution on record.                   |
| 9    | Crisis committees                    | The committee format; the four crisis kinds; `crisis` for the crisis staff; answers; published press releases; crisis updates on the live view and the projector.                                                                | A crisis committee runs in MUNMeet.                                                              |
| 10   | Test data and guides                 | The walkthrough seed gains a bloc with a working paper and open comments and suggestions, a draft with amendments in each status, a passed resolution, a THIMUN-style committee and a crisis committee; `docs/TESTING-GUIDE.md`; the for-organisers brief's 6.8, 6.13 and section 8 say what is now true. | The test site shows a full committee day.                                                        |

Steps 1 to 5 are the minimum that answers the feedback: delegates write together, comment
and suggest as in Google Docs, and the dais receives the result. Step 9 depends only on 1,
2 and 5 and can be built before 6 to 8 if a crisis conference comes first.

### Starting step 1

- One migration, named for the day and "committee_papers", with the header comment the
  existing migrations carry and the closing line that it is never edited once applied.
  Order: enums, the committee columns, the tables, the helpers, the functions, the
  triggers, the policies, the realtime policies and publication, then the changes to
  `motions`, `votes`, `committee_state` and `documents`.
- `pnpm db:reset`, `pnpm db:types`, `pnpm test:db` from `client/`. New test files
  `client/tests/db/committee-papers.test.ts` and `amendments.test.ts`, with fixtures
  beside `conference-fixtures.ts` for a committee with seated delegates.
- Comments get their own test file, `client/tests/db/paper-comments.test.ts`, which
  proves section 4's reading rule from every side: an author, a would-be signatory, the
  dais, another delegate of the committee, the team.
- `client/tests/db/documents.test.ts` inserts a `working_paper` through the service role
  to test reads; that test goes, with the policy.
- Nothing in `client/src`, `client/tests` or the seeds reads or writes
  `votes.document_id` (checked 8 October 2026), so dropping it touches only the
  regenerated `database.types.ts`.

## 10. Decisions

### Taken by the product owner, 8 October 2026

1. **Every kind of paper a real committee writes** is in scope: working papers, draft
   resolutions, amendments, and the crisis kinds. The owner left the line to this
   specification's judgement; crisis committees are built last (step 9) so that the
   common case lands first.
2. **The rules are settings with common defaults** (section 5), not one conference's
   procedure.
3. **A paper is private to its authors until they show it** (section 3, rule 3). The dais
   sees it from submission, as in a real caucus. The specification reads "show" to include
   opening for signatures, because a paper the whole room can read cannot be hidden from
   its chairs.
4. **Delegates write, sign, submit and amend from their own screens; the chair still
   records every vote.** Delegates voting from their phones stays out, as the
   for-organisers brief says.

### Taken by this specification, 8 October 2026, at the owner's request

The owner asked for these to be settled so that they work for every kind of conference
that might use MUNMeet. The test for each: a conference that runs differently changes a
setting, it does not need a different product.

5. **The tab and the route are "Resolutions"** (`resolutions`, `chair/resolutions`),
   "Directives" in a crisis committee; "Papers" stays the position papers. Every
   procedure calls what a committee produces a resolution, whatever it calls the drafts
   on the way there.
6. **What counts as enough support is a setting**: a number of seats or a share of the
   seats with a delegate, with or without the sponsors counted (section 5). North
   American conferences ask for a share, about a fifth; THIMUN-style conferences ask for
   a few named co-submitters. A single fixed rule would be wrong for half of them.
7. **Signatures survive a return** from the dais (section 3, rule 6), and every signatory
   is told and may take theirs back. A signature means "this should be debated", not
   "I agree with every word"; collecting them again costs a bloc a whole caucus, for a
   correction the dais asked for.
8. **Amendments change operative clauses by default.** Amending the preamble, friendly
   amendments and amendments to amendments are each a setting (section 5), because
   conferences split on all three: North American rules have friendly amendments and no
   second degree, THIMUN rules the other way round, and a few allow the preamble.
9. **The opening phrase is styled automatically**, with an "Opening phrase" button for
   anything the lists miss, and the format checks warn but never block (section 4). A
   committee can turn the checks off; the support count is never a check, it is a rule.
   Phrase lists differ between conferences and a beginner should not be stopped by one.
10. **The crisis staff answer in writing in MUNMeet**, and may mark a directive carried
    out with an empty answer, so a backroom that answers on paper still keeps the record
    of what happened.
11. **Two starting points, North American and THIMUN**, and every setting editable after
    (section 5). Nearly every conference's rules descend from one of the two; a
    conference with its own procedure starts from the nearer one and changes what
    differs. Nothing stores which one was chosen, so there is no third, half-supported
    "custom" mode.
12. **A comment thread is read by the authors and the person who started it**, and by the
    whole dais when the dais started it (section 4). A would-be signatory's question is
    between them and the bloc, not a public argument in front of the room, and the dais
    can note things on a submitted paper without the committee watching.
13. **Only authors suggest; signatories, delegates and the dais comment.** The people
    who own a text change it. Somebody outside the bloc who wants different words asks in
    a comment before submission or proposes an amendment after introduction, which is
    how the room works on paper too.
14. **Open suggestions block submission; open comments do not.** The dais must receive
    one agreed text. A question left unanswered does not change any words.
15. **Position papers get comments and suggestions too**, from the same editor. A
    delegation already writes its members' position papers together
    (`may_edit_paper_draft`), and a delegate's classmates marking up a draft is
    exactly what suggestions are for. Everybody who may edit the draft counts as an
    author. The dais's review of position papers stays as it is.
16. **Suggestions use an open-source ProseMirror plugin after a trial, never Tiptap's
    paid add-ons** (section 7). The trial and the owner's yes to the new dependency open
    step 3; if the plugin falls short, the marks are written here.
17. **The writers are drawn before they are built** (section 6), and the position paper
    writer is redrawn with them, so a delegate meets one writer everywhere.

## 11. Not in this specification

These came up while writing it. Each is a decision of its own.

- **A history of a draft while it is written**, who wrote which words and the text as it
  was an hour ago. The versions of section 7 start at submission; before that, only the
  live document exists.
- **Mentioning somebody in a comment** with "@". Comments already notify the people in
  the thread, and the authors of a thread somebody outside them starts (section 4).
- **Dividing the question**: voting a draft's operative clauses one by one. The clause
  structure of section 7 makes it possible.
- **Speakers for and against a draft, and an author panel** as their own speakers' lists.
  Today the dais uses a moderated caucus or a single speaker.
- **Points, yields to questions and right of reply** (the for-organisers brief, section 8).
  They belong to the room, not to papers.
- **Notes passed between delegates.** Common at conferences, and a welfare question at a
  school conference before it is a product one.
- **Delegates voting from their own screens.**
- **Papers in quick sessions.** A quick session is the chair's screen only and its
  delegates have no accounts; votes there keep a typed subject.
- **Exporting every resolution of a conference as one document** for the closing
  ceremony or the archive.
