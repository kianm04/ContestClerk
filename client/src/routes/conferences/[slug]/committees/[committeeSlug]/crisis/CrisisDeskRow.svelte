<script lang="ts">
	import { crisisDeskMetaLine, type CrisisDeskItem } from '$lib/crisis-papers';
	import { crisisPaperUrl } from '$lib/urls';
	import PaperStatus from '../resolutions/PaperStatus.svelte';

	type Props = {
		item: CrisisDeskItem;
		/** True for an answered paper, whose answer differs from one row to the next. */
		showsStatus: boolean;
		conferenceSlug: string;
		committeeSlug: string;
		/** The conference's time zone, which the times are told in. */
		timeZone: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { item, showsStatus, conferenceSlug, committeeSlug, timeZone }: Props = $props();
</script>

<!--
	One paper on the crisis staff's list: its title and the line under it are
	one link to where it is answered, with how it was answered beside them.
-->
<li class="flex items-center justify-between gap-3 border-b border-border">
	<a
		href={crisisPaperUrl(conferenceSlug, committeeSlug, item.id)}
		class="flex min-h-11 min-w-0 flex-1 flex-col justify-center py-3"
	>
		<span class="text-body font-medium text-link">{item.title}</span>
		<span class="text-small text-muted-foreground tabular-nums">
			{crisisDeskMetaLine(item, timeZone)}
		</span>
	</a>
	{#if showsStatus}
		<PaperStatus paper={{ status: item.status, isOpenForSignatures: false }} />
	{/if}
</li>
