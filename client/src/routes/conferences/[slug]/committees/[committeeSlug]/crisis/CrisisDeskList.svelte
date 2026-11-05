<script lang="ts">
	import type { CrisisDeskItem } from '$lib/crisis-papers';
	import CrisisDeskRow from './CrisisDeskRow.svelte';

	type Props = {
		/** "Waiting for an answer" or "Answered". */
		heading: string;
		items: CrisisDeskItem[];
		/** The one sentence shown while the section is empty. */
		emptySentence: string;
		/** True for the answered papers, whose answers differ from one row to the next. */
		showsStatus?: boolean;
		conferenceSlug: string;
		committeeSlug: string;
		/** The conference's time zone, which the times are told in. */
		timeZone: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let {
		heading,
		items,
		emptySentence,
		showsStatus = false,
		conferenceSlug,
		committeeSlug,
		timeZone
	}: Props = $props();
</script>

<!--
	One of the crisis staff's lists: its heading with the black rule under it,
	then a row per paper (`CrisisDeskRow`). Rows, not a table: there are only
	ever the two lines.
-->
<section aria-label={heading}>
	<h2 class="border-b border-foreground pb-2 font-display text-h2 text-foreground">{heading}</h2>

	{#if items.length === 0}
		<p class="py-3 text-body text-muted-foreground">{emptySentence}</p>
	{:else}
		<ul>
			<!-- The `(item.id)` key lets Svelte move a row instead of rebuilding it. -->
			{#each items as item (item.id)}
				<CrisisDeskRow {item} {showsStatus} {conferenceSlug} {committeeSlug} {timeZone} />
			{/each}
		</ul>
	{/if}
</section>
