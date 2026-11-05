import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { SeatGroup } from '$lib/allocation';
import type { TeamMember } from '$lib/application-teams';
import {
	ALREADY_DECIDED_REFUSAL,
	CHOOSE_SEAT_REFUSAL,
	INTERNAL_NOTE_MAX_LENGTH,
	INTERNAL_NOTE_SAVED_FLASH,
	INTERNAL_NOTE_TOO_LONG_REFUSAL,
	NOTHING_TO_REVOKE_REFUSAL,
	REJECTED_FLASH,
	SEAT_JUST_TAKEN_REFUSAL,
	WAITLISTED_FLASH,
	type ApplicationForReview,
	type ReviewApplication
} from '$lib/application-review';
import { UNEXPECTED_ERROR_TEXT } from '$lib/auth';
import type { Conference } from '$lib/conferences';

// The gate, the queries and the flash cookie are all stood in for, so these
// tests are about what `load` and the five actions themselves decide. What the
// database itself refuses is tested in `tests/db/`.
//
// `$lib/application-review` and `$lib/urls` are deliberately not stood in for:
// they are pure, and running the real ones is what proves that the refusals,
// the flashes and the addresses this page links and redirects to agree.
vi.mock('$lib/server/access', () => ({ requirePermission: vi.fn(), requireManagePage: vi.fn() }));

vi.mock('$lib/server/application-review', () => ({
	findQueueNeighbours: vi.fn(),
	getApplicationForReview: vi.fn(),
	revokeAcceptance: vi.fn(),
	updateApplicationInternalNote: vi.fn()
}));

vi.mock('$lib/server/application-bulk-decisions', () => ({
	rejectApplications: vi.fn(),
	waitlistApplications: vi.fn()
}));

vi.mock('$lib/server/seat-acceptance', () => ({
	acceptApplication: vi.fn(),
	listSeatsByCommittee: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

vi.mock('$lib/server/application-teams', () => ({
	acceptTeam: vi.fn(),
	listTeamMembers: vi.fn(),
	listTeamPartnerOptions: vi.fn(),
	removeFromTeam: vi.fn(),
	teamApplications: vi.fn()
}));

import { requireManagePage, requirePermission } from '$lib/server/access';
import { rejectApplications, waitlistApplications } from '$lib/server/application-bulk-decisions';
import {
	findQueueNeighbours,
	getApplicationForReview,
	revokeAcceptance,
	updateApplicationInternalNote
} from '$lib/server/application-review';
import {
	acceptTeam,
	listTeamMembers,
	listTeamPartnerOptions,
	removeFromTeam,
	teamApplications
} from '$lib/server/application-teams';
import { setFlash } from '$lib/server/flash';
import { acceptApplication, listSeatsByCommittee } from '$lib/server/seat-acceptance';
import type { MyPermissions } from '$lib/permissions';

/** What the layout hands down for an organiser: `administrator` opens every page. */
const ADMINISTRATOR: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: -1
};

/** A team member whose role reads the applications and may not decide them. */
const READER: MyPermissions = {
	held: [{ permission: 'read_applications', scope: 'conference' }],
	committeeIds: [],
	rank: 1
};

/** The Supabase client. `load` and the actions only hand it on. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

/** The organiser every action here runs as. */
const SIGNED_IN_USER = { id: 'user-organiser', email: 'daniel@example.com' };

/** The conference. Only its id, slug, timezone and age bounds are read. */
const CONFERENCE = {
	id: 'conference-1',
	slug: 'thimun-2027',
	name: 'THIMUN The Hague 2027',
	timezone: 'Europe/Amsterdam',
	minAge: 14,
	maxAge: 19
} as unknown as Conference;

const APPLICATION_ID = 'application-1';

/** The page every action comes back to. */
const REVIEW_PATH = `/manage/${CONFERENCE.slug}/applications/${APPLICATION_ID}`;

/** A free seat in the one committee the organiser can still give. */
const FREE_SEAT_GROUPS: SeatGroup[] = [
	{
		committeeId: 'committee-1',
		committeeLabel: 'UNSC',
		seats: [
			{
				id: 'seat-france',
				committeeId: 'committee-1',
				name: 'France',
				countryCode: 'FR',
				isAvailable: true,
				delegationId: null,
				userId: null
			}
		]
	}
];

/** Everything `getApplicationForReview` answers with, `submitted` unless a test says otherwise. */
function review(
	overrides: Partial<ReviewApplication> = {},
	rest: Partial<ApplicationForReview> = {}
): ApplicationForReview {
	return {
		application: {
			id: APPLICATION_ID,
			conferenceId: CONFERENCE.id,
			status: 'submitted',
			committeePreferences: ['committee-1'],
			seatPreferences: null,
			motivation: 'I love debating.',
			answers: {},
			submittedAt: '2026-10-03T09:00:00Z',
			decidedAt: null,
			decisionNote: null,
			internalNote: 'Strong writer.',
			...overrides
		},
		profile: {
			userId: 'user-applicant',
			fullName: 'Anna Kowalski',
			avatarPath: null,
			institutionName: 'Delft University',
			countryCode: 'NL',
			experienceLevel: 'beginner'
		},
		details: null,
		questions: [],
		preferredCommittees: ['UNSC'],
		seat: null,
		invoice: null,
		...rest
	};
}

/** An accepted application in France, with an invoice of this status. */
function acceptedReview(invoiceStatus: 'unpaid' | 'paid'): ApplicationForReview {
	return review(
		{ status: 'accepted' },
		{
			seat: { id: 'seat-france', name: 'France', committeeLabel: 'UNSC' },
			invoice: {
				id: 'invoice-1',
				number: 'THIMUN-0007',
				status: invoiceStatus,
				amountCents: 4500,
				currency: 'EUR'
			}
		}
	);
}

/**
 * The few pieces of a request that `load` and the actions here actually read.
 *
 * SvelteKit hands them a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeEvent(search = ''): Record<string, unknown> {
	return {
		params: { slug: CONFERENCE.slug, applicationId: APPLICATION_ID },
		url: new URL(`http://localhost${REVIEW_PATH}${search}`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES
	};
}

/**
 * That stand-in, as the `load` function's own event type. `parent()` is how a
 * page's `load` reads what the layout above it returned.
 */
function makeLoadEvent(
	search = '',
	permissions: MyPermissions = ADMINISTRATOR
): PageServerLoadEvent {
	return {
		...makeEvent(search),
		parent: async () => ({ conference: CONFERENCE, permissions })
	} as unknown as PageServerLoadEvent;
}

/** A post carrying these fields, to whichever action a test calls. */
function makeActionEvent(fields: Record<string, string> = {}, search = ''): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return {
		...makeEvent(search),
		request: { formData: async () => formData }
	} as unknown as RequestEvent;
}

/**
 * Run something that is expected to throw, and give back what it threw.
 * SvelteKit's `redirect` and `error` both work by throwing.
 */
async function catchThrown(run: () => unknown): Promise<{ status: number; location?: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location?: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected or failed.');
}

/** The message the flash cookie was given. */
function flashMessage(): string {
	return vi.mocked(setFlash).mock.calls[0][1].message;
}

beforeEach(() => {
	vi.clearAllMocks();

	vi.mocked(requirePermission).mockResolvedValue({ user: SIGNED_IN_USER, conference: CONFERENCE });
	vi.mocked(getApplicationForReview).mockResolvedValue(review());
	vi.mocked(findQueueNeighbours).mockResolvedValue({ previousId: null, nextId: null });
	vi.mocked(listSeatsByCommittee).mockResolvedValue(FREE_SEAT_GROUPS);
	vi.mocked(acceptApplication).mockResolvedValue(undefined);
	vi.mocked(waitlistApplications).mockResolvedValue({ changedCount: 1, skippedCount: 0 });
	vi.mocked(rejectApplications).mockResolvedValue({ changedCount: 1, skippedCount: 0 });
	vi.mocked(revokeAcceptance).mockResolvedValue(undefined);
	vi.mocked(updateApplicationInternalNote).mockResolvedValue(undefined);
	vi.mocked(listTeamMembers).mockResolvedValue([]);
	vi.mocked(listTeamPartnerOptions).mockResolvedValue([]);
});

describe('load', () => {
	it('asks the permissions the layout read whether this page opens for the reader', async () => {
		await load(makeLoadEvent());

		expect(requireManagePage).toHaveBeenCalledWith(ADMINISTRATOR, 'applications');
	});

	it('tells the page whether the reader may decide, so a reader sees no forms', async () => {
		expect(await load(makeLoadEvent(undefined, ADMINISTRATOR))).toMatchObject({ canDecide: true });
		expect(await load(makeLoadEvent(undefined, READER))).toMatchObject({ canDecide: false });
	});

	it('is a 404 for an application nobody may review: gone, another conference’s, or a draft', async () => {
		vi.mocked(getApplicationForReview).mockResolvedValue(null);

		const thrown = await catchThrown(() => load(makeLoadEvent()));

		expect(thrown.status).toBe(404);
	});

	it('reads the application of the conference the layout already found', async () => {
		await load(makeLoadEvent());

		expect(getApplicationForReview).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, APPLICATION_ID);
	});

	it('offers the free seats with the applicant’s committees first for an open application', async () => {
		const result = await load(makeLoadEvent());

		expect(listSeatsByCommittee).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, ['committee-1']);
		expect(result).toMatchObject({ seatGroups: FREE_SEAT_GROUPS });
	});

	it('does not read the free seats for an application that was already decided', async () => {
		vi.mocked(getApplicationForReview).mockResolvedValue(acceptedReview('unpaid'));

		const result = await load(makeLoadEvent());

		expect(listSeatsByCommittee).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			seatGroups: [],
			invoiceHref: `/manage/${CONFERENCE.slug}/fees?invoice=invoice-1#invoices`,
			changeSeatHref: `/manage/${CONFERENCE.slug}/allocation?seat=seat-france`
		});
	});

	it('walks the queue it was opened from, and carries that queue on every link and form', async () => {
		vi.mocked(findQueueNeighbours).mockResolvedValue({
			previousId: 'application-0',
			nextId: 'application-2'
		});

		const result = await load(makeLoadEvent('?status=waitlisted'));

		expect(findQueueNeighbours).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			expect.objectContaining({ status: 'waitlisted' }),
			APPLICATION_ID
		);
		expect(result).toMatchObject({
			backHref: `/manage/${CONFERENCE.slug}/applications?status=waitlisted`,
			previousHref: `/manage/${CONFERENCE.slug}/applications/application-0?status=waitlisted`,
			nextHref: `/manage/${CONFERENCE.slug}/applications/application-2?status=waitlisted`,
			actionUrls: { accept: `${REVIEW_PATH}?status=waitlisted&/accept` }
		});
	});

	it('hides Previous and Next when there is nothing either side', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ previousHref: null, nextHref: null });
	});

	it('nulls the private details this conference does not grant the reader, so none reach the browser', async () => {
		// The views answer for anybody taking part where the reader holds the
		// permission, which may be another conference altogether. A reader holding
		// neither detail permission here sees "Not provided", and nothing travels.
		vi.mocked(getApplicationForReview).mockResolvedValue(
			review(
				{},
				{
					details: {
						email: 'anna@example.com',
						dateOfBirth: '2016-01-01',
						phone: '+31 6 1234 5678',
						dietaryRequirements: 'Vegetarian',
						emergencyContactName: 'Maria',
						emergencyContactPhone: '+31 6 8765 4321'
					}
				}
			)
		);

		const result = await load(makeLoadEvent(undefined, READER));

		expect(result).toMatchObject({
			details: {
				email: null,
				dateOfBirth: null,
				phone: null,
				dietaryRequirements: null,
				emergencyContactName: null,
				emergencyContactPhone: null
			},
			age: null,
			ageWarning: null,
			detailsAccess: { contact: false, welfare: false }
		});
	});

	it('warns about an age outside the conference’s range, and never blocks on it', async () => {
		vi.mocked(getApplicationForReview).mockResolvedValue(
			review(
				{},
				{
					details: {
						email: 'anna@example.com',
						dateOfBirth: '2016-01-01',
						phone: null,
						dietaryRequirements: null,
						emergencyContactName: null,
						emergencyContactPhone: null
					}
				}
			)
		);

		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({
			ageWarning: 'This conference is for delegates aged 14 to 19.',
			seatGroups: FREE_SEAT_GROUPS
		});
	});
});

describe('accept', () => {
	it('asks for decide_applications, which reading the page does not need', async () => {
		await actions.accept(makeActionEvent({ seatId: '' }));

		expect(vi.mocked(requirePermission).mock.calls[0][3]).toBe('decide_applications');
	});

	it('gives the chosen seat and says who is now sitting where', async () => {
		const thrown = await catchThrown(() =>
			actions.accept(makeActionEvent({ seatId: 'seat-france' }, '?status=waitlisted'))
		);

		expect(acceptApplication).toHaveBeenCalledWith(SUPABASE, APPLICATION_ID, 'seat-france');
		expect(flashMessage()).toBe('Anna Kowalski is now France in UNSC.');
		expect(thrown).toMatchObject({ status: 303, location: `${REVIEW_PATH}?status=waitlisted` });
	});

	it('asks for a seat when none was chosen', async () => {
		const result = await actions.accept(makeActionEvent({ seatId: '' }));

		expect(result).toMatchObject({ status: 400, data: { message: CHOOSE_SEAT_REFUSAL } });
		expect(acceptApplication).not.toHaveBeenCalled();
	});

	it('says the seat was just taken when it is no longer free, and keeps the choice', async () => {
		const result = await actions.accept(makeActionEvent({ seatId: 'seat-gone' }));

		expect(result).toMatchObject({
			status: 400,
			data: { failedAction: 'accept', message: SEAT_JUST_TAKEN_REFUSAL, seatId: 'seat-gone' }
		});
		expect(acceptApplication).not.toHaveBeenCalled();
	});

	it('says the seat was just taken when the database finds it taken first', async () => {
		vi.mocked(acceptApplication).mockRejectedValue(new Error('That seat is not free'));

		const result = await actions.accept(makeActionEvent({ seatId: 'seat-france' }));

		expect(result).toMatchObject({ data: { message: SEAT_JUST_TAKEN_REFUSAL } });
	});

	it('refuses an application another organiser has already decided', async () => {
		vi.mocked(getApplicationForReview).mockResolvedValue(review({ status: 'rejected' }));

		const result = await actions.accept(makeActionEvent({ seatId: 'seat-france' }));

		expect(result).toMatchObject({ data: { message: ALREADY_DECIDED_REFUSAL } });
		expect(acceptApplication).not.toHaveBeenCalled();
	});

	it('shows the plain sentence, not the database’s, for anything unexpected', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(acceptApplication).mockRejectedValue(new Error('connection reset'));

		const result = await actions.accept(makeActionEvent({ seatId: 'seat-france' }));

		expect(result).toMatchObject({ data: { message: UNEXPECTED_ERROR_TEXT } });
		expect(consoleError).toHaveBeenCalled();
		consoleError.mockRestore();
	});

	it('is a 404 for an application of another conference', async () => {
		vi.mocked(getApplicationForReview).mockResolvedValue(null);

		const thrown = await catchThrown(() =>
			actions.accept(makeActionEvent({ seatId: 'seat-france' }))
		);

		expect(thrown.status).toBe(404);
	});
});

describe('waitlist', () => {
	it('waitlists the application with the note, as the signed-in organiser', async () => {
		const thrown = await catchThrown(() =>
			actions.waitlist(makeActionEvent({ decisionNote: '  Seats are full for now.  ' }))
		);

		expect(waitlistApplications).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			[APPLICATION_ID],
			SIGNED_IN_USER.id,
			'Seats are full for now.'
		);
		expect(flashMessage()).toBe(WAITLISTED_FLASH);
		expect(thrown).toMatchObject({ status: 303, location: REVIEW_PATH });
	});

	it('stores no note rather than an empty one', async () => {
		await catchThrown(() => actions.waitlist(makeActionEvent({ decisionNote: '' })));

		expect(waitlistApplications).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			[APPLICATION_ID],
			SIGNED_IN_USER.id,
			null
		);
	});

	it('refuses an application that is already on the waiting list', async () => {
		vi.mocked(getApplicationForReview).mockResolvedValue(review({ status: 'waitlisted' }));

		const result = await actions.waitlist(makeActionEvent({ decisionNote: 'Later.' }));

		expect(result).toMatchObject({
			data: { failedAction: 'waitlist', message: ALREADY_DECIDED_REFUSAL, decisionNote: 'Later.' }
		});
		expect(waitlistApplications).not.toHaveBeenCalled();
	});

	it('refuses when another organiser decided it between the read and the write', async () => {
		vi.mocked(waitlistApplications).mockResolvedValue({ changedCount: 0, skippedCount: 1 });

		const result = await actions.waitlist(makeActionEvent());

		expect(result).toMatchObject({ data: { message: ALREADY_DECIDED_REFUSAL } });
		expect(setFlash).not.toHaveBeenCalled();
	});
});

describe('reject', () => {
	it('marks a waitlisted application not accepted with the reason', async () => {
		vi.mocked(getApplicationForReview).mockResolvedValue(review({ status: 'waitlisted' }));

		await catchThrown(() => actions.reject(makeActionEvent({ decisionNote: 'We are full.' })));

		expect(rejectApplications).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			[APPLICATION_ID],
			SIGNED_IN_USER.id,
			'We are full.'
		);
		expect(flashMessage()).toBe(REJECTED_FLASH);
	});

	it('refuses an accepted application, which is revoked rather than rejected', async () => {
		vi.mocked(getApplicationForReview).mockResolvedValue(acceptedReview('unpaid'));

		const result = await actions.reject(makeActionEvent({ decisionNote: 'No.' }));

		expect(result).toMatchObject({ data: { failedAction: 'reject' } });
		expect(rejectApplications).not.toHaveBeenCalled();
	});

	it('keeps what was typed when the write fails unexpectedly', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(rejectApplications).mockRejectedValue(new Error('connection reset'));

		const result = await actions.reject(makeActionEvent({ decisionNote: 'We are full.' }));

		expect(result).toMatchObject({
			data: { message: UNEXPECTED_ERROR_TEXT, decisionNote: 'We are full.' }
		});
		consoleError.mockRestore();
	});
});

describe('revoke', () => {
	it('frees the seat, leaves the chosen status, and says the seat is free', async () => {
		vi.mocked(getApplicationForReview).mockResolvedValue(acceptedReview('unpaid'));

		await catchThrown(() => actions.revoke(makeActionEvent({ revokeTo: 'withdrawn' })));

		expect(revokeAcceptance).toHaveBeenCalledWith(
			SUPABASE,
			APPLICATION_ID,
			'seat-france',
			'withdrawn'
		);
		expect(flashMessage()).toBe('The seat is free again.');
	});

	it('names a paid invoice, which is kept and needs a manual refund', async () => {
		vi.mocked(getApplicationForReview).mockResolvedValue(acceptedReview('paid'));

		await catchThrown(() => actions.revoke(makeActionEvent({ revokeTo: 'rejected' })));

		expect(revokeAcceptance).toHaveBeenCalledWith(
			SUPABASE,
			APPLICATION_ID,
			'seat-france',
			'rejected'
		);
		expect(flashMessage()).toContain('THIMUN-0007 still needs a manual refund');
	});

	it('refuses an application that is not accepted', async () => {
		const result = await actions.revoke(makeActionEvent({ revokeTo: 'rejected' }));

		expect(result).toMatchObject({ data: { failedAction: 'revoke' } });
		expect(revokeAcceptance).not.toHaveBeenCalled();
	});

	it('says there is nothing to revoke when somebody emptied the seat first', async () => {
		vi.mocked(getApplicationForReview).mockResolvedValue(acceptedReview('unpaid'));
		vi.mocked(revokeAcceptance).mockRejectedValue(new Error('Nobody is sitting in that seat'));

		const result = await actions.revoke(makeActionEvent({ revokeTo: 'withdrawn' }));

		expect(result).toMatchObject({
			data: { message: NOTHING_TO_REVOKE_REFUSAL, revokeTo: 'withdrawn' }
		});
	});
});

describe('saveInternalNote', () => {
	it('saves the trimmed note and says so', async () => {
		await catchThrown(() =>
			actions.saveInternalNote(makeActionEvent({ internalNote: '  Call her school.  ' }))
		);

		expect(updateApplicationInternalNote).toHaveBeenCalledWith(
			SUPABASE,
			APPLICATION_ID,
			'Call her school.'
		);
		expect(flashMessage()).toBe(INTERNAL_NOTE_SAVED_FLASH);
	});

	it('works on a decided application too', async () => {
		vi.mocked(getApplicationForReview).mockResolvedValue(review({ status: 'rejected' }));

		await catchThrown(() => actions.saveInternalNote(makeActionEvent({ internalNote: 'Fine.' })));

		expect(updateApplicationInternalNote).toHaveBeenCalled();
	});

	it('refuses a note over the limit and gives it back to be shortened', async () => {
		const longNote = 'a'.repeat(INTERNAL_NOTE_MAX_LENGTH + 1);

		const result = await actions.saveInternalNote(makeActionEvent({ internalNote: longNote }));

		expect(result).toMatchObject({
			data: {
				failedAction: 'saveInternalNote',
				message: INTERNAL_NOTE_TOO_LONG_REFUSAL,
				internalNote: longNote
			}
		});
		expect(updateApplicationInternalNote).not.toHaveBeenCalled();
	});
});

/** Anna and her friend Ben, who applied to be one country together (Trello pZNcdPqU). */
const TEAM: TeamMember[] = [
	{
		applicationId: APPLICATION_ID,
		userId: 'user-applicant',
		fullName: 'Anna Kowalski',
		status: 'submitted',
		committeePreferences: ['committee-1']
	},
	{
		applicationId: 'application-2',
		userId: 'user-friend',
		fullName: 'Ben Okafor',
		status: 'submitted',
		committeePreferences: []
	}
];

/** France free in two committees, so the team of two fits. */
const FRANCE_TWICE: SeatGroup[] = [
	...FREE_SEAT_GROUPS,
	{
		committeeId: 'committee-2',
		committeeLabel: 'HRC',
		seats: [{ ...FREE_SEAT_GROUPS[0].seats[0], id: 'seat-france-hrc', committeeId: 'committee-2' }]
	}
];

describe('teams', () => {
	it('shows the team and decides it as one while both are undecided', async () => {
		vi.mocked(listTeamMembers).mockResolvedValue(TEAM);
		vi.mocked(listSeatsByCommittee).mockResolvedValue(FRANCE_TWICE);

		expect(await load(makeLoadEvent())).toMatchObject({
			profileHref: '/people/user-applicant',
			teamAccept: { countryOptions: [{ value: 'FR', label: 'France (2 committees free)' }] },
			team: {
				members: [
					{ fullName: 'Anna Kowalski', reviewHref: null, profileHref: '/people/user-applicant' },
					{
						fullName: 'Ben Okafor',
						reviewHref: `/manage/${CONFERENCE.slug}/applications/application-2`,
						profileHref: '/people/user-friend'
					}
				]
			}
		});
	});

	it('waitlists the undecided teammates along with this application', async () => {
		vi.mocked(listTeamMembers).mockResolvedValue(TEAM);

		await catchThrown(() => actions.waitlist(makeActionEvent()));

		expect(waitlistApplications).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			[APPLICATION_ID, 'application-2'],
			SIGNED_IN_USER.id,
			null
		);
	});

	it('offers the single seat again once the teammate is decided', async () => {
		vi.mocked(listTeamMembers).mockResolvedValue([TEAM[0], { ...TEAM[1], status: 'rejected' }]);

		expect(await load(makeLoadEvent())).toMatchObject({ teamAccept: null });
	});

	it('accepts the team into one country, a committee each', async () => {
		vi.mocked(listTeamMembers).mockResolvedValue(TEAM);
		vi.mocked(listSeatsByCommittee).mockResolvedValue(FRANCE_TWICE);

		await catchThrown(() => actions.acceptTeam(makeActionEvent({ countryCode: 'FR' })));

		expect(vi.mocked(acceptTeam).mock.calls[0][1].map((choice) => choice.seat.id)).toEqual([
			'seat-france',
			'seat-france-hrc'
		]);
		expect(flashMessage()).toBe('Anna Kowalski and Ben Okafor are now France in UNSC and HRC.');
	});

	it('asks for a country, and refuses one too few committees have free', async () => {
		vi.mocked(listTeamMembers).mockResolvedValue(TEAM);

		expect(await actions.acceptTeam(makeActionEvent({ countryCode: '' }))).toMatchObject({
			data: { failedAction: 'acceptTeam' }
		});
		expect(await actions.acceptTeam(makeActionEvent({ countryCode: 'FR' }))).toMatchObject({
			data: { failedAction: 'acceptTeam', countryCode: 'FR' }
		});
		expect(acceptTeam).not.toHaveBeenCalled();
	});

	it('teams this application with the one chosen', async () => {
		expect(await actions.addToTeam(makeActionEvent({ partnerApplicationId: '' }))).toMatchObject({
			data: { failedAction: 'team' }
		});

		await catchThrown(() =>
			actions.addToTeam(makeActionEvent({ partnerApplicationId: 'application-2' }))
		);

		expect(teamApplications).toHaveBeenCalledWith(SUPABASE, APPLICATION_ID, 'application-2');
	});

	it('takes out only a member of this team', async () => {
		vi.mocked(listTeamMembers).mockResolvedValue(TEAM);

		expect(
			await actions.removeFromTeam(makeActionEvent({ memberApplicationId: 'application-9' }))
		).toMatchObject({ data: { failedAction: 'team' } });

		await catchThrown(() =>
			actions.removeFromTeam(makeActionEvent({ memberApplicationId: 'application-2' }))
		);

		expect(removeFromTeam).toHaveBeenCalledWith(SUPABASE, 'application-2');
	});
});
