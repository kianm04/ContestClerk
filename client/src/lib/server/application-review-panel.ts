/**
 * Reading the review panel beside the applications list (the manage redesign):
 * which of the page's rows it shows, and everything it draws about that one
 * application.
 *
 * It reads the application the way the review page does, with
 * `getApplicationForReview`, so the two never disagree about an applicant.
 *
 * Files under `$lib/server` only ever run on the server.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	panelFacts,
	panelMetaLine,
	panelNeighbours,
	panelPosition,
	pickPanelIndex,
	type ReviewPanel
} from '$lib/application-panel';
import { reviewPanelLinks } from '$lib/application-panel-urls';
import { canAllocate, canReject, canWaitlist, seatChoiceOptions } from '$lib/application-review';
import type { ApplicationListQuery } from '$lib/applications';
import { ageInYears } from '$lib/dates';
import { withheldPrivateDetails, type PrivateDetailsAccess } from '$lib/private-details';
import { getApplicationForReview } from '$lib/server/application-review';
import { listSeatsByCommittee } from '$lib/server/seat-acceptance';

/** The conference, as far as the panel needs it. */
type PanelConference = {
	id: string;
	slug: string;
	timezone: string;
};

/** The page of rows the table is drawing: their ids, in order, and the tab's whole count. */
type PanelRows = {
	rows: { id: string }[];
	total: number;
};

/**
 * Reads the panel for this page of the list, or null when there is nothing to
 * show: a page with no rows, or an application deleted since the list was read.
 *
 * `requestedId` is the `?application=` in the address. `now` is when "today"
 * is for the applicant's age.
 *
 * `detailsAccess` is what this conference's permissions grant the reader of
 * the private details. The views behind `getApplicationForReview` answer for
 * anybody taking part where the reader holds the permission, which may be
 * another conference altogether, so the age and the diet keep only what the
 * reader holds here.
 */
export async function loadReviewPanel(
	supabase: SupabaseClient,
	conference: PanelConference,
	query: ApplicationListQuery,
	page: PanelRows,
	requestedId: string | null,
	now: Date,
	detailsAccess: PrivateDetailsAccess
): Promise<ReviewPanel | null> {
	const rowIds = page.rows.map((row) => row.id);
	const index = pickPanelIndex(rowIds, requestedId);

	if (index === null) return null;

	const applicationId = rowIds[index];
	const review = await getApplicationForReview(supabase, conference.id, applicationId);

	if (review === null) return null;

	const { application } = review;
	const isOpen = canAllocate(application.status);

	// Only an application that can still be accepted needs the free seats, so a
	// decided one does not read every seat of the conference.
	const seatGroups = isOpen
		? await listSeatsByCommittee(supabase, conference.id, application.committeePreferences)
		: [];

	const details =
		review.details === null ? null : withheldPrivateDetails(review.details, detailsAccess);
	const age = ageInYears(details?.dateOfBirth ?? null, now);
	const position = panelPosition(query.page, index);
	const neighbours = panelNeighbours(rowIds, index);

	return {
		applicationId,
		applicantName: review.profile.fullName,
		metaLine: panelMetaLine(application.submittedAt, conference.timezone, position, page.total),
		facts: panelFacts({ ...review, details }, age),
		motivation: application.motivation,
		internalNote: application.internalNote ?? '',
		canAccept: isOpen,
		canWaitlist: canWaitlist(application.status),
		canReject: canReject(application.status),
		seatOptions: seatChoiceOptions(seatGroups),
		links: reviewPanelLinks(conference.slug, query, applicationId, neighbours)
	};
}
