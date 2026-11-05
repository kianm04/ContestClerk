import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { expectScrollsAtMost, OWNER_VIEWPORT, saveOwnerScreenshot } from './creation-screen';
import { createReturningOrganisationFor } from './draft-conference';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';
import { createTestUser, signIn, type TestUser } from './signed-in-user';

// The Setup step of creating a conference, `/create/<slug>/setup` (Trello
// fe3reN7Y): the committees, applications and fees cards, and the dialogs
// they open from the address (`?dialog=`). The steps before and after it have
// their own specs.
//
// Everything made here stays in the database until the next `pnpm db:reset`,
// which is safe: the past conference is dated in the past and a draft is never
// public.

/** How long a page that reads the database may take; see `conferences.spec.ts`. */
const DATABASE_TIMEOUT_MS = 15_000;

type SeededDraft = { slug: string; previousName: string };

/**
 * Make `user` the owner of an organisation whose last conference, in April
 * 2026, had three committees (one with 30 seats), a delegate fee and one
 * question, and give it a draft for April 2027 at the Setup step. The
 * service-role client only arranges the starting state; it never proves that
 * anything is allowed.
 */
async function seedDraftAtSetup(user: TestUser): Promise<SeededDraft> {
	const admin = createServiceRoleClient();
	const suffix = crypto.randomUUID().slice(0, 8);
	const organizationName = `Delft MUN ${suffix}`;

	const { data: organization, error: organizationError } = await admin
		.from('organizations')
		.insert({
			name: organizationName,
			slug: `delft-mun-${suffix}`,
			created_by: user.id,
			city: 'Delft',
			country_code: 'NL'
		})
		.select('id')
		.single();

	if (organizationError || !organization) {
		throw new Error(`Could not seed the organisation: ${organizationError?.message}`);
	}

	const shared = {
		city: 'Delft',
		country_code: 'NL',
		timezone: 'Europe/Amsterdam',
		organization_id: organization.id,
		created_by: user.id
	};
	const previousName = `${organizationName} 2026`;
	const { data: previous, error: previousError } = await admin
		.from('conferences')
		.insert({
			...shared,
			name: previousName,
			slug: `delft-mun-${suffix}-2026`,
			start_date: '2026-04-17',
			end_date: '2026-04-19',
			status: 'published'
		})
		.select('id')
		.single();

	if (previousError || !previous) {
		throw new Error(`Could not seed the past conference: ${previousError?.message}`);
	}

	const inserts = await Promise.all([
		admin.from('committees').insert([
			{
				conference_id: previous.id,
				name: 'Security Council',
				abbreviation: 'UNSC',
				slug: 'security-council',
				planned_seat_count: 30,
				position: 0
			},
			{
				conference_id: previous.id,
				name: 'World Health Organization',
				abbreviation: 'WHO',
				slug: 'who',
				position: 1
			},
			{
				conference_id: previous.id,
				name: 'Human Rights Council',
				abbreviation: 'UNHRC',
				slug: 'unhrc',
				position: 2
			}
		]),
		admin.from('fees').insert({
			conference_id: previous.id,
			name: 'Delegate fee',
			amount_cents: 3500,
			applies_to: 'individual',
			position: 0
		}),
		admin
			.from('application_questions')
			.insert({ conference_id: previous.id, label: 'Why MUN?', type: 'short_text' })
	]);

	for (const { error } of inserts) {
		if (error) {
			throw new Error(`Could not seed the past conference's setup: ${error.message}`);
		}
	}

	const slug = `delft-mun-${suffix}-2027`;
	const { error: draftError } = await admin.from('conferences').insert({
		...shared,
		name: `${organizationName} 2027`,
		slug,
		start_date: '2027-04-16',
		end_date: '2027-04-18',
		status: 'draft',
		venue_status: 'tba',
		fee_status: 'undecided',
		application_open_mode: 'manual',
		application_close_rule: 'relative',
		application_close_offset_days: -14,
		applications_close_at: '2027-04-02T21:59:00Z',
		creation_step: 'setup',
		prefill_sources: { start_date: 'user' }
	});

	if (draftError) {
		throw new Error(`Could not seed the draft: ${draftError.message}`);
	}

	return { slug, previousName };
}

/** Sign in as a new account that owns a seeded draft, and open its Setup step. */
async function openSetup(page: Page): Promise<SeededDraft> {
	const user = await createTestUser();
	const draft = await seedDraftAtSetup(user);

	await signIn(page, user);
	await page.goto(`/create/${draft.slug}/setup`);
	await expect(page.getByRole('heading', { name: 'Committees', exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	return draft;
}

/** The open dialog: shadcn gives it `role="dialog"`. */
function dialog(page: Page) {
	return page.getByRole('dialog');
}

test.describe('with JavaScript', () => {
	test.skip(({ javaScriptEnabled }) => !javaScriptEnabled, 'the dialogs fill fields as you type');

	test('copies, adds, edits and deletes committees', async ({ page }, testInfo) => {
		test.skip(testInfo.project.name === 'phone', 'one width is enough for the flow');
		await openSetup(page);
		const committees = page.locator('#committees');
		await expect(committees.getByRole('link', { name: 'All committees' })).toBeVisible();

		await committees.getByRole('button', { name: "Use last year's committees" }).click();
		await expect(committees.getByRole('row')).toHaveCount(4, { timeout: DATABASE_TIMEOUT_MS });
		await expect(committees.getByRole('cell', { name: '30', exact: true })).toBeVisible();
		await expect(committees.getByText('Not decided').first()).toBeVisible();
		await expect(committees.getByText('Unassigned').first()).toBeVisible();

		// Add one from the catalogue: picking fills the abbreviation.
		await committees.getByRole('link', { name: 'Add committee' }).click();
		await dialog(page).getByRole('combobox', { name: 'Committee name' }).fill('United Nations S');
		await dialog(page)
			.getByRole('option', { name: 'United Nations Security Council (UNSC)' })
			.click();
		await expect(dialog(page).getByLabel('Abbreviation')).toHaveValue('UNSC');
		await dialog(page).getByRole('button', { name: 'Add committee' }).click();
		await expect(dialog(page)).toBeHidden({ timeout: DATABASE_TIMEOUT_MS });
		// The table shows three rows until it is opened up; the new one is the fourth.
		await committees.getByRole('link', { name: 'Show all 4 committees' }).click();
		await expect(committees.getByRole('row')).toHaveCount(5);

		// Edit the seats of the first one.
		await committees.getByRole('link', { name: 'Edit UNSC' }).first().click();
		await dialog(page).getByLabel('Seats').fill('25');
		await dialog(page).getByRole('button', { name: 'Save changes' }).click();
		await expect(dialog(page)).toBeHidden({ timeout: DATABASE_TIMEOUT_MS });
		await expect(committees.getByRole('cell', { name: '25', exact: true })).toBeVisible();

		// Deleting asks first, naming the committee.
		await committees.getByRole('link', { name: 'Delete UNHRC' }).click();
		await expect(dialog(page).getByRole('heading', { name: 'Delete committee?' })).toBeVisible();
		await expect(dialog(page).getByText(/delete the Human Rights Council \(UNHRC\)/)).toBeVisible();
		await dialog(page).getByRole('button', { name: 'Delete committee' }).click();
		await expect(dialog(page)).toBeHidden({ timeout: DATABASE_TIMEOUT_MS });
		await expect(committees.getByText('UNHRC')).toHaveCount(0);
	});

	test('sets up applications and questions', async ({ page }, testInfo) => {
		test.skip(testInfo.project.name === 'phone', 'one width is enough for the flow');
		await openSetup(page);
		const applications = page.locator('#applications');

		await applications.getByRole('link', { name: 'Edit settings' }).first().click();
		await expect(dialog(page).locator('input[name="closeChoice"]')).toHaveValue('-14');
		await expect(dialog(page).getByText('2 weeks before the conference')).toBeAttached();
		await dialog(page).getByRole('button', { name: "Use last year's form" }).click();
		await expect(dialog(page).getByText('Why MUN?')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
		await dialog(page).getByRole('link', { name: 'Close' }).click();
		await expect(applications.getByText('Why MUN?')).toBeVisible();

		await applications.getByRole('link', { name: 'Add question' }).click();
		await expect(dialog(page).getByLabel('Options')).toHaveCount(0);
		await dialog(page).getByLabel('Type').click();
		await page.getByRole('option', { name: 'Pick several' }).click();
		await dialog(page).getByLabel('Question', { exact: true }).fill('Which topics interest you?');
		await dialog(page).getByLabel('Options').fill('Climate\nTrade');
		const preview = dialog(page).getByRole('region', { name: 'Preview for applicants' });
		await expect(preview.getByText('Which topics interest you?')).toBeVisible();
		await expect(preview.getByRole('checkbox', { name: 'Trade' })).toBeVisible();
		await dialog(page).getByRole('button', { name: 'Add question' }).click();
		await expect(dialog(page)).toBeHidden({ timeout: DATABASE_TIMEOUT_MS });
		await expect(applications.getByText('Which topics interest you?')).toBeVisible();
	});

	test('chooses, copies, adds and deletes fees', async ({ page }, testInfo) => {
		test.skip(testInfo.project.name === 'phone', 'one width is enough for the flow');
		await openSetup(page);
		const fees = page.locator('#fees');

		await expect(fees.getByRole('radio', { name: /Decide later/ })).toBeChecked();
		await fees.getByRole('button', { name: "Use last year's fee" }).click();
		// The row's own link, since "Last year: €35 delegate fee" says the words already.
		await expect(fees.getByRole('link', { name: 'Edit Delegate fee' })).toBeVisible({
			timeout: DATABASE_TIMEOUT_MS
		});

		await fees.getByRole('link', { name: 'Add fee' }).click();
		await dialog(page)
			.getByRole('radio', { name: /Late fee/ })
			.check();
		await expect(dialog(page).getByLabel('Name')).toHaveValue('Late fee');
		await dialog(page).getByLabel('Amount').fill('50');
		await dialog(page).getByRole('button', { name: 'Create fee' }).click();
		await expect(dialog(page)).toBeHidden({ timeout: DATABASE_TIMEOUT_MS });
		await expect(fees.getByRole('link', { name: 'Edit Late fee' })).toBeVisible();
		await expect(fees.getByRole('radio', { name: /Paid/ })).toBeChecked();

		await fees.getByRole('link', { name: 'Delete Late fee' }).click();
		await expect(dialog(page).getByRole('heading', { name: 'Delete fee?' })).toBeVisible();
		await dialog(page).getByRole('button', { name: 'Delete fee' }).click();
		await expect(dialog(page)).toBeHidden({ timeout: DATABASE_TIMEOUT_MS });
		await expect(fees.getByRole('link', { name: 'Edit Late fee' })).toHaveCount(0);
	});

	test('closes a dialog with Escape and gives focus back to its link', async ({ page }) => {
		await openSetup(page);
		const addCommittee = page.locator('#committees').getByRole('link', { name: 'Add committee' });

		await addCommittee.click();
		await expect(dialog(page)).toBeVisible();
		await saveFullPageScreenshot(page, 'create-setup-committee-dialog');
		await page.keyboard.press('Escape');
		await expect(dialog(page)).toBeHidden();
		await expect(page).toHaveURL(/\/setup$/);
		await expect(addCommittee).toBeFocused();
	});

	test('fits the screen', async ({ page }) => {
		await openSetup(page);

		await expectNoSidewaysOverflow(page);
		await saveFullPageScreenshot(page, 'create-setup');
	});
});

/**
 * On the product owner's own window, start the next edition of a returning
 * organisation (with its crest and banner) and bring last year's committees,
 * application form and fee into its Setup step: the three committee rows, one
 * question and one fee the mockup `4-4-setup.png` shows.
 */
async function openWalkthroughSetup(page: Page): Promise<void> {
	test.skip(test.info().project.name !== 'desktop', 'The owner works on a desktop.');
	await page.setViewportSize(OWNER_VIEWPORT);
	const user = await createTestUser();
	const organisation = await createReturningOrganisationFor(user, { hasPictures: true });

	await signIn(page, user);
	await page.goto(`/create?organization=${organisation.id}`);
	await page.getByRole('button', { name: 'Continue to basics' }).click();
	await page.waitForURL(/\/create\/[^/]+\/basics$/, { timeout: DATABASE_TIMEOUT_MS });
	await page.goto(page.url().replace(/\/basics$/, '/setup'));

	const committees = page.locator('#committees');
	await committees.getByRole('button', { name: "Use last year's committees" }).click();
	await expect(committees.getByRole('row')).toHaveCount(4, { timeout: DATABASE_TIMEOUT_MS });

	const fees = page.locator('#fees');
	await fees.getByRole('button', { name: "Use last year's fee" }).click();
	await expect(fees.getByRole('link', { name: 'Edit Delegate fee' })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});

	const applications = page.locator('#applications');
	await applications.getByRole('link', { name: 'Edit settings' }).click();
	await dialog(page).getByRole('button', { name: "Use last year's form" }).click();
	await expect(dialog(page).getByText('Why MUN?')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await dialog(page).getByRole('link', { name: 'Close' }).click();
	await expect(dialog(page)).toBeHidden();
	await expect(applications.getByText('Why MUN?')).toBeVisible();
}

/**
 * The open dialog fits the owner's 634px window, or scrolls inside itself:
 * either way the whole dialog box is on the screen and its `buttonName`
 * button, the one that finishes it, can be seen without scrolling the page.
 */
async function expectDialogFitsOwnerScreen(page: Page, buttonName: string): Promise<void> {
	await expect(dialog(page).getByRole('button', { name: buttonName })).toBeInViewport({
		ratio: 1
	});
	const dialogBox = await dialog(page).boundingBox();
	expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
	expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(OWNER_VIEWPORT.height);
}

test.describe("on the product owner's screen", () => {
	test("scrolls only a little on the product owner's screen", async ({ page }) => {
		await openWalkthroughSetup(page);

		// Kept first, so that a step that runs too long still leaves its picture.
		await saveOwnerScreenshot(page, 'create-setup');
		// The owner found Setup crowded and hard to read when it shrank to fit
		// the window, so it keeps the width's scale and may scroll: a little,
		// never a whole screen. The measured height goes on the report.
		await expectScrollsAtMost(page, 320, 'setup');
		// The scrollbar now takes some of the window's width; nothing may run
		// past the right edge because of it.
		await expectNoSidewaysOverflow(page);
	});

	test('fits the committee dialog in the window', async ({ page }) => {
		await openWalkthroughSetup(page);
		await page.locator('#committees').getByRole('link', { name: 'Add committee' }).click();
		await expect(dialog(page)).toBeVisible();

		await saveOwnerScreenshot(page, 'create-setup-committee-dialog');
		// Either the dialog fits, or it scrolls inside itself with its buttons in view.
		const addButton = dialog(page).getByRole('button', { name: 'Add committee' });
		await expect(addButton).toBeInViewport({ ratio: 1 });
		const dialogBox = await dialog(page).boundingBox();
		// The owner asked for bigger dialogs: drawn at Setup's own scale, the
		// window's width over the design's 1672, so the new committee dialog's
		// 649 design pixels are about 491 here, not the 409 it was.
		expect(dialogBox!.width).toBeGreaterThanOrEqual(649 * (OWNER_VIEWPORT.width / 1672) - 1);
		expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
		expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(OWNER_VIEWPORT.height);
	});

	test('fits the applications dialog in the window', async ({ page }) => {
		await openWalkthroughSetup(page);
		await page.locator('#applications').getByRole('link', { name: 'Edit settings' }).click();
		await expect(dialog(page)).toBeVisible();

		await saveOwnerScreenshot(page, 'create-setup-applications-dialog');
		await expectDialogFitsOwnerScreen(page, 'Save changes');
	});

	test('fits the question dialog in the window', async ({ page }) => {
		await openWalkthroughSetup(page);
		await page.locator('#applications').getByRole('link', { name: 'Add question' }).click();
		await expect(dialog(page)).toBeVisible();

		await saveOwnerScreenshot(page, 'create-setup-question-dialog');
		await expectDialogFitsOwnerScreen(page, 'Add question');
	});

	test('fits the fee dialog in the window', async ({ page }) => {
		await openWalkthroughSetup(page);
		await page.locator('#fees').getByRole('link', { name: 'Add fee' }).click();
		await expect(dialog(page)).toBeVisible();

		await saveOwnerScreenshot(page, 'create-setup-fee-dialog');
		await expectDialogFitsOwnerScreen(page, 'Create fee');
	});

	test('fits the three delete dialogs in the window', async ({ page }) => {
		await openWalkthroughSetup(page);
		const deletions = [
			{ section: '#committees', link: 'Delete UNSC', button: 'Delete committee', name: '' },
			{
				section: '#applications',
				link: 'Delete Why MUN?',
				button: 'Delete question',
				name: '-question'
			},
			{ section: '#fees', link: 'Delete Delegate fee', button: 'Delete fee', name: '-fee' }
		];

		for (const deletion of deletions) {
			await page
				.locator(deletion.section)
				.getByRole('link', { name: deletion.link })
				.first()
				.click();
			await expect(dialog(page)).toBeVisible();
			await saveOwnerScreenshot(page, `create-setup-delete${deletion.name}-dialog`);
			await expectDialogFitsOwnerScreen(page, deletion.button);
			// Leave without deleting, so the next row is still there to try.
			await dialog(page).getByRole('link', { name: 'Cancel' }).click();
			await expect(dialog(page)).toBeHidden();
		}
	});
});

/**
 * Put a new account on the draft's team with one role that may edit the
 * conference, which opens the Setup step, but not manage its committees, and
 * give the draft one committee for it to look at.
 */
async function editorWithoutCommittees(slug: string): Promise<TestUser> {
	const admin = createServiceRoleClient();
	const editor = await createTestUser('Sofia Desk');

	const { data: draft, error: draftError } = await admin
		.from('conferences')
		.select('id')
		.eq('slug', slug)
		.single();

	if (draftError || !draft) {
		throw new Error(`Could not find the seeded draft: ${draftError?.message}`);
	}

	const { error: committeeError } = await admin.from('committees').insert({
		conference_id: draft.id,
		name: 'Security Council',
		abbreviation: 'UNSC',
		slug: 'security-council',
		position: 0
	});

	if (committeeError) {
		throw new Error(`Could not seed the draft's committee: ${committeeError.message}`);
	}

	const { data: role, error: roleError } = await admin
		.from('conference_roles')
		.insert({
			conference_id: draft.id,
			name: 'Website desk',
			position: 1,
			scope: 'conference',
			permissions: ['edit_conference']
		})
		.select('id')
		.single();

	if (roleError || !role) {
		throw new Error(`Could not make the test role: ${roleError?.message}`);
	}

	const { error: staffError } = await admin
		.from('conference_staff')
		.insert({ conference_id: draft.id, user_id: editor.id });

	if (staffError) {
		throw new Error(`Could not put the test account on the team: ${staffError.message}`);
	}

	const { error: memberError } = await admin
		.from('conference_role_members')
		.insert({ conference_id: draft.id, user_id: editor.id, role_id: role.id });

	if (memberError) {
		throw new Error(`Could not give the test role: ${memberError.message}`);
	}

	return editor;
}

// The step opens with `edit_conference`, but adding, importing, editing and
// deleting a committee take `manage_committees`, so somebody without it sees
// the committees and none of the controls the server would only refuse.
test('shows the committees without their controls to somebody who may not manage them', async ({
	page
}) => {
	const owner = await createTestUser();
	const draft = await seedDraftAtSetup(owner);
	const editor = await editorWithoutCommittees(draft.slug);

	await signIn(page, editor);
	await page.goto(`/create/${draft.slug}/setup`);
	const committees = page.locator('#committees');

	// The table names a committee by its abbreviation.
	await expect(committees.getByRole('cell', { name: 'UNSC', exact: true })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(committees.getByRole('link', { name: 'Add committee' })).toHaveCount(0);
	await expect(committees.getByRole('link', { name: 'Edit UNSC' })).toHaveCount(0);
	await expect(committees.getByRole('link', { name: 'Delete UNSC' })).toHaveCount(0);
	// Nor the way to the committees page, which would not open for them.
	await expect(committees.getByRole('link', { name: 'All committees' })).toHaveCount(0);
});

test('adds a committee without JavaScript', async ({ page, javaScriptEnabled }) => {
	test.skip(javaScriptEnabled, 'this is the plain form the dialog falls back to');
	await openSetup(page);
	const committees = page.locator('#committees');

	await committees.getByRole('link', { name: 'Add committee' }).click();
	await page.getByLabel('Seats').fill('20');
	await page.getByRole('button', { name: 'Add committee' }).click();
	// The refusal comes back with the dialog still open and what was typed kept.
	await expect(page.getByText("Please enter the committee's name.")).toBeVisible();
	await expect(page.getByLabel('Seats')).toHaveValue('20');

	await page.getByLabel('Committee name').fill('Special Committee');
	await page.getByRole('button', { name: 'Add committee' }).click();
	await expect(committees.getByText('Special Committee')).toBeVisible();
});
