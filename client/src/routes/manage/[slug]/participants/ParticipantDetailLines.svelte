<script lang="ts">
	import { formatDateRange } from '$lib/dates';
	import type { ParticipantColumns } from '$lib/participant-access';
	import type { ParticipantListRow } from '$lib/participants';

	type Props = {
		participant: ParticipantListRow;
		/** Which of the private details the reader's permissions show. */
		columns: ParticipantColumns;
	};

	let { participant, columns }: Props = $props();

	// Only the details that were given, joined into one meta line each.
	const contactLine = $derived(
		[participant.email, participant.phone].filter((part) => part !== null).join(' · ')
	);
	const welfareLine = $derived(
		[
			participant.dateOfBirth === null
				? null
				: `Born ${formatDateRange(participant.dateOfBirth, participant.dateOfBirth)}`,
			participant.dietaryRequirements,
			participant.emergencyContactName === null
				? null
				: `Emergency contact ${participant.emergencyContactName}`,
			participant.emergencyContactPhone
		]
			.filter((part) => part !== null)
			.join(' · ')
	);
</script>

<!-- What a phone card shows of the private details the table has columns for. -->
{#if columns.contact && contactLine !== ''}
	<p class="text-small break-all text-muted-foreground">{contactLine}</p>
{/if}
{#if columns.welfare && welfareLine !== ''}
	<p class="text-small text-muted-foreground">{welfareLine}</p>
{/if}
