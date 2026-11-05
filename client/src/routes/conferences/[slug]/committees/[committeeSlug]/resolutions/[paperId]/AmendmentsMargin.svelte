<script lang="ts">
	import { onMount } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { amendmentLayout, cardsInReadingOrder, type AmendmentCard } from '$lib/amendment-cards';
	import PaperSideHeading from '$lib/components/paper-side/PaperSideHeading.svelte';
	import { waitingForYouText } from '$lib/paper-amendments';
	import type { ClauseContent } from '$lib/paper-clauses';
	import AmendmentCardView from './AmendmentCardView.svelte';

	type Props = {
		cards: AmendmentCard[];
		/** The text as it stands, whose clauses the cards follow down the page. */
		content: ClauseContent;
		/** The amendments the reader's seat has still to answer as a sponsor. */
		waitingForMe: number[];
		conferenceSlug: string;
		committeeSlug: string;
		paperId: string;
	};

	let { cards, content, waitingForMe, conferenceSlug, committeeSlug, paperId }: Props = $props();

	// The space between two cards pushed apart, in pixels.
	const CARD_GAP = 16;
	// `MediaQuery` follows a CSS media query; `lg` is where the cards have a column of their own.
	const isWide = new MediaQuery('min-width: 64rem');
	let isScriptRunning = $state(false);
	// Bumped when the page is laid out again, once its fonts arrive or the window changes size.
	let layoutCount = $state(0);
	onMount(() => {
		isScriptRunning = true;
		void document.fonts.ready.then(() => layoutCount++);
	});

	let column: HTMLDivElement | null = $state(null);
	// Each card's height as last drawn, which `bind:offsetHeight` below keeps up to date.
	let heights: Record<string, number> = $state({});
	const ordered = $derived(cardsInReadingOrder(cards, content));

	/*
		Where each card sits, level with its clause: the clause's `clause-…` id
		says where the sheet draws it. `$derived.by` runs the function again
		when the cards, their heights or `layoutCount` change.
	*/
	const layout = $derived.by(() => {
		void layoutCount;
		if (!isScriptRunning || !isWide.current || column === null) return null;

		const columnTop = column.getBoundingClientRect().top;
		const clauseTop = (clauseId: string) => {
			const clause = document.getElementById(`clause-${clauseId}`);
			return clause === null ? null : clause.getBoundingClientRect().top - columnTop;
		};

		return amendmentLayout(ordered, clauseTop, heights, CARD_GAP);
	});
</script>

<svelte:window onresize={() => layoutCount++} />

<!--
	The draft's amendments beside its text. On a desktop each card sits level
	with its clause; on a phone, and without JavaScript, they follow one
	another under the text, in the order of the clauses.
-->
<section aria-label="Amendments">
	<PaperSideHeading title="Amendments" count={String(cards.length)} />
	{#if waitingForMe.length > 0}
		<a href="#amendment-{waitingForMe[0]}" class="mt-3 block text-small text-link hover:underline">
			{waitingForYouText(waitingForMe.map((sequence) => ({ sequence })))}
		</a>
	{/if}
	{#if cards.length === 0}
		<p class="mt-3 text-small text-muted-foreground">No amendments yet.</p>
	{/if}
	<div
		bind:this={column}
		class="relative mt-4 flex flex-col gap-4"
		style:height={layout === null ? undefined : `${layout.height}px`}
	>
		<!-- `(card.id)` keys each card, so it keeps its element and its height as others come and go. -->
		{#each ordered as card (card.id)}
			<div
				bind:offsetHeight={heights[card.id]}
				class={[layout !== null && 'absolute inset-x-0']}
				style:top={layout === null ? undefined : `${layout.tops[card.id]}px`}
			>
				<AmendmentCardView {card} {conferenceSlug} {committeeSlug} {paperId} />
			</div>
		{/each}
	</div>
</section>
