import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
// The real types, not copies of them: renaming a field in `$lib/applications.ts`
// has to fail here too.
import type { ApplicationConference, ApplicationStatus, MyApplication } from '$lib/applications';
import { UNEXPECTED_ERROR_TEXT } from '$lib/auth';
import { applicationUrl, myApplicationsUrl } from '$lib/urls';
import type { MyApplicationPage } from '$lib/server/applications';

// The gate, the three queries and the flash cookie are all stood in for, so
// these tests are about what `load` and the two actions themselves decide.
// `requireOnboarded` has its own tests in `src/lib/server/access`, and what the
// database allows is tested in `tests/db/`.
//
// `$lib/applications` and `$lib/conferences` are deliberately not stood in for:
// they are pure, and running the real rules is what proves the page and the
// actions agree about who may edit, withdraw and delete.
vi.mock('$lib/server/access', () => ({ requireOnboarded: vi.fn() }));

vi.mock('$lib/server/applications', () => ({
	getMyApplication: vi.fn(),
	withdrawApplication: vi.fn(),
	deleteDraftApplication: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

// The team calls are stood in for too; what the database allows a team is
// tested in `tests/db/application-teams.test.ts`.
vi.mock('$lib/server/application-teams', () => ({
	readMyTeam: vi.fn(),
	startMyTeam: vi.fn(),
	joinMyTeam: vi.fn(),
	leaveMyTeam: vi.fn()
}));

import { requireOnboarded } from '$lib/server/access';
import { joinMyTeam, readMyTeam, startMyTeam } from '$lib/server/application-teams';
import {
	deleteDraftApplication,
	getMyApplication,
	withdrawApplication
} from '$lib/server/applications';
import { setFlash } from '$lib/server/flash';

/** The Supabase client. `load` and the actions only hand it on. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

/** The applicant `requireOnboarded` answers with. Their id is half the query. */
const SIGNED_IN_USER = { id: 'user-1', email: 'amara@example.com' };

/** The application every test is about, and the address it lives at. */
const APPLICATION_ID = '33333333-3333-3333-3333-333333333333';
const APPLICATION_PATH = `/applications/${APPLICATION_ID}`;

/**
 * A conference taking applications: published, opened long ago and closing
 * long after any of these tests will ever run.
 *
 * The two dates are far apart on purpose. `load` asks the real
 * `isAcceptingApplications` with the clock of the machine running the test, so
 * a window measured in years is the only one that stays open for good.
 */
const OPEN_CONFERENCE: ApplicationConference = {
	id: '11111111-1111-1111-1111-111111111111',
	slug: 'delft-mun-2026',
	name: 'DelftMUN 2026',
	logoPath: null,
	startDate: '2026-02-12',
	endDate: '2026-02-15',
	timezone: 'Europe/Amsterdam',
	status: 'published',
	applicationOpenMode: 'on_publish',
	applicationsOpenAt: '2020-01-01T00:00:00Z',
	applicationsCloseAt: '2099-01-01T00:00:00Z',
	committeePreferenceCount: 2,
	askMotivation: true
};

/** The same conference after its window shut. */
const CLOSED_CONFERENCE: ApplicationConference = {
	...OPEN_CONFERENCE,
	applicationsCloseAt: '2020-06-01T00:00:00Z'
};

/** The application itself. Every test that cares about the status replaces it. */
const APPLICATION: MyApplication = {
	id: APPLICATION_ID,
	conferenceId: OPEN_CONFERENCE.id,
	status: 'submitted',
	committeePreferences: ['committee-1', 'committee-2'],
	seatPreferences: 'Any P5 seat',
	motivation: 'I have chaired twice and want to try the floor.',
	answers: {},
	submittedAt: '2026-09-08T12:02:00Z',
	decisionNote: null,
	updatedAt: '2026-09-08T12:02:00Z'
};

/** What `getMyApplication` answers with, with anything a test needs changed. */
function makePage(overrides: Partial<MyApplicationPage> = {}): MyApplicationPage {
	return {
		application: APPLICATION,
		conference: OPEN_CONFERENCE,
		questions: [],
		committeeNames: ['UNSC', 'ECOFIN'],
		seat: null,
		invoice: null,
		...overrides
	};
}

/**
 * The few pieces of a request that `load` and the two actions actually read.
 *
 * SvelteKit hands them a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		params: { applicationId: APPLICATION_ID },
		url: new URL(`http://localhost${APPLICATION_PATH}`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		...overrides
	};
}

/** That stand-in, as the `load` function's own event type. */
function makeLoadEvent(): PageServerLoadEvent {
	return makeEvent() as unknown as PageServerLoadEvent;
}

/**
 * A post to one of the two actions.
 *
 * Neither reads anything out of the form: the only field `ConfirmButton` sends
 * is its own `confirm=1`, and which button was pressed is already in the
 * address. The empty body is here because a real request always has one.
 */
function makeActionEvent(fields: Record<string, string> = {}): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return makeEvent({
		request: { formData: async () => formData }
	}) as unknown as RequestEvent;
}

/**
 * Run something that is expected to redirect, and give back the redirect.
 *
 * SvelteKit's `redirect` works by throwing rather than by returning, so
 * catching it is the only way to see where it was sending the reader.
 */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

/** The three buttons `load` decides on, for one status and one conference. */
type ActionFlags = {
	canEdit: boolean;
	canWithdraw: boolean;
	canDeleteDraft: boolean;
};

/** Run `load` for one status and hand back only the three flags it worked out. */
async function loadFlags(
	status: ApplicationStatus,
	conference: ApplicationConference
): Promise<ActionFlags> {
	vi.mocked(getMyApplication).mockResolvedValue(
		makePage({ application: { ...APPLICATION, status }, conference })
	);

	const result = (await load(makeLoadEvent())) as unknown as ActionFlags;

	return {
		canEdit: result.canEdit,
		canWithdraw: result.canWithdraw,
		canDeleteDraft: result.canDeleteDraft
	};
}

beforeEach(() => {
	vi.mocked(requireOnboarded).mockResolvedValue(SIGNED_IN_USER);
	vi.mocked(getMyApplication).mockResolvedValue(makePage());
	vi.mocked(withdrawApplication).mockResolvedValue(true);
	vi.mocked(deleteDraftApplication).mockResolvedValue(true);
	vi.mocked(readMyTeam).mockResolvedValue(null);
	vi.mocked(startMyTeam).mockReset();
	vi.mocked(joinMyTeam).mockReset();
	vi.mocked(setFlash).mockClear();
});

describe('load', () => {
	it('asks for the application belonging to this reader, not only for its id', async () => {
		await load(makeLoadEvent());

		// The `applications` select policy is "self; org.", so an organiser of the
		// conference can read the row too. The reader's own id is what keeps this
		// page the applicant's; an organiser uses the review page instead.
		expect(getMyApplication).toHaveBeenCalledWith(SUPABASE, APPLICATION_ID, SIGNED_IN_USER.id);
	});

	it('answers 404 when there is no such application for this reader', async () => {
		vi.mocked(getMyApplication).mockResolvedValue(null);

		// `error` throws rather than returning, so the rejection is the answer.
		await expect(load(makeLoadEvent())).rejects.toMatchObject({ status: 404 });
	});

	/* `toMatchObject` rather than reading a field off the answer: SvelteKit
	   types every `load` as allowed to return nothing at all, so the answer is
	   compared as a whole instead of being narrowed first. */
	it('spreads everything the query answered into the page data', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({
			application: APPLICATION,
			conference: OPEN_CONFERENCE,
			questions: [],
			committeeNames: ['UNSC', 'ECOFIN'],
			seat: null,
			invoice: null
		});
	});

	it('hands the browser nothing it does not draw', async () => {
		const result = (await load(makeLoadEvent())) as Record<string, unknown>;

		// The clock is read here and the answers to it are returned, never the
		// moment itself: a `load` that hands the browser data nothing draws is a
		// thing the next reader has to check before they can change it.
		expect(result).not.toHaveProperty('now');
	});

	it('says whether the conference is still taking applications', async () => {
		expect(await load(makeLoadEvent())).toMatchObject({ isWindowOpen: true });

		vi.mocked(getMyApplication).mockResolvedValue(makePage({ conference: CLOSED_CONFERENCE }));

		expect(await load(makeLoadEvent())).toMatchObject({ isWindowOpen: false });
	});

	it('offers the right buttons for every status while the window is open', async () => {
		expect(await loadFlags('draft', OPEN_CONFERENCE)).toEqual({
			canEdit: true,
			canWithdraw: false,
			canDeleteDraft: true
		});

		expect(await loadFlags('submitted', OPEN_CONFERENCE)).toEqual({
			canEdit: true,
			canWithdraw: true,
			canDeleteDraft: false
		});

		expect(await loadFlags('waitlisted', OPEN_CONFERENCE)).toEqual({
			canEdit: false,
			canWithdraw: true,
			canDeleteDraft: false
		});

		expect(await loadFlags('accepted', OPEN_CONFERENCE)).toEqual({
			canEdit: false,
			canWithdraw: false,
			canDeleteDraft: false
		});

		expect(await loadFlags('rejected', OPEN_CONFERENCE)).toEqual({
			canEdit: false,
			canWithdraw: false,
			canDeleteDraft: false
		});

		expect(await loadFlags('withdrawn', OPEN_CONFERENCE)).toEqual({
			canEdit: false,
			canWithdraw: false,
			canDeleteDraft: false
		});
	});

	it('takes editing away once the window has closed, and leaves the rest alone', async () => {
		// A draft whose window has closed keeps only "Delete draft", which is the
		// edge case `05-pages/delegate/application.md` names.
		expect(await loadFlags('draft', CLOSED_CONFERENCE)).toEqual({
			canEdit: false,
			canWithdraw: false,
			canDeleteDraft: true
		});

		// Withdrawing is the status machine's business and not the window's: an
		// applicant may always take a submitted application out of the running.
		expect(await loadFlags('submitted', CLOSED_CONFERENCE)).toEqual({
			canEdit: false,
			canWithdraw: true,
			canDeleteDraft: false
		});

		expect(await loadFlags('waitlisted', CLOSED_CONFERENCE)).toEqual({
			canEdit: false,
			canWithdraw: true,
			canDeleteDraft: false
		});

		expect(await loadFlags('accepted', CLOSED_CONFERENCE)).toEqual({
			canEdit: false,
			canWithdraw: false,
			canDeleteDraft: false
		});
	});
});

describe('withdraw', () => {
	it('asks the gate and the query again, with the id of the reader posting', async () => {
		await catchRedirect(() => actions.withdraw(makeActionEvent()));

		// An action is its own request and is handed nothing `load` worked out,
		// which is what `specs/02-architecture/permissions.md` asks of every one.
		expect(requireOnboarded).toHaveBeenCalled();
		expect(getMyApplication).toHaveBeenCalledWith(SUPABASE, APPLICATION_ID, SIGNED_IN_USER.id);
	});

	it('answers 404 when there is no such application for this reader', async () => {
		vi.mocked(getMyApplication).mockResolvedValue(null);

		await expect(actions.withdraw(makeActionEvent())).rejects.toMatchObject({ status: 404 });
	});

	it('refuses a status the applicant may not withdraw from', async () => {
		vi.mocked(getMyApplication).mockResolvedValue(
			makePage({ application: { ...APPLICATION, status: 'accepted' } })
		);

		const redirect = await catchRedirect(() => actions.withdraw(makeActionEvent()));

		expect(withdrawApplication).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'error',
			message: 'This application can no longer be withdrawn.'
		});
		expect(redirect.location).toBe(applicationUrl(APPLICATION_ID));
	});

	it('says so when the status moved between the page and the button', async () => {
		vi.mocked(withdrawApplication).mockResolvedValue(false);

		const redirect = await catchRedirect(() => actions.withdraw(makeActionEvent()));

		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'error',
			message: 'This application can no longer be withdrawn.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(applicationUrl(APPLICATION_ID));
	});

	it('withdraws a submitted application and comes back to this page', async () => {
		const redirect = await catchRedirect(() => actions.withdraw(makeActionEvent()));

		expect(withdrawApplication).toHaveBeenCalledWith(SUPABASE, APPLICATION_ID);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Application withdrawn.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(applicationUrl(APPLICATION_ID));
	});
});

describe('deleteDraft', () => {
	beforeEach(() => {
		vi.mocked(getMyApplication).mockResolvedValue(
			makePage({ application: { ...APPLICATION, status: 'draft', submittedAt: null } })
		);
	});

	it('answers 404 when there is no such application for this reader', async () => {
		vi.mocked(getMyApplication).mockResolvedValue(null);

		await expect(actions.deleteDraft(makeActionEvent())).rejects.toMatchObject({ status: 404 });
	});

	it('refuses anything that is no longer a draft', async () => {
		vi.mocked(getMyApplication).mockResolvedValue(makePage());

		const redirect = await catchRedirect(() => actions.deleteDraft(makeActionEvent()));

		expect(deleteDraftApplication).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'error',
			message: 'This draft can no longer be deleted.'
		});
		expect(redirect.location).toBe(applicationUrl(APPLICATION_ID));
	});

	it('says so when the draft was submitted between the page and the button', async () => {
		vi.mocked(deleteDraftApplication).mockResolvedValue(false);

		const redirect = await catchRedirect(() => actions.deleteDraft(makeActionEvent()));

		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'error',
			message: 'This draft can no longer be deleted.'
		});
		expect(redirect.location).toBe(applicationUrl(APPLICATION_ID));
	});

	it('deletes the draft and goes back to the applications list', async () => {
		const redirect = await catchRedirect(() => actions.deleteDraft(makeActionEvent()));

		expect(deleteDraftApplication).toHaveBeenCalledWith(SUPABASE, APPLICATION_ID);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Draft deleted.'
		});
		expect(redirect.status).toBe(303);
		// `05-pages/delegate/application.md` sends this to `/applications`, the
		// "My applications" list.
		expect(redirect.location).toBe(myApplicationsUrl());
	});
});

describe('teams', () => {
	it('shows the team, and lets it change only until the organisers decide', async () => {
		vi.mocked(readMyTeam).mockResolvedValue({ joinCode: 'AB3K9Q', memberNames: ['Amara Okafor'] });

		expect(await load(makeLoadEvent())).toMatchObject({
			team: { joinCode: 'AB3K9Q', memberNames: ['Amara Okafor'] },
			canChangeTeam: true
		});

		vi.mocked(getMyApplication).mockResolvedValue(
			makePage({ application: { ...APPLICATION, status: 'accepted' } })
		);

		expect(await load(makeLoadEvent())).toMatchObject({ canChangeTeam: false });
	});

	it('starts a team and says to pass the code on', async () => {
		const redirect = await catchRedirect(() => actions.startTeam(makeActionEvent()));

		expect(startMyTeam).toHaveBeenCalledWith(SUPABASE, APPLICATION_ID);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Team started. Give your friends the code.'
		});
		expect(redirect.location).toBe(applicationUrl(APPLICATION_ID));
	});

	it('joins with the code as the database stores it', async () => {
		await catchRedirect(() => actions.joinTeam(makeActionEvent({ code: ' ab3k9q ' })));

		expect(joinMyTeam).toHaveBeenCalledWith(SUPABASE, APPLICATION_ID, 'AB3K9Q');
	});

	it('asks for a code rather than posting an empty one', async () => {
		await catchRedirect(() => actions.joinTeam(makeActionEvent({ code: '  ' })));

		expect(joinMyTeam).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'error',
			message: 'Enter the code your friend gave you.'
		});
	});

	it('passes on the database’s refusal, and hides anything else', async () => {
		vi.mocked(joinMyTeam).mockRejectedValue(
			new Error('That code does not belong to a team at this conference')
		);
		await catchRedirect(() => actions.joinTeam(makeActionEvent({ code: 'ZZZZZZ' })));

		expect(setFlash).toHaveBeenLastCalledWith(COOKIES, {
			tone: 'error',
			message: 'That code does not belong to a team at this conference.'
		});

		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(joinMyTeam).mockRejectedValue(new Error('connection reset'));
		await catchRedirect(() => actions.joinTeam(makeActionEvent({ code: 'ZZZZZZ' })));

		expect(setFlash).toHaveBeenLastCalledWith(COOKIES, {
			tone: 'error',
			message: UNEXPECTED_ERROR_TEXT
		});
	});
});
