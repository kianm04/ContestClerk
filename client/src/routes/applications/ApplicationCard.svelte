<script lang="ts">
	import type { ApplicationCard } from '$lib/application-cards';
	import * as Card from '$lib/components/ui/card';
	import { publicMediaUrl } from '$lib/media';
	import CardActionPanel from './CardActionPanel.svelte';
	import CardConferenceInfo from './CardConferenceInfo.svelte';
	import CardDetails from './CardDetails.svelte';
	import ProgressSteps from './ProgressSteps.svelte';

	type Props = {
		/** Everything the card shows, worked out on the server by `buildApplicationCards`. */
		card: ApplicationCard;
	};

	let { card }: Props = $props();
</script>

<!--
	One application: the conference, the application itself, and what to do next.
	The shell is a shadcn `Card`: white, a hairline edge, no shadow. It draws a
	`<div>`, so `role="article"` tells a screen reader that each card stands on
	its own, as an `<article>` would.

	On a wide screen (`xl`) the three parts sit side by side in one row, divided
	by hairlines. Below that the conference takes the whole first row and the
	other two share the second, and on a phone all three are stacked.
-->
<Card.Root
	role="article"
	class="grid gap-4 p-4 md:grid-cols-2 md:gap-x-6 xl:grid-cols-[minmax(0,1fr)_19.5rem_21.5rem] xl:gap-x-0"
>
	<div class="flex min-w-0 flex-col gap-4 md:col-span-2 xl:col-span-1 xl:pr-6">
		<div class="flex gap-4">
			<!--
				A photograph of the conference, 3:2 like every thumbnail. A conference
				without one shows no picture at all (docs/DESIGN.md). The name beside it
				already says whose picture it is, so the `alt` is empty.
			-->
			{#if card.conference.bannerPath !== null}
				<img
					src={publicMediaUrl(card.conference.bannerPath)}
					alt=""
					class="aspect-[3/2] w-24 shrink-0 self-start rounded-lg object-cover sm:w-36"
				/>
			{/if}

			<CardConferenceInfo {card} />
		</div>

		<!-- Under the picture as well, so the four step names have room to stand apart. -->
		<div class="max-w-md">
			<ProgressSteps progress={card.progress} />
		</div>
	</div>

	<div class="border-t pt-4 xl:border-t-0 xl:border-l xl:px-6 xl:pt-0">
		<CardDetails details={card.details} />
	</div>

	<div class="border-t pt-4 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-6">
		<CardActionPanel action={card.action} />
	</div>
</Card.Root>
