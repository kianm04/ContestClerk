<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { commentTimeText } from '$lib/paper-comments';
	import {
		suggesterOf,
		type MarginCard,
		type MarginWriter,
		type NewCommentWriter
	} from '$lib/paper-margin';
	import { suggestionThreadFields, type PaperMargin } from '$lib/paper-margin-state.svelte';
	import { newThreadPassage } from '$lib/paper-threads';
	import NewThreadCard from './NewThreadCard.svelte';
	import SuggestionCard from './SuggestionCard.svelte';
	import ThreadCard from './ThreadCard.svelte';

	type Props = {
		card: MarginCard;
		margin: PaperMargin;
		paperUrl: ResolvedPathname;
		/** The paper's writers, who name a suggestion's writer, by their seat when they have one. */
		people: MarginWriter[];
		userId: string;
		/** The conference's timezone, for the time a suggestion was made. */
		timeZone: string;
		/** Where its words are, for a card that is not drawn beside them. */
		locationText: string | null;
		editingCommentId: string | null;
		/** Without JavaScript nothing is chosen, so every thread has its reply field. */
		isScriptRunning: boolean;
		/** Who writes a new comment, when its card names them. */
		writer?: NewCommentWriter;
	};

	let {
		card,
		margin,
		paperUrl,
		people,
		userId,
		timeZone,
		locationText,
		editingCommentId,
		isScriptRunning,
		writer
	}: Props = $props();

	const isActive = $derived(margin.activeKey === card.key);
	const isReplyShown = $derived(!isScriptRunning || isActive);

	function newPassage() {
		return margin.editorState === null ? null : newThreadPassage(margin.editorState);
	}
</script>

<!-- One card of the margin, drawn by the component for its kind. -->
{#if card.kind === 'new'}
	<NewThreadCard passage={newPassage} onDone={() => margin.stopComment()} {isActive} {writer} />
{:else if card.kind === 'thread'}
	<ThreadCard {card} {paperUrl} {isActive} {isReplyShown} {locationText} {editingCommentId} />
{:else}
	<SuggestionCard
		{card}
		suggester={suggesterOf(people, card.suggestion.userId)}
		timeText={commentTimeText(card.suggestion.at, new Date(), timeZone)}
		isMine={card.suggestion.userId === userId}
		{isActive}
		{paperUrl}
		onDecide={(decision) => margin.decide(card, decision)}
		isReplyShown={isActive}
		startThread={() => suggestionThreadFields(margin.editorState, card.suggestion)}
		{locationText}
		{editingCommentId}
	/>
{/if}
