/**
 * Saving the draft of a written position paper by itself while the delegate
 * types (T145), the way the chair's session notes are saved (T130).
 *
 * The writing form makes one with `createDraftAutosave()` and tells it about
 * every change with `edit()`. A moment after the last keystroke the draft is
 * sent in the background to the page's `saveDraft` action, and the form reads
 * `status` to say "Saving…" or "Saved 5s ago". The text on screen is never
 * replaced without the writer choosing it: a failed save keeps it and tries
 * again on the next keystroke, and a save that finds a newer draft, from
 * another window or from a fellow member of the delegation (T147), stops and
 * offers "Keep mine" or "Use theirs", the rule the chair's notes follow.
 *
 * The file ends in `.svelte.ts` because it uses `$state`, which Svelte only
 * understands in `.svelte` files and in modules named like this one.
 */
import type { ActionResult } from '@sveltejs/kit';
// `deserialize` reads an action's answer the way `use:enhance` does.
import { deserialize } from '$app/forms';
import {
	DRAFT_SAVE_DELAY_MS,
	readDraftSaveOutcome,
	type DraftSaveStatus,
	type PaperDraft,
	type TheirDraft
} from '$lib/paper-writing';

export type DraftAutosaveOptions = {
	/** The action the draft is posted to, `?way=write&edit=1&/saveDraft`. */
	action: string;
	/** What the editor starts with: the draft, or the submitted text for "Edit and resubmit". */
	startMarkdown: string;
	/** The stored draft when the page loaded, or `null` when there is none yet. */
	draft: PaperDraft | null;
	/** The signed-in writer, who becomes the last editor once one of their saves is stored. */
	readerId: string;
};

/** Who saved the draft last: an id and a name, either `null` when that cannot be told. */
export type DraftEditor = { id: string | null; name: string | null };

/** Send the draft to the action and read its answer. Never throws. */
async function sendDraft(
	action: string,
	markdown: string,
	revision: number
): Promise<ActionResult> {
	const formData = new FormData();
	formData.set('body', markdown);
	formData.set('revision', String(revision));
	formData.set('background', '1');

	let response: Response;

	try {
		// The header asks SvelteKit for the action's answer as data, as `use:enhance` does.
		response = await fetch(action, {
			method: 'POST',
			body: formData,
			headers: { 'x-sveltekit-action': 'true' }
		});
	} catch {
		// No status at all means the request never reached the server.
		return { type: 'error', error: 'network' };
	}

	try {
		return deserialize(await response.text());
	} catch {
		return { type: 'error', status: response.status, error: 'unreadable answer' };
	}
}

/** The saving helper for one draft. Call it once in a component's `<script>`. */
export function createDraftAutosave(options: DraftAutosaveOptions) {
	// `$state` makes whatever reads these redraw when they change.
	let draftMarkdown = $state(options.startMarkdown);
	/*
		What is stored now, so typing a change and then taking it back sends
		nothing. "Edit and resubmit" with no draft starts from the submitted
		text, which is only sent once it changes. `null` after a clash, when
		what is stored is another window's text.
	*/
	let savedMarkdown: string | null = $state(options.draft?.body ?? options.startMarkdown);
	let status: DraftSaveStatus = $state('saved');
	// When the draft was last stored, in milliseconds since 1970.
	let savedAt: number | null = $state(options.draft ? Date.parse(options.draft.updatedAt) : null);
	let failureMessage: string | null = $state(null);
	let isSending = $state(false);
	// Who saved what is stored now, for "Last edited by …" (T147).
	let lastEditor: DraftEditor | null = $state(
		options.draft ? { id: options.draft.updatedById, name: options.draft.updatedByName } : null
	);

	/*
		What the editor draws, and a number that moves on whenever the editor
		must be drawn again from it, as after "Use theirs". The editor keeps
		its own text while the writer types, so only a new start replaces it.
	*/
	let editorStartMarkdown = $state(options.startMarkdown);
	let editorVersion = $state(0);

	let revision = options.draft?.revision ?? 0;
	/*
		While a clash waits for the writer: the revision stored now, and the
		draft behind it (`null` when the draft is gone, as after a submit).
	*/
	let conflict: { revision: number; theirs: TheirDraft | null } | null = $state(null);
	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	function scheduleSave() {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => void saveNow(), DRAFT_SAVE_DELAY_MS);
	}

	/** Send the draft now, unless nothing changed, a save is on its way or a clash waits. */
	async function saveNow() {
		clearTimeout(saveTimer);

		if (conflict !== null || isSending) return;

		// Typed and then typed back: there is nothing new to store.
		if (draftMarkdown === savedMarkdown) {
			status = 'saved';
			return;
		}

		const sending = draftMarkdown;
		isSending = true;
		status = 'saving';
		failureMessage = null;

		const outcome = readDraftSaveOutcome(await sendDraft(options.action, sending, revision));
		isSending = false;

		if (outcome.kind === 'conflict') {
			conflict = { revision: outcome.revision, theirs: outcome.theirs };
			status = 'conflict';
			return;
		}

		if (outcome.kind === 'failed') {
			failureMessage = outcome.message;
			status = 'failed';
			return;
		}

		// Only a live save (T148) can be told its draft was started again; this one never is.
		if (outcome.kind === 'replaced') return;

		revision = outcome.revision;
		savedMarkdown = sending;
		savedAt = Date.now();
		lastEditor = { id: options.readerId, name: null };
		status = 'saved';

		// The delegate kept typing while this save was on its way.
		if (draftMarkdown !== sending) {
			status = 'waiting';
			scheduleSave();
		}
	}

	/** The delegate changed the text. It is saved a moment after the last change. */
	function edit(markdown: string) {
		draftMarkdown = markdown;

		if (conflict !== null) return;
		if (!isSending) status = 'waiting';

		scheduleSave();
	}

	/** After a clash: save the text on screen over the draft that was saved first. */
	function keepMine() {
		if (conflict === null) return;

		revision = conflict.revision;
		savedMarkdown = conflict.theirs?.body ?? null;
		conflict = null;
		status = 'waiting';
		void saveNow();
	}

	/**
	 * After a clash: put the draft that was saved first in the editor, in
	 * place of the text on screen. Nothing is sent, because it is stored already.
	 */
	function useTheirs() {
		const theirs = conflict?.theirs;

		if (!theirs) return;

		revision = theirs.revision;
		draftMarkdown = theirs.body;
		savedMarkdown = theirs.body;
		savedAt = Date.parse(theirs.updatedAt);
		lastEditor = { id: theirs.updatedById, name: theirs.updatedByName };
		editorStartMarkdown = theirs.body;
		editorVersion += 1;
		conflict = null;
		status = 'saved';
	}

	/** Stop a save that is still waiting, once the form goes away. */
	function stop() {
		clearTimeout(saveTimer);
	}

	return {
		get status() {
			return status;
		},
		get savedAt() {
			return savedAt;
		},
		/** Who saved the draft stored now, or `null` when there is none yet. */
		get lastEditor() {
			return lastEditor;
		},
		get failureMessage() {
			return failureMessage;
		},
		get hasConflict() {
			return conflict !== null;
		},
		/** The draft another window or member saved first, while a clash waits and it still exists. */
		get theirDraft() {
			return conflict?.theirs ?? null;
		},
		get editorStartMarkdown() {
			return editorStartMarkdown;
		},
		get editorVersion() {
			return editorVersion;
		},
		/** True while the text on screen is not what is stored. */
		get hasUnsavedText() {
			return draftMarkdown !== savedMarkdown || isSending;
		},
		/** True when leaving now could lose text: the last save failed or a clash waits. */
		get isAtRisk() {
			return status === 'failed' || conflict !== null;
		},
		edit,
		saveNow,
		keepMine,
		useTheirs,
		stop
	};
}

export type DraftAutosave = ReturnType<typeof createDraftAutosave>;
