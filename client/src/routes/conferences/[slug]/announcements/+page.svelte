<script lang="ts">
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import { conferenceAnnouncementsUrl, conferenceUrl } from '$lib/urls';
	import AnnouncementCard from './AnnouncementCard.svelte';
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned. It is replaced
	// with fresh results every time the URL changes, such as on the pager.
	let { data }: PageProps = $props();

	// `$derived` works these out again whenever `data` changes.
	const now = $derived(new Date(data.now));
	const slug = $derived(data.conference.slug);

	/** The address of one page of the list, for the pager's links. */
	function pageHref(page: number) {
		return conferenceAnnouncementsUrl(slug, { page });
	}
</script>

<svelte:head>
	<title>Announcements · {data.conference.name} · MUNMeet</title>
</svelte:head>

<div class="mx-auto flex max-w-190 flex-col gap-4">
	<a class="text-small text-brand-700 hover:underline" href={conferenceUrl(slug)}>
		← {data.conference.name}
	</a>

	<PageHeader title="Announcements" />

	<!-- A notification for an announcement that has since been deleted leads here. -->
	{#if data.isRemoved}
		<Notice tone="info">That announcement was removed.</Notice>
	{/if}

	{#if data.announcements.length === 0}
		<EmptyState
			icon={Megaphone}
			title="No announcements yet."
			description="The organisers will post updates here."
		/>
	{:else}
		<ul class="flex flex-col gap-4">
			<!-- The `(announcement.id)` key lets Svelte reuse list items instead of rebuilding them. -->
			{#each data.announcements as announcement (announcement.id)}
				<li>
					<AnnouncementCard {announcement} {now} timezone={data.conference.timezone} />
				</li>
			{/each}
		</ul>
	{/if}

	<Pagination page={data.page} pageCount={data.pageCount} hrefForPage={pageHref} />
</div>
