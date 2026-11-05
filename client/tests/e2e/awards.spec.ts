import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	DATABASE_TIMEOUT_MS,
	makeChairedCommittee,
	waitUntilAnswered,
	type ChairedCommittee
} from './chair-room-fixtures';
import { skipWithoutJavaScript } from './in-place';
import {
	AT_ONCE_TIMEOUT_MS,
	answerSlowly,
	answerWithError,
	sawSpinner,
	watchForSpinners
} from './instant';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import { createScheduleConference } from './schedule-fixtures';
import { createTestUser, giveSeat, signIn, type TestUser } from './signed-in-user';
import { answerConfirmationPage } from './confirmation-page';

// The acceptance criteria of `specs/05-pages/chair/awards.md`,
// `specs/05-pages/organiser/awards.md`, the awards section of
// `specs/05-pages/delegate/profile.md` and the Awards card of
// `specs/05-pages/public/committee.md` that need a real browser: a chair
// proposing an award, a custom one included, the refused duplicate, the note
// count beside each proposal, the organiser confirming, adding and publishing,
// the refusal to publish an award on an empty seat, the delegate finding the
// award on their profile and on the committee page, and both pages on a phone.
// That a delegate cannot read an award before it is published is proven with
// the delegate's own client in `tests/db/awards.test.ts`.
//
// Every form is a plain `<form method="post">`, so every test that does not
// measure a page runs on all three projects, and `desktop-no-js` is the proof
// that the forms work without JavaScript, the custom title field included.

/** How long a single try inside a retrying block may take. */
const SINGLE_TRY_TIMEOUT_MS = 2_000;

/** How long the entry script is held back in the test of a form filled before it. */
const JAVASCRIPT_DELAY_MS = 2_000;

/** Long enough after that for Svelte to have finished bringing the page to life. */
const SETTLE_MS = 3_000;

/** How many screens the chair's awards page may take on a laptop. */
const CHAIR_AWARDS_SCREENS = 2;

/** How many screens the organiser's awards page may take on a laptop. */
const ORGANISER_AWARDS_SCREENS = 3;

/** A committee whose France and Ghana seats have delegates in them. Japan stays empty. */
type SeatedCommittee = ChairedCommittee & { franceDelegate: TestUser };

/** Make a committee with a chair and delegates in France and Ghana. */
async function makeSeatedCommittee(namePrefix: string): Promise<SeatedCommittee> {
	const room = await makeChairedCommittee(namePrefix);
	const franceDelegate = await createTestUser('Amélie Laurent');

	await giveSeat(franceDelegate, room.committeeId, 'France');
	await giveSeat(await createTestUser('Kofi Mensah'), room.committeeId, 'Ghana');

	return { ...room, franceDelegate };
}

/** The id of one of the committee's seats. */
async function readSeatId(committeeId: string, seatName: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('seats')
		.select('id')
		.eq('committee_id', committeeId)
		.eq('name', seatName)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the ${seatName} seat: ${error?.message}`);
	}

	return data.id;
}

/** One award written straight into the table, the way a chair's form would. */
type AwardSeed = {
	room: ChairedCommittee;
	seatName: string;
	status: 'proposed' | 'confirmed';
};

/** Write a Best Delegate award for one seat, proposed by the committee's chair. */
async function giveAward(seed: AwardSeed): Promise<void> {
	const admin = createServiceRoleClient();
	const seatId = await readSeatId(seed.room.committeeId, seed.seatName);

	const { error } = await admin.from('awards').insert({
		committee_id: seed.room.committeeId,
		seat_id: seatId,
		kind: 'best_delegate',
		title: 'Best Delegate',
		status: seed.status,
		created_by: seed.room.chair.id
	});

	if (error) {
		throw new Error(`Could not write the test award: ${error.message}`);
	}
}

/** Write a chair's note on one seat, so the awards page has something to count. */
async function giveNote(room: ChairedCommittee, seatName: string): Promise<void> {
	const admin = createServiceRoleClient();
	const seatId = await readSeatId(room.committeeId, seatName);

	const { error } = await admin.from('chair_notes').insert({
		committee_id: room.committeeId,
		seat_id: seatId,
		author_id: room.chair.id,
		body: 'Strong opening speech.'
	});

	if (error) {
		throw new Error(`Could not write the test note: ${error.message}`);
	}
}

/** The committee's awards as the database holds them, oldest first. */
async function readAwards(committeeId: string) {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('awards')
		.select('kind, title, status, user_id')
		.eq('committee_id', committeeId)
		.order('created_at', { ascending: true });

	if (error) {
		throw new Error(`Could not read the awards: ${error.message}`);
	}

	return data ?? [];
}

/** The conference's `awards_published_at`. */
async function readAwardsPublishedAt(conferenceId: string): Promise<string | null> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('conferences')
		.select('awards_published_at')
		.eq('id', conferenceId)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the conference: ${error?.message}`);
	}

	return data.awards_published_at;
}

/** The committee's own page, the chair room's address without `/chair`. */
function committeePath(room: ChairedCommittee): string {
	return `/conferences/${room.conferenceSlug}/committees/${room.committeeSlug}`;
}

/** Open the chair's awards page and wait for it. */
async function openChairAwards(page: Page, room: ChairedCommittee): Promise<void> {
	await page.goto(`${room.roomPath}/awards`);
	await expect(page.getByRole('heading', { name: 'Awards', level: 1 })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** Open the organiser's awards page and wait for it. */
async function openManageAwards(page: Page, room: ChairedCommittee): Promise<void> {
	await page.goto(`/manage/${room.conferenceSlug}/awards`);
	await expect(page.getByRole('heading', { name: 'Awards', level: 1 })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

/**
 * Open the "Add award" form under the test's one committee on the organiser's
 * page, and hand it back. "Add award" beside the committee's heading is a plain
 * link to `?add=<committee id>`, so it opens the form with JavaScript and
 * without it.
 */
async function openAddAwardForm(page: Page): Promise<Locator> {
	const committee = page
		.getByRole('main')
		.getByRole('region', { name: 'Security Council', exact: true });
	await committee.getByRole('link', { name: 'Add award' }).click();

	const form = committee.locator('form').filter({ hasText: 'Add award' });
	await expect(form).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	return form;
}

/**
 * The "Confirmed" status beside a confirmed award on the organiser's page.
 * `exact` keeps it from matching the "Confirmed." message or the "1 confirmed"
 * in the summary under the title.
 */
function confirmedStatus(page: Page): Locator {
	return page.getByRole('main').getByText('Confirmed', { exact: true });
}

/**
 * Press a `ConfirmButton` and answer the question it asks.
 *
 * With JavaScript the press opens a `<dialog>` whose own button submits. Without
 * it the press opens a confirmation page asking the same question, whose own
 * button submits. This waits to see which happened.
 * A copy of the one in `manage-documents.spec.ts`, for the reason that file gives.
 */
async function pressAndConfirm(page: Page, label: string): Promise<void> {
	const button = page.getByRole('main').getByRole('button', { name: label }).first();
	const dialogButton = page.getByRole('dialog').getByRole('button', { name: label }).first();

	await button.press('Enter');

	const isAsking = await dialogButton
		.waitFor({ state: 'visible', timeout: SINGLE_TRY_TIMEOUT_MS })
		.then(() => true)
		.catch(() => false);

	if (isAsking) {
		await dialogButton.press('Enter');
	} else {
		await answerConfirmationPage(page, label);
	}
}

test('both awards pages are not found for somebody who does not run them', async ({ page }) => {
	const room = await makeSeatedCommittee('Stranger Awards MUN');
	const otherRoom = await makeChairedCommittee('Other Awards MUN');

	await signIn(page, otherRoom.chair);
	const chairResponse = await page.goto(`${room.roomPath}/awards`);
	expect(chairResponse?.status()).toBe(404);

	await page.context().clearCookies();
	await signIn(page, otherRoom.organiser);
	const manageResponse = await page.goto(`/manage/${room.conferenceSlug}/awards`);
	expect(manageResponse?.status()).toBe(404);
});

// specs/05-pages/chair/awards.md's "No filled seats" state: `makeChairedCommittee`
// gives a committee its three seats already, and none of them holds a delegate
// until something (`giveSeat`, as `makeSeatedCommittee` above does) fills one.
test('tells the chair there is nobody to award yet, before any seat is filled', async ({
	page
}) => {
	const room = await makeChairedCommittee('No Delegates Awards MUN');

	await signIn(page, room.chair);
	await openChairAwards(page, room);

	await expect(page.getByRole('main').getByText('No delegates to award yet.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
});

// The organiser's half of the same page's states (specs/05-pages/organiser/awards.md):
// a committee with no filled seat has nothing to add an award to, and a
// conference with no committee has nowhere to give one.
test('tells the organiser which committee has nobody seated yet', async ({ page }) => {
	const room = await makeChairedCommittee('No Seated Awards MUN');

	await signIn(page, room.organiser);
	await openManageAwards(page, room);

	await expect(page.getByRole('main').getByText('No delegates seated.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('tells the organiser to add committees before any award', async ({ page }) => {
	const organiser = await createTestUser();
	const conference = await createScheduleConference({
		owner: organiser,
		namePrefix: 'No Committees Awards MUN'
	});

	await signIn(page, organiser);
	await page.goto(`/manage/${conference.slug}/awards`);

	await expect(page.getByText('No committees yet.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(page.getByRole('link', { name: 'Add committees' })).toBeVisible();
});

test('a chair proposes a listed award and a custom one, and a duplicate is refused', async ({
	page
}) => {
	const room = await makeSeatedCommittee('Propose Awards MUN');
	await giveNote(room, 'France');

	await signIn(page, room.chair);
	await openChairAwards(page, room);
	await expect(page.getByText('No proposals yet.')).toBeVisible();

	// The only form on the page with a Propose button.
	const form = page
		.getByRole('main')
		.locator('form')
		.filter({ has: page.getByRole('button', { name: 'Propose' }) });
	await form.getByLabel('Seat').selectOption({ label: 'France · Amélie Laurent' });
	await form.getByLabel('Award').selectOption({ label: 'Best Delegate' });
	await form.getByRole('button', { name: 'Propose' }).click();

	await expect(page.getByText('Award proposed.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expect(page.getByRole('heading', { name: 'Proposals (1)' })).toBeVisible();
	// The note written on France is counted beside its proposal.
	const franceRow = page.getByRole('listitem').filter({ hasText: 'Best Delegate' });
	await expect(franceRow).toContainText('1 note');

	// Without JavaScript the title field is always there; with it, picking
	// Custom brings it in. Either way the chair can fill it in.
	await form.getByLabel('Seat').selectOption({ label: 'Ghana · Kofi Mensah' });
	await form.getByLabel('Award').selectOption({ label: 'Custom' });
	await form.getByLabel('Title').fill('Best Diplomacy');
	await form.getByRole('button', { name: 'Propose' }).click();

	await expect(page.getByRole('heading', { name: 'Proposals (2)' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByRole('listitem').filter({ hasText: 'Best Diplomacy' })).toContainText(
		'0 notes'
	);

	await form.getByLabel('Seat').selectOption({ label: 'France · Amélie Laurent' });
	await form.getByLabel('Award').selectOption({ label: 'Best Delegate' });
	await form.getByRole('button', { name: 'Propose' }).click();

	await expect(page.getByText('France already has this award.').first()).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	const awards = await readAwards(room.committeeId);
	expect(awards.map((award) => [award.kind, award.title, award.status])).toEqual([
		['best_delegate', 'Best Delegate', 'proposed'],
		['custom', 'Best Diplomacy', 'proposed']
	]);
});

test('a chair withdraws their own proposal before it is published', async ({ page }) => {
	const room = await makeSeatedCommittee('Withdraw Awards MUN');
	await giveAward({ room, seatName: 'France', status: 'proposed' });

	await signIn(page, room.chair);
	await openChairAwards(page, room);
	await expect(page.getByRole('link', { name: 'Edit' })).toBeVisible();

	await pressAndConfirm(page, 'Withdraw');

	await expect(page.getByText('Proposal withdrawn.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(await readAwards(room.committeeId)).toEqual([]);
});

test('an organiser adds a custom award without JavaScript as well as with it', async ({ page }) => {
	const room = await makeSeatedCommittee('Add Awards MUN');

	await signIn(page, room.organiser);
	await openManageAwards(page, room);

	const form = await openAddAwardForm(page);
	await form.getByLabel('Seat').selectOption({ label: 'Ghana · Kofi Mensah' });
	await form.getByLabel('Award').selectOption({ label: 'Custom' });
	await form.getByLabel('Title').fill('Spirit of the Conference');
	await form.getByRole('button', { name: 'Add' }).click();

	await expect(page.getByText('Award added.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	const awards = await readAwards(room.committeeId);
	expect(awards.map((award) => [award.kind, award.title, award.status])).toEqual([
		['custom', 'Spirit of the Conference', 'confirmed']
	]);
});

test('a custom award picked and titled before the page came to life keeps its title', async ({
	page
}, testInfo) => {
	test.skip(
		testInfo.project.use.javaScriptEnabled === false,
		'Nothing comes to life without JavaScript, so nothing can hide the title.'
	);
	const room = await makeSeatedCommittee('Early Title Awards MUN');

	await signIn(page, room.organiser);
	// The entry script is held back, the way a slow connection holds it, so the
	// form is filled while it is still the server's HTML. `page.route` lets the
	// request through, only later (`typing-before-javascript.spec.ts`).
	await page.route('**/_app/immutable/entry/start.*.js', async (route) => {
		await new Promise((resolve) => setTimeout(resolve, JAVASCRIPT_DELAY_MS));
		await route.continue();
	});
	await openManageAwards(page, room);

	// Pressed while the script is still held back, "Add award" is an ordinary
	// link: the browser loads the page again, and the script is held back again.
	const form = await openAddAwardForm(page);
	await form.getByLabel('Seat').selectOption({ label: 'Ghana · Kofi Mensah' });
	await form.getByLabel('Award').selectOption({ label: 'Custom' });
	await form.getByLabel('Title').fill('Spirit of the Conference');
	// Wait out the delay above, so Svelte has had its turn at the page.
	await page.waitForTimeout(SETTLE_MS);

	await expect(form.getByLabel('Title')).toHaveValue('Spirit of the Conference');
	await form.getByRole('button', { name: 'Add' }).click();
	await expect(page.getByText('Award added.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
});

test('publishing is refused while a confirmed award points at an empty seat', async ({ page }) => {
	const room = await makeSeatedCommittee('Empty Seat Awards MUN');
	await giveAward({ room, seatName: 'France', status: 'confirmed' });
	await giveAward({ room, seatName: 'Japan', status: 'confirmed' });

	await signIn(page, room.organiser);
	await openManageAwards(page, room);
	await expect(page.getByText('Seat empty')).toBeVisible();

	// The publish button counts what it publishes: both confirmed awards.
	await page.getByRole('button', { name: 'Publish 2 awards' }).click();

	await expect(page.getByText(/points at an empty seat/).first()).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(await readAwardsPublishedAt(room.conferenceId)).toBeNull();
});

test('an organiser confirms and publishes, and the delegate finds the award on their profile', async ({
	page
}) => {
	const room = await makeSeatedCommittee('Publish Awards MUN');
	await giveAward({ room, seatName: 'France', status: 'proposed' });

	await signIn(page, room.organiser);
	await openManageAwards(page, room);
	await expect(page.getByText(`proposed by ${room.chair.fullName}`)).toBeVisible();

	await page.getByRole('button', { name: 'Confirm', exact: true }).click();
	await expect(page.getByText('Confirmed.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	expect((await readAwards(room.committeeId))[0].status).toBe('confirmed');

	// "Now" is the choice the form starts with.
	await page.getByRole('button', { name: 'Publish 1 award' }).click();
	await expect(page.getByText('Awards published. Recipients have been notified.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(await readAwardsPublishedAt(room.conferenceId)).not.toBeNull();
	// Publishing freezes the holder onto the award.
	expect((await readAwards(room.committeeId))[0].user_id).toBe(room.franceDelegate.id);

	// After publishing, the chair's page is read-only and says so.
	await page.context().clearCookies();
	await signIn(page, room.chair);
	await openChairAwards(page, room);
	await expect(page.getByText(/Awards were published on/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Propose' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Withdraw' })).toHaveCount(0);

	await page.context().clearCookies();
	await signIn(page, room.franceDelegate);
	await page.goto('/profile');
	await expect(page.getByText('Best Delegate', { exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	// The committee page shows it too, in its Awards card.
	await page.goto(committeePath(room));
	const awardsCard = page.getByRole('heading', { name: 'Awards', level: 2 }).locator('..');
	await expect(awardsCard).toContainText('Best Delegate', { timeout: DATABASE_TIMEOUT_MS });
	await expect(awardsCard).toContainText('France · Amélie Laurent');
});

// T142: with JavaScript "Confirm" changes the award the moment it is pressed,
// before the server has answered and with no spinner, and a press the server
// refuses goes back and says what did not happen.
test('confirms an award at once, and puts a refused delete back', async ({ page }, testInfo) => {
	skipWithoutJavaScript(testInfo);

	const room = await makeSeatedCommittee('Instant Awards MUN');
	await giveAward({ room, seatName: 'France', status: 'proposed' });

	await signIn(page, room.organiser);
	await openManageAwards(page, room);
	await expect(page.getByText(`proposed by ${room.chair.fullName}`)).toBeVisible();

	await answerSlowly(page, 'confirm');
	await watchForSpinners(page);
	await page.getByRole('button', { name: 'Confirm', exact: true }).click();

	// A confirmed award shows a "Confirmed" status where its Confirm button was.
	// "Unconfirm" is in the row's "…" menu now.
	await expect(confirmedStatus(page)).toBeVisible({ timeout: AT_ONCE_TIMEOUT_MS });
	await expect(page.getByText(/^1 confirmed · 0 proposed/)).toBeVisible({
		timeout: AT_ONCE_TIMEOUT_MS
	});

	await waitUntilAnswered(page);
	expect(await sawSpinner(page)).toBe(false);
	expect((await readAwards(room.committeeId))[0].status).toBe('confirmed');

	await answerWithError(page, 'delete');
	await pressAndConfirm(page, 'Delete');

	await expect(page.getByRole('alert')).toContainText('The award was not deleted.', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await waitUntilAnswered(page);
	await expect(confirmedStatus(page)).toBeVisible();
	expect(await readAwards(room.committeeId)).toHaveLength(1);
});

test('unpublishing hides the award from the profile and opens the page again', async ({ page }) => {
	const room = await makeSeatedCommittee('Unpublish Awards MUN');
	await giveAward({ room, seatName: 'France', status: 'confirmed' });

	await signIn(page, room.organiser);
	await openManageAwards(page, room);
	await page.getByRole('button', { name: 'Publish 1 award' }).click();
	await expect(page.getByText(/Delegates can see their awards on their profile/)).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	await pressAndConfirm(page, 'Unpublish');

	await expect(page.getByText('Awards hidden again. Notifications already sent stay.')).toBeVisible(
		{ timeout: DATABASE_TIMEOUT_MS }
	);
	expect(await readAwardsPublishedAt(room.conferenceId)).toBeNull();
	// Open again: the award is "Confirmed" rather than "Published", and can be deleted.
	await expect(confirmedStatus(page)).toBeVisible();
	await expect(page.getByRole('main').getByRole('button', { name: 'Delete' })).toBeVisible();

	await page.context().clearCookies();
	await signIn(page, room.franceDelegate);
	await page.goto('/profile');
	await expect(page.getByText('No awards yet.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });

	// The committee page has no Awards card for a delegate either.
	await page.goto(committeePath(room));
	await expect(page.getByRole('heading', { name: 'Topics' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByRole('heading', { name: 'Awards' })).toHaveCount(0);
});

test('the committee page shows a chair the proposals before they are published', async ({
	page
}) => {
	const room = await makeSeatedCommittee('Committee Page Awards MUN');
	await giveAward({ room, seatName: 'France', status: 'proposed' });

	await signIn(page, room.chair);
	await page.goto(committeePath(room));

	const awardsCard = page.getByRole('heading', { name: 'Awards', level: 2 }).locator('..');
	await expect(awardsCard).toContainText('Best Delegate', { timeout: DATABASE_TIMEOUT_MS });
	await expect(awardsCard).toContainText('Proposed');
});

test('on a phone, both awards pages fit the screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const room = await makeSeatedCommittee('Phone Awards MUN');
	await giveAward({ room, seatName: 'France', status: 'proposed' });

	await signIn(page, room.chair);
	await openChairAwards(page, room);
	await expectNoSidewaysOverflow(page);
	await saveFullPageScreenshot(page, 'chair-awards-phone');

	await page.context().clearCookies();
	await signIn(page, room.organiser);
	await openManageAwards(page, room);
	await expectNoSidewaysOverflow(page);
	await saveFullPageScreenshot(page, 'manage-awards-phone');
});

test('on a laptop, both awards pages stay short', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'One project is enough to measure a height.');

	const room = await makeSeatedCommittee('Desktop Awards MUN');
	await giveAward({ room, seatName: 'France', status: 'proposed' });
	await giveAward({ room, seatName: 'Ghana', status: 'confirmed' });

	await signIn(page, room.chair);
	await openChairAwards(page, room);
	await expectPageFitsInScreens(page, CHAIR_AWARDS_SCREENS);
	await saveFullPageScreenshot(page, 'chair-awards-desktop');

	await page.context().clearCookies();
	await signIn(page, room.organiser);
	await openManageAwards(page, room);
	await expectPageFitsInScreens(page, ORGANISER_AWARDS_SCREENS);
	await saveFullPageScreenshot(page, 'manage-awards-desktop');
});
