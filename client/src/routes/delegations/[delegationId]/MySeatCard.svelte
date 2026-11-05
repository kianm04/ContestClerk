<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import { type MyDelegationSeat } from '$lib/delegations';
	import { committeeUrl } from '$lib/urls';

	type Props = {
		/** The seat this member holds, with the committee it sits in. */
		seat: MyDelegationSeat;
		/** The conference the committee belongs to, which its address is built from. */
		conferenceSlug: string;
	};

	let { seat, conferenceSlug }: Props = $props();
</script>

<!-- The member's whole view of the allocation, which
	`05-pages/delegation/dashboard.md` draws as a flag, the seat name and a link to
	the committee. It is a component of its own rather than markup on the page
	because the flag's `{#if}` inside the page's own two would be the third level
	of nesting CLAUDE.md does not allow. -->
<Card>
	<h2 class="font-display text-h2 text-brand-900">Your seat</h2>
	<p class="mt-2 flex items-center gap-2 text-body">
		<!-- A seat that is a role rather than a country has no flag to draw, which
			is why this is asked. The committee page's own "Your seat" card does the
			same. -->
		{#if seat.countryCode}
			<Flag countryCode={seat.countryCode} />
		{/if}
		{seat.seatName}
	</p>
	<a
		class="mt-1 inline-flex min-h-11 items-center text-body text-brand-700 hover:underline"
		href={committeeUrl(conferenceSlug, seat.committeeSlug)}
	>
		{seat.committeeName}
	</a>
</Card>
