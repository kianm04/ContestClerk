<script lang="ts">
	import FileText from '@lucide/svelte/icons/file-text';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { paperDeadlineLine } from '$lib/chair-papers';
	import { sharedChairForm } from '$lib/chair-form';
	import { paperSeatsAfterPresses } from '$lib/paper-presses';
	import { chairPapersActionUrl } from '$lib/urls';
	import BackgroundGuideCard from './BackgroundGuideCard.svelte';
	import PaperList from './PaperList.svelte';
	import PaperStats from './PaperStats.svelte';
	import PaperToolbar from './PaperToolbar.svelte';
	import type { PageProps } from './$types';

	// `data` holds what the chair layout's `load` returned and what this page's
	// `load` added in `+page.server.ts`; both run again after every form sent and
	// whenever `?status=` changes. `form` is what a refused action sent back.
	let { data, form }: PageProps = $props();

	const conferenceSlug = $derived(data.conference.slug);
	const committeeSlug = $derived(data.committee.slug);

	// The chair layout's shared instant form (T141): a press's expectation is
	// laid over the seats the current filter shows, so a review or "Approve
	// all" appears at once. `data.counts` still comes straight from the server:
	// it covers every seat of the committee, not only the ones this filter
	// shows, and there is no data here to update that wider count from.
	const chairForm = sharedChairForm();
	const shownPaperSeats = $derived(paperSeatsAfterPresses(data.paperSeats, chairForm.presses));

	/** The address of one action, keeping `?status=` so a refusal comes back on the same filter. */
	function actionUrl(actionName: string): string {
		return chairPapersActionUrl(conferenceSlug, committeeSlug, data.statusFilter, actionName);
	}

	// Only a refused review sends back an error, with the paper it was about.
	const reviewRefusal = $derived(
		form?.reviewError && form.reviewDocumentId
			? {
					documentId: form.reviewDocumentId,
					comment: form.reviewComment ?? '',
					error: form.reviewError
				}
			: null
	);

	// Only a refused upload sends back a title; the audience comes with it.
	const typedGuide = $derived(
		form?.guideTitle == null ? null : { title: form.guideTitle, audience: form.guideAudience ?? '' }
	);
</script>

<div class="mb-6">
	<PageHeader title="Position papers" subtitle={paperDeadlineLine(data.conference)} />
</div>

<div class="flex flex-col gap-6">
	{#if !data.conference.positionPaperRequired}
		<Notice tone="info"><p>This conference does not require position papers.</p></Notice>
	{/if}

	{#if data.seatedCount === 0}
		<EmptyState
			icon={FileText}
			title="No delegates seated yet."
			description="Papers appear once the organisers allocate seats."
		/>
	{:else}
		<PaperStats counts={data.counts} />
		<PaperToolbar
			statusFilter={data.statusFilter}
			awaitingCount={data.counts.submitted}
			paperSeats={shownPaperSeats}
			{conferenceSlug}
			{committeeSlug}
		/>

		<PaperList
			paperSeats={shownPaperSeats}
			conference={data.conference}
			refusal={reviewRefusal}
			approveAction={actionUrl('approve')}
			requestChangesAction={actionUrl('requestChanges')}
			{conferenceSlug}
			{committeeSlug}
		/>
	{/if}

	<BackgroundGuideCard
		guide={data.guide}
		defaultTitle={data.guideTitle}
		typed={typedGuide}
		error={form?.guideError ?? null}
		uploadAction={actionUrl('uploadBackgroundGuide')}
		removeAction={actionUrl('removeBackgroundGuide')}
	/>
</div>
