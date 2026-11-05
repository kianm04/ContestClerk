<script lang="ts">
	import type { FormatWarning } from '$lib/resolution-checks';
	import PaperSideHeading from './PaperSideHeading.svelte';

	type Props = {
		warnings: FormatWarning[];
		/** Puts the cursor at the end of the clause a warning is about. */
		onFocus: (clauseName: string) => void;
		/** The line under the warnings, or `null` for none: the dais decides, so it needs none. */
		note?: string | null;
	};

	let {
		warnings,
		onFocus,
		note = 'They never stop you submitting: the dais decides.'
	}: Props = $props();
</script>

<!--
	What in the text does not follow the format, worked out again as the
	authors type. Each warning goes to its clause, which the editor underlines
	with an amber dotted line. They are warnings only (section 4).
-->
<section aria-label="Format checks">
	<PaperSideHeading
		title="Format checks"
		count={warnings.length === 0 ? null : String(warnings.length)}
	/>
	{#if warnings.length === 0}
		<p class="mt-2 text-small text-muted-foreground">No warnings.</p>
	{:else}
		<ul class="mt-1">
			<!-- A clause can have two warnings, so the key is the clause and the sentence together. -->
			{#each warnings as warning (`${warning.clauseName}: ${warning.sentence}`)}
				<li>
					<button
						type="button"
						class="flex min-h-11 w-full cursor-pointer items-start gap-2 py-1.5 text-left text-small text-link sm:min-h-0"
						onclick={() => onFocus(warning.clauseName)}
					>
						<span class="mt-2 size-1.5 flex-none rounded-full bg-warning" aria-hidden="true"></span>
						{warning.sentence}
					</button>
				</li>
			{/each}
		</ul>
		{#if note !== null}
			<p class="mt-2 text-small text-muted-foreground">{note}</p>
		{/if}
	{/if}
</section>
