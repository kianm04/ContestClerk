# For organisers page: design handoff

A brief for redesigning `/for-organisers`, the public page that has to persuade a real
conference organiser to run their next conference on MUNMeet. It contains the argument, the
page section by section with final copy, a specification for every picture, and the visual
language to draw it in. No code and no mockup exists yet; this document is the input for
the design.

Written 6 October 2026 from a read of the codebase, the live landing page and web research
on how organisers work today. The page describes the MVP, not the build of that day: card
payments and email are in the MVP and are written here as done (section 8). Updated
9 October 2026: committee papers (`docs/committee-papers.md`), from the first working
paper to the passed resolution and a crisis committee's directives, are in the MVP too, in
6.8, 6.9, 6.13 and section 8.

## 1. What to produce

A design canvas with these boards:

1. **Desktop page**, 1265px wide, full height. The product owner views the site in a window
   of about 1265 by 634px, so the first 634px must hold the headline, the lead, both
   buttons and the top of the hero picture.
2. **Phone page**, 390px wide, full height.
3. **One board per component**, so each can be reviewed and built alone: the hero picture,
   the ledger table, each product picture in section 6, the access list, the price block,
   the questions and the closing band.

The page is a sibling of the landing page (`/`) and must look like it belongs beside it.
Section 4 lists the landing page's visual language. Where that language and `docs/DESIGN.md`
disagree (pill buttons, uppercase eyebrows, soft shadows under cards, centred section
headings), this page follows the landing page, because the landing page was built from the
owner's own mockup. `DESIGN.md` still governs colour, the two typefaces, the wording, flags,
icons and everything in its "habits that make a screen look generated" list that the landing
page does not itself break.

## 2. Why the current page fails

- **It repeats the landing page.** Its six band titles are the same lines the landing
  page's "For organisers" section already shows. A reader who follows "See the organiser
  tour" learns nothing new.
- **Its pictures cannot be read.** They are 1280px screenshots of the app shrunk to 500px,
  so the text in them is about 5px tall. They also show the old interface, and the fees
  screenshot shows "Paying by card needs Stripe, which this organisation has not connected
  yet" beside the headline "Fees by card, invoices done".
- **It has no argument.** It lists features in the order they were built. It never says
  what an organiser's work looks like today or why this is better.
- **Some of its lines are loose.** "Applications that review themselves" and "one or a
  hundred at a time" promise more than the screens do (section 8).
- **It looks like a different site.** White page, no hero, no photograph, flat bands and a
  grey "Ready?" box, next to a landing page with a photographic hero, drawn product pictures
  with readable sample data, and a committee room whose clock runs.

## 3. The argument

### Who reads this page

| Reader | What they are deciding | What they fear |
| --- | --- | --- |
| A Secretary-General or deputy of a student-run conference, 80 to 400 delegates, running on forms, spreadsheets and a group chat today | Whether to move the next conference onto MUNMeet | That it will not cover everything and the spreadsheets stay anyway |
| The same person at a conference that uses myMUN today | Whether MUNMeet is worth a switch | Losing something that works; a tool that is new and unproven |
| A teacher who directs a school conference | Whether it is safe and simple enough for pupils and visiting schools | Pupils' data, money, extra work |
| An under-secretary-general for delegate affairs, or a head chair | Whether their own part of the work gets easier | Being handed a tool chosen by someone else |

They arrive from the top bar, from the landing page's "See the organiser tour", from the
"Run a conference" card on the signed-in home page, or from a link a colleague pasted into
the secretariat's chat. Many will already be signed in as delegates.

### The one idea

**MUNMeet is one system for the secretariat and the chairs. A delegate is given a seat
once, and the invoice, the position paper, the chair's roll call and the award all hang
from that seat.**

This is the thing the alternatives cannot say. A form and a spreadsheet stop at
registration. The incumbent runs registration in one product and the committee room in a
second one with its own price. On MUNMeet the roll call a chair takes on Saturday morning
lists the delegates the secretariat seated in November, and a delegate marked absent at
that roll call appears on the secretariat's dashboard a moment later.

### What supports it

1. **It is built the way a conference works.** Schools come as delegations and are given
   seats to hand out. Seats live on a grid, not in a column of a response sheet. The room
   knows a speakers' list, caucuses, motions and majorities.
2. **It tells the secretariat what is waiting.** The dashboard's "Needs attention" list
   changes through the year: applications to decide, committees with no chair, unpaid
   invoices, and on the days themselves which rooms are in session and who is absent.
3. **Starting costs nothing and leaving is easy.** A draft conference is private until it
   is published. A quick session tries the committee room tonight with no conference at
   all. Applications, participants and invoices export as CSV.
4. **Next year's secretariat inherits a conference, not a folder.** A new edition starts
   from the last one's committees, application form and fees.

### What the page deliberately does not say

- It does not say "run your conference in one place". As of October 2026 that is the
  incumbent's own headline for organisers, almost word for word.
- It does not claim a large community, a busy directory or any number of users. MUNMeet
  has none to show yet, and the incumbent's strongest argument is exactly that number.
- It does not name a competitor.
- It does not promise anything from the last table of section 8.

### Vocabulary

British and European usage, as organisers there say it: organiser, secretariat,
Secretary-General, chairs (never "dais"), allocation and seat (never "assignment"),
delegation, head of delegation, speakers' list (with the apostrophe), position paper,
background guide, programme, delegate fee. Clocks read "1:30" and "0:23". Sentence case
everywhere.

## 4. Visual language, taken from the landing page

**Surfaces.** The whole page sits on mist `#F7FBFE`. The top bar is white with a hairline
under it. Product pictures are white cards with a 10px radius, no border, and the one soft
shadow `0 8px 24px rgba(15, 23, 42, 0.08)`. Inside a card, regions are separated by a
hairline `#F3F4F6`, and a table's header row is filled with `#EEF7FF`.

**Measure.** Content is a centred column 1100px wide with a 16px gutter. Sections have
80px of space above and below on a desktop and 56px on a phone. Sizes below are nominal;
the live site draws everything about 10% larger, so match the proportions of the landing
page, not the raw numbers.

**Type.** Source Serif 4 for headings, IBM Plex Sans for everything else, both from Google
Fonts.

| Element | Font | Size / line | Weight | Colour |
| --- | --- | --- | --- | --- |
| Hero headline | serif | 46 / 46 (phone 32 / 36) | 500 | `#111318` |
| Section title | serif | 29 / 36 (phone 26 / 32) | 500 | `#111318` |
| Eyebrow | sans, uppercase, 0.14em tracking | 13 / 16 | 500 | `#006FCC` (on the hero photograph `#7A5C3E`) |
| Lead under a title | sans | 15 / 24 (hero 16 / 24) | 400 | `#545A63` |
| Row title | sans | 16 / 24 | 600 | `#111318` |
| Row detail, table cells | sans | 13 / 20 | 400 | `#545A63` |
| Picture captions, table headers | sans | 12 / 16 | 500 | `#545A63` |

Numbers that line up, and every clock, are tabular. A clock is always in the sans; the
serif names a country, a conference or a section, never a number that changes.

**Colour.** Dark blue `#0B2A5B` is the primary button and nothing else. Link blue `#006FCC`
is for eyebrows, row icons and text links. Light blue `#0098FC` is for shapes only: progress
bars, the live dot, the selected underline. `#D9EEFF` fills a selected thing, with dark blue
words on it. Green `#15803D` on `#DCFCE7`, amber `#B45309` on `#FEF3C7` and red `#B91C1C`
on `#FEE2E2` mean state only: accepted and paid, pending and due, rejected and overdue.
Grey `#545A63` on `#F3F4F6` is the neutral state. No gradients, no dark sections.

**Controls.** Buttons are pills 44px tall. Primary: dark blue, white words, an arrow-right
icon after the label. Secondary: white with a 1px `#E3E6EB` border and black words. Status
is a small pill with 12px words. Committee names are small rectangles with a 6px radius.

**Rows.** The landing page's feature rows: a 20px Carbon icon in link blue, a title line
and one line of detail. Icons are Carbon outline icons only, drawn inline.

**Pictures of the product** are drawn, never screenshots. Each is a white card built from
real interface parts and sample data, simplified so every word in it can be read at the
size it is shown. Nothing in a picture can be pressed. The landing page's applications
table and its running committee room are the model.

**Flags** are real flags, 4:3, with a 1px inset hairline so a white flag keeps its edge.
Never emoji.

**Photographs.** Only the two the landing page already uses: the organisers' desk in warm
light (`client/static/landing-organisers.webp`, 1672 by 941) and the university
(`client/static/landing-delegates.webp`). No stock pictures, no illustrations, no generated
imagery. The drawn pictures carry the page.

**Motion.** As on the landing page: the hero settles in as the page loads, each section
fades and rises once when first scrolled to, and the committee room's clock runs. Nothing
loops apart from the clock, and reduced-motion turns it all off. The design must read as
complete when nothing moves. (Extending the landing page's motion exception to this page is
an owner decision, section 9.)

## 5. Sample data

Every picture shows the same invented conference at different moments of its year, so the
page reads as one story. All names are made up; none is a real school, society or person.

| Thing | Value |
| --- | --- |
| Conference | Northbridge MUN 2027 |
| Organised by | Northbridge MUN Society |
| Dates and place | 5 – 7 Mar 2027 · Northbridge University |
| Size | 8 committees, 220 seats, delegate fee €65 (early €55, delegation member €60) |
| Applications | 142 received: 38 under review, 96 accepted, 5 waitlisted, 3 not accepted |
| Delegations | Harbour View College (12 seats asked), Elmfield School (8), Rivermead Sixth Form (6) |
| Committees shown | Security Council (15 seats), Human Rights Council (32), DISEC (40), ECOSOC (36) |
| Secretariat | Eleanor Wright, Secretary-General · Tomasz Zielinski, USG delegate affairs · Fiona Campbell, chair of the Human Rights Council · Idris Bello, chair of the Security Council · Lena Fischer, registration desk |
| Applicants | Amara Okafor, Noor Haddad, Priya Nair, Daniel Weiss, Mei Tanaka, Gabriel Santos, Wei Zhang, James Wilson, Zoe Adams |
| The room | Human Rights Council, "The right to education in emergencies", session 3. Kenya has the floor with 0:23 left of 1:30. Waiting: Brazil, Japan, Norway, India, Chile |

The applicants, the room and its countries are the ones the landing page already draws, so
the two pages agree.

## 6. The page, section by section

Chapters 3 to 9 follow a conference through its year, and each chapter's eyebrow says when
it happens. On a desktop a thin vertical line in the left margin may join the eyebrows, in
the manner of the landing page's journey line; try it, and drop it if it reads as
decoration.

Feature sections use the landing page's two-column layout (words and rows on one side, the
picture on the other) and alternate sides, except where a layout is given.

### 6.1 Top bar

The site's existing bar, unchanged: wordmark, "Conferences", "Resources", "For organisers"
(selected), search, "Log in", "Sign up". A signed-in reader sees their own navigation and
account instead.

### 6.2 Hero

**Job.** Say what MUNMeet is for an organiser in one line, and show both ends of it.

**Layout.** The desk photograph runs the full width behind the top of the page and up
behind the top bar, washed white from the left so the words read, with the landing page's
mist hill rising over its lower edge. Words on the left. On the right, overlapping the
hill, the hero picture.

**Copy.**

- Eyebrow: `For organisers`
- Headline: `One system, from the first application to the final vote.` Break it over
  two or three lines to suit the column, never leaving one word alone on the last line.
- Lead: `Registration and the committee room in one place. Give a delegate a seat once,
  and their invoice, their position paper and the chair's roll call all follow from it.`
- Primary button: `Create a conference`
- Secondary button: `Run a quick session`
- Small line under the buttons: `A draft stays private until you publish it. €2.00 for
  each seat paid by card, nothing if you collect fees yourselves.`

**Picture: the secretariat's dashboard, with a delegate's phone.** Two cards. The large
one is the organiser's dashboard. A small phone-shaped card overlaps its lower right
corner. Together they are the two ends of the headline.

Dashboard card:

- Header: `Northbridge MUN 2027` in the serif, with a green `Published` pill and
  `Applications open` in grey.
- Section label `Needs attention`, then four rows. Each row is a large tabular number in
  link blue, a sentence, a grey detail and a chevron:
  - `38` · `applications are waiting for a decision` · `The oldest for 6 days`
  - `12` · `seats asked for by Harbour View College` · `A delegation request`
  - `2` · `committees have no chair` · `DISEC and ECOSOC`
  - `9` · `invoices are unpaid` · `€3,180 outstanding`
- A strip of four figures along the bottom: `Applications 142`, `Delegations 3`,
  `Seats 164 of 220`, `Paid €6,480`.

Phone card: `Human Rights Council` and `Japan` at the top, the Kenyan flag, `Kenya` in the
serif with `Has the floor`, the clock `0:23`, a thin light blue bar of the time left, and
the line `You are 2nd · about 2 min`.

### 6.3 What it replaces

**Job.** Make the reader recognise their own patchwork of tools, and serve as the page's
index. This is the argument of the page, so it comes second.

**Layout.** A centred heading, then one white card holding a table of three columns. The
middle column is grey; the right column is black and a little heavier, with a thin light
blue rule down its left edge. Each row links to its chapter further down. On a phone each
row becomes a block: the job as its title, "Usually" in grey under it, "On MUNMeet" in
black under that.

**Copy.**

- Eyebrow: `What it replaces`
- Title: `Seven jobs, usually seven tools.`
- Lead: `Most secretariats stitch a conference together from forms, spreadsheets, inboxes
  and a group chat. Here is where each of those jobs lives on MUNMeet.`

| The job | Usually | On MUNMeet |
| --- | --- | --- |
| Applications | A form and a sheet of responses | Your own questions, on top of a profile each applicant fills in once |
| Country allocation | A matrix in a spreadsheet | A seat grid: every seat free, reserved for a school, or filled |
| School delegations | An email thread with every teacher | A school asks for seats, you allocate them, its head of delegation hands them out |
| Fees | A "paid?" column and a bank statement | An invoice written the moment a seat is given, paid by card, marked paid by itself |
| Position papers | Attachments in the chairs' inboxes | Written or uploaded in MUNMeet, approved or sent back by the chair |
| News and changes | The group chat | Announcements to everyone, one committee or one delegation, in MUNMeet and by email |
| Debate | A stopwatch and a paper speakers' list | The committee room: one clock on the chair's laptop and every delegate's phone |

- Line under the table: `And an eighth: handing it all to next year's secretariat. A new
  edition starts from the last one.`

### 6.4 Before you open

**Layout.** Words left, picture right.

**Copy.**

- Eyebrow: `Before you open`
- Title: `Set it up once. Publish when you are ready.`
- Lead: `Five steps take a draft from a name to a public page with an application form.
  Nothing is public until you publish.`

| Row | Detail |
| --- | --- |
| Committees from a catalogue | Around forty committees with descriptions, and seat lists for every UN member state, the Security Council and the EU. Or paste your own. |
| Your own application form | Up to twenty questions of five kinds, on top of the profile every applicant already has. |
| Individuals, delegations or both | Choose who may apply, how many committee preferences to ask for, and whether a position paper is required. |
| Open on your terms | Open applications when you publish, on a date, or by hand. Close them on a date, or a set time before the first day. |

**Picture: the launch step.** One card in two halves. Left half: a small public conference
page, with the university photograph as its banner, `Northbridge MUN 2027` in the serif,
`Northbridge MUN Society`, `5 – 7 Mar 2027 · Northbridge University`, and committee chips
`Security Council`, `UNHRC`, `DISEC`, `+5`. Right half: the five steps as a short vertical
list with ticks (`Organisation`, `Basics`, `When & where`, `Setup`) and the fifth, `Launch`,
ringed as current; under it two options, `Publish conference only` and
`Publish and open applications` (selected), and a dark blue `Publish` button.

### 6.5 While applications are open

**Layout.** Picture left, words right.

**Copy.**

- Eyebrow: `While applications are open`
- Title: `Every application in one table.`
- Lead: `Each application arrives with the answers to your questions beside the details
  from the applicant's profile. Schools' requests for seats have a list of their own.`

| Row | Detail |
| --- | --- |
| A table or a board | Sort and filter a table, or drag applications between Under review, Accepted, Waitlisted and Not accepted. |
| One at a time, or a page at a time | Read in a side panel and move to the next, or tick a page and decide it together. |
| Two notes on every decision | One the applicant reads, one that stays inside the secretariat. |
| Details you do not have to ask for | Date of birth, dietary requirements and an emergency contact come from the applicant's profile. |

**Picture: the applications table.**

- Header: `Applications` and, on the right, `142 received`.
- Tabs with counts: `Under review 38` (selected), `Accepted 96`, `Waitlisted 5`,
  `Not accepted 3`.
- Columns: a tick box, `Applicant`, `Institution`, `First preference`, `Status`.
- Five rows, two of them ticked and filled pale blue:
  - Amara Okafor · Northbridge University · Security Council · Under review
  - Noor Haddad · Kestrel Park Academy · Human Rights Council · Under review (ticked)
  - Priya Nair · Northbridge University · Security Council · Under review (ticked)
  - Daniel Weiss · Rivermead Sixth Form · DISEC · Under review
  - Mei Tanaka · Elmfield School · Human Rights Council · Under review
- A bar across the bottom: `2 selected`, then `Accept`, `Waitlist`, `Reject` as small
  outline buttons.

### 6.6 Once decisions are made

**Job.** The visual high point of the middle of the page. "The matrix" is the thing every
organiser has built by hand.

**Layout.** A centred heading, then the picture at the full width of the column, then
three short facts side by side under it, separated by hairlines, with no icons.

**Copy.**

- Eyebrow: `Once decisions are made`
- Title: `The matrix, without the spreadsheet.`
- Lead: `Every seat in every committee on one grid. Accepting an applicant puts them in a
  seat and writes their invoice in the same step.`

| Fact | Detail |
| --- | --- |
| Reserved for a school | Drag a delegation onto seats to hold them. Its head of delegation assigns the students. |
| Move and swap | Drag one delegate onto another to swap them. The application, the invoice and the position paper go with the person. |
| Seat lists ready-made | Every UN member state, the Security Council's fifteen or the EU's twenty-seven in one press. Or paste up to 300 names. |

**Picture: the seat grid.** One wide card.

- Header: `Allocation`, and on the right `164 of 220 seats filled`.
- A narrow tray on the left, `Delegations to seat`: `Harbour View College · 9 of 12 seats`
  and `Rivermead Sixth Form · 0 of 6 seats`.
- Four columns, one per committee, each headed with its name and a count:
  `Security Council · 13 of 15 filled`, `Human Rights Council · 27 of 32 filled`,
  `DISEC · 31 of 40 filled`, `ECOSOC · 24 of 36 filled`.
- Each column lists six seats and ends in a grey line such as `9 more seats`. A seat is a
  row: flag, country, then who holds it. Three states must all be visible:
  - filled: the delegate's name in black. Security Council: `China · Wei Zhang`,
    `United Kingdom · James Wilson`, `Russia · Amara Okafor`. Human Rights Council:
    `Brazil · Gabriel Santos`, `Japan · Mei Tanaka`, `Nigeria · Zoe Adams`
  - reserved: `Reserved · Harbour View College` on a pale blue fill, as in `France` and
    `Norway`
  - free: the word `Free` in grey, as in `United States` and `India`
- One delegate is mid-drag: Noor Haddad, lifted off the Jordan seat in the Human Rights
  Council with the floating shadow and tilted a degree, over the free United States seat
  in the Security Council.

**The schools strip** sits under the facts and keeps the anchor `#schools`. A small
heading, `What a school does`, and three numbered steps in a row:

1. `Registers a delegation` · `One head of delegation asks for a number of seats.`
2. `Shares a join code` · `Students join the delegation with their own accounts.`
3. `Assigns its seats` · `Until the first day, the head of delegation decides who sits where.`

### 6.7 As seats are given

**Layout.** Words left, picture right.

**Copy.**

- Eyebrow: `As seats are given`
- Title: `An invoice for every seat, paid by card.`
- Lead: `Set your fees once and connect Stripe once. Each seat given writes an invoice, the
  delegate pays it by card, and it marks itself paid.`

| Row | Detail |
| --- | --- |
| Early, standard and late | Give each fee its own dates. The one in force when the seat is given is the one on the invoice. |
| Paid by card | Delegates pay their invoice by card and it marks itself paid. Stripe pays the money out to your organisation. |
| One invoice for a school | A delegation is invoiced for its seats together, so a school pays once. |
| Or collected by you | Prefer bank transfers? Delegates read your payment instructions on the invoice, and you mark it paid. |
| Refunds, waivers and the totals | Refund a card payment, waive an invoice or cancel it in one press. Invoiced, paid and outstanding at a glance, and a CSV for the treasurer. |

**Picture: the invoices.**

- Header: `Fees`, and on the right a green dot with `Card payments on · Stripe connected`.
- A strip of four figures: `Invoiced €9,725`, `Paid €6,480`, `Outstanding €3,180`,
  `Refunded €65`.
- A table with columns `Invoice`, `Payer`, `For`, `Amount`, `Status`, five rows:
  - 0041 · Amara Okafor · Early delegate fee · €55.00 · Paid by card (green)
  - 0042 · Elmfield School · Delegation, 8 seats · €480.00 · Paid by card (green)
  - 0043 · Daniel Weiss · Delegate fee · €65.00 · Due 14 Jan (amber)
  - 0044 · Harbour View College · Delegation, 9 seats · €540.00 · Paid, bank transfer (green)
  - 0045 · Zoe Adams · Delegate fee · €65.00 · Refunded (grey)
- Overlapping the card's lower corner, a delegate's phone showing their invoice:
  `Invoice 0043`, `Delegate fee · Northbridge MUN 2027`, `€65.00` large and tabular,
  `Due 14 Jan`, and a dark blue button `Pay €65.00 by card`.

### 6.8 The weeks before

**Layout.** Picture left, words right.

**Copy.**

- Eyebrow: `The weeks before`
- Title: `Everyone knows where to be and what to read.`
- Lead: `Publish the programme, collect the position papers and say what has changed, each
  to the people it concerns.`

| Row | Detail |
| --- | --- |
| The programme | Add events one by one, or a session for every committee at once. Delegates see their own day; visitors see what you make public. |
| Position papers | Delegates upload a PDF or write in MUNMeet, live with their delegation, with comments and suggestions as in a shared document. Chairs approve a paper or ask for changes. |
| Announcements | To everyone, delegates, staff, one committee or one delegation, in MUNMeet and by email. Check who it reaches before you post it. |
| Chairs and volunteers | Invite each chair to their committee by email. Chairs open their own rooms and see nothing of applications or fees. |

**Picture: an announcement, and where it lands.** Three cards: the form, and overlapping
it the two places the announcement arrives.

- Card one, the organiser's form: title field `Room change for the Human Rights Council`;
  a select reading `One committee · Human Rights Council`; a grey line `Reaches 29 people`;
  a tick box `Pin to the top`; a dark blue `Post announcement` button.
- Card two, a delegate's notifications on a phone: three rows, newest first:
  - `Room change for the Human Rights Council` · `Announcement · just now`
  - `Committee session III is now in Room 204` · `Programme · 2 min ago`
  - `Your position paper was approved` · `Human Rights Council · yesterday`
- Card three, the same announcement as an email, small: sender `Northbridge MUN 2027`,
  subject `Room change for the Human Rights Council`, two lines of body in grey, and a text
  link `Open in MUNMeet`.

### 6.9 On the days

**Job.** The climax of the page and the part no form or spreadsheet can answer. Give it
the most room.

**Layout.** A centred heading. Under it, three screens of the same room side by side: the
chair's console largest, the projector display beside it, the delegate's phone overlapping
the corner. All three show the same speaker and the same clock, and the clock runs. Under
them, eight rows in two columns of four. Then a second, narrower block for the secretariat's
view, and last a slim inset for the quick session.

**Copy.**

- Eyebrow: `On the days`
- Title: `One room on every screen.`
- Lead: `The chair's console, the projector and every delegate's phone show the same
  speakers' list and the same clock. The delegates in the room are the ones you seated.`

| Row | Detail |
| --- | --- |
| Roll call and quorum | Absent, present, or present and voting, seat by seat or all at once. Quorum is counted for you. |
| Speakers' list and caucuses | A general speakers' list, moderated and unmoderated caucuses and single speakers, each with its own clock. |
| Motions in order | Motions on the floor sort themselves, most disruptive first. Pass one and the room follows: the caucus starts, the meeting is suspended. |
| Votes that add up | Count hands or call the roll, by simple or two-thirds majority. Abstentions are left out and a tie fails. |
| More than one chair | Co-chairs work from their own laptops, and the keyboard does the common things: Space for the clock, N for the next speaker. |
| A record of every session | 2 h 14 min, 23 speeches, 4 motions, 3 passed, 1 vote. Kept with every roll call and every result. |
| Resolutions written in the room | Blocs write working papers and draft resolutions together, live, across delegations. They gather signatures and submit to the dais, which approves each with its number. In a crisis committee, directives go to the crisis staff and come back answered. |
| Amendments and the record | Pass a motion to introduce a draft and it goes on the projector. Delegates propose amendments from their own screens, friendly or not, every vote is tied to what it decides, and a passed resolution prints in the conference's format. |

**Picture one: the three screens.**

- **Chair's console** (caption `Chair's console`). Header: `Human Rights Council`, the
  topic, `Session 3`, and a pill `Present 27 of 29 · Quorum met`. A row of views:
  `GSL` (selected), `Motions`, `Mod`, `Unmod`, `Single speaker`, `Vote`. The floor: the
  Kenyan flag, `Kenya` in the serif, `Has the floor`, the clock `0:23`, `of 1:30` in grey,
  a light blue bar of the time left. Four buttons: `Pause`, `Add 15 s`, `End speech`,
  and `Next speaker` in dark blue. To the right, `Speakers' list` with five numbered rows,
  each with a drag handle and a flag: Brazil, Japan, Norway, India, Chile.
- **Projector display** (caption `On the projector`). Wide and nearly empty: the flag,
  `Kenya` very large in the serif, the clock `0:23` very large, and `Next: Brazil, Japan,
  Norway` in grey.
- **Delegate's phone** (caption `Every delegate's phone`). As in the hero: `Human Rights
  Council · Japan`, `Kenya has the floor`, `0:23`, `You are 2nd · about 2 min`, and the
  first three rows of the speakers' list.

**The secretariat's view.** Words left, picture right.

- Small title: `And the secretariat sees every room.`
- Text: `On a conference day the dashboard shows which committees are in session, how many
  delegates answered the roll call, and who did not.`

**Picture two: the dashboard on a conference day.**

- A light blue dot and `6 of 8 committees in session`, then
  `Committee session III, until 12:30` and `Next: Lunch in Front hall at 12:30` in grey.
- A table `Rooms` with columns `Committee`, `Session`, `Present`:
  `UNSC · Session 3 · 15 of 15`, `UNHRC · Session 3 · 27 of 29`,
  `DISEC · Session 3 · 36 of 38`, `ECOSOC · Not in session · –`, then a grey line
  `4 more rooms`.
- Under it, in grey: `Present: 187 of 204 delegates in 6 rooms · As of 10:42`.
- One `Needs attention` row: `Zoe Adams is marked absent` ·
  `UNHRC · Nigeria · since roll call at 09:12`.

**The quick session inset.** A slim white card across the column, words left, link right.

- Title: `Try the room at your next club meeting.`
- Text: `A quick session is one committee with no conference around it: a name, a list of
  countries and a speaking time. Run it from your laptop and put the display on the
  projector.`
- Link, as an outline pill: `Run a quick session`

### 6.10 Afterwards

**Layout.** Words left, picture right. Shorter than its neighbours.

**Copy.**

- Eyebrow: `Afterwards`
- Title: `Close this conference. Start the next one from it.`
- Lead: `Student secretariats change every year. The conference they built does not have
  to be rebuilt.`

| Row | Detail |
| --- | --- |
| Awards | Chairs propose, the secretariat confirms, and you publish at the moment the closing ceremony reaches them. Each award appears on the delegate's profile. |
| Everything exports | Applications, participants and invoices as CSV, whenever you want them. |
| Next year's edition | A new edition takes this one's committees, application form and fees, and moves the dates to the same days of the week a year on. |

**Picture: a new edition.** One card: `New conference` in grey; `Northbridge MUN 2028` in
the serif; `3 – 5 Mar 2028` with a grey note `Suggested from 2027`; then
`Copy from Northbridge MUN 2027` over three ticked lines: `8 committees`,
`Application form, 6 questions`, `3 fees`; and a dark blue `Continue` button.

### 6.11 Who sees what

**Job.** Answer the teacher's question before it is asked, and show that a secretariat is
more than one login.

**Layout.** Words and a plain list on the left, on hairlines with no boxes. A team card on
the right.

**Copy.**

- Eyebrow: `Access`
- Title: `Everyone sees what their job needs.`

| Role | Sees |
| --- | --- |
| Organisers | Everything about the conference: applications, seats, fees, the programme, documents and every room. |
| Chairs | Their own committee: its room, its description and agenda, its delegates' position papers, their own notes and the awards they propose. Not applications, fees or private details. |
| Volunteers | The staff programme, staff announcements and staff documents. |
| Roles you make | Exactly what you tick, for the whole conference or for chosen committees: a USG delegate affairs who decides applications, a Finance role that sees the invoices and no welfare details, a registration desk that sees the participants and nothing else. |
| Heads of delegation | Their own delegation: its members, its seats and its invoices. |
| Delegates | Their own application, seat, invoice and paper, and their committee's room. |

- Line under the list: `Private details, such as date of birth, dietary requirements and
  an emergency contact, are read only by the person, the head of their own delegation,
  and the team members whose role is allowed to see them.`

**Picture: the team.** A card headed `Team` with five rows of avatar (initials in black on
grey), name, title and role: Eleanor Wright · Secretary-General · Organiser; Tomasz
Zielinski · Under-Secretary-General · USG delegate affairs; Fiona Campbell · Human Rights Council ·
Chair; Idris Bello · Security Council · Chair; Lena Fischer · Registration ·
Registration desk. A last row in grey: `Invitation sent to j.morgan@northbridge.example` with
`Resend`.

### 6.12 What it costs

**Job.** State the price plainly, because the alternative charges a share of every
delegate fee and organisers expect a catch.

**Layout.** No card. A serif title on the left; on the right a short price list on
hairlines with tabular figures, right-aligned. One line of small grey text under it.

**Copy.** The figure is the one the site and the code state today; section 9 lists what
the owner still has to confirm about it.

- Eyebrow: `Price`
- Title: `What it costs.`

| Line | Price |
| --- | --- |
| Setting up and running a conference | Free |
| Each delegate seat paid by card through MUNMeet | €2.00 |
| Fees you collect yourselves | Free |
| Free conferences | Free |

- Note: `A flat fee for each seat, not a share of your delegate fee. A conference of 200
  delegates paying by card pays €400.`

### 6.13 Questions

**Layout.** The landing page's accordion in a white card, one question open at a time.
On a desktop the questions may run in two columns.

- Eyebrow: `Questions`
- Title: `What organisers ask first.`

| Question | Answer |
| --- | --- |
| Can we try it first? | Yes, twice over. Run a quick session to try the committee room tonight, or create a conference and keep it as a draft for as long as you like. |
| What does it cost? | €2.00 for each delegate seat paid by card through MUNMeet. Conferences that collect their own fees, and free conferences, pay nothing. |
| Can we collect fees ourselves? | Yes. Choose to collect payments outside MUNMeet, and delegates see your instructions on their invoice instead of a card button. |
| Do delegates need an account? | Yes, one free account, which they keep from conference to conference. Their profile fills in the parts of your form that every conference asks for. |
| Our delegates come as school groups. Does that work? | Yes. A school registers one delegation and asks for a number of seats. You allocate them, its head of delegation assigns the students, and the school is invoiced for its seats together. |
| How are delegates told about decisions and changes? | By email and by a notification in MUNMeet, the moment it happens: a decision, a seat, an invoice, an announcement, a reviewed paper, an award. |
| Which rules of procedure does the committee room follow? | A general speakers' list, moderated and unmoderated caucuses, motions, and votes by simple or two-thirds majority. Working papers, draft resolutions and amendments are written, signed and approved in MUNMeet, by THIMUN rules or North American ones, and each vote is tied to the paper or amendment it decides. Points and yields are not in the room yet. |
| Can chairs use it without being organisers? | Yes. Invite each chair to their committee by email. They open their own rooms and see nothing of applications or fees. |
| What if the connection drops during a session? | Every screen keeps its own clock running and catches up when it is back. Changing the room, such as calling the next speaker, needs a connection. |
| Can we take our data out? | Yes. Applications, participants and invoices export as CSV at any time. |
| Who can see our applicants' details? | Only the organisers of your conference, and a delegation's own head for its members. The rule is enforced in the database, not only on the screen. |

- Line under the card: `Something else? Write to hello@munmeet.app.`

### 6.14 Closing call

The landing page's closing band: centred words over the two soft blue ribbons.

- Title: `Start with a draft.`
- Text: `Nothing is public until you publish it.`
- Primary button: `Create a conference`
- Text link under it: `or run a quick session`

No sentence about how many people use MUNMeet.

### 6.15 A place kept empty

Between "Who sees what" and "What it costs", keep room in the layout for one quotation
from a real Secretary-General: two or three lines in the serif, a name, a role and a
conference, beside a real photograph of that conference at full width. Draw it as its own
component board and leave it out of the page boards. It appears only when a real conference
has run on MUNMeet.

## 7. Behaviour

- **Buttons.** "Create a conference" goes to the creation flow for a signed-in reader and
  through sign up first for a visitor. "Run a quick session" does the same for
  `/quick/new`. The page is otherwise identical for both.
- **One primary button.** The hero's, repeated in the closing band. Everything else is an
  outline pill or a text link.
- **The ledger rows** are links to the chapters. They need no JavaScript.
- **Pictures** cannot be pressed and are hidden from screen readers; each has a sentence
  that says what it shows.
- **The schools strip** keeps the address `/for-organisers#schools`.
- **Phone.** One column. In each section the words come first and the picture after. The
  seat grid shows one committee and the line `3 more committees`. The three screens of the
  room stack as console, then phone; the projector display is left out. The ledger becomes
  blocks. A bar fixed to the bottom of the screen holds "Create a conference" once the hero
  has scrolled away. Everything pressed is at least 44px tall, and the page never scrolls
  sideways.
- **If the page runs too long**, shorten in this order: fold 6.10's awards and exports
  rows into the questions and keep only the new edition; drop the team card from 6.11 and
  keep the list; fold 6.4 into 6.5 as one section on opening and reading applications.

## 8. Built, planned and left out

The page describes the MVP. The owner confirmed on 6 October 2026 that card payments and
email are in it, so the copy above states both as done although neither was built that
day. The page should go live with them, not before them.

**In the MVP, not yet built on 6 October 2026. Stated on the page as done.**

| On the page | State of the build that day |
| --- | --- |
| Delegates pay invoices by card; invoices mark themselves paid; Stripe pays out to the organisation | An organisation can connect a Stripe account. Checkout, the payment webhook and the "pay by card" button are not built. |
| Refunding a card payment in one press | The invoice status "refunded" exists; no refund action does. Assumed to ship with card payments, since the site's current copy already promises it. |
| Email for decisions, seats, invoices, announcements, programme changes, reviewed papers and awards | The same events produce a notification in the app. Nothing is emailed. |
| Inviting organisers, chairs and volunteers by email | An invitation is a link the organiser copies and sends. |

**How things behave, so the copy stays exact.**

| Loose wording | What happens |
| --- | --- |
| "Accept or reject a hundred at a time" | Group decisions cover the rows ticked on one page of 25. |
| "Change a room and everyone is told" | A programme change notifies people when the old or new time is within 24 hours. An announcement always notifies its audience. |
| Delegates vote or ask to speak from their phones | The delegate's screen is for watching the floor and for their bloc's papers: writing, signing and amending. The chair records every vote. |
| Delegates join a quick session | A quick session is the chair's screen only. |
| Anyone can open the projector display | It needs a signed-in chair, organiser or delegate of that committee. |

**Not built, and not confirmed for the MVP. Left out until the owner says otherwise.**
Each has a place waiting for it.

| Feature | Where it would go |
| --- | --- |
| Certificates and badges | A row in 6.10 |
| Check-in at the door | The secretariat's view in 6.9 |
| Statistics | A row in 6.10 |
| Points, yields to questions and right of reply | A row in 6.9, and the procedure question in 6.13 |
| Delegates voting or asking to speak from their phones | The phone in 6.9 |

**Never, until it is true:** numbers of users, conferences said to run on MUNMeet,
testimonials, or a claim of compliance with data protection law. The terms and privacy
pages were placeholders on 6 October 2026. The access rules in 6.11 are real and can be
stated.

## 9. Decisions for the owner

1. **What else is in the MVP.** Anything in the last table of section 8 that will ship
   should be written into the page, the way card payments and email are.
2. **The price.** The page states €2.00 for each seat paid by card, as the site does
   today. A note in the code says fixed versus percentage is still undecided, and nothing
   says whether Stripe's own processing fee comes on top. The page needs both settled.
   For comparison, the incumbent publishes 7% of card payments, or 5% of the delegate fee
   when the organiser collects the money itself, plus a separate charge for its session
   app. On 200 delegates at €65 that is €650 to €910 before the session app, against €400
   here. A flat fee is the strongest plain fact this page carries.
3. **The headline.** Recommended: "One system, from the first application to the final
   vote." Alternatives: "Registration and the committee room, in one system." and "Run a
   conference, not a spreadsheet." The second alternative is the oldest pitch in this
   market and does not separate MUNMeet from the incumbent.
4. **Motion.** `DESIGN.md` allows motion on the landing page only. Recommendation: extend
   the same exception to this page, since it is the landing page's sibling.
5. **The sample conference.** This page uses an invented conference. The landing page
   shows "Oxford International MUN 2026, University of Oxford", a real university with a
   real conference and a date now in the past, which can be read as a claim that Oxford
   uses MUNMeet. Recommendation: move the landing page to the same invented conference.
6. **Two lines on the landing page.** "Join thousands of students and organisers on
   MUNMeet" has nothing behind it yet, and the organiser heading "Run the whole conference
   from one place" is close to the incumbent's headline.
7. **Who is behind MUNMeet.** Organisers trust tools made by people who have chaired and
   organised. If that is true of the team, one sentence saying so belongs above the
   closing call. It is not in this brief because the facts are not in the codebase.
8. **The legal pages.** They should be real before this page is shown to schools.

## 10. Background the design rests on

**How organisers work today.** Conference websites from 2026 and 2027 show school
conferences running on Google or Microsoft Forms, a second "allocation form", invoices by
email and fixed payment deadlines. Position papers are emailed to chairs. One school
conference approves resolutions through shared folders and a status sheet. Older first-hand
accounts name the same pains: "double assignments, lost payments and other mismatches",
delegates who pay and never arrive, emails that go to spam, a room change that means
correcting every handbook, and knowledge lost when the secretariat changes.

**The incumbent.** myMUN describes itself to organisers with the headline "Run your MUN
conference in one place" and leads on its 430,000 registered delegates. It has check-in at
the door and statistics, which MUNMeet does not. Its committee room is a separate product,
MUN Command, connected by an import and priced per user per day. It writes in American
usage. These wordings were read in October 2026 and should be checked by hand before anyone
relies on them; myMUN's terms forbid automated reading of its site.

**What MUNMeet has that the alternatives do not.** One record from application to award;
the committee room in the same product as registration; position papers written in the app
by a delegation together and reviewed by the chair; a dashboard that follows the phase of
the conference; a new edition copied from the last; a flat fee instead of a share.

**Typical sizes**, used for the sample data: 100 to 350 delegates, 6 to 12 committees of 15
to 40 seats, delegate fees of €60 to €100 in continental Europe and £30 to £90 in the UK.
