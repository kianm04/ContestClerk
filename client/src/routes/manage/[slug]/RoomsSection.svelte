<script lang="ts">
	import DataTable, { type TableColumn } from '$lib/components/DataTable.svelte';
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import type { LiveRoomRow } from '$lib/dashboard-rooms';
	import { manageConferenceUrl } from '$lib/urls';
	import RoomListItem from './RoomListItem.svelte';
	import RoomTableRow from './RoomTableRow.svelte';

	type Props = {
		/** Every committee room, in the organiser's own order. */
		rooms: LiveRoomRow[];
		/** "Present: 78 of 84 delegates in 2 rooms · As of 13:02". */
		total: string;
		conferenceSlug: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { rooms, total, conferenceSlug }: Props = $props();

	/** The table's headings. */
	const COLUMNS: TableColumn[] = [
		{ key: 'committee', label: 'Committee' },
		{ key: 'activity', label: 'What is happening' },
		{ key: 'present', label: 'Present', width: 'w-28' },
		{ key: 'chair', label: 'Chair', width: 'w-40' },
		{ key: 'room', label: 'Chair room', width: 'w-40' }
	];
</script>

<!--
	On a conference day: what each room is doing and who is present, with the
	way into it, and the total over every sitting room.
-->
<ManageSection title="Rooms">
	{#if rooms.length === 0}
		<p class="px-1 py-4 text-dense text-muted-foreground">This conference has no committees.</p>
	{:else}
		<div class="hidden md:block">
			<DataTable columns={COLUMNS} isDense>
				<!-- The `(room.committeeId)` key lets Svelte reuse rows instead of rebuilding them. -->
				{#each rooms as room (room.committeeId)}
					<RoomTableRow {room} {conferenceSlug} />
				{/each}
			</DataTable>
		</div>

		<ul class="md:hidden">
			{#each rooms as room (room.committeeId)}
				<RoomListItem {room} {conferenceSlug} />
			{/each}
		</ul>
	{/if}

	<!--
		"Refresh" is a plain link to this same page. `data-sveltekit-reload` makes
		the browser load it afresh, as it would without JavaScript, because
		SvelteKit would otherwise see the same address and not run `load` again.
	-->
	<p class="mt-3 text-small text-muted-foreground">
		{total} ·
		<a
			href={manageConferenceUrl(conferenceSlug)}
			data-sveltekit-reload
			class="font-medium text-link hover:underline">Refresh</a
		>
	</p>
</ManageSection>
