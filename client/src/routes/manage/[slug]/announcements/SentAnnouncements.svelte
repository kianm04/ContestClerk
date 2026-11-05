<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import type { Announcement } from '$lib/announcements';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import AnnouncementRow from './AnnouncementRow.svelte';

	type Props = {
		/** Every announcement of the conference, pinned first, then newest first. */
		announcements: Announcement[];
		/** The moment the page was drawn, for "3 hours ago". */
		now: Date;
		/** The conference's timezone, which dates are shown in. */
		timezone: string;
		conferenceSlug: string;
		/** The page's instant form, which shows pinning and deleting at once (`+page.svelte`). */
		onSubmit: SubmitFunction;
		/** The announcements the reader may read but not change. */
		readOnlyIds: string[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { announcements, now, timezone, conferenceSlug, onSubmit, readOnlyIds }: Props = $props();
</script>

<!-- Everything already sent, under a heading over a dark rule. -->
<ManageSection title="Sent">
	{#if announcements.length === 0}
		<div class="mt-4">
			<EmptyState
				icon={Megaphone}
				title="No announcements yet."
				description="Everything you post here also arrives as a notification."
			/>
		</div>
	{:else}
		<ul>
			<!-- The `(announcement.id)` key lets Svelte reuse list items instead of rebuilding them. -->
			{#each announcements as announcement (announcement.id)}
				<li class="border-b border-border">
					<AnnouncementRow
						{announcement}
						{now}
						{timezone}
						{conferenceSlug}
						{onSubmit}
						canChange={!readOnlyIds.includes(announcement.id)}
					/>
				</li>
			{/each}
		</ul>
	{/if}
</ManageSection>
