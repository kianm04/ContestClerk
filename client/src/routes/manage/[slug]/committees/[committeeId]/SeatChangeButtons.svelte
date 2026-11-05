<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import Button from '$lib/components/Button.svelte';
	import { buttonClasses } from '$lib/button-classes';
	import { isSeatFree } from '$lib/committee-editor';
	import type { ManagedSeat } from '$lib/committees';

	type Props = {
		/** The seat these buttons hide, show or delete. */
		seat: ManagedSeat;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { seat }: Props = $props();

	/** "Hide" looks like the ghost button beside it, but is written by hand (see below). */
	const HIDE_BUTTON_CLASSES = buttonClasses('ghost', 'dense-sm', false);

	// `$derived` works these out again whenever the seat changes.
	const canChange = $derived(isSeatFree(seat));
	const availability = $derived(
		seat.isAvailable
			? { word: 'Hide', formaction: '?/hideSeat' }
			: { word: 'Show', formaction: '?/showSeat' }
	);
</script>

<!--
	These buttons have no form of their own: `SeatRow` draws them inside its
	row's form, which carries the seat's id, so each one posts that form to its
	own action.

	A seat somebody is in, or one a school is holding, has neither button:
	`05-pages/organiser/committee-edit.md` says a filled seat shows its
	delegate instead, because freeing it is the allocation page's work (T28).
	Who has it is in the row's "Held by" cell.

	Both actions refuse such a seat anyway, and have to: a button that is not
	drawn is not a rule, and the seat may have been filled since the page was.
-->
{#if canChange}
	<!--
		A plain `<button>` rather than `Button`, because it shows the one word
		"Hide" while a screen reader hears "Hide Argentina": "Hide" read out 193
		times would not say which seat it means. `Button` can only give a button
		a name different from its words when it shows an icon instead.
	-->
	<button
		type="submit"
		formaction={availability.formaction}
		aria-label="{availability.word} {seat.name}"
		class={HIDE_BUTTON_CLASSES}
	>
		{availability.word}
	</button>

	<!-- A plain `Button` and not the page file's `ConfirmButton`, which is
		its own `<form>` carrying a `Modal`: 193 seats would be 193 hidden
		dialogs, and a form cannot sit inside the row's form anyway. Putting a
		deleted seat back is one press of "Add seat". -->
	<Button
		label="Delete {seat.name}"
		variant="ghost"
		size="dense-sm"
		icon={X}
		isLabelHidden
		formaction="?/deleteSeat"
	/>
{/if}
