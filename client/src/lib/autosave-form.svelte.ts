/**
 * Saving a creation step by itself while the organiser types (Trello
 * fe3reN7Y). The step's form tells it about every change, and a moment after
 * the last one the whole form is posted in the background to the page's
 * `save` action. The footer reads `status` and `savedAt` to say "Saving…" or
 * "Draft saved, just now".
 *
 * Nothing on screen is replaced by the answer: what the organiser typed is the
 * truth while they type, so the page is not reloaded (no `invalidateAll`).
 * The answer's data goes to `onSaved`, which is how a page picks up the values
 * the server worked out, such as next year's name or the timezone of a city.
 *
 * Without JavaScript none of this runs, and the step's Continue button saves.
 *
 * The file ends in `.svelte.ts` because it uses `$state`, which Svelte only
 * understands in `.svelte` files and in modules named like this one.
 */
import type { ActionResult } from '@sveltejs/kit';
// `deserialize` reads an action's answer the way `use:enhance` does.
import { deserialize } from '$app/forms';

export type AutosaveStatus = 'saved' | 'saving' | 'unsaved' | 'failed';

export type AutosaveForm = {
	readonly status: AutosaveStatus;
	/** ISO; starts at the draft's `updatedAt`. */
	readonly savedAt: string | null;
	/** Put on the `<form>`: `oninput={autosave.handleChange} onchange={autosave.handleChange}`. */
	handleChange: (event: Event) => void;
	/** Drop a pending save, as when the Continue button sends the form itself. */
	cancel: () => void;
};

export type AutosaveFormOptions = {
	/** The action the form is posted to, such as `?/save`. */
	action: string;
	initialSavedAt: string | null;
	/** How long after the last change to wait before saving. */
	delayMs?: number;
	onSaved?: (data: Record<string, unknown>) => void;
};

/** How long after the last keystroke a save is sent. */
const DEFAULT_DELAY_MS = 800;

/** Post the form to the action and read the answer. Never throws. */
async function sendForm(action: string, form: HTMLFormElement): Promise<ActionResult> {
	let response: Response;

	try {
		// The header asks SvelteKit for the action's answer as data, as `use:enhance` does.
		response = await fetch(new URL(action, location.href), {
			method: 'POST',
			body: new FormData(form),
			headers: { 'x-sveltekit-action': 'true', accept: 'application/json' }
		});
	} catch {
		return { type: 'error', error: 'network' };
	}

	try {
		return deserialize(await response.text());
	} catch {
		return { type: 'error', status: response.status, error: 'unreadable answer' };
	}
}

/** The saving helper for one step's form. Call it once in a component's `<script>`. */
export function createAutosaveForm(options: AutosaveFormOptions): AutosaveForm {
	const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;

	// `$state` makes whatever reads these redraw when they change.
	let status: AutosaveStatus = $state('saved');
	let savedAt: string | null = $state(options.initialSavedAt);

	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let form: HTMLFormElement | null = null;
	let isSending = false;
	// A change made while a save was on its way, which needs a save of its own.
	let hasChangeSinceSend = false;

	async function saveNow() {
		if (form === null) return;

		if (isSending) {
			hasChangeSinceSend = true;
			return;
		}

		isSending = true;
		hasChangeSinceSend = false;
		status = 'saving';

		const result = await sendForm(options.action, form);
		isSending = false;

		if (result.type === 'success') {
			// Only read once, for its text, so it need not be a reactive `SvelteDate`.
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			savedAt = new Date().toISOString();
			status = 'saved';
			options.onSaved?.(result.data ?? {});
		} else {
			status = 'failed';
		}

		// Typing went on during the save: what is stored is already behind.
		if (hasChangeSinceSend) {
			status = 'unsaved';
			schedule();
		}
	}

	function schedule() {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => void saveNow(), delayMs);
	}

	function handleChange(event: Event) {
		// The listener sits on the form, so the form is the current target.
		if (event.currentTarget instanceof HTMLFormElement) {
			form = event.currentTarget;
		}

		if (isSending) {
			hasChangeSinceSend = true;
		}

		status = 'unsaved';
		schedule();
	}

	function cancel() {
		clearTimeout(saveTimer);
		hasChangeSinceSend = false;
	}

	// Getters, so a reader always sees the current value rather than a copy.
	return {
		get status() {
			return status;
		},
		get savedAt() {
			return savedAt;
		},
		handleChange,
		cancel
	};
}
