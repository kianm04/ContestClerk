/**
 * The organiser's documents page, `/manage/[slug]/documents`, without any
 * Svelte or any database: which tab is open, what its forms may send, and how
 * the position papers of a committee are counted.
 *
 * Both the server and the browser import this file, so nothing here may be
 * server-only. The rules it follows are in `specs/05-pages/organiser/documents.md`.
 */

import type { Tab } from '$lib/components/Tabs.svelte';
import { formatDayAndMonth } from '$lib/dates';
import {
	isAllowedFile,
	PAPER_STATUSES,
	type PaperStatus,
	type ResourceFile,
	type ReviewStatus
} from '$lib/documents';
import { statusBadgeTone, type BadgeTone } from '$lib/status';
import { manageDocumentsUrl } from '$lib/urls';

/** The three tabs of the page, in the order they are drawn. */
export type DocumentsTab = 'resources' | 'guides' | 'papers';

/** The longest title a resource may have, which the title box also stops typing at. */
export const RESOURCE_TITLE_MAX_LENGTH = 120;

/** The longest comment a reviewer may send back with "Request changes". */
export const REVIEW_COMMENT_MAX_LENGTH = 1000;

/**
 * The tab `?tab=` asks for. Anything else, or nothing, is the resources tab,
 * so a mistyped address still shows the page.
 */
export function parseDocumentsTab(text: string | null): DocumentsTab {
	if (text === 'guides' || text === 'papers') {
		return text;
	}

	return 'resources';
}

/** Everything the address of the documents page says about what to show. */
export type DocumentsPageView = {
	tab: DocumentsTab;
	/** `?committee=`: the committee whose seats the papers tab lists. */
	committeeId: string | null;
	/** `?paper=`: only the seats whose paper has this status. */
	paper: string | null;
	/** `?review=`: the paper whose "Request changes" form is open. */
	reviewDocumentId: string | null;
};

/**
 * Read the page's address. Only the papers tab has a committee, a filter and a
 * review form, so on the other two tabs those are dropped.
 */
export function readDocumentsView(searchParams: URLSearchParams): DocumentsPageView {
	const tab = parseDocumentsTab(searchParams.get('tab'));

	if (tab !== 'papers') {
		return { tab, committeeId: null, paper: null, reviewDocumentId: null };
	}

	return {
		tab,
		committeeId: searchParams.get('committee') || null,
		paper: searchParams.get('paper') || null,
		reviewDocumentId: searchParams.get('review') || null
	};
}

/** How many seats of one committee are at each paper status. */
export type PaperStatusCounts = Record<PaperStatus, number>;

/**
 * Count a list of statuses, one per filled seat. Every status starts at 0, so
 * a committee with nothing approved still has an `approved` of 0 to show.
 */
export function countPaperStatuses(statuses: PaperStatus[]): PaperStatusCounts {
	const counts: PaperStatusCounts = {
		missing: 0,
		submitted: 0,
		approved: 0,
		changes_requested: 0
	};

	for (const status of statuses) {
		counts[status] += 1;
	}

	return counts;
}

/** One committee's line in the position papers table. */
export type PaperCommitteeRow = {
	committeeId: string;
	/** The committee's address part, which a written paper's reading page needs (T146). */
	committeeSlug: string;
	/** The abbreviation when there is one, otherwise the committee's name. */
	committeeHeading: string;
	/** Seats with a delegate in them. The four counts add up to this. */
	filledSeatCount: number;
	counts: PaperStatusCounts;
};

/** How many filled seats have a paper at all, whatever its review says. */
export function uploadedPaperCount(row: PaperCommitteeRow): number {
	return row.filledSeatCount - row.counts.missing;
}

/** One filled seat of the chosen committee, with the paper for it when there is one. */
export type PaperSeatRow = {
	seatId: string;
	seatName: string;
	countryCode: string | null;
	/** `null` when the organiser may not read the delegate's profile. */
	delegateName: string | null;
	delegateAvatarPath: string | null;
	status: PaperStatus;
	/** `null` while the delegate has uploaded nothing. */
	paper: {
		id: string;
		/** The uploaded file's name, or `null` for a paper written on MUNMeet (T145). */
		fileName: string | null;
		reviewStatus: ReviewStatus;
		/** What the reviewer wrote to the delegate, or `null`. */
		reviewComment: string | null;
		/** When it was last reviewed, an ISO timestamp, or `null` before any review. */
		reviewedAt: string | null;
		/** When the row last changed, which for a paper awaiting review is its upload. */
		updatedAt: string;
		/** A one-minute signed address, or `null` when Storage would not make one or there is no file. */
		downloadUrl: string | null;
		/** Whether it was written on MUNMeet (T145) rather than uploaded, so it has a reading page. */
		isWritten: boolean;
	} | null;
};

/**
 * The seats `?paper=` asks for, or all of them when it names no status.
 * An unknown value shows everything rather than an empty list.
 */
export function filterPaperSeats(
	seats: PaperSeatRow[],
	paperFilter: string | null
): PaperSeatRow[] {
	const isKnownStatus = PAPER_STATUSES.some((status) => status === paperFilter);

	if (!isKnownStatus) {
		return seats;
	}

	return seats.filter((seat) => seat.status === paperFilter);
}

/**
 * The colour of a paper's badge. The three reviewed states take the colours
 * `$lib/status` gives `review_status` everywhere else; a missing paper has no
 * review status, so it is grey.
 */
export function paperStatusTone(status: PaperStatus): BadgeTone {
	if (status === 'missing') {
		return 'neutral';
	}

	return statusBadgeTone('review_status', status);
}

/** What the resource upload form sends, as the action reads it. */
export type ResourceFormValues = {
	title: string;
	audience: string;
};

/** A message under each field of the resource form that needs one. */
export type ResourceFormErrors = {
	title?: string;
	file?: string;
	audience?: string;
};

/**
 * Check the resource form before anything is uploaded. `file` is `null` when
 * the file box was left empty.
 *
 * The file is checked here, on the server, because the browser's `accept` is
 * only a hint and a request made by hand ignores it.
 */
export function validateResourceForm(
	values: ResourceFormValues,
	file: { type: string; size: number } | null,
	isKnownAudience: boolean
): ResourceFormErrors {
	const errors: ResourceFormErrors = {};

	if (values.title === '') {
		errors.title = 'Please give the file a title.';
	} else if (values.title.length > RESOURCE_TITLE_MAX_LENGTH) {
		errors.title = `Please keep the title under ${RESOURCE_TITLE_MAX_LENGTH} characters.`;
	}

	const fileProblem = isAllowedFile(file ?? { type: '', size: 0 }, 'resource');

	if (fileProblem) {
		errors.file = fileProblem;
	}

	if (!isKnownAudience) {
		errors.audience = 'Please say who the file is for.';
	}

	return errors;
}

/** Whether the resource form has any message to show. */
export function hasResourceFormErrors(errors: ResourceFormErrors): boolean {
	return Object.keys(errors).length > 0;
}

/**
 * The problem with a "Request changes" comment, or `null` when it may be sent.
 * The comment is what tells the delegate what to fix, so it cannot be empty.
 */
export function reviewCommentProblem(comment: string): string | null {
	if (comment === '') {
		return 'Tell the delegate what to change.';
	}

	if (comment.length > REVIEW_COMMENT_MAX_LENGTH) {
		return `Please keep the comment under ${REVIEW_COMMENT_MAX_LENGTH} characters.`;
	}

	return null;
}

/** "Approved." for one paper and "5 papers approved." for several, as the flash says it. */
export function approvedMessage(approvedCount: number): string {
	if (approvedCount === 1) {
		return 'Approved.';
	}

	return `${approvedCount} papers approved.`;
}

/** What the three tab labels count. */
export type DocumentsTabCounts = {
	resourceCount: number;
	guideCount: number;
	committeeCount: number;
	uploadedPaperCount: number;
	filledSeatCount: number;
};

/**
 * The three tabs, each with what it counts beside its label: "Shared files 4",
 * "Background guides 6 of 8", "Position papers 94 of 132". Two of the counts
 * are "this many of that many", so they are given as words rather than a number.
 */
export function documentsTabs(
	slug: string,
	activeTab: DocumentsTab,
	counts: DocumentsTabCounts
): Tab[] {
	return [
		{
			label: 'Shared files',
			href: manageDocumentsUrl(slug),
			isActive: activeTab === 'resources',
			count: counts.resourceCount
		},
		{
			label: 'Background guides',
			href: manageDocumentsUrl(slug, { tab: 'guides' }),
			isActive: activeTab === 'guides',
			count: `${counts.guideCount} of ${counts.committeeCount}`
		},
		{
			label: 'Position papers',
			href: manageDocumentsUrl(slug, { tab: 'papers' }),
			isActive: activeTab === 'papers',
			count: `${counts.uploadedPaperCount} of ${counts.filledSeatCount}`
		}
	];
}

/** Add up the papers table for the tab label: papers uploaded, and seats filled. */
export function totalPaperCounts(rows: PaperCommitteeRow[]): {
	uploadedPaperCount: number;
	filledSeatCount: number;
} {
	let uploaded = 0;
	let filled = 0;

	for (const row of rows) {
		uploaded += uploadedPaperCount(row);
		filled += row.filledSeatCount;
	}

	return { uploadedPaperCount: uploaded, filledSeatCount: filled };
}

/**
 * The "Added" cell of a shared file: who uploaded it and on which day, in the
 * conference's `timezone`, such as "Eleanor Whitfield · 1 Oct". Only the day
 * when the uploader's name could not be read.
 */
export function resourceAddedText(
	resource: Pick<ResourceFile, 'uploaderName' | 'createdAt'>,
	timezone: string
): string {
	const day = formatDayAndMonth(resource.createdAt, timezone);

	if (resource.uploaderName === null) {
		return day;
	}

	return `${resource.uploaderName} · ${day}`;
}
