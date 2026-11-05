import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SeatGroup } from '$lib/allocation';
import {
	ALREADY_DECIDED_REFUSAL,
	CHOOSE_SEAT_REFUSAL,
	INTERNAL_NOTE_MAX_LENGTH,
	INTERNAL_NOTE_SAVED_FLASH,
	INTERNAL_NOTE_TOO_LONG_REFUSAL,
	REJECTED_FLASH,
	SEAT_JUST_TAKEN_REFUSAL,
	WAITLISTED_FLASH,
	acceptedFlash,
	type ApplicationForReview,
	type ReviewApplication
} from '$lib/application-review';
import {
	CHOOSE_COUNTRY_REFUSAL,
	COUNTRY_JUST_TAKEN_REFUSAL,
	TEAM_WAITLISTED_FLASH,
	type TeamMember
} from '$lib/application-teams';
import { DECISION_NOTE_MAX_LENGTH } from '$lib/applications';
import { UNEXPECTED_ERROR_TEXT } from '$lib/auth';
import {
	acceptIntoSeat,
	acceptTeamIntoCountry,
	messageOf,
	readDecisionNote,
	readInternalNote,
	rejectOne,
	saveInternalNote,
	waitlistOne
} from './application-decisions';

// The writes are stood in for, so these tests are about what is checked before
// writing and how each answer is worded. What the database itself refuses is
// tested in `tests/db/`.
vi.mock('$lib/server/application-bulk-decisions', () => ({
	rejectApplications: vi.fn(),
	waitlistApplications: vi.fn()
}));

vi.mock('$lib/server/application-review', () => ({ updateApplicationInternalNote: vi.fn() }));

vi.mock('$lib/server/seat-acceptance', () => ({
	acceptApplication: vi.fn(),
	listSeatsByCommittee: vi.fn()
}));

vi.mock('$lib/server/application-teams', () => ({ acceptTeam: vi.fn() }));

import { rejectApplications, waitlistApplications } from '$lib/server/application-bulk-decisions';
import { acceptTeam } from '$lib/server/application-teams';
import { updateApplicationInternalNote } from '$lib/server/application-review';
import { acceptApplication, listSeatsByCommittee } from '$lib/server/seat-acceptance';

/** The Supabase client. These functions only hand it on. */
const SUPABASE = {} as SupabaseClient;

const CONFERENCE_ID = 'conference-1';
const ORGANISER_ID = 'user-organiser';

/** A free seat, France on the Security Council. */
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

/** Anna's application, `submitted` unless a test says otherwise. */
function review(overrides: Partial<ReviewApplication> = {}): ApplicationForReview {
	return {
		application: {
			id: 'application-1',
			conferenceId: CONFERENCE_ID,
			status: 'submitted',
			committeePreferences: ['committee-1'],
			seatPreferences: null,
			motivation: 'I love debating.',
			answers: {},
			submittedAt: '2026-10-03T09:00:00Z',
			decidedAt: null,
			decisionNote: null,
			internalNote: null,
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
		invoice: null
	};
}

/** A form with these fields, as the browser would post it. */
function formWith(fields: Record<string, string>): FormData {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) formData.set(name, value);

	return formData;
}

beforeEach(() => {
	vi.resetAllMocks();
	vi.mocked(listSeatsByCommittee).mockResolvedValue(FREE_SEAT_GROUPS);
	vi.mocked(waitlistApplications).mockResolvedValue({ changedCount: 1, skippedCount: 0 });
	vi.mocked(rejectApplications).mockResolvedValue({ changedCount: 1, skippedCount: 0 });
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('messageOf', () => {
	it('reads the message of an error, and anything else as text', () => {
		expect(messageOf(new Error('That seat is not free'))).toBe('That seat is not free');
		expect(messageOf('connection reset')).toBe('connection reset');
	});
});

describe('readDecisionNote and readInternalNote', () => {
	it('trims both notes, and cuts the note to the applicant to its length', () => {
		const longNote = 'x'.repeat(DECISION_NOTE_MAX_LENGTH + 5);

		expect(readDecisionNote(formWith({ decisionNote: '  Well done.  ' }))).toBe('Well done.');
		expect(readDecisionNote(formWith({ decisionNote: longNote }))).toHaveLength(
			DECISION_NOTE_MAX_LENGTH
		);
		expect(readInternalNote(formWith({ internalNote: '  Strong writer. ' }))).toBe(
			'Strong writer.'
		);
	});

	it('reads a missing field as no note', () => {
		expect(readDecisionNote(new FormData())).toBe('');
		expect(readInternalNote(new FormData())).toBe('');
	});
});

describe('acceptIntoSeat', () => {
	it('gives the seat and names it in the flash', async () => {
		const outcome = await acceptIntoSeat(SUPABASE, CONFERENCE_ID, review(), 'seat-france');

		expect(acceptApplication).toHaveBeenCalledWith(SUPABASE, 'application-1', 'seat-france');
		expect(outcome).toEqual({
			isDone: true,
			flash: acceptedFlash('Anna Kowalski', 'France', 'UNSC')
		});
	});

	it('refuses an application already decided, without writing', async () => {
		const outcome = await acceptIntoSeat(
			SUPABASE,
			CONFERENCE_ID,
			review({ status: 'rejected' }),
			'seat-france'
		);

		expect(outcome).toEqual({ isDone: false, message: ALREADY_DECIDED_REFUSAL });
		expect(acceptApplication).not.toHaveBeenCalled();
	});

	it('asks for a seat when none was chosen', async () => {
		const outcome = await acceptIntoSeat(SUPABASE, CONFERENCE_ID, review(), '');

		expect(outcome).toEqual({ isDone: false, message: CHOOSE_SEAT_REFUSAL });
	});

	it('says the seat was just taken when it is not free any more', async () => {
		const outcome = await acceptIntoSeat(SUPABASE, CONFERENCE_ID, review(), 'seat-germany');

		expect(outcome).toEqual({ isDone: false, message: SEAT_JUST_TAKEN_REFUSAL });
		expect(acceptApplication).not.toHaveBeenCalled();
	});

	it('words what the database refused in the page’s own words', async () => {
		vi.mocked(acceptApplication).mockRejectedValueOnce(new Error('That seat is not free'));
		const taken = await acceptIntoSeat(SUPABASE, CONFERENCE_ID, review(), 'seat-france');

		vi.mocked(acceptApplication).mockRejectedValueOnce(
			new Error('Only a submitted or waitlisted application can be accepted')
		);
		const decided = await acceptIntoSeat(SUPABASE, CONFERENCE_ID, review(), 'seat-france');

		expect(taken).toEqual({ isDone: false, message: SEAT_JUST_TAKEN_REFUSAL });
		expect(decided).toEqual({ isDone: false, message: ALREADY_DECIDED_REFUSAL });
	});

	it('logs anything else rather than showing it', async () => {
		vi.mocked(acceptApplication).mockRejectedValueOnce(new Error('connection reset'));

		const outcome = await acceptIntoSeat(SUPABASE, CONFERENCE_ID, review(), 'seat-france');

		expect(outcome).toEqual({ isDone: false, message: UNEXPECTED_ERROR_TEXT });
		expect(console.error).toHaveBeenCalled();
	});
});

describe('waitlistOne', () => {
	it('waitlists the one application, with the note or with none', async () => {
		const withNote = await waitlistOne(SUPABASE, review(), ORGANISER_ID, 'Soon.');
		await waitlistOne(SUPABASE, review(), ORGANISER_ID, '');

		expect(withNote).toEqual({ isDone: true, flash: WAITLISTED_FLASH });
		expect(waitlistApplications).toHaveBeenNthCalledWith(
			1,
			SUPABASE,
			CONFERENCE_ID,
			['application-1'],
			ORGANISER_ID,
			'Soon.'
		);
		expect(waitlistApplications).toHaveBeenNthCalledWith(
			2,
			SUPABASE,
			CONFERENCE_ID,
			['application-1'],
			ORGANISER_ID,
			null
		);
	});

	it('refuses one already waitlisted, and one decided while the page was open', async () => {
		const already = await waitlistOne(SUPABASE, review({ status: 'waitlisted' }), ORGANISER_ID, '');

		vi.mocked(waitlistApplications).mockResolvedValueOnce({ changedCount: 0, skippedCount: 1 });
		const raced = await waitlistOne(SUPABASE, review(), ORGANISER_ID, '');

		expect(already).toEqual({ isDone: false, message: ALREADY_DECIDED_REFUSAL });
		expect(raced).toEqual({ isDone: false, message: ALREADY_DECIDED_REFUSAL });
	});

	it('logs a failed write rather than showing it', async () => {
		vi.mocked(waitlistApplications).mockRejectedValueOnce(new Error('connection reset'));

		const outcome = await waitlistOne(SUPABASE, review(), ORGANISER_ID, '');

		expect(outcome).toEqual({ isDone: false, message: UNEXPECTED_ERROR_TEXT });
		expect(console.error).toHaveBeenCalled();
	});
});

describe('a team', () => {
	/** Anna and Ben, who applied as one team; Ben asked for HRC. */
	const TEAM: TeamMember[] = [
		{
			applicationId: 'application-1',
			userId: 'user-anna',
			fullName: 'Anna Kowalski',
			status: 'submitted',
			committeePreferences: []
		},
		{
			applicationId: 'application-2',
			userId: 'user-ben',
			fullName: 'Ben Okafor',
			status: 'waitlisted',
			committeePreferences: ['committee-2']
		}
	];

	/** France free on the Security Council and in HRC. */
	const FRANCE_TWICE: SeatGroup[] = [
		...FREE_SEAT_GROUPS,
		{
			committeeId: 'committee-2',
			committeeLabel: 'HRC',
			seats: [
				{ ...FREE_SEAT_GROUPS[0].seats[0], id: 'seat-france-hrc', committeeId: 'committee-2' }
			]
		}
	];

	it('waitlists the teammates along with the application', async () => {
		const outcome = await waitlistOne(SUPABASE, review(), ORGANISER_ID, '', ['application-2']);

		expect(outcome).toEqual({ isDone: true, flash: TEAM_WAITLISTED_FLASH });
		expect(waitlistApplications).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE_ID,
			['application-1', 'application-2'],
			ORGANISER_ID,
			null
		);
	});

	it('accepts the team into one country, each in a committee of their own', async () => {
		vi.mocked(listSeatsByCommittee).mockResolvedValue(FRANCE_TWICE);

		const outcome = await acceptTeamIntoCountry(SUPABASE, CONFERENCE_ID, TEAM, 'FR');

		expect(outcome).toEqual({
			isDone: true,
			flash: 'Anna Kowalski and Ben Okafor are now France in UNSC and HRC.'
		});
		expect(
			vi.mocked(acceptTeam).mock.calls[0][1].map((choice) => [choice.applicationId, choice.seat.id])
		).toEqual([
			['application-1', 'seat-france'],
			['application-2', 'seat-france-hrc']
		]);
	});

	it('asks for a country, and refuses one free in too few committees', async () => {
		expect(await acceptTeamIntoCountry(SUPABASE, CONFERENCE_ID, TEAM, '')).toEqual({
			isDone: false,
			message: CHOOSE_COUNTRY_REFUSAL
		});
		expect(await acceptTeamIntoCountry(SUPABASE, CONFERENCE_ID, TEAM, 'FR')).toEqual({
			isDone: false,
			message: COUNTRY_JUST_TAKEN_REFUSAL
		});
		expect(acceptTeam).not.toHaveBeenCalled();
	});

	it('says the country was just taken when a seat went between the read and the write', async () => {
		vi.mocked(listSeatsByCommittee).mockResolvedValue(FRANCE_TWICE);
		vi.mocked(acceptTeam).mockRejectedValueOnce(new Error('That seat is not free'));

		expect(await acceptTeamIntoCountry(SUPABASE, CONFERENCE_ID, TEAM, 'FR')).toEqual({
			isDone: false,
			message: COUNTRY_JUST_TAKEN_REFUSAL
		});
	});
});

describe('rejectOne', () => {
	it('marks the application not accepted, with the note', async () => {
		const outcome = await rejectOne(
			SUPABASE,
			review({ status: 'waitlisted' }),
			ORGANISER_ID,
			'Full.'
		);

		expect(outcome).toEqual({ isDone: true, flash: REJECTED_FLASH });
		expect(rejectApplications).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE_ID,
			['application-1'],
			ORGANISER_ID,
			'Full.'
		);
	});

	it('refuses one already decided, and one decided while the page was open', async () => {
		const already = await rejectOne(SUPABASE, review({ status: 'accepted' }), ORGANISER_ID, '');

		vi.mocked(rejectApplications).mockResolvedValueOnce({ changedCount: 0, skippedCount: 1 });
		const raced = await rejectOne(SUPABASE, review(), ORGANISER_ID, '');

		expect(already).toEqual({ isDone: false, message: ALREADY_DECIDED_REFUSAL });
		expect(raced).toEqual({ isDone: false, message: ALREADY_DECIDED_REFUSAL });
	});

	it('logs a failed write rather than showing it', async () => {
		vi.mocked(rejectApplications).mockRejectedValueOnce(new Error('connection reset'));

		const outcome = await rejectOne(SUPABASE, review(), ORGANISER_ID, '');

		expect(outcome).toEqual({ isDone: false, message: UNEXPECTED_ERROR_TEXT });
	});
});

describe('saveInternalNote', () => {
	it('saves the note', async () => {
		const outcome = await saveInternalNote(SUPABASE, review(), 'Strong writer.');

		expect(outcome).toEqual({ isDone: true, flash: INTERNAL_NOTE_SAVED_FLASH });
		expect(updateApplicationInternalNote).toHaveBeenCalledWith(
			SUPABASE,
			'application-1',
			'Strong writer.'
		);
	});

	it('refuses a note that is too long, without writing', async () => {
		const tooLong = 'x'.repeat(INTERNAL_NOTE_MAX_LENGTH + 1);

		const outcome = await saveInternalNote(SUPABASE, review(), tooLong);

		expect(outcome).toEqual({ isDone: false, message: INTERNAL_NOTE_TOO_LONG_REFUSAL });
		expect(updateApplicationInternalNote).not.toHaveBeenCalled();
	});

	it('logs a failed write rather than showing it', async () => {
		vi.mocked(updateApplicationInternalNote).mockRejectedValueOnce(new Error('connection reset'));

		const outcome = await saveInternalNote(SUPABASE, review(), 'Strong writer.');

		expect(outcome).toEqual({ isDone: false, message: UNEXPECTED_ERROR_TEXT });
	});
});
