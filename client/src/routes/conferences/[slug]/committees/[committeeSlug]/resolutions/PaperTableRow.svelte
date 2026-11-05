<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { paperKindAndNumber, type PaperListItem } from '$lib/committee-papers';
	import PaperStatus from './PaperStatus.svelte';

	type Props = {
		paper: PaperListItem;
		/** The paper's own page. */
		href: ResolvedPathname;
		/** False when every paper in the table has no topic, which leaves the column out. */
		showsTopic: boolean;
		/** True where a paper's status differs from one row to the next. */
		showsStatus: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { paper, href, showsTopic, showsStatus }: Props = $props();
</script>

<!-- One row of a section's table; `PaperListRow` is the same paper on a phone. -->
<tr class="border-b border-border text-dense text-foreground">
	<td class="p-3">
		<a {href} class="font-medium text-link">{paper.title}</a>
		<p class="text-small text-muted-foreground">{paperKindAndNumber(paper)}</p>
	</td>

	{#if showsTopic}
		<td class="p-3">{paper.topic ?? ''}</td>
	{/if}

	{#if showsStatus}
		<td class="p-3"><PaperStatus {paper} /></td>
	{/if}
</tr>
