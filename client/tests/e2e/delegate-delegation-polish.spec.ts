import { test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	expectEveryControlNamed,
	expectReadableContrast,
	expectVisibleFocusEverywhere
} from './accessibility';
import { addAnnouncement } from './announcement-fixtures';
import { seatDelegateAs } from './document-fixtures';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';
import { addResourceFile, seatAsDelegate } from './resources-fixtures';
import { addScheduleCommittee, createScheduleConference, unusedName } from './schedule-fixtures';
import {
	createTestUser,
	giveApplication,
	giveInvoice,
	giveNotifications,
	signIn,
	type TestUser
} from './signed-in-user';

// The accessibility pass of T51 over every page in `specs/05-pages/delegate/`
// and `specs/05-pages/delegation/`: each one names its controls, draws a focus
// ring wherever Tab lands, keeps its text readable and fits a phone. The
// screenshot of each is what the layout was compared against its spec with.
// `public-auth-polish.spec.ts` does the same for the public and auth pages.
//
// Each page's own behaviour is tested in its own spec file; this one only looks
// at how the page is drawn, once with something in it and, for the lists, once
// empty.
//
// Every test makes its own accounts, and the delegate's pages hang on a
// conference made for this file, so the three Playwright projects running at the
// same time never see each other's rows.

/** The seeded conference whose applications and delegations are open. */
const OPEN_CONFERENCE_ID = '20000000-0000-4000-8000-000000000009';
const OPEN_CONFERENCE_SLUG = 'amsterdammun-2027';

/** The committee this file makes, and the seat its delegate sits in. */
const COMMITTEE_NAME = 'General Assembly Third Committee';
const SEAT_NAME = 'Portugal';

/** Every check this file makes, on whatever page the browser is showing. */
async function checkThePage(page: Page, screenshotName: string): Promise<void> {
	await saveFullPageScreenshot(page, screenshotName);
	await expectNoSidewaysOverflow(page);
	await expectEveryControlNamed(page);
	await expectReadableContrast(page);
	await expectVisibleFocusEverywhere(page);
}

/** A conference made for one test, with the one committee its delegate sits in. */
type DelegateWorld = {
	delegate: TestUser;
	conferenceId: string;
	conferenceSlug: string;
	committeeSlug: string;
	applicationId: string;
	invoiceId: string;
};

/** Put one committee with a known slug in a conference, and answer its id and slug. */
async function addCommittee(conferenceId: string): Promise<{ id: string; slug: string }> {
	const slug = `polish-committee-${crypto.randomUUID()}`;

	const { data, error } = await createServiceRoleClient()
		.from('committees')
		.insert({
			conference_id: conferenceId,
			name: COMMITTEE_NAME,
			abbreviation: 'SOCHUM',
			slug,
			room: 'Aula'
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the test committee: ${error?.message}`);
	}

	return { id: data.id, slug };
}

/** How far ahead the conference made here starts, so every page treats it as coming up. */
const DAYS_UNTIL_CONFERENCE = 30;

/**
 * Move a conference `createScheduleConference` made, which ran in 2020, to a
 * month from now: the dashboard and the applications list leave a finished
 * conference out, and a polish pass has to see them with something in them.
 *
 * Its applications closed yesterday, because a conference with no closing date
 * counts as open, and an open one would push the seeded conferences out of
 * "Open for applications" on `/home` while this file runs.
 */
async function moveIntoTheFuture(conferenceId: string): Promise<void> {
	const oneDayMs = 24 * 60 * 60 * 1000;
	const firstDay = new Date(Date.now() + DAYS_UNTIL_CONFERENCE * oneDayMs);
	const lastDay = new Date(firstDay.getTime() + 2 * oneDayMs);

	const { error } = await createServiceRoleClient()
		.from('conferences')
		.update({
			start_date: firstDay.toISOString().slice(0, 10),
			end_date: lastDay.toISOString().slice(0, 10),
			applications_close_at: new Date(Date.now() - oneDayMs).toISOString()
		})
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not move the test conference: ${error.message}`);
	}
}

/**
 * A delegate with something on every one of their pages: an accepted
 * application and a draft, a seat, an unpaid invoice, a notification and an announcement.
 */
async function makeDelegateWorld(): Promise<DelegateWorld> {
	const organiser = await createTestUser('Olivia Organiser');
	const delegate = await createTestUser('Daniel Perez');
	const conference = await createScheduleConference({
		owner: organiser,
		namePrefix: 'Polish MUN'
	});
	await moveIntoTheFuture(conference.id);
	const committee = await addCommittee(conference.id);

	const applicationId = await giveApplication(delegate, {
		conferenceId: conference.id,
		status: 'accepted',
		motivation: 'I would like to try a General Assembly committee.'
	});
	// An unsent draft gives its `/applications` card the red panel and the
	// "Finish application" button, so the phone measures that one too.
	await giveApplication(delegate, { conferenceId: OPEN_CONFERENCE_ID, status: 'draft' });
	const seatId = await seatDelegateAs(delegate, committee.id, SEAT_NAME);
	const invoiceId = await giveInvoice(delegate, {
		conferenceId: conference.id,
		number: unusedName('polish').replace(' ', '-'),
		status: 'unpaid',
		description: 'Delegate fee',
		unitAmountCents: 6500,
		seatId
	});
	await giveNotifications(delegate, [
		{ title: `You have been accepted to ${conference.name}.` },
		{ title: 'A new announcement was published.', readAt: new Date().toISOString() }
	]);
	await addAnnouncement({
		conferenceId: conference.id,
		author: organiser,
		title: 'Registration opens at 8:30',
		body: 'Bring your badge and a printed copy of your position paper.',
		isPinned: true
	});

	return {
		delegate,
		conferenceId: conference.id,
		conferenceSlug: conference.slug,
		committeeSlug: committee.slug,
		applicationId,
		invoiceId
	};
}

/**
 * Take a test conference away again, with its organisation. Invoices refuse to
 * let their conference go, so they go first; the rest follows the conference.
 */
async function deleteDelegateWorld(world: DelegateWorld): Promise<void> {
	const admin = createServiceRoleClient();

	const { data: conference } = await admin
		.from('conferences')
		.select('organization_id')
		.eq('id', world.conferenceId)
		.single();

	await admin.from('invoices').delete().eq('conference_id', world.conferenceId);
	await admin.from('conferences').delete().eq('id', world.conferenceId);

	if (conference) {
		await admin.from('organizations').delete().eq('id', conference.organization_id);
	}
}

/** A page of a delegate's, and the name its screenshot is saved under. */
type DelegatePage = { name: string; path: (world: DelegateWorld) => string };

const DELEGATE_PAGES: DelegatePage[] = [
	{ name: 'polish-home', path: () => '/home' },
	{ name: 'polish-applications', path: () => '/applications' },
	{ name: 'polish-application', path: (world) => `/applications/${world.applicationId}` },
	{ name: 'polish-committees', path: () => '/committees' },
	{
		name: 'polish-committee-live',
		path: (world) => `/conferences/${world.conferenceSlug}/committees/${world.committeeSlug}/live`
	},
	{
		name: 'polish-position-paper',
		path: (world) =>
			`/conferences/${world.conferenceSlug}/committees/${world.committeeSlug}/position-paper`
	},
	{ name: 'polish-invoices', path: () => '/invoices' },
	{ name: 'polish-invoice', path: (world) => `/invoices/${world.invoiceId}` },
	{ name: 'polish-notifications', path: () => '/notifications' },
	{ name: 'polish-profile', path: () => '/profile' },
	{ name: 'polish-profile-edit', path: () => '/profile/edit' },
	{ name: 'polish-resources', path: () => '/resources' },
	{ name: 'polish-schedule', path: () => '/schedule' },
	{
		name: 'polish-conference-schedule',
		path: (world) => `/conferences/${world.conferenceSlug}/schedule`
	},
	{
		name: 'polish-announcements',
		path: (world) => `/conferences/${world.conferenceSlug}/announcements`
	},
	{ name: 'polish-settings', path: () => '/settings' }
];

test.describe('pages a delegate sees', () => {
	for (const delegatePage of DELEGATE_PAGES) {
		test(`${delegatePage.name} is named, focusable, readable and fits`, async ({ page }) => {
			const world = await makeDelegateWorld();

			try {
				await signIn(page, world.delegate);
				await page.goto(delegatePage.path(world));

				await checkThePage(page, delegatePage.name);
			} finally {
				await deleteDelegateWorld(world);
			}
		});
	}
});

/**
 * `/resources` draws its conference filter only when the reader's files come
 * from more than one conference, so it gets a reader of its own with two. The
 * conferences ran in 2020, which keeps them out of every list of what is to come.
 */
test('the resources filter is named, focusable, readable and fits', async ({ page }) => {
	const organiser = await createTestUser('Olivia Organiser');
	const delegate = await createTestUser('Daniel Perez');

	for (const namePrefix of ['Polish Filter MUN', 'Polish Filter Summit']) {
		const conference = await createScheduleConference({ owner: organiser, namePrefix });
		const committeeId = await addScheduleCommittee(conference.id, {
			name: COMMITTEE_NAME,
			abbreviation: 'SOCHUM'
		});
		await addResourceFile({
			conferenceId: conference.id,
			uploadedBy: organiser.id,
			title: 'Rules of procedure',
			audience: 'delegates'
		});
		await seatAsDelegate(delegate, committeeId, SEAT_NAME);
	}

	await signIn(page, delegate);
	await page.goto('/resources');

	await checkThePage(page, 'polish-resources-filter');
});

/** The pages that list something, opened by somebody who has nothing in them yet. */
const EMPTY_PAGES: string[] = [
	'/home',
	'/applications',
	'/committees',
	'/invoices',
	'/notifications',
	'/resources',
	'/schedule',
	`/conferences/${OPEN_CONFERENCE_SLUG}/apply`,
	`/conferences/${OPEN_CONFERENCE_SLUG}/delegations/new`
];

test.describe('pages a new account sees', () => {
	for (const path of EMPTY_PAGES) {
		test(`${path} is named, focusable, readable and fits`, async ({ page }) => {
			await signIn(page, await createTestUser());
			await page.goto(path);

			const name = `polish-new${path.replaceAll('/', '-')}`;
			await checkThePage(page, name);
		});
	}
});

/** A join code made of the characters `create_delegation` mints codes from. */
function unusedJoinCode(): string {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	const characters: string[] = [];

	for (let position = 0; position < 8; position += 1) {
		characters.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
	}

	return characters.join('');
}

/** A delegation made for one test, headed by `head`. */
type TestDelegation = { id: string; joinCode: string };

/**
 * Give `head` an accepted delegation at the open conference, with one other
 * member, the way `join-delegation.spec.ts` writes one.
 */
async function giveDelegation(head: TestUser, member: TestUser): Promise<TestDelegation> {
	const admin = createServiceRoleClient();
	const joinCode = unusedJoinCode();

	const { data, error } = await admin
		.from('delegations')
		.insert({
			conference_id: OPEN_CONFERENCE_ID,
			name: unusedName('Lisbon International School'),
			institution_name: 'Lisbon International School',
			country_code: 'PT',
			status: 'accepted',
			requested_seats: 4,
			join_code: joinCode,
			submitted_at: new Date().toISOString(),
			decided_at: new Date().toISOString()
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test delegation: ${error?.message}`);
	}

	const { error: memberError } = await admin.from('delegation_members').insert([
		{ delegation_id: data.id, user_id: head.id, role: 'head' },
		{ delegation_id: data.id, user_id: member.id, role: 'member' }
	]);

	if (memberError) {
		throw new Error(`Could not add the test members: ${memberError.message}`);
	}

	return { id: data.id, joinCode };
}

/** Take a test delegation away again, with everybody in it. */
async function deleteDelegation(delegationId: string): Promise<void> {
	await createServiceRoleClient().from('delegations').delete().eq('id', delegationId);
}

const HEAD_PAGES: { name: string; tab: string }[] = [
	{ name: 'polish-delegation', tab: '' },
	{ name: 'polish-delegation-members', tab: '/members' },
	{ name: 'polish-delegation-seats', tab: '/seats' }
];

test.describe('pages a delegation head sees', () => {
	for (const headPage of HEAD_PAGES) {
		test(`${headPage.name} is named, focusable, readable and fits`, async ({ page }) => {
			const head = await createTestUser('Jasper de Vries');
			const member = await createTestUser('Ana Costa');
			const delegation = await giveDelegation(head, member);

			try {
				await signIn(page, head);
				await page.goto(`/delegations/${delegation.id}${headPage.tab}`);

				await checkThePage(page, headPage.name);
			} finally {
				await deleteDelegation(delegation.id);
			}
		});
	}

	test('the join page is named, focusable, readable and fits', async ({ page }) => {
		const head = await createTestUser('Jasper de Vries');
		const member = await createTestUser('Ana Costa');
		const delegation = await giveDelegation(head, member);

		try {
			await signIn(page, await createTestUser('Maria Silva'));
			await page.goto(`/join/${delegation.joinCode}`);

			await checkThePage(page, 'polish-join');
		} finally {
			await deleteDelegation(delegation.id);
		}
	});
});
