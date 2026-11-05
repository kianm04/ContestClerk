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
	import ParticipantDetailCells from './ParticipantDetailCells.svelte';
	import ParticipantInvoiceStatus from './ParticipantInvoiceStatus.svelte';

	type Props = {
		/** The participant this row is about. */
		participant: ParticipantListRow;
		view: ParticipantListView;
	};

	let { participant, view }: Props = $props();
</script>

<tr class="border-b border-border">
	<td class="min-w-40 p-3 text-dense">
		<!-- The delegate's own country from their profile, so it sits by their
			name and not by the seat, which is usually another country. -->
		<span class="flex items-center gap-2">
			<span class="font-medium text-foreground">{participant.fullName}</span>
			{#if participant.countryCode}
				<Flag countryCode={participant.countryCode} />
			{/if}
		</span>
	</td>
	<!-- The seat with its own flag, and the committee it is in under it. -->
	<td class="p-3 text-dense whitespace-nowrap text-foreground">
		<SeatName name={participant.seatName} countryCode={participant.seatCountryCode} />
		<p class="text-small text-muted-foreground">{committeeHeading(participant.committee)}</p>
	</td>
	<td class="min-w-36 p-3 text-dense text-foreground">{participant.institutionName ?? '—'}</td>
	<td class="min-w-28 p-3 text-dense text-foreground">
		{#if participant.delegation}
			{participant.delegation.name}
		{:else}
			<span class="text-muted-foreground">Individual</span>
		{/if}
	</td>
	<ParticipantDetailCells {participant} columns={view.columns} />
	<!-- Each of the last three only for a reader whose permissions show it. -->
	{#if view.columns.invoice}
		<td class="p-3">
			<ParticipantInvoiceStatus invoice={participant.invoice} />
		</td>
	{/if}
	{#if view.columns.paper}
		<td class="p-3">
			<StatusDot
				tone={paperStatusTone(participant.paperStatus)}
				text={paperStatusLabel(participant.paperStatus)}
			/>
		</td>
	{/if}
	{#if view.columns.actions}
		<td class="p-3 whitespace-nowrap">
			<ParticipantActions {participant} {view} isMenu />
		</td>
	{/if}
</tr>
