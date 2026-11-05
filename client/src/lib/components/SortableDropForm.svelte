<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { PendingPlace } from '$lib/drag-order';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import type { SortableList } from '$lib/sortable-list.svelte';

	type Props = {
		/** The form's `id`, which every drag handle of the list names in its `form` attribute. */
		formId: string;
		/** The form action a drop posts to, such as `?/moveTo`. */
		action: string;
		/** The name the dropped row's id is sent under, such as `committeeId`. */
		idName: string;
		/** The drop being saved: which row, and the place it was dropped at. */
		pendingPlace: PendingPlace | null;
		/** The list's dragging helper, whose messages this component reads out. */
		sortable: SortableList;
		/** The `id` of the paragraph explaining the keys, which each handle points at. */
		hintId: string;
		/** That paragraph, such as "Drag to reorder, or press Space to pick the fee up…". */
		hint: string;
		/** Called once the server has answered, saved or refused. */
		onSettle: () => void;
	};

	let { formId, action, idName, pendingPlace, sortable, hintId, hint, onSettle }: Props = $props();

	/** Put the dropped row and its new place, counting from 1, into the form being sent. */
	function handleSend(formData: FormData) {
		if (pendingPlace === null) return;

		formData.set(idName, pendingPlace.id);
		formData.set('place', String(pendingPlace.toIndex + 1));
	}

	// Sends the drop in the background (`$lib/in-place-form.svelte.ts`). A refusal
	// or a lost connection shows as a message, and `onSettle` lets the list put
	// the rows back in the order the server really has.
	const inPlaceForm = createInPlaceForm({ onSend: handleSend, onSettle: () => onSettle() });
</script>

<!--
	The form a drop is saved through, one per ordered list, the way the speaking
	queue's `QueueDragForm` does it. It has no fields of its own: the drag
	handles belong to it through their `form` attribute, the list sends it when
	a row is dropped, and `handleSend` fills in what to save. Dragging needs
	JavaScript, so without it this form is never sent. It must sit outside any
	other form, because HTML does not allow a form inside a form.
-->
<form id={formId} method="post" {action} class="hidden" use:enhance={inPlaceForm.submit}></form>

<!-- `sr-only` hides these from the screen but not from a screen reader. -->
<p id={hintId} class="sr-only">{hint}</p>
<!-- `aria-live` makes a screen reader read each new message out as soon as it appears. -->
<p class="sr-only" aria-live="assertive">{sortable.announcement}</p>
