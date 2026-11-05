<script lang="ts">
	import type { ApplicationProgress } from '$lib/application-progress';
	import { TONE_TEXT_CLASSES } from '$lib/application-tone-classes';
	import ProgressConnectorLine from './ProgressConnectorLine.svelte';
	import ProgressStepMark from './ProgressStepMark.svelte';

	type Props = {
		/** Worked out on the server by `applicationProgress` in `$lib/application-progress.ts`. */
		progress: ApplicationProgress;
	};

	let { progress }: Props = $props();

	// What a screen reader hears after each step's name, since it cannot see the circles.
	const STATE_WORDS = { done: 'done', current: 'in progress', upcoming: 'not yet' };
</script>

<!--
	Draft, Submitted, Outcome, Allocation, with a line between each step and the
	next. Every step but the last takes an equal share of the width (`flex-1`),
	which its line fills, so the circles come out evenly spaced.

	Each name hangs under its circle (`absolute`, centred on it) rather than
	sitting in the row, so that a long name does not push the circles apart.
	`pb-6` makes room for the names, and `pr-8` for the last one, which reaches
	past the end of the row.
-->
<ol class="flex items-center pr-8 pb-6">
	<!--
		The `(step.label)` key lets Svelte reuse list items instead of rebuilding
		them. `index` finds the line that follows each step.
	-->
	{#each progress.steps as step, index (step.label)}
		<li
			aria-current={step.state === 'current' ? 'step' : undefined}
			class="flex items-center {index < progress.connectors.length ? 'flex-1' : ''}"
		>
			<span class="relative flex">
				<ProgressStepMark state={step.state} tone={progress.tone} />
				<span
					class="absolute top-full left-1/2 mt-1 -translate-x-1/2 text-small whitespace-nowrap {step.isEmphasised
						? TONE_TEXT_CLASSES[progress.tone]
						: 'text-muted-foreground'}"
				>
					{step.label}<span class="sr-only">, {STATE_WORDS[step.state]}</span>
				</span>
			</span>

			{#if index < progress.connectors.length}
				<ProgressConnectorLine state={progress.connectors[index]} tone={progress.tone} />
			{/if}
		</li>
	{/each}
</ol>
