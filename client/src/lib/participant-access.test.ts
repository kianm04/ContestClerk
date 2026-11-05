import { describe, expect, it } from 'vitest';
import {
	hiddenParticipantCsvHeadings,
	participantColumns,
	participantsReaderMaySee,
	queryForColumns,
	totalsForColumns
} from './participant-access';
import type { MyPermissions } from './permissions';
import { EMPTY_PARTICIPANT_QUERY, type Participant } from './participants';

const ADMINISTRATOR: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: 0
};

/** The Chair preset, assigned to UNSC. */
const CHAIR: MyPermissions = {
	held: [
		{ permission: 'run_room', scope: 'committees' },
		{ permission: 'review_papers', scope: 'committees' },
		{ permission: 'read_participants', scope: 'committees' }
	],
	committeeIds: ['committee-unsc'],
	rank: 1
};

/** A registration desk: every participant, and their welfare details. */
const DESK: MyPermissions = {
	held: [
		{ permission: 'read_participants', scope: 'conference' },
		{ permission: 'read_welfare_details', scope: 'conference' }
	],
	committeeIds: [],
	rank: 2
};

/** Somebody who reads applications, and so opens the allocation grid, but may not decide them. */
const READER: MyPermissions = {
	held: [
		{ permission: 'read_applications', scope: 'conference' },
		{ permission: 'read_participants', scope: 'conference' }
	],
	committeeIds: [],
	rank: 2
};

/** Somebody who decides applications on the whole conference. */
const DECIDER: MyPermissions = {
	held: [
		{ permission: 'decide_applications', scope: 'conference' },
		{ permission: 'read_participants', scope: 'conference' }
	],
	committeeIds: [],
	rank: 2
};

/** A participant seated in this committee; the other fields do not matter here. */
function seatedIn(committeeId: string): Participant {
	return { committee: { id: committeeId, name: committeeId, abbreviation: null } } as Participant;
}

describe('participantColumns', () => {
	it('shows everything to an administrator', () => {
		expect(participantColumns(ADMINISTRATOR)).toEqual({
			contact: true,
			welfare: true,
			invoice: true,
			paper: true,
			actions: true,
			canRemove: true
		});
	});

	it('shows a chair the papers of the rooms they run, and no invoices or actions', () => {
		expect(participantColumns(CHAIR)).toEqual({
			contact: false,
			welfare: false,
			invoice: false,
			paper: true,
			actions: false,
			canRemove: false
		});
	});

	it('offers "Remove from seat" only to somebody who may decide applications', () => {
		// Freeing a seat is `revoke_seat`, which asks `decide_applications` on the
		// whole conference. Opening the allocation grid asks less, and a button
		// the database would refuse is not offered.
		expect(participantColumns(READER)).toMatchObject({ actions: true, canRemove: false });
		expect(participantColumns(DECIDER)).toMatchObject({ actions: true, canRemove: true });
	});

	it('shows the desk welfare details, and neither contact details, papers nor invoices', () => {
		expect(participantColumns(DESK)).toMatchObject({
			contact: false,
			welfare: true,
			invoice: false,
			paper: false
		});
	});
});

describe('participantsReaderMaySee', () => {
	it('keeps a chair to their own committees, and gives the desk all of them', () => {
		const participants = [seatedIn('committee-unsc'), seatedIn('committee-hrc')];

		expect(participantsReaderMaySee(participants, CHAIR)).toEqual([participants[0]]);
		expect(participantsReaderMaySee(participants, DESK)).toEqual(participants);
	});
});

describe('queryForColumns', () => {
	it('drops the filters of columns the reader does not see', () => {
		const query = {
			...EMPTY_PARTICIPANT_QUERY,
			invoice: 'unpaid' as const,
			paper: 'missing' as const
		};

		expect(queryForColumns(query, participantColumns(DESK))).toMatchObject({
			invoice: '',
			paper: ''
		});
		expect(queryForColumns(query, participantColumns(ADMINISTRATOR))).toEqual(query);
	});
});

describe('totalsForColumns', () => {
	it('stops counting what the reader does not see', () => {
		const totals = {
			participantCount: 9,
			unpaidCount: 3,
			missingPaperCount: 2,
			countByCommittee: {}
		};

		expect(totalsForColumns(totals, participantColumns(CHAIR))).toMatchObject({
			unpaidCount: 0,
			missingPaperCount: 2
		});
	});
});

describe('hiddenParticipantCsvHeadings', () => {
	it('leaves out contact, invoice and paper columns for the desk', () => {
		expect(hiddenParticipantCsvHeadings(DESK)).toEqual([
			'Email',
			'Phone',
			'Invoice number',
			'Invoice status',
			'Paid at',
			'Paper status'
		]);
	});

	it('leaves out nothing for an administrator', () => {
		expect(hiddenParticipantCsvHeadings(ADMINISTRATOR)).toEqual([]);
	});
});
