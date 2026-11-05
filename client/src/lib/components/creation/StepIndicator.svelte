<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import type { CreationStep } from '$lib/creation-steps';

	type Props = {
		/** The five steps, from `creationSteps()` in `$lib/creation-steps.ts`. */
		steps: CreationStep[];
		/** The words under the circles: `roomy` on the first three steps, `dense` on Setup and Launch, as the designs draw them. */
		density?: 'roomy' | 'dense';
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { steps, density = 'roomy' }: Props = $props();

	/*
		Written out in full so Tailwind can find the classes. As the designs draw
		it: a step behind the reader is a solid green circle with a tick, the one
		under their feet is filled blue, and the ones ahead are an outlined number.
	*/
	const MARK_CLASSES = {
		done: 'bg-creation-green text-white',
		current: 'bg-creation-blue font-semibold text-white',
		upcoming: 'border-2 border-creation-step-border bg-white font-medium text-creation-ink-600'
	};

	const LABEL_CLASSES = {
		done: 'font-medium text-creation-ink-600',
		current: 'font-semibold text-creation-blue',
		upcoming: 'font-medium text-creation-ink-250'
	};

	const LABEL_SIZES = { roomy: 'mt-2.5 fs-15 lh-18', dense: 'mt-2 fs-14 lh-17' };
</script>

<!--
	Five circles in 116 pixel slots joined by a short grey line, the step's name
	under each, every size the design's. On a phone the slots are narrow, the
	lines are left out and the names are left for screen readers, because five
	of them do not fit beside each other in 390px; each slot is still 44px tall,
	so a thumb has room to press.
-->
<nav aria-label="Steps">
	<ol class="flex">
		<!-- The `(step.key)` key lets Svelte keep each step's element as the list redraws. -->
		{#each steps as step, index (step.key)}
			<li class="relative w-11 text-center lg:w-29">
				<!--
					`svelte:element` draws the tag named in `this`: a link for a step
					that can be revisited, plain text for the others.
				-->
				<svelte:element
					this={step.href ? 'a' : 'span'}
					href={step.href}
					aria-current={step.state === 'current' ? 'step' : undefined}
					class="flex min-h-11 flex-col items-center lg:min-h-0"
				>
					<span
						class="flex size-9 items-center justify-center rounded-full fs-16 tabular-nums transition-colors {MARK_CLASSES[
							step.state
						]}"
					>
						{#if step.state === 'done'}
							<Check class="size-4.5" strokeWidth={3} aria-hidden="true" />
							<span class="sr-only">{step.number}, done:</span>
						{:else}
							{step.number}
						{/if}
					</span>
					<span
						class="sr-only block whitespace-nowrap lg:not-sr-only {LABEL_SIZES[
							density
						]} {LABEL_CLASSES[step.state]}"
					>
						{step.label}
					</span>
				</svelte:element>
				{#if index < steps.length - 1}
					<span
						aria-hidden="true"
						class="absolute top-4.25 left-20.5 hidden h-0.5 w-17 bg-creation-connector lg:block"
					></span>
				{/if}
			</li>
		{/each}
	</ol>
</nav>
