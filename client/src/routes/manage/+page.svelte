<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import Button from '$lib/components/Button.svelte';
	import ManageHeader from '$lib/components/manage/ManageHeader.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { isManagingNothing } from '$lib/manage';
	import {
		conferenceListSections,
		inSessionBands,
		manageListSummary,
		organizationFooter
	} from '$lib/manage-list';
	import { createConferenceUrl } from '$lib/urls';
	import ConferenceSection from './ConferenceSection.svelte';
	import InSessionBand from './InSessionBand.svelte';
	import InvitationList from './InvitationList.svelte';
	import NothingManaged from './NothingManaged.svelte';
	import OrganizationFooter from './OrganizationFooter.svelte';
	import StaffConferenceList from './StaffConferenceList.svelte';
	import type { PageProps } from './$types';

	// `PageProps` comes from `./$types`, which SvelteKit writes for this folder.
	// `data` is whatever `load` in `+page.server.ts` returned, and it is read
	// again after every action on this page and whenever the address changes.
	// `form` is what the last action returned, and is `null` until accepting an
	// invitation or deleting a draft has failed.
	let { data, form }: PageProps = $props();

	// `$derived` works each of these out again whenever `data` changes. `now`
	// arrives as text, so it is turned back into a date first; every phase on
	// the page is worked out from that one moment.
	const now = $derived(new Date(data.now));
	const isManagingNothingYet = $derived(isManagingNothing(data));
	const summary = $derived(manageListSummary(data.organizations, now));
	const bands = $derived(data.view === 'upcoming' ? inSessionBands(data.organizations, now) : []);
	const sections = $derived(conferenceListSections(data.organizations, data.view, now));
	const footers = $derived(data.organizations.map(organizationFooter));
</script>

<svelte:head>
	<!-- A private page has nothing to share, so it writes its own title rather
		than using `PageMeta`, which asks for a description for the link card. -->
	<title>Your conferences · MUNMeet</title>
</svelte:head>

<!--
	The page draws its own column: the manage frame's `<main>` is a plain white
	sheet with no width limit. 1rem at each side on a phone, 3rem on a laptop,
	and at most 65rem of content between them (71rem with the 3rem each side).
-->
<div class="mx-auto w-full max-w-[71rem] px-4 pt-6 pb-12 lg:px-12 lg:pt-9 lg:pb-16">
	<ManageHeader title="Your conferences" summary={isManagingNothingYet ? undefined : summary}>
		<Button
			label="Create conference"
			variant="secondary"
			size="dense"
			icon={Plus}
			href={createConferenceUrl()}
		/>
	</ManageHeader>

	<div class="flex flex-col gap-10">
		{#if form?.message}
			<Notice tone="error">{form.message}</Notice>
		{/if}

		<!-- The `(band.id)` key lets Svelte reuse each band instead of rebuilding it. -->
		{#each bands as band (band.id)}
			<InSessionBand {band} />
		{/each}

		{#each sections as section (section.id)}
			<ConferenceSection {section} />
		{/each}

		<!-- Left out rather than shown empty: somebody who helps with nothing has
			no section here at all. -->
		{#if data.staffConferences.length > 0}
			<StaffConferenceList staffConferences={data.staffConferences} />
		{/if}

		{#if data.pendingInvites.length > 0}
			<InvitationList invites={data.pendingInvites} />
		{/if}

		{#if isManagingNothingYet}
			<NothingManaged />
		{/if}

		{#if footers.length > 0}
			<div class="flex flex-col gap-2">
				{#each footers as footer (footer.id)}
					<OrganizationFooter {footer} />
				{/each}
			</div>
		{/if}
	</div>
</div>
