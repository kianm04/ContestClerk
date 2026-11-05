import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	DATABASE_TIMEOUT_MS,
	makeChairedCommittee,
	openCommitteeMenu,
	openRoom,
	type ChairedCommittee
} from './chair-room-fixtures';
import { addScheduleCommittee } from './schedule-fixtures';
import { createTestUser, signIn, type TestUser } from './signed-in-user';

// Step 8 of docs/roles-and-permissions.md, in a browser: a Head of academics
// role, conference-wide, edits every committee and reviews every paper; a
// co-chair who only runs the clock (`run_room`) sees no notes, papers or
// awards; and a chair, whose preset role holds `manage_committees` per
// committee, edits only their own committee's description and agenda.
//
// Every test makes its own conference, with a chaired Security Council and a
// second committee nobody here is assigned.

type Setup = ChairedCommittee & { otherCommitteeId: string };

async function createSetup(prefix: string): Promise<Setup> {
	const room = await makeChairedCommittee(prefix);
	const otherCommitteeId = await addScheduleCommittee(room.conferenceId, {
		name: 'World Health Organization',
		abbreviation: 'WHO',
		position: 1
	});

	return { ...room, otherCommitteeId };
}

/**
 * A new team member holding one role with these permissions. A role per
 * committee comes with the Security Council, which `committee_chairs` records.
 */
async function teamMemberWith(
	setup: Setup,
	permissions: string[],
	scope: 'conference' | 'committees' = 'conference'
): Promise<TestUser> {
	const admin = createServiceRoleClient();
	const member = await createTestUser('Sofia Desk');

	const { data: role, error: roleError } = await admin
		.from('conference_roles')
		.insert({
			conference_id: setup.conferenceId,
			name: `Desk ${crypto.randomUUID().slice(0, 8)}`,
			position: 1,
			scope,
			permissions
		})
		.select('id')
		.single();

	if (roleError || !role) {
		throw new Error(`Could not make the test role: ${roleError?.message}`);
	}

	await admin
		.from('conference_staff')
		.insert({ conference_id: setup.conferenceId, user_id: member.id });

	const { error } = await admin
		.from('conference_role_members')
		.insert({ conference_id: setup.conferenceId, user_id: member.id, role_id: role.id });

	if (error) {
		throw new Error(`Could not give the test role: ${error.message}`);
	}

	if (scope === 'committees') {
		await admin
			.from('committee_chairs')
			.insert({ committee_id: setup.committeeId, user_id: member.id });
	}

	return member;
}

/** Open a page and wait until its title says it has really arrived. */
async function openPage(page: Page, path: string, title: string): Promise<void> {
	await page.goto(path);

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(title, {
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** The committee's description, read past every policy. */
async function readDescription(committeeId: string): Promise<string | null | undefined> {
	const { data } = await createServiceRoleClient()
		.from('committees')
		.select('description')
		.eq('id', committeeId)
		.single();

	return data?.description;
}

// Every test signs a new account in against the one database the suite shares.
test.beforeEach(() => {
	test.slow();
});

test('lets a Head of academics edit every committee and review the papers', async ({ page }) => {
	const setup = await createSetup('Academics MUN');
	const academics = await teamMemberWith(setup, [
		'manage_committees',
		'run_room',
		'review_papers',
		'write_chair_notes',
		'propose_awards',
		'confirm_awards',
		'manage_documents'
	]);
	const managePath = `/manage/${setup.conferenceSlug}`;

	await signIn(page, academics);
	await openPage(
		page,
		`${managePath}/committees/${setup.otherCommitteeId}`,
		'World Health Organization'
	);

	const main = page.getByRole('main');

	await expect(main.getByLabel('Name', { exact: true })).toBeVisible();
	await expect(main.getByRole('button', { name: 'Delete committee' })).toBeVisible();

	await openPage(page, `${managePath}/documents?tab=papers`, 'Documents');
	await expect(main.getByRole('link', { name: /Position papers/ })).toBeVisible();

	await openRoom(page, setup.roomPath);
	const menu = await openCommitteeMenu(page);

	await expect(menu.getByRole('link', { name: 'Papers' })).toBeVisible();
	await expect(menu.getByRole('link', { name: 'Notes' })).toBeVisible();
	await expect(menu.getByRole('link', { name: 'Awards' })).toBeVisible();
});

test('shows a co-chair who only runs the clock no notes, papers or awards', async ({ page }) => {
	const setup = await createSetup('Clock MUN');
	const clock = await teamMemberWith(setup, ['run_room'], 'committees');

	await signIn(page, clock);
	await openRoom(page, setup.roomPath);

	const menu = await openCommitteeMenu(page);

	await expect(menu.getByRole('link', { name: 'Notes' })).toHaveCount(0);
	await expect(menu.getByRole('link', { name: 'Papers' })).toHaveCount(0);
	await expect(menu.getByRole('link', { name: 'Awards' })).toHaveCount(0);

	const notes = await page.request.get(`${setup.roomPath}/notes`);
	expect(notes.status()).toBe(404);
});

test('lets a chair edit their own committee’s description and agenda, and no other', async ({
	page
}) => {
	const setup = await createSetup('Chair Agenda MUN');
	const committeesPath = `/manage/${setup.conferenceSlug}/committees`;

	await signIn(page, setup.chair);
	await openPage(page, `${committeesPath}/${setup.committeeId}`, 'Security Council');

	const main = page.getByRole('main');

	await expect(main.getByLabel('Name', { exact: true })).toHaveCount(0);
	await expect(main.getByRole('button', { name: 'Delete committee' })).toHaveCount(0);

	// The agenda needs at least one topic, and the fixture committee has none yet.
	await main.getByLabel('Description').fill('The council of fifteen.');
	await main.getByRole('textbox', { name: 'Topic 1' }).fill('Cyber warfare');
	await main.getByRole('button', { name: 'Save changes' }).click();

	await expect
		.poll(() => readDescription(setup.committeeId), { timeout: DATABASE_TIMEOUT_MS })
		.toBe('The council of fifteen.');

	const other = await page.request.get(`${committeesPath}/${setup.otherCommitteeId}`);
	expect(other.status()).toBe(404);
});
