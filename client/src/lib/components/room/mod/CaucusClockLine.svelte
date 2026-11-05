<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { CaucusClock } from '$lib/caucus-clock';
	import { caucusLine } from '$lib/caucus-view';
	import { SMALL_OUTLINED_BUTTON_CLASSES } from '$lib/console-buttons';
	import ProgressLine from '../floor/ProgressLine.svelte';

	type Props = {
		/** The caucus's own clock: its total, and when it ends or what it has left. */
		clock: CaucusClock;
		/** The moment to draw it at, on the server's clock; the Mod view moves it on while it runs. */
		now: Date;
		/** Sends "Extend +5:00" and "End caucus" through the chair's instant form. */
		onSubmit: SubmitFunction;
	};

	let { clock, now, onSubmit }: Props = $props();

	// `$derived` works the line out again whenever `now` moves on or the clock changes.
	const line = $derived(caucusLine(clock, now));

	/* The console's small outlined buttons (`$lib/console-buttons.ts`); neither is ever the filled one. */
	const BUTTON_CLASSES = `${SMALL_OUTLINED_BUTTON_CLASSES} h-9 px-3 max-md:h-11`;
</script>

<!--
	The caucus clock line, between the title and the speaker, smaller than the
	speaker's clock: "Caucus 6:12 left of 10:00", its own thin bar, and the two
	things that act on it. It runs only while the speaker's clock runs. Once
	the time is up it reads "Caucus time is up" in danger colour with its bar
	full, and only "Extend +5:00" stays. On a phone the bar and then the
	buttons go under the words. `role="timer"` tells a screen reader this is a
	clock, which it does not read out every second.
-->
<div
	class="mt-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-y border-line py-3 tabular-nums max-md:mx-4 max-md:mt-3 max-md:grid-cols-1 max-md:gap-3"
>
	<p role="timer" aria-label="Caucus time left" class="flex items-baseline gap-2 whitespace-nowrap">
		{#if line.isTimeUp}
			<strong class="text-xl leading-7 font-semibold text-danger-700">Caucus time is up</strong>
		{:else}
			<span class="text-ink-600">Caucus</span>
			<strong class="text-xl leading-7 font-semibold">{line.timeLeft}</strong>
			<span class="text-ink-600">{line.ofTotal}</span>
		{/if}
	</p>
	<ProgressLine
		spokenSeconds={line.usedSeconds}
		totalSeconds={line.totalSeconds}
		clockState={line.clockState}
		isLegendShown={false}
		isThin
	/>
	<div class="flex gap-1 max-md:gap-2">
		<form method="post" action="?/extendCaucus" use:enhance={onSubmit}>
			<button type="submit" class={BUTTON_CLASSES}>Extend +5:00</button>
		</form>
		{#if !line.isTimeUp}
			<form method="post" action="?/endCaucus" use:enhance={onSubmit}>
				<button type="submit" class={BUTTON_CLASSES}>End caucus</button>
			</form>
		{/if}
	</div>
</div>
