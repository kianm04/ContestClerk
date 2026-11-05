<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import Flag from '$lib/components/Flag.svelte';
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import type { OrganiserApplicationRow } from '$lib/applications';
	import { formatDayAndMonth } from '$lib/dates';
	import { statusBadgeTone, statusLabel } from '$lib/status';

	type Props = {
		/** The application this card is about. */
		application: OrganiserApplicationRow;
		/** Its review page, carrying the table's query so Previous and Next walk this queue. */
		reviewHref: ResolvedPathname;
		/** True while this card's tick box is ticked. */
		isSelected: boolean;
		/** False for a reader who may not decide applications, whose card has no tick box. */
		canSelect: boolean;
		/** The conference's timezone, so the day applied is the day it was there. */
		timezone: string;
		/** Called when the tick box is ticked or unticked, so the page can keep count. */
		onSelect: (applicationId: string, isSelected: boolean) => void;
	};

	let { application, reviewHref, isSelected, canSelect, timezone, onSelect }: Props = $props();

	/* `$derived` works each of these out again whenever the application changes,
	   which is after every action on this page. */
	const statusTone = $derived(statusBadgeTone('application_status', application.status));
	const statusText = $derived(statusLabel('application_status', application.status));

	// One quiet line under the name, so a narrow row says the same things the
	// table row says across its columns.
	const detail = $derived(
		[
			application.institutionName,
			application.firstPreference,
			application.submittedAt === null ? null : formatDayAndMonth(application.submittedAt, timezone)
		]
			.filter((part) => part !== null)
			.join(' · ')
	);

	/** Tells the page above which card was ticked, and whether it is ticked now. */
	function handleSelectChange(event: Event & { currentTarget: HTMLInputElement }) {
		onSelect(application.id, event.currentTarget.checked);
	}
</script>

<!--
	One application as a phone shows it: a flat row of the list, like the table
	row it stands in for.
-->
<div class="flex items-start gap-3 py-3">
	<!--
		The second tick box for the same application: the table draws one too, and
		CSS shows only one of the two at a time. A hidden element is still
		submitted, so a ticked application arrives twice, and the action puts every
		id through a `Set` before it decides anything.

		A bare box rather than `CheckboxField`, for the reason `ApplicationRow`
		gives: every field there is given the same `field-<name>` id.
	-->
	{#if canSelect}
		<input
			type="checkbox"
			name="ids"
			value={application.id}
			checked={isSelected}
			onchange={handleSelectChange}
			aria-label="Select {application.applicantName}"
			class="mt-0.5 h-5 w-5 shrink-0 rounded border-border text-link"
		/>
	{/if}

	<div class="min-w-0 flex-1">
		<p class="flex items-center gap-2 text-dense">
			{#if application.countryCode}
				<Flag countryCode={application.countryCode} />
			{/if}
			<a href={reviewHref} class="font-medium text-foreground hover:text-link hover:underline">
				{application.applicantName}
			</a>
		</p>

		<p class="text-small text-muted-foreground">{detail}</p>

		<p class="mt-1 flex flex-wrap items-center gap-x-3">
			<StatusDot text={statusText} tone={statusTone} />

			<!-- An accepted application names the seat it won. -->
			{#if application.seatLabel}
				<span class="text-small text-muted-foreground">{application.seatLabel}</span>
			{/if}
		</p>
	</div>
</div>
