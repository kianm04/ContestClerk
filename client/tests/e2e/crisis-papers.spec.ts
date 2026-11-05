import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { makePaperCommittee, type PaperCommitteeRoom } from './committee-paper-fixtures';
import { expectNoSidewaysOverflow } from './page-shape';
import { signIn, type TestUser } from './signed-in-user';

// Step 9 of docs/committee-papers.md, crisis committees, in a real browser:
//
// * a character sends a personal directive to the crisis staff, who carry it
//   out from their own page, and the character reads the answer beside it;
// * the crisis staff publish a press release, which the whole committee then
//   finds under "Press releases";
// * a crisis update the crisis staff send shows on the live view and on the
//   projector.
//
// The committee's chair answers as the crisis staff: the Chair preset holds
// `answer_directives`. Who else may is `tests/db/crisis-committees.test.ts`'s
// work. Every form here is a plain form, so the tests run with JavaScript and
// without it, and every test makes a conference of its own.

/** How long an assertion that waits on a page reading the database may take. */
const DATABASE_TIMEOUT_MS = 15_000;

const DIRECTIVE_TITLE = 'Close the northern ports';
const DIRECTIVE_BODY = 'The navy closes every northern port to foreign ships by nightfall.';
const ANSWER = 'The ports are closed. Two foreign ships are stranded in the harbour.';

const PRESS_RELEASE_TITLE = 'The government stands firm';
const PRESS_RELEASE_BODY = 'The government will not negotiate while the blockade lasts.';

const CRISIS_UPDATE = 'A cargo ship has run aground at the mouth of the river.';

/** A crisis committee: DISEC of `makePaperCommittee`, with its format changed. */
async function makeCrisisCommittee(namePrefix: string): Promise<PaperCommitteeRoom> {
	const room = await makePaperCommittee(namePrefix);

	await createServiceRoleClient()
		.from('committees')
		.update({ format: 'crisis' })
		.eq('id', room.committeeId)
		.throwOnError();

	return room;
}

/** One paper France writes alone, as `start_paper` leaves it. Answers its id. */
async function addFrancePaper(
	room: PaperCommitteeRoom,
	kind: 'personal_directive' | 'press_release',
	title: string,
	body: string
): Promise<string> {
	const admin = createServiceRoleClient();

	const { data: paper } = await admin
		.from('committee_papers')
		.insert({
			committee_id: room.committeeId,
			kind,
			title,
			topic: null,
			started_by_seat_id: room.franceSeatId,
			lead_seat_id: room.franceSeatId,
			body_markdown: body
		})
		.select('id')
		.single()
		.throwOnError();

	await admin
		.from('committee_paper_seats')
		.insert({ paper_id: paper.id, seat_id: room.franceSeatId, role: 'author' })
		.throwOnError();

	return paper.id;
}

/** Sent to the crisis staff, as `submit_paper` leaves it. Last, since that fixes the authors. */
async function sendToCrisisStaff(paperId: string): Promise<void> {
	await createServiceRoleClient()
		.from('committee_papers')
		.update({ status: 'submitted', submitted_at: new Date().toISOString() })
		.eq('id', paperId)
		.throwOnError();
}

/** Sign the page in as somebody else, leaving the last account first. */
async function switchTo(page: Page, user: TestUser): Promise<void> {
	await page.context().clearCookies();
	await signIn(page, user);
}

test.describe('crisis committees', () => {
	test('a character sends a personal directive, the crisis staff carry it out, and the character reads the answer', async ({
		page
	}) => {
		const room = await makeCrisisCommittee('Crisis Directive');
		const paperId = await addFrancePaper(
			room,
			'personal_directive',
			DIRECTIVE_TITLE,
			DIRECTIVE_BODY
		);
		await signIn(page, room.clara);
		await page.goto(`${room.papersPath}/${paperId}`);

		const main = page.getByRole('main');
		await main.getByRole('link', { name: 'Send to the crisis staff' }).click();

		// Without JavaScript the dialog is drawn by the server, and is not named by its heading.
		const dialog = page.getByRole('dialog').filter({
			has: page.getByRole('heading', { name: `Send “${DIRECTIVE_TITLE}” to the crisis staff?` })
		});
		await expect(dialog).toContainText('carry it out or refuse it');
		await dialog.getByRole('button', { name: 'Send to the crisis staff' }).click();

		await expect(page.getByText(`“${DIRECTIVE_TITLE}” is with the crisis staff.`)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByText('Personal directive · Sent')).toContainText(
			'· With the crisis staff'
		);
		await expect(main.getByRole('region', { name: 'With the crisis staff' })).toContainText(
			'The crisis staff will carry it out or refuse it'
		);

		// The chair holds `answer_directives`, and finds the directive from the committee's page.
		await switchTo(page, room.chair);
		await page.goto(room.committeePath);
		await main.getByRole('link', { name: 'Answer directives' }).click();

		await expect(main.getByRole('heading', { level: 1, name: 'Crisis staff' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		const waiting = main.getByRole('region', { name: 'Waiting for an answer' });
		await expect(waiting).toContainText('Personal directive · France');
		await expectNoSidewaysOverflow(page);
		await waiting.getByRole('link', { name: new RegExp(DIRECTIVE_TITLE) }).click();

		await expect(main.getByRole('heading', { level: 1, name: DIRECTIVE_TITLE })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main).toContainText(DIRECTIVE_BODY);
		await expectNoSidewaysOverflow(page);
		await main.getByLabel('What happens').fill(ANSWER);
		await main.getByRole('button', { name: 'Carry out' }).click();

		await expect(page.getByText(`“${DIRECTIVE_TITLE}” carried out.`)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(main.getByRole('region', { name: 'Waiting for an answer' })).toContainText(
			'Nothing is waiting for an answer.'
		);
		await expect(main.getByRole('region', { name: 'Answered' })).toContainText('Carried out');

		await switchTo(page, room.clara);
		await page.goto(`${room.papersPath}/${paperId}`);

		const answered = main.getByRole('region', { name: 'Carried out' });
		await expect(answered).toContainText(ANSWER, { timeout: DATABASE_TIMEOUT_MS });
		await expect(answered).toContainText('Crisis staff ·');
		await expect(main.getByRole('link', { name: 'Send to the crisis staff' })).toHaveCount(0);
		await expectNoSidewaysOverflow(page);
	});

	test('the crisis staff publish a press release, which the committee then reads', async ({
		page
	}) => {
		const room = await makeCrisisCommittee('Crisis Press');
		const paperId = await addFrancePaper(
			room,
			'press_release',
			PRESS_RELEASE_TITLE,
			PRESS_RELEASE_BODY
		);
		await sendToCrisisStaff(paperId);
		await signIn(page, room.chair);
		await page.goto(`${room.committeePath}/crisis/${paperId}`);

		const main = page.getByRole('main');
		await expect(main.getByText('Press release · France')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		// A press release is published or refused, never carried out.
		await expect(main.getByRole('button', { name: 'Carry out' })).toHaveCount(0);
		await main.getByRole('button', { name: 'Publish' }).click();

		await expect(page.getByText(`“${PRESS_RELEASE_TITLE}” published.`)).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		// Ghana wrote none of it, and reads it once it is published.
		await switchTo(page, room.amara);
		await page.goto(room.papersPath);

		const pressReleases = main.getByRole('region', { name: 'Press releases' });
		await expect(pressReleases).toContainText(PRESS_RELEASE_TITLE, {
			timeout: DATABASE_TIMEOUT_MS
		});
		await pressReleases.getByRole('link', { name: new RegExp(PRESS_RELEASE_TITLE) }).click();
		await expect(main).toContainText(PRESS_RELEASE_BODY, { timeout: DATABASE_TIMEOUT_MS });
	});

	test('a crisis update shows on the live view and on the projector', async ({ page }) => {
		const room = await makeCrisisCommittee('Crisis Update');
		await signIn(page, room.chair);
		await page.goto(`${room.committeePath}/crisis`);

		const main = page.getByRole('main');
		const updateForm = main.getByRole('region', { name: 'Crisis update' });
		await expect(updateForm).toContainText('The room shows no update.', {
			timeout: DATABASE_TIMEOUT_MS
		});
		await updateForm.getByLabel('Update for the room').fill(CRISIS_UPDATE);
		await updateForm.getByRole('button', { name: 'Send update' }).click();

		await expect(page.getByText('Crisis update sent to the room.')).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});
		await expect(updateForm).toContainText("On the room's screens since");

		await page.goto(`${room.committeePath}/display`);
		const onScreen = page.getByRole('region', { name: 'Crisis update' });
		await expect(onScreen).toContainText(CRISIS_UPDATE, { timeout: DATABASE_TIMEOUT_MS });

		await switchTo(page, room.amara);
		await page.goto(`${room.committeePath}/live`);
		const onPhone = main.getByRole('region', { name: /^Crisis update · \d\d:\d\d$/ });
		await expect(onPhone).toContainText(CRISIS_UPDATE, { timeout: DATABASE_TIMEOUT_MS });
		await expectNoSidewaysOverflow(page);
	});
});
