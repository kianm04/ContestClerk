/**
 * The row of figures under the conference dashboard's title, for each phase
 * (`specs/05-pages/organiser/dashboard.md`, "Figures").
 *
 * Nothing here talks to Supabase or knows any Svelte. Every figure is counted
 * from the database by `load`; this file only chooses which four to show and
 * writes them out.
 */

import type { StripStat } from '$lib/components/manage/StatStrip.svelte';
import type { ManagePage } from '$lib/manage-pages';
import type { ManagedCommittee } from '$lib/committees';
import type { ConferencePhase } from '$lib/conference-phase';
import { countOf } from '$lib/dashboard-words';
import type { DashboardStats } from '$lib/manage';
import { formatMoney } from '$lib/money';

/**
 * A figure and the page it is counted from. The dashboard leaves out a figure
 * whose page the reader may not open, so a count of applications, say, is
 * only shown to somebody who may read them.
 */
export type DashboardFigure = StripStat & { page: ManagePage };

/** What the figures are counted from, besides the conference's own figures. */
export type FigureFacts = {
	stats: DashboardStats;
	committees: Pick<ManagedCommittee, 'seatCounts' | 'positionPaperCount'>[];
	/** Whether the conference asks delegates for a position paper. */
	isPositionPaperRequired: boolean;
	/** Allocation: how many accepted delegations hold fewer seats than they asked for. */
	shortDelegationCount: number;
	/** Allocation: how many invoices are unpaid. */
	unpaidInvoiceCount: number;
	/** After: how many awards chairs have proposed and the organiser has not yet confirmed. */
	proposedAwardCount: number;
	/** After: every award, proposed or confirmed. */
	awardCount: number;
};

/** Position papers handed in, of the delegates seated: "6 of 9". */
export function papersFigure(
	committees: Pick<ManagedCommittee, 'seatCounts' | 'positionPaperCount'>[]
): string {
	let papers = 0;
	let seated = 0;

	for (const committee of committees) {
		papers += committee.positionPaperCount;
		seated += committee.seatCounts.filled;
	}

	return `${papers} of ${seated}`;
}

/** "4 of 11": seats with a delegate in them, of the seats on offer. */
function seatsFilledStat(stats: DashboardStats): DashboardFigure {
	return {
		value: `${stats.seatsFilled} of ${stats.seatsAvailable}`,
		label: 'Seats filled',
		page: 'allocation'
	};
}

/** While applications are open: applications, seats, delegation requests and money in. */
function applicationsFigures(facts: FigureFacts): DashboardFigure[] {
	const { stats } = facts;
	const invoicedCents = stats.invoicesPaidCents + stats.invoicesUnpaidCents;

	return [
		{
			value: `${stats.applicationsTotal}`,
			label: 'Applications',
			note: stats.applicationsToReview > 0 ? `${stats.applicationsToReview} to review` : undefined,
			page: 'applications'
		},
		seatsFilledStat(stats),
		{
			value: `${stats.delegationsTotal}`,
			label: stats.delegationsTotal === 1 ? 'Delegation request' : 'Delegation requests',
			page: 'delegations'
		},
		{
			value: formatMoney(stats.invoicesPaidCents, stats.currency),
			label: 'Paid',
			note: `of ${formatMoney(invoicedCents, stats.currency)} invoiced`,
			page: 'fees'
		}
	];
}

/** While seats are given: seats, delegations short of seats, money owed and papers in. */
function allocationFigures(facts: FigureFacts): DashboardFigure[] {
	const { stats } = facts;
	const shortCount = facts.shortDelegationCount;
	const figures: DashboardFigure[] = [
		seatsFilledStat(stats),
		{
			value: `${shortCount}`,
			label: shortCount === 1 ? 'Delegation short of seats' : 'Delegations short of seats',
			page: 'allocation'
		},
		{
			value: formatMoney(stats.invoicesUnpaidCents, stats.currency),
			label: 'Outstanding',
			note: countOf(facts.unpaidInvoiceCount, 'invoice', 'invoices'),
			page: 'fees'
		}
	];

	if (facts.isPositionPaperRequired) {
		figures.push({
			value: papersFigure(facts.committees),
			label: 'Position papers in',
			page: 'committees'
		});
	}

	return figures;
}

/** Once it is over: delegates, awards, money in and papers. */
function afterFigures(facts: FigureFacts): DashboardFigure[] {
	const { stats } = facts;
	const invoicedCents = stats.invoicesPaidCents + stats.invoicesUnpaidCents;
	const figures: DashboardFigure[] = [
		{ value: `${stats.seatsFilled}`, label: 'Delegates', page: 'participants' },
		{
			value: `${facts.awardCount}`,
			label: 'Awards',
			note: facts.proposedAwardCount > 0 ? `${facts.proposedAwardCount} to confirm` : undefined,
			page: 'awards'
		},
		{
			value: formatMoney(stats.invoicesPaidCents, stats.currency),
			label: 'Paid',
			note: `of ${formatMoney(invoicedCents, stats.currency)}`,
			page: 'fees'
		}
	];

	if (facts.isPositionPaperRequired) {
		figures.push({
			value: papersFigure(facts.committees),
			label: 'Position papers',
			page: 'committees'
		});
	}

	return figures;
}

/**
 * The figures for `phase`, in the order they are drawn. A conference day has
 * none: the rooms are the figures that matter then.
 */
export function dashboardFigures(phase: ConferencePhase, facts: FigureFacts): DashboardFigure[] {
	if (phase === 'applications') {
		return applicationsFigures(facts);
	}

	if (phase === 'allocation') {
		return allocationFigures(facts);
	}

	if (phase === 'after') {
		return afterFigures(facts);
	}

	return [];
}
