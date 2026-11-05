/**
 * A delegation's members working on their position papers together (T147):
 * the rows of the delegation's "Position papers" view, and the lines the
 * writing page shows about who the draft is shared with and who edited it
 * last.
 *
 * Nothing here touches the database or the page, so it can be tested without
 * either. The database half is `$lib/server/delegation-papers.ts`.
 */

import type { ResolvedPathname } from '$app/types';
import { canUploadPositionPaper, type PaperDeadline, type ReviewStatus } from '$lib/documents';
import type { MarginWriter } from '$lib/paper-margin';
import { paperWriteView, type PaperWriteView } from '$lib/paper-writing';
import { firstName } from '$lib/profiles';
import { savedAgoText } from '$lib/session-notes';
import { statusBadgeTone, statusLabel, type BadgeTone } from '$lib/status';
import { delegationPaperUrl, positionPaperWayUrl } from '$lib/urls';

/** One member's paper for one seat, as the "Position papers" view lists it. */
export type DelegationPaper = {
	seatId: string;
	seatName: string;
	/** The seat's two-letter country code, for its flag, or `null` for a seat that is no country. */
	countryCode: string | null;
	committeeName: string;
	committeeSlug: string;
	/** The member sitting in the seat, whose paper this is and who alone submits it. */
	holderId: string;
	holderName: string;
	/** How the paper was handed in, or `null` when it has not been. */
	paperKind: 'written' | 'uploaded' | null;
	/** The chair's review of the paper handed in, or `null` when there is none. */
	reviewStatus: ReviewStatus | null;
	/** The chair's comment on it, shown beside the editor. The paper's own text never comes along. */
	reviewComment: string | null;
	/** Who saved the draft last, and when, or `null` when there is no draft. */
	lastEditedById: string | null;
	lastEditedByName: string | null;
	lastEditedAt: string | null;
	/** Words in the draft, or else in the written paper handed in; 0 for an uploaded PDF. */
	wordCount: number;
};

/** Who a draft is shared with: the reader's delegation and everybody in it. */
export type PaperSharing = {
	delegationName: string;
	/** Every member and head of the delegation, the reader too. */
	members: { id: string; name: string }[];
};

/** The words and colour of a paper's status pill. */
export type PaperPill = { label: string; tone: BadgeTone };

/**
 * The status pill of one row: the chair's review once a paper is handed in
 * ("Awaiting review", "Approved", "Changes requested", the words the chair's
 * badges use), else "Draft" while somebody is writing one, else "Not started".
 */
export function delegationPaperPill(paper: DelegationPaper): PaperPill {
	if (paper.reviewStatus !== null) {
		return {
			label: statusLabel('review_status', paper.reviewStatus),
			tone: statusBadgeTone('review_status', paper.reviewStatus)
		};
	}

	if (paper.lastEditedAt !== null) return { label: 'Draft', tone: 'brand' };

	return { label: 'Not started', tone: 'neutral' };
}

/**
 * Where a row's "Open" goes. The reader's own paper opens on their own
 * position paper page, where they may submit it; a fellow member's opens on
 * the delegation's copy of the writing page, where they may only edit it.
 */
export function delegationPaperHref(
	paper: DelegationPaper,
	delegationId: string,
	conferenceSlug: string,
	readerId: string
): ResolvedPathname {
	if (paper.holderId === readerId) {
		return positionPaperWayUrl(conferenceSlug, paper.committeeSlug, 'write');
	}

	return delegationPaperUrl(delegationId, paper.seatId);
}

/**
 * The line above the editor saying who else may edit the draft: "Shared with
 * St Aidan's Academy: Rachel Morgan, Aisha Bello". `null` when the reader is
 * the only one in the delegation, or in none, and so writes alone.
 */
export function sharedWithText(sharing: PaperSharing | null, readerId: string): string | null {
	if (sharing === null) return null;

	const others = sharing.members.filter((member) => member.id !== readerId);

	if (others.length === 0) return null;

	const names = others.map((member) => member.name).join(', ');

	return `Shared with ${sharing.delegationName}: ${names}`;
}

/**
 * The delegation's members as the margin of a position paper names them, for
 * the suggestions they make: everybody who may edit the draft counts as one
 * of its writers (`docs/committee-papers.md`, decision 15). They sit in
 * different committees, so no seat is named.
 */
export function delegationWriters(sharing: PaperSharing | null): MarginWriter[] {
	return (sharing?.members ?? []).map((member) => ({
		holderId: member.id,
		holderName: member.name,
		seatName: null
	}));
}

/**
 * "Last edited by Rachel Morgan, 5 min ago", or "by you". Without a name, as
 * when the account is gone, it is "Last edited 5 min ago". `null` without a
 * draft, because nothing has been edited yet. `at` is in milliseconds since
 * 1970, as `Date.now()` gives it.
 */
export function lastEditedText(
	editor: { id: string | null; name: string | null } | null,
	at: number | null,
	readerId: string,
	now: number
): string | null {
	if (editor === null || at === null) return null;

	const ago = savedAgoText(at, now);

	if (editor.id === readerId) return `Last edited by you, ${ago}`;
	if (editor.name === null) return `Last edited ${ago}`;

	return `Last edited by ${editor.name}, ${ago}`;
}

/** The same line for one row of the "Position papers" view. */
export function paperLastEditedText(
	paper: DelegationPaper,
	readerId: string,
	now: number
): string | null {
	if (paper.lastEditedAt === null) return null;

	const editor = { id: paper.lastEditedById, name: paper.lastEditedByName };

	return lastEditedText(editor, Date.parse(paper.lastEditedAt), readerId, now);
}

/**
 * What a fellow member's paper page shows (T147), and why it is closed when
 * it is. The same three answers as the delegate's own page: the editor, the
 * paper as handed in, or closed. A handed-in written paper opens in the
 * editor again only once its delegate has started a new draft of it, because
 * the rest of the delegation cannot read what was handed in.
 */
export function sharedPaperView(
	paper: DelegationPaper,
	hasDraft: boolean,
	deadline: PaperDeadline,
	now: Date
): { view: PaperWriteView; closedReason: string | null } {
	const deadlineReason = canUploadPositionPaper(deadline, paper.reviewStatus, now);
	// `canUploadPositionPaper` speaks to the delegate ("Your paper was approved").
	const closedReason =
		paper.reviewStatus === 'approved'
			? `${firstName(paper.holderName)}'s paper was approved. It can no longer be changed.`
			: deadlineReason;
	const view = paperWriteView({
		isWritten: paper.paperKind === 'written',
		isEditing: hasDraft,
		closedReason
	});

	return { view, closedReason };
}
