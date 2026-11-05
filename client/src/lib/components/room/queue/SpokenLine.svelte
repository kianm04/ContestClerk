<script lang="ts">
	import { speechText, type GslEntry } from '$lib/gsl-floor';

	type Props = {
		/** The speeches made on the list this session, latest first (`speechesLatestFirst`). */
		speeches: GslEntry[];
	};

	let { speeches }: Props = $props();

	// "France 1:25 · United States 1:30", cut short to the column's width.
	const line = $derived(speeches.map(speechText).join(' · '));
</script>

<!--
	One line under the list, "Spoken 2  France 1:25 · United States 1:30",
	latest first. It is a native `<details>`, so a press opens it, with or
	without JavaScript, to every speech on the list with its time. The
	`[&::-webkit-details-marker]:hidden` class hides the triangle Safari draws.
-->
{#if speeches.length > 0}
	<details>
		<summary
			class="flex cursor-pointer list-none gap-3 text-ink-600 tabular-nums max-md:min-h-11 max-md:items-center [&::-webkit-details-marker]:hidden"
		>
			<span class="flex-none font-medium text-ink-900">Spoken {speeches.length}</span>
			<span class="truncate" title={line}>{line}</span>
		</summary>
		<ol class="mt-2 flex max-h-40 flex-col gap-1 overflow-auto text-ink-600 tabular-nums">
			<!-- The `(speech.id)` key lets Svelte reuse each line instead of rebuilding it. -->
			{#each speeches as speech (speech.id)}
				<li>{speechText(speech)}</li>
			{/each}
		</ol>
	</details>
{/if}
