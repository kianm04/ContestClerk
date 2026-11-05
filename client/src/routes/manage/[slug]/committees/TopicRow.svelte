<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import Button from '$lib/components/Button.svelte';
	import DragHandle from '$lib/components/DragHandle.svelte';
	import { TOPIC_DROP_HINT_ID } from '$lib/committees';
	import { DENSE_CONTROL_CLASSES } from '$lib/form-fields';
	import type { SortableList } from '$lib/sortable-list.svelte';

	type Props = {
		/** The row's own key, which its drag handle reports when it is dropped. */
		rowKey: string;
		/** The topic as the server last had it, or as it was typed into a refused form. */
		text: string;
		/** Where the row stands in the list, counting from 0. */
		index: number;
		/** The name every row is sent under, so the server reads them as a list. */
		fieldName: string;
		/** The longest a topic may be. */
		maxLength: number;
		/** The list's dragging helper, which the row's drag handle reports to. */
		sortable: SortableList;
		/** True while the form these buttons sit in is sending, so they can say so. */
		isBusy: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { rowKey, text, index, fieldName, maxLength, sortable, isBusy }: Props = $props();
</script>

<div class="flex items-center gap-1">
	<!-- The handle a topic is dragged into order by. A drop only redraws the
		rows; the new order is saved with the rest of the form. -->
	<DragHandle
		{sortable}
		row={{ id: rowKey, index, name: `topic ${index + 1}` }}
		hintId={TOPIC_DROP_HINT_ID}
	/>

	<!-- The row's number is the label a screen reader reads; on screen the
		rows' order already says which topic is which, so `sr-only` hides it. -->
	<div class="min-w-0 grow">
		<label for="topic-{index}" class="sr-only">Topic {index + 1}</label>
		<input
			id="topic-{index}"
			name={fieldName}
			value={text}
			maxlength={maxLength}
			class={DENSE_CONTROL_CLASSES}
		/>
	</div>

	<!-- The number is in the name because "Remove" on its own, five times
		over, tells a screen-reader user nothing about which row they are on.
		`isLabelHidden` draws the cross alone and keeps the words as its name. -->
	<Button
		label="Remove topic {index + 1}"
		variant="ghost"
		size="dense-sm"
		icon={X}
		isLabelHidden
		formaction="?/removeTopic&index={index}"
		skipsValidation
		isLoading={isBusy}
	/>
</div>
