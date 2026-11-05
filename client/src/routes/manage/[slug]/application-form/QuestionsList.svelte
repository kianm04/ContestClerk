<script lang="ts">
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import SortableDropForm from '$lib/components/SortableDropForm.svelte';
	import SortableItem from '$lib/components/SortableItem.svelte';
	import {
		QUESTION_DROP_FORM_ID,
		QUESTION_DROP_HINT_ID,
		type ApplicationQuestion
	} from '$lib/application-questions';
	import { placedOrder, reorderHint, type PendingPlace } from '$lib/drag-order';
	import { createInstantForm } from '$lib/instant-form.svelte';
	import { movedOrder, type PendingMove } from '$lib/list-move-preview';
	import { describeQuestionFailure, expectQuestionChange } from '$lib/question-presses';
	import { rowsAfterPresses, type RowChange } from '$lib/row-changes';
	import { createSortableList, type SortableDrop } from '$lib/sortable-list.svelte';
	import QuestionRow from './QuestionRow.svelte';

	type Props = {
		/** Every custom question of this conference, in the order the organiser put them. */
		questions: ApplicationQuestion[];
		/** The conference's slug, for the links out of each row. */
		conferenceSlug: string;
	};

	let { questions, conferenceSlug }: Props = $props();

	// The move a row has sent but the server has not answered yet, or null. A
	// row sets it in `onMoveSend` and clears it in `onMoveSettle`, and
	// `shownQuestions` below redraws around it, so a swap shows at once instead
	// of waiting for the server and a fresh `load`. `pendingPlace` is the same
	// for a dragged row that has been dropped (`$lib/drag-order.ts`).
	let pendingMove = $state<PendingMove | null>(null);
	let pendingPlace = $state<PendingPlace | null>(null);

	// "Delete question" takes the row away the moment it is confirmed, and a
	// refused one comes back with a toast (T142, `$lib/instant-form.svelte.ts`).
	const deleteForm = createInstantForm<RowChange<ApplicationQuestion>[]>({
		describeFailure: describeQuestionFailure
	});
	const submitDelete = deleteForm.submitExpecting(expectQuestionChange);

	const keptQuestions = $derived(rowsAfterPresses(questions, deleteForm.presses));
	const shownQuestions = $derived(
		placedOrder(movedOrder(keptQuestions, pendingMove), pendingPlace)
	);

	function handleMoveSend(move: PendingMove | null) {
		pendingMove = move;
	}

	function handleMoveSettle() {
		pendingMove = null;
	}

	/** Draw the new order and send the form the handle belongs to, which saves it. */
	function handleDrop(drop: SortableDrop) {
		pendingPlace = { id: drop.id, toIndex: drop.toIndex };
		drop.handle.form?.requestSubmit();
	}

	function handlePlaceSettle() {
		pendingPlace = null;
	}

	// Follows the drag handles and works out where every row is drawn (`$lib/sortable-list.svelte.ts`).
	const sortable = createSortableList({ onDrop: handleDrop });
</script>

<!-- No button on the empty state: the form that adds a question is directly
	underneath. -->
{#if shownQuestions.length === 0}
	<EmptyState
		icon={ListChecks}
		title="No custom questions."
		description="The form already asks for profile, preferences and motivation. Add anything else you need."
	/>
{:else}
	<!-- An `<ol>` rather than a `<ul>`: the order of these questions is what the
		apply form asks them in, so it is part of what the list means. -->
	<SortableDropForm
		formId={QUESTION_DROP_FORM_ID}
		action="?/moveQuestionTo"
		idName="questionId"
		{pendingPlace}
		{sortable}
		hintId={QUESTION_DROP_HINT_ID}
		hint={reorderHint('question')}
		onSettle={handlePlaceSettle}
	/>

	<!-- `data-sortable-list` tells the dragging helper which rows belong to this list. -->
	<ol data-sortable-list>
		<!-- The `(question.id)` key lets Svelte reuse list items instead of
			rebuilding them, which matters here because a move reorders the list. -->
		{#each shownQuestions as question, index (question.id)}
			<SortableItem {sortable} id={question.id} {index}>
				<QuestionRow
					{question}
					{conferenceSlug}
					{index}
					isLast={index === shownQuestions.length - 1}
					{sortable}
					isSaving={pendingPlace !== null}
					onMoveSend={handleMoveSend}
					onMoveSettle={handleMoveSettle}
					onDelete={submitDelete}
				/>
			</SortableItem>
		{/each}
	</ol>
{/if}
