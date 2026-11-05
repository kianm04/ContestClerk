# /home, final specification: "Your next conference"

The signed-in home page of MUNMeet, 29 October 2026. This is the winning concept
("Your next conference", a boarding pass) with every must-fix applied and the grafts the
judges named folded in where they strengthen it. Where two judges disagreed, the owner
lens won. Everything here is decided; there are no options left for the build.

Reader for every wireframe: Sofia Almeida, the seed's delegate (Morocco in UNHRC at
Amsterdam Open MUN 2027, accepted, an overdue invoice from Rotterdam Spring MUN 2026, a
position paper still to write, no programme published). Every size is in rem at a 16px
root; the site's `--page-scale` and the window scaling in `layout.css` apply on top, as on
every page. Pixel figures for the owner's 1265 × 634 window use the 15.4px rem that scale
gives it.

The whole page is server-rendered from `HomeDashboard`. Every control is a link; the
page has no form and no JavaScript of its own. One dark-blue button, always in the hero.

---

## 1. Concept

The page is a boarding pass. It does not greet the reader with a picture of a hall they
are not in; it leads with their next conference as one object: the organiser's own
photograph, the conference's name in serif, the reader's seat with its flag, how long to
go, and one button. When something is pressing anywhere in their MUN life, that thing is
written into the pass as the "Next step" and takes the button: an overdue invoice from
last spring's conference, the delegation seats a head has not filled, the papers a chair
has not read, the applications an organiser has not decided. The door into the conference
is then the text link beside the button, so nobody is ever locked out.

Under the pass come short ruled lists, in the order a reader needs them: the rest of what
they owe, the programme, the latest announcements from their conferences, the other
conferences they belong to (each with its own photograph, its own door and its own status
word), applications still waiting for an answer, their practice sessions, and, for anyone
who does not organise, three conferences open for applications as the directory's own
cards. A delegate opens it every morning because the countdown changes, the due words turn
from grey to amber to red, and the organisers' announcements appear here first. An
organiser opens it because applications waiting for a decision are counted in the pass and
listed per conference as rows with a "Review applications" link. On a conference day the
pass turns light blue, says which session is running and what is next, and its button
opens the room.

It is drawn with the parts the owner already approved: the manage area's `StatStrip`,
`ManageSection`, `ActionRow` and `StatusDot`, the `InSessionBand`'s light-blue fill for a
live day, and the directory's `ConferenceCard`. Home, the manage list and the directory
read as one product.

---

## 2. Page anatomy

The page sits in the ordinary framed `<main>` (`max-w-6xl`, 72rem, 1.5rem gutters,
`py-8`). `/home` leaves `FULL_BLEED_ROUTE_IDS` in `page-frame.ts`. 72rem is DESIGN.md's
normal page width and what the conference page uses; at the owner's window it is 1109px
with 78px of white each side, a frame rather than a gap. 64rem would leave 140px of dead
space each side; 90rem spread the old boxes thin. The top bar and footer are unchanged;
the top bar's search box is always shown (`hasOwnConferenceSearch` is removed).

### 2a. Desktop, 1280 wide, Sofia, the whole page

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ MUNMeet   Home  Conferences  Applications  Schedule  Resources   [Search conferences] ◌  SA  │ top bar, unchanged
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │ 32
│  Good evening, Sofia.                                                   Create a conference  │ serif 22/28 · text link
│                                                                                              │ 16
│  ┌────────────────────────────────────────────────────────────────────────────────────────┐  │ panel: white, hairline, 10px
│  │ Your next conference                                           ┌────────────────────┐  │  │ small secondary
│  │ Amsterdam Open MUN 2027                                        │                    │  │  │ h1 serif 30/38
│  │ Delegate · 25 – 27 Jul 2027 · Beurs van Berlage, Amsterdam     │   banner, 3:2      │  │  │ small secondary
│  │ ──────────────────────────┬───────────────────────────────     │   22rem wide       │  │  │ hairline
│  │ 8 months                  │ [MA] Morocco                       │   6px radius       │  │  │ 26/32 600 tabular
│  │ to go                     │ UNHRC                              │   centred in the   │  │  │ small secondary
│  │ ──────────────────────────┴───────────────────────────────     │   column           │  │  │ hairline
│  │ Next step                                                      │                    │  │  │ small 500 secondary
│  │ Pay invoice rotterdammun-2026-0001                ● Overdue    └────────────────────┘  │  │ body 500 · status word
│  │ Rotterdam Spring MUN 2026 · €65.00 · was due 2 Apr 2026                                │  │ small secondary
│  │ [ Pay invoice ]   Open committee page                                                  │  │ primary · text link
│  └────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                              │ 40
│  To do                                                                                       │ 16/24 600 sans
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │ 1px black rule
│  Submit position paper (UNHRC)                               By 25 Jul 2027    Write paper   │ ActionRow: word · link
│  Amsterdam Open MUN 2027 · Morocco                                                           │ small secondary
│  ────────────────────────────────────────────────────────────────────────────────────────── │ hairline
│                                                                                              │ 40
│  Open for applications                                                      All conferences  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  ┌──────────────────────────┐ ┌──────────────────────────┐ ┌──────────────────────────┐      │ ConferenceCard × 3
│  │ banner 3:1               │ │ banner 3:1               │ │ banner 3:1               │      │ (the directory card,
│  │ (Closing soon)           │ │ (Applications open)      │ │ (Applications open)      │      │  Carbon icons, h-full)
│  │ Vienna University MUN    │ │ The Hague International  │ │ BERMUN 2026              │      │
│  │ 2027                     │ │ MUN Junior               │ │ Sample Europe MUN Network│      │
│  │ Sample Europe MUN Network│ │ Sample Europe MUN Network│ │ Berlin, Germany          │      │
│  │ Vienna, Austria          │ │ The Hague, Netherlands   │ │ 25 – 29 Dec 2026         │      │
│  │ 19 – 22 Mar 2027         │ │ 8 – 10 Dec 2026          │ │ High school · 350 deleg. │      │
│  │ University · 250 deleg.  │ │ Mixed · 200 delegates    │ │ WHA  Arctic Crisis       │      │
│  │ ECOSOC  WHO              │ │ GA1  UNICEF              │ │                          │      │
│  └──────────────────────────┘ └──────────────────────────┘ └──────────────────────────┘      │
│                                                                                              │ 32 (main's pb-8)
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ © 2026 MUNMeet · Terms · Privacy · Contact                                                   │ footer, unchanged
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

Sofia's page ends there. She has one conference (it is the hero), no programme published,
no announcement yet, no application waiting, no quick session, so those sections are not
drawn. Nothing is ever drawn empty.

### 2b. The owner's first screen, 1265 × 634, Sofia

Budget at the 15.4px rem: top bar 61 · `pt-8` 31 → 92 · greeting 27 → 119 · gap 15 → 134 ·
panel border and padding 24 → 158 · label 19 → 177 · name 37 → 214 · meta 19 → 233 · strip
(15 above, 1, 15, value 31, label 19, 15, 1) → 330 · next step (15, 1, 12, label 19, title
23, meta 19) → 419 · actions (15, button 38) → 473 · padding and border 24 → 497 · gap 39 →
536 · "To do" title, padding and rule 33 → 569 · first row 54 → 623. The fold at 634 falls
under the paper row.

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐ 0
│ MUNMeet   Home  Conferences  Applications  Schedule  Resources  [Search conferences] SA │ 61
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  Good evening, Sofia.                                              Create a conference  │ 92–119
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │ 134
│  │ Your next conference                                       ┌──────────────────┐   │  │
│  │ Amsterdam Open MUN 2027                                    │                  │   │  │
│  │ Delegate · 25 – 27 Jul 2027 · Beurs van Berlage, Amsterdam │   banner 3:2     │   │  │
│  │ ────────────────────────┬────────────────────────────      │   339 × 226      │   │  │
│  │ 8 months                │ [MA] Morocco                     │                  │   │  │
│  │ to go                   │ UNHRC                            │                  │   │  │
│  │ ────────────────────────┴────────────────────────────      │                  │   │  │
│  │ Next step                                                  └──────────────────┘   │  │
│  │ Pay invoice rotterdammun-2026-0001              ● Overdue                         │  │
│  │ Rotterdam Spring MUN 2026 · €65.00 · was due 2 Apr 2026                           │  │
│  │ [ Pay invoice ]   Open committee page                                             │  │ 434–473
│  └───────────────────────────────────────────────────────────────────────────────────┘  │ 497
│  To do                                                                                  │ 536
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │ 569
│  Submit position paper (UNHRC)                          By 25 Jul 2027     Write paper  │
│  Amsterdam Open MUN 2027 · Morocco                                                      │ 623
└─────────────────────────────────────────────────────────────────────────────────────────┘ 634
```

Above the fold: who she is, her conference with its real photograph, her seat and flag,
the countdown, the overdue invoice as the next step with the one filled button that pays
it, her door into the committee, and the paper she still owes. Nothing decorative, no box
without a fact in it, no dead space.

### 2c. Phone, 390 wide, Sofia

One column, 1rem gutters, 358px of content. The photo moves to the top of the panel at
3:1 (358 × 119), bleeding to the panel's edges under its top corners. The strip runs two
figures to a row. The button fills the width at 44px; the door link under it is a 44px
target. The primary stays in the hero rather than in a fixed bar: it is on the first
screen already, and a bar would cover the rows under it. Dates are never abbreviated.

```
┌──────────────────────────────────────┐ 0
│ ≡   MUNMeet                  ◌   SA  │ 56
├──────────────────────────────────────┤
│ Good evening, Sofia.                 │ serif 22/28
│ Create a conference                  │ text link, 44px target
│ ┌──────────────────────────────────┐ │
│ │        banner 3:1, 358 × 119     │ │
│ ├──────────────────────────────────┤ │
│ │ Your next conference             │ │
│ │ Amsterdam Open MUN 2027          │ │ serif 26/32
│ │ Delegate · 25 – 27 Jul 2027 ·    │ │
│ │ Beurs van Berlage, Amsterdam     │ │
│ │ ───────────────┬──────────────── │ │
│ │ 8 months       │ [MA] Morocco    │ │ 26/32
│ │ to go          │ UNHRC           │ │
│ │ ───────────────┴──────────────── │ │
│ │ Next step                        │ │
│ │ Pay invoice                      │ │
│ │ rotterdammun-2026-0001           │ │
│ │ Rotterdam Spring MUN 2026 ·      │ │
│ │ €65.00 · was due 2 Apr 2026      │ │
│ │ ● Overdue                        │ │ status under the meta
│ │ [        Pay invoice           ] │ │ 44px, full width
│ │ Open committee page              │ │ link, 44px target
│ └──────────────────────────────────┘ │ ≈ 640
│                                      │
│ To do                                │
│ ──────────────────────────────────── │
│ Submit position paper (UNHRC)        │
│ Amsterdam Open MUN 2027 · Morocco    │
│         By 25 Jul 2027   Write paper │ right block wraps under, right-aligned
│ ···································· │
│                                      │
│ Open for applications                │
│ All conferences                      │ title link drops under the title
│ ──────────────────────────────────── │
│ ┌──────────────────────────────────┐ │
│ │ card 1, full width               │ │ two cards; the third is hidden below lg
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ card 2                           │ │
│ └──────────────────────────────────┘ │
│ © 2026 MUNMeet · Terms · Privacy     │
└──────────────────────────────────────┘
```

The word "Overdue" and the "Pay invoice" button are within the first 640px of the
phone's 844: the first lens's test passes without scrolling.

---

## 3. Sections, in page order

| # | Region | Shown when |
| - | ------ | ---------- |
| 3.1 | Title row | always |
| 3.2 | Hero: the next conference | `upcomingConferences` has at least one card |
| 3.3 | Hero: find a conference | `upcomingConferences` is empty |
| 3.4 | To do | at least one task remains after the hero took its next step |
| 3.5 | Today's programme / Programme | a conference day with events left, or any upcoming event |
| 3.6 | Announcements | at least one announcement across the reader's conferences |
| 3.7 | Also coming up | `upcomingConferences` has more than one card |
| 3.8 | Applications | an application or delegation that is draft, submitted, waitlisted or rejected at a conference not yet over |
| 3.9 | Quick sessions | `quickSessions` has at least one |
| 3.10 | Open for applications | the reader manages no conference and `exploreConferences` is not empty |

Every section from 3.4 on is a `ManageSection`: a 16/24 semibold sans title, at most one
text link at the right of the title, a 1px black rule, then rows separated by hairlines.
Nothing is boxed except the hero panel and the explore cards. A section with nothing in
it is not drawn; the page never shows an empty state, a dashed box or an illustration.

### 3.1 Title row

- Always shown. Left: the greeting, `greeting(hour, fullName)` as today ("Good evening,
  Sofia."), serif 22/28 weight 500, black, a `<p>`. The page's `<h1>` is the conference
  name in the hero (or "Find your first conference").
- Right, on the same baseline: at most one text link, chosen by `titleRowLink(dashboard)`:
  1. nothing, when the "Quick sessions" section is on the page (its own title link "New
     quick session" is the way to one);
  2. "Run a quick session" → `newQuickSessionUrl()`, when the reader chairs a committee
     (`chairsSomething`);
  3. "Create a conference" → `createConferenceUrl()`, when the reader manages nothing
     (`hasManagedConferences` is false);
  4. nothing, for an organiser (the Manage tab is theirs).
- No date, no sentence, no buttons. On a phone the link drops under the greeting as a 44px
  target whose top and bottom margins are pulled in by 8px each, so the row grows by 28px
  rather than 44 and a live day's button stays in the first screen; `StatStrip`'s figures
  likewise sit two to a row with 12px above and below instead of 16 on a phone.

### 3.2 Hero: `HomeHero`, kind `conference`

Shown when `upcomingConferences` has at least one card; the hero is `upcomingConferences[0]`
(the builder already puts a conference running today first, then the soonest).

One panel: shadcn `Card.Root` with the same overrides `ConferenceCard` uses
(`rounded-2xl border border-border py-0 gap-0 shadow-none ring-0`). In this codebase
`--radius-2xl` resolves to `0.625rem`, so the corner is 10px, the same as menus, dialogs
and the explore cards; it is never raised to a true 16px. No shadow, no hover: the panel
holds several links and is not itself one. On an ordinary day it is white with a hairline
border; on a conference day it takes `InSessionBand`'s fill (`bg-accent`, #EEF7FF) and no
border, so a live day has one largest thing that looks like the band the owner approved.

Two columns from `md` (48rem) up: the facts column (`min-w-0 flex-1`) and the photo
column (`w-[22rem] shrink-0`), 1.5rem padding all round, 1.5rem between them. Below `md`
one column: the photo first at the top of the panel, then the facts with 1rem padding.

**Facts column**, top to bottom:

1. Label, small secondary (13/20): "Your next conference". On a conference day a
   `StatusDot` tone `brand`: "Running now · day 2 of 3" (`conferenceDayLabel`).
2. Name, `<h1>`, serif `text-manage-title` (30/38, 26/32 below `md`), black, a link to
   the hero's door (`card.href`).
3. Meta line, small secondary, parts joined with " · ", leaving out what is empty:
   `rolePhrase · dates · place`. `dates` is `formatDateRange(startDate, endDate)`
   ("25 – 27 Jul 2027"); `place` is "{venueName}, {city}", or the city alone, or "Online".
   `rolePhrase` by `roleKind`:
   - `seat`: "Delegate"
   - `chair`: "{title} of {committeeHeading}" ("Chair of DISEC", "Vice chair of UNSC")
   - `organiser`: "Organiser"
   - `head`: "Head of delegation · {delegationName}"
   - `member`: "Delegation · {delegationName}"
   - `accepted`: "Accepted · seat to come"
   - `volunteer`: "Volunteer"
4. The figure strip, `StatStrip`, 1rem above and below, one to three figures. A figure is
   only ever a real value; the role lives in the meta line. On an ordinary day:
   - Figure 1, always: value the countdown, `upcomingConferenceWhen` without "in" and
     capitalised ("8 months", "6 weeks", "6 days", "Tomorrow"); label "to go".
   - Figure 2, by role: `seat`: value the seat name with its flag before it
     (`flagCountryCode`, `Flag` size `md`, 40 × 30, left out for a seat that is not a
     country), label the committee heading ("UNHRC"). `chair`: value the papers waiting
     ("3", "0" is shown), label "papers to review". `head`: value "0 of 2", label "seats
     assigned", left out while the delegation has been given no seats: "0 of 0" is not a
     value. `organiser`, published: value the applications waiting ("4", "0" shown),
     label "applications waiting". `organiser`, draft: value "2 of 6", label "setup steps
     done". `member`, `accepted`, `volunteer`: no figure 2.
   - Figure 3: `seat` with the paper handed in: value "Handed in", label "position paper"
     (a paper not handed in is a task, never a figure; a paper is in when its review
     status is submitted or approved, and one sent back for changes is owed again).
     `organiser`, published: value "41 of 120", label "seats held" (`heroSeats`, section
     9), left out until the conference has a seat on offer. Nobody else has a third.
   On a conference day figures 1 and 3 are replaced:
   - 1 → value "In session" / "Not in session" / "No session yet" / "Session 2 ended",
     label "{committeeHeading} · {session name}" for a seat or chair, read off the title
     of the `TodayItem` of the card's own role (`ownTodayItem` in
     `$lib/upcoming-conferences.ts`, which falls back to the conference's first item when
     the role has none); a seat's item and a chair's both read "{committeeHeading} ·
     {session name} in progress" while a session runs, so either gives "In session /
     UNHRC · Session 3". For an organiser value "3 of 4", label "committees in session".
   - 3 → value the time of the event in progress or next ("12:30"), label "Committee
     session 3 ends" (the end time is the value, so the label does not repeat it) or
     "Next: Lunch · Atrium"; left out when nothing is left on today's programme, today
     being read in the conference's timezone: `todayEvents` is the server's 24-hour
     window and by the evening holds tomorrow morning's first event, which
     `eventsLeftToday` in `$lib/home-rows.ts` leaves out.
5. Next step block, only when the primary rule picks a task (section 4): a hairline, then
   "Next step" (small 500 secondary), then the task title (body 15/24 500) with its due
   word at the right (`StatusDot`, section 5), then the task's detail in small secondary,
   except for the hero conference's own `publish` task, whose detail counts the setup
   steps the strip two lines above already counts: that step has no detail line. The
   block is not a link; the button under it is.
6. Actions, 1rem above: the page's one primary `Button` (`variant="primary"
   size="dense"`, the manage area's button), then one text link beside it, 1rem apart
   (section 4). On a phone the button is full width and the link sits under it.

**Photo column**: the banner only when `bannerPath` is set, drawn by `HeroPhoto`: 3:2,
`object-cover`, `object-position: center`, 6px radius, a 1px inset hairline
(`outline outline-1 -outline-offset-1 outline-foreground/10`) so a pale photograph keeps an
edge, vertically centred in the column (`self-center`). It is inset in the panel's padding
and never stretched to the facts column's height, so the organiser's 16:6 banner is cropped
once, at the sides, and never to a taller shape. On a phone it is 3:1, full width, bleeding
to the panel's top edge under the rounded corners. With no banner the facts take the whole
width and nothing stands in for the photo: no initials, no gradient, no placeholder.

Sample, Sofia: label "Your next conference"; name "Amsterdam Open MUN 2027"; meta
"Delegate · 25 – 27 Jul 2027 · Beurs van Berlage, Amsterdam"; figures "8 months / to go",
"[MA] Morocco / UNHRC"; next step "Pay invoice rotterdammun-2026-0001 · ● Overdue /
Rotterdam Spring MUN 2026 · €65.00 · was due 2 Apr 2026"; button "Pay invoice"; link "Open
committee page".

### 3.3 Hero: `HomeHero`, kind `find`

Shown instead of 3.2 when `upcomingConferences` is empty: a new account, a reader whose
applications were all refused or withdrawn, a reader whose conferences are all over.

The same panel, facts only, no photo. `<h1>` "Find your first conference" when
`hasTakenPart` is false (the server's reading of every seat, chair, staff row, delegation
membership and application the reader ever had, past or to come, in any state; a quick
session is not a conference) and the page itself lists no application, managed conference
or chair; "Find your next conference" otherwise, so a reader whose only conference is over
is told "next". One fact line, small secondary:
"6 conferences are open for applications." / "1 conference is open for applications." /
"No conference is open for applications right now." (`openConferenceCount`, section 9).
Then the primary `Button` "Find a conference" →
`conferenceListUrl({ ...EMPTY_CONFERENCE_QUERY, openOnly: true })`, with the text link "Run a
quick session" → `newQuickSessionUrl()` beside it (`secondary`), the other thing this reader
can do right now and the three presses to a running session that
`tests/e2e/quick-session.spec.ts` budgets; the link is left out when the page offers it
elsewhere, at the right of the greeting for a chair (3.1) or in "Quick sessions" (3.9).
Nothing else: no search box, no second sentence, no outline button. The top bar's search box
stays, so the page never shows two searches.

### 3.4 To do

- Shown when `remainingTasks(tasks, hero)` is not empty: the task the hero took as its
  next step is not also a row. Title "To do". No title link.
- Rows are `ActionRow`s, in `tasks` order (overdue first, then soonest deadline, then
  undated in kind order; section 9 adds `review_applications` to the order). No limit.
- Each row: `title` (dense 14/20 500), `detail` (small secondary), and in the right slot
  the due word (`StatusDot`, section 5; nothing for an undated task) then the task's verb
  as a text link (`text-dense font-medium text-link`, 44px tall target) → `task.href`.
  No checkbox, no icon, no button: the page's button is in the hero. On a phone the right
  slot wraps under the text, right-aligned, the due word and the verb side by side on
  that line.

| kind | title | detail | due word | link |
| --- | --- | --- | --- | --- |
| invoice | Pay invoice rotterdammun-2026-0001 | Rotterdam Spring MUN 2026 · €65.00 · was due 2 Apr 2026 (or "due 4 Dec 2026"; the amount only) | Overdue, In 5 days, … | Pay invoice |
| position_paper | Submit position paper (UNHRC) | Amsterdam Open MUN 2027 · Morocco | By 25 Jul 2027 (first day when no deadline is set) | Write paper |
| application | Finish your application (BERMUN 2026) | Applications close 20 Nov 2026 (or "No closing date") | In 22 days | Finish application |
| delegation_seats | Assign delegation seats (Rotterdam Grammar Delegation) | Amsterdam Open MUN 2027 · 2 seats nobody holds yet | — | Assign seats |
| publish, ready | Publish Draft Conference (not public) | Draft · 6 of 6 setup steps done | — | Publish |
| publish, not ready | Finish setting up Draft Conference (not public) | Draft · 2 of 6 setup steps done | — | Continue setup |
| review_papers | Review 3 position papers (DISEC) | The Hague International MUN Junior | — | Review papers |
| review_applications | Decide 4 applications (BERMUN 2026) | The oldest came in 6 days ago. (one: "It came in yesterday.") | — | Review applications |
| profile | Complete your profile | Your school and country are missing. | — | Edit profile |

- Handed-in papers are not rows: the hero's figure says "Handed in" for the hero
  conference, and a paper at another conference that is in needs nothing from the reader.
  `completedTasks` leaves `HomeDashboard`.

### 3.5 Today's programme / Programme

- On a conference day (the hero is live): title "Today's programme", title link "Full
  schedule" → `conferenceScheduleUrl(hero.slug)`. Rows from `todayEvents` of the hero
  conference that have not ended and fall on today in the conference's timezone
  (`eventsLeftToday` in `$lib/home-rows.ts`; `todayEvents` is the server's 24-hour
  window, so by the evening it holds tomorrow morning's first session, which is not
  today's), for the whole conference or one of the reader's committees, soonest first,
  limit 6. With nothing left today the section falls back to "Programme".
- Otherwise: title "Programme", title link "Full schedule" → `myScheduleUrl()`. Rows from
  `upcomingEvents`: the next five across the conferences the reader takes part in or
  helps run that have not ended (`participatingConferenceIds`, section 9 item 3).
- Row (`ProgrammeRow`, one link to `conferenceScheduleUrl(slug, { day })`): a fixed
  left column, small tabular secondary, `w-[9rem]` on a conference day ("12:30 – 13:30")
  and `w-[13rem]` otherwise (`eventWhen`: "Sat 25 Jul · 09:00 – 10:30", "Tomorrow · 09:00
  – 10:30"); then the title (dense 14/20 500) and a meta line "{location} · {conference
  name}" (the location alone on a conference day, since the hero names the conference).
  An event in progress carries the status word "Now" with a brand dot at the right. On a
  phone the time column sits above the title, left-aligned.
- Empty: not drawn. Sofia's conference has no programme, so her page has none.

### 3.6 Announcements

- Shown when `announcements` holds at least one: the three newest announcements the reader
  may read across the conferences they take part in or help run that have not ended
  (`participatingConferenceIds`, section 9 item 3); an announcement from a conference
  that is over never takes a slot.
- Title "Announcements". Title link "All announcements" →
  `conferenceAnnouncementsUrl(slug)` when every row is from one conference; none otherwise.
- Row (`AnnouncementRow`, one link to its conference's announcements page): title (dense
  14/20 500), meta "{conference name} · {formatRelativeTime}" ("Amsterdam Open MUN 2027 ·
  3 days ago", "… · 12 Oct 2026" once it is a week old) in small secondary. No badge, no
  body text. Order: newest first. Limit 3.

### 3.7 Also coming up

- Shown when `upcomingConferences` has more than one card: every card but the hero, in
  the builder's order (running today first, then soonest).
- Title "Also coming up". Title link "Manage" → `manageUrl()` for a reader with a managed
  conference; none otherwise.
- Row (`ConferenceRow`, one link to `card.href`, the reader's own door; hover fill
  `bg-accent`):
  - a 3:2 thumbnail, 6rem × 4rem (4.5rem × 3rem on a phone), `object-cover`, 6px radius,
    1px inset hairline (`ConferenceThumb`). A conference without a banner draws nothing in
    the slot, which keeps its width so the names line up; when no row in the list has a
    banner the column is left out entirely.
  - name, serif `text-h3` (16/24 600), black;
  - meta, small secondary: `roleParts · dates · city` (`ConferenceRowData.metaParts`; the
    card carries no `roleLine`), with the seat's flag (`Flag` `sm`, 20 × 15) before the
    seat name: "UNHRC · [MA] Morocco · 25 – 27 Jul 2027 · Amsterdam", "DISEC · Chair ·
    8 – 10 Dec 2026 · The Hague", "Organiser · 25 – 29 Dec 2026 · Berlin", "Head of
    delegation · Rotterdam Grammar Delegation · 25 – 27 Jul 2027 · Amsterdam" for its
    head and "Delegation · Rotterdam Grammar Delegation · …" for a member, "Delegate ·
    seat to come · …", "Volunteer · …";
  - right, `shrink-0`: for an organiser's row the `manageStatusLine` words as a `StatusDot`
    ("Applications open" success, "Applications open on 13 Dec" neutral, "Applications
    not open yet" neutral, "Applications closed" neutral, "Draft · not public" neutral,
    "Day 2 of 3" brand); for every other row the countdown, capitalised, no dot
    ("In 8 months", "Tomorrow"), or "Today" with a brand dot while it runs.
  - on a phone the right word sits under the meta, left-aligned.
- Limit 8. Beyond it, `ShowAllLink` under the rows: "Show all 11" → `/home?all=conferences`,
  which `load` reads and lifts the limit. No row is ever silently cut.

### 3.8 Applications

- Shown when `myApplications` has an entry: the loader keeps only entries whose status
  is draft, submitted, waitlisted or rejected at a conference that has not ended (accepted
  ones are conferences and are the hero or a row of 3.7; withdrawn ones are left out).
  A delegation is held to the same line as an individual application: it is a role, and
  so a conference, only once accepted; before that it is an entry here and nowhere else.
- Title "Applications". Title link "All applications" → `myApplicationsUrl()`.
- Row (`ApplicationRow`, one link via `homeApplicationHref`): the conference name in serif
  16/24 600; meta `homeApplicationLine` ("Submitted 2 Oct 2026", "Delegation · Rotterdam
  Grammar Delegation", "Draft · closes in 5 days"); right, the status word (section 5).
- Order: submitted and waitlisted first (soonest conference first), then drafts, then
  rejected. Limit 3.

### 3.9 Quick sessions

- Shown when `quickSessions` has at least one. Title "Quick sessions". Title link "New
  quick session" → `newQuickSessionUrl()`.
- Row: `ActionRow` with `title` the committee name, `detail` the status line ("Last
  session 24 Sept 2026", "No session yet"); right slot: `StatusDot` "In progress" (brand)
  when `session.isInProgress`, which `toMyQuickSessions` sets from the newest session's
  status (`in_progress` and started) with the same test the status line uses, so the dot
  and the words never disagree; then the text link "Open chair room" (`text-dense
  font-medium text-link hover:underline`, a 44px target) → `session.href`.
- Order: most recently used first, as loaded. Limit 3, then `ShowAllLink` "Show all 5" →
  `/home?all=quick`.

### 3.10 Open for applications

- Shown when the reader manages no conference and `exploreConferences` is not empty.
  Always last. Organisers never see it: home does not sell them other people's conferences,
  and their page is already the longest.
- Title "Open for applications". Title link "All conferences" →
  `conferenceListUrl({ ...EMPTY_CONFERENCE_QUERY, openOnly: true })`.
- `ConferenceCard` × 3 in `grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, every
  card `h-full` so a row's cards are one height (the "inconsistent card sizing" card). The
  third card is `hidden lg:block`. The card is the directory's, with its three lucide
  glyphs swapped for Carbon (`Location`, `Calendar`, `UserMultiple`, 16px) before this
  page ships (build plan step 1). `EXPLORE_CONFERENCE_LIMIT` becomes 3 and the query
  orders closing-soonest first, so "Closing soon" pills land on the left.
- Nothing under the grid. No footnote, no "Organising a conference yourself?" sentence.

### 3.11 Nothing after the last section

The footer follows. No closing call to action, no workspaces strip, no "Run a conference?"
card.

---

## 4. The primary button and the secondary actions

Exactly one dark-blue button on the page, always in the hero. `homePrimary(dashboard,
now)` picks it; the first rule that applies wins.

1. **A conference day.** The hero conference runs today and the reader has a `TodayItem`
   there for the card's own role (`ownTodayItem`: the chair's `chair-{committeeId}` item,
   the seat's `seat-{committeeId}`, the organiser's `organise-{conferenceId}`, keys built
   by `todayItemKey`, falling back to the conference's first item when the role has none):
   its first link is the button, "Open live room" (seat), "Open chair room" (chair),
   "Open dashboard" (organiser). The text link beside it is "Today's programme"
   → `conferenceScheduleUrl(hero.slug)`. No next-step block; an overdue task becomes the
   first To do row instead. A reader with no item on a live day (accepted without a
   seat, volunteer, delegation member) falls through to rule 2.
2. **A pressing task, from any conference that has not ended.** The first task in `tasks`
   order that is pressing becomes the hero's next step and its verb is the button. A task
   is pressing when any of these holds:
   - its deadline has passed or falls within the next 7 days (the same window that gives
     a due word its colour, section 5), whichever conference it belongs to;
   - it has no deadline and its kind is `review_applications`, `review_papers` or
     `delegation_seats`: somebody is waiting on the reader;
   - it has no deadline, its kind is `publish`, and its conference is the hero conference.
   The `profile` task is never pressing; it is only ever a To do row. The text link beside
   the button is the hero conference's door with the door label (rule 3's words), so the
   conference is one press away even while the button is about something else. Every task
   but `profile` belongs to a conference, and a conference that is over (its `end_date` has
   gone by in its own timezone, or it is archived: `hasConferenceRowEnded` in
   `$lib/server/home.ts`) gives none: not a paper, a review, seats to assign, applications
   to decide nor a draft to publish, so nothing nobody can act on takes the button. An
   unpaid invoice is the one exception: money still owed stays a task, which is how
   Sofia's Rotterdam invoice is her next step.
3. **The hero conference's door**, from `card.href`, labelled by `roleKind`: "Open
   committee page" (seat), "Open chair room" (chair), "Open dashboard" (organiser,
   published), "Continue setup" (organiser, draft), "Open delegation" (head, member),
   "View conference" (accepted, volunteer). The text link beside it is "Conference page"
   → `conferenceUrl(slug)`, "Public page" for an organiser; on a conference day it is
   "Today's programme" → `conferenceScheduleUrl(slug)` instead, so a volunteer or a
   delegation member, who has no room, still reaches the day's schedule in one press.
4. **No conference.** "Find a conference" in the find hero, with "Run a quick session" beside
   it unless the greeting or the "Quick sessions" section already offers one (3.3).

A task that is the hero's next step is removed from To do (`remainingTasks`). The rules
leave no state with zero or two buttons: a reader with a conference always has rule 3, a
reader without one always has rule 4, and the title row never holds a button.

Everything else is a text link in link blue, never an outline button: the one link beside
the primary, the title row's link, each section's title link, each row's verb, "Show all
N", and each row that is a door (conference, application, programme, announcement rows
are links across their whole width). No icon buttons, no chevrons, no "View all →" arrows.
There are no destructive actions on this page.

---

## 5. Status vocabulary

A status is a word in small 13/20 black text; a dot (8px, `StatusDot`'s tones) only where
colour adds something the word alone does not. Red means overdue or refused, amber means
waiting or soon, light blue means live, green means done or open. Nothing else on the page
is coloured.

**Due words** (`dueWord(deadline, now)` in `$lib/home-rows.ts`):

| word | when | dot |
| --- | --- | --- |
| Overdue | the day has passed | danger |
| Today | due today | warning |
| Tomorrow | due tomorrow | warning |
| In 2 days … In 7 days | within a week | warning |
| In 8 days … In 30 days | within a month | none |
| By 25 Jul 2027 | more than 30 days away | none |
| (nothing) | no deadline | — |

"Pressing" (section 4) and "coloured" are the same set: a task whose word has a dot is one
that takes the button.

**Hero**: label "Your next conference" (none) · "Running now · day 2 of 3" (brand) ·
figures "In session", "Not in session", "No session yet", "Session 2 ended", "Handed in",
"0 of 2", "41 of 120", "2 of 6" (no dot; a figure is a value, not a status).

**Conference rows**: "Today" (brand) · "In 8 months", "Tomorrow" (none) · organiser rows:
"Applications open" (success), "Applications open on 13 Dec", "Applications not open yet",
"Applications closed", "Draft · not public", "Ended" (neutral), "Day 2 of 3" (brand).

**Application rows**: "Under review" (warning), "Waitlisted" (warning), "Not accepted"
(danger), "Draft" (neutral). These are `statusLabel`'s own words. "Accepted" never appears
on the page: an accepted application is a conference.

**Programme rows**: "Now" (brand) on the event in progress; nothing on the others.

**Quick sessions**: "In progress" (brand); nothing otherwise.

**Explore cards**: "Applications open", "Closing soon", "Opens 3 Nov 2026" as
`ConferencePill` draws them; they are the card's own.

---

## 6. Reader states, first screen

Each sketch is the desktop first screen with the top bar left out.

### (a) Noor, a new account with nothing

```
Good morning, Noor.                                              Create a conference
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Find your first conference                                                       │ h1
│ 6 conferences are open for applications.                                         │ small secondary
│ [ Find a conference ]                                                            │
└──────────────────────────────────────────────────────────────────────────────────┘
To do
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Complete your profile                                                  Edit profile
Your school and country are missing.
────────────────────────────────────────────────────────────────────────────────────
Open for applications                                               All conferences
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌ Vienna University MUN 2027 ┐ ┌ The Hague International MUN Junior ┐ ┌ BERMUN 2026 ┐
```

The profile task stays a row: a person with no conference came to find one, and the
button is "Find a conference". Real cards with real banners fill the rest of the screen.

### (b) Sofia, delegate, eight months out

Section 2b. Button "Pay invoice" on the overdue Rotterdam invoice as the next step; door
"Open committee page" as the link; the paper as the one To do row; three cards.

### (c) Sofia on day 2, UNHRC in session

```
Good morning, Sofia.                                             Create a conference
┌─ light blue fill, no border ─────────────────────────────────────────────────────┐
│ ● Running now · day 2 of 3                                 ┌────────────────┐    │
│ Amsterdam Open MUN 2027                                    │   banner 3:2   │    │
│ Delegate · 25 – 27 Jul 2027 · Beurs van Berlage, Amsterdam │                │    │
│ ───────────────────┬──────────────────┬──────────────────  │                │    │
│ In session         │ [MA] Morocco     │ 12:30              │                │    │
│ UNHRC · Session 3  │ UNHRC            │ Next: Lunch · Atrium                │    │
│ ───────────────────┴──────────────────┴──────────────────  └────────────────┘    │
│ [ Open live room ]   Today's programme                                           │
└──────────────────────────────────────────────────────────────────────────────────┘
To do
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pay invoice rotterdammun-2026-0001                      ● Overdue     Pay invoice
Rotterdam Spring MUN 2026 · €65.00 · was due 2 Apr 2026
────────────────────────────────────────────────────────────────────────────────────
Today's programme                                                     Full schedule
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
09:00 – 12:30   Committee session 3                                          ● Now
                Room 2.04
────────────────────────────────────────────────────────────────────────────────────
12:30 – 13:30   Lunch
                Atrium
```

The room outranks the debt today, so the invoice is the first To do row with its red
word, not the button. The paper task is gone because the paper is in.

### (d) Jasper, head of the Rotterdam Grammar delegation, no seat himself

```
Good evening, Jasper.                                            Create a conference
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Your next conference                                        ┌────────────────┐   │
│ Amsterdam Open MUN 2027                                     │   banner 3:2   │   │
│ Head of delegation · Rotterdam Grammar Delegation ·         │                │   │
│ 25 – 27 Jul 2027 · Beurs van Berlage, Amsterdam             │                │   │
│ ────────────────────────┬────────────────────────────       │                │   │
│ 8 months                │ 0 of 2                            │                │   │
│ to go                   │ seats assigned                    │                │   │
│ ────────────────────────┴────────────────────────────       └────────────────┘   │
│ Next step                                                                        │
│ Assign delegation seats (Rotterdam Grammar Delegation)                           │
│ Amsterdam Open MUN 2027 · 2 seats nobody holds yet                               │
│ [ Assign seats ]   Open delegation                                               │
└──────────────────────────────────────────────────────────────────────────────────┘
Open for applications                                               All conferences
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌ card ┐ ┌ card ┐ ┌ card ┐
```

"Assign seats" is the button and the page says "0 of 2" and "2 seats nobody holds yet"
without a tap. No To do section: his one task is the next step. No "No committees yet"
box; he simply has no committee.

### (e) Lucas, chair of DISEC at The Hague, three papers waiting, two quick sessions

```
Good afternoon, Lucas.
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Your next conference                                        ┌────────────────┐   │
│ The Hague International MUN Junior                          │   banner 3:2   │   │
│ Chair of DISEC · 8 – 10 Dec 2026 · The Hague                │                │   │
│ ────────────────────────┬────────────────────────────       │                │   │
│ 1 month                 │ 3                                 │                │   │
│ to go                   │ papers to review                  │                │   │
│ ────────────────────────┴────────────────────────────       └────────────────┘   │
│ Next step                                                                        │
│ Review 3 position papers (DISEC)                                                 │
│ The Hague International MUN Junior                                               │
│ [ Review papers ]   Open chair room                                              │
└──────────────────────────────────────────────────────────────────────────────────┘
Quick sessions                                                    New quick session
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Thursday practice                                    ● In progress   Open chair room
Session 2 in progress
────────────────────────────────────────────────────────────────────────────────────
Rules of procedure drill                                             Open chair room
Last session 24 Sept 2026
────────────────────────────────────────────────────────────────────────────────────
Open for applications                                               All conferences
```

No title-row link: the section's "New quick session" is the way to one.

### (f) Hugo, organiser of eight upcoming conferences, one of them a draft

```
Good evening, Hugo.
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Your next conference                                        ┌────────────────┐   │
│ The Hague International MUN Junior                          │   banner 3:2   │   │
│ Organiser · 8 – 10 Dec 2026 · The Hague                     │                │   │
│ ───────────────────┬──────────────────────┬───────────────  │                │   │
│ 1 month            │ 4                    │ 41 of 120       │                │   │
│ to go              │ applications waiting │ seats held      │                │   │
│ ───────────────────┴──────────────────────┴───────────────  └────────────────┘   │
│ Next step                                                                        │
│ Decide 4 applications (The Hague International MUN Junior)                       │
│ The oldest came in 6 days ago.                                                   │
│ [ Review applications ]   Open dashboard                                         │
└──────────────────────────────────────────────────────────────────────────────────┘
To do
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Decide 7 applications (BERMUN 2026)                             Review applications
The oldest came in 2 days ago.
────────────────────────────────────────────────────────────────────────────────────
Finish setting up Draft Conference (not public)                      Continue setup
Draft · 2 of 6 setup steps done
────────────────────────────────────────────────────────────────────────────────────
Also coming up                                                               Manage
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌──────┐ BERMUN 2026                                             ● Applications open
│photo │ Organiser · 25 – 29 Dec 2026 · Berlin
└──────┘
────────────────────────────────────────────────────────────────────────────────────
┌──────┐ Vienna University MUN 2027                              ● Applications open
│photo │ Organiser · 19 – 22 Mar 2027 · Vienna
└──────┘
────────────────────────────────────────────────────────────────────────────────────
┌──────┐ Copenhagen Schools MUN 2027                   Applications open on 13 Dec
│photo │ Organiser · 28 – 30 Mar 2027 · Copenhagen
└──────┘
… Madrid (Applications closed), Brussels, Amsterdam, Draft Conference (Draft · not public)
```

On the seed as it stands nobody has applied to Hugo's conferences, so his page shows "0 /
applications waiting", no "Decide" rows, the draft's "Continue setup" as the only To do
row, and "Open dashboard" as the button. Rotterdam Spring MUN 2026 (over) is not on the
page. No "Open for applications" for an organiser.

### (g) Amira, whose only application was not accepted

```
Good evening, Amira.                                             Create a conference
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Find your next conference                                                        │
│ 6 conferences are open for applications.                                         │
│ [ Find a conference ]                                                            │
└──────────────────────────────────────────────────────────────────────────────────┘
Applications                                                       All applications
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BERMUN 2026                                                          ● Not accepted
Submitted 2 Oct 2026
────────────────────────────────────────────────────────────────────────────────────
Open for applications                                               All conferences
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌ card ┐ ┌ card ┐ ┌ card ┐
```

The refusal is said once, as a word with a red dot, under the way forward.

---

## 7. Components

All under `src/routes/home/` unless marked `$lib`. Every component is under 100 lines,
runes only, no snippets except the `children` a shadcn component takes. Every word is
written in `$lib/home*.ts` or `$lib/tasks.ts`, never in markup. "Reuses" names what it is
built from as is; "replaces" names what is deleted.

| Component | Props | What it is | Reuses / replaces |
| --- | --- | --- | --- |
| `+page.svelte` | `data: PageProps` | Stacks the blocks of section 3 in a `flex flex-col gap-10` column, `{#if}`s only, `now` from `data.now`. | Replaces the grid and `homeGridCells`. |
| `HomeTitleRow` | `greeting: string`, `link: HomeLink \| null` | The greeting `<p>` and the one text link at its right; wraps on a phone. | Replaces `GreetingHero`. |
| `HomeHero` | `hero: ConferenceHero` | The panel: `Card.Root` with the fill by `hero.label.isLive`, `HeroFacts` left, `HeroPhoto` right when there is a banner. | New. Composes shadcn `Card`. Replaces `UpcomingConferenceStrip`, `UpcomingConferenceCard`, `LiveConferenceCard`, `LivePill`, `StripArrowButton`, `StripProgressBar`. |
| `HeroFacts` | `hero: ConferenceHero` | Label (with `StatusDot` when live), `<h1>` link, meta line, `StatStrip`, `HeroNextStep`, `HeroActions`. | New. Reuses `StatStrip`, `StatusDot`. |
| `HeroNextStep` | `step: HeroNextStep` | Hairline, "Next step", title with `StatusDot` due word, detail. | New. |
| `HeroActions` | `primary: HomeLink`, `secondary: HomeLink \| null` | The one primary `Button` and the text link beside it; full width on a phone. | Reuses `$lib/components/Button.svelte` (`variant="primary" size="dense"`). |
| `HeroPhoto` | `name: string`, `bannerPath: string`, `aspect: 'photo' \| 'phone'` | The banner at 3:2 inset, or 3:1 bleeding at the top on a phone. Mounted only with a banner. | New. Not `ConferenceBanner`, whose no-photo branch draws initials on a gradient. |
| `FindHero` | `hero: FindHero` | The find panel: `<h1>`, fact line, primary `Button`. | Replaces `FindConferenceCard`. |
| `ToDoSection` | `tasks: HomeTask[]`, `now: Date` | `ManageSection` "To do" with a `<ul>` of `TaskRow`s. | Replaces `MyTasks`. |
| `TaskRow` | `task: HomeTask`, `now: Date` | `ActionRow` with the due `StatusDot` and the verb link in its slot. | Rewritten; no `Card`, no `Square` icons. |
| `ProgrammeSection` | `title: string`, `link: HomeLink`, `rows: ProgrammeRowData[]` | `ManageSection` with `ProgrammeRow`s. | Replaces `UpcomingEvents`. |
| `ProgrammeRow` | `row: ProgrammeRowData` (`id`, `href`, `when`, `title`, `meta`, `isNow`) | Time column, title, meta, "Now". | Replaces `UpcomingEventCard`. |
| `AnnouncementsSection` | `announcements: HomeAnnouncement[]`, `link: HomeLink \| null`, `now: Date` | `ManageSection` with `AnnouncementRow`s. | New. |
| `AnnouncementRow` | `announcement: HomeAnnouncement`, `now: Date` | Title and "conference · time ago", one link. | New. |
| `ComingUpSection` | `rows: ConferenceRowData[]`, `link: HomeLink \| null`, `moreCount: number`, `hasThumbs: boolean` | `ManageSection` "Also coming up", `ConferenceRow`s, `ShowAllLink`. | Replaces `MyCommittees`, `CommitteeRow`, `ManagedConferences`, `ManagedConferenceCard`, `MyWorkspaces`, `WorkspaceChip`. |
| `ConferenceRow` | `row: ConferenceRowData`, `hasThumb: boolean` | Thumb, serif name, meta with `Flag`, status word; one link. | New. Reuses `Flag`, `StatusDot`, `ConferenceThumb`. |
| `ConferenceThumb` (`$lib/components`) | `name: string`, `bannerPath: string \| null` | The 3:2 thumbnail with its inset hairline, or an empty slot. | New. |
| `ApplicationsSection` | `entries: ApplicationListEntry[]`, `now: Date` | `ManageSection` "Applications" with `ApplicationRow`s. | Replaces `MyApplications`. |
| `ApplicationRow` | `entry: ApplicationListEntry`, `now: Date` | Serif name, line, status word; one link. | Rewritten without `Badge`, `Avatar`, `Card`. |
| `QuickSessionsSection` | `rows: MyQuickSession[]`, `moreCount: number` | `ManageSection` with `ActionRow`s and `ShowAllLink`. | Replaces `QuickSessions`, `QuickSessionRow`. |
| `ExploreSection` | `conferences: Conference[]`, `now: Date` | `ManageSection` "Open for applications" with the three-up grid. | Replaces `ExploreConferences`, `ExploreCarousel`, `ExploreSlide`, `RunAConferenceCard`. |
| `ShowAllLink` | `count: number`, `href: string` | "Show all 11" in small link text under a list, 44px target. | New, about 15 lines. |
| `ManageSection`, `StatStrip`, `ActionRow`, `StatusDot` (`$lib/components/manage`) | as today, with two phone changes: `ManageSection`'s title link is a 44px target below `sm` (`inline-flex min-h-11 items-center -my-3`, the negative margin cancelling the added height so the heading row and its rule move on no page); `ActionRow` wraps its right slot under the text below `sm` (`max-sm:flex-wrap` on the row, slot `max-sm:basis-full max-sm:justify-end`). `StripStat` gains `flagCountryCode?: string`, drawn as a `Flag` `md` before the value | Section frames, figures, task rows, status words. | Reused. |
| `ConferenceCard` (`$lib/components`) | as today | The explore cards. | Reused, with Carbon icons (build step 1). |

Types, in `$lib/home.ts`:

```ts
export type HomeLink = { label: string; href: ResolvedPathname };
export type HomeAnnouncement = { id; title; publishedAt; conferenceName; conferenceSlug; conferenceTimezone };
export type HomeDashboard = {
  upcomingConferences: UpcomingConferenceCard[];   // every one, no cap; [0] is the hero
  tasks: HomeTask[];
  todayItems: TodayItem[];
  todayEvents: TodayEvent[];                       // the server's 24-hour window; eventsLeftToday reads today per conference
  upcomingEvents: UpcomingEvent[];                 // no conferenceBannerPath: a programme row draws no photograph
  announcements: HomeAnnouncement[];
  myApplications: ApplicationListEntry[];          // draft/submitted/waitlisted/rejected, not past, max 3
  quickSessions: MyQuickSession[];
  exploreConferences: Conference[];                // [] for a reader who manages anything
  hasManagedConferences: boolean;
  chairsSomething: boolean;
  hasTakenPart: boolean;                           // ever held a seat, chaired, helped as staff, belonged to a delegation or applied, past ones included; false says "first" in the find hero
  openConferenceCount: number | null;              // read only when upcomingConferences is empty
  heroSeats: { held: number; onOffer: number } | null; // read only for a published organiser hero
  showAll: 'conferences' | 'quick' | null;         // from ?all=
};
```

In `$lib/home-hero.ts` (pure, tested without Svelte):

```ts
export type HeroFigure = StripStat & { flagCountryCode?: string };
export type HeroNextStep = { taskId: string; title: string; detail: string | null; due: DueWord | null };
export type ConferenceHero = {
  kind: 'conference'; conferenceId: string; slug: string; name: string; href: ResolvedPathname;
  bannerPath: string | null; label: { text: string; isLive: boolean }; metaLine: string;
  figures: HeroFigure[]; nextStep: HeroNextStep | null; primary: HomeLink; secondary: HomeLink | null;
};
export type FindHero = { kind: 'find'; title: string; factLine: string; primary: HomeLink };
export type HomeHero = ConferenceHero | FindHero;
export function homeHero(dashboard: HomeDashboard, now: Date): HomeHero;
export function isPressing(task: HomeTask, heroConferenceId: string | null, now: Date): boolean;
export function remainingTasks(tasks: HomeTask[], hero: HomeHero): HomeTask[];
export function doorLabel(card: UpcomingConferenceCard): string;
export function titleRowLink(dashboard: HomeDashboard): HomeLink | null;
```

In `$lib/home-rows.ts`:

```ts
export type DueWord = { text: string; tone: StatusDotTone; hasDot: boolean };
export function dueWord(deadline: TaskDeadline, now: Date): DueWord;
export type ConferenceRowData = { id; name; href; bannerPath; metaParts: string[]; flagCountryCode: string | null; status: DueWord };
export function conferenceRows(cards: UpcomingConferenceCard[], showAll: boolean): { rows: ConferenceRowData[]; moreCount: number; hasThumbs: boolean };   // no `now`: the cards carry their words
export function comingUpLink(dashboard: HomeDashboard): HomeLink | null;   // "Manage" for a reader who helps run a conference
export type ProgrammeRowData = { id; href; when; title; meta; isNow };
export function heroCommitteeIds(card: UpcomingConferenceCard): string[];   // the committee the reader sits in or chairs at the hero conference
export function eventsLeftToday(events: TodayEvent[], conferenceId: string, readerCommitteeIds: string[], timezone: string, now: Date): TodayEvent[];   // not ended, and on today where the conference is
export function todayProgrammeRows(events: TodayEvent[], hero: ConferenceHero, readerCommitteeIds: string[], now: Date): ProgrammeRowData[];
export function programmeRows(events: UpcomingEvent[], now: Date): ProgrammeRowData[];
export type ProgrammeSectionData = { title: string; link: HomeLink; rows: ProgrammeRowData[] };
export function programmeSection(dashboard: HomeDashboard, hero: HomeHero, now: Date): ProgrammeSectionData | null;   // "Today's programme" on a live day with events left, else "Programme", else null
export function applicationStatus(entry: ApplicationListEntry): DueWord;   // from statusLabel / statusBadgeTone
export function announcementsLink(announcements: HomeAnnouncement[]): HomeLink | null;
export function quickSessionRows(sessions: MyQuickSession[], showAll: boolean): { rows; moreCount };
export const COMING_UP_LIMIT = 8; export const QUICK_SESSION_LIMIT = 3;
```

`$lib/tasks.ts`: `HomeTaskKind` gains `review_applications`; `HomeTask` gains
`conferenceId: string | null`, `detail: string | null`, `actionLabel: string`;
`TaskFacts` gains `waitingApplications: WaitingApplications[]` (`conferenceId`,
`conferenceName`, `conferenceSlug`, `count`, `oldestSubmittedAt`) and the seat, invoice
and delegation facts carry the columns of section 9. A position paper with no deadline
takes the conference's first day as its deadline. The `publish` rule lists every draft,
ready or not, with `countDone` / `countRequired` of `publishChecklistItems` in its detail.
`TASK_KIND_ORDER` becomes profile, position_paper, invoice, application,
review_applications, delegation_seats, review_papers, publish.

`$lib/upcoming-conferences.ts`: `UpcomingConferenceCard` gains `slug`, `startDate`,
`endDate`, `timezone`, `city`, `venueName`, `locationMode`, `roleKind`, `seat: { name;
countryCode; committeeHeading; committeeId; positionPaper: 'handed_in' | 'due' | 'none' }
| null`, `chair: { title; committeeHeading; committeeId; papersWaiting } | null`,
`delegation: { id; name; isHead; seatCount; emptySeatCount } | null`, `organiser: {
status: ManageStatusLine; applicationsWaiting: number; setupSteps: { done; required } |
null } | null`, `when: { text: string; isLive: boolean }` ("In 8 months", "Today").
`UPCOMING_CONFERENCE_LIMIT` is removed: the list is complete and the page caps it. The
card has no `roleLine` or `dateLine`: nothing drew them, and a row's words are
`ConferenceRowData.metaParts`. `UpcomingConferenceSource` gains `status:
ConferenceStatus`, and the builder leaves an archived conference out as it leaves a past
one out, whatever its dates: archiving is how a published conference is cancelled.
`UpcomingConferenceFacts` has no `todayEvents`; the hero reads them from the dashboard.
New export `ownTodayItem(role: RoleDetails, conferenceId: string, items: TodayItem[]):
TodayItem | null`, the item of the card's own role at its conference, which fills the
card's `liveButton` and the live hero's first figure (section 3.2, section 4 rule 1).

`$lib/home-today.ts`: new export `todayItemKey(kind, id)`, the one place an item's key
(`chair-{committeeId}`, `seat-{committeeId}`, `organise-{conferenceId}`,
`volunteer-{conferenceId}`, `delegation-{delegationId}`) is written, so `ownTodayItem`
can build the key of a role's item. A seat's item reads "{committeeHeading} · {session
name} in progress" while a session runs, the chair's shape, so the hero's first figure
reads either the same way.

`$lib/my-quick-sessions.ts`: `MyQuickSession` gains `isInProgress: boolean`. `export
function isQuickSessionInProgress(latestSession: LatestQuickSession | null): boolean`
(the newest row is `in_progress` and has started) is shared by `quickSessionStatusLine`
and `toMyQuickSessions`, so the line and the flag come from one question.

Controls on the page: the project's `Button` for the one primary, as the manage pages and
`InSessionBand` draw it (the shadcn `ui/button` sizes are 32px tall and miss the 44px
touch target). The hero panel and the explore cards are shadcn `Card.Root`. Everything
else is an `<a>`.

---

## 8. Type and spacing

Every value uses the tokens in `layout.css`; nothing new is added to the scale.

| Element | Font | Size / line | Weight | Colour |
| --- | --- | --- | --- | --- |
| Greeting | serif `font-display` | 1.375rem / 1.75rem | 500 | foreground |
| Title row link, section title links, row verb links | sans `text-dense` | 0.875rem / 1.25rem | 500 | link |
| Hero label | sans `text-small` | 0.8125rem / 1.25rem | 400 | muted-foreground; brand dot when live |
| Hero name (`h1`) | serif `text-manage-title`, phone `text-h1-mobile` | 1.875rem / 2.375rem (1.625rem / 2rem) | 600 | foreground, underline on hover; below `md` the link is `inline-block py-1.5 -my-1.5`, a 44px target whose padding the margin takes back so the name does not move |
| Hero meta, row meta, task detail | sans `text-small` | 0.8125rem / 1.25rem | 400 | muted-foreground |
| Figure value | sans `text-stat`, `tabular-nums` | 1.625rem / 2rem | 600 | foreground |
| Figure label | sans `text-small` | 0.8125rem / 1.25rem | 400 | muted-foreground |
| "Next step" | sans `text-small font-medium` | 0.8125rem / 1.25rem | 500 | muted-foreground |
| Next step title | sans `text-body font-medium` | 0.9375rem / 1.5rem | 500 | foreground |
| Primary button | `Button primary dense` | 0.875rem; 2.75rem tall, 2.5rem from `lg` | 500 | primary-foreground on primary |
| Find fact line | sans `text-small` | 0.8125rem / 1.25rem | 400 | muted-foreground |
| Section title (`ManageSection` h2) | sans `text-h3` | 1rem / 1.5rem | 600 | foreground; 1px foreground rule, `pb-2.5` |
| Task, programme, announcement, quick session title | sans `text-dense font-medium` | 0.875rem / 1.25rem | 500 | foreground |
| Conference, application name | serif `font-display text-h3` | 1rem / 1.5rem | 600 | foreground |
| Status word | `StatusDot` `text-small` | 0.8125rem / 1.25rem | 400 | foreground; 0.5rem dot, 0.5rem gap |
| Programme time column | sans `text-small tabular-nums` | 0.8125rem / 1.25rem | 400 | muted-foreground |
| "Show all 11" | sans `text-small` | 0.8125rem / 1.25rem | 400 | link |

Rhythm, top to bottom:

- `<main>`: the framed frame's `px-4 md:px-6 py-8`.
- Title row: `flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1`, then 1rem to
  the hero.
- Hero panel: `p-6` (`p-4` below `md`), columns `md:flex md:gap-6`; facts `min-w-0 flex-1
  flex flex-col`; photo column `md:w-[22rem] md:shrink-0 md:self-center`. Name `mt-0.5`,
  meta `mt-1`, strip `my-4`, next step `mt-4 border-t border-border pt-3` with `mt-1`
  between its lines, actions `mt-4 flex flex-wrap items-center gap-4`. Phone photo:
  `aspect-[3/1] w-full object-cover rounded-t-[0.625rem]` with the panel's padding
  starting under it.
- Between blocks: `gap-10` (2.5rem), `gap-8` below `md`.
- `ManageSection`: as is (`pb-2.5`, 1px foreground rule); the first row starts directly
  under the rule. Below `sm` the title link is `inline-flex min-h-11 items-center -my-3`:
  a 44px target whose extra height the negative margin takes back, so the heading row
  keeps its 24px and the title and link stay on one baseline; from `sm` up (`sm:my-0
  sm:min-h-0`) it is the height of its words.
- `ActionRow`: as is (`min-h-13 py-2 px-1`, hairline under); below `sm` the right slot
  wraps under the text, right-aligned (`max-sm:flex-wrap` and `gap-x-4 gap-y-1` on the
  row, slot `max-sm:basis-full max-sm:justify-end`), every link `min-h-11 inline-flex
  items-center`. In a `TaskRow` the due word and the verb sit side by side on that line.
- `ConferenceRow`: `flex items-center gap-4 py-3 min-h-[5rem] px-1 border-b border-border`,
  thumb `w-24 h-16` (phone `w-18 h-12`) `rounded-md object-cover outline outline-1
  -outline-offset-1 outline-foreground/10`; text `min-w-0 flex-1`; status `shrink-0`.
- `ProgrammeRow`: `flex gap-4 py-2 min-h-13 px-1`, time `shrink-0 w-[9rem]` or `w-[13rem]`,
  below `sm` `flex-col gap-0.5`.
- `AnnouncementRow`, `ApplicationRow`: `min-h-13 py-2 px-1`, hairline under.
- Door rows hover: `hover:bg-accent`, 150ms, no movement, no underline.
- Row verb links (a task's verb, "Open chair room") hover: `hover:underline`, as on the
  organiser dashboard. The title row link, section title links and the hero's text link
  do not underline on hover; the hero name is the one exception (section 3.2).
- Explore grid: `grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, cards `h-full`.
- Every row, link and button is at least 2.75rem tall on a phone. Detail text and the
  find fact line are capped at `max-w-[68ch]`.
- Radii: 10px on the hero and the cards (`rounded-2xl` as pinned in `layout.css`), 6px on
  the photo, thumbnails and the button. Shadows: none; nothing floats. Motion: hover
  colours only.

---

## 9. New data

Each item says what it costs. Everything not listed comes from `HomeDashboard` as it is.

1. **`review_applications`, new query, organisers only.** In wave three (once
   `managedConferences` is known), `applications` select `conference_id, submitted_at`
   where `status = 'submitted'` and `conference_id in (published managed ids)`; counted and
   `min(submitted_at)` taken in code, as `readConferenceFigures` already counts. One
   round trip, indexed, skipped for a reader who manages nothing. Feeds the task "Decide 4
   applications (BERMUN 2026)" with "The oldest came in 6 days ago." (export `cameInText`
   from `dashboard-attention-people.ts`), the organiser hero's "applications waiting"
   figure, and `UpcomingConferenceCard.organiser.applicationsWaiting`.
2. **`heroSeats`, new query, organisers only.** Once the cards are built and the hero is a
   published conference the reader organises: `readSeatsOnOffer(supabase, [heroId])` from
   `$lib/server/manage-list.ts` (exported), counted into `{ held, onOffer }`. One round
   trip in a fourth wave for organisers; nobody else pays it. Feeds "41 of 120 / seats
   held".
3. **`announcements`, new query.** `announcements` select `id, title, published_at,
   conference_id, conferences(name, slug, timezone)` where `conference_id in
   (participatingConferenceIds)`, newest first, limit 3, in wave three, once the managed
   conferences are known. `participatingConferenceIds` is every conference the reader
   takes part in or helps run that has not ended (`hasConferenceRowEnded`: `end_date` on
   or after today in the conference's timezone, and not archived): the conferences of
   their seats and chairs; every `conference_staff` row whose conference came back,
   volunteers included; the managed conferences (organisation members and staff
   organisers); accepted delegations; accepted applications. A draft, submitted,
   waitlisted, rejected or withdrawn application or delegation does not count, nor does a
   staff row whose conference was withheld. `listUpcomingEvents` (3.5) reads the same list
   in the same wave. Row Level Security applies the audience, committee and delegation
   scoping the announcements module relies on, so no filter is written here. Skipped when
   the reader takes part in nothing. New module `$lib/server/home-announcements.ts`.
4. **`openConferenceCount`, new query, only when `upcomingConferences` is empty.**
   `countConferencesOpenForApplications(supabase, now)` in `$lib/server/conferences.ts`:
   `select('id', { count: 'exact', head: true })` on `conferences_with_organization` with
   the same `published`, `end_date >= today` and open-window conditions `listConferences`
   applies for `openOnly`, pulled into one shared helper `withOpenApplications(request,
   now)` so the three cannot disagree. Runs in a last wave for that reader alone.
5. **Delegation seat totals, same query.** `readEmptyDelegationSeatCounts` becomes
   `readDelegationSeatCounts`: select `delegation_id, user_id` for the headed delegations
   and count both the seats and the empty ones. No new round trip. Feeds "0 of 2",
   "2 seats nobody holds yet".
6. **Invoice amount, currency and conference name, same query.** `readMyUnpaidInvoices`
   selects `amount_cents, currency, conferences(name, timezone)` as well. Feeds "Rotterdam
   Spring MUN 2026 · €65.00 · was due 2 Apr 2026" through `formatMoney`. It does not ask
   whether the conference is over: an unpaid invoice is the one task that outlives its
   conference (section 4, rule 2).
7. **Seat name on the paper task, same query.** `PositionPaperSeat` gains `seatName` from
   the seat row already read, and `conferenceName`, `conferenceStartDate` from the
   embedded conference (one more column, `start_date` is already there). Feeds "Amsterdam
   Open MUN 2027 · Morocco" and the first-day deadline.
8. **Wider conference columns, same queries.** `MY_COMMITTEE_COLUMNS` and the staff
   lookup add `status, city, venue_name, location_mode`; `UpcomingConferenceSource`
   carries them, `status` included, so an archived conference gets no card and gives no
   task, and `UpcomingOrganisedConference` carries the whole `Conference` so `manageStatusLine`
   and `committeeCount` are to hand. `ApplicationListConference` (accepted applications,
   delegations) gains `city`, `venueName`, `locationMode` from the view it is read from.
9. **`todayItems` and `todayEvents` surfaced, no query.** `loadHomeDashboard` already
   computes both for the hero; they are returned instead of dropped. `todayEvents` is the
   24-hour window `readProgrammeOfToday` reads (every event that ends after now and starts
   within a day); which of them are today's is the consumer's test, per conference
   timezone, in `eventsLeftToday`. The `schedule_events` select no longer brings
   `conferences.banner_path` along and `UpcomingEvent` has no `conferenceBannerPath`: a
   programme row draws no photograph.
10. **Setup steps on a draft, no query.** `readChecklistCounts` already runs for drafts;
    `countDone` / `countRequired` of `publishChecklistItems` give "2 of 6".
11. **Papers waiting on the chair's card, no query.** `readWaitingPaperCounts` already
    runs; its count is written onto `UpcomingConferenceCard.chair.papersWaiting`.
12. **Explore order and limit, same query.** `listConferencesToExplore` orders by
    `applications_close_at` ascending with nulls last, then `start_date`, then `name`;
    `EXPLORE_CONFERENCE_LIMIT` is 3; the query is skipped for a reader with a managed
    conference.
13. **Applications list, same queries.** The merged list keeps only draft, submitted,
    waitlisted and rejected entries at conferences not yet over, then takes three, so a
    waitlisted row behind three accepted ones is still shown.
14. **`?all=conferences` / `?all=quick`, no query.** `load` reads `url.searchParams.get('all')`
    and returns it as `showAll`; `conferenceRows` and `quickSessionRows` lift their limit
    on it.
15. **`hasTakenPart`, no query.** True when wave one found any seat, chair, staff row,
    delegation membership or application, in any state and whether or not its conference
    is over, or when `managedConferences` is not empty; quick-session rows are set aside
    first. Feeds the find hero's title (3.3).
16. **Tasks stop with their conference, no query.** The seat, chair, staff, delegation and
    managed-conference rows reach `deriveTasks`, and the paper, checklist and
    waiting-application reads, only for conferences that have not ended
    (`hasConferenceRowEnded`, the `current…` lists in `loadHomeDashboard`); the cards, the
    "Today" items and the "has" flags read every row. The invoices are read whole (item
    6).
17. **Removed from the load and the page**: `managedConferences`, `myCommittees`,
    `workspaces`, `completedTasks`, `hasOwnConferenceSearch`, `MANAGED_CONFERENCE_LIMIT`,
    `MY_COMMITTEE_LIMIT`, `UPCOMING_CONFERENCE_LIMIT`, `homeGridCells`, `collectWorkspaces`,
    `committeeRowUrl`, `homeApplicationBadge`.

No migration. Card payments and email notifications are not on this page; "Pay invoice"
opens the invoice page, which takes the payment.

---

## 10. Risks, and what was left out on purpose

**Risks**

- A delegate with one conference, nothing pressing and no announcements gets a short
  page: greeting, hero, one To do row, three cards. That is the truth of the account, and
  the hero is built to carry it, but next to the old grid it will read as sparse until
  organisers post announcements and publish programmes.
- The button changes label as a deadline nears (rule 2 at seven days). The door is always
  the link beside it, so nobody is locked out, but a reader may look for yesterday's
  button once.
- A 3:2 crop of a 16:6 banner shows the middle 56% of its width. Skylines lose their
  edges; the conference page still shows the whole banner, and `object-position: center`
  is the best single choice without per-conference focal points.
- Organisers cost two more small round trips (applications waiting, hero seats) and a
  fourth wave. If timing shows it, the hero seats figure is the one to drop.
- Row Level Security is trusted to scope announcements; if a policy ever changes to let
  anybody read any conference's announcements, the `conference_id in (…)` filter still
  limits the list to the reader's own conferences.
- Rewording nothing but adding `detail` and `actionLabel` keeps most of `tasks.test.ts`;
  the e2e suite still loses every test that looked for the band, the grid or the
  carousel (build plan steps 20 to 22).
- "Create a conference" in the title row for every delegate is one small link; if the
  owner reads it as marketing on a working screen, it goes and nothing else moves.

**Left out, deliberately**

- The photo band, the frosted greeting panel, the uppercase eyebrow, the two outline
  buttons, the stock assembly hall, the strip and its scroll bar.
- The seven boxed sections with icons, taglines and dashed empty states; "Your
  workspaces"; "Run a conference?"; "My committees" as a list (the seat is a hero figure
  or part of a row's meta); the explore carousel, its dots and arrows.
- Tick boxes, struck-through tasks, "2 remaining" counts, status pills and role chips,
  "Live" and "Accepted" badges, an "Organising a conference yourself?" footnote, a second
  search box, a date line under the greeting, icons beside headings.
- A stat strip for the page as a whole (a delegate's figures would be 1 and 2); the strip
  lives in the hero, about one conference, with real values.
- "Chase unpaid invoices" organiser tasks: they live on the manage dashboard, one press
  away; adding them is one more grouped query when the owner asks.
- A notifications summary (the bell has one), a calendar, an activity feed, dark mode,
  anything that animates.

---

## 11. Build plan

Numbered so the work can be split; steps 1 to 8 are logic and data, 9 to 19 the
components, 20 to 24 tests and clean-up. Every step runs `pnpm verify` from `client/`;
steps that touch a page run its browser tests by path.

1. **`src/lib/components/ConferenceCard.svelte`** (change): replace the three lucide
   imports with `carbon-icons-svelte`'s `Location`, `Calendar` and `UserMultiple` at
   `size={16}`; nothing else changes. Update `ConferenceCard.svelte.test.ts` if it names
   the icons. Run `tests/e2e/conferences.spec.ts`.
2. **`src/lib/page-frame.ts`** (change): remove `/home` from `FULL_BLEED_ROUTE_IDS`.
   **`src/lib/page-frame.test.ts`**: `/home` is `framed`.
3. **`src/lib/tasks.ts`** (change): add `review_applications` to `HomeTaskKind` and
   `TASK_KIND_ORDER`; add `conferenceId`, `detail`, `actionLabel` to `HomeTask`; widen
   `PositionPaperSeat` (`seatName`, `conferenceName`, `conferenceStartDate`),
   `UnpaidInvoice` (`amountCents`, `currency`, `conferenceName`),
   `DelegationWithEmptySeats` (`seatCount`, `conferenceName`), `ManagedConferenceFacts`
   (nothing new), add `WaitingApplications` and `TaskFacts.waitingApplications`; the paper
   rule takes the first day as the deadline when none is set; the publish rule lists every
   draft with "Publish" / "Finish setting up"; write the detail and verb of every kind as
   section 3.4 tables them. Remove `deriveCompletedTasks`. **`tasks.test.ts`**: one case
   per kind's detail and verb, the first-day deadline, the two draft states, the new order.
   Export `cameInText` from **`src/lib/dashboard-attention-people.ts`**.
4. **`src/lib/upcoming-conferences.ts`** (change): widen `UpcomingConferenceSource`,
   `UpcomingCommitteeRole` (`seatCountryCode`, `committeeId`, `papersWaiting`,
   `positionPaper`), `UpcomingOrganisedConference` (`conference: Conference`,
   `applicationsWaiting`, `setupSteps`), `UpcomingDelegation` (`isHead`, `seatCount`,
   `emptySeatCount`); add `roleKind`, `seat`, `chair`, `delegation`, `organiser`, `when`,
   `slug`, dates, place fields to `UpcomingConferenceCard`; drop
   `UPCOMING_CONFERENCE_LIMIT` and the slice. **`upcoming-conferences.test.ts`**: the new
   fields per role, `when` words, no cap.
5. **`src/lib/home.ts`** (rewrite): keep `greeting`, `eventWhen`, `homeApplicationLine`,
   `homeApplicationHref`, `UpcomingEvent`; add `HomeLink`, `HomeAnnouncement`, the new
   `HomeDashboard`, `EXPLORE_CONFERENCE_LIMIT = 3`, `MY_APPLICATION_LIMIT = 3`; delete
   `ManagedConference`, `MyCommittee`, `Workspace`, `collectWorkspaces`, `committeeRowUrl`,
   `homeGridCells`, `homeApplicationBadge`, `MANAGED_CONFERENCE_LIMIT`,
   `MY_COMMITTEE_LIMIT`. **`home.test.ts`**: drop the tests of what is deleted, keep the
   rest.
6. **`src/lib/home-hero.ts`** (new) with **`home-hero.test.ts`**: `homeHero`,
   `isPressing`, `remainingTasks`, `doorLabel`, `titleRowLink`, the figures per role and
   per live state, the meta line, the find hero's title and fact line. Tests cover the
   seven reader states of section 6 and the "never zero or two buttons" rule.
7. **`src/lib/home-rows.ts`** (new) with **`home-rows.test.ts`**: `dueWord`,
   `conferenceRows`, `todayProgrammeRows`, `programmeRows`, `applicationStatus`,
   `announcementsLink`, `quickSessionRows`, the limits and `showAll`.
8. **`src/lib/server/home.ts`** (change): widen the selects (step 9 items 5 to 8); add the
   waiting-applications read (wave three), the announcements read via a new
   **`src/lib/server/home-announcements.ts`** and the programme read, both in wave three
   from `participatingConferenceIds` as section 9 item 3 defines it, the hero seats read (wave four,
   organisers only, using `readSeatsOnOffer` exported from
   **`src/lib/server/manage-list.ts`**), the open count via
   `countConferencesOpenForApplications` in **`src/lib/server/conferences.ts`** (with the
   shared `withOpenApplications` helper and the explore order change); filter
   applications before the limit; cut every task input but the profile and the invoices
   to conferences that have not ended (`hasConferenceRowEnded`); return the new
   `HomeDashboard` with `todayItems`, `todayEvents`, `hasManagedConferences`,
   `chairsSomething`, `hasTakenPart`, `showAll`; drop workspaces, committees, managed list
   and completed tasks. **`server/home.test.ts`**: rewrite the committees, managed and
   workspaces describes as "the upcoming conferences" and "the organiser's figures"; add
   announcements, open count, hero seats, waiting applications, the applications filter,
   the readers whose programme and announcements are read, tasks at ended conferences,
   `hasConferenceRowEnded`, `hasTakenPart`. **`server/conferences.test.ts`**: the count and the order.
9. **`src/routes/home/+page.server.ts`** (change): read `?all=`, pass it to
   `loadHomeDashboard`, stop returning `hasOwnConferenceSearch`.
   **`page.server.test.ts`**: drop the two search cases, add `all`.
   **`src/app.d.ts`**: remove `hasOwnConferenceSearch` from `PageData`.
   **`src/routes/+layout.svelte`** and **`src/lib/components/shell/AppHeader.svelte`**:
   remove `pageHasConferenceSearch`; the bar hides its box only on the directory.
10. **`src/lib/components/manage/StatStrip.svelte`** (change): `StripStat.flagCountryCode?`,
    drawn with `Flag` size `md` before the value in a `flex items-center gap-2`.
11. **`src/lib/components/ConferenceThumb.svelte`** (new) with a test: the 3:2 thumbnail
    or an empty slot; never initials.
12. **`src/routes/home/HomeTitleRow.svelte`** (new).
13. **`src/routes/home/HomeHero.svelte`**, **`HeroFacts.svelte`**, **`HeroNextStep.svelte`**,
    **`HeroActions.svelte`**, **`HeroPhoto.svelte`**, **`FindHero.svelte`** (new), with
    `HomeHero.svelte.test.ts` and `FindHero.svelte.test.ts` (fill by live state, no photo
    without a banner, one button, the next step block only when given).
14. **`src/routes/home/ToDoSection.svelte`**, **`TaskRow.svelte`** (rewrite) with
    `TaskRow.svelte.test.ts` (due word, verb link, no checkbox).
15. **`src/routes/home/ProgrammeSection.svelte`**, **`ProgrammeRow.svelte`** (new).
16. **`src/routes/home/AnnouncementsSection.svelte`**, **`AnnouncementRow.svelte`** (new).
17. **`src/routes/home/ComingUpSection.svelte`**, **`ConferenceRow.svelte`** (rewrite),
    **`ShowAllLink.svelte`** (new), with `ConferenceRow.svelte.test.ts` (thumb column
    rule, flag, status word).
18. **`src/routes/home/ApplicationsSection.svelte`**, **`ApplicationRow.svelte`** (rewrite),
    **`QuickSessionsSection.svelte`** (replaces `QuickSessions.svelte` and
    `QuickSessionRow.svelte`), **`ExploreSection.svelte`** (replaces
    `ExploreConferences.svelte`).
19. **`src/routes/home/+page.svelte`** (rewrite): the column of section 3 in order, built
    from `homeHero`, `remainingTasks`, `conferenceRows`, `programmeRows`, `quickSessionRows`.
20. **Delete** from `src/routes/home/`: `GreetingHero.svelte` (+ test),
    `UpcomingConferenceStrip.svelte` (+ test), `UpcomingConferenceCard.svelte` (+ test),
    `LiveConferenceCard.svelte` (+ test), `LivePill.svelte`, `StripArrowButton.svelte`,
    `StripProgressBar.svelte`, `FindConferenceCard.svelte` (+ test),
    `RunAConferenceCard.svelte` (+ test), `MyTasks.svelte`, `MyCommittees.svelte`,
    `CommitteeRow.svelte`, `MyApplications.svelte`, `ManagedConferences.svelte`,
    `ManagedConferenceCard.svelte` (+ test), `MyWorkspaces.svelte`, `WorkspaceChip.svelte`
    (+ test), `UpcomingEvents.svelte`, `UpcomingEventCard.svelte` (+ test),
    `ExploreConferences.svelte`, `ExploreCarousel.svelte` (+ test), `ExploreSlide.svelte`
    (+ test), `QuickSessions.svelte` (+ test), `QuickSessionRow.svelte`. `Section.svelte`
    and `Card.svelte` in `$lib/components` stay for the pages that still use them.
    `HERO_IMAGE_PATH` goes from `$lib/media.ts`; `static/hero.jpg` stays on disk, unshown,
    because the owner chose it (`supabase/media/CREDITS.md` says so; `ConferencesHero` uses
    `CONFERENCES_HERO_IMAGE_PATH`). Delete
    `ConferenceBanner`'s `card` and `liveCard` aspects once nothing uses them.
21. **`tests/e2e/home.spec.ts`** (rewrite): keep the visitor, onboarding and greeting
    tests (the greeting is now a `<p>`; assert on `main` text and on the `h1` being the
    conference name); replace the rest with: a new account gets the find hero, the open
    count, one "Find a conference" button and three cards; a delegate's hero names the
    conference, seat, flag and countdown and its button opens the committee page; an
    overdue invoice (`giveInvoice`) becomes the next step and "Pay invoice" is the only
    filled button, the door is a link; a head's button is "Assign seats"; a chair with a
    waiting paper gets "Review papers"; an organiser's page hides "Open for applications"
    and shows "Manage"; a conference the reader is in is left out of the cards; the cards
    are equal height; `?all=conferences` shows every row; the page fits in three screens
    and nothing spills sideways on a phone; `expectOnFirstScreen` for the primary button
    on both the desktop and the phone project.
22. **`tests/e2e/home-band-carousel.spec.ts`**: delete. **`home-quick-sessions.spec.ts`**:
    rewrite for the section's rows, "New quick session" link and `?all=quick`.
    **`click-budget-home.spec.ts`** and the other click-budget specs, `committees.spec.ts`,
    `delegate-delegation-polish.spec.ts`: replace the `upcomingStrip` locator and any
    "Your upcoming conferences" / "My tasks" / "Explore conferences" lookups with the hero
    (`main` → `heading level 1`) and its button; the budgets do not change, the live
    button is still one press from `/home`.
23. **`docs/DESIGN.md`**: no change. Add a short note to `README.md`'s product notes that
    `/home` leads with the next conference and the next step, if the notes describe the
    old grid.
24. **Before finishing**: `pnpm verify`; `pnpm test:e2e tests/e2e/home.spec.ts
    tests/e2e/home-quick-sessions.spec.ts tests/e2e/click-budget-home.spec.ts
    tests/e2e/conferences.spec.ts`; screenshots of Sofia, Jasper and Hugo at 1265 × 634
    and at 390 wide, checked against sections 2b, 2c and 6, with one filled button on
    each, fewer than five icons (all inside the explore cards), no raw colour, no pill
    but the cards' own.
