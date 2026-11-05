import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { DATABASE_TIMEOUT_MS } from './chair-room-fixtures';
import {
	addAmendmentAsIs,
	addIntroducedDraft,
	makePaperCommittee,
	readStoredAmendment,
	setAmendmentRules,
	type PaperCommitteeRoom
} from './committee-paper-fixtures';
import { signIn, type TestUser } from './signed-in-user';

// Step 7 of `docs/committee-papers.md`, "Amendments", in a real browser: a
// delegate proposes an amendment to an introduced draft, its sponsors say
// whether it is friendly, other seats support an unfriendly one, its proposer
// withdraws it, and the dais orders its queue, writes a friendly amendment
// in and rules one out of order, which lapses the amendment to it. Every
// button is a plain form and every dialog a page of its own, so each test
// runs in all three projects, `desktop-no-js` among them.

// The dialogs open the way shadcn ships them; without the animation a click
// never lands on a dialog still moving into place.
test.use({ reducedMotion: 'reduce' });

/** The draft's title, and its text: two preambulatory clauses and three operative ones. */
const DRAFT = {
	title: 'Human control over autonomous weapons',
	preamble: [
		'*Recalling* its resolutions 78/241 of 22 December 2023 and 79/62 of 2 December 2024 on lethal autonomous weapons systems,',
		'*Reaffirming* that international humanitarian law applies fully to all weapons systems, including those with autonomy in their critical functions,'
	].join('\n\n'),
	operative: [
		'1. *Calls upon* all Member States to negotiate a legally binding instrument on autonomous weapons systems;',
		'2. *Requests* the Secretary-General to publish a register of national policies on autonomy in weapons systems;',
		'3. *Encourages* Member States to share best practice on training, testing and evaluation;'
	].join('\n')
};

/** The board's own size, to hold the page beside it. */
const BOARD_VIEWPORT = { width: 1265, height: 634 };

function hasNoScript(testInfo: TestInfo): boolean {
	return testInfo.project.use.javaScriptEnabled === false;
}

/** Draft resolution 1.1, sponsored by France, which leads, and Mexico. Answers its id. */
function addTheDraft(room: PaperCommitteeRoom, introducedAt?: Date): Promise<string> {
	return addIntroducedDraft(room.committeeId, {
		...DRAFT,
		authorSeatIds: [room.franceSeatId, room.mexicoSeatId],
		introducedAt
	});
}

function draftPath(room: PaperCommitteeRoom, paperId: string): string {
	return `${room.papersPath}/${paperId}`;
}

function reviewPath(room: PaperCommitteeRoom, paperId: string): string {
	return `${room.committeePath}/chair/resolutions/${paperId}`;
}

/** One amendment's card, by its number. */
function amendmentCard(page: Page, sequence: number): Locator {
	return page.locator(`#amendment-${sequence}`);
}

/** Sign in as somebody else, starting from no session at all. */
async function signInAs(page: Page, user: TestUser): Promise<void> {
	await page.context().clearCookies();
	await signIn(page, user);
}

/**
 * Choose a clause in the form's dropdown. Without JavaScript it is the
 * browser's own `<select>`, chosen by value; with it, shadcn's Select, a
 * button named by the label that opens a list of options.
 */
async function chooseClause(
	page: Page,
	testInfo: TestInfo,
	field: string,
	clause: { value: string; label: string }
): Promise<void> {
	if (hasNoScript(testInfo)) {
		await page.getByLabel(field).selectOption(clause.value);
		return;
	}

	await page.getByRole('button', { name: field }).click();
	await page.getByRole('option', { name: new RegExp(`^${clause.label} ·`) }).click();
}

/** The kinds of notification a person has, straight from the database. */
async function readNotificationKinds(user: TestUser): Promise<string[]> {
	const { data } = await createServiceRoleClient()
		.from('notifications')
		.select('kind')
		.eq('user_id', user.id);

	return (data ?? []).map((notification) => notification.kind);
}

test.describe('amendments to an introduced draft', () => {
	test('a delegate proposes a change, and both sponsors accept it as friendly', async ({
		page
	}, testInfo) => {
		const room = await makePaperCommittee('Amend Friendly');
		const paperId = await addTheDraft(room);

		// Ghana, on none of the papers, proposes the amendment.
		await signIn(page, room.amara);
		await page.goto(draftPath(room, paperId));
		await expect(page.getByRole('heading', { level: 1, name: 'Draft resolution 1.1' })).toBeVisible(
			{ timeout: DATABASE_TIMEOUT_MS }
		);
		await expect(page.getByRole('main')).toContainText('No amendments yet.');
		await page.getByRole('link', { name: 'Propose an amendment' }).click();

		await expect(
			page.getByRole('heading', { level: 1, name: 'Propose an amendment' })
		).toBeVisible();
		// "Change a clause" is chosen to begin with, as most amendments are.
		await chooseClause(page, testInfo, 'Which clause', {
			value: 'operative:o2',
			label: 'Clause 2'
		});
		await page
			.getByLabel('The clause as amended')
			.fill('*Requests* the Secretary-General to publish a register, open to all Member States;');
		await page.getByRole('button', { name: 'Propose amendment' }).click();

		await expect(page).toHaveURL(new RegExp(`${draftPath(room, paperId)}#amendment-1$`));
		await expect(page.getByText('The sponsors are asked whether it is friendly.')).toBeVisible();
		const card = amendmentCard(page, 1);
		await expect(card).toContainText('Asking the sponsors');
		await expect(card).toContainText('open to all Member States');
		await expect(card).toContainText('Ghana');
		// The database asks both sponsors, and nobody else.
		expect(await readNotificationKinds(room.clara)).toContain('amendment_awaits_answer');
		expect(await readNotificationKinds(room.amara)).not.toContain('amendment_awaits_answer');

		// France sees on the live view that it waits for an answer, and gives it.
		await signInAs(page, room.clara);
		await page.goto(`${room.committeePath}/live`);
		const waiting = page.getByRole('link', { name: 'Amendment 1 to Draft resolution 1.1' });
		await expect(waiting).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await waiting.click();
		await expect(page).toHaveURL(new RegExp(`${draftPath(room, paperId)}#amendment-1$`));
		await card.getByRole('button', { name: 'Accept as friendly' }).click();
		await expect(card).toContainText('You accepted it');
		await expect(card).toContainText('1 of 2 sponsors has answered');

		// Mexico accepts too, which makes it friendly and sends it to the dais.
		await signInAs(page, room.daniel);
		await page.goto(draftPath(room, paperId));
		await card.getByRole('button', { name: 'Accept as friendly' }).click();
		await expect(card).toContainText('With the dais');
		await expect(card).toContainText('Friendly');
	});

	test('with friendly amendments off, an amendment goes straight to collecting support', async ({
		page
	}, testInfo) => {
		const room = await makePaperCommittee('Amend Support');
		await setAmendmentRules(room.committeeId, {
			has_friendly_amendments: false,
			amendment_support_minimum: 2,
			amendment_support_unit: 'seats'
		});
		const paperId = await addTheDraft(room);

		await signIn(page, room.amara);
		await page.goto(`${draftPath(room, paperId)}/amendments/new`);
		await page.getByRole('radio', { name: 'Strike a clause' }).click();
		await chooseClause(page, testInfo, 'Which clause', {
			value: 'operative:o3',
			label: 'Clause 3'
		});
		await page.getByRole('button', { name: 'Propose amendment' }).click();

		const card = amendmentCard(page, 1);
		await expect(card).toContainText('Collecting support', { timeout: DATABASE_TIMEOUT_MS });
		await expect(card).toContainText('Strike clause 3');
		await expect(card).toContainText('Supported by 1 seat of the 2 it needs');
		// Nobody is asked whether it is friendly.
		expect(await readNotificationKinds(room.clara)).not.toContain('amendment_awaits_answer');

		// Mexico's support is the second seat, which takes it to the dais.
		await signInAs(page, room.daniel);
		await page.goto(draftPath(room, paperId));
		await card.getByRole('button', { name: 'Support' }).click();
		await expect(card).toContainText('With the dais');
		await expect(card).toContainText('Supported by 2 seats, the 2 it needs');
	});

	test('the proposer withdraws an amendment, and it stays on the page as withdrawn', async ({
		page
	}) => {
		const room = await makePaperCommittee('Amend Withdraw');
		const paperId = await addTheDraft(room);
		const amendmentId = await addAmendmentAsIs(paperId, {
			sequence: 1,
			proposedBySeatId: room.ghanaSeatId,
			action: 'strike',
			clauseId: 'o3',
			status: 'collecting_support'
		});

		await signIn(page, room.amara);
		await page.goto(draftPath(room, paperId));
		const card = amendmentCard(page, 1);
		await card.getByRole('link', { name: 'Withdraw' }).click();

		const dialog = page
			.getByRole('dialog')
			.filter({ has: page.getByRole('heading', { name: 'Withdraw amendment 1?' }) });
		await expect(dialog).toBeVisible();
		await dialog.getByRole('button', { name: 'Withdraw amendment' }).click();

		await expect(dialog).toHaveCount(0);
		await expect(card).toContainText('Withdrawn');
		await expect(card.getByRole('link', { name: 'Withdraw' })).toHaveCount(0);
		expect((await readStoredAmendment(amendmentId)).status).toBe('withdrawn');
	});

	test('the dais reorders its queue, then approves a friendly amendment and it is written in', async ({
		page
	}) => {
		const room = await makePaperCommittee('Amend Dais');
		const paperId = await addTheDraft(room);
		const friendlyId = await addAmendmentAsIs(paperId, {
			sequence: 1,
			proposedBySeatId: room.ghanaSeatId,
			action: 'change',
			clauseId: 'o2',
			text: '*Requests* the Secretary-General to publish a register, open to all Member States;',
			status: 'with_the_dais',
			isFriendly: true,
			queuePosition: 1
		});
		const unfriendlyId = await addAmendmentAsIs(paperId, {
			sequence: 2,
			proposedBySeatId: room.ghanaSeatId,
			action: 'strike',
			clauseId: 'o3',
			status: 'with_the_dais',
			queuePosition: 2
		});

		await signIn(page, room.chair);
		await page.goto(`${room.committeePath}/chair/resolutions`);
		const queue = page.getByRole('region', { name: 'Amendments' });
		await expect(queue).toContainText('Friendly', { timeout: DATABASE_TIMEOUT_MS });
		await expect(queue).toContainText('Unfriendly');

		// Amendment 2 goes first, which moves amendment 1 down.
		await queue
			.getByRole('button', { name: 'Move down: Amendment 1' })
			.filter({ visible: true })
			.click();
		await expect(page).toHaveURL(/\/chair\/resolutions#amendments$/);
		await expect(
			queue.getByRole('button', { name: 'Move up: Amendment 1' }).filter({ visible: true })
		).toBeVisible();
		expect((await readStoredAmendment(unfriendlyId)).queue_position).toBeLessThan(
			(await readStoredAmendment(friendlyId)).queue_position ?? 0
		);

		// The queue opens the draft's review at the amendment.
		await queue.getByRole('link', { name: 'Amendment 1' }).filter({ visible: true }).click();
		await expect(page).toHaveURL(new RegExp(`${reviewPath(room, paperId)}#amendment-1$`));
		const card = amendmentCard(page, 1);
		await card.getByRole('button', { name: 'Approve' }).click();
		await expect(card).toContainText('Written in');
		expect((await readStoredAmendment(friendlyId)).status).toBe('written_in');
		expect(await readNotificationKinds(room.amara)).toContain('amendment_decided');

		// The committee reads the clause as amended.
		await signInAs(page, room.amara);
		await page.goto(draftPath(room, paperId));
		await expect(page.locator('#clause-o2')).toContainText('open to all Member States');
		await expect(amendmentCard(page, 1)).toContainText('Written in');
	});

	test('the dais rules an amendment out of order with a reason, and the amendment to it lapses', async ({
		page
	}) => {
		const room = await makePaperCommittee('Amend Ruling');
		await setAmendmentRules(room.committeeId, { has_second_degree_amendments: true });
		const paperId = await addTheDraft(room);
		const parentId = await addAmendmentAsIs(paperId, {
			sequence: 1,
			proposedBySeatId: room.ghanaSeatId,
			action: 'strike',
			clauseId: 'o1',
			status: 'with_the_dais'
		});
		const childId = await addAmendmentAsIs(paperId, {
			sequence: 2,
			proposedBySeatId: room.franceSeatId,
			action: 'change',
			clauseId: 'o1',
			text: 'Strike only the words “legally binding”.',
			parentId,
			status: 'awaiting_sponsors',
			askedSponsorSeatIds: [room.mexicoSeatId]
		});

		await signIn(page, room.chair);
		await page.goto(reviewPath(room, paperId));
		const card = amendmentCard(page, 1);
		await card.getByRole('link', { name: 'Rule out of order' }).click();

		const dialog = page
			.getByRole('dialog')
			.filter({ has: page.getByRole('heading', { name: 'Rule amendment 1 out of order?' }) });
		await expect(dialog).toBeVisible();
		await dialog
			.getByLabel('Why it is out of order')
			.fill('Striking the first clause defeats the purpose of the draft.');
		await dialog.getByRole('button', { name: 'Rule out of order' }).click();

		await expect(dialog).toHaveCount(0);
		await expect(card).toContainText('Out of order');
		await expect(card).toContainText('Striking the first clause defeats the purpose of the draft.');
		await expect(amendmentCard(page, 2)).toContainText('Lapsed');
		expect(await readStoredAmendment(parentId)).toMatchObject({
			status: 'out_of_order',
			ruling: 'Striking the first clause defeats the purpose of the draft.'
		});
		expect((await readStoredAmendment(childId)).status).toBe('lapsed');
	});

	test('the introduced draft beside its amendments, at the board’s size', async ({
		page
	}, testInfo) => {
		test.skip(
			testInfo.project.name !== 'desktop',
			'One screenshot, with JavaScript, to hold beside the board.'
		);
		const room = await makePaperCommittee('Amend Board');
		const paperId = await addTheDraft(room, new Date('2027-03-15T14:20:00Z'));
		await addAmendmentAsIs(paperId, {
			sequence: 1,
			proposedBySeatId: room.ghanaSeatId,
			action: 'change',
			clauseId: 'o1',
			text: '*Calls upon* all Member States to negotiate a legally binding instrument by the end of 2028;',
			status: 'with_the_dais',
			isFriendly: true,
			queuePosition: 1
		});
		await addAmendmentAsIs(paperId, {
			sequence: 2,
			proposedBySeatId: room.ghanaSeatId,
			action: 'strike',
			clauseId: 'o2',
			status: 'with_the_dais',
			queuePosition: 2
		});
		await addAmendmentAsIs(paperId, {
			sequence: 3,
			proposedBySeatId: room.ghanaSeatId,
			action: 'add',
			clauseId: 'o3',
			text: '*Affirms* that nothing in the instrument shall hamper the peaceful use of artificial intelligence;',
			status: 'awaiting_sponsors',
			askedSponsorSeatIds: [room.franceSeatId, room.mexicoSeatId]
		});

		await signIn(page, room.amara);
		await page.setViewportSize(BOARD_VIEWPORT);
		await page.goto(draftPath(room, paperId));
		await expect(amendmentCard(page, 3)).toContainText('Asking the sponsors', {
			timeout: DATABASE_TIMEOUT_MS
		});
		await page.screenshot({ path: 'test-results/paper-introduced-1265x634.png' });
	});
});
