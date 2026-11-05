<script lang="ts">
	import { applicationListConference, type ApplicationListEntry } from '$lib/applications';
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import { homeApplicationHref, homeApplicationLine } from '$lib/home';
	import { applicationStatus } from '$lib/home-rows';

	type Props = {
		/** One application of the reader's own, or one delegation they belong to. */
		entry: ApplicationListEntry;
		/**
		 * The moment the page was drawn, which a draft's "closes in 5 days" is
		 * counted from. It is passed in rather than read from the clock here, so
		 * the server and the browser draw the same row.
		 */
		now: Date;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { entry, now }: Props = $props();

	// `$derived` works each of these out again whenever `entry` or `now`
	// changes. They are named here rather than called in the markup so that each
	// question is asked once and the markup below stays flat.
	const conference = $derived(applicationListConference(entry));
	const line = $derived(homeApplicationLine(entry, now));
	const status = $derived(applicationStatus(entry));
</script>

<!--
	One row of "Applications" on `/home`: the conference's name, one quiet line
	and the status word, the whole row a link to the application or the
	delegation. It is an `<li>`, so the section puts these rows inside a `<ul>`.
	`min-w-0` lets the name wrap instead of pushing the word off the edge.
-->
<li>
	<a
		href={homeApplicationHref(entry)}
		class="flex min-h-13 items-center justify-between gap-4 border-b border-border px-1 py-2 transition-colors duration-150 hover:bg-accent"
	>
		<div class="min-w-0">
			<h3 class="font-display text-h3 text-foreground">{conference.name}</h3>
			<p class="text-small text-muted-foreground">{line}</p>
		</div>

		<!-- A grey dot would only repeat a grey word, so "Draft" is plain text. -->
		<div class="shrink-0">
			{#if status.hasDot}
				<StatusDot text={status.text} tone={status.tone} />
			{:else}
				<span class="text-small text-foreground">{status.text}</span>
			{/if}
		</div>
	</a>
</li>
