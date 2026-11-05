<script lang="ts">
	import type { AmendmentCard } from '$lib/amendment-cards';
	import AmendmentCardBody from '$lib/components/amendments/AmendmentCardBody.svelte';
	import AmendmentCardActions from './AmendmentCardActions.svelte';

	type Props = {
		card: AmendmentCard;
		conferenceSlug: string;
		committeeSlug: string;
		paperId: string;
	};

	let { card, conferenceSlug, committeeSlug, paperId }: Props = $props();
</script>

<!--
	One amendment beside its clause, with what the reader may do with it. The
	`id` is the `#amendment-3` its notifications and toasts point at, and an
	amendment to an amendment is set in under the one it changes.
-->
<article
	id="amendment-{card.sequence}"
	aria-label={card.name}
	class={[
		'scroll-mt-24 rounded-xl border border-border bg-card px-4 pt-3.5 pb-4',
		'max-lg:rounded-none max-lg:border-x-0 max-lg:border-t-0 max-lg:px-0',
		card.parentId !== null && 'lg:ml-4'
	]}
>
	<AmendmentCardBody {card} />
	<AmendmentCardActions {card} {conferenceSlug} {committeeSlug} {paperId} />
</article>
