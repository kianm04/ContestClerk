<script lang="ts">
	import Lock from '@lucide/svelte/icons/lock';
	import Card from '$lib/components/Card.svelte';
	import KeyValueList from '$lib/components/KeyValueList.svelte';
	import type { KeyValueItem } from '$lib/components/KeyValueList.svelte';
	import { formatDateRange } from '$lib/dates';
	import type { MyProfileDetails } from '$lib/profiles';

	type Props = {
		/** The `profile_details` row: the facts only the person and their organisers see. */
		details: MyProfileDetails;
	};

	let { details }: Props = $props();

	/** What a field nobody has filled in reads as, rather than an empty line. */
	const NOT_GIVEN = 'Not given';

	/** The value as it is, or `NOT_GIVEN` when the person left the field empty. */
	function valueOrNotGiven(value: string): string {
		return value.trim() === '' ? NOT_GIVEN : value;
	}

	/**
	 * The date of birth as one day, such as "14 Mar 2009".
	 *
	 * `formatDateRange` is the one date formatter this repository has, and it
	 * writes a range whose two ends are the same day as that single day, so it is
	 * given the same date twice rather than a second formatter being added here.
	 */
	function formatDateOfBirth(dateOfBirth: string): string {
		if (dateOfBirth === '') {
			return NOT_GIVEN;
		}

		return formatDateRange(dateOfBirth, dateOfBirth);
	}

	// Every field is shown, empty ones included, because this card is the reader
	// checking what an organiser will see about them. `$derived` builds the list
	// again whenever the details change.
	const facts: KeyValueItem[] = $derived([
		{ label: 'Email', value: valueOrNotGiven(details.email) },
		{ label: 'Date of birth', value: formatDateOfBirth(details.dateOfBirth) },
		{ label: 'Phone', value: valueOrNotGiven(details.phone) },
		{ label: 'Dietary requirements', value: valueOrNotGiven(details.dietaryRequirements) },
		{ label: 'Emergency contact', value: valueOrNotGiven(details.emergencyContactName) },
		{ label: 'Emergency contact phone', value: valueOrNotGiven(details.emergencyContactPhone) }
	]);
</script>

<Card>
	<div class="flex items-center gap-2">
		<!-- The lock is decorative: the heading beside it already says the words,
			so a screen reader would only repeat itself. -->
		<span class="text-ink-600">
			<Lock size={20} strokeWidth={1.75} aria-hidden="true" />
		</span>

		<h2 class="font-display text-h2 text-brand-900">Private details</h2>
	</div>

	<p class="mt-1 text-small text-ink-600">
		Only organisers of conferences you attend, and the head of a school delegation you join, can see
		these.
	</p>

	<div class="mt-4">
		<KeyValueList items={facts} />
	</div>
</Card>
