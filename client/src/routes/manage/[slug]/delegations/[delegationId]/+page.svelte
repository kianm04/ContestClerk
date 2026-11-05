<script lang="ts">
	import Armchair from '@lucide/svelte/icons/armchair';
	import Gavel from '@lucide/svelte/icons/gavel';
	import BackLink from '$lib/components/manage/BackLink.svelte';
	import ManageHeader from '$lib/components/manage/ManageHeader.svelte';
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import Section from '$lib/components/Section.svelte';
	import {
		canAllocateToDelegation,
		delegationSeatCounts,
		delegationSubtitle,
		rejectRefusal,
		reservedSeatCount
	} from '$lib/delegation-review';
	import {
		delegationReviewAfterPresses,
		describeDelegationReviewFailure,
		expectDelegationReviewChange
	} from '$lib/delegation-review-presses';
	import { delegationProgress } from '$lib/delegations';
	import { createInstantForm, type InstantSubmitInput } from '$lib/instant-form.svelte';
	import { manageDelegationsUrl } from '$lib/urls';
	import { statusBadgeTone, statusLabel } from '$lib/status';
	import DelegationDecision from './DelegationDecision.svelte';
	import DelegationInfoColumn from './DelegationInfoColumn.svelte';
	import DelegationSeatsSection from './DelegationSeatsSection.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` returned plus the conference the layout above it read.
	// `form` is what the last refused post sent back, or `null` after a redirect.
	let { data, form }: PageProps = $props();

	// One instant form (`$lib/instant-form.svelte.ts`) for "Accept and allocate",
	// "Remove" and "Not accepted": they move at once, and a failure is a toast.
	// The internal note below keeps its own in-place spinner.
	const reviewForm = createInstantForm({ describeFailure: describeDelegationReviewFailure });

	/** What a press will change, using the seats and status as the page shows them right now. */
	function expectPress(input: InstantSubmitInput) {
		return expectDelegationReviewChange(input, shownRows);
	}

	const submitReviewPress = reviewForm.submitExpecting(expectPress);

	// `$derived` works this out again whenever `data` or the presses change:
	// the seats and the status with the presses still on their way laid on top.
	const shownRows = $derived(
		delegationReviewAfterPresses(
			{
				status: data.delegation.status,
				seatGroups: data.seatGroups,
				freeSeatsByCommittee: data.freeSeatsByCommittee
			},
			reviewForm.presses
		)
	);

	/* `$derived` works each of these out again whenever `data`, `form` or the presses change. */
	const delegation = $derived({ ...data.delegation, status: shownRows.status });
	const statusTone = $derived(statusBadgeTone('delegation_status', delegation.status));
	const statusText = $derived(statusLabel('delegation_status', delegation.status));
	const canAllocate = $derived(data.canDecide && canAllocateToDelegation(delegation.status));
	const progress = $derived(
		delegationProgress(delegation, delegationSeatCounts(shownRows.seatGroups))
	);

	// Only the card just posted from shows a message.
	const allocateError = $derived(form?.failedAction === 'allocate' ? form.message : null);
	const internalNoteError = $derived(
		form?.failedAction === 'saveInternalNote' ? form.message : null
	);

	// A refused post hands back what was typed; anything else shows what is saved.
	const internalNote = $derived(
		form?.failedAction === 'saveInternalNote' ? form.internalNote : (delegation.internalNote ?? '')
	);
	const decisionNote = $derived(form?.failedAction === 'allocate' ? form.decisionNote : '');
	const selectedSeatIds = $derived(form?.failedAction === 'allocate' ? form.selectedSeatIds : []);

	// Only worth showing while allowed, and to a reader who may decide.
	const canReject = $derived(
		data.canDecide &&
			rejectRefusal(delegation.status, reservedSeatCount(shownRows.seatGroups)) === null
	);

	// The members' ages are worked out against the moment the page was drawn.
	const now = new Date();
</script>

<svelte:head>
	<title>{delegation.name} · Delegations · MUNMeet</title>
</svelte:head>

<div class="flex flex-col">
	<div class="lg:mb-2">
		<BackLink href={manageDelegationsUrl(data.slug)} label="Delegations" />
	</div>

	<ManageHeader title={delegation.name} summary={delegationSubtitle(delegation, data.members)}>
		<StatusDot text={statusText} tone={statusTone} />
	</ManageHeader>

	<!--
		One column on a phone, two from `lg` up, seats and decision first on a phone.
		`grid-cols-1` lets a column shrink, so a long invoice number is cut short.
	-->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<div class="flex flex-col gap-6 lg:order-2">
			<Section title="Seats" icon={Armchair} description="Requested, allocated and assigned seats.">
				<DelegationSeatsSection
					{progress}
					seatGroups={shownRows.seatGroups}
					{canAllocate}
					canRemove={data.canDecide}
					freeSeatsByCommittee={shownRows.freeSeatsByCommittee}
					{selectedSeatIds}
					error={allocateError}
					{decisionNote}
					status={delegation.status}
					slug={data.slug}
					onSubmit={submitReviewPress}
				/>
			</Section>

			<Section title="Decision" icon={Gavel} description="Accept or reject the request.">
				<DelegationDecision
					{delegation}
					timezone={data.timezone}
					{canReject}
					canEditNote={data.canDecide}
					{internalNote}
					{internalNoteError}
					onSubmit={submitReviewPress}
				/>
			</Section>
		</div>

		<div class="flex flex-col gap-6 lg:order-1">
			<DelegationInfoColumn
				members={data.members}
				{now}
				access={data.detailsAccess}
				note={delegation.note}
				invoices={data.invoices}
				slug={data.slug}
			/>
		</div>
	</div>
</div>
