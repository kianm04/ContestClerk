<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import { approveAllQuestion, paperFilterOptions } from '$lib/chair-papers';
	import { sharedChairForm } from '$lib/chair-form';
	import type { PaperStatus } from '$lib/documents';
	import type { PaperSeatRow } from '$lib/documents-page';
	import { approveAllPapersPress } from '$lib/paper-presses';
	import { chairPapersActionUrl, chairPapersUrl } from '$lib/urls';

	type Props = {
		/** The status the list is narrowed to, or null for every seat. */
		statusFilter: PaperStatus | null;
		/** How many papers await review. "Approve all" is hidden when there are none. */
		awaitingCount: number;
		/** The seats the page shows now, so "Approve all" can tell which papers it will touch. */
		paperSeats: PaperSeatRow[];
		conferenceSlug: string;
		committeeSlug: string;
	};

	let { statusFilter, awaitingCount, paperSeats, conferenceSlug, committeeSlug }: Props = $props();

	// The chair layout's shared instant form (T141): "Approve all" marks every
	// paper shown that awaits review the moment it is pressed.
	const chairForm = sharedChairForm();
	const submitApproveAll = chairForm.submitExpecting(() =>
		approveAllPapersPress(paperSeats, new Date())
	);

	// The choices never change while the page is open, so they are worked out once.
	const filterOptions = paperFilterOptions();

	const pageUrl = $derived(chairPapersUrl(conferenceSlug, committeeSlug));
	const approveAllAction = $derived(
		chairPapersActionUrl(conferenceSlug, committeeSlug, statusFilter, 'approveAll')
	);

	/** With JavaScript, picking a status is enough; without it, "Filter" sends the form. */
	function handleStatusChange(event: Event & { currentTarget: HTMLSelectElement }) {
		event.currentTarget.form?.requestSubmit();
	}
</script>

<div class="flex flex-wrap items-end justify-between gap-3">
	<!-- A GET form: it navigates to `?status=…`, so the filter is in the address. -->
	<form method="get" action={pageUrl}>
		<FilterBar resetHref={pageUrl}>
			<SelectField
				label="Status"
				name="status"
				value={statusFilter ?? ''}
				options={filterOptions}
				onchange={handleStatusChange}
			/>
			<Button label="Filter" variant="secondary" />
		</FilterBar>
	</form>

	{#if awaitingCount > 0}
		<ConfirmButton
			label="Approve all awaiting review"
			confirmTitle={approveAllQuestion(awaitingCount)}
			confirmText="Each delegate is notified. Papers already reviewed are left alone."
			formaction={approveAllAction}
			variant="secondary"
			onSubmit={submitApproveAll}
		/>
	{/if}
</div>
