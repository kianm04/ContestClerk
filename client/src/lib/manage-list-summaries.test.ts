import { describe, expect, it } from 'vitest';
import {
	allocationHeaderSummary,
	applicationsHeaderSummary,
	waitingDelegationProgress,
	waitingDelegationTitle
} from './manage-list-summaries';

const COUNTS = { submitted: 4, waitlisted: 1, accepted: 4, rejected: 0, withdrawn: 0 };
const NO_COUNTS = { submitted: 0, waitlisted: 0, accepted: 0, rejected: 0, withdrawn: 0 };

// Late in the evening of 25 October, London time.
const CLOSING_MOMENT = '2026-10-25T22:59:00Z';
const BEFORE_CLOSING = new Date('2026-10-01T12:00:00Z');
const AFTER_CLOSING = new Date('2026-11-01T12:00:00Z');

describe('applicationsHeaderSummary', () => {
	it('counts every tab together and names the closing day', () => {
		expect(applicationsHeaderSummary(COUNTS, CLOSING_MOMENT, 'Europe/London', BEFORE_CLOSING)).toBe(
			'9 applications · closes 25 October'
		);
	});

	it('says "closed" once the deadline has passed', () => {
		expect(applicationsHeaderSummary(COUNTS, CLOSING_MOMENT, 'Europe/London', AFTER_CLOSING)).toBe(
			'9 applications · closed 25 October'
		);
	});

	it('names the day where the conference is, not where the server is', () => {
		// Late on the 25th in London is already the 26th in Tokyo.
		expect(applicationsHeaderSummary(COUNTS, CLOSING_MOMENT, 'Asia/Tokyo', BEFORE_CLOSING)).toBe(
			'9 applications · closes 26 October'
		);
	});

	it('leaves the deadline out when there is none', () => {
		expect(applicationsHeaderSummary(COUNTS, null, 'Europe/London', BEFORE_CLOSING)).toBe(
			'9 applications'
		);
	});

	it('says so when nobody has applied yet', () => {
		expect(applicationsHeaderSummary(NO_COUNTS, null, 'Europe/London', BEFORE_CLOSING)).toBe(
			'No applications yet'
		);
	});

	it('writes one application without the plural', () => {
		const oneApplication = { ...NO_COUNTS, accepted: 1 };

		expect(applicationsHeaderSummary(oneApplication, null, 'Europe/London', BEFORE_CLOSING)).toBe(
			'1 application'
		);
	});
});

describe('allocationHeaderSummary', () => {
	it('names filled, held and free seats, as the artboard does', () => {
		const summary = { total: 11, filled: 9, reserved: 1, free: 1, hidden: 0 };

		expect(allocationHeaderSummary(summary)).toBe(
			'11 seats · 9 filled · 1 held for a delegation · 1 free'
		);
	});

	it('adds the hidden seats only when there are some', () => {
		const summary = { total: 14, filled: 9, reserved: 2, free: 0, hidden: 3 };

		expect(allocationHeaderSummary(summary)).toBe(
			'14 seats · 9 filled · 2 held for delegations · 0 free · 3 hidden'
		);
	});

	it('says so when there are no seats', () => {
		const summary = { total: 0, filled: 0, reserved: 0, free: 0, hidden: 0 };

		expect(allocationHeaderSummary(summary)).toBe('No seats yet');
	});
});

describe('the waiting banner', () => {
	const delegation = {
		id: 'd1',
		name: 'Harbour View College',
		countryCode: null,
		requestedSeats: 3,
		allocatedSeats: 2
	};

	it('says how many more seats a delegation is waiting for', () => {
		expect(waitingDelegationTitle(delegation)).toBe(
			'Harbour View College is waiting for 1 more seat'
		);
		expect(waitingDelegationTitle({ ...delegation, allocatedSeats: 0 })).toBe(
			'Harbour View College is waiting for 3 more seats'
		);
	});

	it('says how many it has been given', () => {
		expect(waitingDelegationProgress(delegation)).toBe('2 of 3 given');
	});
});
