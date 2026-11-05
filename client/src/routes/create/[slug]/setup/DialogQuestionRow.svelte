<script lang="ts">
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { questionTypeLabel, type ApplicationQuestion } from '$lib/application-questions';
	import { createSetupDialogUrl } from '$lib/urls';

	type Props = {
		slug: string;
		question: ApplicationQuestion;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { slug, question }: Props = $props();
</script>

<!--
	A custom question in the applications dialog, as the design draws it: a
	50 pixel box with the grip, the question over its type, and blue edit and
	red delete icons. The grip only marks the row as one of an order; the
	questions are moved on the Setup panel, whose rows have the buttons.
-->
<li
	class="flex min-h-12.5 items-center rounded-md border border-creation-input-border bg-white py-1 pr-3.5 pl-4"
>
	<GripVertical class="size-4.5 shrink-0 text-creation-ink-450" aria-hidden="true" />
	<div class="ml-5.5 min-w-0 flex-1">
		<p class="truncate fs-16 lh-20 font-medium text-creation-ink-950">{question.label}</p>
		<p class="fs-14 lh-18 text-creation-ink-225">{questionTypeLabel(question.type)}</p>
	</div>
	<div class="ml-3 flex items-center gap-4.5">
		<a
			href={createSetupDialogUrl(slug, 'question', question.id)}
			aria-label="Edit {question.label}"
			class="flex size-6 items-center justify-center text-creation-blue max-lg:size-11"
		>
			<Pencil class="size-5" aria-hidden="true" />
		</a>
		<a
			href={createSetupDialogUrl(slug, 'delete-question', question.id)}
			aria-label="Delete {question.label}"
			class="flex size-6 items-center justify-center text-creation-red-icon max-lg:size-11"
		>
			<Trash2 class="size-5" aria-hidden="true" />
		</a>
	</div>
</li>
