<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import PaperAmendmentsLive from '$lib/components/amendments/PaperAmendmentsLive.svelte';
	import IntroducedPaperReader from './IntroducedPaperReader.svelte';
	import WithdrawAmendmentDialog from './WithdrawAmendmentDialog.svelte';
	import type { PaperFloor, PaperResolution } from './paper-resolution';
	import type { PageData } from './$types';

	type Props = {
		/** The page's `load` data. */
		data: PageData;
		/** Its introduced draft and resolution, which the page has checked are there. */
		introduced: NonNullable<PageData['introduced']>;
		resolution: PaperResolution;
		floor: PaperFloor;
		/** The page with no dialog open, where "Keep it" goes. */
		paperUrl: ResolvedPathname;
	};

	let { data, introduced, resolution, floor, paperUrl }: Props = $props();
</script>

<!--
	The page of an introduced draft resolution: the text with its amendments
	beside it, kept up to date while seats propose, answer and support them,
	and "Withdraw amendment 3" over it when the address asks for that.
-->
<IntroducedPaperReader
	conferenceSlug={data.conference.slug}
	committeeSlug={data.committee.slug}
	paper={data.paper}
	people={data.people}
	words={data.words}
	{resolution}
	timeZone={data.conference.timezone}
	{floor}
	{introduced}
	proposeHref={data.proposeHref}
/>

<PaperAmendmentsLive supabase={data.supabase} paperId={data.paper.id} />

{#if data.withdrawingAmendment}
	<WithdrawAmendmentDialog amendment={data.withdrawingAmendment} closeHref={paperUrl} />
{/if}
