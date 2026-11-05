# Sample pictures and documents

The made-up pictures that fill the `public-media` bucket on a development machine. They are
the storage half of `seed.sql`: that file writes the rows, these are the bytes the rows
point at.

## How they get into the bucket

`supabase/config.toml` has a `[storage.buckets.public-media]` block with
`objects_path = "./media/public-media"`, so the Supabase CLI uploads everything under
`public-media/` at the end of every `pnpm db:reset`. The folders here are the paths in the
bucket: `public-media/avatars/sample/portrait.jpg` becomes
`avatars/sample/portrait.jpg` in the bucket, and
`$PUBLIC_SUPABASE_URL/storage/v1/object/public/public-media/avatars/sample/portrait.jpg`
on the web, which is the address `publicMediaUrl` in `client/src/lib/media.ts` builds.

The bucket itself, its size and type limits and the four policies that decide who may write
to it are made by `supabase/migrations/20260916140000_public_media_bucket.sql`. Nothing here
changes any of that.

## What each one is

| Path in the bucket                                             | Shown by                                                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `avatars/sample/portrait.jpg`                                  | `/styleguide`, the `Avatar` example that has an `imagePath`                  |
| `marketing/sample/delegates.jpg`                               | `/styleguide`, the `FeatureBand` example that has an `imagePath`             |
| `marketing/tour/<page>.jpg`, seven screenshots                 | `/for-organisers`; see "The product screenshots"                             |
| `conferences/11111111-…/banner.jpg`                            | `/styleguide`, `SAMPLE_CONFERENCE` in `client/src/lib/styleguide-samples.ts` |
| `conferences/<id>/banner-….jpg`, one per seeded conference     | That conference's banner; `CREDITS.md` names each photograph                 |
| `conferences/<id>/logo-b1000000-….png`, one per conference     | That conference's logo, on its page and in the `/home` rows                  |
| `organizations/<id>/logo-b1000000-….png`, one per organisation | That organisation's logo                                                     |

The two folders that are not in `02-architecture/storage.md`'s path table are deliberate.
`avatars/sample/` and `marketing/sample/` hold pictures nobody uploaded and nobody may
upload: `may_write_public_media` refuses both, because the second folder of an avatar path
has to be a real account and `marketing` is a folder it has never heard of. Seeding writes
them as `postgres` rather than as a signed-in person, the same way `seed.sql` writes rows no
policy would allow, so the files are there to be read and can never be replaced through the
app.

## Where they came from

The styleguide's three pictures were drawn rather than photographed: flat shapes in the
design system's colours, so nothing there is anybody's photograph. `portrait.jpg` is
therefore a person-shaped glyph and not a face, which is deliberate — a made-up face is
either somebody's real one or an invented one, and neither belongs in a repository — but it
does mean the `Avatar` example on `/styleguide` shows the component's cropping and its
circle rather than how a real photograph sits in it.

Every seeded conference's banner is a real photograph under the CC0 public domain
dedication, and every seeded logo is an invented crest drawn from an SVG in `drawn/` (T149).
`CREDITS.md` beside this file says where each photograph came from, who took it and under
which licence, and how the crests are rendered.

Each picture is the shape and size `02-architecture/storage.md` recommends for its kind —
banners 1600×600, logos and avatars 512×512 — so a page that lays them out is laying out
something the real thing's size. Replace one by writing a new file at the same path;
nothing reads its contents.

## The product screenshots

`marketing/tour/` is the one folder here that was not drawn. Its seven pictures are
screenshots of MUNMeet itself, so `/for-organisers` shows the product as it really looks.
(The landing page showed them too until Trello RBz46aTQ, whose mockup draws an example of the
product instead.) `PRODUCT_SCREENSHOTS` in `client/src/lib/product-screenshots.ts` names
each one. They were taken from the walkthrough conferences in `walkthrough-seed.sql` (and
Amsterdam Open MUN 2027 for `conference-page.jpg`), so every person and school in them is
made up, at 1280×800 CSS pixels and a device pixel ratio of 1.5, saved as JPEG at quality
80.

| File                  | Page, signed in as                                                                 |
| --------------------- | ---------------------------------------------------------------------------------- |
| `conference-page.jpg` | `/conferences/amsterdammun-2027`, signed out                                       |
| `dashboard.jpg`       | the dashboard of `northbridge-applications-open`, `walk.organiser@example.test`    |
| `applications.jpg`    | the applications of `northbridge-applications-open`, `walk.organiser@example.test` |
| `allocation.jpg`      | the allocation of `northbridge-about-to-start`, `walk.organiser@example.test`      |
| `fees.jpg`            | the fees of `northbridge-about-to-start`, `walk.organiser@example.test`            |
| `schedule.jpg`        | the schedule of `northbridge-about-to-start`, `walk.organiser@example.test`        |
| `chair-room.jpg`      | the UNSC chair room of `northbridge-running-today`, `walk.chair.live@example.test` |

When one of those pages changes enough that its picture misleads, reset the database, sign
in as the account in the table and take the page again at the same size, then replace the
file. Nothing reads its contents, and the path stays the same.

## The demo conference's documents

`documents/` holds the files of the demo conference in `demo-seed.sql`: three background
guides, three resources and 22 position papers, all under
`documents/d2000000-…0001/`, the conference's id. `config.toml`'s
`[storage.buckets.documents]` block uploads them into the private `documents` bucket on the
same reset, at the `storage_path` of the `documents` row that points at each one, and
`client/tests/db/demo-conference.test.ts` checks that every one arrives at the size its row
records. Switzerland's paper was written on MUNMeet, so it has no file here.

Each is a one-page PDF naming what it stands in for, so opening one during a demo shows a
real file rather than an error. Nothing reads what they say. Replace one by writing a new
PDF at the same path and changing its row's `file_size_bytes` to match.

## The walkthrough's documents

`documents/f2000000-…0004/` holds the files of "Northbridge MUN (about to start)" in
`walkthrough-seed.sql`: two background guides and five uploaded position papers, one-page PDFs of the
same kind as the demo conference's. They are uploaded on the same reset the same way, and
`client/tests/db/walkthrough-seed.test.ts` checks each arrives at the size its row records.
