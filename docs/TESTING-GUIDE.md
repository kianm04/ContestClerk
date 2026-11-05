# Testing MUNMeet by hand

This guide is for testing the whole app on **https://munmeet.umarbek.dev**, without
reading any code. It covers:

1. what to know before you start: when the test data matches this guide, and what the test
   site cannot do;
2. every account you can sign in as, and who each person is;
3. what the test data holds, conference by conference;
4. a checklist of every feature, in an order that works from top to bottom;
5. what is known not to work yet, so you do not report it;
6. how to write up what you find, and questions we would like your view on.

If you work through section 4 from top to bottom you will have used every part of the app
at least once. Tick each box as you go, and note anything that confused you, looked wrong
or broke, even if it seems small.

---

## 1. Before you start

### The site

Open **https://munmeet.umarbek.dev** in any browser, on a computer or a phone. There is
nothing to install.

In this guide, an address such as `/home` means https://munmeet.umarbek.dev/home.

### The site is reset every night

The site is filled with made-up test data: organisations, conferences, people, papers and
invoices. **Resetting** the site wipes it and loads the test data again. It resets by
itself **every night at 4am UK time**, and you can reset it yourself at any time on
`/test-site` (see the end of this section).

Every date in the test data is counted from the day of the last reset, so every morning:

- "Northbridge MUN (running today)" is on the second of its three days, with a committee
  in session;
- "Northbridge MUN (about to start)" starts in four days, and its position papers are due
  in two;
- "Northbridge MUN (opening soon)" opens for applications in three days.

Section 3 describes the data as it is right after a reset, which is how you find it each
morning. **What you change is gone the next morning.** If you test over several days,
start each day at the group where you stopped. A few steps mention something an earlier
group changed; if that is gone, note it and carry on.

### Everything you change is shared

The site is shared and there is no undo. What you change (an application you decide, a
session you end, a password you set) stays until the next reset, and anybody else using
the site sees it.

Section 4 is ordered so that each step still finds what it needs: steps that only look come
before steps that change the same thing. **Do the groups in order, and only press what a
step asks you to.** If something has already been changed, write down what you found and
carry on, or reset the site and start again. A reset wipes what everybody else is in the
middle of too, so check with anyone else testing first.

The site is on the public internet, and the password of every test account is written in
this guide. Do not put anything real or private into the test accounts.

### Emails do not leave the test site

The test site does not send emails to real inboxes. Everything the app emails (a password
reset link, the link that confirms a new email address) goes into a test mailbox on the
server instead. So those two cannot be finished here; section 4.2 says what you can still
check. Signing up needs no email confirmation on the test site, so you can make as many
accounts as you like with made-up addresses such as `yourname.1@example.test`.

Invitations are never emailed anyway: an organiser copies a link and sends it.

### Tips

- **Two people at once.** Many features involve two people, such as a chair and a
  delegate. Use two different browsers (for example Chrome and Safari), or one normal
  window and one private window. Two tabs in the same window share one sign-in and will
  not work. **Your phone makes a good second person:** sign in on it as the delegate while
  the computer is the chair.
- **Phone.** The app is meant to work on a phone, so try it on yours as you go.
- **Signing out.** Use the menu under your name at the top right, or go to `/logout`.
- **Times** are shown in UK time, where every Northbridge conference takes place.

### Resetting the site yourself

Open **`/test-site`**, type the reset code (ask Kian for it) and press "Reset the test
site". The page also says when the site was last reset.

A reset deletes everything on the site, including any accounts people made there, and
loads the test data again with every date counted from today. It takes about two minutes,
and everybody is signed out. Between midnight and 1am UK time in summer a reset does
nothing, because the database's clock is still on yesterday; the page then shows the old
"Last reset" time again.

For Kian, on the Mac mini that serves the site: `~/MunMeet/deploy/reseed.sh` does the same
from a terminal, asking first, and prints each conference's dates at the end. The nightly
reset and the one `/test-site` asks for are the launchd job `com.munmeet.reseed`, which runs
that script; what it printed is in `~/MunMeet/deploy/reseed.log`.

### Testing on your own computer instead

Developers can run the same test data locally: `pnpm db:reset` in `client/`, then
`pnpm dev`, and use http://localhost:5173 wherever this guide says
https://munmeet.umarbek.dev. Locally the emails do arrive, in Mailpit at
http://127.0.0.1:54324 (see `supabase/README.md`), at most two an hour.

---

## 2. The accounts

**Every account has the password `sample-password-123`.**

The test data comes from three files. The one made for hand testing is the **Northbridge**
walkthrough, and nearly everything in section 4 uses it.

### The main walkthrough accounts

Each address says the person's role and the conference phase they belong to.

| Email                                  | Who they are                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `walk.organiser@example.test`          | **Eleanor Whitfield**, owner of Northbridge MUN Society and on the team of all five conferences |
| `walk.org.admin@example.test`          | **Priya Nair**, an admin of the society, but not on any conference's team                       |
| `walk.organiser.upcoming@example.test` | **Marcus Adeyemi**, an organiser of "about to start" only                                       |
| `walk.usg.upcoming@example.test`       | **Olivia Grant**, USG delegate affairs of "about to start": applications and private details    |
| `walk.finance.upcoming@example.test`   | **Rohan Mehta**, Finance of "about to start": the fees and invoices                             |
| `walk.desk.upcoming@example.test`      | **Ellie Watson**, the registration desk of "about to start": the participants only              |
| `walk.chair.live@example.test`         | **Fiona Campbell**, chair of the Security Council, in session right now                         |
| `walk.chair.upcoming@example.test`     | **Samuel Osei**, chair of the Human Rights Council of "about to start"                          |
| `walk.volunteer.live@example.test`     | **Tom Hughes**, a volunteer ("Runner") at "running today"                                       |
| `walk.head.open@example.test`          | **Rachel Morgan**, head of St Aidan's Academy, a school delegation still forming                |
| `walk.head.submitted@example.test`     | **Daniel Okafor**, head of Riverside Grammar School, whose delegation waits for a decision      |
| `walk.head.upcoming@example.test`      | **Andrew Blake**, head of Harbour View College, an accepted school delegation                   |
| `walk.delegate.live@example.test`      | **James Wilson**, the United Kingdom in the Security Council, waiting to speak                  |
| `walk.delegate.upcoming@example.test`  | **Maya Thompson**, Canada in the Human Rights Council, with an unpaid invoice                   |
| `walk.applicant.open@example.test`     | **Aarav Patel**, whose application to "applications open" is waiting for a decision             |
| `walk.newcomer@example.test`           | **Noor Rahman**, who has just signed up and has not finished setting up her account             |
| `walk.chair.thimun@example.test`       | **Pieter de Vries**, chair of ECOFIN at "running today", run to THIMUN procedure                |
| `walk.chair.crisis@example.test`       | **Catherine Doyle**, chair of ExComm, the crisis committee at "running today"                   |
| `walk.crisis.staff@example.test`       | **Ahmed Karim**, the crisis staff of ExComm: he answers its directives and does not chair       |

### Other walkthrough accounts worth signing in as

The walkthrough has 56 accounts in all. The rest fill seats, lists and queues, and some of
them are useful for seeing the other side of a feature.

| Email                                | Who they are, and why you might sign in as them                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `walk.nadia.haddad@example.test`     | Nadia Haddad, chair of the Third Committee (SOCHUM, running today) and of DISEC (about to start)       |
| `walk.wei.zhang@example.test`        | Wei Zhang, China in the Security Council, **speaking right now**                                       |
| `walk.gabriel.santos@example.test`   | Gabriel Santos, Brazil in the Security Council, who has proposed a motion                              |
| `walk.camille.dubois@example.test`   | Camille Dubois, France in the Security Council                                                         |
| `walk.omar.farouk@example.test`      | Omar Farouk, Türkiye in the Third Committee                                                            |
| `walk.sofia.hernandez@example.test`  | Sofía Hernández, Mexico in the Human Rights Council, whose paper (written in the app) waits for review |
| `walk.hana.sato@example.test`        | Hana Sato, Japan in the Human Rights Council, whose uploaded PDF waits for review                      |
| `walk.zoe.adams@example.test`        | Zoe Adams, Harbour View College, Nigeria in DISEC, who shares a paper draft with her head              |
| `walk.ruby.hall@example.test`        | Ruby Hall, Harbour View College, who has **no seat yet**                                               |
| `walk.amani.wanjiru@example.test`    | Amani Wanjiru, Kenya in DISEC, with an unpaid invoice and a paper waiting                              |
| `walk.felix.schmidt@example.test`    | Felix Schmidt, Germany in DISEC, whose fee was waived and who is writing his paper in the app          |
| `walk.isla.fraser@example.test`      | Isla Fraser, a member of Riverside Grammar School's delegation                                         |
| `walk.helen.clarke@example.test`     | Helen Clarke, head of Kingsway Sixth Form, whose delegation was turned down                            |
| `walk.mei.tan@example.test`          | Mei Tan, who applied to "applications open" and has an unsent draft for "about to start"               |
| `walk.ethan.brooks@example.test`     | Ethan Brooks, who applied to "applications open" but is **under the minimum age**                      |
| `walk.grace.oconnor@example.test`    | Grace O'Connor, with a draft application to "applications open"                                        |
| `walk.chloe.martin@example.test`     | Chloé Martin, waitlisted at "applications open"                                                        |
| `walk.ben.carter@example.test`       | Ben Carter, turned down at "applications open"                                                         |
| `walk.sofia.rossi@example.test`      | Sofia Rossi, who withdrew her application to "applications open"                                       |
| `walk.jakub.wisniewski@example.test` | Jakub Wiśniewski, accepted at "applications open" and given Poland in ECOSOC                           |
| `walk.emily.johnson@example.test`    | Emily Johnson, the United States in the Security Council, who writes the bloc's working paper          |
| `walk.ivan.petrov@example.test`      | Ivan Petrov, the Russian Federation in the Security Council, with three amendments still open          |
| `walk.keisha.bynoe@example.test`     | Keisha Bynoe, Barbados in ECOFIN, who signed its draft resolution                                      |
| `walk.arjun.rao@example.test`        | Arjun Rao, India in ECOFIN, the main submitter of its draft resolution                                 |
| `walk.chidi.okonkwo@example.test`    | Chidi Okonkwo, Nigeria in ECOFIN, a co-submitter                                                       |
| `walk.thomas.reid@example.test`      | Thomas Reid, the Secretary of Defense in ExComm, whose personal directive waits                        |
| `walk.lena.hoffmann@example.test`    | Lena Hoffmann, the Secretary of State in ExComm, whose press release was published                     |
| `walk.jonah.levy@example.test`       | Jonah Levy, the Attorney General in ExComm, whose personal directive was refused                       |

### Addresses that do not have an account yet

Invitations wait for three addresses nobody has signed up with. Register with them (any
password) when checklist 4.8 asks you to.

| Email                         | What waits for them                                                    |
| ----------------------------- | ---------------------------------------------------------------------- |
| `new.admin@example.test`      | An invitation to join Northbridge MUN Society as an admin              |
| `guest.chair@example.test`    | An invitation to chair ECOSOC at "Northbridge MUN (applications open)" |
| `late.volunteer@example.test` | An invitation to volunteer at "about to start", which has expired      |

### The finished conference (Lisbon Atlantic MUN)

A second organisation, Atlantic Debate Society, ran **Lisbon Atlantic MUN**, which ended
about two weeks ago. Its awards are published. Use it to see what a conference looks like
once it is over.

| Email                         | Who they are                                                             |
| ----------------------------- | ------------------------------------------------------------------------ |
| `demo.organiser@example.test` | Inês Carvalho, Secretary-General and an owner of Atlantic Debate Society |
| `demo.chair@example.test`     | Daniel Okoro, who chaired the Security Council                           |
| `demo.head@example.test`      | Catarina Lopes, head of the Colégio Atlântico delegation                 |
| `demo.delegate@example.test`  | Beatriz Santos, who held France and **won Best Delegate**                |

### The directory's sample conferences

A third organisation, Sample Europe MUN Network, owns most of the conferences in the public
directory (The Hague, BERMUN, Vienna, Madrid, Amsterdam and others). They are there so the
directory looks full.

| Email                           | Who they are                                                |
| ------------------------------- | ----------------------------------------------------------- |
| `sample.organiser@example.test` | Hugo Meijer, an owner of Sample Europe MUN Network          |
| `sample.head@example.test`      | Jasper de Vries, head of the Rotterdam Grammar Delegation   |
| `sample.delegate@example.test`  | Sofia Almeida, Morocco in a committee of Amsterdam Open MUN |

---

## 3. What the test data holds

Northbridge MUN Society runs five conferences, one in each phase a conference goes
through. Each name says its phase. This is the data as it is on the day of a reset, before
anybody has changed anything.

### Northbridge MUN (draft)

`/manage/northbridge-draft`

- Being set up. Not published, so it is not in the directory and only its organisers
  (Eleanor) can see it.
- One committee, the United Nations Environment Programme (UNEP), with no seats yet.

### Northbridge MUN (opening soon)

`/conferences/northbridge-opening-soon`

- Published and in the directory, but applications open **in three days**. Until then
  nobody can apply.
- One committee, the World Health Assembly, with four seats.

### Northbridge MUN (applications open)

`/conferences/northbridge-applications-open`

- Applications are open now. One committee, ECOSOC, with six country seats and one
  observer seat (European Union) that is hidden from applicants.
- **Applications, one in each state:**

  | Person           | State                                               |
  | ---------------- | --------------------------------------------------- |
  | Grace O'Connor   | Draft (not sent)                                    |
  | Aarav Patel      | Submitted, waiting                                  |
  | Mei Tan          | Submitted, waiting                                  |
  | Ethan Brooks     | Submitted, waiting, **under the minimum age of 14** |
  | Jakub Wiśniewski | Accepted, and given Poland                          |
  | Chloé Martin     | Waitlisted                                          |
  | Ben Carter       | Rejected                                            |
  | Sofia Rossi      | Withdrawn                                           |

- **Five optional questions** on the application form, one of each kind: a short answer
  ("Name for your placard"), a long answer ("Tell us about a debate you enjoyed"), a single
  choice ("T-shirt size"), a multiple choice ("Which social events will you come to?") and a
  tick box ("I need step-free access to the venue"). The applicants have answered them.
- **School delegations, three states:**

  | Delegation               | Head          | State                                              |
  | ------------------------ | ------------- | -------------------------------------------------- |
  | St Aidan's Academy       | Rachel Morgan | Still forming, three members, join code `NRTHBG42` |
  | Riverside Grammar School | Daniel Okafor | Sent to the organisers, waiting for a decision     |
  | Kingsway Sixth Form      | Helen Clarke  | Turned down, with a note explaining why            |

- Invitations waiting: one to chair ECOSOC (for `guest.chair@example.test`), and one to
  join the society as an admin (for `new.admin@example.test`).

### Northbridge MUN (about to start)

`/conferences/northbridge-about-to-start`

- Applications are closed and the first day is **four days away**. Two committees:
  - **Human Rights Council (HRC)**, chaired by Samuel. Brazil, Canada (Maya), Japan and
    Mexico.
  - **DISEC**, chaired by Nadia. France, Germany, Kenya and India (empty, nobody in it),
    plus Argentina, Indonesia and Nigeria, which are kept for Harbour View College.
- **Position papers**, due in two days:

  | Committee | Country | State                                                           |
  | --------- | ------- | --------------------------------------------------------------- |
  | HRC       | Brazil  | Approved                                                        |
  | HRC       | Canada  | Sent back for changes, with the chair's comment                 |
  | HRC       | Japan   | Waiting for review (an uploaded PDF)                            |
  | HRC       | Mexico  | Waiting for review (written in the app)                         |
  | DISEC     | France  | Approved                                                        |
  | DISEC     | Germany | A draft Felix is writing in the app, not yet sent               |
  | DISEC     | Kenya   | Waiting for review                                              |
  | DISEC     | Nigeria | A shared draft, not yet sent, that Andrew and Zoe both write in |

  Each committee also has a background guide (a PDF).

- **Invoices.** The delegate fee is £45 per person and the school delegation fee is £40 per
  member.

  | Number | For                  | State                                          |
  | ------ | -------------------- | ---------------------------------------------- |
  | 0001   | Maya Thompson        | Unpaid                                         |
  | 0002   | Lucas Oliveira       | Paid                                           |
  | 0003   | Hana Sato            | Paid                                           |
  | 0004   | Louis Bernard        | Paid                                           |
  | 0005   | Amani Wanjiru        | Unpaid                                         |
  | 0006   | Felix Schmidt        | Waived                                         |
  | 0007   | Sofía Hernández      | Paid                                           |
  | 0008   | Harbour View College | **Void** (£160 for four; replaced by 0009)     |
  | 0009   | Harbour View College | Unpaid (£120 for the three seats it was given) |

- **Harbour View College**, head Andrew Blake: an accepted school delegation that asked
  for four seats and got three in DISEC. Zoe has Nigeria, Kwame has Indonesia, and
  Argentina is still empty for Ruby.
- **Mei Tan** started an application here but never sent it. Applications are now closed.
- **Schedule:** chairs' briefing, registration, opening ceremony, two committee sessions and
  the closing ceremony.
- **Announcements**, each for a different audience: everyone ("Seats are out"), one
  committee (HRC), one delegation (Harbour View College), the staff ("Chairs: briefing at
  eight on the first morning") and delegates only ("Position papers are due in two days").
- Invitations: Noor has been invited to volunteer at the registration desk. An older
  invitation to `late.volunteer@example.test` has expired.
- **Roles.** Besides the three every conference starts with (Organiser, Chair, Volunteer),
  this one made three of its own, one person each:

  | Role                 | Who          | What it may do                                                                 | On the public team list |
  | -------------------- | ------------ | ------------------------------------------------------------------------------ | ----------------------- |
  | USG delegate affairs | Olivia Grant | Read and decide applications, every private detail, read invoices, announce    | Yes                     |
  | Finance              | Rohan Mehta  | Edit the conference, the fees and invoices, the participants with their emails | No                      |
  | Registration desk    | Ellie Watson | The participants, with their welfare details but not their emails              | No                      |

### Northbridge MUN (running today)

`/conferences/northbridge-running-today`

- The conference started yesterday and today is its second day. It has four committees:
  the Security Council and the Third Committee are in session, ECOFIN has not started its
  first session, and ExComm, the crisis committee, sat yesterday.
- **Security Council (UNSC)**, chaired by Fiona, six delegates. "Session 1" is in progress:
  - the agenda is set ("Humanitarian access in armed conflict");
  - the roll call is taken: everyone present and voting, except the Russian Federation,
    which is only "present";
  - France and the United States have spoken, **China is speaking now** (the timer is
    paused with 52 of 90 seconds left), and the United Kingdom (James) and Brazil are
    waiting;
  - Brazil has proposed a moderated caucus, "Opening humanitarian corridors" (10 minutes,
    60 seconds each), which the chair has not yet put to a vote.
- **Yesterday's "Practice session"** of the Security Council has ended, and its full
  record is kept:
  - a roll call with the Russian Federation absent;
  - a speakers' list where Brazil was removed;
  - a moderated caucus that passed, an unmoderated caucus that failed and a motion to
    suspend that Brazil withdrew;
  - a roll-call vote on "Working paper 1 · Safe passage for aid convoys", which failed
    2–2 with one abstention;
  - Fiona's session notes and three chair notes;
  - two awards Fiona has proposed but not yet confirmed: Outstanding Delegate for France,
    and a custom "Best Newcomer" award for Brazil.
- **"Practice session 2"** of the Security Council, the evening before the first day, has
  ended too. Its three motions to introduce a document passed, and its votes decided the
  papers below.
- **The Security Council's papers**, under "Resolutions" on its committee page. A draft
  needs the support of two seats, its sponsors included, before it can be submitted; an
  amendment the sponsors do not accept needs two seats behind it, its proposer included,
  before it goes to the dais. Friendly amendments are on, amendments to amendments are
  off, and only operative clauses can be amended.

  | Paper                                             | Authors                                         | State                                          |
  | ------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------- |
  | Working paper 1.1, "Safe passage for aid convoys" | France (lead) and Brazil                        | Introduced in Practice session 2               |
  | Resolution 1.1, "Aid convoys and checkpoints"     | France, Brazil, the United States; China signed | Passed 5 to 0 with 1 abstention; record copy   |
  | Draft resolution 1.2, "Humanitarian pauses"       | The UK (James, lead), France, the US            | On the floor, with eleven amendments           |
  | "Protecting medical care in armed conflict"       | The UK (James, lead), France, the US            | A working paper being written                  |
  | "Consent of the host State"                       | China (Wei, lead), the Russian Federation       | A draft open for signatures; nobody has signed |
  - Resolution 1.1 was based on Working paper 1.1. Its three amendments: China's
    friendly one ("sixty days") was written in, the Russian Federation's passed 4 to 1
    with 1 abstention and is now clause 3, and China's other one failed 2 to 3 with 1
    abstention.
  - The working paper has four comment threads: Camille's question on "medical workers,
    their transport and their facilities", which James answered; Emily's on "Gravely
    concerned", which James resolved; Camille's on Emily's suggestion (to report every
    three months instead of six); and Emily's on the whole paper.
  - "Consent of the host State" already has the support it needs: its two authors are
    two seats.

  Draft resolution 1.2's amendments:

  | No. | Proposed by        | What it does                 | State                                                                     |
  | --- | ------------------ | ---------------------------- | ------------------------------------------------------------------------- |
  | 1   | France             | Strikes clause 4             | Friendly, written in                                                      |
  | 2   | Russian Federation | Changes clause 4             | Lapsed, because amendment 1 struck the clause                             |
  | 3   | Brazil             | Changes clause 1             | Passed, 4 to 2                                                            |
  | 4   | Russian Federation | Strikes clause 2             | Failed, 1 to 4 with 1 abstention                                          |
  | 5   | China              | Changes clause 2             | Ruled out of order, with the dais's reason                                |
  | 6   | United States      | Adds a clause                | Withdrawn                                                                 |
  | 7   | China              | Changes clause 2             | Asking the sponsors: France accepted, the UK and the US have not answered |
  | 8   | Russian Federation | Strikes clause 3             | Unfriendly, collecting support: one seat of the two it needs              |
  | 9   | Brazil             | Adds a clause after clause 3 | With the dais, first in the queue                                         |
  | 10  | Russian Federation | Changes the last clause      | With the dais, second                                                     |
  | 11  | China              | Changes clause 1             | Approved by the dais, waiting for its vote                                |

- **Nothing is on the projector.** The Security Council's "Display" shows the room until
  the dais puts a paper on screen.
- **Third Committee (SOCHUM)**, chaired by Nadia, five delegates. Its "Session 1" has just
  started: no roll call yet, and no agenda chosen between its two topics.
- **Economic and Financial Committee (ECOFIN)**, Room 3, chaired by Pieter, run to THIMUN
  procedure: authors are "Submitters" (a main submitter and co-submitters), there are no
  working papers, a draft needs three seats behind it, its submitters included, friendly
  amendments are off, an amendment goes straight to the dais, and amendments to
  amendments are allowed. Barbados (Keisha), India (Arjun) and Nigeria (Chidi); Japan's
  seat is empty. Its topic is "Debt relief for climate-vulnerable States". No session has
  started yet.
  - "Debt pauses after natural disasters", a draft resolution by India (main submitter)
    and Nigeria, signed by Barbados, was submitted yesterday at 16:30 and waits for
    Pieter.
- **Executive Committee of the National Security Council (ExComm)**, Room 4, a crisis
  committee chaired by Catherine, on "The Cuban Missile Crisis". Its seats are characters:
  the Secretary of Defense (Thomas), the Secretary of State (Lena) and the Attorney
  General (Jonah); the Director of Central Intelligence is empty. Its "Session 1" was
  yesterday afternoon and has ended. Its papers are under "Directives":

  | Paper                                               | From                                     | State                                       |
  | --------------------------------------------------- | ---------------------------------------- | ------------------------------------------- |
  | Committee directive 1.1, "Naval quarantine of Cuba" | The committee, passed 3 to 0 yesterday   | Waiting for the crisis staff                |
  | "Reconnaissance flights over Cuba"                  | Joint directive: Defense and State       | Carried out, with the crisis staff's answer |
  | "A private meeting with the Soviet ambassador"      | Personal directive: the Attorney General | Refused                                     |
  | "Two squadrons to Florida"                          | Personal directive: Defense              | Waiting for the crisis staff                |
  | "The United States asks the OAS to meet"            | Press release: State                     | Published                                   |
  | "No decision has been taken"                        | Press release: the Attorney General      | Waiting for the crisis staff                |
  - The crisis staff's latest update is on the room's screens: "Soviet ships have stopped
    short of the quarantine line. One, the Poltava, is still moving."

- **Roles.** This conference made one role of its own, "Crisis staff", for Ahmed, with
  the title "Crisis staff, ExComm". It may answer directives and nothing else, and it is
  not on the public team list. It sits between Chair and Volunteer.
- **Schedule:** opening ceremony (yesterday), the Security Council session (today), the
  delegates' social (tonight at 19:30, recently moved) and the closing ceremony (tomorrow
  at 15:00).
- Announcement: "Welcome to day two".
- Tom (volunteer) joined the team by accepting an invitation.

### Lisbon Atlantic MUN (finished)

`/conferences/lisbon-atlantic-mun`

- Ended about two weeks ago. Three committees, two school delegations, invoices, a
  schedule, announcements, papers, three played Security Council sessions and
  **published awards**.

### Notifications already waiting

Nearly every kind of notification the app sends is already in somebody's bell, some read
and some not:

| Kind                                  | Sign in as                                                             |
| ------------------------------------- | ---------------------------------------------------------------------- |
| Your application was decided          | `walk.delegate.upcoming` (Maya), or any accepted delegate              |
| You represent a country (seat given)  | `walk.delegate.upcoming` (Maya)                                        |
| Your delegation request was decided   | `walk.head.upcoming` (Andrew), `walk.helen.clarke` (turned down)       |
| You were assigned a seat by your head | `walk.zoe.adams`, `walk.kwame.mensah`                                  |
| New invoice                           | `walk.delegate.upcoming` (Maya), `walk.head.upcoming` (Andrew)         |
| Payment received                      | `walk.hana.sato`, `walk.lucas.oliveira`                                |
| New announcement                      | `walk.delegate.upcoming` (Maya), `walk.delegate.live` (James)          |
| Your position paper was reviewed      | `walk.delegate.upcoming` (sent back), `walk.lucas.oliveira` (approved) |
| You were invited to a team            | `walk.newcomer` (Noor, unread), `walk.volunteer.live` (Tom, read)      |
| A schedule event moved                | `walk.delegate.live` (James), or anyone at "running today"             |
| You received an award                 | `demo.delegate@example.test` (Beatriz, Lisbon)                         |

(Every address above ends in `@example.test`.)

The notifications about committee papers are the exception: none is waiting. They arrive
as you work through 4.24 to 4.32, when you are added as an author, a paper of yours is
returned, approved or introduced, somebody replies in your thread, an amendment waits for
your answer, your amendment is decided, or your directive is answered.

---

## 4. The checklist

For each step, the text after the arrow (→) is what should happen. If something else
happens, or it happens but feels wrong, write it down (see section 6).

**Go through the groups in this order.** On the shared site nothing can be undone, so the
order matters: a group that changes something comes after every group that needs to see
it unchanged. A step marked **"don't press it"** is there to look at; a later step needs
it as it is.

### 4.1 As a visitor, signed out

- [ ] `/` shows the landing page. "Browse … conferences" → the directory.
- [ ] `/conferences`: search for "Northbridge" → four Northbridge conferences (the draft is
      not public).
- [ ] Try each filter (Country, Level, Starts after / before, Open for applications, Sort)
      and "Reset". Use the browser's back button after a filter → the previous results
      come back.
- [ ] Open a conference page, then a committee on it → topics and seats. Seats show as
      "Taken" without names. The seeded background guides are for delegates only, so a
      visitor sees none (you upload one for "Everyone" in 4.14; look again then).
- [ ] Press "Apply as a delegate" on "Northbridge MUN (applications open)" → you are asked
      to create an account first.
- [ ] `/for-organisers`, `/terms` and `/privacy` read well and have no broken links.
- [ ] Open a page that does not exist, such as `/conferences/nothing-here` → a clear "does
      not exist" page.

### 4.2 Accounts: sign up, sign in, set up, password

- [ ] **Sign up** at `/register` with a made-up address of your own, such as
      `yourname.1@example.test`. This is **your account** for the rest of the guide. Try the
      mistakes first: an empty name, a bad email, a 5-character password, leaving the terms
      box unticked → a clear message for each.
- [ ] After signing up → you land on `/welcome` to finish your profile. Try "Continue" with
      nothing filled in → each missing field is named.
- [ ] Fill it in → "Welcome to MUNMeet." and `/home`, which leads with "Find your first
      conference": how many conferences are open for applications, the one button "Find a
      conference", and the "Open for applications" cards under it.
- [ ] **Sign in as Noor** (`walk.newcomer@example.test`), who signed up but never finished
      setting up → `/home`, `/applications` and other signed-in pages send her to
      `/welcome`. Public pages such as `/conferences` still open. **Don't finish her
      `/welcome` yet** (4.8 does).
- [ ] **Forgot password:** sign out, "Forgot your password?", enter your account's address
      → "If that address has an account, a link to choose a new password is on its way."
      The email itself stays on the test server (section 1), so stop there.
- [ ] Signed in as yourself, `/settings`: change the password (try a wrong current password
      first) → "Password changed." Sign out and back in with the new one.
- [ ] `/settings`: change your email → "Check … for a link to confirm the change." and
      "Waiting for confirmation of …". The confirmation email stays on the server, so the
      change never completes here.
- [ ] Make a second, throwaway account. `/settings`: "Delete account" → type DELETE → the
      account is gone. Then sign in as **Eleanor** (`walk.organiser@example.test`) and try
      the same → refused, because she is the society's only owner.
- [ ] "Log out" in the menu under your name → "Log out of MUNMeet?" → "Log out" → "You
      are logged out."

### 4.3 Your profile

Sign in as **James** (`walk.delegate.live@example.test`).

- [ ] `/profile` shows his details, conference history and "No awards yet."
- [ ] "Edit profile": upload a photo (JPEG, PNG or WebP, under 5 MB; not of a real person)
      → "Save photo". Change pronouns and bio → "Save profile". Both show on `/profile`.
- [ ] Private details: a date of birth in the future → refused.
- [ ] Sign in as **Beatriz** (`demo.delegate@example.test`) → `/profile` shows her
      **Best Delegate** award from Lisbon Atlantic MUN.

### 4.4 Applying to a conference as one person

- [ ] As **Aarav** (`walk.applicant.open@example.test`): `/applications` → his application
      is "Under review". Open it → his answers, "Edit application" and "Withdraw
      application". **Don't press "Withdraw"**: Eleanor decides his application in 4.11.
- [ ] As **Grace** (`walk.grace.oconnor@example.test`): `/home` → "To do" has "Finish your
      application (Northbridge MUN (applications open))" with the link "Finish
      application", and "Applications" lists the draft. Finish it and press "Submit
      application".
- [ ] As **your account** (from 4.2): open "Northbridge MUN (applications open)" → "Apply
      as a delegate". Choose the committee, answer the five questions (short answer, long
      answer, pick one, pick several, tick box), "Save draft", come back later, then
      "Submit application".
- [ ] Try to submit without agreeing to share your details → refused with a clear message.
- [ ] As **Ethan** (`walk.ethan.brooks@example.test`, aged 13): open his application.
      Then as Eleanor (4.11) look at the warning about his age.
- [ ] As **Chloé** (waitlisted), **Ben** (not accepted, with a note) and **Sofia Rossi**
      (withdrawn) → each application page explains its state clearly.
- [ ] As **Mei** (`walk.mei.tan@example.test`): her draft for "about to start" can no longer
      be sent, because applications closed → the page says so. "Delete draft" works.
- [ ] Try to apply to "Northbridge MUN (opening soon)" → "Applications open on …".
- [ ] As **your account**: withdraw the application you just sent → "Application
      withdrawn."

### 4.5 School delegations

- [ ] As **Rachel** (`walk.head.open@example.test`): `/home` → "Applications" lists
      "Delegation · St Aidan's Academy" under the conference, with the word "Draft". Open
      the row → the delegation page: tabs Overview, Members, Seats, Papers. Copy the join
      link.
- [ ] In a second browser, make **another new account** (not your account from 4.2, which
      has applied to this conference and is refused), open the join link
      (`/join/NRTHBG42`) → "Join delegation" → Rachel now sees four members.
- [ ] As Rachel: "Make head" on that new member → there are now two heads. "Remove" one of
      the other members. Then "Submit to the organisers" → "Request sent to the
      organisers." While it waits, she can still edit it and people can still join.
- [ ] As **Daniel** (`walk.head.submitted@example.test`): Riverside is "Under review".
      "Withdraw request" is offered. **Don't press it**: Eleanor accepts Riverside in 4.12.
- [ ] As **Helen** (`walk.helen.clarke@example.test`): Kingsway was not accepted; the
      organisers' note is shown.
- [ ] As **Andrew** (`walk.head.upcoming@example.test`), head of Harbour View College
      (accepted, "about to start"):
  - [ ] `/invoices`: invoice 0008 is "cancelled" (it was for four seats) and 0009 is
        unpaid, £120 for three.
  - [ ] `/home` leads with the conference: "Head of delegation · Harbour View College",
        the figure "2 of 3 / seats assigned", the next step "Assign delegation seats
        (Harbour View College) · 1 seat nobody holds yet" and the one button "Assign
        seats". Press it → the Seats tab: Zoe has Nigeria, Kwame has Indonesia, Argentina
        is empty → assign **Ruby** to Argentina → "Ruby Hall now represents Argentina …".
  - [ ] Sign in as **Ruby** (`walk.ruby.hall@example.test`) → she has a notification and
        can see her seat.
  - [ ] Papers tab: open **Zoe's** paper → a draft both can write. Type a sentence. In a
        second browser, as **Zoe** (`walk.zoe.adams@example.test`), open the same paper
        → she sees Andrew's text, and only she can submit it.
- [ ] **Watch:** as **Sofia Rossi** (`walk.sofia.rossi@example.test`), who withdrew her own
      application, open `/join/NRTHBG42`. Can she join, or is she told to withdraw the
      application she already withdrew?
- [ ] As **Isla** (`walk.isla.fraser@example.test`, in Riverside's delegation): open
      `/join/NRTHBG42` → "You are already in the Riverside Grammar School delegation for …"
      with a link to it. The conference page says "You are part of the … delegation."
      instead of offering to apply, and typing
      `/conferences/northbridge-applications-open/apply` is refused the same way.

### 4.6 A delegate before the conference

Sign in as **Maya** (`walk.delegate.upcoming@example.test`), Canada in the Human Rights
Council of "about to start".

- [ ] `/home` leads with the conference: "4 days / to go" and her seat "Canada / HRC" with
      its flag. The paper is due first, so the next step is "Submit position paper (HRC)"
      with the one button "Write paper", and "To do" has "Pay invoice
      northbridge-about-to-start-0001" with the link "Pay invoice". "Programme" lists the
      first events, with "Full schedule".
- [ ] **Watch:** the chair sent her paper back for changes, so it is owed again: a task
      with "Write paper", and no "Handed in" figure in the hero. Is that so?
- [ ] The bell shows unread notifications. Open one → it takes you to the right page and
      is now read.
- [ ] Her committee page → download the HRC background guide (a PDF).
- [ ] "Position paper" → "Changes requested" and Samuel's comment. Try uploading a file
      that is not a PDF → refused. Then choose a PDF with "Replace position paper" → it is
      sent at once, with no second button, and the paper shows "Awaiting review".
- [ ] `/invoices` → 0001, £45, unpaid, with how to pay. (There is no card payment; see
      section 5.)
- [ ] `/conferences/northbridge-about-to-start/announcements` → the announcements meant
      for her (everyone, her committee, delegates), but not the staff one or Harbour
      View's.
- [ ] `/schedule` and the conference's schedule → the events for delegates, not the
      chairs' briefing.
- [ ] `/committees` and `/resources` list her committee and files.
- [ ] As **Felix** (`walk.felix.schmidt@example.test`), Germany in DISEC: "Position paper"
      → the editor opens on the draft he saved. Write a paragraph → "Submit for review".
- [ ] As **Sofía** (`walk.sofia.hernandez@example.test`): her written paper is waiting;
      "Remove position paper" is offered until the deadline. **Don't press it**: Samuel
      reviews it next.

### 4.7 Chair: position papers

Sign in as **Samuel** (`walk.chair.upcoming@example.test`), chair of HRC.

- [ ] `/home` leads with the conference: "Chair of HRC", the figure "3 / papers to
      review", the next step "Review 3 position papers (HRC)" (Japan, Mexico, and the one
      Maya sent in 4.6) and the one button "Review papers" → the papers page.
- [ ] **Japan** (PDF): "Open PDF" → the file opens.
- [ ] **Mexico** (written in the app): "Read the paper" → a clean reading page with a word
      count. It is HRC's only written paper, so the page says "This is the committee's
      only written paper." instead of "← Previous paper" / "Next paper →". "Request
      changes" with a comment → sign in as Sofía → the comment and a notification.
- [ ] "Approve" Japan → it can no longer be changed.
- [ ] "Approve all awaiting review" → Maya's new paper is approved too.
- [ ] Replace the background guide with any PDF.

### 4.8 Invitations

Nothing is emailed: an organiser copies the link and sends it. A person who already has an
account also finds it in their bell.

- [ ] As **Eleanor**, "about to start" → Team → "Pending invitations": Noor's shows
      "Volunteer · expires …"; `late.volunteer@example.test`'s carries an "Expired" badge.
      **Don't press "Send again"** yet (4.15 does).
- [ ] Signed in as **James**, open Noor's link, `/invites/WalkInviteVolunteerNoorRahman001`
      → "This invite was sent to walk.newcomer@example.test …" and Accept is disabled.
- [ ] As **Noor** (`walk.newcomer@example.test`): finish `/welcome`, then the bell →
      "Marcus Adeyemi invited you to Northbridge MUN (about to start) as volunteer" → open
      it → "Accept invite" → she is on the team.
- [ ] Signed out, open **`/invites/WalkInviteOrganisationMember0002`** → it offers to
      create an account for `new.admin@example.test`. Do so, finish `/welcome` → accept →
      she is an admin of Northbridge MUN Society.
- [ ] Signed out, open **`/invites/WalkInviteChairEconomicSocial003`** → create
      `guest.chair@example.test` → accept → she lands in the ECOSOC chair room.
- [ ] As **Tom** (`walk.volunteer.live@example.test`), open
      **`/invites/WalkInviteAcceptedTomHughes00005`** → "This invite was already used."
- [ ] Signed out, open **`/invites/WalkInviteExpiredVolunteer000004`** → create
      `late.volunteer@example.test` and finish `/welcome` → "This invite expired on …".

### 4.9 Organiser: set up and publish a conference

Sign in as **Eleanor** (`walk.organiser@example.test`).

- [ ] `/manage` lists her five conferences, each with its phase. "applications open" says
      "4 to review" (Aarav, Mei, Ethan, and Grace, who sent hers in 4.4); the draft shows
      how far its checklist is.
- [ ] Open **Northbridge MUN (draft)** → the dashboard's "Before you publish" checklist.
- [ ] Committees → UNEP → add seats ("Add Security Council", or "Paste names"). Add a topic.
- [ ] Details: fill in the description, tagline, banner, venue and contact email.
- [ ] Application form: set opening and closing dates. Add one question of each type, mark
      one required, reorder them with drag and drop, then "Preview apply page".
- [ ] Fees: choose "Outside MUNMeet", write payment instructions, add a fee.
- [ ] Dashboard → "Publish conference" → it now appears in `/conferences`.
- [ ] "Unpublish conference" → it disappears again.
- [ ] Make a brand-new conference from the menu under your name, "Create a conference" →
      it starts as a draft. "Delete draft" asks you to type a word to confirm.

### 4.10 Organiser: the dashboard in each phase

As **Eleanor**, open each dashboard and judge whether it shows what an organiser needs at
that moment:

- [ ] Draft → the checklist.
- [ ] Applications open → "Needs attention" (applications and delegations to review),
      figures, "Waiting for a decision".
- [ ] About to start → unpaid invoices, empty seats, committees.
- [ ] Running today → "Rooms", all four committees, with who is present in each, "Today",
      "Open chair room".
- [ ] As **Inês** (`demo.organiser@example.test`), Lisbon (finished) → the Awards card.

### 4.11 Organiser: applications

As **Eleanor**, "Northbridge MUN (applications open)" → Applications.

- [ ] The tabs (Under review, Waitlisted, Accepted, Not accepted, Withdrawn) hold the
      right people: Aarav, Mei, Ethan and Grace are under review, and your account's
      application is withdrawn beside Sofia Rossi's. Try search, the committee filter,
      sorting, and the Board view.
- [ ] Open **Ethan's** application → "This conference is for delegates aged 14 to 25." It
      warns but does not block.
- [ ] Open **Aarav's** → his answers to the questions (he left "Name for your placard"
      blank). Add an internal note.
- [ ] "Accept and allocate" Aarav into a free ECOSOC seat. Check that the **European
      Union** observer seat is not offered → "Aarav Patel is now … in …". Sign in as Aarav
      → a notification, and `/home` leads with the conference, his seat and its flag among
      the hero's figures.
- [ ] Bulk: tick **Mei** and **Grace** → "Waitlist" → each is told.
- [ ] "Not accepted" for **Ethan**, with a reason → he is told.
- [ ] "Revoke acceptance" on **Jakub** → the seat is freed.
- [ ] "Export CSV" opens in a spreadsheet with sensible columns.

### 4.12 Organiser: delegations and seats

- [ ] As **Eleanor**, "applications open" → Delegations → **Riverside Grammar School**:
      tick seats, "Accept and allocate …" → "… No fee applies, so no invoice was created."
      (this conference has no fees). Sign in as Daniel → a notification and his seats.
- [ ] If Rachel sent **St Aidan's** in 4.5, it is waiting too: mark it "Not accepted" with a
      reason → Rachel sees the reason. (A delegation still forming is not shown to
      organisers, and one with seats can no longer be turned down.)
- [ ] "about to start" → Allocation. Stay in **DISEC**, and leave HRC and Harbour View
      College's three seats (Argentina, Indonesia, Nigeria) alone: later steps need them.
      Move **Louis Bernard** from France into the empty **India** seat. "Hide the seat" on
      the now-empty France, then "Make it available again". Drag Felix onto Amani to swap
      them, then swap them back. Last, "Free the seat" on India → the page tells you what
      happens to Louis's paid invoice.
- [ ] "about to start" → Delegations → Harbour View College → remove its **Argentina**
      seat → refused: "Unassign the member first, or ask the head to." (Ruby has had it
      since 4.5.) Sign in as **Andrew**, Seats tab → "Unassign" Ruby. Back as Eleanor,
      remove the seat again → it goes, and invoice 0009 is cancelled and reissued for the
      two seats left (£80).
- [ ] Participants: filter by committee, invoice and paper; "Export CSV".

### 4.13 Organiser: fees and invoices

As **Eleanor** or **Marcus** (`walk.organiser.upcoming@example.test`), "about to start" →
Fees.

- [ ] The invoice list shows paid, unpaid, waived and cancelled invoices, including the
      two you just caused in 4.12. Totals at the top add up.
- [ ] "Mark as paid" on **0001** (Maya) → sign in as Maya → "Payment received for …"
      notification, and the invoice shows paid.
- [ ] "Waive" 0005 (Amani) with a note → it cannot be undone.
- [ ] "Void" Harbour View College's new unpaid invoice → shown as "Cancelled".
- [ ] Look at how a paid invoice would be refunded → there is no refund button (see
      section 5).

### 4.14 Organiser: announcements, schedule, documents

- [ ] Announcements (Eleanor, "about to start"): "Preview recipients" for each audience
      (Everyone, Delegates, Staff, One committee, One delegation) → sensible numbers.
      Publish one to HRC → sign in as Maya → it is in her bell. Pin, edit and delete the
      one you made.
- [ ] Schedule (Eleanor, **running today**): edit tonight's **Delegates' social** and move
      it by an hour → "Its audience has been notified." Sign in as James → a "Delegates'
      social moved to …" notification. Only a move whose old or new time falls within the
      next 24 hours notifies, so once the social has started, move the **Closing
      ceremony** instead.
- [ ] Schedule ("about to start"): add an event for one committee, "Duplicate to next
      day", "Add committee sessions", delete an event.
- [ ] Documents ("running today"): upload a resource for "Staff" only → Tom (volunteer)
      sees it on `/resources`, but James does not. Upload a background guide for
      "Everyone" → it now shows to a visitor (4.1).
- [ ] Documents ("about to start") → Position papers: approve Felix's (from 4.6) and
      request changes on Kenya's.

### 4.15 Organiser: the team and the organisation

- [ ] Team (Eleanor, "about to start"): invite a chair by email for DISEC → a link to copy
      (nothing is emailed). Change Noor's role and title (she joined in 4.8).
- [ ] "Pending invitations": `late.volunteer@example.test`'s expired one → "Send again" →
      a new link. Sign in as `late.volunteer@example.test` (made in 4.8), open the new link
      → "Accept invite" → on the team.
- [ ] As **Marcus** (`walk.organiser.upcoming@example.test`): `/manage` → only "about to
      start", under "Conferences you help with". Open `/manage/northbridge-running-today`
      → not found.
- [ ] As **Priya** (`walk.org.admin@example.test`), an admin of the society but on no team:
      what can she open and change? `/manage/organizations/…` (from `/manage`,
      "Organisation settings") → members, roles, invite a member, the payments card.
- [ ] Organisation settings as Eleanor: invite `someone@example.test` as a member, revoke
      it; try to remove the last owner → refused.
- [ ] **Watch:** invite **Ben** (`walk.ben.carter@example.test`, who has an account) as a
      plain "Member". Sign in as Ben → accept it from his bell → what can he open and
      change under `/manage`?
- [ ] The public organisation page (`/organizations/…`, "View public page") lists its
      upcoming conferences.

### 4.16 Chair: opening a session from the start

Sign in as **Nadia** (`walk.nadia.haddad@example.test`), chair of the Third Committee.
Open `/conferences/northbridge-running-today/committees/sochum/chair`. Its session has
just started and nothing has happened yet. You can only see this once, so go slowly.

- [ ] The room shows "Open the session": 1. Roll call, 2. Agenda, 3. General Speakers'
      List.
- [ ] **Watch, before the roll call:** every seat counts as present until a roll call is
      taken. Look at the speakers' list: could you add a seat that is not in the room?
- [ ] "Take it seat by seat": mark one seat absent, one "Present", the rest "Present and
      voting" → the top bar shows "Present n/5" and whether the quorum is met.
- [ ] Choose a topic → "Set agenda".
- [ ] The speakers' list is empty: add a speaker, then "Call …" them → the room is
      running.

### 4.17 Chair: running the Security Council, and the delegate's view

This is the centre of the app, and most of it can only be done once. Read the whole group
before you start. The Security Council's papers (section 3) wait for 4.24 to 4.30: here,
vote on nothing that the vote form's "On" list names.

Set up three screens:

- **Fiona** (`walk.chair.live@example.test`) on the computer:
  `/conferences/northbridge-running-today/committees/unsc/chair`.
- **James** (`walk.delegate.live@example.test`) on your phone, or a second browser:
  `/conferences/northbridge-running-today/committees/unsc/live`.
- **Wei** (`walk.wei.zhang@example.test`, China) in a private window, on the same live
  address.

**Before you press anything**

- [ ] James's screen shows the agenda, who is present, "Live", China speaking and the
      paused timer, and "You are 1st in the list." A quiet line says "Waiting for you ·
      Amendment 7 to Draft resolution 1.2"; leave it for 4.29.
- [ ] Wei's screen, while he is the one speaking, makes that clear to him.

**Speakers**

- [ ] China is speaking and the timer is paused at 0:52. "Resume" → it counts down, on
      every screen.
- [ ] "Add 15s", "Pause", "Reset".
- [ ] "Add speaker": search "Russian" → "Add", then "Move to top" → James's screen says
      "2nd". "Remove" the Russian Federation → "1st" again. Try dragging Brazil above the
      United Kingdom and back.
- [ ] "Next speaker" → the United Kingdom. James's screen says "You are speaking."
- [ ] "Yield" → "Yield to another seat" → pick a seat → "Yield time". The seat gets the
      rest of the speaker's time.
- [ ] "List settings and caucus lists" → change the speaking time, "Close list", "Open
      list".

**Motions**

- [ ] Motions tab: Brazil's moderated caucus "Opening humanitarian corridors" is on the
      floor, and James's screen shows it. Enter For 4, Against 1 → "Vote" → "Motion
      passed." The room is now in a moderated caucus with its own speakers' list and a
      10-minute clock.
- [ ] Add speakers to the caucus and press "Next speaker". **Watch:** can you still see how
      much of the caucus's 10 minutes is left once someone speaks?
- [ ] "Return to GSL" (Room page), or "Return to formal debate" (Motions tab) → back on
      the General Speakers' List.
- [ ] Add and vote on other motions: an unmoderated caucus, "Suspend the meeting", "Close
      debate", a motion that fails, one withdrawn. With several motions on the floor, the
      ones that are not first in order carry an "Out of order" badge. Is the order right?
- [ ] Room page → "Unmoderated caucus" → 5 minutes → "Start caucus".

**Suspend and resume**

- [ ] "Suspend" → James's screen says the session is suspended. "Resume session".
- [ ] **Watch:** suspend while a speaker's timer runs. Does the timer stop? Suspend during
      a caucus, then resume. Is the caucus still running?

**Votes**

- [ ] Voting tab: open a vote. "On" lists "Amendment 11 to Draft resolution 1.2" (and the
      draft itself once "Close debate" has passed): choose "Other" instead and type
      "Straw poll", then Simple majority, **Show of hands** → "Open vote" → James's screen
      shows a vote in progress. Enter the counts → "Close vote: passes" (or "fails") →
      "Passed" or "Failed".
- [ ] Open a second vote by **Roll call**, again on "Other". Press For, Against or Abstain
      for each seat → "Close vote". Seats that answered the roll call "Present and voting"
      cannot abstain, so only the Russian Federation can press Abstain.
- [ ] **Watch James's screen during the roll-call vote.** Does the tally, and his own
      "Your vote", update as Fiona presses each seat, or only after he reloads?
- [ ] "Cancel vote" on an open vote → nothing is recorded.

**Losing the connection**

- [ ] On James's device, turn the internet off (flight mode on a phone) → "Live updates
      paused. Refresh to catch up." Turn it back on and press "Refresh" → up to date again.

**Notes and awards**

- [ ] Room page → "Chair Notes": type → it saves by itself. Sign in as **Eleanor** in the
      private window (instead of Wei), open the same chair room and edit the notes at the
      same time → you are asked which version to keep.
- [ ] Notes tab → a note on one seat → only chairs and organisers can see it.
- [ ] Awards tab → propose "Best Delegate" for a seat. You see Fiona's two earlier
      proposals (France, Brazil's "Best Newcomer"). "Edit" and "Withdraw" the one you just
      made; leave Fiona's two for 4.19.

**Ending and the next session**

- [ ] **Watch:** open a vote and leave it open. "End session" → confirm → James's screen
      says it has ended. Is the open vote closed, or lost?
- [ ] The room offers "Start Session 2" → press it → a fresh session with its own roll call.
      James's screen follows.
- [ ] Notes tab → "Session notes" → **Practice session** (with Fiona's notes), **Practice
      session 2**, **Session 1** (with whatever you wrote) and **Session 2**.
- [ ] Motions tab → "Earlier sessions" → the practice session's motions (passed, failed,
      withdrawn), read-only, and Practice session 2's three motions to introduce a
      document, all passed.

### 4.18 Volunteer

Sign in as **Tom** (`walk.volunteer.live@example.test`).

- [ ] `/home` leads with the running conference: "Running now · day 2 of 3", "Volunteer",
      the one button "View conference" with "Today's programme" beside it, and the
      "Today's programme" section with the rest of the day's events. `/schedule` shows the
      conference and its events.
- [ ] As Eleanor, post an announcement to "Staff" at "running today" → Tom sees it, James
      does not.
- [ ] He can open a committee's live view (`…/committees/unsc/live`).
- [ ] **Watch:** is there a button on the committee page that takes him to the live view,
      or does he have to know the address?
- [ ] **Watch:** open the chair room (`…/committees/unsc/chair`) → "Error 404: This
      committee does not exist." Is that the right message for a volunteer?

### 4.19 Awards, from proposal to profile

- [ ] As **Eleanor**, "running today" → Awards: Fiona's proposals are there. "Confirm"
      France's, "Unconfirm", "Delete" Brazil's; add one yourself under "Add award".
- [ ] **Watch:** the conference is still running. Should "Publish awards" be allowed yet?
      Try it → recipients get "You received … in …" and see it on `/profile`. "Unpublish".
- [ ] As **Inês** (`demo.organiser@example.test`), Lisbon → Awards: "Published …
      Delegates can see their awards on their profile.", with no edit buttons until you
      press "Unpublish". **Don't press it.**

### 4.20 Notifications

- [ ] As **Andrew** (`walk.head.upcoming@example.test`): the bell shows the latest eight.
      "See all" → `/notifications`, grouped by day.
- [ ] Click one → it opens the right page and is marked read.
- [ ] "Mark all as read" → the badge disappears. "Remove" one.
- [ ] Use the table at the end of section 3 to open **one notification of every kind**
      and check its wording and where it takes you. Some will be read already, because
      earlier steps opened them.

### 4.21 The finished conference

- [ ] As **Beatriz** (`demo.delegate@example.test`): `/home` ("Find your next conference",
      since Lisbon is over), `/committees` ("Show past conferences"), the Lisbon committee
      page with its awards, her paper and invoices.
- [ ] As **Daniel Okoro** (`demo.chair@example.test`): the Lisbon Security Council chair
      room. Its three sessions have ended; the Motions tab ("Earlier sessions") holds
      Session 1's motions and the Notes tab the per-seat notes.
- [ ] **Watch:** the room still says "Ready to start" and offers "Start Session 4", although
      the conference ended two weeks ago. Should it? **Don't press it.**
- [ ] As **Catarina** (`demo.head@example.test`): her delegation after the conference.
- [ ] Last, as **Inês**: "Archive conference". What changes on `/manage`, and what does
      Beatriz still see afterwards?

### 4.22 On a phone, and without JavaScript

- [ ] On your phone, repeat a few steps of your choice: sign up and apply to a conference,
      read a notification, move to the next speaker in Fiona's room, read a paper as
      Samuel. The menus, tables and buttons should all be usable with a thumb.
- [ ] Optional: turn JavaScript off in the browser settings and submit a form or two. The
      app is meant to still work, only with a page reload.

### 4.23 Roles: who sees what

Three people at "about to start" hold the roles it made for itself (section 3). Each one
should see the pages their role opens and nothing else.

- [ ] As **Olivia** (`walk.usg.upcoming@example.test`), USG delegate affairs: `/manage` →
      only "about to start". The sidebar has Applications, Delegations, Participants, Fees
      and Announcements, and no Details, Committees, Team, Schedule or Documents. The
      participants show email, phone, date of birth, dietary needs and emergency contact.
      Fees shows the invoices with no way to mark one paid.
- [ ] As **Rohan** (`walk.finance.upcoming@example.test`), Finance: the sidebar has
      Details, Application form, Fees and Participants. On Fees, invoice 0005 (Amani) offers
      "Mark as paid" (don't press it). The participants show email and phone, but no
      date of birth, dietary needs or emergency contact.
- [ ] As **Ellie** (`walk.desk.upcoming@example.test`), the registration desk: the sidebar
      has only Participants. They show the welfare details and no email or phone. Open
      `/manage/northbridge-about-to-start/fees` → not found.
- [ ] As **Maya** (`walk.delegate.upcoming@example.test`), a delegate there, open
      `/conferences/northbridge-about-to-start`: the team lists Eleanor, Marcus, Olivia with
      her title, Samuel and Nadia. Rohan and Ellie are not on it, because their roles are
      not public. Signed out, the page shows no team at all.
- [ ] As Eleanor, Team → Roles: the order is Organiser, USG delegate affairs, Finance,
      Registration desk, Chair, Volunteer. Open Finance → its five permissions are ticked.
      **Watch:** tick "Shown on the conference’s team page" and save → Rohan joins the
      team list Maya sees. Untick it again.

### 4.24 Papers: writing together

The Security Council's papers, at "running today" (section 3). Groups 4.24 to 4.30 follow
one committee day, so do them in order; each starts with the steps that only look. Every
address below starts with `/conferences/northbridge-running-today/committees/unsc`.

Set up three screens, all on `…/resolutions`:

- **James** (`walk.delegate.live@example.test`, the United Kingdom) on the computer.
- **Camille** (`walk.camille.dubois@example.test`, France) in a private window.
- **Emily** (`walk.emily.johnson@example.test`, the United States) on your phone, or a
  second browser.

**Look first**

- [ ] The page lists "Yours", "Open for signatures", "Introduced" and "Resolutions". As
      James, "Yours" holds "Protecting medical care in armed conflict" (being written) and
      Draft resolution 1.2 (introduced).
- [ ] Open "Protecting medical care in armed conflict" on all three screens. The authors
      are the United Kingdom (Lead), France and the United States, and each screen says
      who else is editing ("Camille is editing").
- [ ] Clause 2 shows Emily's suggestion, struck and inserted words, and two passages are
      marked for comments. Leave those three alone until 4.25.

**Then change it**

- [ ] As James, type a new clause 4 → it appears on Camille's and Emily's screens as he
      types, and the line under the title ends in "Saved".
- [ ] Camille and Emily both type in clause 4 at the same moment → nobody's words are
      lost.
- [ ] Use the toolbar: italics on a preambulatory phrase, underline on an operative one.
- [ ] As James, "Add an author" → Brazil → Gabriel (`walk.gabriel.santos@example.test`)
      gets a notification and the paper is in his "Yours".

### 4.25 Papers: comments and suggestions

The same three screens, on the same paper.

**Look first**

- [ ] The margin holds four threads: Camille's question on "medical workers, their
      transport and their facilities" with James's answer; Emily's on "Gravely
      concerned", folded to one line with "Resolved by James Wilson"; Camille's on Emily's
      suggestion; and Emily's on the whole paper, "Ready to submit once the emblems clause
      is in?".
- [ ] Emily's suggestion is a card of its own: "Replace ‘six’ with ‘three’", with "Accept"
      and "Reject" on James's and Camille's screens, and "Withdraw" on hers.

**Then change it**

- [ ] As Camille, "Reply" in her own thread → James sees the reply arrive without
      reloading.
- [ ] As James, "Resolve" that thread → it folds to one line. "Reopen" Emily's.
- [ ] Select a few words of clause 1 → "Comment" → type → "Comment" → the new thread sits
      beside the words. "Comment on the whole paper" adds one with no words marked.
- [ ] As Emily, switch "Editing" to "Suggesting" and delete a word of clause 3 → the
      deletion shows as a suggestion on every screen, with her name.
- [ ] As James, "Accept" Emily's "six" to "three" → the text reads "every three months",
      and Camille's thread on it stays. Leave Emily's new suggestion open for 4.26.
- [ ] **Watch:** with a comment and a suggestion on the same words, is it clear which
      card is which?

### 4.26 Papers: signing and submitting

**Look first**

- [ ] As James, `…/resolutions` → "Open for signatures" → "Consent of the host State"
      (China and the Russian Federation). The text is read only, with "Sign as United
      Kingdom".
- [ ] As **Wei** (`walk.wei.zhang@example.test`, China, its lead), the same paper is his
      to edit, with its format checks and "Enough support to submit": its two authors
      are the two seats it needs.

**Then change it**

- [ ] As James, "Sign as United Kingdom" → the United Kingdom is among its signatories.
      "Remove my signature" → it is gone. Sign again.
- [ ] As Wei, "Close signatures" → reload James's page: it no longer offers to sign.
      "Open for signatures", then "Close signatures" again.
- [ ] As Wei, "Submit to the dais" → "Submit “Consent of the host State” to the dais?" →
      confirm → "“Consent of the host State” is with the dais." Nobody can edit it now.
- [ ] As James, on "Protecting medical care in armed conflict", "Submit to the dais" while
      Emily's suggestion is still open → "Accept or reject the open suggestion before
      submitting." "Back to the paper" → "Reject" it → "Submit to the dais" → confirm.

### 4.27 Papers: the dais's review

Sign in as **Fiona** (`walk.chair.live@example.test`) and open the chair room
(`…/chair`). The committee menu at the top right → "Resolutions".

**Look first**

- [ ] The page has "Submitted" (the two papers from 4.26), "Amendments", "Approved, not
      introduced", "Introduced" (Working paper 1.1 and Draft resolution 1.2) and "Decided"
      (Resolution 1.1).
- [ ] "Amendments" is the dais's queue: amendment 9 first, amendment 10 second, each with
      its draft, who proposed it, "Unfriendly", and "Move up" and "Move down".

**Then change it**

- [ ] Open "Protecting medical care in armed conflict" → "Return to the authors" → type
      under "What should change" → "Return to the authors" → as James, the paper is
      "Returned with notes" and Fiona's words sit above the text. He can write again.
- [ ] As James, change a word and "Submit to the dais" again.
- [ ] As Fiona, open it again → "Approve as Working paper 1.2" (the small "Number" box
      beside it says 1.2) → it moves to "Approved, not introduced".
- [ ] Open "Consent of the host State" → "Approve as Draft resolution 1.3".
- [ ] **Watch:** change the number box to one already taken, such as 1.1, and approve →
      is the refusal clear?

### 4.28 Papers: introducing, and the projector

Fiona in the chair room, with **"Display"** (top bar) open in a window of its own, the
projector's view. James on `…/live`. The room is in Session 2, which 4.17 started; if you
skipped 4.17 it is Session 1, and everything works the same.

**Look first**

- [ ] The Display shows the room: nothing is on screen until the dais puts a paper there.

**Then change it**

- [ ] Session 2 needs its roll call first: take it, seat by seat or all at once.
- [ ] Motions tab → "Record a motion" → "Document" → "Paper" → "Working paper 1.2" →
      "Raised by" the United Kingdom → "Add to floor". Enter For 5, Against 0 → "Vote" →
      "Motion passed." → the paper is introduced and the Display shows it at once. James's
      screen links to it.
- [ ] On the paper's page in "Resolutions", "Next clause" and "Previous clause" → the
      Display follows, clause by clause, and the page says what is "On screen". "Take off
      screen" → the Display shows the room again.
- [ ] As James, open Working paper 1.2 → its threads are read only, "Closed when the paper
      was introduced."
- [ ] **Watch:** does it read well on a real projector, from the back of a room?

### 4.29 Papers: amendments

Draft resolution 1.2, "Humanitarian pauses", has eleven amendments, one in every state
(the table in section 3). Its sponsors are the United Kingdom (James), France (Camille)
and the United States (Emily). Open it from `…/resolutions` → "Introduced".

**Look first**

- [ ] As James, the margin is headed "Amendments" with their count. Each card says what
      it does and its state, in words: "Written in", "Lapsed", "Passed", "Failed", "Out of
      order" (with the dais's reason), "Withdrawn", "Asking the sponsors", "Collecting
      support", "With the dais" and "Waits for its vote".
- [ ] Above them, "Waiting for you: amendment 7". Its card says France accepted it and
      offers James "Accept as friendly" and "Decline".
- [ ] Amendment 8 says how many seats support it and how many it needs; amendments 3 and 4
      show how their votes went.
- [ ] As **Ivan** (`walk.ivan.petrov@example.test`, the Russian Federation), his
      amendments 8 and 10 offer "Withdraw". To every other delegate, amendment 8 offers
      "Support".

**Then change it**

- [ ] As James, amendment 7 → "Accept as friendly" → "You accepted amendment 7 as
      friendly." As Emily, the same → it goes to the dais as "Friendly", and Wei (its
      proposer) sees the answers arrive.
- [ ] As Wei, amendment 8 → "Support" → "You support amendment 8." With its proposer that
      is two seats, so it goes to the dais.
- [ ] As Gabriel, "Propose an amendment" → "Change a clause" → "Which clause" → clause 2 →
      "The clause as amended" → type → "Propose amendment" → amendment 12, "Asking the
      sponsors". As James, "Decline" → "You declined amendment 12. It is now unfriendly."
      → it collects support. As Ivan, "Support" → it goes to the dais.
- [ ] As Gabriel, propose another, "Add a clause" this time → on its card, "Collect
      support instead" → "Amendment 13 now collects support as unfriendly." Then
      "Withdraw" → "Withdraw amendment 13?" → "Withdraw amendment" → "Amendment 13
      withdrawn."
- [ ] As Fiona, chair room → committee menu → "Resolutions" → "Amendments": 9, 10, 7, 8
      and 12 in order. "Move up" and "Move down" → "Amendment 7 moved."
- [ ] Open Draft resolution 1.2 there. Amendment 7 → "Approve" → "Amendment 7 approved
      and written in." → clause 2 now reads China's words. Amendment 9 → "Approve" →
      "Amendment 9 approved. It waits for its vote."
- [ ] Amendment 10 → "Rule out of order" → "Rule amendment 10 out of order?" → type under
      "Why it is out of order" → "Rule out of order" → as Ivan, the card says "Out of
      order" with Fiona's reason. Leave 8 and 12 with the dais.
- [ ] **Watch:** with several cards answered at once, is it always clear which amendment
      a toast speaks of?

### 4.30 Papers: voting, and the record copy

Fiona in the chair room with the Display open, as in 4.28.

**Look first**

- [ ] `…/resolutions` → "Resolutions" → Resolution 1.1, "Aid convoys and checkpoints" →
      "Record copy". It reads "Adopted on … by 5 votes to 0, with 1 abstention.", then
      the text, then "Amendments": China's "Friendly; written in on …", the Russian
      Federation's "Passed, 4 to 1, with 1 abstention; now clause 3" and China's "Failed,
      2 to 3, with 1 abstention". The foot says "Record copy, printed from MUNMeet on …".
- [ ] "Print" → the browser's print dialog opens.

**Then change it**

- [ ] Voting tab → "On" lists "Amendment 9 to Draft resolution 1.2" and "Amendment 11 to
      Draft resolution 1.2", then "Other". The draft itself is not there yet.
- [ ] "Amendment 11 to Draft resolution 1.2", Simple majority, Show of hands → "Open vote"
      → the Display shows "Voting on amendment 11 · Draft resolution 1.2", "Change clause
      1", "Proposed by China · Unfriendly", the clause as amended and the counts.
- [ ] Enter For 4, Against 1, Abstain 1 → "Close vote: passes" → the Display says
      "Amendment 11 passes". The draft's clause 1 now reads China's words, and its card
      says "Passed".
- [ ] Vote on amendment 9 by roll call so that it fails → its card says "Failed".
- [ ] Motions tab → "Record a motion" → "Close debate" → pass it → Voting tab → "On" now
      lists "Draft resolution 1.2". Vote on it so that it passes → amendments 8 and 12,
      still with the dais, become "Lapsed".
- [ ] `…/resolutions` → it is now "Resolution 1.2" under "Resolutions". Its record copy
      lists amendments 1, 3, 4, 7, 9 and 11, and not those that lapsed, were withdrawn or
      were ruled out of order.
- [ ] **Watch:** is it clear on the Voting tab why the draft is not in "On" before debate
      is closed?

### 4.31 Papers: a THIMUN committee

ECOFIN follows THIMUN procedure (section 3). Every address starts with
`/conferences/northbridge-running-today/committees/ecofin`.

**Look first**

- [ ] As **Arjun** (`walk.arjun.rao@example.test`, India), `…/resolutions` → "Debt pauses
      after natural disasters": its people are "Submitters", India the "Main submitter"
      and Nigeria a co-submitter, with Barbados signed. "Start a paper" offers no working
      paper.
- [ ] As **Eleanor**, `/manage/northbridge-running-today` → Committees → Economic and
      Financial Committee → "Resolutions": friendly amendments off, an unfriendly
      amendment needs no support, preambulatory clauses not amendable, amendments to
      amendments on. "Start from" offers North American or THIMUN.
- [ ] As **Pieter** (`walk.chair.thimun@example.test`), the chair room offers "Start
      Session 1". Committee menu → "Resolutions" → "Submitted" holds the draft.

**Then change it**

- [ ] As Pieter, open the draft → "Approve as Draft resolution 1.1".
- [ ] "Start Session 1" → take the roll call → set the agenda.
- [ ] Motions tab → "Record a motion" → "Document" → "Paper" → "Draft resolution 1.1" →
      "Raised by" India → "Add to floor" → pass it.
- [ ] As **Keisha** (`walk.keisha.bynoe@example.test`, Barbados), "Propose an amendment"
      → "Change a clause" → … → "Propose amendment" → nobody is asked: it goes straight
      to the dais, "With the dais".
- [ ] As **Chidi** (`walk.chidi.okonkwo@example.test`, Nigeria), Keisha's card → "Amend
      this amendment" → "Its words as amended" → "Propose amendment" → amendment 2, to
      amendment 1, with the dais too.
- [ ] As Pieter, approve both → Voting tab → "On" lists "Amendment 2 to Draft resolution
      1.1" before "Amendment 1 to Draft resolution 1.1": the amendment to an amendment is
      voted first. Vote on both, then "Close debate" and the draft.
- [ ] **Watch:** with THIMUN's words, does anything still say "sponsor"?

### 4.32 Papers: the crisis desk

ExComm is a crisis committee (section 3). Every address starts with
`/conferences/northbridge-running-today/committees/excomm`.

**Look first**

- [ ] As **Ahmed** (`walk.crisis.staff@example.test`), the committee page offers "Answer
      directives" → the crisis staff's page: "Waiting for an answer" (Committee directive
      1.1, "Two squadrons to Florida", "No decision has been taken"), "Crisis update" (the
      Poltava, "On the room's screens since 16:40") and "Answered" (the reconnaissance
      flights, carried out; the private meeting, refused; the OAS press release,
      published).
- [ ] As Ahmed, open `…/chair` → not found. He answers directives; he does not chair.
- [ ] As **Thomas** (`walk.thomas.reid@example.test`, the Secretary of Defense),
      `…/live` shows the crisis update. "Directives" → "Two squadrons to Florida" says
      "With the crisis staff".
- [ ] As **Jonah** (`walk.jonah.levy@example.test`, the Attorney General), his private
      meeting says "Refused", with the crisis staff's answer under "Crisis staff · …".
- [ ] "Directives" → "Press releases" lists the OAS one, for everybody in the committee.

**Then change it**

- [ ] As Ahmed, Committee directive 1.1 → type under "What happens" → "Carry out" → it
      moves to "Answered". As **Catherine** (`walk.chair.crisis@example.test`), its page
      shows the answer.
- [ ] "Two squadrons to Florida" → "Refuse" → Thomas gets a notification and sees
      "Refused".
- [ ] "No decision has been taken" → "Publish" → it joins "Press releases".
- [ ] "Update for the room" → type a new update → "Send update" → Thomas's live view and
      the Display show it at once. Empty the box → "Send update" → "The room shows no
      update."
- [ ] As **Lena** (`walk.lena.hoffmann@example.test`, the Secretary of State),
      "Directives" → "Start a paper" → "Personal directive" → "Start writing" → write it
      → "Send to the crisis staff" → "Send “…” to the crisis staff?" → confirm → it is on
      Ahmed's list, and Lena can no longer change it.

---

## 5. Known limits (please don't report these as bugs)

These are known and planned. Tell us if one of them bothers you in practice.

- **No card payments and no refunds.** An organisation can start connecting a Stripe
  account ("Connect Stripe"), but paying an invoice by card (task T32) and refunds (task
  T68) are not built yet, and the organisation page may say "Stripe is not set up on this
  server yet." instead of offering the button. Every invoice is
  paid outside the app and the organiser presses "Mark as paid". Some messages already
  mention refunds, but there is no refund button yet.
- **Emails stay on the test server.** Password reset and changing your email address
  cannot be finished on the test site (section 1).
- **No emails for invitations.** Invitations are links the organiser copies and sends.
- **No email notifications.** `/settings` says "Email notifications are coming". Everything
  arrives in the bell.
- **Delegates do not vote in the app.** The chair records every vote, both show of hands
  and roll call.
- **Signing up needs no email confirmation** on the test site.
- **The site is reset every night** at 4am UK time, and what you changed is gone
  (section 1).
- **The terms and privacy pages** are placeholders a lawyer has not checked.
- **Suggesting needs JavaScript.** Without it, a paper is plain boxes saved with "Save
  changes" (for a draft resolution, the preambulatory clauses one per paragraph and the
  operative clauses as a numbered list), nobody else's typing appears as it happens, the
  comment threads are listed under the text with a reply form each, and a new comment is
  on the whole paper. While a paper has open suggestions, the plain form says how many and
  does not save, because saving would throw them away.
- **Amendments without JavaScript,** and on a phone, follow one another under the text
  instead of sitting beside their clauses. Every button on them still works, with a page
  reload.
- **Papers in a quick session.** A quick session is the chair's screen only and its
  delegates have no accounts, so it has no papers; its votes keep a typed subject.
- **Not built for papers yet:** a history of a paper while it is being written, mentioning
  somebody with "@" in a comment, voting a draft clause by clause, speakers for and
  against a draft, delegates voting from their own screens, and printing every resolution
  of a conference as one document.

---

## 6. Giving feedback

Write one entry per finding. The more exact it is, the faster it gets fixed.

```
### Short title (e.g. "Next speaker skips Brazil")

- Signed in as:   walk.chair.live@example.test
- Page:           /conferences/northbridge-running-today/committees/unsc/chair
- Checklist step: 4.17 Speakers, "Next speaker"
- When:           29 Sep, 14:05
- What I did:     Pressed "Next speaker" twice
- What I expected: The United Kingdom, then Brazil
- What happened:  The United Kingdom, then the list was empty
- Device:         laptop, Chrome / iPhone, Safari
- Screenshot:     (attach)
- How bad:        blocks me / annoying / cosmetic / idea
```

Things worth writing down besides bugs:

- **Confusing:** you did not know what a button would do, or where to go next.
- **Too many steps:** something common took more clicks than it should.
- **Wording:** a message that is unclear, wrong, or uses a different word for the same
  thing elsewhere.
- **Missing:** something a real organiser, chair or delegate would expect to find.

### Questions we'd like your view on

While testing, look out for these in particular. Reading the code suggests they may not
work as people expect:

1. During a moderated caucus, the caucus's total time and each speaker's time seem to share
   one clock. Once a speaker starts, can you still see how long the caucus has left? (4.17)
2. Does "Suspend" stop a running timer? Does suspending during a caucus end the caucus? (4.17)
3. Before any roll call, every seat counts as present. This was a deliberate choice; does it
   work in practice? "Mark all present" marks seats "Present", not "Present and voting". Is
   that the right default? (4.16)
4. Motions are decided by a majority of those present, but votes on the Voting page by a
   majority of the votes cast. Is that the rule your conferences use? Every vote is
   recorded as substantive; is a procedural vote ever needed?
5. "Close debate" puts the room into voting mode without opening a vote. Is that clear?
6. What happens to a vote that is still open when the session ends? (4.17)
7. During a roll-call vote, does the delegate's screen update as the chair records each
   seat? (4.17)
8. The votes of an ended session (such as the practice session's "Working paper 1") are
   kept, but no page shows them. Should a chair or organiser be able to look back at them?
9. A plain member of an organisation can manage all its conferences. Is that intended?
   (4.15)
10. Awards can be published while the conference is still running. Is that intended? (4.19)
11. Someone who withdrew their own application is still told to "withdraw that
    application first" when they try to join a delegation, and a delegation member cannot
    leave a delegation. (4.5)
12. The create-conference page spells it "organization"; everywhere else says
    "organisation". (4.9)
13. A position paper sent back for changes counts as a finished task on the delegate's
    home page. (4.6)
14. A finished conference's chair room still offers to start another session. (4.21)
15. Background guides can be for delegates only or for everyone. Should visitors see a
    committee's guide before they apply? (4.1)
16. The dais's approval writes a friendly amendment into the draft at once, with no vote.
    Is that how your committees take friendly amendments? (4.29)
17. A draft appears in the vote form only once "Close debate" has passed, while an
    approved amendment can be voted on at any time. Is that the order your committees
    vote in? (4.30, 4.31)
