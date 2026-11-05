<script lang="ts">
	import {
		DELEGATE_SLIDES,
		SLOT_STYLES,
		nextCarouselStep,
		slideSlot,
		type CarouselPhase
	} from '$lib/delegate-slides';
	import DelegateSlidesTurn from './DelegateSlidesTurn.svelte';

	// `$state` makes a variable that redraws the markup when it changes.
	let activeIndex = $state(0);
	let phase = $state<CarouselPhase>('showing');
	let isHovered = $state(false);
	let isPageHidden = $state(false);
	// Stays false on the server and without JavaScript, when nothing could turn
	// the carousel, so the buttons that turn it are only drawn once it can.
	let isInteractive = $state(false);

	const lastIndex = DELEGATE_SLIDES.length - 1;

	/*
		The carousel turns itself. A timer is something `$derived` cannot do, so
		this is an `$effect`: it runs in the browser only, and again whenever a
		value it reads changes. Each run sets one timer for the next step, and the
		function it returns clears that timer before the next run, so there is
		never more than one. A reader hovering over a stage, or a tab in the
		background, holds it still; a fade already under way still finishes.
	*/
	$effect(() => {
		isInteractive = true;

		if (phase === 'showing' && (isHovered || isPageHidden)) return;

		const step = nextCarouselStep({ activeIndex, phase }, DELEGATE_SLIDES.length);
		const timer = setTimeout(() => {
			activeIndex = step.next.activeIndex;
			phase = step.next.phase;
		}, step.delayMs);

		return () => clearTimeout(timer);
	});

	function turnTo(index: number) {
		activeIndex = index;
		phase = 'showing';
	}
</script>

<!--
	The delegate's journey in five slides (Trello BJyr90Wx), see
	`$lib/delegate-slides.ts`. Every slide is drawn at the centre slot's size
	and moved into its slot by `transform` alone, so the box keeps its height
	and nothing around it shifts while the slides move.

	`perspective` on the box is what makes the turned side slides lean away in
	depth. `overflow-x-clip` cuts off what runs past the window's edges.
	`<svelte:document>` listens to the page itself, to hold still in a hidden tab.
-->
<svelte:document onvisibilitychange={() => (isPageHidden = document.hidden)} />

<div
	role="presentation"
	class="-mx-4 overflow-x-clip py-6"
	onpointerenter={(event) => (isHovered = event.pointerType === 'mouse')}
	onpointerleave={() => (isHovered = false)}
>
	<div
		class={[
			'relative mx-auto aspect-[1672/941] w-[84%] max-w-[52rem] transition-opacity duration-500 perspective-[1500px] sm:w-[70%] lg:w-[60%]',
			phase !== 'showing' && 'opacity-0'
		]}
	>
		<!-- The `(slide.src)` key keeps each slide the same element as it moves between slots. -->
		{#each DELEGATE_SLIDES as slide, index (slide.src)}
			{@const slot = slideSlot(index, activeIndex)}
			<div
				aria-hidden={slot === 'center' ? undefined : 'true'}
				style:transform={SLOT_STYLES[slot].transform}
				style:opacity={SLOT_STYLES[slot].opacity}
				style:z-index={SLOT_STYLES[slot].zIndex}
				class={[
					'absolute inset-0 overflow-hidden rounded-[10px] bg-surface shadow-card backface-hidden',
					'transition-[transform,opacity] duration-800 ease-[cubic-bezier(0.22,1,0.36,1)]',
					// Less motion asked for: no travel, only the centre slide, crossfading.
					'motion-reduce:transform-none! motion-reduce:transition-opacity',
					slot !== 'center' && 'motion-reduce:opacity-0!',
					phase === 'rewinding' && 'transition-none'
				]}
			>
				<img src={slide.src} alt={slide.alt} width="1672" height="941" class="size-full" />
			</div>
		{/each}

		{#if isInteractive && phase === 'showing'}
			{#if activeIndex > 0}
				<DelegateSlidesTurn
					side="left"
					stage={DELEGATE_SLIDES[activeIndex - 1].stage}
					onclick={() => turnTo(activeIndex - 1)}
				/>
			{/if}
			{#if activeIndex < lastIndex}
				<DelegateSlidesTurn
					side="right"
					stage={DELEGATE_SLIDES[activeIndex + 1].stage}
					onclick={() => turnTo(activeIndex + 1)}
				/>
			{/if}
		{/if}
	</div>
</div>
