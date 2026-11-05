/**
 * What the opening band says above the GSL until the first speaker is called
 * (`05-pages/chair/committee-room.md`, "Opening band", S5): its roll call row
 * and its agenda row, each ticked off once done, and which of its buttons is
 * the screen's one primary.
 *
 * Plain functions with no Svelte in them, so they can be read and tested on
 * their own.
 */

import type { ResolvedPathname } from '$app/types';
import type { FramePresence } from '$lib/chair-frame';
import type { ChairPage } from '$lib/live-mode';
import { chairFrameAction, chairRollCallAction, chairRollCallFromUrl } from '$lib/urls';

/** The band's roll call row, once a roll call exists: its counts. */
export type OpeningRollCall = {
	presentCount: number;
	availableSeats: number;
	hasQuorum: boolean;
};

/** Where the band's forms post and its links lead, from the page drawing it. */
export type OpeningBandLinks = {
	/** The roll call view's `markAllPresent`; the form names the page in `fromView` (R2). */
	markAllPresentAction: string;
	/** The roll call view, opened from this page: "Take it seat by seat" and "Edit". */
	rollCallHref: ResolvedPathname;
	/** The live room's `setAgenda`, naming this page so the chair stays on it. */
	setAgendaAction: string;
};

/**
 * The roll call row once done: "6 of 6 present · quorum met", or "· no
 * quorum", in the same neutral words either way (P4).
 */
export function rollCallDoneText(rollCall: OpeningRollCall): string {
	const quorumText = rollCall.hasQuorum ? 'quorum met' : 'no quorum';

	return `${rollCall.presentCount} of ${rollCall.availableSeats} present · ${quorumText}`;
}

/**
 * The band's roll call row from the frame's presence (`framePresence`, which
 * already counts the presses on their way), or null before the session's
 * first roll call, when the row offers "Mark all present".
 */
export function openingRollCall(presence: FramePresence): OpeningRollCall | null {
	if (presence.presentCount === null) return null;

	return {
		presentCount: presence.presentCount,
		availableSeats: presence.availableSeats,
		hasQuorum: presence.hasQuorum
	};
}

/** The band's links on the chair page `page`: `chair`, or `chair/gsl`. */
export function openingBandLinks(
	conferenceSlug: string,
	committeeSlug: string,
	page: ChairPage
): OpeningBandLinks {
	return {
		markAllPresentAction: chairRollCallAction(conferenceSlug, committeeSlug, 'markAllPresent'),
		rollCallHref: chairRollCallFromUrl(conferenceSlug, committeeSlug, page),
		setAgendaAction: chairFrameAction(conferenceSlug, committeeSlug, 'setAgenda', page)
	};
}
