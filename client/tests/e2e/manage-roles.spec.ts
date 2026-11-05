import { expect, test, type Locator, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { createTestUser, givePresetRole, signIn, type TestUser } from './signed-in-user';
import { createDraftConferenceFor } from './draft-conference';
import { expectNoSidewaysOverflow } from './page-shape';
import { chooseRadio, pickOption, setChecked } from './shadcn-controls';

// The acceptance criteria of the roles page and the role editor that need a
// real browser (`docs/roles-and-permissions.md`, section 6):
// `/manage/[slug]/team/roles`, where an organiser lists the conference's
// roles, orders them, and opens one to change what it may do.
//
// * the list is reached from the team page's "Roles" link and shows the roles
//   highest first;
// * a role can be created blank or copied from another with "Start from";
// * a role's name, scope and permissions can be saved, and it can be moved;
// * an empty role can be deleted after the dialog asks, and a held one cannot;
// * a role at or above the reader's own is not linked, and its editor is not
//   there for them;
// * the pages do not spill off the side of a phone.
//
// Every one runs on the `desktop-no-js` project as well: the forms are plain
// posts, "Start from" is a GET form, and the delete dialog lives in the
// address (`?delete=1`).
//
// Each test makes its own conference with an organisation of its own, dated in
// 2020, for the reasons `tests/e2e/manage-team.spec.ts` gives; its helpers
// below are copies of that file's, which is the choice that file explains.

/** How long a page that reads the database may take to answer. */
const DATABASE_TIMEOUT_MS = 15_000;

/** A name nothing else in the database will match. */
function unusedName(prefix: string): string {
	return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

/** A conference of the test's own, and the addresses these tests use. */
type TestConference = {
	id: string;
	slug: string;
	teamPath: string;
	rolesPath: string;
};

/** Make a draft conference owned by this account, and answer its id and addresses. */
async function createConference(user: TestUser, prefix: string): Promise<TestConference> {
	const draft = await createDraftConferenceFor(user, {
		name: unusedName(prefix),
		organizationName: unusedName(`${prefix} Society`),
		startDate: '2020-05-03',
		endDate: '2020-05-05'
	});
	const admin = createServiceRoleClient();
	const { data, error } = await admin
		.from('conferences')
		.select('id')
		.eq('slug', draft.slug)
		.single();

	if (error || !data) {
		throw new Error(`Could not find the conference "${draft.slug}": ${error?.message}`);
	}

	const managePath = `/manage/${draft.slug}`;

	return {
		id: data.id,
		slug: draft.slug,
		teamPath: `${managePath}/team`,
		rolesPath: `${managePath}/team/roles`
	};
}

/**
 * Sign a new account in as the owner of a new conference, and open its roles
 * page. The owner of the organisation may do everything, so every role is
 * theirs to change.
 */
async function openRolesPageAsOwner(page: Page, prefix: string): Promise<TestConference> {
	const owner = await createTestUser('Priya Nair');
	await signIn(page, owner);

	const conference = await createConference(owner, prefix);

	await page.goto(conference.rolesPath);
	await expectHeading(page, 'Roles');

	return conference;
}

/** Wait for the page's title, which says the page has arrived. */
async function expectHeading(page: Page, title: string): Promise<void> {
	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(title, {
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** A role of the conference's own, written straight to the database. Answers its id. */
async function addRole(
	conferenceId: string,
	role: { name: string; position: number; permissions?: string[] }
): Promise<string> {
	const admin = createServiceRoleClient();
	const { data, error } = await admin
		.from('conference_roles')
		.insert({
			conference_id: conferenceId,
			name: role.name,
			position: role.position,
			scope: 'conference',
			permissions: role.permissions ?? []
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test role: ${error?.message}`);
	}

	return data.id;
}

/** One role as the database holds it, by name, or `null` when there is none. */
async function readRole(conferenceId: string, name: string) {
	const admin = createServiceRoleClient();
	const { data, error } = await admin
		.from('conference_roles')
		.select('id, scope, permissions, position')
		.eq('conference_id', conferenceId)
		.eq('name', name)
		.maybeSingle();

	if (error) {
		throw new Error(`Could not read the role: ${error.message}`);
	}

	return data;
}

/** The conference's role names in the order the roles page lists them. */
async function readRoleOrder(conferenceId: string): Promise<string[]> {
	const admin = createServiceRoleClient();
	const { data, error } = await admin
		.from('conference_roles')
		.select('name')
		.eq('conference_id', conferenceId)
		.order('position', { ascending: true })
		.order('name', { ascending: true });

	if (error) {
		throw new Error(`Could not read the roles: ${error.message}`);
	}

	return (data ?? []).map((row) => row.name);
}

/**
 * The row or card for one role. The list is drawn twice, as a table from `md`
 * up and as stacked rows on a phone, so the copy on screen is the one asked for.
 */
function roleRow(page: Page, name: string): Locator {
	return page
		.getByRole('main')
		.locator('tr, li')
		.filter({ hasText: name })
		.filter({ visible: true });
}

/** A permission's tick box. Its label may go on to say "per committee", so it is matched at the start. */
function permissionBox(page: Page, label: string): Locator {
	return page.getByRole('main').getByRole('checkbox', { name: new RegExp(`^${label}`) });
}

test('lists the roles highest first, reached from the team page', async ({ page }) => {
	const owner = await createTestUser('Priya Nair');
	await signIn(page, owner);
	const conference = await createConference(owner, 'Roles List MUN');

	await page.goto(conference.teamPath);
	await expectHeading(page, 'Team');

	// The People section's heading carries the link to the roles.
	await page.getByRole('region', { name: 'People' }).getByRole('link', { name: 'Roles' }).click();
	await expectHeading(page, 'Roles');
	await expect(page).toHaveURL(conference.rolesPath);

	// Every conference starts with the three preset roles, highest first.
	await expect(page.getByRole('main').getByText('3 roles', { exact: true })).toBeVisible();

	const rows = page
		.getByRole('main')
		.locator('tr, li')
		.filter({ hasText: /^(Organiser|Chair|Volunteer)/ })
		.filter({ visible: true });

	await expect(rows).toHaveCount(3);
	await expect(rows.nth(0)).toContainText('Organiser');
	await expect(rows.nth(1)).toContainText('Chair');
	await expect(rows.nth(2)).toContainText('Volunteer');
	await expect(page.getByRole('link', { name: 'New role' })).toBeVisible();
});

test('creates a role from a blank form', async ({ page }, testInfo) => {
	const conference = await openRolesPageAsOwner(page, 'New Role MUN');

	await page.getByRole('link', { name: 'New role' }).click();
	await expectHeading(page, 'New role');

	await page.getByRole('main').getByLabel('Name').fill('Registration desk');
	await chooseRadio(testInfo, page.getByRole('radio', { name: 'The whole conference' }));
	await setChecked(testInfo, permissionBox(page, 'Decide applications'), true);
	// Deciding includes reading, so with JavaScript that box is ticked for it
	// at once and cannot be unticked. Without it the server adds reading on
	// saving, which the database check below sees.
	if (testInfo.project.use.javaScriptEnabled !== false) {
		await expect(permissionBox(page, 'Read applications')).toBeDisabled();
	}

	await page.getByRole('button', { name: 'Create role' }).press('Enter');

	await expect(page.getByText('Registration desk created.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expectHeading(page, 'Roles');
	await expect(roleRow(page, 'Registration desk')).toBeVisible();

	// It went in at the bottom of the order, holding what deciding brings.
	expect(await readRoleOrder(conference.id)).toEqual([
		'Organiser',
		'Chair',
		'Volunteer',
		'Registration desk'
	]);
	expect(await readRole(conference.id, 'Registration desk')).toMatchObject({
		scope: 'conference',
		permissions: ['read_applications', 'decide_applications']
	});
});

test('copies another role into the form with "Start from"', async ({ page }, testInfo) => {
	const conference = await openRolesPageAsOwner(page, 'Start From MUN');
	const chair = await readRole(conference.id, 'Chair');

	await page.getByRole('link', { name: 'New role' }).click();
	await expectHeading(page, 'New role');

	await pickOption(page, testInfo, page.getByLabel('Start from', { exact: true }), 'Chair');
	await page.getByRole('button', { name: 'Copy' }).press('Enter');

	// "Start from" is a GET form, so the address says which role was copied.
	await expect(page).toHaveURL(new RegExp(`\\?from=${chair?.id}$`), {
		timeout: DATABASE_TIMEOUT_MS
	});

	// The scope and the permissions come across; the name does not.
	await expect(
		page.getByRole('radio', { name: 'The committees each member is assigned to' })
	).toBeChecked();
	await expect(permissionBox(page, 'Run the committee room')).toBeChecked();
	await expect(permissionBox(page, 'Decide applications')).not.toBeChecked();
	await expect(page.getByRole('main').getByLabel('Name')).toHaveValue('');

	// Nothing is saved until the role is created.
	expect(await readRoleOrder(conference.id)).toEqual(['Organiser', 'Chair', 'Volunteer']);
});

test('saves changes to a role, and moves it up the order', async ({ page }, testInfo) => {
	const conference = await openRolesPageAsOwner(page, 'Edit Role MUN');

	await addRole(conference.id, { name: 'Press', position: 3 });
	await page.reload();

	await roleRow(page, 'Press').getByRole('link', { name: 'Press' }).click();
	await expectHeading(page, 'Press');

	await page.getByRole('main').getByLabel('Name').fill('Press office');
	await setChecked(testInfo, permissionBox(page, 'Send announcements'), true);
	await page.getByRole('button', { name: 'Save changes' }).press('Enter');

	await expect(page.getByText('Changes saved.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expectHeading(page, 'Press office');
	expect(await readRole(conference.id, 'Press office')).toMatchObject({
		permissions: ['send_announcements']
	});

	// Back to the list, and one place up: above Volunteer.
	await page.getByRole('link', { name: 'Roles' }).first().click();
	await expectHeading(page, 'Roles');

	// The first role cannot move up, and the last cannot move down.
	await expect(page.getByRole('button', { name: 'Move Organiser up' })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Move Press office down' })).toBeDisabled();

	await page.getByRole('button', { name: 'Move Press office up' }).press('Enter');

	await expect
		.poll(() => readRoleOrder(conference.id), { timeout: DATABASE_TIMEOUT_MS })
		.toEqual(['Organiser', 'Chair', 'Press office', 'Volunteer']);
	await expect(page.getByRole('button', { name: 'Move Press office down' })).toBeEnabled({
		timeout: DATABASE_TIMEOUT_MS
	});
});

test('deletes a role nobody holds once asked, and refuses one somebody does', async ({ page }) => {
	const conference = await openRolesPageAsOwner(page, 'Delete Role MUN');
	const volunteer = await createTestUser('Tom Bakker');
	const admin = createServiceRoleClient();

	await admin
		.from('conference_staff')
		.insert({ conference_id: conference.id, user_id: volunteer.id });
	await givePresetRole(volunteer.id, conference.id, 'Volunteer');

	// A held role: "Delete role" cannot be pressed, and the page says what to do first.
	await roleRow(page, 'Volunteer').getByRole('link', { name: 'Volunteer' }).click();
	await expectHeading(page, 'Volunteer');

	await expect(page.getByRole('button', { name: 'Delete role' })).toBeDisabled();
	await expect(
		page.getByText('To delete this role, first take it off its 1 member on the team page.')
	).toBeVisible();

	// An empty one: the dialog asks, and the role goes.
	const pressRoleId = await addRole(conference.id, { name: 'Press', position: 3 });

	await page.goto(`${conference.rolesPath}/${pressRoleId}`);
	await expectHeading(page, 'Press');
	await page.getByRole('link', { name: 'Delete role' }).click();

	const dialog = page
		.getByRole('dialog')
		.filter({ has: page.getByRole('heading', { name: 'Delete Press?' }) });

	await expect(dialog).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await dialog.getByRole('button', { name: 'Delete role' }).press('Enter');

	await expect(page.getByText('Press deleted.')).toBeVisible({ timeout: DATABASE_TIMEOUT_MS });
	await expectHeading(page, 'Roles');
	await expect(roleRow(page, 'Press')).toHaveCount(0);
	expect(await readRole(conference.id, 'Press')).toBeNull();
});

test('offers only the roles below the reader’s own', async ({ page }) => {
	const owner = await createTestUser('Priya Nair');
	const conference = await createConference(owner, 'Role Rank MUN');
	const reader = await createTestUser('Sofia Rossi');
	const admin = createServiceRoleClient();

	// The reader's own role goes second, between Organiser and Chair, so there
	// is a role above it, one below that holds more than it does, and one
	// below that it may change. The two presets under it move down to make room.
	for (const [name, position] of [
		['Volunteer', 3],
		['Chair', 2]
	] as const) {
		await admin
			.from('conference_roles')
			.update({ position })
			.eq('conference_id', conference.id)
			.eq('name', name);
	}

	const headOfStaffRoleId = await addRole(conference.id, {
		name: 'Head of staff',
		position: 1,
		permissions: ['manage_team', 'manage_roles']
	});

	await admin.from('conference_staff').insert({ conference_id: conference.id, user_id: reader.id });
	await admin
		.from('conference_role_members')
		.insert({ conference_id: conference.id, user_id: reader.id, role_id: headOfStaffRoleId });

	await signIn(page, reader);
	await page.goto(conference.rolesPath);
	await expectHeading(page, 'Roles');

	// Each locked role says why, and is plain words rather than a link.
	await expect(roleRow(page, 'Organiser')).toContainText('Above your role');
	await expect(roleRow(page, 'Head of staff')).toContainText('Your role');
	await expect(roleRow(page, 'Chair')).toContainText('Holds permissions you do not have');

	for (const name of ['Organiser', 'Head of staff', 'Chair']) {
		await expect(roleRow(page, name).getByRole('link', { name })).toHaveCount(0);
	}

	await expect(roleRow(page, 'Volunteer').getByRole('link', { name: 'Volunteer' })).toBeVisible();

	// And the editor of a role above them is not there for them.
	const organiser = await readRole(conference.id, 'Organiser');
	const response = await page.goto(`${conference.rolesPath}/${organiser?.id}`);

	expect(response?.status()).toBe(404);
});

test('does not spill off the side of a phone screen', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only the phone project has a phone-sized window.');

	const conference = await openRolesPageAsOwner(page, 'Phone Roles MUN');
	const longRoleId = await addRole(conference.id, {
		name: 'Head of the registration desk team',
		position: 3
	});

	await page.reload();
	await expect(roleRow(page, 'Head of the registration desk team')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	await expectNoSidewaysOverflow(page);

	await page.goto(`${conference.rolesPath}/${longRoleId}`);
	await expectHeading(page, 'Head of the registration desk team');
	await expectNoSidewaysOverflow(page);
});
