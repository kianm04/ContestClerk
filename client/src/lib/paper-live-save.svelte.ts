/**
 * Saving a paper that several people write together live: a position paper
 * its delegation shares, or a paper written in committee.
 *
 * `$lib/paper-draft-autosave.svelte.ts` saves a paper written alone, as
 * Markdown, and stops at a clash when another window saved first. A paper
 * written live cannot clash: this page posts its whole Yjs document a moment
 * after its writer's last change, and the server merges it into the stored
 * one (`$lib/server/paper-live-drafts.ts`). The answer carries whatever the
 * others saved that this page lacks, which is how their words still arrive
 * while Realtime is down.
 *
 * Each page saves only its own writer's changes. What arrives over the
 * channel was typed on another page, which saves it itself.
 *
 * The file ends in `.svelte.ts` because it uses `$state`, which Svelte only
 * understands in `.svelte` files and in modules named like this one.
 */
import type { ActionResult } from '@sveltejs/kit';
// `deserialize` reads an action's answer the way `use:enhance` does.
import { deserialize } from '$app/forms';
import * as Y from 'yjs';
import { base64ToBytes, bytesToBase64, paperDocumentState } from '$lib/paper-document';
import { CHANNEL_ORIGIN } from '$lib/paper-live-channel';
import {
	DRAFT_SAVE_DELAY_MS,
	readDraftSaveOutcome,
	type DraftSaveStatus,
	type PaperDraft
} from '$lib/paper-writing';
import { SERVER_FAILURE_MESSAGE } from '$lib/in-place-form.svelte';
import type { DraftEditor } from '$lib/paper-draft-autosave.svelte';

/** Marks the changes a save's answer brought, which are stored already. */
const SERVER_ORIGIN = 'paper-save';

export type LivePaperSaveOptions = {
	/** The page's form action that saves the paper, such as `?/saveDraft`. */
	action: string;
	/**
	 * What the writer is told once the paper can no longer be saved here: a
	 * position paper submitted and started again, or a committee paper the
	 * writer left or that went to the dais.
	 */
	replacedMessage: string;
	/** The document the page writes in. */
	document: Y.Doc;
	/** The stored draft when the page loaded, or `null` when there is none yet. */
	draft: PaperDraft | null;
	/** The signed-in writer, who becomes the last editor once one of their saves is stored. */
	readerId: string;
};

/** Post the whole document to the action and read its answer. Never throws. */
async function sendDocument(
	action: string,
	document: Y.Doc,
	revision: number
): Promise<ActionResult> {
	const formData = new FormData();
	formData.set('document', bytesToBase64(paperDocumentState(document)));
	formData.set('revision', String(revision));
	formData.set('background', '1');

	try {
		// The header asks SvelteKit for the action's answer as data, as `use:enhance` does.
		const response = await fetch(action, {
			method: 'POST',
			body: formData,
			headers: { 'x-sveltekit-action': 'true' }
		});

		return deserialize(await response.text());
	} catch {
		// No status at all means the request never reached the server.
		return { type: 'error', error: 'network' };
	}
}

/** The saving helper for one live paper. Call it once in a component's `<script>`. */
export function createLivePaperSave(options: LivePaperSaveOptions) {
	const { document } = options;

	// `$state` makes whatever reads these redraw when they change.
	let status: DraftSaveStatus = $state('saved');
	// When the draft was last stored, in milliseconds since 1970.
	let savedAt: number | null = $state(options.draft ? Date.parse(options.draft.updatedAt) : null);
	let lastEditor: DraftEditor | null = $state(
		options.draft ? { id: options.draft.updatedById, name: options.draft.updatedByName } : null
	);
	let failureMessage: string | null = $state(null);
	// True once the draft this page holds was submitted and started again elsewhere.
	let isReplaced = $state(false);
	// True while this page's writer has changes the server has not stored.
	let hasOwnChanges = $state(false);
	let isSending = $state(false);

	let revision = options.draft?.revision ?? 0;
	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	function scheduleSave() {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => void saveNow(), DRAFT_SAVE_DELAY_MS);
	}

	/**
	 * Send the document now. With `isAskingForChanges` it is sent even when
	 * this page has nothing new, to hear what the others saved.
	 */
	async function saveNow(isAskingForChanges = false) {
		clearTimeout(saveTimer);

		if (isReplaced || isSending) return;
		if (!hasOwnChanges && !isAskingForChanges) return;

		const hadOwnChanges = hasOwnChanges;
		hasOwnChanges = false;
		isSending = true;
		if (hadOwnChanges) status = 'saving';

		const outcome = readDraftSaveOutcome(await sendDocument(options.action, document, revision));
		isSending = false;

		if (outcome.kind === 'replaced') {
			isReplaced = true;
			failureMessage = options.replacedMessage;
			status = 'failed';
			return;
		}

		if (outcome.kind !== 'saved') {
			// A clash cannot happen here; anything but a save is a failure to store.
			failureMessage = outcome.kind === 'failed' ? outcome.message : SERVER_FAILURE_MESSAGE;
			hasOwnChanges = hasOwnChanges || hadOwnChanges;
			if (hasOwnChanges) status = 'failed';
			return;
		}

		revision = outcome.revision;
		if (outcome.missing) Y.applyUpdate(document, base64ToBytes(outcome.missing), SERVER_ORIGIN);

		if (hadOwnChanges) {
			savedAt = Date.now();
			lastEditor = { id: options.readerId, name: null };
		}

		failureMessage = null;
		status = hasOwnChanges ? 'waiting' : 'saved';

		// The writer kept typing while this save was on its way.
		if (hasOwnChanges) scheduleSave();
	}

	// A change typed on this page. Changes from the channel or a save's answer are stored already.
	function handleDocumentUpdate(_update: Uint8Array, origin: unknown) {
		if (origin === CHANNEL_ORIGIN || origin === SERVER_ORIGIN || isReplaced) return;

		hasOwnChanges = true;
		if (!isSending) status = 'waiting';
		scheduleSave();
	}

	document.on('update', handleDocumentUpdate);

	/** Stop saving, once the editor goes away. */
	function stop() {
		clearTimeout(saveTimer);
		document.off('update', handleDocumentUpdate);
	}

	return {
		get status() {
			return status;
		},
		get savedAt() {
			return savedAt;
		},
		/** Who saved the draft stored now, as far as this page knows. */
		get lastEditor() {
			return lastEditor;
		},
		get failureMessage() {
			return failureMessage;
		},
		get isReplaced() {
			return isReplaced;
		},
		/** True while the writer's changes are not stored yet. */
		get hasUnsavedText() {
			return hasOwnChanges || (isSending && status === 'saving');
		},
		/** True when leaving now could lose text: the last save failed. */
		get isAtRisk() {
			return status === 'failed' && hasOwnChanges;
		},
		saveNow,
		stop
	};
}

export type LivePaperSave = ReturnType<typeof createLivePaperSave>;
