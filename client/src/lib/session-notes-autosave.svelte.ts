/**
 * Saving the chair's session notes by themselves while the chair types (T130).
 *
 * The notes panel makes one with `createNotesAutosave()` and tells it about
 * every change with `edit()`. A moment after the last keystroke the notes are
 * sent in the background to the page's `saveSessionNotes` action, and the
 * panel reads `status` to say "Saving…", "Auto-saved 10s ago" or what went
 * wrong. Whatever happens, the text on screen is never replaced without the
 * chair choosing it: a failed save keeps it and tries again on the next
 * keystroke, and a save that finds another chair's newer notes stops and asks.
 *
 * It does not use `createInPlaceForm()`, which every other form on the page
 * uses: that helper reads the whole page again after each press and shows
 * refusals as a toast, while a save every few seconds must leave the page
 * alone and show its problems beside the notes. The plain form without
 * JavaScript does use it.
 *
 * The file ends in `.svelte.ts` because it uses `$state`, which Svelte only
 * understands in `.svelte` files and in modules named like this one.
 */
import type { ActionResult } from '@sveltejs/kit';
// `deserialize` reads an action's answer the way `use:enhance` does.
import { deserialize } from '$app/forms';
import {
	NOTES_SAVE_DELAY_MS,
	readSaveOutcome,
	type NotesSaveStatus,
	type SessionNotes
} from '$lib/session-notes';

export type NotesAutosaveOptions = {
	/** The action the notes are posted to, such as `?/saveSessionNotes`. */
	action: string;
	sessionId: string;
	/** The stored notes when the page loaded, or null when there are none yet. */
	notes: SessionNotes | null;
};

/** Send the notes to the action and read its answer. Never throws. */
async function sendNotes(
	options: NotesAutosaveOptions,
	markdown: string,
	revision: number
): Promise<ActionResult> {
	const formData = new FormData();
	formData.set('sessionId', options.sessionId);
	formData.set('body', markdown);
	formData.set('revision', String(revision));
	formData.set('background', '1');

	let response: Response;

	try {
		// The header asks SvelteKit for the action's answer as data, as `use:enhance` does.
		response = await fetch(options.action, {
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

/** The saving helper for one session's notes. Call it once in a component's `<script>`. */
export function createNotesAutosave(options: NotesAutosaveOptions) {
	const storedBody = options.notes?.body ?? '';

	// `$state` makes whatever reads these redraw when they change.
	let draftMarkdown = $state(storedBody);
	let savedMarkdown = $state(storedBody);
	let status: NotesSaveStatus = $state('saved');
	// When the notes were last stored, in milliseconds since 1970.
	let savedAt: number | null = $state(options.notes ? Date.parse(options.notes.updatedAt) : null);
	let failureMessage: string | null = $state(null);
	let conflict: SessionNotes | null = $state(null);
	// What the editor starts from, and a number that changes whenever the
	// editor has to be drawn again from it (after "Use theirs").
	let editorStartMarkdown = $state(storedBody);
	let editorVersion = $state(0);

	let revision = options.notes?.revision ?? 0;
	let isSending = $state(false);
	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	function scheduleSave() {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => void saveNow(), NOTES_SAVE_DELAY_MS);
	}

	/** Send the notes now, unless nothing changed, a save is on its way or a conflict waits. */
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

		const outcome = readSaveOutcome(await sendNotes(options, sending, revision));
		isSending = false;

		if (outcome.kind === 'conflict') {
			conflict = outcome.current;
			status = 'conflict';
			return;
		}

		if (outcome.kind === 'failed') {
			failureMessage = outcome.message;
			status = 'failed';
			return;
		}

		revision = outcome.revision;
		savedMarkdown = sending;
		savedAt = Date.now();
		status = 'saved';

		// The chair kept typing while this save was on its way.
		if (draftMarkdown !== sending) {
			status = 'waiting';
			scheduleSave();
		}
	}

	/** The chair changed the notes. They are saved a moment after the last change. */
	function edit(markdown: string) {
		draftMarkdown = markdown;

		if (conflict !== null) return;
		if (!isSending) status = 'waiting';

		scheduleSave();
	}

	/** Start the editor from Markdown typed into the plain box before the page's script ran. */
	function startFromTypedText(text: string) {
		editorStartMarkdown = text;
		editorVersion += 1;
		edit(text);
	}

	/** After a conflict: save the chair's text over the other chair's notes. */
	function keepMine() {
		if (conflict === null) return;

		revision = conflict.revision;
		savedMarkdown = conflict.body;
		conflict = null;
		status = 'waiting';
		void saveNow();
	}

	/** After a conflict: put the other chair's notes in the editor instead. */
	function useTheirs() {
		if (conflict === null) return;

		revision = conflict.revision;
		draftMarkdown = conflict.body;
		savedMarkdown = conflict.body;
		savedAt = Date.parse(conflict.updatedAt);
		editorStartMarkdown = conflict.body;
		editorVersion += 1;
		conflict = null;
		status = 'saved';
	}

	return {
		get status() {
			return status;
		},
		get savedAt() {
			return savedAt;
		},
		get failureMessage() {
			return failureMessage;
		},
		get conflict() {
			return conflict;
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
		/** True when leaving now could lose text: the last save failed or a conflict waits. */
		get isAtRisk() {
			return status === 'failed' || conflict !== null;
		},
		edit,
		saveNow,
		startFromTypedText,
		keepMine,
		useTheirs
	};
}

export type NotesAutosave = ReturnType<typeof createNotesAutosave>;
