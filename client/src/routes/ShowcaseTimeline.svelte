<script lang="ts">
	import Checkmark from 'carbon-icons-svelte/lib/Checkmark.svelte';
	import type { ShowcaseStep, ShowcaseStepState } from '$lib/landing-showcase';

	type Props = {
		/** The steps from first to last, exactly one of them `current`. */
		steps: ShowcaseStep[];
	};

	let { steps }: Props = $props();

	/* Written out in full, because Tailwind reads the class names out of this
	   file and cannot follow a name that is glued together while the page runs. */
	const CIRCLE_SHAPE = 'flex size-6 shrink-0 items-center justify-center rounded-full';
	const CIRCLE_CLASSES: Record<ShowcaseStepState, string> = {
		done: 'bg-brand-700 text-surface',
		current: 'border-2 border-brand-700 bg-surface',
		upcoming: 'border-2 border-line bg-surface'
	};
	const LABEL_CLASSES: Record<ShowcaseStepState, string> = {
		done: 'font-medium text-ink-900',
		current: 'font-medium text-brand-700',
		upcoming: 'text-ink-600'
	};
	// What is still to come is greyed out, the way a form greys out what cannot
	// be used yet.
	const DETAIL_CLASSES: Record<ShowcaseStepState, string> = {
		done: 'text-ink-600',
		current: 'text-ink-600',
		upcoming: 'text-ink-400'
	};

	/** The line down to the next step is blue once this step is done. */
	function connectorClass(state: ShowcaseStepState): string {
		return state === 'done' ? 'bg-brand-100' : 'bg-line';
	}
</script>

<!--
	The steps down the left of the card on the right of the example, after the
	landing page's mockup (Trello RBz46aTQ): ticked circles for what is done, a
	blue ring for where things stand, and empty grey circles for what is to come.
	The line between two circles belongs to the upper step, and the last step
	has none. Steps have no id, so they are keyed by position.
-->
<ol class="flex flex-col">
	{#each steps as step, index (index)}
		<li class="relative flex gap-5.5 pb-5 last:pb-0">
			{#if index < steps.length - 1}
				<span class="absolute top-6 bottom-0 left-2.75 w-0.5 {connectorClass(step.state)}"></span>
			{/if}

			<span class="{CIRCLE_SHAPE} {CIRCLE_CLASSES[step.state]}">
				{#if step.state === 'done'}
					<Checkmark size={16} aria-hidden="true" />
				{:else if step.state === 'current'}
					<span class="size-3 rounded-full bg-brand-700"></span>
				{/if}
			</span>

			<span class="flex flex-col text-caption">
				<span class={LABEL_CLASSES[step.state]}>{step.label}</span>
				<span class={DETAIL_CLASSES[step.state]}>{step.detail}</span>
			</span>
		</li>
	{/each}
</ol>
