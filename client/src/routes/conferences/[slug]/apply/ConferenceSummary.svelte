<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import DateRange from '$lib/components/DateRange.svelte';
	import Money from '$lib/components/Money.svelte';
	import { conferenceLocationLine, publicFeesHeading, type Conference } from '$lib/conferences';

	type Props = {
		/** The conference being applied to. Four of its facts are shown. */
		conference: Conference;
		/** What an individual pays if they are accepted, or `null` when no fee's window is open. */
		fee: { amountCents: number; currency: string } | null;
		/** How many fees the conference lists, which `publicFeesHeading` needs. */
		feeCount: number;
		/** When applications close, already written out, or `null` when there is no closing time. */
		closesOn: string | null;
	};

	let { conference, fee, feeCount, closesOn }: Props = $props();

	// "Fees to be announced" or "Free to attend" in place of an amount, or `null`
	// when the conference's fees speak for themselves. `$derived` works it out
	// again whenever the conference changes.
	const feesHeading = $derived(publicFeesHeading(conference.feeStatus, feeCount));
</script>

<!--
	The conference in short, beside the form from `lg` up and following the page
	as it scrolls. The phone layout in `05-pages/delegate/apply.md` is one column
	with the buttons along the bottom and has no room for it, so it is hidden
	below that width rather than pushed under the form. Everything in it is
	already on the conference's own page, which is one link away.
-->
<aside class="hidden lg:sticky lg:top-6 lg:block lg:w-[300px] lg:shrink-0">
	<Card>
		<div class="flex flex-col gap-2 text-body">
			<h2 class="font-display text-h2 text-brand-900">{conference.name}</h2>

			<p><DateRange startDate={conference.startDate} endDate={conference.endDate} /></p>
			<p>{conferenceLocationLine(conference)}</p>

			{#if feesHeading !== null}
				<p>{feesHeading}</p>
			{:else if fee}
				<p>Fee <Money amountCents={fee.amountCents} currency={fee.currency} /></p>
			{/if}

			{#if closesOn}
				<p class="text-small text-ink-600">Applications close {closesOn}</p>
			{/if}
		</div>
	</Card>
</aside>
