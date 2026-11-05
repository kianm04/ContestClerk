<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { submittedText, type DaisPaper } from '$lib/chair-resolutions';
	import { paperKindAndNumber } from '$lib/committee-papers';
	import { statusLabel } from '$lib/status';

	type Props = {
		paper: DaisPaper;
		/** The paper's review page. */
		href: ResolvedPathname;
		timeZone: string;
		/** False when no paper in the table has a topic, which leaves the column out. */
		showsTopic: boolean;
		/** True in *Decided*, where each paper ended its own way. */
		showsResult: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { paper, href, timeZone, showsTopic, showsResult }: Props = $props();
</script>

<!-- One row of a section's table; `DaisListRow` is the same paper on a phone. -->
<tr class="border-b border-border text-dense text-foreground">
	<td class="p-3">
		<a {href} class="font-medium text-link">{paper.title}</a>
		<p class="text-small text-muted-foreground">{paperKindAndNumber(paper)}</p>
	</td>

	{#if showsTopic}
		<td class="p-3">{paper.topic ?? ''}</td>
	{/if}

	<td class="p-3">{paper.leadSeatName ?? ''}</td>
	<!-- `tabular-nums` keeps the times lined up from one row to the next. -->
	<td class="p-3 whitespace-nowrap tabular-nums">
		{paper.submittedAt === null ? '' : submittedText(paper.submittedAt, timeZone)}
	</td>

	{#if showsResult}
		<td class="p-3">{statusLabel('paper_status', paper.status)}</td>
	{/if}
</tr>
