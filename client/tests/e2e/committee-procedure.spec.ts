import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { createTestUser, signIn } from './signed-in-user';
import { createDraftConferenceFor } from './draft-conference';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';
import { pickOption, setChecked } from './shadcn-controls';

// The "Resolutions" section of a committee's editor (`docs/committee-papers.md`,
// section 5): "Start from" a procedure, the settings form, and copying the
// settings to the conference's other committees.
//
// What needs a real browser, and so is here rather than in a unit test:
//
// * "Start from" THIMUN really runs `apply_committee_procedure`, and the
//   fields show its settings once the page is back;
// * a changed setting is saved by the form and is still there on a reload;
// * "Copy settings" really writes the other committee's row;
// * the section does not push a phone sideways.
//
// Every test runs on the `desktop-no-js` project too, which is what shows the
// three forms work without JavaScript: each is a real `<form method="post">`.
//
// Each test makes its own conference, dated in 2020 for the reason
// `tests/e2e/manage-committee-chairs.spec.ts` gives, and it stays in the
// database until the next `pnpm db:reset`. `readConferenceId` and
// `addCommittee` are copies of that file's, for the reason it gives.

/** How long an assertion that waits on a page reading the database may take. */
const DATABASE_TIMEOUT_MS = 15_000;

/** A name nothing else in the database will match. */
function unusedName(prefix: string): string {
	return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

/** The id of the conference with this slug. */
async function readConferenceId(slug: string): Promise<string> {
	const { data, error } = await createServiceRoleClient()
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
 * Write one committee straight into the table, with the columns' own
 * settings, which are North American procedure, and answer its id.
 */
async function addCommittee(conferenceId: string, name: string, position: number) {
	const { data, error } = await createServiceRoleClient()
		.from('committees')
		.insert({
			conference_id: conferenceId,
			name,
			slug: `committee-${crypto.randomUUID().slice(0, 8)}`,
			level: 'advanced',
			topics: ['The first topic'],
			position
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test committee: ${error?.message}`);
	}

	return data.id;
}

/** A few of a committee's settings as the database holds them. */
async function readSettings(committeeId: string) {
	const { data, error } = await createServiceRoleClient()
		.from('committees')
		.select(
			'paper_words, has_working_papers, sponsor_limit, support_minimum, support_unit, has_second_degree_amendments'
		)
		.eq('id', committeeId)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the test committee: ${error?.message}`);
	}

	return data;
}

/**
 * Sign a new organiser in with a conference of their own and its committees,
 * by name, and open the first committee's editor. Answers each committee's id.
 */
async function openEditor(page: Page, committeeNames: string[]): Promise<string[]> {
	const user = await createTestUser('Priya Nair');
	await signIn(page, user);

	const draft = await createDraftConferenceFor(user, {
		name: unusedName('Procedure MUN'),
		organizationName: unusedName('Procedure Society'),
		startDate: '2020-05-03',
		endDate: '2020-05-05'
	});
	const conferenceId = await readConferenceId(draft.slug);
	const committeeIds: string[] = [];

	for (const [position, name] of committeeNames.entries()) {
		committeeIds.push(await addCommittee(conferenceId, name, position));
	}

	await page.goto(`/manage/${draft.slug}/committees/${committeeIds[0]}`);
	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
		committeeNames[0],
		{ timeout: DATABASE_TIMEOUT_MS }
	);

	return committeeIds;
}

/** The "Resolutions" section. `FormSection` names each section after its title. */
function resolutions(page: Page): Locator {
	return page.getByRole('region', { name: 'Resolutions' });
}

/**
 * Expect a `FormSelect` to show this choice: the browser's own dropdown's
 * chosen option without JavaScript, shadcn's button's words with it.
 */
async function expectChosen(testInfo: TestInfo, field: Locator, label: string): Promise<void> {
	if (testInfo.project.use.javaScriptEnabled === false) {
		await expect(field.locator('option:checked')).toHaveText(label);
		return;
	}

	await expect(field).toContainText(label, { timeout: DATABASE_TIMEOUT_MS });
}

test('"Start from" THIMUN fills the settings from its procedure', async ({ page }, testInfo) => {
	const [committeeId] = await openEditor(page, ['Security Council']);
	const section = resolutions(page);

	// The committee starts on the columns' own settings, North American procedure.
	await expect(section.getByLabel('Most sponsors on a draft resolution')).toHaveValue('5');

	await pickOption(page, testInfo, section.getByLabel('Start from'), 'THIMUN');
	await section.getByRole('button', { name: 'Apply' }).click();

	await expect(section.getByLabel('Most sponsors on a draft resolution')).toHaveValue('', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(section.getByLabel('Support a draft resolution needs')).toHaveValue('3');
	await expectChosen(
		testInfo,
		section.getByLabel('Words', { exact: true }),
		'Main submitter and co-submitters'
	);
	await expect(section.getByLabel('Working papers', { exact: true })).not.toBeChecked();
	await expect(section.getByLabel('Amendments to amendments')).toBeChecked();

	expect(await readSettings(committeeId)).toMatchObject({
		paper_words: 'submitters',
		has_working_papers: false,
		sponsor_limit: null,
		support_minimum: 3,
		support_unit: 'seats'
	});
});

test('a changed setting is saved and is still there on a reload', async ({ page }, testInfo) => {
	const [committeeId] = await openEditor(page, ['Security Council']);
	const section = resolutions(page);

	await section.getByLabel('Most sponsors on a draft resolution').fill('8');
	await setChecked(testInfo, section.getByLabel('Amendments to amendments'), true);
	await section.getByRole('button', { name: 'Save settings' }).click();

	await expect
		.poll(() => readSettings(committeeId), { timeout: DATABASE_TIMEOUT_MS })
		.toMatchObject({ sponsor_limit: 8, has_second_degree_amendments: true });

	await page.reload();
	await expect(section.getByLabel('Most sponsors on a draft resolution')).toHaveValue('8', {
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(section.getByLabel('Amendments to amendments')).toBeChecked();
});

test('a share over a hundred percent is refused beside its field', async ({ page }) => {
	const [committeeId] = await openEditor(page, ['Security Council']);
	const section = resolutions(page);

	await section.getByLabel('Support a draft resolution needs').fill('150');
	await section.getByRole('button', { name: 'Save settings' }).click();

	await expect(section.getByText('Enter a whole percentage from 0 to 100.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expect(section.getByLabel('Support a draft resolution needs')).toHaveValue('150');
	expect(await readSettings(committeeId)).toMatchObject({ support_minimum: 20 });
});

test('the settings are copied to another committee of the conference', async ({
	page
}, testInfo) => {
	const [committeeId, otherCommitteeId] = await openEditor(page, [
		'Security Council',
		'Human Rights Council'
	]);
	const section = resolutions(page);

	// Change this committee first, so the copy has something to carry over.
	await pickOption(page, testInfo, section.getByLabel('Start from'), 'THIMUN');
	await section.getByRole('button', { name: 'Apply' }).click();
	await expect
		.poll(() => readSettings(committeeId), { timeout: DATABASE_TIMEOUT_MS })
		.toMatchObject({ paper_words: 'submitters' });
	await expect(section.getByLabel('Support a draft resolution needs')).toHaveValue('3', {
		timeout: DATABASE_TIMEOUT_MS
	});

	await setChecked(testInfo, section.getByLabel('Human Rights Council'), true);
	await section.getByRole('button', { name: 'Copy settings' }).click();

	await expect
		.poll(() => readSettings(otherCommitteeId), { timeout: DATABASE_TIMEOUT_MS })
		.toMatchObject({
			paper_words: 'submitters',
			has_working_papers: false,
			sponsor_limit: null,
			support_minimum: 3,
			support_unit: 'seats',
			has_second_degree_amendments: true
		});
});

test('the section fits a phone', async ({ page }) => {
	await openEditor(page, ['Security Council', 'Human Rights Council']);

	await expect(resolutions(page).getByLabel('Human Rights Council')).toBeVisible();

	await expectNoSidewaysOverflow(page);
	await saveFullPageScreenshot(page, 'committee-procedure');
});
