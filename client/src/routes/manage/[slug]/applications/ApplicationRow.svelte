<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import type { ListedApplicationStatus, OrganiserApplicationRow } from '$lib/applications';
	import { formatDayAndMonth } from '$lib/dates';
	import { statusBadgeTone, statusLabel } from '$lib/status';
	import ApplicantCell from './ApplicantCell.svelte';

	type Props = {
		/** The application this row is about. */
		application: OrganiserApplicationRow;
		/** Its review page, carrying the table's query so Previous and Next walk this queue. */
		reviewHref: ResolvedPathname;
		/** The same list with this application in the review panel beside it. */
		panelHref: ResolvedPathname;
		/**
		 * True while the review panel is beside the table. From `xl` up the row then
		 * drops its status cell, because the tab already says the status, and
		 * `ApplicantCell` says what changed.
		 */
		hasReviewPanel: boolean;
		/** True when this is the application the panel is showing. */
		isInReviewPanel: boolean;
		/** The tab on screen, so a row whose status has just changed can say so. */
		tabStatus: ListedApplicationStatus;
		/** True while this row's tick box is ticked. */
		isSelected: boolean;
		/** False for a reader who may not decide applications, whose row has no tick box. */
		canSelect: boolean;
		/** The conference's timezone, so the day applied is the day it was there. */
		timezone: string;
		/** Called when the tick box is ticked or unticked, so the page can keep count. */
		onSelect: (applicationId: string, isSelected: boolean) => void;
	};

	let {
		application,
		reviewHref,
		panelHref,
		hasReviewPanel,
		isInReviewPanel,
		tabStatus,
		isSelected,
		canSelect,
		timezone,
		onSelect
	}: Props = $props();

	/* `$derived` works each of these out again whenever the application changes,
	   which is after every action on this page. The status's colour words are
	   the same five `StatusDot` takes. */
	const statusTone = $derived(statusBadgeTone('application_status', application.status));
	const statusText = $derived(statusLabel('application_status', application.status));

	// The status cell, hidden from `xl` up while the panel is beside the table.
	const statusCellVisibility = $derived(hasReviewPanel ? 'xl:hidden' : '');

	// "26 Sep", as the artboard writes the day somebody applied.
	const appliedDay = $derived(
		application.submittedAt === null ? '—' : formatDayAndMonth(application.submittedAt, timezone)
	);

	/** Tells the page above which row was ticked, and whether it is ticked now. */
	function handleSelectChange(event: Event & { currentTarget: HTMLInputElement }) {
		onSelect(application.id, event.currentTarget.checked);
	}
</script>

<tr class="border-b border-border">
	{#if canSelect}
		<td class="p-3 align-middle">
			<!--
				A bare tick box rather than `CheckboxField`, which gives every field the
				same `field-<name>` id: twenty-five boxes all named `ids` would all be
				`field-ids`, and an id may belong to only one element. The applicant's
				name is the box's label instead, so a screen reader says which row it is
				ticking rather than "ids" twenty-five times over.
			-->
			<input
				type="checkbox"
				name="ids"
				value={application.id}
				checked={isSelected}
				onchange={handleSelectChange}
				aria-label="Select {application.applicantName}"
				class="h-4 w-4 rounded border-border text-link"
			/>
		</td>
	{/if}

	<ApplicantCell
		{application}
		{reviewHref}
		{panelHref}
		{hasReviewPanel}
		{isInReviewPanel}
		{tabStatus}
	/>

	<td class="p-3 text-dense text-foreground">{application.firstPreference ?? '—'}</td>
	<td class="p-3 text-dense whitespace-nowrap text-foreground">{appliedDay}</td>

	<td class="p-3 {statusCellVisibility}">
		<StatusDot text={statusText} tone={statusTone} />

		<!--
			An accepted application names the seat it won underneath its status,
			which is the one fact the row carries that nothing else on the page
			shows.
		-->
		{#if application.seatLabel}
			<p class="mt-0.5 text-small text-muted-foreground">{application.seatLabel}</p>
		{/if}
	</td>
</tr>
