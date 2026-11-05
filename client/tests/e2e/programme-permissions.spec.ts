import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import { createTestUser, signIn, type TestUser } from './signed-in-user';
import {
	addScheduleCommittee,
	addScheduleEvent,
	createScheduleConference,
	readEventTitles,
	SCHEDULE_FIRST_DAY,
	type ScheduleConference
} from './schedule-fixtures';

// Step 7 of docs/roles-and-permissions.md, in a browser: `edit_schedule`,
// `send_announcements` and `manage_documents` open the programme, the
// announcements and the documents pages. Held per committee, the first two
// draw only what the reader may write for their own committees, and the
// server refuses a post for anybody else.
//
// Every test makes its own published conference with two committees and an
// opening ceremony for everyone, then signs in as a team member with one role.

/** How long an assertion that waits on a page reading the database may take. */
const DATABASE_TIMEOUT_MS = 15_000;

type Setup = {
	conference: ScheduleConference;
	/** The committee a role per committee is assigned to. */
	ownCommitteeId: string;
	otherCommitteeId: string;
	openingId: string;
};

async function createSetup(prefix: string): Promise<Setup> {
	const owner = await createTestUser('Priya Nair');
	const conference = await createScheduleConference({ owner, namePrefix: prefix });
	const ownCommitteeId = await addScheduleCommittee(conference.id, {
		name: 'Security Council',
		abbreviation: 'UNSC',
		position: 0
	});
	const otherCommitteeId = await addScheduleCommittee(conference.id, {
		name: 'World Health Organization',
		abbreviation: 'WHO',
		position: 1
	});
	const openingId = await addScheduleEvent({
		conferenceId: conference.id,
		title: 'Opening ceremony',
		startsAt: `${SCHEDULE_FIRST_DAY}T08:00:00Z`,
		endsAt: `${SCHEDULE_FIRST_DAY}T09:00:00Z`,
		audience: 'everyone'
	});

	return { conference, ownCommitteeId, otherCommitteeId, openingId };
}

/**
 * A new team member holding one role with these permissions. A role per
 * committee comes with the setup's own committee, which `committee_chairs` records.
 */
async function teamMemberWith(
	setup: Setup,
	permissions: string[],
	scope: 'conference' | 'committees' = 'conference'
): Promise<TestUser> {
	const admin = createServiceRoleClient();
	const conferenceId = setup.conference.id;
	const member = await createTestUser('Sofia Desk');

	const { data: role, error: roleError } = await admin
		.from('conference_roles')
		.insert({
			conference_id: conferenceId,
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

	await admin.from('conference_staff').insert({ conference_id: conferenceId, user_id: member.id });

	const { error } = await admin
		.from('conference_role_members')
		.insert({ conference_id: conferenceId, user_id: member.id, role_id: role.id });

	if (error) {
		throw new Error(`Could not give the test role: ${error.message}`);
	}

	if (scope === 'committees') {
		await admin
			.from('committee_chairs')
			.insert({ committee_id: setup.ownCommitteeId, user_id: member.id });
	}

	return member;
}

/** Open a page of the conference and wait until its title says it has really arrived. */
async function openPage(page: Page, path: string, title: string): Promise<void> {
	await page.goto(path);

	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(title, {
		timeout: DATABASE_TIMEOUT_MS
	});
}

/** An event's own menu of actions, a `<details>` whose summary names the event. */
function eventActions(page: Page, eventTitle: string) {
	return page.getByRole('main').locator('summary', { hasText: `Actions for ${eventTitle}` });
}

/** Post to a form action the way a browser with no script does, with the browser's cookies. */
async function postForm(page: Page, action: string, fields: [string, string][]) {
	const origin = new URL(page.url()).origin;

	return page.request.post(action, {
		data: new URLSearchParams(fields).toString(),
		headers: { origin, accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' }
	}) as Promise<APIResponse>;
}

// Every test signs a new account in against the one database the suite shares.
test.beforeEach(() => {
	test.slow();
});

test('opens the programme and the shared files for Logistics, and not the announcements', async ({
	page
}) => {
	const setup = await createSetup('Logistics MUN');
	const logistics = await teamMemberWith(setup, ['edit_schedule', 'manage_documents']);
	const managePath = `/manage/${setup.conference.slug}`;

	await signIn(page, logistics);
	await openPage(page, `${managePath}/schedule?view=list&day=${SCHEDULE_FIRST_DAY}`, 'Schedule');

	const main = page.getByRole('main');

	await expect(eventActions(page, 'Opening ceremony')).toBeVisible();
	await expect(main.getByLabel('Show the programme on the public page')).toBeAttached();

	// The shared files alone: no tabs for the committees' guides and papers.
	await openPage(page, `${managePath}/documents?tab=papers`, 'Documents');
	await expect(main.getByRole('heading', { name: 'Upload a document' })).toBeAttached();
	await expect(main.getByRole('link', { name: /Position papers/ })).toHaveCount(0);

	const announcements = await page.request.get(`${managePath}/announcements`);
	expect(announcements.status()).toBe(404);
});

test('lets a chair announce to their own committee only', async ({ page }) => {
	const setup = await createSetup('Chair Announces MUN');
	const chair = await teamMemberWith(setup, ['send_announcements'], 'committees');
	const announcementsPath = `/manage/${setup.conference.slug}/announcements`;

	await signIn(page, chair);
	await openPage(page, announcementsPath, 'Announcements');

	const main = page.getByRole('main');
	const audiencePicker = main.getByLabel('Send to');

	await expect(audiencePicker.locator('option')).toHaveText(['One committee']);
	await expect(main.getByRole('combobox', { name: 'Committee' }).locator('option')).toContainText([
		'Security Council'
	]);
	await expect(main.getByText('World Health Organization')).toHaveCount(0);

	// Nothing is drawn for everyone, and the server refuses a post for it all the same.
	const toEveryone = await postForm(page, `${announcementsPath}?/publish`, [
		['title', 'Dress code'],
		['body', 'Western business attire.'],
		['audience', 'everyone']
	]);
	const toOwn = await postForm(page, `${announcementsPath}?/publish`, [
		['title', 'Room change'],
		['body', 'Session I moves to room 2.'],
		['audience', 'committee'],
		['committeeId', setup.ownCommitteeId]
	]);

	expect(toEveryone.status()).toBe(404);
	expect(toOwn.status()).toBeLessThan(400);
});

test('shows a chair who edits their committee’s programme the rest without its actions', async ({
	page
}) => {
	const setup = await createSetup('Chair Programme MUN');
	const chair = await teamMemberWith(setup, ['edit_schedule'], 'committees');
	const schedulePath = `/manage/${setup.conference.slug}/schedule`;

	await addScheduleEvent({
		conferenceId: setup.conference.id,
		title: 'Session 1',
		startsAt: `${SCHEDULE_FIRST_DAY}T10:00:00Z`,
		endsAt: `${SCHEDULE_FIRST_DAY}T12:00:00Z`,
		audience: 'committee',
		committeeId: setup.ownCommitteeId
	});

	await signIn(page, chair);
	await openPage(page, `${schedulePath}?view=list&day=${SCHEDULE_FIRST_DAY}`, 'Schedule');

	const main = page.getByRole('main');

	await expect(main.getByText('Opening ceremony')).toBeVisible();
	await expect(eventActions(page, 'Opening ceremony')).toHaveCount(0);
	await expect(eventActions(page, 'Session 1')).toBeVisible();
	await expect(main.getByLabel('Show the programme on the public page')).toHaveCount(0);

	const response = await postForm(page, `${schedulePath}?/deleteEvent`, [
		['eventId', setup.openingId],
		['confirm', '1']
	]);

	expect(response.status()).toBe(404);
	expect(await readEventTitles(setup.conference.id)).toContain('Opening ceremony');
});
