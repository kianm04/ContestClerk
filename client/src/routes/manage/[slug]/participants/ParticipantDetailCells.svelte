<script lang="ts">
	import { formatDateRange } from '$lib/dates';
	import type { ParticipantColumns } from '$lib/participant-access';
	import type { ParticipantListRow } from '$lib/participants';

	type Props = {
		participant: ParticipantListRow;
		/** Which of the private columns the reader's permissions show. */
		columns: ParticipantColumns;
	};

	let { participant, columns }: Props = $props();
</script>

<!--
	The private details as table cells, between the delegation and the invoice.
	A column the reader may not see is left out, never drawn empty; a detail the
	delegate never gave is a dash.
-->
{#if columns.contact}
	<td class="p-3 text-dense break-all text-foreground">{participant.email ?? '—'}</td>
	<td class="p-3 text-dense whitespace-nowrap text-foreground tabular-nums">
		{participant.phone ?? '—'}
	</td>
{/if}
{#if columns.welfare}
	<td class="p-3 text-dense whitespace-nowrap text-foreground tabular-nums">
		<!-- A range from a day to itself is just that day: "12 Mar 2010". -->
		{participant.dateOfBirth === null
			? '—'
			: formatDateRange(participant.dateOfBirth, participant.dateOfBirth)}
	</td>
	<td class="min-w-28 p-3 text-dense text-foreground">
		{participant.dietaryRequirements ?? '—'}
	</td>
	<td class="min-w-36 p-3 text-dense text-foreground">
		{participant.emergencyContactName ?? '—'}
		{#if participant.emergencyContactPhone}
			<p class="text-small text-muted-foreground tabular-nums">
				{participant.emergencyContactPhone}
			</p>
		{/if}
	</td>
{/if}
