<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import { EMPTY_AWARD_FORM, type AwardsRefusal } from '$lib/award-form';
	import { canRenameAward, type CommitteeAwards } from '$lib/awards';
	import { manageAwardsCommitteeUrl } from '$lib/urls';
	import AddAwardForm from './AddAwardForm.svelte';
	import OrganiserAwardRow from './OrganiserAwardRow.svelte';

	type Props = {
		/** One committee with its awards and the seats that have a delegate. */
		section: CommitteeAwards;
		/** Whether the conference's awards are published. Only Unpublish works then. */
		isPublished: boolean;
		/** The reader's account id: only a custom award they added can be renamed. */
		readerId: string;
		/** The award whose "Edit title" form is open, or null. */
		renamingAwardId: string | null;
		/** The committee whose "Add award" form is open (`?add=<id>`), or null. */
		addingCommitteeId: string | null;
		/** What the last refused form sent back, or null. */
		refusal: AwardsRefusal | null;
		/** The conference's slug, for the page's own links. */
		slug: string;
		/** Sends a row's "Confirm", "Unconfirm" or "Delete" through the page's instant form. */
		onAwardPress: SubmitFunction;
	};

	let {
		section,
		isPublished,
		readerId,
		renamingAwardId,
		addingCommitteeId,
		refusal,
		slug,
		onAwardPress
	}: Props = $props();

	const committeeId = $derived(section.committee.id);
	// A refused "Add award" form comes back only to the committee it was for.
	const isAddRefused = $derived(refusal?.committeeId === committeeId);
	const addValues = $derived(
		isAddRefused ? (refusal?.values ?? EMPTY_AWARD_FORM) : EMPTY_AWARD_FORM
	);
	const addErrors = $derived(isAddRefused ? (refusal?.errors ?? {}) : {});

	/*
		"Add award" beside the heading is a plain link to `?add=<id>`, which opens
		the form under this committee only. A refused add opens it again too:
		without JavaScript the refusal comes back on the action's own address,
		which has no `?add=` in it.
	*/
	const canAdd = $derived(!isPublished && section.filledSeats.length > 0);
	const isAddFormOpen = $derived(canAdd && (addingCommitteeId === committeeId || isAddRefused));
	const addLink = $derived(
		canAdd && !isAddFormOpen
			? { label: 'Add award', href: manageAwardsCommitteeUrl(slug, committeeId, true) }
			: undefined
	);
	// A refused rename sends back no committee, only the title and its message.
	const isRenameRefused = $derived(refusal !== null && refusal.committeeId === null);
	const refusedTitle = $derived(isRenameRefused ? (refusal?.values?.title ?? null) : null);
	const titleError = $derived(isRenameRefused ? (refusal?.errors.title ?? null) : null);
</script>

<!--
	The committee's full name over a dark rule, with its awards as flat lines under
	it. The `id` is where the form's Cancel lands, and `scroll-mt-24` keeps the
	heading clear of the sticky bar at the top of the window.
-->
<div id="awards-{committeeId}" class="scroll-mt-24">
	<ManageSection title={section.committee.name} link={addLink}>
		{#if section.awards.length === 0}
			<p class="border-b border-border px-1 py-4 text-dense text-muted-foreground">
				No awards yet. Chairs propose awards from their room; you can also add them here.
			</p>
		{:else}
			<ul>
				<!-- The `(award.id)` key lets Svelte reuse rows instead of rebuilding them. -->
				{#each section.awards as award (award.id)}
					<OrganiserAwardRow
						{award}
						{isPublished}
						canRename={canRenameAward(award, readerId, isPublished)}
						isRenaming={award.id === renamingAwardId}
						{refusedTitle}
						{titleError}
						{slug}
						onPress={onAwardPress}
					/>
				{/each}
			</ul>
		{/if}
		<!-- Nothing can be added once the awards are published. -->
		{#if !isPublished && section.filledSeats.length === 0}
			<p class="px-1 pt-4 text-small text-muted-foreground">No delegates seated.</p>
		{:else if isAddFormOpen}
			<AddAwardForm
				{committeeId}
				filledSeats={section.filledSeats}
				values={addValues}
				errors={addErrors}
				cancelHref={manageAwardsCommitteeUrl(slug, committeeId, false)}
			/>
		{/if}
	</ManageSection>
</div>
