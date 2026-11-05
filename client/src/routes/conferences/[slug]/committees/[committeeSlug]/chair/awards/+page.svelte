<script lang="ts">
	import Trophy from '@lucide/svelte/icons/trophy';
	import Users from '@lucide/svelte/icons/users';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { EMPTY_AWARD_FORM, type AwardFormValues } from '$lib/award-form';
	import { withdrawAwardPress } from '$lib/award-presses';
	import {
		canEditAward,
		canWithdrawAward,
		formatPublishedDay,
		isAwardsPublished
	} from '$lib/awards';
	import {
		expectationsOf,
		rowsAfterChanges,
		sharedChairForm,
		type ChairSubmitInput
	} from '$lib/chair-form';
	import { chairAwardUpdateActionUrl, chairAwardsUrl } from '$lib/urls';
	import AwardProposalForm from './AwardProposalForm.svelte';
	import AwardRow from './AwardRow.svelte';
	import type { PageProps } from './$types';

	// `data` holds what the chair layout's `load` returned and what this page's
	// `load` added in `+page.server.ts`; both run again after every form sent.
	// `form` is what a refused action returned: the message, what was typed and
	// a message under the field it was about.
	let { data, form }: PageProps = $props();

	// The chair layout's shared instant form (T141). "Propose" and "Withdraw"
	// change this list at once; `shownAwards` lays their presses on top of
	// `data.awards` until the server has answered.
	const chairForm = sharedChairForm();
	const shownAwards = $derived(
		rowsAfterChanges(
			data.awards,
			expectationsOf(chairForm.presses).flatMap((expectation) => expectation.awards ?? [])
		)
	);

	/** "Withdraw": the id travels in the row's own hidden `awardId` field. */
	function handleWithdraw(input: ChairSubmitInput) {
		return withdrawAwardPress(String(input.formData.get('awardId') ?? ''));
	}

	const submitWithdraw = chairForm.submitExpecting(handleWithdraw);

	const conferenceSlug = $derived(data.conference.slug);
	const committeeSlug = $derived(data.committee.slug);
	const isPublished = $derived(isAwardsPublished(data.awardsPublishedAt));
	const publishedDate = $derived(
		data.awardsPublishedAt === null
			? ''
			: formatPublishedDay(data.awardsPublishedAt, data.conference.timezone)
	);

	const editing = $derived(data.awardBeingEdited);
	// A refusal sends back what was typed; otherwise the proposal being edited
	// fills the form, and a non-custom kind needs no title of its own.
	const formValues: AwardFormValues = $derived(
		form?.values ??
			(editing === null
				? EMPTY_AWARD_FORM
				: {
						seatId: editing.seatId,
						kind: editing.kind,
						title: editing.kind === 'custom' ? editing.title : ''
					})
	);
	const formAction = $derived(
		editing === null
			? '?/propose'
			: chairAwardUpdateActionUrl(conferenceSlug, committeeSlug, editing.id)
	);
	const pageUrl = $derived(chairAwardsUrl(conferenceSlug, committeeSlug));
</script>

<div class="mb-6">
	<PageHeader
		title="Awards"
		subtitle={isPublished ? 'Published' : 'Not published yet · organisers confirm and publish'}
	/>
</div>

<div class="flex flex-col gap-6">
	{#if isPublished}
		<Notice tone="success">Awards were published on {publishedDate}.</Notice>
	{:else if data.filledSeats.length === 0}
		<EmptyState
			icon={Users}
			title="No delegates to award yet."
			description="Awards can be proposed once delegates hold seats."
		/>
	{:else}
		<AwardProposalForm
			seats={data.filledSeats}
			values={formValues}
			errors={form?.errors ?? {}}
			action={formAction}
			awardId={editing?.id ?? null}
			cancelHref={pageUrl}
			existingAwards={shownAwards}
			committeeId={data.committee.id}
			readerId={data.readerId}
		/>
	{/if}

	<section aria-labelledby="proposals-heading">
		<h2 id="proposals-heading" class="font-display text-h2">
			Proposals ({shownAwards.length})
		</h2>
		{#if shownAwards.length === 0}
			<EmptyState
				icon={Trophy}
				title="No proposals yet."
				description="Propose awards after the last session."
			/>
		{:else}
			<ul class="divide-y divide-line">
				<!-- The `(award.id)` key lets Svelte reuse rows instead of rebuilding them. -->
				{#each shownAwards as award (award.id)}
					<AwardRow
						{award}
						noteCount={data.noteCounts[award.seatId] ?? 0}
						{isPublished}
						canEdit={canEditAward(award, data.readerId, isPublished)}
						canWithdraw={canWithdrawAward(award, data.readerId, data.canManage, isPublished)}
						editHref={chairAwardsUrl(conferenceSlug, committeeSlug, award.id)}
						withdrawAction="?/withdraw"
						onSubmit={submitWithdraw}
					/>
				{/each}
			</ul>
		{/if}
	</section>
</div>
