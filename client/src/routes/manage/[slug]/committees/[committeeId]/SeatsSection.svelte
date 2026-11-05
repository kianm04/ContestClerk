<script lang="ts">
	import FormSection from '$lib/components/manage/FormSection.svelte';
	import { seatCountsLine } from '$lib/committee-editor';
	import type { ManagedSeat, ManagedSeatCounts } from '$lib/committees';
	import AddOneSeatForm from './AddOneSeatForm.svelte';
	import AddSeatsForm from './AddSeatsForm.svelte';
	import SeatsTable from './SeatsTable.svelte';

	type Props = {
		/** The committee's seats, in the organiser's own order. */
		seats: ManagedSeat[];
		/** Those same seats counted, for the sentence under the title. */
		counts: ManagedSeatCounts;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { seats, counts }: Props = $props();

	// `$derived` writes the sentence again whenever the counts change, which is
	// after every action on this page.
	const description = $derived(
		`The countries or characters delegates represent. ${seatCountsLine(counts)}.`
	);
</script>

<!--
	Everything about the committee's seats: the ready-made lists, the seats
	themselves, and one seat at a time. Each of the three has forms of its own,
	which save the moment they are used.
-->
<FormSection title="Seats" {description}>
	<AddSeatsForm />
	<SeatsTable {seats} />
	<AddOneSeatForm />
</FormSection>
