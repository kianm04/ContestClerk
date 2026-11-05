/**
 * What the conference dashboard knows while seats are being given, before the
 * first day: which delegations are still short of seats, which conference days
 * have nothing on the programme, and whether the programme is public
 * (`specs/05-pages/organiser/dashboard.md`, "Allocation").
 *
 * Nothing here talks to Supabase or knows any Svelte.
 * `$lib/server/dashboard-allocation.ts` reads the rows.
 */

import { dayInTimezone } from '$lib/dates';

/** An accepted delegation, with the seats it asked for and the seats it has. */
export type DelegationSeats = {
	id: string;
	name: string;
	requestedSeats: number;
	givenSeats: number;
};

/** What the server read for the allocation dashboard. */
export type AllocationFacts = {
	/** Accepted delegations holding fewer seats than they asked for. */
	shortDelegations: DelegationSeats[];
	/** When each schedule event starts, ISO timestamps in no particular order. */
	eventStarts: string[];
	/** Whether the organiser has ticked "Show programme publicly". */
	isProgrammePublic: boolean;
};

/** Nothing read, for the phases that do not draw any of it. */
export const NO_ALLOCATION_FACTS: AllocationFacts = {
	shortDelegations: [],
	eventStarts: [],
	isProgrammePublic: false
};

/** The day after a `YYYY-MM-DD` day, in the same shape. */
function nextDay(day: string): string {
	// Noon keeps the sum clear of any midnight a timezone could move it past.
	const noon = new Date(`${day}T12:00:00Z`);
	const oneDayLater = new Date(noon.getTime() + 24 * 60 * 60 * 1000);

	return oneDayLater.toISOString().slice(0, 10);
}

/** The accepted delegations holding fewer seats than they asked for, in the order given. */
export function shortOfSeats(delegations: DelegationSeats[]): DelegationSeats[] {
	return delegations.filter((delegation) => delegation.givenSeats < delegation.requestedSeats);
}

/**
 * Every conference day, from `startDate` to `endDate` (`YYYY-MM-DD`, both
 * counted), on which no schedule event starts in the conference's timezone.
 * An empty schedule leaves every day empty; the dashboard words that case on
 * its own.
 */
export function emptyProgrammeDays(
	startDate: string,
	endDate: string,
	eventStarts: string[],
	timezone: string
): string[] {
	const daysWithEvents = new Set(
		eventStarts.map((startsAt) => dayInTimezone(new Date(startsAt), timezone))
	);
	const emptyDays: string[] = [];

	for (let day = startDate; day <= endDate; day = nextDay(day)) {
		if (!daysWithEvents.has(day)) {
			emptyDays.push(day);
		}
	}

	return emptyDays;
}
