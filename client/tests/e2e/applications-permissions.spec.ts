import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { createTestUser, giveApplication, signIn, type TestUser } from './signed-in-user';
import {
	addScheduleCommittee,
	createScheduleConference,
	type ScheduleConference
} from './schedule-fixtures';

// Step 5 of docs/roles-and-permissions.md, in a browser: `read_applications`
// opens the applications, the delegations and the allocation grid, and
// `decide_applications` is what draws their forms. A reader who may not
// decide sees the same pages with every tick box, button, drag handle and seat
// menu left out, and the server refuses the post even if one is sent.
//
// Every test makes its own draft conference with one committee, two free seats
// and one submitted application, then signs in as a team member with one role.

/** How long an assertion that waits on a page reading the database may take. */
const DATABASE_TIMEOUT_MS = 15_000;

type Setup = {
	conference: ScheduleConference;
	applicant: TestUser;
	applicationId: string;
	franceSeat: string;
	applicationsPath: string;
};

/** Put one free seat in a committee, and answer its id. */
async function addFreeSeat(committeeId: string, name: string, countryCode: string) {
	const { data, error } = await createServiceRoleClient()
		.from('seats')
		.insert({ committee_id: committeeId, name, kind: 'country', country_code: countryCode })
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test seat: ${error?.message}`);
	}

	return data.id;
}

/** A draft conference with one committee, France and Chile free, and Anna's application. */
async function createSetup(prefix: string): Promise<Setup> {
	const owner = await createTestUser('Priya Nair');
	const conference = await createScheduleConference({
		owner,
		namePrefix: prefix,
		status: 'draft'
	});
	const committeeId = await addScheduleCommittee(conference.id, {
		name: 'Security Council',
		abbreviation: 'UNSC'
	});
	const franceSeat = await addFreeSeat(committeeId, 'France', 'FR');
	await addFreeSeat(committeeId, 'Chile', 'CL');

	const applicant = await createTestUser('Anna Kowalski');
	const applicationId = await giveApplication(applicant, {
		conferenceId: conference.id,
		status: 'submitted',
		committeePreferences: [committeeId],
		motivation: 'I would like a seat this year.'
	});

	return {
		conference,
		applicant,
		applicationId,
		franceSeat,
		applicationsPath: `/manage/${conference.slug}/applications`
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

/** Open a page and wait until its title says it has really arrived. */
async function openPage(page: Page, path: string, title: string): Promise<void> {
	await page.goto(path);

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(title, {
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** Post to a form action the way a browser with no script does, with the browser's cookies. */
async function postForm(page: Page, action: string, fields: [string, string][]) {
	const origin = new URL(page.url()).origin;

	return page.request.post(action, {
		data: new URLSearchParams(fields).toString(),
		headers: { origin, accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' }
	}) as Promise<APIResponse>;
}

/** The application's status, read past every policy. */
async function readStatus(applicationId: string): Promise<string | undefined> {
	const { data } = await createServiceRoleClient()
		.from('applications')
		.select('status')
		.eq('id', applicationId)
		.single();

	return data?.status;
}

// Every test signs a new account in against the one database the suite shares.
test.beforeEach(() => {
	test.slow();
});

test('shows a reader without decide_applications the applications and nothing to decide with', async ({
	page
}) => {
	const setup = await createSetup('Read Only Applications MUN');
	const reader = await teamMemberWith(setup.conference.id, ['read_applications']);

	await signIn(page, reader);
	await openPage(page, setup.applicationsPath, 'Applications');

	const main = page.getByRole('main');

	await expect(main.getByText('Anna Kowalski').filter({ visible: true }).first()).toBeVisible();
	await expect(main.getByRole('checkbox')).toHaveCount(0);
	await expect(main.getByRole('button', { name: /^Accept/ })).toHaveCount(0);

	const reviewPath = `${setup.applicationsPath}/${setup.applicationId}`;
	await openPage(page, reviewPath, 'Anna Kowalski');

	await expect(main.getByRole('button', { name: 'Accept and allocate' })).toHaveCount(0);
	await expect(main.getByRole('button', { name: 'Waitlist' })).toHaveCount(0);

	// The form is not drawn, and the server refuses the post all the same.
	const response = await postForm(page, `${reviewPath}?/waitlist`, []);

	expect(response.status()).toBe(404);
	expect(await readStatus(setup.applicationId)).toBe('submitted');
});

test('shows a reader without decide_applications the allocation grid without seat menus', async ({
	page
}) => {
	const setup = await createSetup('Read Only Allocation MUN');
	const reader = await teamMemberWith(setup.conference.id, ['read_applications']);

	await signIn(page, reader);
	await openPage(page, `/manage/${setup.conference.slug}/allocation`, 'Allocation');

	const main = page.getByRole('main');

	// A phone folds each committee shut, so the seat is in the page but not on screen.
	await expect(main.getByText('France').first()).toBeAttached();
	await expect(main.getByRole('button', { name: 'Seat actions' })).toHaveCount(0);
});

test('lets a holder of decide_applications accept an application into a seat', async ({ page }) => {
	const setup = await createSetup('Decider Applications MUN');
	const decider = await teamMemberWith(setup.conference.id, [
		'read_applications',
		'decide_applications'
	]);
	const reviewPath = `${setup.applicationsPath}/${setup.applicationId}`;

	await signIn(page, decider);
	await openPage(page, reviewPath, 'Anna Kowalski');

	const main = page.getByRole('main');
	await main.locator('select[name="seatId"]').selectOption(setup.franceSeat);
	await main.getByRole('button', { name: 'Accept and allocate' }).press('Enter');

	await expect(page.getByText('Anna Kowalski is now France in UNSC.')).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
	expect(await readStatus(setup.applicationId)).toBe('accepted');
});
