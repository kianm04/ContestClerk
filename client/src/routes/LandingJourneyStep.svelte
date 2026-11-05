<script lang="ts">
	import type { LandingStep } from '$lib/landing';
	import { REVEAL_ITEM_CLASSES } from '$lib/reveal';

	type Props = {
		/** The step's title and the line under it. */
		step: LandingStep;
		/** Its place, counted from one. */
		number: number;
		/** True for the last step, which draws no line onwards. */
		isLast: boolean;
		/** Milliseconds to wait before arriving, so the steps come one after another. */
		delay: number;
	};

	let { step, number, isLast, delay }: Props = $props();
</script>

<!--
	One step on the journey: a numbered blue circle, the title and one line
	about it, and the piece of line on to the next step.

	The line starts scaled to nothing and grows to its full length once the
	`Reveal` round the steps is shown (`group-data-[shown]/reveal`), from its
	top-left corner: downwards on a phone, where it hangs under the circle and
	crosses the gap to the next step (`-bottom-7`), and rightwards from `lg`
	up, where it runs from the circle's edge across the gap (`lg:-right-6`).
	It waits as long as its step does, so the line reaches each step as the
	step arrives.
-->
<li
	class="relative flex gap-4 {REVEAL_ITEM_CLASSES} lg:flex-col lg:gap-3.5"
	style:transition-delay="{delay}ms"
>
	<span
		class="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-700 text-small font-semibold text-surface tabular-nums"
	>
		{number}
	</span>

	{#if !isLast}
		<span
			aria-hidden="true"
			class="absolute top-9 -bottom-7 left-3.75 w-0.5 origin-top-left scale-0 bg-brand-100 transition-transform duration-700 ease-out group-data-[shown]/reveal:scale-100 motion-reduce:transition-none lg:top-3.75 lg:-right-6 lg:bottom-auto lg:left-9 lg:h-0.5 lg:w-auto"
			style:transition-delay="{delay}ms"
		></span>
	{/if}

	<div class="min-w-0 pt-1 lg:pt-0">
		<h3 class="text-h3 text-ink-900">{step.title}</h3>
		<p class="mt-1 text-small text-ink-600">{step.detail}</p>
	</div>
</li>
