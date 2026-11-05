<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Kbd from '$lib/components/Kbd.svelte';
	import type { RoomSeat } from '$lib/committee-room';
	import { KEY_SHORTCUTS } from '$lib/console-keys';
	import { nextButtonLabel } from '$lib/gsl-floor';

	type Props = {
		/** The seat "Next" or "Call" gives the floor to, or null when no present seat waits. */
		nextSeat: RoomSeat | null;
		/** Whether someone has the floor: "Next: {seat}" then, "Call {seat}" over an empty floor. */
		hasSpeaker: boolean;
		/**
		 * Filled, the floor's one primary. During the opening, while no roll call
		 * exists, "Mark all present" is the primary and this is outlined.
		 */
		isPrimary: boolean;
		/** Sends the press through the chair's instant form (`$lib/chair-form.ts`). */
		onSubmit: SubmitFunction;
	};

	let { nextSeat, hasSpeaker, isPrimary, onSubmit }: Props = $props();

	const label = $derived(nextSeat === null ? 'Next' : nextButtonLabel(nextSeat.name, hasSpeaker));
	const isShown = $derived(nextSeat !== null || hasSpeaker);

	/* The two looks of the button, and its look while nobody waits. */
	const LOOK_CLASSES = {
		primary: 'border-brand-900 bg-brand-900 text-surface hover:border-brand-800 hover:bg-brand-800',
		secondary: 'border-line bg-surface text-ink-900 hover:bg-neutral-100',
		disabled: 'border-line bg-neutral-100 text-ink-400'
	};

	/** The button's look: grey while nobody waits, otherwise filled or outlined. */
	function lookOf(): string {
		if (nextSeat === null) return LOOK_CLASSES.disabled;

		return isPrimary ? LOOK_CLASSES.primary : LOOK_CLASSES.secondary;
	}

	// `$derived` calls `lookOf` again whenever a prop it reads changes.
	const lookClasses = $derived(lookOf());
</script>

<!--
	The floor's primary in its bottom right corner, 56px tall: "Next: United
	Kingdom →", "Call United Kingdom →", or a disabled "Next" with "Nobody is
	waiting" beside it. With nobody on the floor and nobody waiting it is left
	out. A long name is cut short with "…" and the whole of it is in `title`;
	the button's width stays within 240 to 360px, so a name never moves the
	controls beside it. It is one button whose words change, so the focus stays
	on it when "Call" becomes "Next". It declares N (`aria-keyshortcuts`).
-->
{#if isShown}
	<form
		method="post"
		action="?/nextSpeaker"
		use:enhance={onSubmit}
		class="flex items-center gap-4 max-[1100px]:flex-1 max-[1100px]:justify-end max-md:w-full"
	>
		{#if nextSeat === null}
			<p class="text-small text-ink-600">Nobody is waiting</p>
		{/if}
		<button
			type="submit"
			disabled={nextSeat === null}
			title={label}
			aria-keyshortcuts={KEY_SHORTCUTS.next}
			class="group/key relative flex h-14 max-w-90 min-w-60 items-center gap-2 rounded-control border px-5 text-base font-medium max-[1100px]:max-w-none max-[1100px]:flex-1 max-md:min-w-0 {lookClasses}"
		>
			<span class="min-w-0 flex-1 truncate text-left">{label}</span>
			<ArrowRight size={20} strokeWidth={1.75} aria-hidden="true" />
			<Kbd keyName={KEY_SHORTCUTS.next} />
		</button>
	</form>
{/if}
