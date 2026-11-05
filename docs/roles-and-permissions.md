# Roles and permissions

A specification for giving each conference its own roles, each role its own permissions,
and each person on the team one or more roles. Read it before any work on who may see or
do what on a conference. Sections 4, 7 and 8 are the reference; section 9 is the build
order and the checklist to tick as steps land; section 10 records the product decisions,
all taken.

Written 7 October 2026 from a read of the codebase and from feedback a real organiser gave:
different people on a secretariat need different access, and in particular not everybody
on the secretariat should be able to see a delegate's personal information. The model is
Discord's, cut down to what a conference needs. The product owner settled the open
questions the same day; the specification is final and ready to build. Nothing in it is
built yet.

## 1. Why

### What a conference has today

Every conference has three fixed staff roles, held in a database enum and written on the
`conference_staff` row: `organiser`, `chair` and `volunteer`. Above them sit the roles of
the organisation that owns the conference, `owner`, `admin` and `member`, and one
platform-wide flag. What each one may do is decided by two database helpers that about a
hundred Row Level Security policies and about forty page files ask:

| Who                                                                           | What they may do today                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An organisation member of any role, a staff `organiser`, or a platform admin  | Everything. `can_manage_conference` says yes, and that one answer opens every page under `/manage/[slug]`, every write to every table of the conference, every committee room, every chair's notes, and the private details of every applicant and delegate: email, phone, date of birth, dietary requirements, emergency contact. |
| A staff `chair`                                                               | Their own committees' rooms, position papers, notes and award proposals, through `is_committee_chair`. Plus the staff baseline below.                                                                                                                                                                                                                                                                                                 |
| A staff `volunteer`                                                           | The baseline only: the conference in any status, its committees and seat lists, the team list, the fee list, the programme, staff announcements and documents, and the live view of every room. Nothing under `/manage`.                                                                                                                                                                                                             |

So the secretariat is one switch. A finance officer who has to mark invoices paid, a
registration desk that needs the dietary requirements for Saturday's lunch, a head of
academics who confirms awards, and an under-secretary-general who reads applications all
have to be made `organiser`, and each of them then sees everything the others see,
including the private details of every minor at a high school conference, and each of
them can change anybody else's role, publish the conference or delete a committee.

### What goes wrong

- **Private details leak to people with no need for them.** A conference with eight
  organisers has eight people who can export every delegate's date of birth and emergency
  contact. Data protection law asks for the opposite, that each person sees the least
  needed for their job, and the delegates are often under eighteen.
- **People are over-trusted to be useful at all.** The only way to let somebody mark an
  invoice paid is to let them do everything, so secretariats either over-grant or keep
  the work on one person's laptop.
- **The promise is already made.** The for-organisers brief
  (`docs/for-organisers-handoff.md`, section 6.11) sells "Everyone sees what their job
  needs" and a team card with a Secretary-General, a USG for delegate affairs, chairs and a
  registration desk. Today the first two are the same role and the fourth cannot do its
  job.
- **The code cannot grow.** `organiser` means "may do X" in a hundred places, so there is
  nowhere to put "may do X but not Y" without a model for it.

## 2. What we take from Discord

Discord's model is what the organiser named and it is widely understood: a server has
named roles, each role is a set of permission switches, a member holds several roles and
gets the union of them, roles are ordered so that nobody can hand out more than they hold,
and one permission, Administrator, means everything.

| Discord                                        | MUNMeet                                                                                                                                                                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A server                                       | A conference. The organisation above it is where the owners live.                                                                                                                                                             |
| A role, named by the server                    | A role, named by the conference: "Secretary-General", "USG delegate affairs", "Chair", "Registration desk". Three are made with every conference (section 4).                                                              |
| A permission switch, from a fixed list         | The same. The list is the product's and is in section 4; a conference picks from it, never adds to it.                                                                                                                       |
| A member holds several roles; permissions add  | The same. Nothing a role grants is ever taken away by another role.                                                                                                                                                           |
| Role order decides who may manage whom         | The same. A person manages only roles below their own highest role, and grants only permissions they hold.                                                                                                                   |
| Administrator                                  | The same word, the same meaning. It is what the Organiser preset holds.                                                                                                                                                       |
| The server owner, above every role             | The organisation's owners and admins, and a platform admin. They are administrators of every conference and cannot be removed from one.                                                                                     |
| `@everyone`, the baseline every member has     | Being on the team at all. Section 4 lists the baseline.                                                                                                                                                                       |
| Channel overrides, per channel per role        | Not taken. In its place a role is either conference-wide or applies in the committees each member is assigned to (section 3), and the committee assignments the product already has do the rest.                            |
| Role colours, hoisting, mentions, timeouts     | Not taken. `docs/DESIGN.md` forbids colour-coded chips; a role is a word.                                                                                                                                                     |

Channel overrides are the one big thing left out, on purpose. They are what makes Discord's
permissions hard to reason about, and a conference does not need them: the only thing a
chair's permissions have to be narrowed to is their own committee, and the product already
records which committees a person is assigned to.

## 3. The model, in rules

Words used from here on: a **team member** is a person with a `conference_staff` row. A
**role** belongs to one conference and holds a set of **permissions** from the fixed list.
A **committee assignment** is a `committee_chairs` row, which says a person works in that
committee. An **administrator** is anybody who holds the `administrator` permission on a
conference, by role or by being an owner.

1. **A conference has roles; a team member holds one or more; permissions add up.** What a
   person may do is the union of their roles' permissions. A person with no roles has the
   baseline and nothing else.
2. **The permissions are a fixed list the product defines.** A conference chooses which of
   them each role has. Adding a permission is a product change and a migration.
3. **A role is conference-wide or per committee.** A role's scope is either `conference`
   (its permissions apply everywhere) or `committees` (its committee-shaped permissions
   apply only in the committees the member is assigned to, and its other permissions do not
   apply at all). `administrator` on a per-committee role stands for every committee-shaped
   permission in those committees, and for nothing beyond them. The Chair preset is per
   committee. A person's committee assignments are theirs, not a role's: every
   per-committee role they hold applies in every committee they are assigned to.
4. **Owners are above the roles.** The owners and admins of the organisation that runs the
   conference, and a platform admin, are administrators of every one of its conferences.
   They are not team rows and nobody at the conference can change that. This is what
   stops a conference from locking itself out.
5. **Everyone on the team has a baseline**, listed in section 4, and it needs no role.
6. **Order decides who may manage whom.** Roles are ordered. A person's rank is their
   highest role. Except for administrators, who may manage every role, a person may give,
   take, edit or delete only roles below their rank; may put on a role only permissions
   they hold themselves, and at no wider scope than they hold them; and may never change
   their own roles or remove themselves from a role. Everybody may leave the team.
7. **Three roles come with every conference**: Organiser, Chair and Volunteer, matching
   the three the product has today so that nothing changes on the day this ships. They are
   ordinary roles afterwards, editable and deletable like any other. A role with members
   cannot be deleted; take the members off it first.
8. **Deny by default, enforced in the database, re-checked on every request.** A page that
   forgets to check still leaks nothing, because every policy asks the same helpers. A
   page somebody may not open is a 404, never a 403, as everywhere in the app.
9. **A role is a word.** No colours, no icons, no badges beyond the name. Roles a
   conference marks as public appear on its public team page, in role order.

## 4. The permissions

Twenty-one switches, in six groups, each named by the verb a chair would use. The
twenty-first, `answer_directives`, came with committee papers (`docs/committee-papers.md`,
section 8). "Per committee" means the permission narrows to the member's assigned
committees when the role's scope is `committees`; the others only make sense
conference-wide, and a per-committee role that holds one of them gets nothing from it.
`administrator` is the one exception: on a per-committee role it means every per-committee
permission in the member's committees (rule 3).

### Conference

| Key               | Shown as            | Lets a person                                                                                                                                                                      | Per committee | Why it is its own switch                                                                                    |
| ----------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------- |
| `administrator`   | Administrator       | Everything, including everything added later. Every other permission on a conference-wide role; on a per-committee role, every per-committee one in its committees.              | see left      | The one escape hatch, and what the Organiser preset is. Hand it out as rarely as dark blue.               |
| `edit_conference` | Edit the conference | The Details page, publish and archive, the application form's questions, the fee list.                                                                                            | no            | Changing what the conference is, separate from running it.                                                  |
| `manage_team`     | Manage the team     | Invite and remove people, change titles, give and take roles below their own rank, assign people to committees.                                                                   | no            | Who is on the team, separate from what roles can do.                                                        |
| `manage_roles`    | Manage roles        | Create, edit, reorder and delete roles below their own rank, using only permissions they hold.                                                                                    | no            | Discord's lesson: the person who shapes roles is not always the person who hands them out.                 |

### Committees and rooms

| Key                 | Shown as                | Lets a person                                                                                                                                                             | Per committee | Why it is its own switch                                                                                   |
| ------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------- |
| `manage_committees` | Edit committees         | Conference-wide: create and delete committees, their seat lists, agenda, background guide and resources. Per committee: that committee's description, agenda, guide and resources. | yes           | Chairs already edit their own background guide; a head of academics edits every committee.                 |
| `run_room`          | Run the committee room  | The chair console: sessions, roll call, speakers' lists, caucuses, motions, votes, the projector display.                                                                  | yes           | The chair's job, and nothing else of the chair's job.                                                      |
| `review_papers`     | Review position papers  | Read every paper of the committee, approve one or send it back.                                                                                                           | yes           | Some conferences have a separate academic team review papers.                                              |
| `write_chair_notes` | Keep chair notes        | Read the committee's notes on delegates and write their own.                                                                                                              | yes           | Notes are remarks about named people. An award jury may need them; a co-chair who only runs the clock does not. |
| `propose_awards`    | Propose awards          | Propose an award for a seat of the committee.                                                                                                                             | yes           | Chairs propose.                                                                                            |
| `confirm_awards`    | Confirm awards          | Confirm or reject proposals for every committee and publish them.                                                                                                         | no            | The secretariat confirms, and publishing is one moment for the whole conference.                           |
| `answer_directives` | Answer directives       | Answer directives and press releases, and send crisis updates.                                                                                                            | yes           | A crisis committee's backroom is often its own team; its chairs hold it on the day.                        |

### Applications

| Key                   | Shown as            | Lets a person                                                                                                                                                                                     | Per committee | Why it is its own switch                                                                        |
| --------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| `read_applications`   | Read applications   | The applications, delegations and allocation pages, every answer, the internal notes, and the exports without any private-detail column.                                                         | no            | Reading to advise is not deciding.                                                              |
| `decide_applications` | Decide applications | Accept, reject and waitlist, write internal notes, decide delegations, allocate and revoke seats, swap and move delegates. Includes reading.                                                      | no            | Delegate affairs' job.                                                                          |

An application's answers are under `read_applications`. If an organiser puts "Do you have
any medical conditions?" on their own form, the answer is read by whoever reads
applications, not by whoever reads welfare details. The role editor's help text says so.

### Participants and private details

| Key                    | Shown as             | Lets a person                                                                                                                                                                         | Per committee | Why it is its own switch                                                                                                     |
| ---------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `read_participants`    | See the participants | The participants page and export: name, school, country, committee, seat, delegation and its head. Payment status appears only with `read_invoices`.                                  | yes           | A list of every delegate at a school conference is still a list of children's names and schools.                          |
| `read_contact_details` | See contact details  | Email and phone, on the participants page, the application review page, the delegation review page and the exports.                                                                   | yes           | Finance needs an address to chase an invoice. It does not need a date of birth.                                              |
| `read_welfare_details` | See welfare details  | Date of birth, dietary requirements, emergency contact name and phone, in the same places.                                                                                            | yes           | The registration desk and the people running the dinner need these. The people reading essays do not.                       |

These three are the answer to the feedback. Section 5 says how they are enforced.

### Money

| Key               | Shown as        | Lets a person                                                                                 | Per committee | Why it is its own switch                                              |
| ----------------- | --------------- | --------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------- |
| `read_invoices`   | See invoices    | Invoices and payment status, including the invoice shown beside an application.              | no            | Delegate affairs reads payment status; it does not take payments.     |
| `manage_invoices` | Manage invoices | Mark paid, waive, refund and void, and the invoice export. Includes reading.                  | no            | Finance.                                                              |

The fee list itself (which fees exist and what they cost) is part of `edit_conference`,
because it shapes the conference. A Finance role usually holds both.

### Programme and communication

| Key                  | Shown as           | Lets a person                                                                                                                  | Per committee | Why it is its own switch                                   |
| -------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------- | ---------------------------------------------------------- |
| `edit_schedule`      | Edit the programme | Add, change and remove programme events and rooms. Per committee: events addressed to that committee.                           | yes           | Logistics owns the programme.                              |
| `send_announcements` | Send announcements | Conference-wide: to everyone, delegates or staff. Per committee: to that committee.                                             | yes           | Chairs announce to their room; the secretariat to everyone. |
| `manage_documents`   | Manage documents   | Upload and remove the conference's documents (handbook, rules, maps).                                                           | no            | Rarely more than one or two people.                        |

### The baseline: being on the team

Anybody with a `conference_staff` row, whatever their roles, may: read the conference in
any status; read its committees, seat lists and fee list; read the team list (names,
titles, roles and committees, never addresses); read the programme and the announcements
and documents addressed to staff; open the live view and the projector display of every
room; read published awards. This is exactly what a volunteer has today, so it stays a
set of plain policies on `is_conference_staff` and needs no permission.

The management area at `/manage/[slug]` opens for anybody holding at least one permission.
A team member with none uses the same pages a delegate does, as volunteers do today.

### The three preset roles

Made by a trigger with every new conference and backfilled onto every existing one. Member
rows are backfilled from today's `conference_staff.role`, so the day this ships nobody can
do more or less than the day before.

| Role      | Scope      | Public | Permissions                                                                                                                           |
| --------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Organiser | conference | yes    | `administrator`                                                                                                                        |
| Chair     | committees | yes    | `run_room`, `review_papers`, `write_chair_notes`, `propose_awards`, `send_announcements`, `manage_committees`, `read_participants`, `answer_directives` |
| Volunteer | conference | no     | none                                                                                                                                   |

Chair holds `read_participants` so that a chair sees the names and schools of their own
delegates, which the room shows anyway. It holds neither of the private-detail permissions.
A conference that wants its chairs to see dietary requirements ticks the box on the Chair
role; the default is no. Chair holds `answer_directives` so that a crisis committee run by
its chairs works on the day (`docs/committee-papers.md`, section 8); it was added to every
Chair role still called that when committee papers arrived.

### Roles a conference will probably make

Not created automatically. They are here so the test data, the organiser guide and the
help text in the role editor all tell the same story.

| Role                 | Scope      | Permissions                                                                                                                           |
| -------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| USG delegate affairs | conference | `read_applications`, `decide_applications`, `read_participants`, `read_contact_details`, `read_welfare_details`, `read_invoices`, `send_announcements` |
| Finance              | conference | `edit_conference`, `read_invoices`, `manage_invoices`, `read_participants`, `read_contact_details`                                   |
| Registration desk    | conference | `read_participants`, `read_welfare_details`                                                                                           |
| Head of academics    | conference | `manage_committees`, `run_room`, `review_papers`, `write_chair_notes`, `propose_awards`, `confirm_awards`, `manage_documents`         |
| Press                | conference | `send_announcements`                                                                                                                  |

A Finance role holding `edit_conference` can also publish the conference. If that turns out
to matter, publishing becomes its own switch; it is one line in the enum and one policy.

## 5. Private details in particular

Today `profile_details` (email, date of birth, phone, dietary requirements, emergency
contact) has one policy for staff: anybody who `can_manage_conference` reads every column
of every applicant and delegate. Four server files read it for organisers: the
participants page and its CSV, the applications CSV and the review page, the invoice
export, and the delegation review page.

Row Level Security decides rows, not columns, so two permissions over one table need two
doors. The staff policy on `profile_details` is dropped and replaced by two views, built
the way `public_seats` is (`security_invoker = false`, so the view's own `where` is the
rule):

- `staff_contact_details(user_id, email, phone)`, which answers for the people who take
  part in a conference where the caller holds `read_contact_details`, or who sit in a
  committee where the caller holds it per committee.
- `staff_welfare_details(user_id, date_of_birth, dietary_requirements, emergency_contact_name, emergency_contact_phone)`,
  the same for `read_welfare_details`.

"Takes part" means: a non-draft application to the conference, a seat in it, or membership
of one of its delegations, which is the set `participant_conference_ids` already works out
from the other side. The two policies that are not about staff stay on the table: a person
reads and edits their own row, and a delegation head reads their own members' details.

On the pages, a column or a section the reader may not see is left out, not shown empty.
The CSV exports omit the columns rather than writing blank cells, so a file does not
advertise what it hides. The application review page shows its "Contact" and "Welfare"
blocks only to readers with the matching permission, and says nothing where it shows
nothing.

Names, school, country, experience and bio are a person's public profile and stay readable
by anybody signed in, as today. Who holds which seat is participant data: the participants
page needs `read_participants`, and the room views keep showing a delegate's name beside
their country to the team as they do now.

## 6. The screens

Everything below follows `docs/DESIGN.md`: hairlines, serif section titles, one primary
button per page, sentence case, no colour on a role, forms that work without JavaScript,
state in the URL.

### `/manage/[slug]/team`

The team page already exists. It changes as follows.

- **The table** gains a Roles column: the person's roles as words separated by commas, in
  role order ("Organiser", "Chair, Press"). The Title and Committees columns stay. Owners
  and admins of the organisation keep their own rows at the top, marked "From the
  organisation", with no row actions; they are administrators and the page says so in the
  Roles column.
- **The filter row** replaces today's three fixed tabs with a filter by role, in the URL
  as `?role=<roleId>`, plus "Everyone". Beside it, a text link "Roles" to the roles page.
- **Row actions**: "Edit roles" opens a dialog of one checkbox per role the reader may
  give (roles above their rank are listed, disabled, with "Above your role" beside them).
  "Edit title", "Committees" and "Remove" stay as they are. Nobody sees actions on their
  own row.
- **The invite form** asks for Email, Role (a select of the roles the reader may give, with
  each role's scope in grey beside its name), Committee (shown when the chosen role is per
  committee; required for one that is, since a per-committee role with no committee does
  nothing), and Title. An invitation carries one role; more can be added once the person
  has accepted. The pending list names the role.
- **Whose page it is**: opens with `manage_team`. Every action re-checks `manage_team` and
  the rank rule.

### `/manage/[slug]/team/roles`

A new page, opened from the team page, for `manage_roles`.

- H1 "Roles", primary button "New role".
- A table of the conference's roles in order: Name, Scope ("Whole conference" or "Assigned
  committees"), Members (a count), Public ("Shown on team page" or nothing). Each row has
  "Move up" and "Move down" as plain forms, the way committees and fees reorder without
  JavaScript, and a link to the editor. Roles above the reader's rank are listed but have
  no actions.

### `/manage/[slug]/team/roles/new` and `/manage/[slug]/team/roles/[roleId]`

One form, 42rem wide, for `manage_roles`.

- **Name**, required, unique within the conference ignoring case, 40 characters.
- **Scope**, two radio buttons: "The whole conference" and "The committees each member is
  assigned to", with one line of help under the second: "Permissions marked per committee
  apply only in those committees; the others do nothing on this role."
- **Shown on the conference's team page**, one checkbox.
- **What this role can do**: six sections with the group names of section 4 as H2s and a
  checkbox per permission, its "Shown as" name as the label and one line of help under
  it. A permission the reader does not hold is disabled with "You do not have this
  yourself" beside it. A permission marked per committee shows that word in grey after
  its label. Ticking Administrator ticks and disables everything else.
- Actions: "Save changes" (primary), and on an existing role a "Delete role" outline
  button that confirms in a dialog and is disabled, with a sentence saying why, while the
  role has members or invitations.
- "New role" offers "Start from" with "Blank" and each existing role the reader may read,
  which copies its permissions and scope into the form before anything is saved.

### Everywhere else under `/manage/[slug]`

- The sidebar shows only the links the reader may open, so a Finance role sees Dashboard,
  Details, Application form, Fees and Participants and nothing else. The setup steps of a draft show for anybody
  with `edit_conference`.
- `/manage` and the sidebar's conference switcher list the conferences where the reader
  holds at least one permission. An organisation member also sees the organisation's
  other conferences on `/manage`, named but not linked, with "Not on the team" in grey
  beside each, so they know to ask an administrator rather than meet a 404.
- The dashboard shows only the cards and "Needs attention" lines the reader may act on.
- A page the reader may open but not act on (read applications without deciding them)
  shows no primary button and no forms, and its actions answer 404 if posted anyway.
- The chair console opens for `run_room` in that committee. Its Papers, Notes and Awards
  pages open for `review_papers`, `write_chair_notes` and `propose_awards` in that
  committee, and the console's tab strip leaves out the ones the reader lacks.

### Public pages

The conference page's team section lists the members of public roles, in role order and
then by name, with their title. The committee page keeps listing its chairs from
`committee_chairs` with the title on that row ("Chair", "Vice Chair", "Rapporteur").

### Notifications

"X invited you to Y as Z" names the role. Nothing else is new.

## 7. The data model

New objects and the changes to existing ones. Every change is a new migration with tests in
`client/tests/db/`, following the conventions of the existing files. The SQL here is a
sketch of shape, not the migration.

### Two enums

```sql
create type public.permission as enum (
  'administrator', 'edit_conference', 'manage_team', 'manage_roles',
  'manage_committees', 'run_room', 'review_papers', 'write_chair_notes',
  'propose_awards', 'confirm_awards',
  'read_applications', 'decide_applications',
  'read_participants', 'read_contact_details', 'read_welfare_details',
  'read_invoices', 'manage_invoices',
  'edit_schedule', 'send_announcements', 'manage_documents'
);

create type public.role_scope as enum ('conference', 'committees');
```

A new permission later is `alter type ... add value` and a line in the catalogue
(section 8). The `staff_role` enum is dropped once nothing reads it.

### `conference_roles`

```sql
create table public.conference_roles (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references public.conferences (id) on delete cascade,
  name text not null,
  position integer not null default 0,          -- lower is higher in rank, as committees order
  scope public.role_scope not null default 'conference',
  permissions public.permission[] not null default '{}',
  is_public boolean not null default false,     -- on the conference's public team page
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conference_roles_name_length check (char_length(name) between 1 and 40)
);

create unique index conference_roles_unique_name
  on public.conference_roles (conference_id, lower(name));
```

Permissions are an enum array rather than Discord's bitfield because `'run_room' = any
(role.permissions)` reads as a sentence and a teammate can `select` it.

### `conference_role_members`

```sql
create table public.conference_role_members (
  conference_id uuid not null,
  user_id uuid not null,
  role_id uuid not null references public.conference_roles (id) on delete restrict,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (role_id, user_id),
  foreign key (conference_id, user_id)
    references public.conference_staff (conference_id, user_id) on delete cascade
);
```

The composite foreign key means a role can only be held by somebody on the team, and
leaving the team drops every role. `on delete restrict` on the role is rule 7: a role with
members cannot be deleted. A trigger checks that the role belongs to the row's conference,
the way `check_invite_committee` checks a committee.

### Changes to existing tables

- **`conference_staff`** keeps `(conference_id, user_id, title, created_at)` and loses the
  `role` column after the backfill. It becomes "who is on the team"; the roles table says
  what they may do.
- **`committee_chairs`** keeps its name and columns and becomes "who is assigned to which
  committee, and what the committee page calls them". A browser may assign only somebody
  already on the team, or themselves while they hold `manage_team`:
  `protect_committee_chairs_team` refuses anybody else, so a place on the team always comes
  through an invitation, from somebody who already runs the team, or from creating the
  conference: `add_conference_presets` makes a creator who is a member of the organisation,
  but not its owner or an admin, the conference's Organiser (security review L8,
  migrations 20261022170000, 20261022170100 and 20261022170200). The insert policy's rank
  rule leaves the second case to an administrator, with "Chair it yourself". The
  `ensure_chair_is_staff` trigger puts somebody who is not yet on the team onto it, as a
  bare staff row with no roles: that administrator, and anybody a writer the grants do not
  stop, such as the service role, assigns. Accepting an invitation that names a committee
  writes the staff row before the chair row, so there the trigger is only a backstop. A
  browser changes only the title of a `conference_staff` or `committee_chairs` row. When a
  writer the grants do not stop moves a staff row to another person or conference, the
  person it left loses their chair rows on that conference, as a removal from the team
  would (`conference_staff_moved_takes_chairs_along`). An assignment grants nothing by
  itself, and the organiser gives the person a role on the team page. A rename to
  `committee_assignments` is cheap later and is not worth touching sixty call sites now.
- **`invites`** gains `role_id uuid references public.conference_roles (id) on delete cascade`.
  Its `role text` column becomes nullable, and a check says an organisation invitation has
  `role` and no `role_id` while a conference invitation has `role_id` and no `role`.
  Deleting a role withdraws its open invitations. `accept_invite` inserts the staff row,
  the role membership and, when the invitation names a committee, the assignment; roles
  add up, so a second invitation never writes over the roles a person has. It also asks
  that the sender could still send the invitation, still holding `manage_team`, a rank
  above the role and every permission it gives, so an invitation goes with its sender's
  say-so (migration 20261023121000).
  `get_invite`
  answers the role by name together with its scope and permissions, which is how the
  accept page knows where to send somebody; `list_my_invites` names the role too. The
  notification sentence does not: since the security review of 2026-10-10 (L1) it says
  only that the invitation is to the conference's team, so the bell never repeats text an
  organiser typed.
- **`conferences`** gets an `after insert` trigger that creates the three presets and gives
  the creator (`created_by`) a staff row with the Organiser role, the way
  `organizations` makes its creator an owner. The creator may be a plain organisation
  member and must be able to carry on setting up.
- **`profile_details`** loses "Organisers can read the details of somebody at their
  conference" and gains the two views of section 5. This lands in step 4, in the same
  change as the pages that read them, not in step 1.

### The helpers

All `security definer`, `stable`, `set search_path = ''`, granted to `authenticated` and
revoked from `anon`, like the ones they join. The policies ask `has_permission` for the
permission and one of the rank helpers for the rank; the two questions are kept apart so
that each reads as a sentence.

| Helper                                                                           | Answers                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `is_conference_owner(conference_id)`                                             | An owner or admin of the conference's organisation, or a platform admin: the people rule 4 puts above the roles.                                                                                                        |
| `has_permission(conference_id, permission)`                                      | `is_conference_owner`, or a conference-scoped role of the caller's holding `administrator` or the permission. `holder_has_permission(conference_id, user_id, permission)` is the same question about any account, for the rank rule and the invitation refusal, and is granted to nobody. |
| `has_committee_permission(committee_id, permission)`                             | `has_permission` on the committee's conference, or a committees-scoped role holding the permission together with a `committee_chairs` row for that committee.                                                           |
| `permitted_conference_ids(permission)` and `permitted_committee_ids(permission)` | The set forms of the two above, for the policies that must be one lookup per query rather than one per row, the lesson of migration `20260923150000_rls_conference_lookups.sql`.                                        |
| `my_permissions(conference_id)`                                                  | Every permission the caller holds on the conference, once each, with the widest scope it is held at, as rows of `(permission, scope)`. An owner reads one row, `administrator`. The server reads it once per request.    |
| `my_rank(conference_id)` and `user_rank(conference_id, user_id)`                 | The lowest `position` among the person's roles; `-1` for an owner, admin or platform admin; null for somebody with no role, which the rank helpers treat as the bottom.                                                   |
| `can_manage_role(role_id)`                                                       | An administrator of the role's conference, or the role's position is below the caller's rank: whether the caller may give, take, edit or delete it.                                                                      |
| `can_place_role(conference_id, position)`                                        | An administrator, or the position is below the caller's rank: where a new or moved role may sit.                                                                                                                         |
| `can_manage_member(conference_id, user_id)`                                      | An administrator, or the person ranks below the caller or has no role: whether the caller may remove them from the team.                                                                                                 |
| `can_grant(conference_id, permissions, scope)`                                   | Every permission in the array is one the caller holds, at a scope at least as wide; administrators pass.                                                                                                                 |
| `holds_public_role(conference_id, user_id)`                                      | Whether the person holds a role marked public, for the participants' read rule on `conference_staff`, which cannot read the memberships itself.                                                                          |
| `preset_conference_roles()`                                                      | The three presets as rows, read by the trigger on `conferences` and by the backfill, so they are written once.                                                                                                           |

Three helpers that exist today are redefined, which is what makes the first migration safe:

- `can_manage_conference(id)` becomes `has_permission(id, 'administrator')`. Every
  policy and function still asking it keeps working and means "administrators only" until
  its own step rewrites it to the specific permission. Nothing widens by accident.
- `is_committee_chair(committee_id)` becomes `has_committee_permission(committee_id, 'run_room')`.
  The room tables are wired in one stroke. Papers, notes, awards and the background guide
  hang off this helper today and so come with `run_room` until step 8 splits them.
- `is_conference_staff(id)` becomes: a staff row, or an owner or admin of the organisation,
  or a platform admin. `staff_conference_ids()` says the same in set form. A plain
  organisation `member` no longer counts unless they have a staff row, which the backfill
  gives every current member on every existing conference (section 10, decision 1). The
  `conferences` read policy keeps its `member_organization_ids()` branch, so a member still
  sees the organisation's drafts listed.

### Policies on the new tables

| Table                     | Read                                                                       | Write                                                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conference_roles`        | The team; anybody for a public role of a published conference.             | Insert: `manage_roles`, `can_place_role` on the position and `can_grant` on the permissions and scope. Update: `can_manage_role(id)` on the row as it is, and the insert checks on the row as it will be. Delete: `manage_roles` and `can_manage_role(id)`; the foreign key from the memberships refuses it while anybody holds the role. |
| `conference_role_members` | The team.                                                                  | Insert and delete: `manage_team`, `can_manage_role(role_id)`, and `user_id <> auth.uid()`.                                                                                 |
| `conference_staff`        | As today.                                                                  | No insert from a browser: a place on the team comes through an invitation, as a bare row when an administrator chairs a committee themselves (`ensure_chair_is_staff`), or to the creator of a conference who is a member of its organisation but not its owner or an admin, as its Organiser (`add_conference_presets`). Title update: `manage_team`, somebody other than the caller, and `can_manage_member`; the title is the only column a browser may change. Delete: `manage_team` and `can_manage_member` (an administrator, or somebody whose rank is above the person's), or the person themselves. |
| `committee_chairs`        | As today.                                                                  | Insert, title update and delete: `manage_team` on the committee's conference and `can_manage_member` on the person, who has to be on the team already, unless they are adding themselves while they hold `manage_team`, which the rank rule leaves to an administrator (`protect_committee_chairs_team`, `private.lock_place_on_team`). The title is the only column a browser may change. |
| `invites` (conference)    | As today.                                                                  | Insert and delete: `manage_team` and `can_manage_role(role_id)`.                                                                                                             |

### The backfill, in the first migration

1. For every conference, insert Organiser, Chair and Volunteer with the permissions of
   section 4, positions 0, 1 and 2.
2. For every `conference_staff` row, insert the membership of the preset matching its
   `role`.
3. For every organisation `member` and every conference of that organisation, insert a
   staff row if missing and the Organiser membership, so that nobody loses access on the
   day. Owners and admins get no rows: they are administrators by rule 4.
4. Drop `conference_staff.role` and the `staff_role` enum.

## 8. The server and the pages

### `$lib/permissions.ts`, pure

The catalogue the role editor, the sidebar and the tests all read from, so that the
database enum and the words on screen cannot drift:

- `PERMISSIONS`: one entry per key with `label` (the "Shown as" column), `help` (the one
  line under the checkbox), `group` and `perCommittee`.
- `PERMISSION_GROUPS` in the order section 4 lists them.
- `PRESET_ROLES`: the three presets, which the seed and the tests also use.
- `hasPermission(mine, key)`, `hasCommitteePermission(mine, committeeId, key)`,
  `grantablePermissions(mine)`, `canManageRole(myRank, role)`: the rank and union rules,
  written once and unit-tested, so no component works them out itself.

`MyPermissions`, the shape `my_permissions` fills in, is also here, because components
need it and may not import from `$lib/server`.

### `$lib/server/access.ts`

- `requirePermission(locals, url, slug, permission)` replaces `requireOrganiser`: the
  signed-in, onboarded reader and the conference, or a 404. It asks `has_permission`.
- `requireCommitteePermission(locals, url, slug, committeeSlug, permission)` replaces
  `requireChair` and asks `has_committee_permission`.
- `requireTeamMember(locals, url, slug)` opens `/manage/[slug]` for anybody holding at
  least one permission.
- `requireOrganiser` and `requireChair` are deleted when their last caller goes, so that
  nothing new can be written against the old model.

`/manage/[slug]/+layout.server.ts` calls `my_permissions` once and hands the result down
as `data.permissions`. The sidebar, the dashboard and every page's buttons read it. Every
form action still calls `requirePermission` itself: an action is its own request, and the
database would refuse anyway.

### Which permission opens which page

| Page                                                              | To open                                                     | To act                                                                                          |
| ----------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `/manage/[slug]` (dashboard)                                      | any permission                                              | each card by its own permission                                                                 |
| `/manage/[slug]/details`, `/publish`, `/published`                | `edit_conference`                                           | `edit_conference`                                                                               |
| `/manage/[slug]/application-form`                                 | `edit_conference`                                           | `edit_conference`                                                                               |
| `/manage/[slug]/fees`                                             | `edit_conference` or `read_invoices`                        | fee rows: `edit_conference`; invoice actions: `manage_invoices`                                 |
| `/manage/[slug]/fees/export`                                      | `manage_invoices`                                           | payer email column only with `read_contact_details`                                             |
| `/manage/[slug]/committees`, `/new`, `/[committeeId]`             | `manage_committees` (per committee: only assigned ones)     | `manage_committees`; the Chairs panel: `manage_team`                                            |
| `/manage/[slug]/team`                                             | `manage_team`                                               | `manage_team` and the rank rule                                                                 |
| `/manage/[slug]/team/roles`, `/new`, `/[roleId]`                  | `manage_roles`                                              | `manage_roles`, the rank rule and `can_grant`                                                   |
| `/manage/[slug]/applications`, `/[applicationId]`                 | `read_applications`                                         | `decide_applications`                                                                           |
| `/manage/[slug]/applications/export`                              | `read_applications`                                         | private columns by `read_contact_details` and `read_welfare_details`                            |
| `/manage/[slug]/delegations`, `/[delegationId]`                   | `read_applications`                                         | `decide_applications`; the Details toggle by the two detail permissions                        |
| `/manage/[slug]/allocation`                                       | `read_applications`                                         | `decide_applications`                                                                           |
| `/manage/[slug]/participants`, `/export`                          | `read_participants`                                         | columns by the two detail permissions; payment column by `read_invoices`                        |
| `/manage/[slug]/schedule`                                         | `edit_schedule`                                             | `edit_schedule`                                                                                 |
| `/manage/[slug]/announcements`                                    | `send_announcements`                                        | `send_announcements`, audiences by scope                                                        |
| `/manage/[slug]/documents`                                        | `manage_documents`                                          | `manage_documents`                                                                              |
| `/manage/[slug]/awards`                                           | `confirm_awards`                                            | `confirm_awards`                                                                                |
| `/create/[slug]/*`                                                | `edit_conference`                                           | `edit_conference`                                                                               |
| `/conferences/[slug]/committees/[c]/chair/*` (console)            | `run_room` in that committee                                | `run_room`                                                                                      |
| `.../chair/papers`, `/papers/[seatId]`                            | `review_papers` in that committee                           | `review_papers`                                                                                 |
| `.../chair/notes/*`                                               | `write_chair_notes` in that committee                       | `write_chair_notes`                                                                             |
| `.../chair/awards`                                                | `propose_awards` in that committee                          | `propose_awards`                                                                                |
| `.../live`, `.../display`                                         | the team baseline, or a delegate of the committee           | nothing                                                                                         |

### Which policies and functions each area owns

The counts below are what the rewrite touches, from a grep of `supabase/migrations/` on
7 October 2026. `can_manage_conference` appears 112 times across 17 migrations and
`is_committee_chair` 88 times across 10; the page files number 26 for `requireOrganiser`
(40 calls) and 6 for `requireChair`.

| Area                      | Tables whose policies move to a permission                                              | Functions whose bodies check the old helper                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Team and roles            | `conference_staff`, `committee_chairs`, `invites`                                       | `accept_invite`, `conference_team_has_email`, `committee_chair_invite_refusal`, `notify_invite`                                   |
| Private details           | `profile_details`                                                                       | none                                                                                                                              |
| Applications              | `applications`, `delegations`, `delegation_members`, `seats` (update), `application_questions` | `accept_application`, `allocate_delegation_seats`, `move_delegate`, `remove_delegation_seat`, `revoke_seat`, `swap_delegates`, `check_seat_allocation`, `notify_delegation_seats` |
| Money                     | `fees`, `invoices`                                                                      | `next_invoice_number`, `notify_invoice_paid`                                                                                      |
| Programme                 | `schedule_events`, `announcements`, `documents` and the documents bucket                | `check_announcement_scope`, `check_schedule_event_scope`, `check_document_scope`, `conference_audience_user_ids`, `may_upload_conference_document`, `may_change_conference_document`, `protect_documents_columns` |
| Committees and rooms      | `committees`, `seats`, `awards`, `chair_notes`, `committee_session_notes` (both `write_chair_notes`), position paper rows of `documents`, the room tables | `protect_awards_columns`, `create_committee_state`, `start_committee_session`, `start_single_speaker`, `call_next_speaker`, `apply_passed_motion` |
| Conference                | `conferences`, `may_write_public_media`                                                 |                                                                                                                                   |

## 9. Build order

Nine steps, each a Trello card, each shippable on its own with `pnpm verify`, the database
tests and the browser tests of the pages it touches. The rule for every step after the
first: the database policy, the server check and the screen for one area land together,
so a page never offers what the database refuses. The role editor only offers the
permissions whose area has landed; the enum holds all twenty from step 1.

Tick a step here when it is merged into `feature/mvp`, with the date:

- [x] 1. Roles in the database (2026-10-07)
- [x] 2. Permission checks on every page (2026-10-07)
- [x] 3. The team page and the roles editor (2026-10-07)
- [x] 4. Private details (2026-10-07)
- [x] 5. Applications, delegations and allocation (2026-10-07)
- [x] 6. Money (2026-10-07)
- [x] 7. Programme and communication (2026-10-07)
- [x] 8. Committees and rooms (2026-10-07)
- [x] 9. Public pages, test data and guides (2026-10-07)

### Starting step 1

- The migration is one new file under `supabase/migrations/`, named for the day and
  "conference_roles", with the header comment the existing migrations carry and the
  closing line that it is never edited once applied. It holds everything in section 7
  except the `profile_details` change, in this order: enums, `conference_roles`,
  `conference_role_members`, the helpers, the three redefinitions, the presets trigger,
  the policies, the rewritten invitation functions, the backfill, the dropped column.
- Run it with `pnpm db:reset` from `client/`, then `pnpm db:types` to regenerate
  `src/lib/database.types.ts`, and `pnpm test:db` for the database tests.
- New test file `client/tests/db/conference-roles.test.ts`, with a fixture beside
  `conference-fixtures.ts` that makes a role with given permissions and gives it to a
  signed-in client. Existing tests that assert on `conference_staff.role` or invite
  roles have to change: `conference-staff.test.ts`, `team-invites.test.ts`,
  `committee-chair-invites.test.ts`, `committee-chairs.test.ts`, `invites.test.ts`,
  `rls-conference-lookups.test.ts`, `profiles.test.ts` and the walkthrough seed tests.
- `supabase/seed.sql`, `demo-seed.sql` and `walkthrough-seed.sql` insert staff rows with
  a `role`; they move to the presets' memberships in the same step.
- Every unit test that says "an organiser may" or "a chair may not" is a test to keep,
  rewritten against a role: the behaviour is unchanged by design, and the tests prove it.
- Two things the build taught: `position` is a reserved word in a function's parameter or
  `returns table` list (name it `role_position` there; the column keeps its name), and
  the browser tests' service-role helpers for staff and invitations live in
  `client/tests/e2e/signed-in-user.ts` and grant the presets by name.

| Step | Card                                     | What lands                                                                                                                                                                                                                                                               | Visible change                                                                                                               |
| ---- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1    | Roles in the database                    | The two enums, two tables, their policies, every helper of section 7, the three redefinitions, the presets trigger, the backfill, the dropped column; regenerated `database.types.ts`; `$lib/server/team.ts` and `invites.ts` read roles; tests for all of it.         | None for anybody on a team. A plain organisation member keeps Organiser on every existing conference and gets no role on a conference created afterwards until given one. |
| 2    | Permission checks on every page          | `$lib/permissions.ts`; `requirePermission`, `requireCommitteePermission`, `requireTeamMember`; the layout loads `my_permissions`; the sidebar and dashboard filter by it; the 26 page files and 6 chair files switch to the table in section 8, still asking only `administrator` and `run_room` where the area has not landed. | None for the presets.                                                                                                        |
| 3    | The team page and the roles editor       | The three screens of section 6, invitations by role, the rank rule end to end, browser tests.                                                                                                                                                                             | Organisers make roles. The editor offers all 20 permissions of section 4; one whose step has not landed is saved and takes effect when it lands (decision 8). |
| 4    | Private details                          | The two views; the participants page and export, the applications export and review page, the invoice export and the delegation review page read them and omit what the reader lacks; `read_participants`, `read_contact_details` and `read_welfare_details` land.    | The feedback is answered: a role can read applications or run the desk without seeing private details.                      |
| 5    | Applications, delegations and allocation | `read_applications` and `decide_applications` on the tables and the eight functions of the Applications row.                                                                                                                                                              | A USG delegate affairs role works.                                                                                           |
| 6    | Money                                    | `read_invoices` and `manage_invoices`; the fee list under `edit_conference`.                                                                                                                                                                                             | A Finance role works.                                                                                                        |
| 7    | Programme and communication              | `edit_schedule`, `send_announcements`, `manage_documents`, with the scope checks and audience function.                                                                                                                                                                  | Logistics and Press roles work.                                                                                              |
| 8    | Committees and rooms                     | `manage_committees`, and `review_papers`, `write_chair_notes`, `propose_awards`, `confirm_awards` split out of `run_room`; `is_committee_chair` and `can_manage_conference` retired.                                                                                      | A Head of academics role works; a co-chair who only runs the clock sees no notes.                                            |
| 9    | Public pages, test data and guides       | The public team section by `is_public`; the walkthrough seed gains a USG delegate affairs, a Finance and a Registration desk person; `docs/TESTING-GUIDE.md` section 2 and a checklist group; the for-organisers brief's 6.11 table says what is now true.             | The test site shows the model to the organiser who asked for it.                                                             |

Steps 1 to 4 are the minimum that answers the feedback. Steps 5 to 8 can go in any order
after that; 8 is the largest because the room tables are the most numerous.

## 10. Decisions taken

Settled by the product owner on 7 October 2026. The rest of this document assumes them;
reopening one means revising the sections it names.

1. **Organisation members go through conference roles** (sections 3, 7). Owners and
   admins of the organisation are administrators of every conference it runs and cannot be
   removed from one. A plain member keeps seeing the organisation's conferences on
   `/manage` and may create new ones, but what they may do on each comes from the roles
   they hold on it. The backfill gives every current member the Organiser role on every
   existing conference, so nobody loses anything on the day; an administrator narrows it
   afterwards. Leaving members as administrators everywhere would keep a hole the size of
   the one being closed.
2. **Several roles per person, permissions added together** (section 3, rule 1). A Deputy
   Secretary-General who also chairs the General Assembly is common, and the alternative
   is giving them Organiser, which is the problem being solved. The cost is a checkbox
   dialog instead of a select.
3. **Two private-detail permissions, contact and welfare** (sections 4, 5). One permission
   would still make finance see dates of birth.
4. **The Chair preset sees no welfare details** (section 4). A conference that wants its
   chairs to see dietary requirements for a committee lunch ticks the box on its Chair
   role.
5. **Co-chairs read each other's notes**, as today, under `write_chair_notes` (section 4).
6. **The management area opens for anybody holding at least one permission** (section 4).
   A volunteer with none keeps using the delegate pages as today, and there is no empty
   dashboard to design.
7. **Names.** "Roles" and "What this role can do" on screen; the presets stay Organiser,
   Chair and Volunteer so that the handoff brief, the testing guide and the test data
   still read true.
8. **The editor shows all 20 permissions from step 3** (sections 6, 9). Organisers set up
   a role once, in full, instead of coming back after each step. Until a permission's
   step lands, the pages it will open still ask what section 8 says they ask today, so
   ticking it changes nothing yet; nothing on screen says so, because the presets already
   hold the permissions their people will need.

## 11. Later, not now

- **An audit log.** `granted_by` and `created_at` on a membership say who gave a role and
  when; nothing records who read whose details or who changed a role's permissions. A
  conference handling minors' data will want that eventually.
- **A flag on application questions** that marks an answer as sensitive and puts it under
  `read_welfare_details` instead of `read_applications`.
- **Retention.** When a conference is archived, private details could be hidden from
  staff automatically after a set time. Not a permissions question, but the same people
  will ask for it.
- **Per-committee overrides** in Discord's sense, if a conference ever needs one person
  to hold different permissions in different committees. The model here gives a person
  one set of committees for all their per-committee roles.
- **Roles on the delegation side** (a teacher who oversees several school delegations)
  and the platform admin area. Neither touches the conference team.
- **"View as"**, a way for an administrator to see the management area as a given role
  before handing it out.
