<script lang="ts">
	type Props = {
		/** 1 to 5: how many of the five segments are filled. */
		phaseNumber: number;
		/** The phase in bold after the bar: "Applications". */
		phaseName: string;
		/** What the phase is doing: "open until 25 October". */
		phaseDetail: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { phaseNumber, phaseName, phaseDetail }: Props = $props();

	/** The five phases, in order, each segment named after one for a pointer's tooltip. */
	const PHASE_TITLES = ['Set up', 'Applications', 'Seats', 'Conference', 'After'];

	// `$derived` works the label out again whenever the props change.
	const barLabel = $derived(`Phase ${phaseNumber} of ${PHASE_TITLES.length}: ${phaseName}`);
</script>

<!--
	Where a conference is in its life: five short segments, the ones up to and
	including the current phase in blue, then the phase's name and what it is
	doing. A screen reader hears the label rather than five empty shapes.
-->
<div class="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
	<span role="img" aria-label={barLabel} class="inline-flex gap-0.75">
		<!-- The titles are plain strings with no id, so the list is keyed by position. -->
		{#each PHASE_TITLES as title, index (index)}
			<span {title} class="h-1 w-7 rounded-xs {index < phaseNumber ? 'bg-ring' : 'bg-border'}"
			></span>
		{/each}
	</span>

	<span class="text-small text-foreground">
		<span class="font-semibold">{phaseName}</span>
		<span class="text-muted-foreground">· {phaseDetail}</span>
	</span>
</div>
