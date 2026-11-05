# How MUNMeet looks

Read this before any work that changes what a person sees. It locks down the choices;
how to build them with shadcn-svelte and Tailwind is yours to decide. The last section is
a checklist to run on every screen before you finish.

MUNMeet is judged beside myMUN, the product chairs use today. It has to look like a
well-run institution, not a dashboard template. Everything below follows from that.

## The feeling: paper and ink

A white page, black text, hairline rules instead of boxes, dense left-aligned lists and
tables, serif headings that name things. Think of a conference programme or a good
newspaper's website, not a startup dashboard. Dark blue appears once per screen, on the
action that matters. Light blue marks what is live, selected or a link. Photographs appear
only where there is a real place or person to show, and then at full width.

Restraint is the style. When in doubt, remove the box, the icon, the colour or the line.

## Colour

Four colours, each with one job. Red, amber and green mean state and nothing else.

| Colour     | Job                                       | Value                          | Where                                                                                                           |
| ---------- | ----------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| White      | Every surface                             | `#FFFFFF`                      | the page, cards, fields, menus                                                                                  |
| Quiet grey | A quiet fill                              | `#F4F5F7`                      | table header rows, disabled fields, key hints                                                                   |
| Black      | Everything people read                    | `#15171C`                      | text, numbers, icons                                                                                            |
|            | Secondary text                            | `#5B616B`                      | meta lines, help text, table headers                                                                            |
|            | Placeholder and disabled                  | `#9CA1A9`                      | nothing that has to be read                                                                                     |
|            | Rules                                     | `#E4E6EA`                      | the hairline between rows and regions; `#C9CDD3` for field borders                                              |
| Dark blue  | The brand and the one action that matters | `#0B2A5B`                      | the primary button, the wordmark, the selected navigation item                                                  |
|            | Primary button under the pointer          | `#173B73`                      |                                                                                                                 |
| Light blue | Signal                                    | `#0098FC`                      | lines, bars, dots, focus rings, the selected underline. Shapes only: it is 3:1 on white and never carries words |
|            | Links                                     | `#006FCC`                      | link text on white                                                                                              |
|            | A chosen option                           | `#D9EEFF` fill, `#0B2A5B` text | a selected row, a picked choice                                                                                 |
|            | Hover                                     | `#EEF7FF`                      | a row under the pointer                                                                                         |
| Success    | accepted, paid, passed                    | `#15803D` text on `#DCFCE7`    |                                                                                                                 |
| Warning    | pending, due soon, last ten seconds       | `#B45309` text on `#FEF3C7`    |                                                                                                                 |
| Danger     | rejected, error, destructive, over time   | `#B91C1C` text on `#FEE2E2`    |                                                                                                                 |

On a working screen, roughly: white 80%, black 15%, light blue 4%, dark blue 1%. Dark
blue is rare on purpose, because it points at the next step.

The shadcn theme variables in the global stylesheet point at these values: `--primary` is
dark blue, `--ring` is light blue, `--background` and `--card` are white, `--muted` is the
quiet grey, `--muted-foreground` the secondary text, `--border` the rule, `--input` the
field border, `--destructive` the danger text. Components take their colour from the
variant, never from a colour class in the markup. Nothing is ever a raw hex or a Tailwind
palette colour such as `blue-500`.

Every text colour above passes WCAG AA on white and on the quiet grey. Never put words in
light blue `#0098FC`, white words on the pale blue tints, or the placeholder grey on
anything that has to be read. No dark mode.

## Type

Two fonts from Google Fonts, each with one job. The serif names things, the sans does the
work.

- **Source Serif 4** (weights 500 and 600): page titles, section titles, a conference's
  name, a country with the floor, a result. Never for numbers that change, body text or
  buttons.
- **IBM Plex Sans** (weights 400, 500, 600): everything else. Numbers in columns, clocks
  and counts are set with `tabular-nums` so they line up and do not dance.

| Style   | Font  | Size / line             | Weight | Use                                                   |
| ------- | ----- | ----------------------- | ------ | ----------------------------------------------------- |
| Display | serif | 40 / 44 (phone 30 / 36) | 600    | the one headline of a public page                     |
| H1      | serif | 30 / 36 (phone 26 / 32) | 600    | the page title                                        |
| H2      | serif | 22 / 28                 | 600    | a section or card title                               |
| H3      | sans  | 16 / 24                 | 600    | a row or list item title                              |
| Body    | sans  | 15 / 24                 | 400    | everything                                            |
| Small   | sans  | 13 / 20                 | 400    | meta lines, help text, table cells that are secondary |
| Label   | sans  | 13 / 16                 | 500    | form labels and table headers, sentence case          |

Every size in this file, here and below, is at a 16px rem and is set in rem. The whole
site is then drawn at one scale, `--page-scale` in the global stylesheet (1.1, so 10%
larger), and on screens 1024px and wider it also grows with the window. Change the whole
site's size only through that one number: never one page at a time, never with CSS `zoom`.

Body text runs no wider than 68 characters. Everything is left-aligned and ragged right;
the only centred text is the landing page's headline. Nothing is justified.

Sentence case everywhere, buttons and table headers included. Capitals are for names and
abbreviations only. No uppercase letter-spaced eyebrows, anywhere.

## Space and shape

- The unit is 4px. Rhythm inside a region is 8 and 16; between regions 32 and 48. The page
  gutter is 24px, 16px on a phone.
- Rows in a list or table are at least 44px tall and are separated by one hairline rule.
  They are never boxes.
- A section title has a 1px black rule under it, the whole width of its region. That rule
  is the main structural mark on the site.
- Radius: 6px on buttons, fields and badges. 10px on menus, dialogs and the rare card.
  Nothing larger. Avatars and dots are circles. Badges are not pills.
- Borders are 1px in the rule grey. A card, when one exists, is white with that border and
  no shadow; under the pointer its border darkens, it does not lift.
- The only shadow on the site is under things that float: menus, dialogs, toasts.
- A card is for a discrete object a person picks from a set, such as a conference in the
  directory or a committee on a conference page. Everything else is a region separated by
  rules and space. A card never contains a card.
- Widths: reading and forms 42rem; a normal page 72rem; tables and the chair console the
  full window.

## Page structure

**The shell.** Public and delegate pages have a white top bar with a hairline under it:
wordmark left, navigation beside it, the account on the right. It is opaque, not frosted
glass, and it does not change when the page scrolls. Organiser and chair pages have a
white left sidebar with a rule, text links grouped under short sentence-case headings, and
no icons. On a phone the sidebar becomes a horizontal strip of tabs under the top bar.

**A page**, from the top:

1. The title row: the H1 on the left and the page's one primary button on the right, on
   the same baseline. Under it, at most one line of facts in secondary text, such as dates
   and a place. Never a tagline, never a sentence about the page itself.
2. Sections, each with an H2, its black rule, then content. The order follows what the
   reader needs first, not what is easiest to build.
3. Nothing below the last section: no footer band, no closing call to action, except on
   the public landing page.

**One primary button per page.** Everything else is an outline button, a text link or a
row's own action. A destructive action is a plain outline button that confirms in a
dialog; red is for the confirming step and for errors, not for the button that opens it.

**Lists** are tables on a desktop and stacked rows on a phone. A row has one title line and
one meta line, and its status is a word, with a small coloured dot before it only when the
colour adds something. Filters and search sit in one row above the list and live in the
URL.

**Forms** are one column, 42rem wide, labels above fields, help text under them in small
secondary text, errors under the field in danger text. The actions sit at the bottom,
left-aligned, primary first. Forms work without JavaScript.

**Empty states** are one sentence and one action. No illustration, no icon, no box.

**Phones** get everything in one column. The primary button stays in the title row or
moves to a bar fixed at the bottom. Anything that is pressed is at least 44px tall.

## Images

- Photographs only, of real things: the venue, the city, the committee room, people at the
  conference. Natural colour, no filter, no duotone, no gradient overlay. Where words must
  sit on a photo, use a plain dark scrim at the bottom edge, but prefer to put the words
  beside the photo.
- A conference banner is 16:6, cropped with `object-cover`, full width of its region. A
  thumbnail is 3:2. A logo is 1:1 inside a white square with a hairline border. An avatar
  is a circle; without a photo it shows initials in black on the quiet grey, never in a
  colour chosen from a name.
- A conference without a photo shows no image at all. Its title area is just type. No
  gradient with initials, no stock picture, no placeholder.
- Flags are real flags from flagcdn, 4:3, with a 1px inset hairline so a white flag keeps
  an edge. Never emoji.
- Nothing decorative: no illustrations, no abstract shapes or blobs, no 3D renders, no
  icons standing in for a picture, no emoji.

## Icons

Carbon icons (`carbon-icons-svelte`), at 16px in text and buttons and 20px in navigation,
in the same colour as the words beside them. Icons label actions and navigation. They do
not sit beside headings, in tinted chips, in empty states or anywhere as decoration. Most
screens need fewer than five. An icon-only button has an `aria-label`. The glyphs shadcn
components bring with them, such as the tick in a select, can stay.

## Motion

Hover colours change in 150ms. Menus and dialogs open the way shadcn ships them. Nothing
animates on page load, nothing pulses, nothing slides into view as you scroll. A live dot
changes colour; it does not blink. `prefers-reduced-motion` turns everything off.

The public landing page is the one exception, and only there: its hero and the example
under it settle into place as the page loads, and each section below them fades and rises
into view once, the first time the reader scrolls to it, in 700ms or less. Nothing moves a
second time, nothing loops, and `prefers-reduced-motion` turns it off like everything else.

## Words

Plain, exact, MUN vocabulary, British spelling. A screen says what a chair would say
aloud, and nothing about itself. "Speakers' list", not "Speaking Queue". "1:30", not "1
minute 30 seconds", and never "01:30". Placeholder text names the content, never addresses
the reader. Buttons say the verb: "Save changes", "Add speaker", "Open motions".

## The habits that make a screen look generated

None of these goes on a MUNMeet screen. Check new work against the list.

1. A tagline or explanatory sentence under a heading on a working screen.
2. An icon beside a heading, or an icon in a tinted chip anywhere.
3. Uppercase letter-spaced eyebrows above blocks.
4. Cards on a gradient, cards inside cards, a shadow on something that does not float.
5. A row of equal buttons where one is the obvious next step.
6. Status pills that repeat what the screen already shows, such as "Live" beside a live dot.
7. The same fact stated twice in two formats.
8. Gradient text, coloured full stops, glass effects, decorative quotes, emoji.
9. A grid of three or four equal feature tiles with an icon, a bold title and two lines
   of copy each.
10. Everything centred.
11. Equal visual weight everywhere. Each screen has exactly one largest thing and one
    primary button.
12. Colour-coded avatars, rainbow category chips, a different pastel per card.
13. An illustration or icon in an empty state.
14. Rounded corners larger than 10px, and pill-shaped anything.

## Before you finish

- One primary button, in dark blue, and it is the thing the reader came to do.
- Headings are serif, body is sans, numbers that line up are tabular.
- No uppercase, no taglines, no icon beside a heading, nothing centred.
- Regions divided by rules and space; a card only for an object picked from a set.
- The only shadow is under something that floats. No radius above 10px.
- Colour only from the theme variables; red, amber and green only mean state.
- Photos are real and unfiltered, or there is no picture.
- Fewer than five icons, all beside actions or navigation, all Carbon.
- Works at 390px wide with 44px touch targets, and without JavaScript for forms.
- Hold it next to the same screen in myMUN. It should look more considered, not busier.
