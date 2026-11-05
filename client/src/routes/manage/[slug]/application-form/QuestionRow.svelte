<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Button from '$lib/components/Button.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import DragHandle from '$lib/components/DragHandle.svelte';
	import {
		QUESTION_DROP_FORM_ID,
		QUESTION_DROP_HINT_ID,
		questionSummaryLine,
		type ApplicationQuestion
	} from '$lib/application-questions';
	import type { PendingMove } from '$lib/list-move-preview';
	import type { SortableList } from '$lib/sortable-list.svelte';
	import { manageQuestionEditUrl } from '$lib/urls';
	import QuestionMoveForm from './QuestionMoveForm.svelte';

	type Props = {
		question: ApplicationQuestion;
		/** The conference's slug, for the links out of this row. */
		conferenceSlug: string;
		/** Where the question stands in the list, counting from 0. The first cannot move up. */
		index: number;
		/** True for the last row, which cannot move down. */
		isLast: boolean;
		/** The list's dragging helper, which the row's drag handle reports to. */
		sortable: SortableList;
		/** While a drop is being saved, so no row can be picked up yet. */
		isSaving: boolean;
		/** Tells the list which row is moving which way, the moment the press is sent. */
		onMoveSend: (move: PendingMove | null) => void;
		/** Tells the list the server has answered, so it can drop the guess. */
		onMoveSettle: () => void;
		/** The list's instant form, which takes the row away at once when it is deleted. */
		onDelete: SubmitFunction;
	};

	let {
		question,
		conferenceSlug,
		index,
		isLast,
		sortable,
		isSaving,
		onMoveSend,
		onMoveSettle,
		onDelete
	}: Props = $props();

	/*
		`$derived` works this out again whenever `question` changes, which is what
		redraws a row once it has been moved. The sentence is built in
		`$lib/application-questions.ts` rather than here, because `CLAUDE.md` keeps
		formatting out of a component's script block.
	*/
	const summary = $derived(questionSummaryLine(question));
</script>

<!--
	One line of the list, the way the manage redesign draws a list: the handle
	and arrows, the question and its summary, and the row's two buttons, with
	a thin line under it. On a phone the buttons wrap under the question.
-->
<div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-1 py-2">
	<!-- The handle a question is dragged into order by. It belongs to the
		list's hidden drop form, so it sits outside the arrows' form. -->
	<div class="flex items-center gap-1">
		<DragHandle
			{sortable}
			row={{ id: question.id, index, name: question.label }}
			hintId={QUESTION_DROP_HINT_ID}
			form={QUESTION_DROP_FORM_ID}
			isDisabled={isSaving}
		/>
		<QuestionMoveForm
			questionId={question.id}
			questionLabel={question.label}
			isFirst={index === 0}
			{isLast}
			{onMoveSend}
			{onMoveSettle}
		/>
	</div>

	<!-- `min-w-0` lets this column be narrower than a long question, so the
		question wraps instead of pushing the buttons off the row. `basis-48`
		is the narrowest it gets before the buttons drop under it. -->
	<div class="min-w-0 flex-1 basis-48 text-dense">
		<!-- No "Required" badge beside the question: `questionSummaryLine` below
			already ends in "Required" or "Optional", and a row that said it twice
			would be saying it twice. -->
		<h3 class="font-medium text-foreground">{index + 1}. {question.label}</h3>

		{#if question.helpText}
			<p class="text-small text-muted-foreground">{question.helpText}</p>
		{/if}

		<p class="text-small text-muted-foreground">{summary}</p>
	</div>

	<div class="flex items-center gap-2">
		<Button
			label="Edit"
			variant="ghost"
			size="dense-sm"
			href={manageQuestionEditUrl(conferenceSlug, question.id)}
		/>

		<!-- A form cannot sit inside another form, so the id the action needs is
			a child of `ConfirmButton`, which puts it inside its own form. `icon`
			draws the bin alone and makes "Delete question" its `aria-label`. -->
		<ConfirmButton
			label="Delete question"
			confirmTitle="Delete this question?"
			confirmText="Existing answers to it are kept but no longer shown."
			formaction="?/deleteQuestion"
			variant="ghost"
			size="dense-sm"
			icon={Trash2}
			onSubmit={onDelete}
		>
			<input type="hidden" name="questionId" value={question.id} />
		</ConfirmButton>
	</div>
</div>
