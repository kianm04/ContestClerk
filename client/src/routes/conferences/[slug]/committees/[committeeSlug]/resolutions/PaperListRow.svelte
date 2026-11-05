<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { paperKindAndNumber, type PaperListItem } from '$lib/committee-papers';
	import PaperStatus from './PaperStatus.svelte';

	type Props = {
		paper: PaperListItem;
		/** The paper's own page. */
		href: ResolvedPathname;
		/** True where a paper's status differs from one row to the next. */
		showsStatus: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { paper, href, showsStatus }: Props = $props();

	/** The meta line: what kind of paper it is, its number once it has one, and its topic. */
	const metaLine = $derived(
		[paperKindAndNumber(paper), paper.topic ?? ''].filter((part) => part !== '').join(' · ')
	);
</script>

<!--
	One paper as a stacked row on a phone, where the table's columns do not
	fit. The title and the meta line under it are one link, so the whole of
	the left side can be pressed.
-->
<div class="flex items-center justify-between gap-3 border-b border-border">
	<a {href} class="flex min-h-11 min-w-0 flex-1 flex-col justify-center py-3">
		<span class="text-body font-medium text-link">{paper.title}</span>
		<span class="text-small text-muted-foreground">{metaLine}</span>
	</a>

	{#if showsStatus}
		<PaperStatus {paper} />
	{/if}
</div>
