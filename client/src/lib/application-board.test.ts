import { describe, expect, it } from 'vitest';
import {
	applicationDropAction,
	boardColumnQuery,
	isDraggableApplication,
	panelMoves,
	showBoardMoves,
	type ApplicationBoardColumn
} from './application-board';
import { EMPTY_APPLICATION_LIST_QUERY, type OrganiserApplicationRow } from './applications';

/** One card of the board. Only the id, the name and the status are read here. */
function application(
	id: string,
	status: OrganiserApplicationRow['status'] = 'submitted'
): OrganiserApplicationRow {
	return {
		id,
		applicantName: `Applicant ${id}`,
		avatarPath: null,
		institutionName: null,
		countryCode: null,
		experienceLevel: 'beginner',
		firstPreference: null,
		committeePreferences: [],
		status,
		submittedAt: '2026-10-03T09:00:00+00:00',
		decidedAt: null,
		seatLabel: null
	};
}

const ANNA = application('anna');
const BEN = application('ben');
const CARLA = application('carla', 'waitlisted');

/** A board with Anna and Ben under review, Carla waitlisted and 40 more under review off the page. */
const COLUMNS: ApplicationBoardColumn[] = [
	{ status: 'submitted', rows: [ANNA, BEN], total: 42 },
	{ status: 'waitlisted', rows: [CARLA], total: 1 },
	{ status: 'accepted', rows: [], total: 0 },
	{ status: 'rejected', rows: [], total: 0 }
];

describe('applicationDropAction', () => {
	it('posts an application under review to the bulk bar action of each column', () => {
		expect(applicationDropAction('submitted', 'waitlisted')).toBe('bulkWaitlist');
		expect(applicationDropAction('submitted', 'accepted')).toBe('chooseAccept');
		expect(applicationDropAction('submitted', 'rejected')).toBe('chooseReject');
	});

	it('lets a waitlisted application be accepted or turned down, but not waitlisted again', () => {
		expect(applicationDropAction('waitlisted', 'accepted')).toBe('chooseAccept');
		expect(applicationDropAction('waitlisted', 'rejected')).toBe('chooseReject');
		expect(applicationDropAction('waitlisted', 'waitlisted')).toBeNull();
	});

	it('never sends anything back into the queue', () => {
		expect(applicationDropAction('waitlisted', 'submitted')).toBeNull();
		expect(applicationDropAction('rejected', 'submitted')).toBeNull();
	});

	it('leaves taking back an acceptance to the review page', () => {
		// The status machine allows accepted → rejected, but that is "Revoke",
		// which frees a seat and is not something the bulk bar does.
		expect(applicationDropAction('accepted', 'rejected')).toBeNull();
		expect(applicationDropAction('accepted', 'waitlisted')).toBeNull();
	});

	it('moves nothing out of the two states nobody leaves', () => {
		expect(applicationDropAction('rejected', 'accepted')).toBeNull();
		expect(applicationDropAction('withdrawn', 'accepted')).toBeNull();
	});
});

describe('isDraggableApplication', () => {
	it('picks up only what some column would take', () => {
		expect(isDraggableApplication('submitted')).toBe(true);
		expect(isDraggableApplication('waitlisted')).toBe(true);
		expect(isDraggableApplication('accepted')).toBe(false);
		expect(isDraggableApplication('rejected')).toBe(false);
		expect(isDraggableApplication('withdrawn')).toBe(false);
	});
});

describe('boardColumnQuery', () => {
	it('is the first page of the card own tab, with the filters and the board kept', () => {
		const query = { ...EMPTY_APPLICATION_LIST_QUERY, q: 'anna', page: 3, view: 'board' as const };

		expect(boardColumnQuery(query, 'waitlisted')).toEqual({
			...query,
			status: 'waitlisted',
			page: 1,
			view: 'board'
		});
	});
});

describe('panelMoves', () => {
	it('moves nothing while no panel is open', () => {
		expect(panelMoves(null, [ANNA])).toEqual([]);
	});

	it('holds the applications of the seat panel in Accepted and of the note panel in Not accepted', () => {
		expect(panelMoves('accept', [ANNA])).toEqual([{ application: ANNA, to: 'accepted' }]);
		expect(panelMoves('reject', [ANNA, BEN])).toEqual([
			{ application: ANNA, to: 'rejected' },
			{ application: BEN, to: 'rejected' }
		]);
	});
});

describe('showBoardMoves', () => {
	it('is the board unchanged when nothing is moving', () => {
		expect(showBoardMoves(COLUMNS, [])).toBe(COLUMNS);
	});

	it('takes the card out of its column and puts it at the top of the new one', () => {
		const shown = showBoardMoves(COLUMNS, [{ application: BEN, to: 'waitlisted' }]);

		expect(shown[0].rows.map((row) => row.id)).toEqual(['anna']);
		expect(shown[0].total).toBe(41);
		expect(shown[1].rows.map((row) => row.id)).toEqual(['ben', 'carla']);
		expect(shown[1].total).toBe(2);
	});

	it('leaves every other column as it was', () => {
		const shown = showBoardMoves(COLUMNS, [{ application: ANNA, to: 'rejected' }]);

		expect(shown[1]).toBe(COLUMNS[1]);
		expect(shown[2]).toBe(COLUMNS[2]);
		expect(shown[3].rows).toEqual([ANNA]);
	});

	it('does not draw a card twice when the column already has it', () => {
		const shown = showBoardMoves(COLUMNS, [{ application: CARLA, to: 'waitlisted' }]);

		expect(shown[1]).toBe(COLUMNS[1]);
	});
});
