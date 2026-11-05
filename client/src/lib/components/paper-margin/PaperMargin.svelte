<script lang="ts">
	import { onMount } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import type { ResolvedPathname } from '$app/types';
	import {
		cardLocationText,
		marginLayout,
		type MarginCard,
		type MarginWriter,
		type MarginNotes
	} from '$lib/paper-margin';
	import type { PaperMargin } from '$lib/paper-margin-state.svelte';
	import MarginCardView from './MarginCardView.svelte';
	import MarginHeader from './MarginHeader.svelte';
	import MarginNotesHeading from './MarginNotesHeading.svelte';
	import NewThreadCard from './NewThreadCard.svelte';

	type Props = {
		margin: PaperMargin;
		paperUrl: ResolvedPathname;
		/** Who writes the paper, to name a suggestion's writer. */
		people: MarginWriter[];
		userId: string;
		timeZone: string;
		/** The comment `?editComment=` opens. */
		editingCommentId: string | null;
		isScriptRunning: boolean;
		/** The dais's "Notes for the authors": a title always on show, and signed notes. */
		notes?: MarginNotes;
	};

	let {
		margin,
		paperUrl,
		people,
		userId,
		timeZone,
		editingCommentId,
		isScriptRunning,
		notes
	}: Props = $props();

	// The space between two cards pushed apart, in pixels.
	const CARD_GAP = 12;
	// `MediaQuery` follows a CSS media query; `lg` is where the margin has a column of its own.
	const isWide = new MediaQuery('min-width: 64rem');
	const isPlaced = $derived(isScriptRunning && isWide.current && margin.editor !== null);

	let column: HTMLDivElement | null = $state(null);
	// Each card's height as last drawn, which `bind:offsetHeight` below keeps up to date.
	let heights: Record<string, number> = $state({});
	// Bumped when the page is laid out again without the text changing, to move the cards with it.
	let layoutCount = $state(0);
	onMount(() => void document.fonts.ready.then(() => layoutCount++));

	/*
		A card is chosen once a press on it ends, not as it starts: choosing opens
		its reply field and moves it up to its words, and a button that moved
		under the pointer would not be pressed. Focus chooses it too, but only
		from the keyboard, since a press focuses the button before it ends.
	*/
	function chooseOnKeyboardFocus(event: FocusEvent, card: MarginCard) {
		if (event.target instanceof Element && event.target.matches(':focus-visible')) {
			margin.choose(card);
		}
	}

	const hasSuggestions = $derived(margin.cards.some((card) => card.kind === 'suggestion'));
	const title = $derived(notes?.title ?? (hasSuggestions ? 'Suggestions' : 'Comments'));
	const hasOthersSuggestions = $derived(
		margin.cards.some((card) => card.kind === 'suggestion' && card.suggestion.userId !== userId)
	);

	/*
		Where each card sits, level with its words, read from where the editor
		draws them. `$derived.by` runs the function again whenever what it reads
		changes: the editor's state after every keystroke, the cards' heights,
		and `layoutCount`.
	*/
	const layout = $derived.by(() => {
		void layoutCount;
		const editor = margin.editor;
		if (!isPlaced || editor === null || column === null || margin.editorState === null) return null;

		const columnTop = column.getBoundingClientRect().top;
		const topOf = (place: number) => {
			try {
				return editor.view.coordsAtPos(place).top - columnTop;
			} catch {
				return null;
			}
		};

		return marginLayout(margin.cards, topOf, heights, margin.activeKey, CARD_GAP);
	});
</script>

<svelte:window onresize={() => layoutCount++} />

<!--
	The comments and suggestions beside a live paper. On a desktop each card
	sits level with its words and the chosen one comes up to them; on a phone,
	and without JavaScript, they follow one another under the paper, each
	saying where its words are, and a new comment is on the whole paper.
-->
<aside aria-label={title} class={['mt-10', notes ? 'lg:mt-0' : 'lg:mt-14']}>
	{#if notes}
		<MarginNotesHeading {notes} {margin} {isScriptRunning} />
	{:else if !isScriptRunning || margin.cards.length > 0}
		<MarginHeader
			{title}
			isDecidingAll={hasOthersSuggestions}
			onDecideAll={(decision) => margin.decideAll(decision)}
		/>
	{/if}
	<div
		bind:this={column}
		class="relative flex flex-col gap-3"
		style:height={layout === null ? undefined : `${layout.height}px`}
	>
		<!-- `(card.key)` keys each card, so a card keeps its element and its height as others come and go. -->
		{#each margin.cards as card (card.key)}
			<div
				bind:offsetHeight={heights[card.key]}
				class={[layout !== null && 'absolute inset-x-0 transition-[top] duration-150']}
				style:top={layout === null ? undefined : `${layout.tops[card.key]}px`}
				onfocusin={(event) => chooseOnKeyboardFocus(event, card)}
				onclick={() => margin.choose(card)}
				role="presentation"
			>
				<MarginCardView
					{card}
					{margin}
					{paperUrl}
					{people}
					{userId}
					{timeZone}
					locationText={isPlaced ? null : cardLocationText(card, margin.editorState?.doc ?? null)}
					{editingCommentId}
					{isScriptRunning}
					writer={notes?.writer}
				/>
			</div>
		{/each}
	</div>
	{#if !isScriptRunning && (notes?.isOpen ?? true)}
		<div class="mt-4"><NewThreadCard writer={notes?.writer} /></div>
	{/if}
</aside>
