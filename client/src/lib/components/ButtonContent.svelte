<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { BUSY_INDICATOR_DELAY_MS } from '$lib/button-classes';

	// What goes inside a `Button`, whether it is drawn as a link or as a real
	// `<button>`. Only `Button` uses it; the props mean what they mean there.
	type Props = {
		label: string;
		icon?: LucideIcon;
		/** 20, or 16 on the dense management buttons (`buttonIconSize`). */
		iconSize: number;
		/** The icon comes after the words, for an arrow saying where the button goes. */
		isIconAfterLabel: boolean;
		isLabelHidden: boolean;
		/**
		 * While the form is being sent. The spinner takes the icon's place only once
		 * the answer has taken longer than `BUSY_INDICATOR_DELAY_MS`.
		 */
		isLoading?: boolean;
	};

	let {
		label,
		icon: Icon,
		iconSize,
		isIconAfterLabel,
		isLabelHidden,
		isLoading = false
	}: Props = $props();

	// `$state` redraws the button when the delay is over.
	let isSpinnerShown = $state(false);

	/*
		`$effect` runs again whenever `isLoading` changes, and is the place to talk
		to a timer. It starts the delay when the button becomes busy. The function
		it returns runs when the button stops being busy: it stops a delay that
		has not ended, so a quick answer never shows a spinner at all, and hides
		the spinner again. The spinner is not `$derived`, because it depends on
		time passing rather than on another value.
	*/
	$effect(() => {
		if (!isLoading) return;

		const spinnerTimer = setTimeout(() => (isSpinnerShown = true), BUSY_INDICATOR_DELAY_MS);

		return () => {
			clearTimeout(spinnerTimer);
			isSpinnerShown = false;
		};
	});
</script>

{#if isSpinnerShown}
	<!-- `animate-spin` is switched off for anybody who asked for less motion. -->
	<LoaderCircle size={iconSize} strokeWidth={1.75} aria-hidden="true" class="animate-spin" />
{:else if Icon && !isIconAfterLabel}
	<Icon size={iconSize} strokeWidth={1.75} aria-hidden="true" />
{/if}
{#if !isLabelHidden}
	{label}
{/if}
{#if Icon && isIconAfterLabel && !isSpinnerShown}
	<Icon size={iconSize} strokeWidth={1.75} aria-hidden="true" />
{/if}
