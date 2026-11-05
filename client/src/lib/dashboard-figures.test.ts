import { describe, expect, it } from 'vitest';
import type { DashboardStats } from '$lib/manage';
import { dashboardFigures, papersFigure, type FigureFacts } from './dashboard-figures';

/** Nine applications, four waiting; four of eleven seats filled; £135 of £180 paid. */
const STATS: DashboardStats = {
	applicationsTotal: 9,
	applicationsToReview: 4,
	delegationsTotal: 1,
	delegationsToReview: 1,
	seatsAvailable: 11,
	seatsFilled: 4,
	seatsReserved: 0,
	invoicesPaidCents: 13500,
	invoicesUnpaidCents: 4500,
	currency: 'GBP'
};

/** Two committees: four seated with three papers, five seated with three papers. */
const FACTS: FigureFacts = {
	stats: STATS,
	committees: [
		{ seatCounts: { available: 4, filled: 4, reserved: 0, total: 4 }, positionPaperCount: 3 },
		{ seatCounts: { available: 7, filled: 5, reserved: 0, total: 7 }, positionPaperCount: 3 }
	],
	isPositionPaperRequired: true,
	shortDelegationCount: 1,
	unpaidInvoiceCount: 3,
	proposedAwardCount: 3,
	awardCount: 5
};

describe('papersFigure', () => {
	it('counts the papers in of the delegates seated', () => {
		expect(papersFigure(FACTS.committees)).toBe('6 of 9');
	});
});

describe('dashboardFigures', () => {
	it('counts applications, seats, requests and money while applications are open', () => {
		expect(dashboardFigures('applications', FACTS)).toEqual([
			{ value: '9', label: 'Applications', note: '4 to review', page: 'applications' },
			{ value: '4 of 11', label: 'Seats filled', page: 'allocation' },
			{ value: '1', label: 'Delegation request', page: 'delegations' },
			{ value: '£135.00', label: 'Paid', note: 'of £180.00 invoiced', page: 'fees' }
		]);
	});

	it('leaves the note off when nothing is waiting, and counts requests in the plural', () => {
		const stats = { ...STATS, applicationsToReview: 0, delegationsTotal: 2 };
		const figures = dashboardFigures('applications', { ...FACTS, stats });

		expect(figures[0].note).toBeUndefined();
		expect(figures[2].label).toBe('Delegation requests');
	});

	it('counts seats, short delegations, money owed and papers while seats are given', () => {
		expect(dashboardFigures('allocation', FACTS)).toEqual([
			{ value: '4 of 11', label: 'Seats filled', page: 'allocation' },
			{ value: '1', label: 'Delegation short of seats', page: 'allocation' },
			{ value: '£45.00', label: 'Outstanding', note: '3 invoices', page: 'fees' },
			{ value: '6 of 9', label: 'Position papers in', page: 'committees' }
		]);
	});

	it('leaves the papers out when the conference asks for none', () => {
		const figures = dashboardFigures('allocation', { ...FACTS, isPositionPaperRequired: false });

		expect(figures.map((figure) => figure.label)).not.toContain('Position papers in');
	});

	it('shows no figures on a conference day', () => {
		expect(dashboardFigures('conference-days', FACTS)).toEqual([]);
	});

	it('counts delegates, awards, money and papers once it is over', () => {
		expect(dashboardFigures('after', FACTS)).toEqual([
			{ value: '4', label: 'Delegates', page: 'participants' },
			{ value: '5', label: 'Awards', note: '3 to confirm', page: 'awards' },
			{ value: '£135.00', label: 'Paid', note: 'of £180.00', page: 'fees' },
			{ value: '6 of 9', label: 'Position papers', page: 'committees' }
		]);
	});
});
