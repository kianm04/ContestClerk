<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { SortableList } from '$lib/sortable-list.svelte';
	import { QUEUE_DRAG_FORM_ID, QUEUE_DRAG_HINT_ID } from '$lib/speakers-lists';

	type Props = {
		/** The queue's dragging helper, whose messages this component reads out. */
		sortable: SortableList;
		/**
		 * Sends a drop through the chair's instant form, which fills in the
		 * dropped entry and its place and draws the new order at once
		 * (`$lib/chair-form.ts`).
		 */
		onSubmit: SubmitFunction;
	};

	let { sortable, onSubmit }: Props = $props();
</script>

<!--
	The form a drop is saved through, posting `entryId` and `place` to
	`?/moveTo`. It has no fields of its own: the drag handles belong to it
	through their `form` attribute, the queue sends it when a row is dropped,
	and `onSubmit` fills in what to save. Dragging needs JavaScript, so without
	it this form is never sent; the row menu's moves do the same work.
-->
<form
	id={QUEUE_DRAG_FORM_ID}
	method="post"
	action="?/moveTo"
	class="hidden"
	use:enhance={onSubmit}
></form>

<!-- `sr-only` hides these from the screen but not from a screen reader. -->
<p id={QUEUE_DRAG_HINT_ID} class="sr-only">
	Drag to reorder, or press Space to pick the speaker up, the arrow keys to move them and Space to
	drop them.
</p>
<!-- `aria-live` makes a screen reader read each new message out as soon as it appears. -->
<p class="sr-only" aria-live="assertive">{sortable.announcement}</p>
