<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		questionId: string;
		/** The question's words, for the buttons' spoken names. */
		label: string;
		/** The first cannot move up, the last cannot move down. */
		isFirst: boolean;
		isLast: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { questionId, label, isFirst, isLast }: Props = $props();

	// Answers in place, so the page keeps its scroll position after a move.
	const moveForm = createInPlaceForm();

	// The two halves of the grip the mockup draws: side by side and 44px on a
	// phone, stacked and as tall as the row together on a desktop.
	const buttonClass = 'size-11 text-muted-foreground lg:h-3.5 lg:w-6 lg:rounded-sm';
</script>

<!--
	Moving is two tiny forms rather than dragging, so it works without
	JavaScript and from the keyboard. The hidden input carries which question;
	the button's own `name` and `value` say which way.
-->
<form
	method="POST"
	action="?/moveQuestion"
	use:enhance={moveForm.submit}
	class="flex shrink-0 lg:flex-col"
>
	<input type="hidden" name="id" value={questionId} />
	<Button
		type="submit"
		name="direction"
		value="up"
		variant="ghost"
		size="icon-xs"
		disabled={isFirst || moveForm.isBusy}
		aria-label="Move up: {label}"
		class={buttonClass}
	>
		<ChevronUp aria-hidden="true" />
	</Button>
	<Button
		type="submit"
		name="direction"
		value="down"
		variant="ghost"
		size="icon-xs"
		disabled={isLast || moveForm.isBusy}
		aria-label="Move down: {label}"
		class={buttonClass}
	>
		<ChevronDown aria-hidden="true" />
	</Button>
</form>
