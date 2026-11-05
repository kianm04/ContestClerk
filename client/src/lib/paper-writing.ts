/**
 * Writing a position paper on MUNMeet instead of uploading a PDF (T145): the
 * draft's shape, the words the writing page shows, the checks on what is sent,
 * and how the page reads the server's answer to a background save.
 *
 * Nothing here touches the database or the page, so it can be tested without
 * either. The database half is `$lib/server/position-paper-drafts.ts` and
 * `submitWrittenPaper` in `$lib/server/position-papers.ts`; the saving while
 * the delegate types is `$lib/paper-draft-autosave.svelte.ts`.
 */

import type { ActionResult } from '@sveltejs/kit';
import type { Tab } from '$lib/components/Tabs.svelte';
import { NETWORK_FAILURE_MESSAGE, SERVER_FAILURE_MESSAGE } from '$lib/in-place-form.svelte';
import type { ReviewStatus } from '$lib/documents';
import { firstName } from '$lib/profiles';
import { savedAgoText } from '$lib/session-notes';
import { positionPaperWayUrl } from '$lib/urls';

/** The most characters a draft or a written paper may hold, the same as the database's checks. */
export const WRITTEN_PAPER_MAX_LENGTH = 100_000;

/** How long after the delegate's last keystroke the draft is saved. */
export const DRAFT_SAVE_DELAY_MS = 1_000;

/** The two ways to hand in a paper, chosen with `?way=` on the page's address. */
export type PaperWay = 'write' | 'upload';

/** The working draft of a written paper, as the page reads it. */
export type PaperDraft = {
	/** The draft as typed, in Markdown. */
	body: string;
	/** Moves on by one with every save; a save names the one it started from. */
	revision: number;
	/** When the draft was last saved. */
	updatedAt: string;
	/**
	 * Who saved it last (T147): the delegate, or a member of their delegation.
	 * `null` when that account is gone.
	 */
	updatedById: string | null;
	/** Their name, or `null` when it cannot be read. */
	updatedByName: string | null;
};

/**
 * The draft somebody else saved while this reader was typing, which a save
 * met instead of the one it started from. `bodyHtml` is the same text made
 * safe to draw by `renderMarkdown` on the server, for "See their version".
 */
export type TheirDraft = PaperDraft & { bodyHtml: string };

/**
 * Where the draft stands: `saved`, `waiting` (typed, about to be sent),
 * `saving`, `failed` (not saved, text kept) or `conflict` (another window
 * saved first; nothing is sent until the delegate chooses to save theirs).
 */
export type DraftSaveStatus = 'saved' | 'waiting' | 'saving' | 'failed' | 'conflict';

/** What a background save came to, read from the action's answer by `readDraftSaveOutcome`. */
export type DraftSaveOutcome =
	/** `missing` answers a live save (T148): the others' changes the page lacks, as base64. */
	| { kind: 'saved'; revision: number; missing?: string }
	| { kind: 'conflict'; revision: number; theirs: TheirDraft | null }
	/** A live save whose document is no longer the seat's draft, as after a submit (T148). */
	| { kind: 'replaced' }
	| { kind: 'failed'; message: string };

/**
 * What the "Write it here" side of the page shows: the editor, the paper as it
 * was submitted (read only), or only the reason it cannot be changed.
 */
export type PaperWriteView = 'editor' | 'submitted' | 'closed';

/**
 * "Submit for review" on a position paper, which only the delegate in the
 * seat has: the button, the question it asks first, and the action it posts.
 */
export type PaperSubmit = {
	label: string;
	confirmTitle: string;
	confirmText: string;
	formaction: string;
};

/** Every message the writing side of the page and its actions show. */
export const PAPER_WRITING_MESSAGES = {
	empty: 'Write your paper before submitting it.',
	tooLong: 'This paper is too long to save. Shorten it, or upload it as a PDF.',
	unchanged: 'Change your paper before sending it back to your chair.',
	conflict:
		'Someone saved this draft, in another window or from your delegation, since you opened it. Press "Save draft" again to keep this version.',
	liveConflict: 'This draft was changed in another window.',
	replaced: 'This paper was submitted and its draft started again. Reload the page to carry on.',
	revision: 'Reload the page and try again.',
	signedOut: 'You have been signed out. Sign in again in another tab, then try again.',
	draftSaved: 'Draft saved.',
	submitted: 'Position paper submitted.'
} as const;

/**
 * The way the page opens on: the one named in the address (`?way=`), or else
 * the way the seat's paper was handed in, so a delegate who uploaded a PDF
 * comes back to it. Writing is the default for a seat with no paper yet.
 */
export function readPaperWay(value: string | null, hasUploadedFile: boolean): PaperWay {
	if (value === 'upload' || value === 'write') return value;

	return hasUploadedFile ? 'upload' : 'write';
}

/**
 * The two tabs at the top of the page, "Write it here" and "Upload a PDF".
 * Each is a link to the same page with another `?way=`.
 */
export function paperWayTabs(conferenceSlug: string, committeeSlug: string, way: PaperWay): Tab[] {
	return [
		{
			label: 'Write it here',
			href: positionPaperWayUrl(conferenceSlug, committeeSlug, 'write'),
			isActive: way === 'write'
		},
		{
			label: 'Upload a PDF',
			href: positionPaperWayUrl(conferenceSlug, committeeSlug, 'upload'),
			isActive: way === 'upload'
		}
	];
}

/**
 * The address a form on one way of the page posts to, such as
 * `?way=upload&/upload`. SvelteKit names the action with the parameter that
 * starts with `/`, wherever it sits in the query. A bare `?/upload` would
 * replace the page's whole query, so without JavaScript the page drawn after
 * a refusal would lose `?way=` and could open the other way, hiding the
 * refusal and the text handed back. Writing keeps `edit=1` too, so a refused
 * "Edit and resubmit" comes back to the editor rather than the paper as sent.
 */
export function paperWayAction(way: PaperWay, actionName: string): string {
	const parameters = way === 'write' ? 'way=write&edit=1' : 'way=upload';

	return `?${parameters}&/${actionName}`;
}

/**
 * Text from a form with every Windows line ending made a plain `\n`, so a
 * browser's textarea and the editor store the same thing.
 */
export function normaliseLineEnds(text: string): string {
	return text.replace(/\r\n/g, '\n');
}

/**
 * How many words a Markdown text holds. A word is anything between spaces
 * that has a letter or a digit in it, so the `##`, `-` and `>` marks of the
 * Markdown itself are not counted, and `**binding**` is one word.
 */
export function countWords(markdown: string): number {
	const pieces = markdown.split(/\s+/);
	const words = pieces.filter((piece) => /[\p{L}\p{N}]/u.test(piece));

	return words.length;
}

/** "1 word" or "812 words". */
export function wordCountText(count: number): string {
	return count === 1 ? '1 word' : `${count} words`;
}

/** Why this text cannot be submitted as a paper, or `null` when it can. */
export function writtenPaperProblem(body: string): string | null {
	if (body.trim() === '') return PAPER_WRITING_MESSAGES.empty;
	if (body.length > WRITTEN_PAPER_MAX_LENGTH) return PAPER_WRITING_MESSAGES.tooLong;

	return null;
}

/**
 * Whether sending this text would hand the chair back the very paper they
 * asked to have changed. The database refuses that too, because only a new
 * version may put a paper back in the queue.
 */
export function isUnchangedResubmission(
	submittedBody: string | null,
	reviewStatus: ReviewStatus | null,
	body: string
): boolean {
	return reviewStatus === 'changes_requested' && submittedBody === body;
}

/**
 * What the "Write it here" side shows. A submitted written paper is shown read
 * only unless the delegate chose "Edit and resubmit", and always once it can
 * no longer change (`closedReason`), so an approved paper stays readable.
 */
export function paperWriteView(options: {
	isWritten: boolean;
	isEditing: boolean;
	closedReason: string | null;
}): PaperWriteView {
	if (options.isWritten && (!options.isEditing || options.closedReason !== null)) {
		return 'submitted';
	}

	if (options.closedReason !== null) return 'closed';

	return 'editor';
}

/** What the writing form starts from: the text in the editor, and the draft revision it saves over. */
export type WriterStart = { markdown: string; revision: number };

/**
 * Where the editor starts. Text a refused save or submit handed back comes
 * first, so nothing typed is lost without JavaScript; then the draft; then,
 * for "Edit and resubmit", the paper as it was submitted. A save that met
 * another window's draft hands back that draft's revision, so pressing "Save
 * draft" again keeps this version.
 */
export function writerStart(options: {
	draft: PaperDraft | null;
	submittedBody: string | null;
	returnedText: string | null;
	conflictRevision: number | null;
}): WriterStart {
	const markdown = options.returnedText ?? options.draft?.body ?? options.submittedBody ?? '';
	const revision = options.conflictRevision ?? options.draft?.revision ?? 0;

	return { markdown, revision };
}

/**
 * The status line beside the word count: "Saving…" while the draft waits to
 * be sent or is on its way, "Saved 5s ago" once stored, "Not saved" when a
 * save failed or met another window's, and nothing for a draft never saved.
 */
export function draftSaveStatusText(
	status: DraftSaveStatus,
	savedAt: number | null,
	now: number
): string {
	if (status === 'waiting' || status === 'saving') return 'Saving…';
	if (status === 'failed' || status === 'conflict') return 'Not saved';
	if (savedAt === null) return '';

	return `Saved ${savedAgoText(savedAt, now)}`;
}

/**
 * The heading of the clash notice (T147): "Rachel changed this draft." when a
 * fellow member of the delegation saved first, "You changed this draft in
 * another window." when it was the reader's own other tab, and "Somebody
 * else changed this draft." when the account behind it is gone.
 */
export function draftChangedByText(theirs: PaperDraft, readerId: string): string {
	if (theirs.updatedById === readerId) return 'You changed this draft in another window.';
	if (theirs.updatedByName === null) return 'Somebody else changed this draft.';

	return `${firstName(theirs.updatedByName)} changed this draft.`;
}

/** What a failed answer's flash said, when it had one. */
function flashMessage(data: Record<string, unknown> | undefined): string | null {
	const flash = data?.flash;

	if (typeof flash !== 'object' || flash === null || !('message' in flash)) return null;

	return typeof flash.message === 'string' ? flash.message : null;
}

/**
 * What a background save came to, from the `saveDraft` action's answer: the
 * new revision, or the revision another window saved first, or for a live
 * save the changes the page lacks (T148). A redirect only
 * happens when the delegate's sign-in has run out.
 */
export function readDraftSaveOutcome(result: ActionResult): DraftSaveOutcome {
	if (result.type === 'success') {
		const saved = result.data?.draftSaved as { revision: number; missing?: string } | undefined;

		if (saved && typeof saved.missing === 'string') {
			return { kind: 'saved', revision: saved.revision, missing: saved.missing };
		}

		if (saved) return { kind: 'saved', revision: saved.revision };

		return { kind: 'failed', message: SERVER_FAILURE_MESSAGE };
	}

	if (result.type === 'failure') {
		if (result.data?.isDraftReplaced === true) return { kind: 'replaced' };

		const conflict = result.data?.draftConflict as
			{ revision: number; theirs: TheirDraft | null } | undefined;

		if (conflict) {
			return { kind: 'conflict', revision: conflict.revision, theirs: conflict.theirs ?? null };
		}

		return { kind: 'failed', message: flashMessage(result.data) ?? SERVER_FAILURE_MESSAGE };
	}

	if (result.type === 'redirect') {
		return { kind: 'failed', message: PAPER_WRITING_MESSAGES.signedOut };
	}

	// An error with no status never reached the server, or its answer never came back.
	const isNetworkFailure = result.status === undefined;

	return {
		kind: 'failed',
		message: isNetworkFailure ? NETWORK_FAILURE_MESSAGE : SERVER_FAILURE_MESSAGE
	};
}
