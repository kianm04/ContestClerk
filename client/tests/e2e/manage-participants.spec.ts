import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { createTestUser, giveInvoice, signIn, type TestUser } from './signed-in-user';
import {
	expectNoSidewaysOverflow,
	expectPageFitsInScreens,
	saveFullPageScreenshot
} from './page-shape';
import {
	addScheduleCommittee,
	createScheduleConference,
	type ScheduleConference
} from './schedule-fixtures';
import { addPositionPaper, seatAcceptedApplicantAs, seatDelegateAs } from './document-fixtures';
import { addAcceptedDelegation } from './announcement-fixtures';
import { answerConfirmationPage } from './confirmation-page';

// The acceptance criteria of `specs/05-pages/organiser/participants.md` that need
// a real browser, for the page task T38 builds at `/manage/[slug]/participants`:
//
// * every filled seat appears exactly once; a reserved seat and a free one never;
// * the invoice and paper statuses carry the fees page's and the documents page's
//   words;
// * the filters live in the address, and the export honours them;
// * the CSV holds the private columns and answers anybody else with a 404;
// * "Remove from seat" frees the seat and cancels its unpaid invoice, as the
//   allocation grid's "Free seat" does;
// * the table becomes cards on a phone, and nothing spills sideways.
//
// EVERY FORM WITHOUT JAVASCRIPT
// The filters are a real `<form method="get">` and "Remove from seat" a real
// `<form method="post">`, so these tests run on the `desktop-no-js` project
// like every other and that is the proof.
//
// Every test makes its own conference in `schedule-fixtures.ts`, which says why
// they run in May 2020.

/** How long an assertion that waits on a page reading the database may take. */
const DATABASE_TIMEOUT_MS = 15_000;

/** How long a single try inside a retrying block may take. */
const SINGLE_TRY_TIMEOUT_MS = 2_000;

/** How many windows tall the page may be with a handful of participants on it. */
const MANAGE_PARTICIPANTS_SCREENS = 3;

/** An organiser signed in with a conference of their own, and a committee in it. */
type SignedInOrganiser = {
	conference: ScheduleConference;
	committeeId: string;
	/** `/manage/<slug>/participants`. */
	participantsPath: string;
};

/** Sign a brand-new organiser in and give them a conference with one committee. */
async function signInWithAConference(page: Page, prefix: string): Promise<SignedInOrganiser> {
	const organiser = await createTestUser('Priya Nair');
	await signIn(page, organiser);

	const conference = await createScheduleConference({ owner: organiser, namePrefix: prefix });
	const committeeId = await addScheduleCommittee(conference.id, {
		name: 'Security Council',
		abbreviation: 'UNSC'
	});

	return {
		conference,
		committeeId,
		participantsPath: `/manage/${conference.slug}/participants`
	};
}

/** Add a seat nobody sits in, reserved for a delegation when one is named. */
async function addEmptySeat(
	committeeId: string,
	seatName: string,
	delegationId: string | null
): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin
		.from('seats')
		.insert({ committee_id: committeeId, name: seatName, delegation_id: delegationId });

	if (error) {
		throw new Error(`Could not add the empty test seat: ${error.message}`);
	}
}

/** Who sits in a seat now, and the status of the invoice raised for it. */
async function readSeatAndInvoice(
	seatId: string,
	invoiceId: string
): Promise<{ userId: string | null; invoiceStatus: string }> {
	const admin = createServiceRoleClient();

	const seat = await admin.from('seats').select('user_id').eq('id', seatId).single();
	const invoice = await admin.from('invoices').select('status').eq('id', invoiceId).single();

	if (seat.error || invoice.error) {
		throw new Error('Could not read the test seat or its invoice back.');
	}

	return { userId: seat.data.user_id, invoiceStatus: invoice.data.status };
}

/** Open one address of the page and wait until it has really arrived. */
async function openParticipants(page: Page, address: string): Promise<void> {
	await page.goto(address);

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
		'Participants',
		{ timeout: DATABASE_TIMEOUT_MS }
	);
}

/**
 * The visible table row or phone card that names this participant.
 *
 * Both the table and the cards are in the page; CSS shows one of them and hides
 * the other, so only the visible one is counted.
 */
function participantEntry(page: Page, fullName: string): Locator {
	return page
		.getByRole('main')
		.locator('tr, li')
		.filter({ hasText: fullName })
		.filter({ visible: true });
}

/**
 * Press a visible `ConfirmButton` and answer the question it asks.
 *
 * With JavaScript the press opens a `<dialog>` whose own button submits. Without
 * it the press opens a confirmation page asking the same question, whose own
 * button submits. This waits to see which happened. Unlike the copy in
 * `manage-documents.spec.ts` it skips the hidden button of the
 * layout CSS is not showing, because this page draws every row twice.
 */
async function pressAndConfirm(page: Page, label: string): Promise<void> {
	const button = page
		.getByRole('main')
		.getByRole('button', { name: label })
		.filter({ visible: true })
		.first();
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

/** Seat Anna with an unpaid invoice and Bruno with a paper, beside two empty seats. */
async function seatTwoDelegates(
	organiser: SignedInOrganiser
): Promise<{ anna: TestUser; bruno: TestUser }> {
	const { conference, committeeId } = organiser;

	const anna = await createTestUser('Anna Kowalski');
	// Both sit with an accepted application behind the seat, which is what lets
	// the team read their private columns (migration 20261022110000).
	const annaSeatId = await seatAcceptedApplicantAs(anna, conference.id, committeeId, 'France');
	await giveInvoice(anna, {
		conferenceId: conference.id,
		number: `test-${crypto.randomUUID().slice(0, 8)}`,
		status: 'unpaid',
		description: 'Delegate fee',
		unitAmountCents: 4500,
		seatId: annaSeatId
	});

	const bruno = await createTestUser('Bruno Alves');
	const brunoSeatId = await seatAcceptedApplicantAs(bruno, conference.id, committeeId, 'Brazil');
	await addPositionPaper({
		conferenceId: conference.id,
		committeeId,
		seatId: brunoSeatId,
		delegate: bruno
	});

	const delegationId = await addAcceptedDelegation(conference.id, 'Lycée Français');
	await addEmptySeat(committeeId, 'Chile', delegationId);
	await addEmptySeat(committeeId, 'Germany', null);

	return { anna, bruno };
}

// Every test signs a new account in and reads or posts against the one local
// database the whole suite shares. `test.slow()` triples the time allowed.
test.beforeEach(() => {
	test.slow();
});

test('lists every filled seat once with its statuses, and keeps the filters in the address', async ({
	page
}) => {
	const organiser = await signInWithAConference(page, 'Participants List MUN');
	await seatTwoDelegates(organiser);
	await openParticipants(page, organiser.participantsPath);

	const anna = participantEntry(page, 'Anna Kowalski');
	const bruno = participantEntry(page, 'Bruno Alves');

	await expect(anna).toHaveCount(1);
	await expect(bruno).toHaveCount(1);
	// The seat and its committee: the committee under the seat in the table,
	// before it on a phone's card ("UNSC · France").
	await expect(anna).toContainText('France');
	await expect(anna).toContainText('UNSC');
	await expect(anna).toContainText('Unpaid');
	await expect(anna).toContainText('Missing');
	await expect(bruno).toContainText('No invoice');
	await expect(bruno).toContainText('Awaiting review');

	// The reserved seat and the free one are seats, not participants, so no
	// row or card names them.
	await expect(participantEntry(page, 'Chile')).toHaveCount(0);
	await expect(participantEntry(page, 'Germany')).toHaveCount(0);

	const main = page.getByRole('main');
	await main.getByLabel('Paper', { exact: true }).selectOption('missing');
	await main.getByRole('button', { name: 'Apply filters' }).press('Enter');

	await expect(page).toHaveURL(/[?&]paper=missing/, { timeout: DATABASE_TIMEOUT_MS });
	await expect(bruno).toHaveCount(0);
	await expect(anna).toHaveCount(1);

	// A refresh reads the same address, so it shows the same list.
	await page.reload();
	await expect(bruno).toHaveCount(0);
	await expect(anna).toHaveCount(1);
});

test('puts the delegate’s own flag by their name, not by the seat', async ({ page }) => {
	const organiser = await signInWithAConference(page, 'Participants Flag MUN');
	await seatTwoDelegates(organiser);
	await openParticipants(page, organiser.participantsPath);

	// Every test account is Dutch (`signed-in-user.ts`), and Anna sits as France,
	// so a Dutch flag beside "France" would say something untrue about the seat.
	const flag = participantEntry(page, 'Anna Kowalski').getByRole('img', { name: 'Netherlands' });
	const besideTheFlag = flag.locator('xpath=..');

	await expect(besideTheFlag).toContainText('Anna Kowalski');
	await expect(besideTheFlag).not.toContainText('France');
});

test('says "No participants match." when the search finds nobody', async ({ page }) => {
	const organiser = await signInWithAConference(page, 'Participants Search Miss MUN');
	await seatTwoDelegates(organiser);
	await openParticipants(page, organiser.participantsPath);

	const main = page.getByRole('main');

	// There are participants seated, so a plain "nobody is seated" state would
	// be the wrong message; this is the filters hiding everybody instead.
	await main.getByLabel('Search participants').fill('Nobody Called This');
	await main.getByRole('button', { name: 'Apply filters' }).press('Enter');

	await expect(page).toHaveURL(/[?&]q=/, { timeout: DATABASE_TIMEOUT_MS });
	await expect(main.getByText('No participants match.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(main.getByText('Nobody is seated yet.')).toHaveCount(0);
});

test('exports the participants the filters show, private columns included', async ({ page }) => {
	const organiser = await signInWithAConference(page, 'Participants Export MUN');
	const { anna } = await seatTwoDelegates(organiser);
	await openParticipants(page, `${organiser.participantsPath}?paper=missing`);

	const exportLink = page.getByRole('main').getByRole('link', { name: 'Export CSV' });
	const exportHref = await exportLink.getAttribute('href');

	expect(exportHref).toContain('paper=missing');

	const response = await page.request.get(exportHref ?? '');

	expect(response.status()).toBe(200);
	expect(response.headers()['content-disposition']).toContain(
		`participants-${organiser.conference.slug}-`
	);

	const text = await response.text();
	const lines = text.trim().split(/\r?\n/);

	expect(lines[0]).toContain('Email');
	expect(lines[0]).toContain('Date of birth');
	expect(lines[0]).toContain('Emergency contact phone');
	expect(lines).toHaveLength(2);
	expect(lines[1]).toContain('Anna Kowalski');
	expect(lines[1]).toContain(anna.email);
	expect(text).not.toContain('Bruno Alves');
});

test('answers the CSV of a conference somebody else runs with a 404', async ({ page }) => {
	const organiser = await signInWithAConference(page, 'Not My Participants MUN');
	const exportPath = `${organiser.participantsPath}/export`;

	// Their own CSV opens, so that the refusal below is about the reader and not
	// about the address being wrong.
	const mine = await page.request.get(exportPath);

	expect(mine.status()).toBe(200);

	// Clearing the cookies ends the organiser's session before the stranger signs in.
	await page.context().clearCookies();

	const stranger = await createTestUser('Tomas Novak');
	await signIn(page, stranger);

	const refused = await page.request.get(exportPath);

	// A 404 and not a 403, for the reason `manage.spec.ts` gives.
	expect(refused.status()).toBe(404);
});

test('removes a delegate from their seat and cancels the unpaid invoice', async ({ page }) => {
	const organiser = await signInWithAConference(page, 'Participants Remove MUN');

	const anna = await createTestUser('Anna Kowalski');
	const seatId = await seatDelegateAs(anna, organiser.committeeId, 'France');
	const invoiceId = await giveInvoice(anna, {
		conferenceId: organiser.conference.id,
		number: `test-${crypto.randomUUID().slice(0, 8)}`,
		status: 'unpaid',
		description: 'Delegate fee',
		unitAmountCents: 4500,
		seatId
	});

	await openParticipants(page, organiser.participantsPath);
	await expect(participantEntry(page, 'Anna Kowalski')).toHaveCount(1);

	await pressAndConfirm(page, 'Remove from seat');

	await expect(page.getByText('Anna Kowalski removed from France in UNSC.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(page.getByRole('main').getByText('Nobody is seated yet.')).toBeVisible();

	// The same two effects the allocation grid's "Free seat" has.
	const after = await readSeatAndInvoice(seatId, invoiceId);

	expect(after.userId).toBeNull();
	expect(after.invoiceStatus).toBe('void');
});

test('fits the window, with cards instead of a table on a phone', async ({ page }, testInfo) => {
	const organiser = await signInWithAConference(page, 'Participants Shape MUN');
	await seatTwoDelegates(organiser);
	await openParticipants(page, organiser.participantsPath);

	const main = page.getByRole('main');

	if (testInfo.project.name === 'phone') {
		await expect(main.getByRole('table')).toBeHidden();
		await expect(main.getByRole('listitem').filter({ hasText: 'Anna Kowalski' })).toBeVisible();
	} else {
		await expect(main.getByRole('table')).toBeVisible();
	}

	await expectNoSidewaysOverflow(page);
	await saveFullPageScreenshot(page, 'manage-participants');
	await expectPageFitsInScreens(page, MANAGE_PARTICIPANTS_SCREENS);
});
