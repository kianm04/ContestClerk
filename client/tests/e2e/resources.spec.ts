import { expect, test, type Page } from '@playwright/test';
import { createTestUser, makeCommitteeChair, signIn, type TestUser } from './signed-in-user';
import { expectNoSidewaysOverflow } from './page-shape';
import { addScheduleCommittee, createScheduleConference } from './schedule-fixtures';
import { addBackgroundGuideFile, addResourceFile, seatAsDelegate } from './resources-fixtures';

// The acceptance criteria of `specs/05-pages/delegate/resources.md`, for the
// page T37 builds at `/resources`:
//
// * every resource and background guide the reader may read is listed,
//   grouped by conference;
// * a `staff` audience file is invisible to delegates;
// * the conference filter is in the URL and works without JavaScript;
// * downloads open signed URLs.
//
// The filter is a real `<form method="get">` and every other control is a
// plain link, so these tests run on the `desktop-no-js` project like every
// other page built this way, and that is the no-JavaScript proof.

/** How long an assertion that waits on a page reading the database may take. */
const DATABASE_TIMEOUT_MS = 15_000;

/** Open `/resources` and wait until it has really arrived. */
async function openResources(page: Page, search = ''): Promise<void> {
	await page.goto(`/resources${search}`);

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Resources', {
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** Sign a new delegate in, seated under `seatName` in `committeeId`. */
async function signInAsDelegate(
	page: Page,
	committeeId: string,
	seatName = 'France'
): Promise<TestUser> {
	const delegate = await createTestUser('Daniel Okafor');
	await seatAsDelegate(delegate, committeeId, seatName);
	await signIn(page, delegate);

	return delegate;
}

test.beforeEach(() => {
	test.slow();
});

test('lists resources and background guides across every conference the reader is part of, grouped by conference', async ({
	page
}) => {
	const organiser = await createTestUser('Priya Nair');

	const firstConference = await createScheduleConference({
		owner: organiser,
		namePrefix: 'Delft Resources MUN'
	});
	const firstCommittee = await addScheduleCommittee(firstConference.id, {
		name: 'Security Council',
		abbreviation: 'UNSC'
	});
	await addResourceFile({
		conferenceId: firstConference.id,
		uploadedBy: organiser.id,
		title: 'Rules of procedure',
		audience: 'delegates'
	});
	await addBackgroundGuideFile({
		conferenceId: firstConference.id,
		committeeId: firstCommittee,
		uploadedBy: organiser.id,
		audience: 'everyone'
	});

	const secondConference = await createScheduleConference({
		owner: organiser,
		namePrefix: 'LSE Resources MUN'
	});
	const secondCommittee = await addScheduleCommittee(secondConference.id, {
		name: 'General Assembly',
		abbreviation: 'GA'
	});
	await addResourceFile({
		conferenceId: secondConference.id,
		uploadedBy: organiser.id,
		title: 'Venue map',
		audience: 'delegates'
	});

	const delegate = await createTestUser('Daniel Okafor');
	await seatAsDelegate(delegate, firstCommittee, 'France');
	await seatAsDelegate(delegate, secondCommittee, 'Germany');
	await signIn(page, delegate);

	await openResources(page);

	const firstGroup = page.getByRole('region', { name: firstConference.name });
	const secondGroup = page.getByRole('region', { name: secondConference.name });

	await expect(firstGroup.getByText('Rules of procedure')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(firstGroup.getByText('Background guide')).toBeVisible();
	// A background guide carries its committee's abbreviation as a badge.
	await expect(firstGroup.getByText('UNSC')).toBeVisible();

	await expect(secondGroup.getByText('Venue map')).toBeVisible();
});

test('hides a staff-only file from a delegate, and shows one addressed to delegates', async ({
	page
}) => {
	const organiser = await createTestUser('Priya Nair');
	const conference = await createScheduleConference({
		owner: organiser,
		namePrefix: 'Staff Only Resources MUN'
	});
	const committeeId = await addScheduleCommittee(conference.id, {
		name: 'Security Council',
		abbreviation: 'UNSC'
	});

	await addResourceFile({
		conferenceId: conference.id,
		uploadedBy: organiser.id,
		title: 'Chair briefing notes',
		audience: 'staff'
	});
	await addResourceFile({
		conferenceId: conference.id,
		uploadedBy: organiser.id,
		title: 'Delegate handbook',
		audience: 'delegates'
	});

	await signInAsDelegate(page, committeeId);
	await openResources(page);

	const main = page.getByRole('main');

	await expect(main.getByText('Delegate handbook')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(main.getByText('Chair briefing notes')).toHaveCount(0);
});

test('shows both committees to somebody who chairs one and is seated in the other', async ({
	page
}) => {
	const organiser = await createTestUser('Priya Nair');
	const conference = await createScheduleConference({
		owner: organiser,
		namePrefix: 'Two Roles Resources MUN'
	});
	const chairedCommittee = await addScheduleCommittee(conference.id, {
		name: 'Security Council',
		abbreviation: 'UNSC'
	});
	const seatedCommittee = await addScheduleCommittee(conference.id, {
		name: 'General Assembly',
		abbreviation: 'GA',
		position: 1
	});

	// The chair's own committee has a `staff` guide, which only its team may
	// read; the committee they merely sit in has one addressed to delegates.
	await addBackgroundGuideFile({
		conferenceId: conference.id,
		committeeId: chairedCommittee,
		uploadedBy: organiser.id,
		audience: 'staff'
	});
	await addBackgroundGuideFile({
		conferenceId: conference.id,
		committeeId: seatedCommittee,
		uploadedBy: organiser.id,
		audience: 'delegates'
	});

	const person = await createTestUser('Sofia Marino');
	await makeCommitteeChair(person, chairedCommittee);
	await seatAsDelegate(person, seatedCommittee, 'France');
	await signIn(page, person);

	await openResources(page);

	const main = page.getByRole('main');

	// Both rows are titled "Background guide"; the badge beside each is what
	// tells them apart, so this checks there are two of them, one per committee.
	await expect(main.getByText('Background guide', { exact: true })).toHaveCount(2, {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByText('UNSC', { exact: true })).toBeVisible();
	await expect(main.getByText('GA', { exact: true })).toBeVisible();
});

test('filters by conference through a real link in the address, without relying on JavaScript', async ({
	page
}) => {
	const organiser = await createTestUser('Priya Nair');

	const firstConference = await createScheduleConference({
		owner: organiser,
		namePrefix: 'Filter First MUN'
	});
	const firstCommittee = await addScheduleCommittee(firstConference.id, {
		name: 'Security Council',
		abbreviation: 'UNSC'
	});
	await addResourceFile({
		conferenceId: firstConference.id,
		uploadedBy: organiser.id,
		title: 'First conference rules',
		audience: 'delegates'
	});

	const secondConference = await createScheduleConference({
		owner: organiser,
		namePrefix: 'Filter Second MUN'
	});
	const secondCommittee = await addScheduleCommittee(secondConference.id, {
		name: 'General Assembly',
		abbreviation: 'GA'
	});
	await addResourceFile({
		conferenceId: secondConference.id,
		uploadedBy: organiser.id,
		title: 'Second conference rules',
		audience: 'delegates'
	});

	const delegate = await createTestUser('Daniel Okafor');
	await seatAsDelegate(delegate, firstCommittee, 'France');
	await seatAsDelegate(delegate, secondCommittee, 'Germany');
	await signIn(page, delegate);

	await openResources(page);

	const main = page.getByRole('main');
	await expect(main.getByText('First conference rules')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByText('Second conference rules')).toBeVisible();

	// A real `<select>` inside a `method="get"` form; choosing an option and
	// pressing the submit button is what a reader with no JavaScript does,
	// rather than the `change` handler `+page.svelte` only adds for a shortcut.
	await main.getByLabel('Conference').selectOption({ label: firstConference.name });
	await main.getByRole('button', { name: 'Filter', exact: true }).click();

	await expect(page).toHaveURL(new RegExp(`conference=${firstConference.slug}`), {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByText('First conference rules')).toBeVisible();
	await expect(main.getByText('Second conference rules')).toHaveCount(0);
});

test('says so when the reader has no resources yet', async ({ page }) => {
	const delegate = await createTestUser('Nobody With Resources');
	await signIn(page, delegate);

	await openResources(page);

	await expect(page.getByText('No resources yet.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
});

test('says so when the conference filter hides everything', async ({ page }) => {
	const organiser = await createTestUser('Priya Nair');

	const withResources = await createScheduleConference({
		owner: organiser,
		namePrefix: 'Has Resources MUN'
	});
	const withResourcesCommittee = await addScheduleCommittee(withResources.id, {
		name: 'Security Council',
		abbreviation: 'UNSC'
	});
	await addResourceFile({
		conferenceId: withResources.id,
		uploadedBy: organiser.id,
		title: 'Rules of procedure',
		audience: 'delegates'
	});

	// A second conference with no resources at all, which is what the filter
	// narrows down to below.
	const withoutResources = await createScheduleConference({
		owner: organiser,
		namePrefix: 'No Resources MUN'
	});
	const withoutResourcesCommittee = await addScheduleCommittee(withoutResources.id, {
		name: 'General Assembly',
		abbreviation: 'GA'
	});

	const delegate = await createTestUser('Daniel Okafor');
	await seatAsDelegate(delegate, withResourcesCommittee, 'France');
	await seatAsDelegate(delegate, withoutResourcesCommittee, 'Germany');
	await signIn(page, delegate);

	await openResources(page, `?conference=${withoutResources.slug}`);

	// `specs/05-pages/delegate/resources.md`'s "Empty" state for a filter that
	// hides everything, told apart from the plain "No resources yet." above by
	// its own wording rather than by which conference is named in it.
	await expect(page.getByText('No resources for this conference yet.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	// `exact: true` matters here: the page header's own subtitle text is
	// "Rules of procedure, background guides and other files your organisers
	// share.", which a plain substring match would also catch.
	await expect(page.getByText('Rules of procedure', { exact: true })).toHaveCount(0);
});

test('a Download link opens a signed Storage address rather than a public one', async ({
	page
}) => {
	const organiser = await createTestUser('Priya Nair');
	const conference = await createScheduleConference({
		owner: organiser,
		namePrefix: 'Signed Download MUN'
	});
	const committeeId = await addScheduleCommittee(conference.id, {
		name: 'Security Council',
		abbreviation: 'UNSC'
	});
	await addResourceFile({
		conferenceId: conference.id,
		uploadedBy: organiser.id,
		title: 'Rules of procedure',
		audience: 'delegates'
	});

	await signInAsDelegate(page, committeeId);
	await openResources(page);

	const downloadLink = page.getByRole('main').getByRole('link', { name: 'Download' });
	await expect(downloadLink).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// The `documents` bucket is private, so a working link has to be one of
	// Storage's own signed addresses, carrying a token, rather than a plain
	// public address the browser could open on its own. How long that token
	// lasts is `DOWNLOAD_LINK_SECONDS` in `$lib/server/document-storage.ts`,
	// which `src/lib/server/resources.test.ts` and `my-resources.test.ts`
	// check it is passed to every call that makes one; waiting out sixty
	// real seconds here would only make this test slow, not more certain.
	const href = await downloadLink.getAttribute('href');
	expect(href).toContain('/storage/v1/object/sign/documents/');
	expect(href).toContain('token=');

	// `rel="external"` opens it in a new tab rather than through SvelteKit's
	// own router, which does not know this address at all.
	await expect(downloadLink).toHaveAttribute('target', '_blank');
});

test('does not spill off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const organiser = await createTestUser('Priya Nair');
	const conference = await createScheduleConference({
		owner: organiser,
		namePrefix: 'Phone Resources International Model United Nations Conference'
	});
	const committeeId = await addScheduleCommittee(conference.id, {
		name: 'Security Council',
		abbreviation: 'UNSC'
	});
	await addResourceFile({
		conferenceId: conference.id,
		uploadedBy: organiser.id,
		title: 'Rules of procedure',
		audience: 'delegates'
	});

	await signInAsDelegate(page, committeeId);
	await openResources(page);

	await expect(page.getByText('Rules of procedure', { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expectNoSidewaysOverflow(page);
});
