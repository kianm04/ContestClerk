<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import type { ResolvedPathname } from '$app/types';
	import type { SetupCommittee } from '$lib/creation-setup-dialog';
	import { createStepUrl } from '$lib/urls';
	import CommitteeRow from './CommitteeRow.svelte';

	type Props = {
		slug: string;
		committees: SetupCommittee[];
		showAll: boolean;
		allCommitteesUrl: ResolvedPathname;
		/** Whether the reader's role manages every committee. Without it, editing and deleting would only be refused here, so somebody who manages only their own committees edits them on the committees page. */
		canManageCommittees: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { slug, committees, showAll, allCommitteesUrl, canManageCommittees }: Props = $props();

	/** How many rows show before "Show all". */
	const FIRST_ROWS = 3;

	// `$derived` works these out again whenever the props change.
	const shown = $derived(showAll ? committees : committees.slice(0, FIRST_ROWS));
	const hasMore = $derived(committees.length > FIRST_ROWS);

	// The header cells share their type: 13 design pixels in the table's grey.
	const headerClass = 'text-left fs-13 font-medium text-creation-ink-275';
</script>

<!--
	The table in its own hairline box with 10 pixel corners, the columns at the
	design's widths (42, 60, 452, 134 and 240, the actions taking the rest).
	`table-fixed` holds them there whatever the names say. On a phone the box
	scrolls sideways inside itself, so the page itself never does; `relative`
	keeps the screen-reader-only headers inside that box too.
-->
<div class="relative mt-1 overflow-x-auto rounded-lg border border-creation-card-border bg-white">
	<table class="w-full min-w-200 table-fixed border-collapse">
		<colgroup>
			<col class="w-10.5" />
			<col class="w-15" />
			<col class="w-113" />
			<col class="w-33.5" />
			<col class="w-60" />
			<col />
		</colgroup>
		<thead>
			<tr class="h-7.5 border-b border-creation-rule">
				<!-- The first column holds the row's grip, which needs no heading. -->
				<th scope="col"><span class="sr-only">Order</span></th>
				<th scope="col" class="pl-6.75 {headerClass}">#</th>
				<th scope="col" class="pl-6.75 {headerClass}">Committee name</th>
				<th scope="col" class={headerClass}>Seats</th>
				<th scope="col" class={headerClass}>Room</th>
				<th scope="col"><span class="sr-only">Actions</span></th>
			</tr>
		</thead>
		<tbody>
			<!-- Keyed by id, so Svelte keeps each row's elements with its committee. -->
			{#each shown as committee, index (committee.id)}
				<CommitteeRow {slug} {committee} number={index + 1} {canManageCommittees} />
			{/each}
		</tbody>
	</table>
</div>

{#if hasMore}
	<!-- The choice lives in the address, so it is a link both ways. -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -- both addresses are built by resolve(); only the #committees anchor is added -->
	<a
		href={showAll ? createStepUrl(slug, 'setup') + '#committees' : allCommitteesUrl + '#committees'}
		class="mt-1 ml-3.25 inline-flex h-6.5 items-center gap-4 fs-14 font-medium text-creation-blue hover:underline max-lg:min-h-11"
	>
		<Plus class="size-4.5" aria-hidden="true" />
		{showAll ? 'Show fewer committees' : `Show all ${committees.length} committees`}
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{/if}
