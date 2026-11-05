import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { createTestUser, makeCommitteeChair, signIn, type TestUser } from './signed-in-user';
import {
	addScheduleCommittee,
	createScheduleConference,
	type ScheduleConference
} from './schedule-fixtures';
import { seatAcceptedApplicantAs } from './document-fixtures';

// Step 4 of docs/roles-and-permissions.md, in a browser: the participants page
// and its export show each private column only to a reader who holds the
// permission behind it, and a reader who holds `read_participants` per
// committee sees the people of their own committee only.
//
// Every test makes its own conference with two committees and one delegate in
// each, then signs in as a team member who holds one role.

/** How long an assertion that waits on a page reading the database may take. */
const DATABASE_TIMEOUT_MS = 15_000;

type TwoCommittees = {
	conference: ScheduleConference;
	committeeA: string;
	anna: TestUser;
	carlos: TestUser;
	participantsPath: string;
};

/**
 * A conference with Anna seated in UNSC and Carlos in DISEC, each with an
 * accepted application behind the seat, which is what the private-details views
 * count since migration 20261022110000.
 */
async function createTwoCommittees(prefix: string): Promise<TwoCommittees> {
	const owner = await createTestUser('Priya Nair');
	const conference = await createScheduleConference({ owner, namePrefix: prefix });
	const committeeA = await addScheduleCommittee(conference.id, {
		name: 'Security Council',
		abbreviation: 'UNSC'
	});
	const committeeB = await addScheduleCommittee(conference.id, {
		name: 'Disarmament and International Security',
		abbreviation: 'DISEC'
	});

	const anna = await createTestUser('Anna Kowalski');
	const carlos = await createTestUser('Carlos Mendes');
	await seatAcceptedApplicantAs(anna, conference.id, committeeA, 'France');
	await seatAcceptedApplicantAs(carlos, conference.id, committeeB, 'Kenya');

	return {
		conference,
		committeeA,
		anna,
		carlos,
		participantsPath: `/manage/${conference.slug}/participants`
	};
}

/** A new team member holding one conference-wide role with these permissions. */
async function teamMemberWith(conferenceId: string, permissions: string[]): Promise<TestUser> {
	const admin = createServiceRoleClient();
	const member = await createTestUser('Sofia Desk');

	const { data: role, error: roleError } = await admin
		.from('conference_roles')
		.insert({
			conference_id: conferenceId,
			name: `Desk ${crypto.randomUUID().slice(0, 8)}`,
			position: 1,
			permissions
		})
		.select('id')
		.single();

	if (roleError || !role) {
		throw new Error(`Could not make the test role: ${roleError?.message}`);
	}

	await admin.from('conference_staff').insert({ conference_id: conferenceId, user_id: member.id });

	const { error } = await admin
		.from('conference_role_members')
		.insert({ conference_id: conferenceId, user_id: member.id, role_id: role.id });

	if (error) {
		throw new Error(`Could not give the test role: ${error.message}`);
	}

	return member;
}

/** Open the participants page and wait until it has really arrived. */
async function openParticipants(page: Page, address: string): Promise<void> {
	await page.goto(address);

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
		'Participants',
		{ timeout: DATABASE_TIMEOUT_MS }
	);
}

/** The column headings of the participants table. */
function columnHeadings(page: Page) {
	return page.getByRole('main').getByRole('columnheader');
}

// Every test signs a new account in against the one database the suite shares.
test.beforeEach(() => {
	test.slow();
});

test('shows a reader with read_contact_details the email and not the welfare columns', async ({
	page
}, testInfo) => {
	const setup = await createTwoCommittees('Private Contact MUN');
	const desk = await teamMemberWith(setup.conference.id, [
		'read_participants',
		'read_contact_details'
	]);

	await signIn(page, desk);
	await openParticipants(page, setup.participantsPath);

	const main = page.getByRole('main');

	await expect(main.getByText(setup.anna.email).filter({ visible: true })).toHaveCount(1);
	await expect(main.getByText('Carlos Mendes').filter({ visible: true })).toHaveCount(1);

	// The table is the desktop's; a phone shows cards, which have no headings.
	if (testInfo.project.name !== 'phone') {
		await expect(columnHeadings(page).filter({ hasText: 'Email' })).toHaveCount(1);
		await expect(columnHeadings(page).filter({ hasText: 'Date of birth' })).toHaveCount(0);
		// Payment follows the invoices, which this reader may not read.
		await expect(columnHeadings(page).filter({ hasText: 'Invoice' })).toHaveCount(0);
	}

	const response = await page.request.get(`${setup.participantsPath}/export`);
	const headings = (await response.text()).split(/\r?\n/)[0];

	expect(response.status()).toBe(200);
	expect(headings).toContain('Email');
	expect(headings).not.toContain('Date of birth');
	expect(headings).not.toContain('Emergency contact');
	expect(headings).not.toContain('Invoice status');
});

test('shows a reader with read_welfare_details the welfare columns and not the email', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name === 'phone', 'The column headings are the desktop table’s.');

	const setup = await createTwoCommittees('Private Welfare MUN');
	const welfare = await teamMemberWith(setup.conference.id, [
		'read_participants',
		'read_welfare_details'
	]);

	await signIn(page, welfare);
	await openParticipants(page, setup.participantsPath);

	await expect(columnHeadings(page).filter({ hasText: 'Date of birth' })).toHaveCount(1);
	await expect(columnHeadings(page).filter({ hasText: 'Dietary' })).toHaveCount(1);
	await expect(columnHeadings(page).filter({ hasText: 'Email' })).toHaveCount(0);
	await expect(page.getByRole('main').getByText(setup.anna.email)).toHaveCount(0);
});

test('shows a chair the participants of their own committee only, without private columns', async ({
	page
}) => {
	const setup = await createTwoCommittees('Private Chair MUN');
	const chair = await createTestUser('Kofi Mensah');
	await makeCommitteeChair(chair, setup.committeeA);

	await signIn(page, chair);
	await openParticipants(page, setup.participantsPath);

	const main = page.getByRole('main');

	await expect(main.getByText('Anna Kowalski').filter({ visible: true })).toHaveCount(1);
	await expect(main.getByText('Carlos Mendes')).toHaveCount(0);
	await expect(main.getByText(setup.anna.email)).toHaveCount(0);

	const response = await page.request.get(`${setup.participantsPath}/export`);
	const text = await response.text();

	expect(response.status()).toBe(200);
	expect(text).toContain('Anna Kowalski');
	expect(text).not.toContain('Carlos Mendes');
	expect(text.split(/\r?\n/)[0]).not.toContain('Email');
});

test('answers a team member without read_participants with a 404', async ({ page }) => {
	const setup = await createTwoCommittees('Private Refused MUN');
	const volunteer = await teamMemberWith(setup.conference.id, ['read_contact_details']);

	await signIn(page, volunteer);

	const pageResponse = await page.goto(setup.participantsPath);
	const exportResponse = await page.request.get(`${setup.participantsPath}/export`);

	expect(pageResponse?.status()).toBe(404);
	expect(exportResponse.status()).toBe(404);
});
