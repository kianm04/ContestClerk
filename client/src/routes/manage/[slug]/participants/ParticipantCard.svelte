<script lang="ts">
	import Flag from '$lib/components/Flag.svelte';
	import SeatName from '$lib/components/SeatName.svelte';
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import { paperStatusTone } from '$lib/documents-page';
	import { paperStatusLabel } from '$lib/documents';
	import { committeeHeading } from '$lib/committees';
	import type { ParticipantListView } from '$lib/participant-access';
	import type { ParticipantListRow } from '$lib/participants';
	import ParticipantActions from './ParticipantActions.svelte';
	import ParticipantDetailLines from './ParticipantDetailLines.svelte';
	import ParticipantInvoiceStatus from './ParticipantInvoiceStatus.svelte';

	type Props = {
		/** The participant this card is about. */
		participant: ParticipantListRow;
		view: ParticipantListView;
	};

	let { participant, view }: Props = $props();
</script>

<!--
	What a phone shows instead of a table row: the same facts, stacked, as one
	flat entry of the list.
-->
<div class="flex flex-col gap-2 py-3">
	<div>
		<!-- The flag is the delegate's own country, as on the table's row. -->
		<p class="flex items-center gap-2 text-dense font-medium text-foreground">
			{participant.fullName}
			{#if participant.countryCode}
				<Flag countryCode={participant.countryCode} />
			{/if}
		</p>
		<p class="text-small text-muted-foreground">
			{committeeHeading(participant.committee)} ·
			<SeatName name={participant.seatName} countryCode={participant.seatCountryCode} />
		</p>
		{#if participant.institutionName}
			<p class="text-small text-muted-foreground">{participant.institutionName}</p>
		{/if}
	</div>

	<ParticipantDetailLines {participant} columns={view.columns} />

	<!-- The invoice, the paper and the buttons only for a reader whose permissions show them. -->
	<div class="flex flex-wrap items-start gap-x-4 gap-y-1">
		{#if view.columns.invoice}
			<ParticipantInvoiceStatus invoice={participant.invoice} />
		{/if}
		{#if view.columns.paper}
			<StatusDot
				tone={paperStatusTone(participant.paperStatus)}
				text={paperStatusLabel(participant.paperStatus)}
			/>
		{/if}
	</div>

	{#if view.columns.actions}
		<ParticipantActions {participant} {view} isMenu={false} />
	{/if}
</div>
