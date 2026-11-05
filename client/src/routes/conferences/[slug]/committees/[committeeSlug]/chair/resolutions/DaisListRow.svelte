<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { daisRowMetaLine, type DaisPaper } from '$lib/chair-resolutions';

	type Props = {
		paper: DaisPaper;
		/** The paper's review page. */
		href: ResolvedPathname;
		timeZone: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { paper, href, timeZone }: Props = $props();
</script>

<!--
	One paper as a stacked row on a phone, where the table's columns do not
	fit: its title, and one meta line with its kind and number, its topic, its
	lead and when it was submitted. Both are one link, so the whole row can be
	pressed.
-->
<a {href} class="flex min-h-11 flex-col justify-center border-b border-border py-3">
	<span class="text-body font-medium text-link">{paper.title}</span>
	<span class="text-small text-muted-foreground">{daisRowMetaLine(paper, timeZone)}</span>
</a>
