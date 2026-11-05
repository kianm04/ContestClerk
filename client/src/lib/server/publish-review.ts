/**
 * Everything the Publish page (`/manage/[slug]/publish`) reads about a draft
 * before it goes public, gathered in one place. What the page then says about
 * it is pure and lives in `$lib/publish-review.ts`.
 *
 * Files under `$lib/server` only ever run on the server.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Conference } from '$lib/conferences';
import { publishChecklist, type PublishChecklistCounts } from '$lib/publish-checklist';
import type { PublishReviewFacts, ReviewCommittee } from '$lib/publish-review';
import { readApplicationFormSettings } from './application-form-settings';
import { listFees, readPaymentSettings } from './fees';
import { readChecklistCounts } from './manage';
import { listCommitteesForManage } from './manage-committees';

/** The checklist counts of one conference, which say nothing about Stripe. */
export type ConferenceChecklistCounts = Omit<PublishChecklistCounts, 'isStripeConnected'>;

/**
 * The checklist counts of one conference. The page and the `publish` action
 * both read them here, so they count the same things.
 *
 * `readChecklistCounts` answers for every conference it was asked about, so
 * one that is missing means the query went wrong rather than that there is
 * nothing to count.
 */
export async function readConferenceChecklistCounts(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<ConferenceChecklistCounts> {
	const countsById = await readChecklistCounts(supabase, [conferenceId]);
	const counts = countsById[conferenceId];

	if (counts === undefined) {
		throw new Error(`Could not count the checklist of the conference ${conferenceId}.`);
	}

	return counts;
}

/**
 * The conference's committees, keeping only what the Publish and Published
 * pages show of each: its name, its free seats and whether anybody chairs it.
 */
export async function listReviewCommittees(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<ReviewCommittee[]> {
	const committees = await listCommitteesForManage(supabase, conferenceId);

	return committees.map((committee) => ({
		name: committee.name,
		abbreviation: committee.abbreviation,
		availableSeatCount: committee.seatCounts.available,
		chairCount: committee.chairNames.length
	}));
}

/**
 * The facts the Publish page is worked out from.
 *
 * Five reads, none of which needs another's answer, so all five are sent at
 * once. `isStripeConnected` comes from the organisation the layout has already
 * read, so it is handed in rather than read again.
 */
export async function readPublishReviewFacts(
	supabase: SupabaseClient,
	conference: Conference,
	isStripeConnected: boolean,
	now: Date
): Promise<PublishReviewFacts> {
	const [committees, fees, payment, formSettings, counts] = await Promise.all([
		listReviewCommittees(supabase, conference.id),
		listFees(supabase, conference.id),
		readPaymentSettings(supabase, conference.id),
		readApplicationFormSettings(supabase, conference.id),
		readConferenceChecklistCounts(supabase, conference.id)
	]);

	return {
		conference,
		committees,
		fees,
		currency: payment.currency,
		collectsPaymentsManually: payment.collectsPaymentsManually,
		committeePreferenceCount: formSettings.committeePreferenceCount,
		askMotivation: formSettings.askMotivation,
		checklist: publishChecklist(conference, { ...counts, isStripeConnected }, now),
		now
	};
}
