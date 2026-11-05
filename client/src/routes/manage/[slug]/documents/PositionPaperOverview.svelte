<script lang="ts">
	import Users from '@lucide/svelte/icons/users';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import type { Conference } from '$lib/conferences';
	import {
		totalPaperCounts,
		type DocumentsPageView,
		type PaperCommitteeRow,
		type PaperSeatRow
	} from '$lib/documents-page';
	import PaperCountsTable from './PaperCountsTable.svelte';
	import PaperDeadlineNotice from './PaperDeadlineNotice.svelte';
	import PaperSeatList from './PaperSeatList.svelte';

	type Props = {
		conference: Conference;
		/** One row per committee, with its filled seats counted by paper status. */
		committees: PaperCommitteeRow[];
		/** The committee `?committee=` chose, or `null` before one is chosen. */
		selectedCommittee: PaperCommitteeRow | null;
		/** The chosen committee's filled seats, already filtered by `?paper=`. */
		seats: PaperSeatRow[];
		/** What the address says: the committee, the filter and the open review form. */
		view: DocumentsPageView;
		/** What was typed into "Request changes" before a refusal. */
		reviewComment: string;
		reviewError: string | null;
	};

	let {
		conference,
		committees,
		selectedCommittee,
		seats,
		view,
		reviewComment,
		reviewError
	}: Props = $props();

	// `$derived` adds the seats up again whenever the committees change.
	const filledSeatCount = $derived(totalPaperCounts(committees).filledSeatCount);
</script>

<div class="flex flex-col gap-6">
	<PaperDeadlineNotice {conference} />

	{#if filledSeatCount === 0}
		<EmptyState
			icon={Users}
			title="No delegates seated yet."
			description="Papers are counted per seat, so this fills in once delegates have seats."
		/>
	{:else}
		<PaperCountsTable {committees} conferenceSlug={conference.slug} />

		{#if selectedCommittee}
			<PaperSeatList
				committee={selectedCommittee}
				{seats}
				{view}
				conferenceSlug={conference.slug}
				{reviewComment}
				{reviewError}
			/>
		{/if}
	{/if}
</div>
