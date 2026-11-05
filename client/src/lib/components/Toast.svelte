<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	// `applyAction` shows an action's refusal the way a full page load would.
	import { applyAction, enhance } from '$app/forms';
	// `invalidateAll` runs every `load` of the page again, without leaving it.
	import { invalidateAll } from '$app/navigation';
	import { pathOnThisSite } from '$lib/auth';
	import type { FlashUndo } from '$lib/flash';

	type Props = {
		/** One sentence saying what just happened: "Application submitted." */
		message: string;
		tone: 'info' | 'warning' | 'error' | 'success';
		/** A way to take it back, drawn as "Undo" beside the message: "2 other motions dropped". */
		undo?: FlashUndo;
		/**
		 * Drawn in the middle above the chair console's mode bar, as the session
		 * study does, rather than bottom right, where it would cover Suspend and End.
		 */
		isAboveModeBar?: boolean;
	};

	let { message, tone, undo, isAboveModeBar = false }: Props = $props();

	/* Both placements written out in full, so Tailwind can find the class names. */
	const placementClass = $derived(
		isAboveModeBar ? 'bottom-20 justify-center' : 'bottom-4 justify-center md:justify-end'
	);

	/* Written out in full so Tailwind can find the class names. */
	const TONE_CLASSES = {
		info: 'bg-brand-900 text-surface',
		warning: 'bg-warning-700 text-surface',
		error: 'bg-danger-700 text-surface',
		success: 'bg-success-700 text-surface'
	};

	const toneClass = $derived(TONE_CLASSES[tone]);

	/*
		`role="alert"` makes a screen reader interrupt and read a failure out
		straight away. The other tones are not urgent, so they get the quieter
		`role="status"`, which is read when the reader next pauses.
	*/
	const role = $derived(tone === 'error' ? 'alert' : 'status');

	// Undo posts the normalised path, and is not drawn for one off this site (M13).
	const undoAction = $derived(undo ? pathOnThisSite(undo.action) : null);

	// `$state` redraws what reads it. Once Undo is sent its button goes, so it
	// cannot be pressed twice while the message is still showing.
	let isUndoSent = $state(false);

	/**
	 * Undo with JavaScript: the action puts things back and then redirects to
	 * its own page, but the reader stays on the page they are on, which is read
	 * again instead. A refusal is shown as its own toast. Without JavaScript the
	 * form simply posts and the browser follows the redirect.
	 */
	const submitUndo: SubmitFunction = () => {
		isUndoSent = true;

		return async ({ result }) => {
			if (result.type === 'redirect' || result.type === 'success') {
				await invalidateAll();
				return;
			}

			await applyAction(result);
		};
	};
</script>

<!--
	Floats above the page, at the bottom on a phone and bottom right on a
	desktop, or in the middle just above the mode bar on the chair console.
	The app shell decides when to show one and for how long; this component
	only draws it. The wrapper lets clicks through to the page, so only the
	toast's own Undo form takes them (`pointer-events-auto`).
-->
<div class="pointer-events-none fixed inset-x-4 z-20 flex {placementClass}">
	<div
		{role}
		class="flex items-center gap-4 rounded-control px-4 py-3 text-body shadow-card {toneClass}"
	>
		<span>{message}</span>
		{#if undo && undoAction && !isUndoSent}
			<form method="post" action={undoAction} use:enhance={submitUndo} class="pointer-events-auto">
				<!-- A list of plain ids has no key of its own, so each is keyed by its place. -->
				{#each undo.motionIds as motionId, index (index)}
					<input type="hidden" name="motionId" value={motionId} />
				{/each}
				<button type="submit" class="font-semibold text-brand-100 hover:underline">
					{undo.label}
				</button>
			</form>
		{/if}
	</div>
</div>
