/**
 * The documents people upload to a conference: what a file has to pass before
 * it is accepted, where each kind is kept in the bucket, who a file is for, and
 * the rules for when a delegate may upload or remove their position paper.
 *
 * Both the server and the browser import this file, so it must not contain
 * anything server-only. The uploading, the signed download addresses and the
 * `documents` rows themselves live in `$lib/server/documents.ts`.
 */

import { formatDayAndTime } from '$lib/dates';

/** 20 MB, the `documents` bucket's own limit. `02-architecture/storage.md`. */
export const DOCUMENT_MAX_SIZE_MB = 20;

/** That same limit in bytes, which is the unit a file measures itself in. */
const DOCUMENT_MAX_SIZE_BYTES = DOCUMENT_MAX_SIZE_MB * 1024 * 1024;

/**
 * What the file picker offers for a background guide or a position paper.
 *
 * Only one type is on the list, so this is both what the HTML `accept`
 * attribute is given and the type `pdfFileProblem` below insists on. One
 * constant for the two means the picker cannot offer a file the check refuses.
 */
export const PDF_ACCEPTED_TYPES = 'application/pdf';

/** Who a background guide is for. */
export type GuideAudience = 'everyone' | 'delegates';

/**
 * The two choices the background guide panel offers, in order.
 *
 * Each one carries a sentence as well as a label, because "Delegates only" does
 * not say by itself whether an applicant who has not been given a seat yet
 * counts as one.
 */
export const GUIDE_AUDIENCE_OPTIONS: {
	value: GuideAudience;
	label: string;
	description: string;
}[] = [
	{
		value: 'everyone',
		label: 'Everyone',
		description: 'Anyone who can see the committee page can download it.'
	},
	{
		value: 'delegates',
		label: 'Delegates only',
		description: 'Only people taking part in this conference can download it.'
	}
];

/**
 * Is this one of the two audiences a background guide may have? Anybody can post
 * anything to a form action, so the word it sends is checked before it is used.
 * It is written out rather than looked up in a list so that TypeScript can
 * narrow the text to a `GuideAudience`, exactly as `isSeatListName` in
 * `$lib/seat-lists.ts` does.
 */
export function isGuideAudience(text: string): text is GuideAudience {
	return text === 'everyone' || text === 'delegates';
}

/**
 * What is wrong with a PDF somebody chose, or `null` when nothing is.
 *
 * It is given the two facts it needs rather than a whole `File`, so that a test
 * can describe a thirty megabyte file without building one. The type is looked
 * at before the size, so that a thirty megabyte Word document is told it is the
 * wrong kind of file rather than too big a one, the way
 * `validateConferenceImage` in `$lib/conference-details.ts` does.
 */
export function pdfFileProblem(file: { type: string; size: number }): string | null {
	if (file.type !== PDF_ACCEPTED_TYPES) {
		return 'Please upload a PDF.';
	}

	if (file.size > DOCUMENT_MAX_SIZE_BYTES) {
		return `The file must be under ${DOCUMENT_MAX_SIZE_MB} MB.`;
	}

	return null;
}

/**
 * Where a committee's background guide goes in the `documents` bucket:
 * `<conference id>/background-guides/<committee id>-<uuid>.pdf`, the path
 * `02-architecture/storage.md` lays down. The name of the bucket is not part of
 * it, because the upload call names the bucket separately.
 *
 * The server builds the path and the browser never does, because the storage
 * policies decide who may write a file by reading the folders of its path. The
 * uuid in the name means a replaced guide is always at a new address, so a
 * browser that cached the old one cannot show it in the new one's place.
 *
 * It sits here rather than in `$lib/server` because it is a plain piece of text
 * building with no Supabase in it, and this is where the rest of what the app
 * knows about documents lives.
 */
export function backgroundGuidePath(conferenceId: string, committeeId: string): string {
	return `${conferenceId}/background-guides/${committeeId}-${crypto.randomUUID()}.pdf`;
}

/** How many bytes are in a kilobyte, and how many in a megabyte. */
const BYTES_PER_KILOBYTE = 1024;
const BYTES_PER_MEGABYTE = BYTES_PER_KILOBYTE * 1024;

/**
 * "1.2 MB", "812 KB", for the line beside a file's name.
 *
 * Kilobytes are given as whole numbers, because nobody reading a file list
 * cares about a fraction of one. Megabytes keep one decimal place, which is the
 * difference between a guide that downloads at once and one that takes a moment.
 */
export function formatFileSize(bytes: number): string {
	if (bytes < BYTES_PER_KILOBYTE) {
		return `${bytes} bytes`;
	}

	if (bytes < BYTES_PER_MEGABYTE) {
		const kilobytes = Math.round(bytes / BYTES_PER_KILOBYTE);

		return `${kilobytes} KB`;
	}

	const megabytes = bytes / BYTES_PER_MEGABYTE;

	return `${megabytes.toFixed(1)} MB`;
}

/** One committee's background guide, as the editor's panel shows it. */
export type BackgroundGuide = {
	id: string;
	title: string;
	/** The name the file had on the uploader's computer. */
	fileName: string;
	fileSizeBytes: number;
	audience: GuideAudience;
	/**
	 * A one-minute signed address for downloading it, or `null` when Storage
	 * could not make one.
	 */
	downloadUrl: string | null;
};

/** One committee on the organiser's background guides tab, with its guide or without one. */
export type CommitteeGuide = {
	committeeId: string;
	/** The abbreviation when there is one, otherwise the committee's name. */
	committeeHeading: string;
	/** `null` while nobody has uploaded a guide for this committee. */
	guide: BackgroundGuide | null;
};

/** Who a resource is for: the three audiences the `documents` select rule answers for. */
export type DocumentAudience = 'everyone' | 'delegates' | 'staff';

/** The choices the resource form offers, in order, with the word each row shows. */
export const DOCUMENT_AUDIENCE_OPTIONS: { value: DocumentAudience; label: string }[] = [
	{ value: 'everyone', label: 'Everyone' },
	{ value: 'delegates', label: 'Delegates' },
	{ value: 'staff', label: 'Staff' }
];

/**
 * Is this one of the three audiences a resource may have? Written out rather
 * than looked up so TypeScript can narrow the text, like `isGuideAudience`.
 */
export function isDocumentAudience(text: string): text is DocumentAudience {
	return text === 'everyone' || text === 'delegates' || text === 'staff';
}

/**
 * The word for an audience in a list, such as "Delegates". Anything the three
 * do not cover reads as "Delegates", the narrowest reading a participant sees.
 */
export function documentAudienceLabel(audience: string): string {
	const option = DOCUMENT_AUDIENCE_OPTIONS.find((choice) => choice.value === audience);

	return option?.label ?? 'Delegates';
}

/**
 * What the resource file picker offers: a PDF, a picture or a Word document.
 * This is the `accept` attribute, so it may use `image/*`; the server checks
 * against `RESOURCE_FILE_EXTENSIONS` below, which is exact.
 */
export const RESOURCE_ACCEPTED_TYPES = '.pdf,image/*,.docx';

/**
 * Every type a resource may be, with the extension its file is stored under.
 *
 * `02-architecture/storage.md` writes `image/*` out as the same three pictures
 * the `public-media` bucket takes, because the bucket holds a list of exact
 * types. The keys here are that list, so the check and the bucket agree.
 */
const RESOURCE_FILE_EXTENSIONS: Record<string, string> = {
	'application/pdf': 'pdf',
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
};

/** The three kinds of document somebody can upload in MVP. */
export type UploadKind = 'position_paper' | 'background_guide' | 'resource';

/** What each kind of upload says when it is refused, in the words its own page uses. */
type FileMessages = {
	noFile: string;
	wrongType: string;
	tooLarge: string;
};

/**
 * The messages for each kind. The delegate's upload page and the organiser's
 * documents page were written separately and word the same refusals
 * differently; each page keeps its own words.
 */
const FILE_MESSAGES: Record<UploadKind, FileMessages> = {
	position_paper: {
		noFile: 'Please choose a file.',
		wrongType: 'Please upload a PDF.',
		tooLarge: `The file must be smaller than ${DOCUMENT_MAX_SIZE_MB} MB.`
	},
	background_guide: {
		noFile: 'Choose a file to upload.',
		wrongType: 'Background guides must be a PDF.',
		tooLarge: `The file is larger than ${DOCUMENT_MAX_SIZE_MB} MB.`
	},
	resource: {
		noFile: 'Choose a file to upload.',
		wrongType: 'Resources can be a PDF, an image or a Word document.',
		tooLarge: `The file is larger than ${DOCUMENT_MAX_SIZE_MB} MB.`
	}
};

/** Whether a file of this type may be uploaded as this kind of document. */
function isAllowedType(type: string, kind: UploadKind): boolean {
	if (kind === 'resource') {
		return type in RESOURCE_FILE_EXTENSIONS;
	}

	return type === PDF_ACCEPTED_TYPES;
}

/**
 * What is wrong with a file somebody chose for this kind of document, or
 * `null` when nothing is.
 *
 * A file box left empty still sends a `File`, with no name and no bytes, so a
 * size of zero is "no file chosen". The type is looked at before the size, so
 * a thirty megabyte spreadsheet is told it is the wrong kind of file, the way
 * `pdfFileProblem` above does.
 */
export function isAllowedFile(
	file: { type: string; size: number },
	kind: UploadKind
): string | null {
	const messages = FILE_MESSAGES[kind];

	if (file.size === 0) {
		return messages.noFile;
	}

	if (!isAllowedType(file.type, kind)) {
		return messages.wrongType;
	}

	if (file.size > DOCUMENT_MAX_SIZE_BYTES) {
		return messages.tooLarge;
	}

	return null;
}

/**
 * Where a resource goes in the `documents` bucket:
 * `<conference id>/resources/<uuid>.<extension>`, from `02-architecture/storage.md`.
 * The extension comes from the file's type, which `isAllowedFile` has already
 * checked, so an unknown type never reaches here; it falls back to `bin` anyway.
 */
export function resourcePath(conferenceId: string, mimeType: string): string {
	const extension = RESOURCE_FILE_EXTENSIONS[mimeType] ?? 'bin';

	return `${conferenceId}/resources/${crypto.randomUUID()}.${extension}`;
}

/**
 * Where a position paper goes: `<conference id>/position-papers/<seat id>-<uuid>.pdf`.
 * The storage insert policy reads the seat id out of this name to decide
 * whether the delegate uploading it sits in that seat.
 */
export function positionPaperPath(conferenceId: string, seatId: string): string {
	return `${conferenceId}/position-papers/${seatId}-${crypto.randomUUID()}.pdf`;
}

/** The review a position paper can have, the database's `review_status`. */
export type ReviewStatus = 'submitted' | 'approved' | 'changes_requested';

/** Where a seat stands on its paper: no paper yet, or the paper's review. */
export type PaperStatus = 'missing' | ReviewStatus;

/** The four statuses in the order the organiser's overview counts them. */
export const PAPER_STATUSES: PaperStatus[] = [
	'missing',
	'submitted',
	'approved',
	'changes_requested'
];

/** Where a seat stands, given its paper's review status, or `null` when it has no paper. */
export function paperStatus(reviewStatus: ReviewStatus | null): PaperStatus {
	return reviewStatus ?? 'missing';
}

/**
 * The words for a paper status: "Missing", "Awaiting review", "Approved",
 * "Changes requested". The last three are the same words `statusLabel` in
 * `$lib/status.ts` gives `review_status`, which the badges use.
 */
export function paperStatusLabel(status: PaperStatus): string {
	if (status === 'missing') {
		return 'Missing';
	}

	if (status === 'submitted') {
		return 'Awaiting review';
	}

	if (status === 'approved') {
		return 'Approved';
	}

	return 'Changes requested';
}

/** Is this one of the three review statuses? Checks a word read from the database or a URL. */
export function isReviewStatus(text: string): text is ReviewStatus {
	return text === 'submitted' || text === 'approved' || text === 'changes_requested';
}

/** Is this one of the four paper statuses? The organiser's `?paper=` filter is checked with it. */
export function isPaperStatus(text: string): text is PaperStatus {
	return text === 'missing' || isReviewStatus(text);
}

/** What the paper rules need to know about the conference. */
export type PaperDeadline = {
	/** An ISO timestamp, or `null` when the conference set no deadline. */
	positionPaperDeadline: string | null;
	timezone: string;
};

/**
 * Has the position paper deadline passed? A conference with no deadline never
 * closes. The deadline minute itself still counts as open, the `now() <=
 * deadline` the database's policies use.
 */
export function isPastPaperDeadline(conference: PaperDeadline, now: Date): boolean {
	if (conference.positionPaperDeadline === null) {
		return false;
	}

	return now.getTime() > new Date(conference.positionPaperDeadline).getTime();
}

/**
 * Why the delegate may not upload their paper right now, or `null` when they
 * may. `06-features/documents.md`:
 *
 * - an approved paper is finished and cannot be changed;
 * - after the deadline the upload is closed, unless the chair asked for
 *   changes, which reopens it for this seat until the chair approves.
 *
 * The seat itself is not asked about: a delegate without one never reaches
 * the page, which answers 404 first.
 */
export function canUploadPositionPaper(
	conference: PaperDeadline,
	reviewStatus: ReviewStatus | null,
	now: Date
): string | null {
	if (reviewStatus === 'approved') {
		return 'Your paper was approved. It can no longer be changed.';
	}

	if (reviewStatus === 'changes_requested') {
		return null;
	}

	if (isPastPaperDeadline(conference, now) && conference.positionPaperDeadline !== null) {
		const deadline = formatDayAndTime(conference.positionPaperDeadline, conference.timezone);

		return `The deadline was ${deadline}. Ask your chair if you still need to upload.`;
	}

	return null;
}

/**
 * Whether the delegate may take their paper back: only while it waits for
 * review and before the deadline. The database's delete policy says the same,
 * so hiding the button and refusing the delete agree.
 */
export function canRemovePositionPaper(
	conference: PaperDeadline,
	reviewStatus: ReviewStatus | null,
	now: Date
): boolean {
	return reviewStatus === 'submitted' && !isPastPaperDeadline(conference, now);
}

/**
 * A delegate's own position paper, as the position paper page shows it.
 *
 * This lives here rather than in `$lib/server/position-papers.ts`, because a
 * `.svelte` file may never import from `$lib/server` (see CLAUDE.md), and
 * `PaperStatusCard` needs this shape to type its own `document` prop. The
 * server module imports it from here instead of declaring its own copy.
 */
export type PositionPaperFile = {
	id: string;
	/** The uploaded file's name, or `null` for a paper written on MUNMeet (T145). */
	fileName: string | null;
	/** The uploaded file's size, or `null` for a written paper. */
	fileSizeBytes: number | null;
	reviewStatus: ReviewStatus | null;
	reviewComment: string | null;
	/**
	 * When this file was put in place. `updated_at` rather than `created_at`,
	 * because a re-upload writes over the row a seat already had: the date the
	 * page should show is the one for the file it is about to offer for
	 * download, not the date of the seat's very first paper.
	 */
	uploadedAt: string;
	/**
	 * A one-minute signed address, or `null` when Storage would not make one or
	 * the paper is written rather than uploaded.
	 */
	downloadUrl: string | null;
	/** A written paper as it was submitted, in Markdown, or `null` for an uploaded file. */
	bodyMarkdown: string | null;
	/** The same written paper as HTML from `renderMarkdown`, or `null` for an uploaded file. */
	bodyHtml: string | null;
};

/** One conference-level resource, as the organiser's list and the public page show it. */
export type ResourceFile = {
	id: string;
	title: string;
	/** The name the file had on the uploader's computer. */
	fileName: string;
	fileSizeBytes: number;
	mimeType: string;
	audience: DocumentAudience;
	/** When it was uploaded, an ISO timestamp. */
	createdAt: string;
	/**
	 * Who uploaded it, or `null` when the reader may not read their profile,
	 * which is the case for a visitor who is not signed in.
	 */
	uploaderName: string | null;
	/** A one-minute signed address, or `null` when Storage would not make one. */
	downloadUrl: string | null;
};
