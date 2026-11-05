import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	expectEveryControlNamed,
	expectReadableContrast,
	expectVisibleFocusEverywhere
} from './accessibility';
import { addAcceptedDelegation, addAnnouncement } from './announcement-fixtures';
import { seatDelegateAs } from './document-fixtures';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';
import { addResourceFile } from './resources-fixtures';
import {
	addScheduleCommittee,
	addScheduleEvent,
	createScheduleConference,
	SCHEDULE_FIRST_DAY,
	unusedName
} from './schedule-fixtures';
import {
	createTestUser,
	giveApplication,
	giveInvoice,
	signIn,
	type TestUser
} from './signed-in-user';

// The accessibility pass of T52 over every page in `specs/05-pages/organiser/`:
// each one names its controls, draws a focus ring wherever Tab lands, keeps its
// text readable and fits a phone. The screenshot of each is what the layout was
// compared against its spec with. `public-auth-polish.spec.ts` and
// `delegate-delegation-polish.spec.ts` do the same for the other pages.
//
// Each page's own behaviour is tested in its own `manage-*.spec.ts` file; this
// one only looks at how the page is drawn, once with something in it and, for
// the lists, once empty.
//
// Every test makes its own accounts and its own conference, so the three
// Playwright projects running at the same time never see each other's rows. The
// conference ran in 2020, which keeps it out of every list of what is to come.

/** The committee this file makes, and the names of its three seats. */
const COMMITTEE_NAME = 'General Assembly Third Committee';
const DELEGATE_SEAT = 'Portugal';
const DELEGATION_SEAT = 'Spain';
const EMPTY_SEAT = 'Italy';

/** Every check this file makes, on whatever page the browser is showing. */
async function checkThePage(page: Page, screenshotName: string): Promise<void> {
	await saveFullPageScreenshot(page, screenshotName);
	await expectNoSidewaysOverflow(page);
	await expectEveryControlNamed(page);
	await expectReadableContrast(page);
	await expectVisibleFocusEverywhere(page);
}

/** A conference made for one test, and the ids its pages are reached by. */
type OrganiserWorld = {
	organiser: TestUser;
	conferenceId: string;
	conferenceSlug: string;
	organizationSlug: string;
	committeeId: string;
	applicationId: string;
	delegationId: string;
};

/** Put one empty seat in a committee, optionally held by a delegation, and answer its id. */
async function addSeat(
	committeeId: string,
	name: string,
	delegationId: string | null = null
): Promise<string> {
	const { data, error } = await createServiceRoleClient()
		.from('seats')
		.insert({
			committee_id: committeeId,
			name,
			delegation_id: delegationId,
			allocated_at: delegationId ? new Date().toISOString() : null
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not add the ${name} seat: ${error?.message}`);
	}

	return data.id;
}

/** Answer the slug of the organisation a conference belongs to. */
async function readOrganizationSlug(conferenceId: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data: conference, error: conferenceError } = await admin
		.from('conferences')
		.select('organization_id')
		.eq('id', conferenceId)
		.single();

	if (conferenceError || !conference) {
		throw new Error(`Could not read the test conference: ${conferenceError?.message}`);
	}

	const { data: organization, error } = await admin
		.from('organizations')
		.select('slug')
		.eq('id', conference.organization_id)
		.single();

	if (error || !organization) {
		throw new Error(`Could not read the test organisation: ${error?.message}`);
	}

	return organization.slug;
}

/** Give a conference one fee, so the fees page has a definition to draw. */
async function addFee(conferenceId: string): Promise<void> {
	const { error } = await createServiceRoleClient()
		.from('fees')
		.insert({ conference_id: conferenceId, name: 'Delegate fee', amount_cents: 6500 });

	if (error) {
		throw new Error(`Could not add the test fee: ${error.message}`);
	}
}

/** Propose an award for a seat, the way its chair would. */
async function addAward(committeeId: string, seatId: string, chair: TestUser): Promise<void> {
	const { error } = await createServiceRoleClient().from('awards').insert({
		committee_id: committeeId,
		seat_id: seatId,
		kind: 'best_delegate',
		title: 'Best Delegate',
		created_by: chair.id
	});

	if (error) {
		throw new Error(`Could not add the test award: ${error.message}`);
	}
}

/**
 * An organiser with something on every one of their pages: a committee with a
 * delegate in one seat, an accepted delegation holding another and nobody in
 * it yet, a submitted application, an unpaid invoice, a fee, an event, an
 * announcement, a resource and a proposed award.
 */
async function makeOrganiserWorld(): Promise<OrganiserWorld> {
	const organiser = await createTestUser('Olivia Organiser');
	const delegate = await createTestUser('Daniel Perez');
	const applicant = await createTestUser('Ana Costa');
	const conference = await createScheduleConference({ owner: organiser, namePrefix: 'Polish MUN' });
	const committeeId = await addScheduleCommittee(conference.id, {
		name: COMMITTEE_NAME,
		abbreviation: 'SOCHUM',
		room: 'Aula'
	});

	const delegationId = await addAcceptedDelegation(
		conference.id,
		unusedName('Lisbon International School')
	);
	await addSeat(committeeId, DELEGATION_SEAT, delegationId);
	await addSeat(committeeId, EMPTY_SEAT);
	const delegateSeatId = await seatDelegateAs(delegate, committeeId, DELEGATE_SEAT);

	await giveApplication(delegate, { conferenceId: conference.id, status: 'accepted' });
	const applicationId = await giveApplication(applicant, {
		conferenceId: conference.id,
		status: 'submitted',
		committeePreferences: [committeeId],
		motivation: 'I would like to try a General Assembly committee.'
	});
	await giveInvoice(delegate, {
		conferenceId: conference.id,
		number: unusedName('polish').replace(' ', '-'),
		status: 'unpaid',
		description: 'Delegate fee',
		unitAmountCents: 6500,
		seatId: delegateSeatId
	});
	await addFee(conference.id);
	await addScheduleEvent({
		conferenceId: conference.id,
		title: 'Opening ceremony',
		startsAt: `${SCHEDULE_FIRST_DAY}T08:00:00Z`,
		endsAt: `${SCHEDULE_FIRST_DAY}T09:00:00Z`,
		audience: 'everyone',
		location: 'Aula'
	});
	await addAnnouncement({
		conferenceId: conference.id,
		author: organiser,
		title: 'Registration opens at 8:30',
		body: 'Bring your badge and a printed copy of your position paper.',
		isPinned: true
	});
	await addResourceFile({
		conferenceId: conference.id,
		uploadedBy: organiser.id,
		title: 'Rules of procedure'
	});
	await addAward(committeeId, delegateSeatId, organiser);

	return {
		organiser,
		conferenceId: conference.id,
		conferenceSlug: conference.slug,
		organizationSlug: await readOrganizationSlug(conference.id),
		committeeId,
		applicationId,
		delegationId
	};
}

/**
 * Take a test conference away again, with its organisation. Invoices refuse to
 * let their conference go, so they go first; the rest follows the conference.
 */
async function deleteOrganiserWorld(conferenceId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { data: conference } = await admin
		.from('conferences')
		.select('organization_id')
		.eq('id', conferenceId)
		.single();

	await admin.from('invoices').delete().eq('conference_id', conferenceId);
	await admin.from('conferences').delete().eq('id', conferenceId);

	if (conference) {
		await admin.from('organizations').delete().eq('id', conference.organization_id);
	}
}

/**
 * Move the world's conference into Allocation: its application window closed
 * yesterday and its days about eight years ahead, later than every conference
 * in the seed. It is published, so it is in the directory until
 * `deleteOrganiserWorld` takes it away in the test's `finally`.
 */
async function moveIntoAllocationPhase(conferenceId: string): Promise<void> {
	const firstDay = new Date();

	firstDay.setDate(firstDay.getDate() + 3000);

	const lastDay = new Date(firstDay);

	lastDay.setDate(lastDay.getDate() + 2);

	const { error } = await createServiceRoleClient()
		.from('conferences')
		.update({
			start_date: firstDay.toISOString().slice(0, 10),
			end_date: lastDay.toISOString().slice(0, 10),
			applications_open_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
			applications_close_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
		})
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not move the test conference into allocation: ${error.message}`);
	}
}

/** A page of an organiser's, and the name its screenshot is saved under. */
type OrganiserPage = { name: string; path: (world: OrganiserWorld) => string };

const ORGANISER_PAGES: OrganiserPage[] = [
	{ name: 'polish-manage', path: () => '/manage' },
	{
		name: 'polish-manage-organization',
		path: (world) => `/manage/organizations/${world.organizationSlug}`
	},
	{ name: 'polish-manage-dashboard', path: (world) => `/manage/${world.conferenceSlug}` },
	{ name: 'polish-manage-details', path: (world) => `/manage/${world.conferenceSlug}/details` },
	{
		name: 'polish-manage-committees',
		path: (world) => `/manage/${world.conferenceSlug}/committees`
	},
	{
		name: 'polish-manage-committee-new',
		path: (world) => `/manage/${world.conferenceSlug}/committees/new`
	},
	{
		name: 'polish-manage-committee-edit',
		path: (world) => `/manage/${world.conferenceSlug}/committees/${world.committeeId}`
	},
	{ name: 'polish-manage-team', path: (world) => `/manage/${world.conferenceSlug}/team` },
	{ name: 'polish-manage-fees', path: (world) => `/manage/${world.conferenceSlug}/fees` },
	{
		name: 'polish-manage-application-form',
		path: (world) => `/manage/${world.conferenceSlug}/application-form`
	},
	{
		name: 'polish-manage-applications',
		path: (world) => `/manage/${world.conferenceSlug}/applications`
	},
	{
		name: 'polish-manage-application-review',
		path: (world) => `/manage/${world.conferenceSlug}/applications/${world.applicationId}`
	},
	{
		name: 'polish-manage-delegations',
		path: (world) => `/manage/${world.conferenceSlug}/delegations?status=accepted`
	},
	{
		name: 'polish-manage-delegation-review',
		path: (world) => `/manage/${world.conferenceSlug}/delegations/${world.delegationId}`
	},
	{
		name: 'polish-manage-allocation',
		path: (world) => `/manage/${world.conferenceSlug}/allocation`
	},
	{ name: 'polish-manage-schedule', path: (world) => `/manage/${world.conferenceSlug}/schedule` },
	{
		name: 'polish-manage-announcements',
		path: (world) => `/manage/${world.conferenceSlug}/announcements`
	},
	{
		name: 'polish-manage-documents',
		path: (world) => `/manage/${world.conferenceSlug}/documents`
	},
	{
		name: 'polish-manage-participants',
		path: (world) => `/manage/${world.conferenceSlug}/participants`
	},
	{ name: 'polish-manage-awards', path: (world) => `/manage/${world.conferenceSlug}/awards` }
];

test.describe('pages an organiser sees', () => {
	for (const organiserPage of ORGANISER_PAGES) {
		test(`${organiserPage.name} is named, focusable, readable and fits`, async ({ page }) => {
			const world = await makeOrganiserWorld();

			try {
				await signIn(page, world.organiser);
				await page.goto(organiserPage.path(world));

				await checkThePage(page, organiserPage.name);
			} finally {
				await deleteOrganiserWorld(world.conferenceId);
			}
		});
	}
});

// T137's second design pass made the dashboard a command centre: before the
// figures it lists what is waiting, and each line ends with the button or link
// that opens the list holding that work, already filtered. T173 draws the lines
// the conference's phase asks for, so the world, which ran in 2020, is moved
// into Allocation first: applications closed, the first day years ahead. It then
// has one application to review, one unpaid invoice and a committee nobody
// chairs. The manage redesign calls the list "Needs you" and keeps its order.
test('the dashboard lists what needs attention first, and each line opens that work', async ({
	page
}) => {
	const world = await makeOrganiserWorld();

	try {
		await moveIntoAllocationPhase(world.conferenceId);
		await signIn(page, world.organiser);
		await page.goto(`/manage/${world.conferenceSlug}`);

		const attention = page.getByRole('region', { name: 'Needs you' });
		const lines = attention.getByRole('listitem');

		// The applicant waiting comes before the invoice, and the invoice before
		// the committee without a chair, which harms nobody while it waits.
		await expect(lines.nth(0)).toHaveText(
			/1 application is waiting for a decision.*Review applications/
		);
		await expect(lines.nth(1)).toHaveText(/1 invoice is still unpaid.*Invoices/);
		await expect(lines.nth(2)).toHaveText(/has no chair.*Invite a chair/);

		// A page drawn on the server writes its links relative to itself
		// (`../manage/…`), so only the end of each address is compared.
		await expect(attention.getByRole('link', { name: 'Invoices' })).toHaveAttribute(
			'href',
			new RegExp(`/manage/${world.conferenceSlug}/fees\\?.*status=unpaid.*#invoices$`)
		);

		// The first line's button is the page's one filled button (P1).
		const reviewButton = attention.getByRole('link', { name: 'Review applications' });

		await expect(reviewButton).toHaveClass(/(^|\s)(bg-primary|bg-brand-900)(\s|$)/);
		await expect(
			page
				.getByRole('main')
				.locator(
					'a:is(.bg-primary, .bg-brand-900):visible, button:is(.bg-primary, .bg-brand-900):visible'
				)
		).toHaveCount(1);

		await reviewButton.click();
		await expect(page).toHaveURL(`/manage/${world.conferenceSlug}/applications`);
		await expect(page.getByRole('link', { name: 'Ana Costa' })).toBeVisible();
	} finally {
		await deleteOrganiserWorld(world.conferenceId);
	}
});

/** The pages of a conference that list something, before anything is in them. */
const EMPTY_CONFERENCE_TABS: string[] = [
	'',
	'/committees',
	'/team',
	'/fees',
	'/application-form',
	'/applications',
	'/delegations',
	'/allocation',
	'/schedule',
	'/announcements',
	'/documents',
	'/participants',
	'/awards'
];

test.describe('pages of a conference with nothing in it yet', () => {
	for (const tab of EMPTY_CONFERENCE_TABS) {
		test(`/manage/[slug]${tab} is named, focusable, readable and fits`, async ({ page }) => {
			const organiser = await createTestUser('Olivia Organiser');
			const conference = await createScheduleConference({
				owner: organiser,
				namePrefix: 'Polish Empty MUN',
				status: 'draft'
			});

			try {
				await signIn(page, organiser);
				await page.goto(`/manage/${conference.slug}${tab}`);

				const name = `polish-empty-manage${tab.replaceAll('/', '-')}`;
				await checkThePage(page, name);
			} finally {
				await deleteOrganiserWorld(conference.id);
			}
		});
	}
});

test.describe('pages a new account sees', () => {
	for (const path of ['/manage', '/create']) {
		test(`${path} is named, focusable, readable and fits`, async ({ page }) => {
			await signIn(page, await createTestUser());
			await page.goto(path);

			await checkThePage(page, `polish-new${path.replaceAll('/', '-')}`);
		});
	}
});
