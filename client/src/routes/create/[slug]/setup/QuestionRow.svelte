<script lang="ts">
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import { questionTypeLabel, type ApplicationQuestion } from '$lib/application-questions';
	import { createSetupDialogUrl } from '$lib/urls';
	import QuestionMoveButtons from './QuestionMoveButtons.svelte';
	import RowActions from './RowActions.svelte';

	type Props = {
		slug: string;
		question: ApplicationQuestion;
		/** The first cannot move up, the last cannot move down. */
		isFirst: boolean;
		isLast: boolean;
		/** The Setup panel's one-line row: a grip, the words and the two actions, as drawn. */
		isCompact: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { slug, question, isFirst, isLast, isCompact }: Props = $props();
</script>

<!--
	On the Setup panel a 36 design pixel row: the grip in a 42 pixel column,
	the question 31 pixels after it, the pencil and the bin at the right. The
	grip is only a picture there; questions are moved with the arrows in the
	applications dialog, where the row also says the question's type.
-->
<li
	class={[
		'flex items-center border-t border-creation-rule',
		isCompact ? 'h-9 pr-5.25 max-lg:h-11' : 'min-h-11 gap-2 lg:min-h-10'
	]}
>
	{#if isCompact}
		<span class="flex w-10.5 shrink-0 justify-center text-creation-ink-600">
			<GripVertical class="size-4.5" aria-hidden="true" />
		</span>
		<span class="ml-7.75 min-w-0 flex-1 truncate fs-14 text-creation-ink-600">{question.label}</span
		>
	{:else}
		<QuestionMoveButtons questionId={question.id} label={question.label} {isFirst} {isLast} />
		<div class="flex min-w-0 flex-1 flex-col">
			<span class="break-words">{question.label}</span>
			<span class="text-xs text-muted-foreground">
				{questionTypeLabel(question.type)} · {question.isRequired ? 'Required' : 'Optional'}
			</span>
		</div>
	{/if}
	<RowActions
		name={question.label}
		editHref={createSetupDialogUrl(slug, 'question', question.id)}
		deleteHref={createSetupDialogUrl(slug, 'delete-question', question.id)}
	/>
</li>
