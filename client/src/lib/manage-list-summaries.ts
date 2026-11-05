/**
 * The one line under the title of the organiser's applications and allocation
 * pages in the manage redesign, such as "9 applications · closes 25 October" or
 * "11 seats · 9 filled · 1 held for a delegation · 1 free", and the words of
 * the allocation page's "waiting for seats" banner.
 *
 * Nothing here talks to Supabase or knows any Svelte: each function is handed
 * the counts the page's `load` already read.
 */

import type { AllocationSummary } from '$lib/allocation';
import type { ApplicationStatusCounts } from '$lib/applications';
import type { TrayDelegation } from '$lib/seat-drop';

/** "1 application" or "9 applications". */
function countedApplications(count: number): string {
	if (count === 1) {
		return '1 application';
	}

	return `${count} applications`;
}

/** "25 October": the day the moment falls on where the conference is, without the year. */
function formatDayAndLongMonth(moment: string, timeZone: string): string {
	return new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'long' }).format(
		new Date(moment)
	);
}

/**
 * The line under "Applications": "9 applications · closes 25 October".
 *
 * The count is every application on the five tabs together, because each tab
 * already shows its own. The deadline says "closes" while it is still ahead
 * of `now` and "closed" once it has passed, and is left out when the
 * conference has no closing date.
 */
export function applicationsHeaderSummary(
	counts: ApplicationStatusCounts,
	applicationsCloseAt: string | null,
	timeZone: string,
	now: Date
): string {
	let total = 0;

	for (const count of Object.values(counts)) {
		total += count;
	}

	const applications = total === 0 ? 'No applications yet' : countedApplications(total);

	if (applicationsCloseAt === null) {
		return applications;
	}

	const closingDay = formatDayAndLongMonth(applicationsCloseAt, timeZone);
	const hasClosed = new Date(applicationsCloseAt) <= now;
	const verb = hasClosed ? 'closed' : 'closes';

	return `${applications} · ${verb} ${closingDay}`;
}

/** "1 held for a delegation" or "3 held for delegations". */
function heldSeatsText(count: number): string {
	if (count === 1) {
		return '1 held for a delegation';
	}

	return `${count} held for delegations`;
}

/**
 * The line under "Allocation": "11 seats · 9 filled · 1 held for a delegation · 1 free".
 *
 * Filled, held and free are always there, even at nought, so the line reads
 * the same way every time; the hidden seats are added only when there are
 * some. A conference with no seats at all says "No seats yet".
 */
export function allocationHeaderSummary(summary: AllocationSummary): string {
	if (summary.total === 0) {
		return 'No seats yet';
	}

	const seats = summary.total === 1 ? '1 seat' : `${summary.total} seats`;
	const parts = [
		seats,
		`${summary.filled} filled`,
		heldSeatsText(summary.reserved),
		`${summary.free} free`
	];

	if (summary.hidden > 0) {
		parts.push(`${summary.hidden} hidden`);
	}

	return parts.join(' · ');
}

/**
 * The headline of one delegation in the waiting banner:
 * "Harbour View College is waiting for 1 more seat".
 */
export function waitingDelegationTitle(delegation: TrayDelegation): string {
	const missing = delegation.requestedSeats - delegation.allocatedSeats;
	const seats = missing === 1 ? '1 more seat' : `${missing} more seats`;

	return `${delegation.name} is waiting for ${seats}`;
}

/** The line under that headline: "2 of 3 given". */
export function waitingDelegationProgress(delegation: TrayDelegation): string {
	return `${delegation.allocatedSeats} of ${delegation.requestedSeats} given`;
}
