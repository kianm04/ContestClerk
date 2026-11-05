import { expect, test, type Page } from '@playwright/test';
import { createServiceRoleClient } from '../db/supabase-test-client';
import {
	expectEveryControlNamed,
	expectReadableContrast,
	expectVisibleFocusEverywhere,
	type FocusOptions
} from './accessibility';
import {
	DATABASE_TIMEOUT_MS,
	makeChairedCommittee,
	modeBar,
	readCommitteeState,
	takeRollCall,
	type ChairedCommittee
} from './chair-room-fixtures';
import {
	fillSpeakersList,
	proposeCaucus,
	seatIdOf,
	startSessionInDatabase,
	updateRoom
} from './committee-live-fixtures';
import { addPositionPaper } from './document-fixtures';
import { expectNoSidewaysOverflow, saveFullPageScreenshot } from './page-shape';
import { createTestUser, giveSeat, signIn, type TestUser } from './signed-in-user';

// The accessibility pass of T53 over every page in `specs/05-pages/chair/`:
// each one names its controls, draws a focus ring wherever Tab lands, keeps its
// text readable and fits a phone. The screenshot of each is what the layout was
// compared against its spec with. `public-auth-polish.spec.ts`,
// `delegate-delegation-polish.spec.ts` and `organiser-polish.spec.ts` do the
// same for the other pages.
//
// Each page's own behaviour is tested in its own spec file (`chair-room.spec.ts`,
// `roll-call.spec.ts`, `chair-console-frame.spec.ts` and so on); this one only
// looks at how the page is drawn, inside the console's frame (S3), once in the
// middle of a session and once before any session has started.
//
// Every test makes its own accounts and its own conference, so the three
// Playwright projects running at the same time never see each other's rows.

/** The seat nobody sits in and who is absent from the roll call. */
const ABSENT_SEAT = 'Kenya';

/** Every check this file makes, on whatever page the browser is showing. */
async function checkThePage(
	page: Page,
	screenshotName: string,
	focusOptions: FocusOptions = {}
): Promise<void> {
	await saveFullPageScreenshot(page, screenshotName);
	await expectNoSidewaysOverflow(page);
	await expectEveryControlNamed(page);
	await expectReadableContrast(page);
	await expectVisibleFocusEverywhere(page, focusOptions);
}

/**
 * The roll call view opens with the focus on its marked row, so the keys
 * answer at once (S5, `chair/roll-call.md`): Tab carries on from there rather
 * than starting at the skip link.
 */
function focusOptionsOf(chairPage: ChairPage): FocusOptions {
	return chairPage.path === '/roll-call' ? { startsAtSkipLink: false } : {};
}

/** Add a fourth seat, with nobody in it, to a committee from `makeChairedCommittee`. */
async function addEmptySeat(committeeId: string, name: string): Promise<void> {
	const { error } = await createServiceRoleClient()
		.from('seats')
		.insert({ committee_id: committeeId, name, country_code: 'KE', position: 4 });

	if (error) throw new Error(`Could not add the ${name} seat: ${error.message}`);
}

/** Record a motion the committee has already voted down, so the history has a row. */
async function addFailedMotion(room: ChairedCommittee, sessionId: string): Promise<void> {
	const { error } = await createServiceRoleClient()
		.from('motions')
		.insert({
			committee_id: room.committeeId,
			session_id: sessionId,
			kind: 'suspend_meeting',
			status: 'failed',
			votes_for: 1,
			votes_against: 2,
			decided_at: new Date().toISOString(),
			proposed_by_seat_id: await seatIdOf(room.committeeId, 'Ghana')
		});

	if (error) throw new Error(`Could not add the failed motion: ${error.message}`);
}

/** Record a closed show-of-hands vote, so the earlier votes have a row. */
async function addClosedVote(room: ChairedCommittee, sessionId: string): Promise<void> {
	const { error } = await createServiceRoleClient().from('votes').insert({
		committee_id: room.committeeId,
		session_id: sessionId,
		kind: 'substantive',
		subject: 'Draft Resolution 1.0',
		method: 'show_of_hands',
		majority: 'simple',
		status: 'closed',
		votes_for: 2,
		votes_against: 1,
		votes_abstain: 0,
		passed: true,
		closed_at: new Date().toISOString()
	});

	if (error) throw new Error(`Could not add the closed vote: ${error.message}`);
}

/** Write a chair's note on France, and propose France for Best Delegate. */
async function addNoteAndAward(room: ChairedCommittee): Promise<void> {
	const admin = createServiceRoleClient();
	const franceSeatId = await seatIdOf(room.committeeId, 'France');

	const { error: noteError } = await admin.from('chair_notes').insert({
		committee_id: room.committeeId,
		seat_id: franceSeatId,
		author_id: room.chair.id,
		body: 'Strong opening speech, cited resolution 2231.'
	});

	if (noteError) throw new Error(`Could not add the note: ${noteError.message}`);

	const { error: awardError } = await admin.from('awards').insert({
		committee_id: room.committeeId,
		seat_id: franceSeatId,
		kind: 'best_delegate',
		title: 'Best Delegate',
		created_by: room.chair.id
	});

	if (awardError) throw new Error(`Could not add the award: ${awardError.message}`);
}

/** Give France a paper awaiting review and Ghana one already approved. */
async function addPapers(
	room: ChairedCommittee,
	delegates: { france: TestUser; ghana: TestUser }
): Promise<void> {
	await addPositionPaper({
		conferenceId: room.conferenceId,
		committeeId: room.committeeId,
		seatId: await seatIdOf(room.committeeId, 'France'),
		delegate: delegates.france
	});
	const ghanaPaperId = await addPositionPaper({
		conferenceId: room.conferenceId,
		committeeId: room.committeeId,
		seatId: await seatIdOf(room.committeeId, 'Ghana'),
		delegate: delegates.ghana
	});

	const { error } = await createServiceRoleClient()
		.from('documents')
		.update({ review_status: 'approved', reviewed_at: new Date().toISOString() })
		.eq('id', ghanaPaperId);

	if (error) throw new Error(`Could not approve the paper: ${error.message}`);
}

/**
 * A committee in the middle of its first session, with something on every
 * chair page: delegates in France and Ghana, Japan's and Kenya's seats empty,
 * a roll call with Kenya absent, France speaking with Ghana waiting and the
 * timer paused, a caucus on the floor and a failed motion, a closed vote, a
 * paper awaiting review and an approved one, a note and a proposed award.
 */
async function makeRoomInSession(): Promise<ChairedCommittee> {
	const room = await makeChairedCommittee('Polish Chair MUN');
	const france = await createTestUser('Amélie Laurent');
	const ghana = await createTestUser('Kofi Mensah');

	await addEmptySeat(room.committeeId, ABSENT_SEAT);
	await giveSeat(france, room.committeeId, 'France');
	await giveSeat(ghana, room.committeeId, 'Ghana');
	await startSessionInDatabase(room);
	await takeRollCall(room, ABSENT_SEAT);
	await fillSpeakersList(room, ['France', 'Ghana'], true);
	// A paused timer draws the same digits in every screenshot.
	await updateRoom(room, { timer_total_seconds: 60, timer_paused_remaining_seconds: 47 });

	const sessionId = (await readCommitteeState(room.committeeId)).current_session_id ?? '';
	await proposeCaucus(room, 'Ghana');
	await addFailedMotion(room, sessionId);
	await addClosedVote(room, sessionId);
	await addPapers(room, { france, ghana });
	await addNoteAndAward(room);

	return room;
}

/**
 * Open a roll-call vote with France's answer in it, the way the Voting page's
 * "Open vote" and a chair's click on "For" would. Opening a vote puts the room
 * in voting and ends the speech and the timer, so this does the same.
 */
async function openRollCallVote(room: ChairedCommittee): Promise<void> {
	const admin = createServiceRoleClient();
	const sessionId = (await readCommitteeState(room.committeeId)).current_session_id ?? '';

	const { data: vote, error } = await admin
		.from('votes')
		.insert({
			committee_id: room.committeeId,
			session_id: sessionId,
			kind: 'substantive',
			subject: 'Draft Resolution 1.1',
			method: 'roll_call',
			majority: 'two_thirds',
			status: 'open'
		})
		.select('id')
		.single();

	if (error || !vote) throw new Error(`Could not open the vote: ${error?.message}`);

	const { error: entryError } = await admin.from('vote_entries').insert({
		vote_id: vote.id,
		seat_id: await seatIdOf(room.committeeId, 'France'),
		choice: 'for'
	});

	if (entryError) throw new Error(`Could not record France's vote: ${entryError.message}`);

	const { error: stateError } = await admin
		.from('committee_state')
		.update({
			current_vote_id: vote.id,
			mode: 'voting',
			current_speaker_entry_id: null,
			timer_total_seconds: null,
			timer_paused_remaining_seconds: null
		})
		.eq('committee_id', room.committeeId);

	if (stateError) throw new Error(`Could not put the room in voting: ${stateError.message}`);
}

/** Take a test conference away again. Everything in it follows the conference. */
async function deleteConference(conferenceId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { data: conference } = await admin
		.from('conferences')
		.select('organization_id')
		.eq('id', conferenceId)
		.single();

	await admin.from('conferences').delete().eq('id', conferenceId);

	if (conference) {
		await admin.from('organizations').delete().eq('id', conference.organization_id);
	}
}

/** A chair page: the part of its address after `.../chair`, and its heading. */
type ChairPage = { path: string; heading: string };

/**
 * The live room, the views and the roll call have the top bar's committee,
 * "UNSC", as their heading (S3); Papers, Notes and Awards keep their own.
 */
const CHAIR_PAGES: ChairPage[] = [
	{ path: '', heading: 'UNSC' },
	{ path: '/roll-call', heading: 'UNSC' },
	{ path: '/gsl', heading: 'UNSC' },
	{ path: '/motions', heading: 'UNSC' },
	{ path: '/voting', heading: 'UNSC' },
	{ path: '/papers', heading: 'Position papers' },
	{ path: '/notes', heading: 'Notes' },
	{ path: '/awards', heading: 'Awards' }
];

/** The lobby's own title, the committee's full name, is its heading before any session (S11). */
const LOBBY_HEADING = 'Security Council';

/** How many views the console's mode bar shows: GSL, Motions, Mod, Unmod, Single speaker and Vote. */
const MODE_BAR_TAB_COUNT = 6;

/** The name a chair page's screenshot is saved under, such as `polish-chair-roll-call`. */
function screenshotNameOf(prefix: string, chairPage: ChairPage): string {
	return `${prefix}${chairPage.path.replaceAll('/', '-')}`;
}

/** Open one chair page and wait until its heading has arrived. */
async function openChairPage(page: Page, room: ChairedCommittee, chairPage: ChairPage) {
	await page.goto(`${room.roomPath}${chairPage.path}`);
	await expect(page.getByRole('heading', { name: chairPage.heading, level: 1 })).toBeVisible({
		timeout: DATABASE_TIMEOUT_MS
	});
}

test.describe('chair pages in the middle of a session', () => {
	for (const chairPage of CHAIR_PAGES) {
		const name = screenshotNameOf('polish-chair', chairPage);

		test(`${name} shows the console's frame and is named, focusable, readable and fits`, async ({
			page
		}, testInfo) => {
			const room = await makeRoomInSession();

			try {
				await signIn(page, room.chair);
				await openChairPage(page, room, chairPage);

				// The frame every chair page shares (S3): the attendance chip and
				// the session's name and time in the top bar (a phone leaves the
				// time out), and the mode bar with its views and End.
				await expect(page.getByRole('link', { name: '3/4 present · quorum met' })).toBeVisible();
				if (testInfo.project.name !== 'phone') {
					await expect(page.getByRole('banner').getByText(/^Session 1 · /)).toBeVisible();
					await expect(modeBar(page).getByRole('link', { name: 'End', exact: true })).toBeVisible();
				}
				await expect(modeBar(page).getByRole('link')).toHaveCount(
					testInfo.project.name === 'phone' ? MODE_BAR_TAB_COUNT : MODE_BAR_TAB_COUNT + 1
				);

				await checkThePage(page, name, focusOptionsOf(chairPage));
			} finally {
				await deleteConference(room.conferenceId);
			}
		});
	}

	test('polish-chair-voting-open draws an open roll-call vote', async ({ page }) => {
		const room = await makeRoomInSession();

		try {
			await openRollCallVote(room);
			await signIn(page, room.chair);
			await openChairPage(page, room, { path: '/voting', heading: 'UNSC' });
			await expect(page.getByText('Draft Resolution 1.1').first()).toBeVisible();

			await checkThePage(page, 'polish-chair-voting-open');
		} finally {
			await deleteConference(room.conferenceId);
		}
	});

	test('polish-chair-agenda draws the room with its agenda menu open', async ({ page }) => {
		const room = await makeRoomInSession();

		try {
			// A committee without topics has no agenda menu, so this one gets two.
			const { error } = await createServiceRoleClient()
				.from('committees')
				.update({ topics: ['Climate finance', 'Protection of civilians'] })
				.eq('id', room.committeeId);
			if (error) throw new Error(`Could not give the committee its topics: ${error.message}`);

			await signIn(page, room.chair);
			await openChairPage(page, room, { path: '?agenda=change', heading: 'UNSC' });
			await expect(page.locator('details[data-agenda-menu]')).toHaveAttribute('open', '');

			await checkThePage(page, 'polish-chair-agenda');
		} finally {
			await deleteConference(room.conferenceId);
		}
	});

	test("polish-chair-end draws End's confirmation in the mode bar", async ({ page }) => {
		const room = await makeRoomInSession();

		try {
			await signIn(page, room.chair);
			await openChairPage(page, room, { path: '?end=confirm', heading: 'UNSC' });
			await expect(page.getByText('End Session 1?')).toBeVisible();

			await checkThePage(page, 'polish-chair-end');
		} finally {
			await deleteConference(room.conferenceId);
		}
	});

	test('polish-chair-organiser shows the room to an organiser who does not chair', async ({
		page
	}) => {
		const room = await makeRoomInSession();

		try {
			await signIn(page, room.organiser);
			await openChairPage(page, room, CHAIR_PAGES[0]);
			await expect(page.getByRole('banner').getByRole('link', { name: 'Dashboard' })).toBeVisible();

			await checkThePage(page, 'polish-chair-organiser');
		} finally {
			await deleteConference(room.conferenceId);
		}
	});
});

test.describe('chair pages before the first roll call of a session', () => {
	for (const chairPage of CHAIR_PAGES) {
		const name = screenshotNameOf('polish-no-roll-call-chair', chairPage);

		test(`${name} asks for a roll call and is named, focusable, readable and fits`, async ({
			page
		}) => {
			const room = await makeChairedCommittee('Polish Roll Call MUN');

			try {
				await startSessionInDatabase(room);
				await signIn(page, room.chair);
				await openChairPage(page, room, chairPage);
				// The attendance chip asks for it, in the neutral tone (P4).
				const chip = page.getByRole('banner').getByRole('link', { name: 'Take roll call' });
				await expect(chip).toBeVisible();
				await expect(chip).not.toHaveClass(/warning/);

				await checkThePage(page, name, focusOptionsOf(chairPage));
			} finally {
				await deleteConference(room.conferenceId);
			}
		});
	}
});

test.describe('chair pages before any session', () => {
	for (const chairPage of CHAIR_PAGES) {
		const name = screenshotNameOf('polish-empty-chair', chairPage);

		test(`${name} is named, focusable, readable and fits`, async ({ page }) => {
			const room = await makeChairedCommittee('Polish Empty Chair MUN');
			const heading = chairPage.path === '' ? LOBBY_HEADING : chairPage.heading;

			try {
				await signIn(page, room.chair);
				await openChairPage(page, room, { ...chairPage, heading });

				await checkThePage(page, name, focusOptionsOf(chairPage));
			} finally {
				await deleteConference(room.conferenceId);
			}
		});
	}
});
