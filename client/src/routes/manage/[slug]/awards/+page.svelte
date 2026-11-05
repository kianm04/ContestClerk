<script lang="ts">
	import Landmark from '@lucide/svelte/icons/landmark';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ManageHeader from '$lib/components/manage/ManageHeader.svelte';
	import { EMPTY_PUBLISH_FORM } from '$lib/award-form';
	import { committeesWithoutConfirmedAwards, countAwards, type Award } from '$lib/awards';
	import { formatDayAndTime } from '$lib/dates';
	import { createInstantForm } from '$lib/instant-form.svelte';
	import {
		awardSectionsAfterPresses,
		describeOrganiserAwardFailure,
		expectOrganiserAwardChange
	} from '$lib/organiser-award-presses';
	import { awardsSummary } from '$lib/organiser-awards-text';
	import type { RowChange } from '$lib/row-changes';
	import { manageCommitteesUrl } from '$lib/urls';
	import AwardsCommitteeSection from './AwardsCommitteeSection.svelte';
	import PublishAwardsPanel from './PublishAwardsPanel.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned together with what the
	// layout above it loaded, which is where the conference comes from. `load`
	// runs again whenever the address changes, such as on "Edit title" or "Add
	// award", and after every action. `form` is what a refused action answered.
	let { data, form }: PageProps = $props();

	const slug = $derived(data.conference.slug);
	const timeZone = $derived(data.conference.timezone);
	const isPublished = $derived(data.awardsPublishedAt !== null);
	const publishedMoment = $derived(
		data.awardsPublishedAt === null ? null : formatDayAndTime(data.awardsPublishedAt, timeZone)
	);

	/*
		Every row's "Confirm", "Unconfirm" and "Delete" goes through this one
		instant form, so the row changes the moment it is pressed rather than
		once the server has answered (T142). The committees, the counts in the
		header and the publish panel's list are all drawn from the awards with
		the presses still on their way laid on top
		(`$lib/organiser-award-presses.ts`).
	*/
	const awardForm = createInstantForm<RowChange<Award>[]>({
		describeFailure: describeOrganiserAwardFailure
	});
	const submitAwardPress = awardForm.submitExpecting(expectOrganiserAwardChange);
	const shownSections = $derived(awardSectionsAfterPresses(data.sections, awardForm.presses));
	const counts = $derived(countAwards(shownSections));
</script>

<svelte:head>
	<title>Awards · {data.conference.name} · MUNMeet</title>
</svelte:head>

<ManageHeader title="Awards" summary={awardsSummary(counts, publishedMoment)} />

<div class="flex flex-col gap-11">
	{#if data.sections.length === 0}
		<EmptyState
			icon={Landmark}
			title="No committees yet."
			description="Awards are given per committee. Add committees first."
			actionLabel="Add committees"
			actionHref={manageCommitteesUrl(slug)}
		/>
	{:else}
		<!-- The `(section.committee.id)` key lets Svelte reuse sections instead of rebuilding them. -->
		{#each shownSections as section (section.committee.id)}
			<AwardsCommitteeSection
				{section}
				{isPublished}
				readerId={data.readerId}
				renamingAwardId={data.renamingAwardId}
				addingCommitteeId={data.addingCommitteeId}
				refusal={form ?? null}
				{slug}
				onAwardPress={submitAwardPress}
			/>
		{/each}

		<PublishAwardsPanel
			{publishedMoment}
			committeesWithoutAwards={committeesWithoutConfirmedAwards(shownSections)}
			values={form?.publish ?? EMPTY_PUBLISH_FORM}
			{timeZone}
			confirmedCount={counts.confirmed}
			proposedCount={counts.proposed}
		/>
	{/if}
</div>
