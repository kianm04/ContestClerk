import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { createTestUser, signIn, type TestUser } from './signed-in-user';
import { createDraftConferenceFor } from './draft-conference';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';

// The acceptance criteria of `specs/05-pages/organiser/details.md` that need a
// real browser: the details editor at `/manage/[slug]/details`, which edits
// everything the public conference page shows.
//
// * every editable column of the conference is on the page;
// * saving really writes the columns, across all five sections at once;
// * the validation messages of the spec's table appear together rather than one
//   per attempt;
// * the banner and the logo can be uploaded, replaced and taken away, and the
//   picture a new one replaces is deleted from storage rather than left behind;
// * a picture of the wrong kind, and one over five megabytes, are refused;
// * the currency is locked, with its own sentence in place of the dropdown, once
//   the conference has an invoice;
// * "Preview public page" leads to the public page, and that page opens for the
//   organiser while the conference is still a draft;
// * an action asks who is posting to it rather than trusting the page that drew
//   the button;
// * a published conference is told that its changes are seen at once;
// * the page does not spill off a phone screen or run on for screens on a
//   desktop.
//
// EVERY ACTION WITHOUT JAVASCRIPT
// That criterion — which the spec extends to the file uploads — is met by these
// tests running on the `desktop-no-js` project like every other browser test,
// rather than by a test of its own. The page is one real
// `<form method="post" enctype="multipart/form-data">`: "Save and continue" in
// the setup footer is its submit button through its `form` attribute, and each
// "Remove" button is a submit of a second, empty form with a `formaction` of
// its own, so a browser with no script posts all of them. Playwright's
// `setInputFiles` works there too, because handing a file box a file is
// something the browser does rather than something a script does, which is the
// reason `tests/e2e/profile.spec.ts` gives for the photo form. The two tests
// that measure the page are the exception: they ask the browser for its own
// dimensions, and each runs on one project alone.
//
// WHAT THESE TESTS LEAVE BEHIND
// Each test creates its own conference through `./draft-conference`, with an
// organisation of its own, and what it creates stays in the database until the
// next `pnpm db:reset`. They are dated in 2020 for the reason
// `tests/e2e/manage-dashboard.spec.ts` gives: `/conferences` lists conferences
// that are published *and* have not finished, and
// `tests/e2e/conferences.spec.ts` counts what is in it, so the one test below
// that publishes a conference changes nothing it sees. The pictures the upload
// tests put in the `public-media` bucket sit under `conferences/<id>/`, a
// folder of that test's own conference, which no other test ever reads.
//
// Nothing here takes a row, a seat or a picture from `supabase/seed.sql`.
//
// `createDraftConference`, `slugOf`, `readConferenceId`,
// `signInWithAConference` and `postFormAction` below are copies of the ones in
// `tests/e2e/manage-dashboard.spec.ts`, which copied the first of them from
// `tests/e2e/manage.spec.ts`, and deliberately copies rather than shared
// imports for the same reason: each file wants its own dates and its own extra
// fields, and a helper shared between them would have to be told about every
// one of those.

/**
 * How long an assertion that waits on a page reading the database may take.
 *
 * Longer than the five seconds Playwright waits by default, for the reason
 * `tests/e2e/conferences.spec.ts` gives: every test in the run asks the one
 * local database at once, and an answer has taken up to eight seconds.
 */
const DATABASE_TIMEOUT_MS = 15_000;

/**
 * The days every conference these tests create runs on.
 *
 * Both are in the past, for the reason at the top of this file.
 */
const CONFERENCE_FIRST_DAY = '2020-05-03';
const CONFERENCE_LAST_DAY = '2020-05-05';

/**
 * The days the editor moves a conference to, so that saving a date can be seen
 * to have changed something. Also in 2020, and still in the right order.
 */
const EDITED_FIRST_DAY = '2020-06-08';
const EDITED_LAST_DAY = '2020-06-10';

/** The Storage bucket the two pictures live in. `specs/02-architecture/storage.md`. */
const PUBLIC_MEDIA_BUCKET = 'public-media';

/**
 * How many windows tall the details editor may be with everything on it at once.
 *
 * Twenty-one fields and two picture previews, in the five cards the page file's
 * wireframe draws — and in the rows it draws them in, two and three to a line
 * from `md` up. Stacked in one column instead they came to 3,497px, which is
 * 4.4 of these windows with half the page empty beside them; laid out as the
 * wireframe has them they come to about 2,100px. Three is therefore the same
 * ceiling the conference dashboard and `/profile/edit` are held to, and this
 * page sits comfortably under it.
 *
 * It is a ceiling and not a target. What it catches is this form drifting back
 * towards one field per line, which is exactly what `tests/e2e/page-shape.ts`
 * exists to notice.
 */
const MANAGE_DETAILS_SCREENS = 3;

/**
 * Every field the editor shows, by the words above it.
 *
 * The first acceptance criterion is that every editable column of the
 * conference is on this page, and these labels are how a person finds each one.
 * "Level" is not in the list: it is a radio group, which HTML names with a
 * `<legend>` rather than with a `<label>`, so the test below asks for it by its
 * role instead.
 */
const FIELD_LABELS = [
	'Name',
	'Tagline',
	'Description',
	'Banner',
	'Logo',
	'Venue name',
	'Venue address',
	'City',
	'Country',
	'Timezone',
	'First day',
	'Last day',
	'Language',
	'Expected delegates',
	'Minimum age',
	'Maximum age',
	'Currency',
	'Contact email',
	'Phone',
	'Website',
	'Instagram',
	'Facebook',
	'LinkedIn',
	'YouTube',
	'TikTok'
];

/**
 * A real 1×1 pixel PNG, all seventy bytes of it, written out as base64.
 *
 * `setInputFiles` takes a name, a type and the bytes themselves, so a test can
 * hand the form a picture that is on no disk anywhere and this repository need
 * carry no binary file. The same trick as the JPEG in `tests/e2e/profile.spec.ts`.
 */
const SMALL_PNG_BASE64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Those seventy bytes, for the helpers that upload a picture without a form. */
const SMALL_PNG_BYTES = Buffer.from(SMALL_PNG_BASE64, 'base64');

/** That PNG as a file box receives it: a picture under every limit there is. */
const SMALL_PNG = {
	name: 'banner.png',
	mimeType: 'image/png',
	buffer: SMALL_PNG_BYTES
};

/**
 * The same picture under another name, for the half of the upload test that
 * replaces one.
 *
 * The bytes are the same on purpose: what the test watches is the path, and the
 * server gives every upload a fresh uuid of its own, so two identical pictures
 * still land at two different addresses.
 */
const REPLACEMENT_PNG = {
	name: 'better-banner.png',
	mimeType: 'image/png',
	buffer: SMALL_PNG_BYTES
};

/** A square picture for the logo, so the two uploads read as two different files. */
const SMALL_LOGO_PNG = {
	name: 'logo.png',
	mimeType: 'image/png',
	buffer: SMALL_PNG_BYTES
};

/** A PDF, which is the wrong kind of file however small it is. */
const A_PDF = {
	name: 'programme.pdf',
	mimeType: 'application/pdf',
	buffer: Buffer.from('%PDF-1.4\n')
};

/**
 * A file that says it is a PNG and is a megabyte over the 5 MB limit.
 *
 * Its six million bytes are all zeroes, because nothing ever looks at them: the
 * size is what the server refuses it for. The type still has to be one of the
 * three the form takes, or it would be refused for being the wrong kind of file
 * before its size was ever measured.
 */
const OVERSIZED_PNG = {
	name: 'enormous-banner.png',
	mimeType: 'image/png',
	buffer: Buffer.alloc(6 * 1024 * 1024)
};

/** Which of a conference's two pictures a helper is about. */
type ImageKind = 'banner' | 'logo';

/**
 * A name nothing else in the database will match, so that a test can read its
 * own conference's page without another run's rows getting in the way.
 */
function unusedName(prefix: string): string {
	return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

/** What `createDraftConference` names the new conference and its organisation. */
type NewConference = {
	/** The conference's name. */
	name: string;
	/** The name of the new organisation, which the account owns. */
	organizationName: string;
};

/**
 * Give `user` a draft conference of its own, run by a brand-new organisation,
 * and answer its `/manage/<slug>` address.
 *
 * The rows are written straight into the database by `./draft-conference`,
 * whose comment says why: the one-step `/create` form these tests used to fill
 * in is gone, and the creation flow that replaced it has its own
 * `create-*.spec.ts` files.
 */
async function createDraftConference(user: TestUser, conference: NewConference): Promise<string> {
	const draft = await createDraftConferenceFor(user, {
		name: conference.name,
		organizationName: conference.organizationName,
		startDate: CONFERENCE_FIRST_DAY,
		endDate: CONFERENCE_LAST_DAY
	});

	return `/manage/${draft.slug}`;
}

/** The slug at the end of a `/manage/<slug>` address. */
function slugOf(managePath: string): string {
	return managePath.split('/').pop() ?? '';
}

/**
 * The id of the conference a `/manage/<slug>` address names. `./draft-conference`
 * makes the slug with a random suffix, so the id can only be looked up afterwards.
 */
async function readConferenceId(slug: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conferences')
		.select('id')
		.eq('slug', slug)
		.maybeSingle();

	if (error || !data) {
		throw new Error(`Could not find the conference "${slug}": ${error?.message}`);
	}

	return data.id;
}

/**
 * A signed-in account with a conference of its own, ready for a test to work on.
 */
type TestConference = {
	user: TestUser;
	id: string;
	slug: string;
	name: string;
	/** The `/manage/<slug>` address the other setup steps sit under. */
	managePath: string;
	/** The `/manage/<slug>/details` address this file is about. */
	detailsPath: string;
};

/** Sign a brand-new account in and give it a conference of its own. */
async function signInWithAConference(page: Page, prefix: string): Promise<TestConference> {
	const user = await createTestUser('Priya Nair');
	await signIn(page, user);

	const name = unusedName(prefix);
	const organizationName = unusedName(`${prefix} Society`);
	const managePath = await createDraftConference(user, { name, organizationName });
	const slug = slugOf(managePath);
	const id = await readConferenceId(slug);

	return { user, id, slug, name, managePath, detailsPath: `${managePath}/details` };
}

/**
 * Sign in, make a conference and open its details editor, which is where every
 * test below starts.
 */
async function openDetailsEditor(page: Page, prefix: string): Promise<TestConference> {
	const conference = await signInWithAConference(page, prefix);

	await goToDetailsEditor(page, conference);

	return conference;
}

/**
 * Open the details editor of a conference the test already has.
 *
 * Waiting for "Save and continue" rather than simply for the address is what
 * says the form has arrived, so a test never types into a page that is still
 * on its way. The conference is a draft, so its details page is the first
 * setup step, and that is the button its footer saves with.
 */
async function goToDetailsEditor(page: Page, conference: TestConference): Promise<void> {
	await page.goto(conference.detailsPath);

	await expect(page.getByRole('button', { name: 'Save and continue' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/**
 * Press "Save and continue" and wait for the save to land. A draft's details
 * page is the first setup step, so a save that worked moves on to the next
 * one, Committees, and says "Details saved." when it gets there.
 */
async function saveAndContinue(page: Page, conference: TestConference): Promise<void> {
	await page.getByRole('main').getByRole('button', { name: 'Save and continue' }).press('Enter');

	await expect(page).toHaveURL(`${conference.managePath}/committees`, {
		timeout: DATABASE_TIMEOUT_MS
	});

	// The flash message floats above the page rather than inside `<main>`, which
	// is why this is not scoped to it.
	await expect(page.getByText('Details saved.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
}

/**
 * Write columns straight onto a conference, to arrange the state a test begins
 * in.
 *
 * The service-role client stands in for whichever page owns the column, the way
 * `updateConference` in `tests/e2e/manage-dashboard.spec.ts` does. It is never
 * used to show that something is allowed, which is what
 * `tests/db/supabase-test-client.ts` warns against.
 */
async function setConferenceColumns(
	conferenceId: string,
	columns: Record<string, string | null>
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('conferences').update(columns).eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not fill in the test conference: ${error.message}`);
	}
}

/** Every column the details editor can change, as the database holds them. */
type SavedConference = {
	name: string;
	tagline: string | null;
	description: string | null;
	venue_name: string | null;
	venue_address: string | null;
	city: string;
	country_code: string;
	timezone: string;
	start_date: string;
	end_date: string;
	level: string;
	language: string;
	expected_delegates: number | null;
	min_age: number | null;
	max_age: number | null;
	currency: string;
	contact_email: string | null;
	website_url: string | null;
	instagram_url: string | null;
	contact_phone: string | null;
	facebook_url: string | null;
	linkedin_url: string | null;
	youtube_url: string | null;
	tiktok_url: string | null;
};

/** Read those columns back, which is how a save is proved to have happened. */
async function readSavedConference(conferenceId: string): Promise<SavedConference> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conferences')
		.select(
			'name, tagline, description, venue_name, venue_address, city, country_code, timezone, ' +
				'start_date, end_date, level, language, expected_delegates, min_age, max_age, currency, ' +
				'contact_email, website_url, instagram_url, contact_phone, facebook_url, linkedin_url, ' +
				'youtube_url, tiktok_url'
		)
		.eq('id', conferenceId)
		.maybeSingle()
		// Supabase works a row's shape out from the text inside `select`, and it
		// cannot do that with one built by joining strings together, so the shape
		// is named here instead. The same `overrideTypes` the queries in
		// `src/lib/server/conferences.ts` use.
		.overrideTypes<SavedConference, { merge: false }>();

	if (error || !data) {
		throw new Error(`Could not read the test conference: ${error?.message}`);
	}

	return data;
}

/** Where one of a conference's two pictures sits in the bucket, or `null` for none. */
async function readImagePath(conferenceId: string, kind: ImageKind): Promise<string | null> {
	const admin = createServiceRoleClient();

	// Both columns are asked for rather than the one this call is about, for the
	// reason `readConferenceImagePath` in `src/lib/server/conferences.ts` gives:
	// Supabase works a row's shape out from the text inside `select`, and a
	// column name decided while the code runs is not text it can read.
	const { data, error } = await admin
		.from('conferences')
		.select('logo_path, banner_path')
		.eq('id', conferenceId)
		.maybeSingle();

	if (error || !data) {
		throw new Error(`Could not read the conference's ${kind}: ${error?.message}`);
	}

	const path: string | null = kind === 'logo' ? data.logo_path : data.banner_path;

	return path;
}

/** The conference's status, for the tests that say nothing was published or unpublished. */
async function readConferenceStatus(conferenceId: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conferences')
		.select('status')
		.eq('id', conferenceId)
		.maybeSingle();

	if (error || !data) {
		throw new Error(`Could not read the conference's status: ${error?.message}`);
	}

	return data.status;
}

/**
 * The names of the objects sitting in one conference's folder of the bucket.
 *
 * This is the only way to see that a replaced picture was really deleted: the
 * column says where the new one is, and nothing but the bucket itself says
 * whether the old one is still taking up room in it.
 */
async function listConferenceObjectNames(conferenceId: string): Promise<string[]> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin.storage
		.from(PUBLIC_MEDIA_BUCKET)
		.list(`conferences/${conferenceId}`);

	if (error) {
		throw new Error(`Could not list the conference's pictures: ${error.message}`);
	}

	return (data ?? []).map((object: { name: string }) => object.name);
}

/**
 * The path one of the two pictures has been saved at, with the path itself
 * checked on the way past.
 *
 * It is the address the server should have built: the conference's own folder,
 * the kind of picture, and a fresh uuid so that a replacement is never served
 * from a browser's cache of the old one. `specs/02-architecture/storage.md`.
 *
 * It answers plain text rather than "text or nothing", so that a caller can
 * hand the answer straight to `expectFolderHolds`. A conference with no picture
 * of that kind is a mistake in the test that asked, not something to carry on
 * with, which is why that is thrown rather than returned.
 */
async function readSavedPicturePath(conferenceId: string, kind: ImageKind): Promise<string> {
	const path = await readImagePath(conferenceId, kind);

	if (path === null) {
		throw new Error(`The test conference has no ${kind} saved.`);
	}

	expect(path).toMatch(new RegExp(`^conferences/${conferenceId}/${kind}-[0-9a-f-]+\\.png$`));

	return path;
}

/** The file name at the end of a storage path, which is how the bucket lists it. */
function objectNameOf(path: string): string {
	return path.split('/').pop() ?? '';
}

/**
 * Says that the conference's folder holds exactly these pictures and no others.
 *
 * Wrapped in `toPass`, which runs the block again until it succeeds, because
 * the old object is deleted after the row has been saved: the page can answer a
 * moment before the bucket has caught up.
 */
async function expectFolderHolds(conferenceId: string, paths: string[]): Promise<void> {
	const expected = paths.map(objectNameOf).sort();

	await expect(async () => {
		const names = await listConferenceObjectNames(conferenceId);

		expect(names.sort()).toEqual(expected);
	}).toPass({ timeout: DATABASE_TIMEOUT_MS });
}

/**
 * Put a picture in the bucket and point the conference at it, without going
 * through the form.
 *
 * The tests that upload a picture do it through the page, which is the point of
 * them. This is for the ones that only need a picture to already be there: the
 * two that measure the page, and the one that proves a stranger cannot remove
 * somebody else's.
 */
async function giveConferenceAPicture(conferenceId: string, kind: ImageKind): Promise<string> {
	const admin = createServiceRoleClient();
	const path = `conferences/${conferenceId}/${kind}-${crypto.randomUUID()}.png`;

	const { error: uploadError } = await admin.storage
		.from(PUBLIC_MEDIA_BUCKET)
		.upload(path, new Blob([SMALL_PNG_BYTES], { type: 'image/png' }));

	if (uploadError) {
		throw new Error(`Could not upload the test ${kind}: ${uploadError.message}`);
	}

	await setConferenceColumns(conferenceId, { [`${kind}_path`]: path });

	return path;
}

/**
 * Raise one invoice against a conference, which is what locks its currency.
 *
 * The invoices editor is T33's, so the service-role client stands in for it,
 * the way `manage-dashboard.spec.ts` writes fees and seats.
 *
 * Three columns have to be filled in here that a browser never fills in for
 * itself. `guard_invoice_insert` in
 * `supabase/migrations/20260919120000_fees_and_invoices.sql` numbers the
 * invoice, copies the conference's currency onto it and sets its status, but
 * only when the caller is `anon` or `authenticated`; the service role is
 * neither, so it walks straight past that trigger and has to say all three.
 *
 * The number is written by hand rather than asked of `next_invoice_number`,
 * which is what that trigger would have called: the function begins by asking
 * `has_permission(id, 'administrator')`, and that reads `auth.uid()`, which the service role
 * does not have. `invoices.number` only has to be unique, and each of these
 * test conferences is invoiced exactly once and by nothing else, so the first
 * number that function would have given is safe to write.
 */
async function raiseInvoice(
	conferenceId: string,
	conferenceSlug: string,
	payerUserId: string
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('invoices').insert({
		conference_id: conferenceId,
		number: `${conferenceSlug}-0001`,
		payer_user_id: payerUserId,
		description: 'Delegate fee · a test invoice, so that the currency is locked',
		quantity: 1,
		unit_amount_cents: 6500,
		currency: 'EUR',
		status: 'unpaid'
	});

	if (error) {
		throw new Error(`Could not write the test invoice: ${error.message}`);
	}
}

/**
 * Post to one of the page's form actions the way a browser posts a form.
 *
 * A button the page drew disabled proves only what the page did; the criterion
 * is that the action itself refuses, so these tests ask it directly.
 * `page.request` carries the browser's own cookies, so the post arrives signed
 * in as the account the test signed in. Two headers are written by hand.
 * `origin`, because SvelteKit refuses a form post that looks as though it came
 * from another website and Playwright's request does not send that header
 * itself. And `accept: text/html`, because that is how SvelteKit tells a form
 * post from a page with no JavaScript from one made by `use:enhance`: without it
 * the answer is the action's result as JSON under a 200, and with it the page is
 * drawn again carrying the status the action chose, which is what a browser with
 * no script really receives and so what these tests are about.
 *
 * The same helper as in `tests/e2e/manage-dashboard.spec.ts`, with one addition:
 * it is given the fields to post, because the tests below are about what the
 * server says of the values it was sent.
 */
async function postFormAction(
	page: Page,
	action: string,
	fields: Record<string, string> = {}
): Promise<APIResponse> {
	const origin = new URL(page.url()).origin;

	return page.request.post(action, {
		form: fields,
		headers: { origin, accept: 'text/html' }
	});
}

/**
 * A whole form's worth of values, with everything the spec's table allows put in
 * wrongly at once.
 *
 * Every field is sent, because the action reads them all and a missing one
 * would be answered for being missing rather than for being wrong. The seven
 * fields the creation flow also asks for are filled in properly, so that nothing this
 * test is not about has a message of its own.
 */
const EVERY_FIELD_WRONG: Record<string, string> = {
	// Too long, which T62 gave a sentence of its own rather than the one a name
	// left out gets.
	name: 'x'.repeat(121),
	tagline: 'x'.repeat(121),
	description: 'x'.repeat(4001),
	venueName: 'x'.repeat(201),
	venueAddress: 'x'.repeat(201),
	city: 'Delft',
	countryCode: 'NL',
	timezone: 'Europe/Amsterdam',
	startDate: CONFERENCE_FIRST_DAY,
	endDate: CONFERENCE_LAST_DAY,
	level: 'mixed',
	language: '',
	expectedDelegates: '9000',
	minAge: '4',
	maxAge: '120',
	currency: 'EUR',
	contactEmail: 'not-an-email',
	// Neither of these is a web address: `nonsense` becomes `https://nonsense`,
	// whose site name has no dot in it, which is almost always a typing mistake.
	websiteUrl: 'nonsense',
	instagramUrl: 'nonsense',
	facebookUrl: 'nonsense',
	linkedinUrl: 'nonsense',
	youtubeUrl: 'nonsense',
	tiktokUrl: 'nonsense',
	// Words rather than a number.
	contactPhone: 'ring the office'
};

/** The message the spec's table gives for each of those wrong values. */
const EVERY_MESSAGE_AT_ONCE = [
	'Please keep the name under 120 characters.',
	'Please keep the tagline under 120 characters.',
	'Please keep the description under 4000 characters.',
	'Please keep this under 200 characters.',
	'Please enter the language of the conference.',
	'Please enter a number between 1 and 5000.',
	'Please enter an age between 10 and 99.',
	'That does not look like an email address.',
	'Please enter a phone number, such as +31 6 1234 5678.',
	'Please enter a web address, such as www.example.org.'
];

/** What the save test types into the form, section by section. */
const EDITED_DETAILS = {
	tagline: 'Three days of debate on the water.',
	description: 'Three days of debate, written out so that the description is not empty.',
	venueName: 'Beurs van Berlage',
	venueAddress: 'Damrak 243',
	city: 'Berlin',
	countryCode: 'DE',
	timezone: 'Europe/Berlin',
	/** The words beside the radio button, rather than the `university` it saves. */
	level: 'University',
	language: 'English and German',
	expectedDelegates: '450',
	minAge: '16',
	maxAge: '24',
	currency: 'GBP',
	contactEmail: 'hello@example.test',
	/** Typed without `https://`, which the server puts in front of it. */
	websiteUrl: 'www.example.org',
	instagramUrl: 'www.instagram.com/example',
	facebookUrl: 'www.facebook.com/example',
	linkedinUrl: 'www.linkedin.com/company/example',
	youtubeUrl: 'www.youtube.com/@example',
	tiktokUrl: 'www.tiktok.com/@example',
	/** Saved as typed, spaces and all. */
	contactPhone: '+31 6 1234 5678'
};

/*
	Every test here signs a brand-new account in, seeds a draft conference,
	opens the editor and then fills a long form in, sometimes more than once.
	That is a great deal more than most browser tests do, and thirty seconds —
	what Playwright allows a test by default — is not always enough for it while
	the whole suite is asking the one local database at once. `test.slow()`
	triples that allowance. It is an allowance and not a wait: a test that is
	quick still finishes as quickly as it can.
*/
test.beforeEach(() => {
	test.slow();
});

test('shows every column of the conference an organiser may edit', async ({ page }) => {
	await openDetailsEditor(page, 'Every Field MUN');

	const main = page.getByRole('main');

	await expect(main.getByRole('heading', { level: 1 })).toHaveText('Details');

	// `exact: true` matters here: without it "Name" would also match "Venue name"
	// and Playwright would refuse to choose between the two.
	for (const label of FIELD_LABELS) {
		await expect(main.getByLabel(label, { exact: true })).toBeVisible();
	}

	// A `<fieldset>` with a `<legend>` is a group, and the legend is its name.
	// That is how HTML names a set of radio buttons, so it is how the level is
	// found rather than by a label of its own.
	await expect(main.getByRole('group', { name: 'Level', exact: true })).toBeVisible();

	await expect(main.getByRole('link', { name: 'Preview public page' })).toBeVisible();
	await expect(main.getByRole('button', { name: 'Save and continue' })).toBeVisible();
});

test('saves what is typed across every section of the form', async ({ page }) => {
	const conference = await openDetailsEditor(page, 'Saved Details MUN');
	const editedName = unusedName('Renamed Details MUN');

	const main = page.getByRole('main');

	// About.
	await main.getByLabel('Name', { exact: true }).fill(editedName);
	await main.getByLabel('Tagline', { exact: true }).fill(EDITED_DETAILS.tagline);
	await main.getByLabel('Description', { exact: true }).fill(EDITED_DETAILS.description);

	// Place and dates.
	await main.getByLabel('Venue name', { exact: true }).fill(EDITED_DETAILS.venueName);
	await main.getByLabel('Venue address', { exact: true }).fill(EDITED_DETAILS.venueAddress);
	await main.getByLabel('City', { exact: true }).fill(EDITED_DETAILS.city);
	await main.getByLabel('Country', { exact: true }).selectOption(EDITED_DETAILS.countryCode);
	await main.getByLabel('Timezone', { exact: true }).selectOption(EDITED_DETAILS.timezone);
	await main.getByLabel('First day', { exact: true }).fill(EDITED_FIRST_DAY);
	await main.getByLabel('Last day', { exact: true }).fill(EDITED_LAST_DAY);

	// Audience. The level is a radio button, which is checked rather than filled.
	// `exact: true` again: the third choice reads "High school and university",
	// and without it that button would answer to "University" as well.
	await main.getByRole('radio', { name: EDITED_DETAILS.level, exact: true }).check();
	await main.getByLabel('Language', { exact: true }).fill(EDITED_DETAILS.language);
	await main
		.getByLabel('Expected delegates', { exact: true })
		.fill(EDITED_DETAILS.expectedDelegates);
	await main.getByLabel('Minimum age', { exact: true }).fill(EDITED_DETAILS.minAge);
	await main.getByLabel('Maximum age', { exact: true }).fill(EDITED_DETAILS.maxAge);
	await main.getByLabel('Currency', { exact: true }).selectOption(EDITED_DETAILS.currency);

	// Contact and links.
	await main.getByLabel('Contact email', { exact: true }).fill(EDITED_DETAILS.contactEmail);
	await main.getByLabel('Website', { exact: true }).fill(EDITED_DETAILS.websiteUrl);
	await main.getByLabel('Instagram', { exact: true }).fill(EDITED_DETAILS.instagramUrl);
	await main.getByLabel('Facebook', { exact: true }).fill(EDITED_DETAILS.facebookUrl);
	await main.getByLabel('LinkedIn', { exact: true }).fill(EDITED_DETAILS.linkedinUrl);
	await main.getByLabel('YouTube', { exact: true }).fill(EDITED_DETAILS.youtubeUrl);
	await main.getByLabel('TikTok', { exact: true }).fill(EDITED_DETAILS.tiktokUrl);
	await main.getByLabel('Phone', { exact: true }).fill(EDITED_DETAILS.contactPhone);

	await saveAndContinue(page, conference);

	// What the database really holds afterwards, which is the half a page cannot
	// prove about itself.
	const saved = await readSavedConference(conference.id);

	expect(saved).toMatchObject({
		name: editedName,
		tagline: EDITED_DETAILS.tagline,
		description: EDITED_DETAILS.description,
		venue_name: EDITED_DETAILS.venueName,
		venue_address: EDITED_DETAILS.venueAddress,
		city: EDITED_DETAILS.city,
		country_code: EDITED_DETAILS.countryCode,
		timezone: EDITED_DETAILS.timezone,
		start_date: EDITED_FIRST_DAY,
		end_date: EDITED_LAST_DAY,
		level: 'university',
		language: EDITED_DETAILS.language,
		expected_delegates: 450,
		min_age: 16,
		max_age: 24,
		currency: EDITED_DETAILS.currency,
		contact_email: EDITED_DETAILS.contactEmail,
		// People usually type `www.example.org` rather than the whole address, so
		// the server puts `https://` in front of each of these before saving them.
		website_url: `https://${EDITED_DETAILS.websiteUrl}`,
		instagram_url: `https://${EDITED_DETAILS.instagramUrl}`,
		facebook_url: `https://${EDITED_DETAILS.facebookUrl}`,
		linkedin_url: `https://${EDITED_DETAILS.linkedinUrl}`,
		youtube_url: `https://${EDITED_DETAILS.youtubeUrl}`,
		tiktok_url: `https://${EDITED_DETAILS.tiktokUrl}`,
		contact_phone: EDITED_DETAILS.contactPhone
	});

	// And the page shows them again when the organiser comes back to it.
	await goToDetailsEditor(page, conference);

	await expect(main.getByLabel('Name', { exact: true })).toHaveValue(editedName);
	await expect(main.getByLabel('Tagline', { exact: true })).toHaveValue(EDITED_DETAILS.tagline);
	await expect(main.getByLabel('City', { exact: true })).toHaveValue(EDITED_DETAILS.city);
	await expect(main.getByLabel('Country', { exact: true })).toHaveValue(EDITED_DETAILS.countryCode);
	await expect(main.getByLabel('Maximum age', { exact: true })).toHaveValue(EDITED_DETAILS.maxAge);
	await expect(main.getByLabel('Contact email', { exact: true })).toHaveValue(
		EDITED_DETAILS.contactEmail
	);
	await expect(main.getByLabel('Phone', { exact: true })).toHaveValue(EDITED_DETAILS.contactPhone);
	// With the `https://` the server put in front of it, as the website comes back.
	await expect(main.getByLabel('YouTube', { exact: true })).toHaveValue(
		`https://${EDITED_DETAILS.youtubeUrl}`
	);
});

test('answers every field that needs fixing at once, rather than one per attempt', async ({
	page
}) => {
	const conference = await openDetailsEditor(page, 'All Errors MUN');

	// Posted by hand rather than typed into the page. Several of these fields are
	// `required`, the two ages and the size are `number` boxes with a `min` and a
	// `max`, and the contact address is an `email` box, so a browser refuses to
	// send bad values at all — which is the right behaviour, and is also why the
	// server's own answer can only be seen by asking it directly. The two headers
	// `postFormAction` sends are what make the answer the page a browser with no
	// script would be shown.
	const response = await postFormAction(page, `${conference.detailsPath}?/save`, EVERY_FIELD_WRONG);

	expect(response.status()).toBe(400);

	const answer = await response.text();

	// Every one of them, on the one page. That is the criterion: ten things to
	// fix, said once, rather than ten attempts each ending in one sentence.
	for (const message of EVERY_MESSAGE_AT_ONCE) {
		expect(answer).toContain(message);
	}

	// The two ages are the one pair that cannot both be wrong in the same way at
	// the same time: an age outside 10 to 99 is answered for that, and only two
	// ages the page accepts are compared with each other. So the order is asked
	// about on its own.
	const outOfOrder = await postFormAction(page, `${conference.detailsPath}?/save`, {
		...EVERY_FIELD_WRONG,
		minAge: '30',
		maxAge: '20'
	});

	expect(outOfOrder.status()).toBe(400);
	expect(await outOfOrder.text()).toContain('The maximum age cannot be below the minimum.');

	// Nothing was saved by either of them: the conference still has the name
	// it was made with.
	const saved = await readSavedConference(conference.id);

	expect(saved.name).toBe(conference.name);
});

test('uploads a banner, replaces it and takes the old picture out of the bucket', async ({
	page
}) => {
	const conference = await openDetailsEditor(page, 'Banner MUN');

	const main = page.getByRole('main');

	// Nothing has been uploaded yet, so there is no picture and nothing to remove.
	expect(await readImagePath(conference.id, 'banner')).toBeNull();
	await expect(main.getByRole('button', { name: 'Remove banner' })).toHaveCount(0);

	// `setInputFiles` puts a file into the file box without one existing on disk.
	// It is the browser doing it rather than a script, which is why this test
	// passes on the `desktop-no-js` project like every other one here.
	await main.getByLabel('Banner', { exact: true }).setInputFiles(SMALL_PNG);
	await saveAndContinue(page, conference);

	const firstPath = await readSavedPicturePath(conference.id, 'banner');

	await expectFolderHolds(conference.id, [firstPath]);

	// Replacing it. The same form, a second picture. Opening the page afresh
	// also clears the first save's toast, so the one waited for is this save's.
	await goToDetailsEditor(page, conference);
	await main.getByLabel('Banner', { exact: true }).setInputFiles(REPLACEMENT_PNG);
	await saveAndContinue(page, conference);

	const secondPath = await readSavedPicturePath(conference.id, 'banner');

	expect(secondPath).not.toBe(firstPath);

	// The whole point of the replacement half: one object in the folder and not
	// two, so the picture that was replaced is really gone rather than left
	// behind paying for storage nobody looks at.
	await expectFolderHolds(conference.id, [secondPath]);

	// And taking it away. Removing stays on the details page, because it is
	// not the step's own save.
	await goToDetailsEditor(page, conference);
	await main.getByRole('button', { name: 'Remove banner' }).press('Enter');

	await expect(page.getByText('Image removed.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	expect(await readImagePath(conference.id, 'banner')).toBeNull();
	await expectFolderHolds(conference.id, []);
	await expect(main.getByRole('button', { name: 'Remove banner' })).toHaveCount(0);
});

test('uploads a logo and takes it away again', async ({ page }) => {
	const conference = await openDetailsEditor(page, 'Logo MUN');

	const main = page.getByRole('main');

	await main.getByLabel('Logo', { exact: true }).setInputFiles(SMALL_LOGO_PNG);
	await saveAndContinue(page, conference);

	const logoPath = await readSavedPicturePath(conference.id, 'logo');

	await expectFolderHolds(conference.id, [logoPath]);

	// The two remove buttons post to an action of their own, `?/removeImage`,
	// with the kind of picture in the address, so the logo's button never takes
	// the banner away.
	await goToDetailsEditor(page, conference);
	await main.getByRole('button', { name: 'Remove logo' }).press('Enter');

	await expect(page.getByText('Image removed.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	expect(await readImagePath(conference.id, 'logo')).toBeNull();
	await expectFolderHolds(conference.id, []);
});

test('refuses a file that is not a picture, and one over five megabytes', async ({ page }) => {
	const conference = await openDetailsEditor(page, 'Bad Picture MUN');

	const main = page.getByRole('main');

	// The `accept` attribute only tells the file picker which files to offer, so
	// a file of another kind still reaches the server. That is why the server
	// checks the type as well, and why this test can hand the form a PDF.
	await main.getByLabel('Banner', { exact: true }).setInputFiles(A_PDF);
	await main.getByRole('button', { name: 'Save and continue' }).press('Enter');

	await expect(main.getByText('Please upload a JPEG, PNG or WebP image.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await main.getByLabel('Logo', { exact: true }).setInputFiles(OVERSIZED_PNG);
	await main.getByRole('button', { name: 'Save and continue' }).press('Enter');

	await expect(main.getByText('The image must be under 5 MB.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// Neither picture was saved, and neither is in the bucket: a refused upload
	// leaves nothing behind.
	expect(await readImagePath(conference.id, 'banner')).toBeNull();
	expect(await readImagePath(conference.id, 'logo')).toBeNull();
	await expectFolderHolds(conference.id, []);
});

test('locks the currency once the conference has an invoice', async ({ page }) => {
	const conference = await openDetailsEditor(page, 'Invoiced MUN');

	const main = page.getByRole('main');

	// Nothing is owed yet, so the currency is still the organiser's to choose.
	await expect(main.getByLabel('Currency', { exact: true })).toBeVisible();

	// The organiser is the payer here only because an invoice has to be owed by
	// somebody real, and this test has exactly one account.
	await raiseInvoice(conference.id, conference.slug, conference.user.id);
	await page.reload();

	// The dropdown is gone — the page file draws the code as words instead — and
	// a sentence stands in its place, because an invoice is written in the
	// conference's currency and changing it now would reprice money somebody has
	// already been asked for.
	await expect(main.getByText('The currency cannot change once invoices exist.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByLabel('Currency', { exact: true })).toHaveCount(0);

	// And a locked form still saves everything else. There is no control to send
	// a currency with any more, so the field arrives empty, which the page file
	// says means "leave it": the saved code has to be put back before the row is
	// written, or the column would be emptied by somebody changing the tagline.
	await main.getByLabel('Tagline', { exact: true }).fill(EDITED_DETAILS.tagline);
	await saveAndContinue(page, conference);

	const saved = await readSavedConference(conference.id);

	expect(saved.tagline).toBe(EDITED_DETAILS.tagline);
	expect(saved.currency).toBe('EUR');
});

test('offers a preview of the public page while the conference is still a draft', async ({
	page
}) => {
	const conference = await openDetailsEditor(page, 'Preview MUN');

	const publicPath = `/conferences/${conference.slug}`;
	const preview = page.getByRole('main').getByRole('link', { name: 'Preview public page' });

	/*
		The end of the address rather than the whole of it. `resolve()` from
		`$app/paths` answers a *relative* address while a page is being built on
		the server — `../../conferences/<slug>` — so an exact match would pass on
		the two projects that run JavaScript and fail on `desktop-no-js`. Either
		form ends the same way, and the click below proves where the link really
		leads. `tests/e2e/auth.spec.ts` matches its terms and privacy links the
		same way.
	*/
	await expect(preview).toHaveAttribute('href', new RegExp(`${publicPath}$`));

	// Nobody has published anything, which is the point: the public page answers
	// a visitor with a 404 while a conference is a draft, and the people running
	// it with the page itself, so that they can see what they are about to
	// publish.
	expect(await readConferenceStatus(conference.id)).toBe('draft');

	// A plain link in the same tab, which is what the page file asks for, so
	// following it is a click and nothing more.
	await preview.click();

	await expect(page).toHaveURL(publicPath, { timeout: DATABASE_TIMEOUT_MS });
	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
		conference.name
	);
});

test('tells a published conference that its changes are seen straight away', async ({ page }) => {
	const conference = await openDetailsEditor(page, 'Public Notice MUN');

	// Publishing is the dashboard's work and has its own tests in
	// `manage-dashboard.spec.ts`, so the service-role client sets the column
	// rather than this test walking the checklist to get there.
	await setConferenceColumns(conference.id, { status: 'published' });
	await page.reload();

	await expect(
		page.getByRole('main').getByText('This conference is public. Changes appear immediately.')
	).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
});

test('answers somebody who posts to removeImage for a conference they do not run', async ({
	page
}) => {
	const conference = await openDetailsEditor(page, 'Not Yours MUN');
	const bannerPath = await giveConferenceAPicture(conference.id, 'banner');

	// A second account, signed in in place of the first. Clearing the cookies is
	// what ends the organiser's session; without that, `/login` would send an
	// account that is already signed in somewhere else.
	await page.context().clearCookies();

	const stranger = await createTestUser('Tomas Novak');
	await signIn(page, stranger);

	const response = await postFormAction(page, `${conference.detailsPath}?/removeImage&kind=banner`);

	// A 404 rather than a 403, for the reason `manage.spec.ts` gives about the
	// page itself: the answer must not tell a stranger which conferences exist.
	// The action checks the role for itself rather than trusting the page that
	// drew the button, which is what the criterion asks.
	expect(response.status()).toBe(404);

	// And the refusal is the whole point, so the picture is exactly where it was.
	expect(await readImagePath(conference.id, 'banner')).toBe(bannerPath);
	await expectFolderHolds(conference.id, [bannerPath]);
});

test('nothing spills off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	// A long name on purpose. A line that may not wrap is as wide as its text
	// however narrow its column is, which is what pushes a page sideways, and a
	// short name would never show it.
	const conference = await openDetailsEditor(
		page,
		'Phone Details International Model United Nations Conference'
	);

	// A page with everything on it: both pictures, so both previews and both
	// remove buttons are drawn, and the longest text each field takes.
	await giveConferenceAPicture(conference.id, 'banner');
	await giveConferenceAPicture(conference.id, 'logo');
	await setConferenceColumns(conference.id, {
		tagline: 'Three days of debate on the water, with delegates from every corner of Europe',
		venue_name: 'Beurs van Berlage Conference and Exhibition Centre',
		venue_address: 'Damrak 243, 1012 ZJ Amsterdam, the Netherlands',
		contact_email: 'organising.committee@phone-details-international-mun.example.org',
		website_url: 'https://www.phone-details-international-model-united-nations.example.org',
		instagram_url: 'https://www.instagram.com/phone-details-international-mun'
	});

	await page.reload();

	// Wait for the page to be the one this test is about before measuring it.
	await expect(page.getByRole('button', { name: 'Remove banner' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await expectNoSidewaysOverflow(page);
});

test('the whole form fits in a few screens', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const conference = await openDetailsEditor(page, 'Height Check Details MUN');

	// The tallest the page ever is: both pictures, so both previews are drawn at
	// their full size, and every section filled in.
	await giveConferenceAPicture(conference.id, 'banner');
	await giveConferenceAPicture(conference.id, 'logo');
	await setConferenceColumns(conference.id, {
		tagline: EDITED_DETAILS.tagline,
		description: EDITED_DETAILS.description,
		venue_name: EDITED_DETAILS.venueName,
		venue_address: EDITED_DETAILS.venueAddress,
		contact_email: EDITED_DETAILS.contactEmail,
		contact_phone: EDITED_DETAILS.contactPhone,
		website_url: `https://${EDITED_DETAILS.websiteUrl}`,
		instagram_url: `https://${EDITED_DETAILS.instagramUrl}`,
		facebook_url: `https://${EDITED_DETAILS.facebookUrl}`,
		linkedin_url: `https://${EDITED_DETAILS.linkedinUrl}`,
		youtube_url: `https://${EDITED_DETAILS.youtubeUrl}`,
		tiktok_url: `https://${EDITED_DETAILS.tiktokUrl}`
	});

	await page.reload();

	await expect(page.getByRole('button', { name: 'Remove logo' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// Saved before the assertion, so that a failure leaves a picture of the page
	// that failed it.
	await saveFullPageScreenshot(page, 'manage-details');
	await expectPageFitsInScreens(page, MANAGE_DETAILS_SCREENS);
});
