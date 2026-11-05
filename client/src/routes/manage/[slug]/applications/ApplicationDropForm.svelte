<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import { APPLICATION_DROP_FORM_ID, type ApplicationBoardMove } from '$lib/application-board';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** The drop being sent: the application, and the column it landed on. */
		pendingMove: ApplicationBoardMove | null;
		/** Where the drop posts to: the bulk bar's `bulkWaitlist`, `chooseAccept` or `chooseReject`. */
		action: string;
		/** Called once the server has answered, saved, refused or never reached. */
		onSettle: () => void;
	};

	let { pendingMove, action, onSettle }: Props = $props();

	/** Tick the one dropped application, in the field the bulk bar's actions read. */
	function handleSend(formData: FormData) {
		if (pendingMove === null) return;

		formData.set('ids', pendingMove.application.id);
	}

	// Sends the drop in the background (`$lib/in-place-form.svelte.ts`). A refusal
	// shows as the page's message and a lost connection as a toast, and `onSettle`
	// lets the board put the card back where the server really has it.
	const inPlaceForm = createInPlaceForm({ onSend: handleSend, onSettle: () => onSettle() });
</script>

<!--
	The form a drop is sent through. It has no fields of its own:
	`ApplicationsBoard` sends it when a card is dropped on a column, and
	`handleSend` ticks that one application. Dragging needs JavaScript, so
	without it this form is never sent; the tabs and the bulk bar do the same
	work with plain forms.
-->
<form
	id={APPLICATION_DROP_FORM_ID}
	method="post"
	{action}
	class="hidden"
	use:enhance={inPlaceForm.submit}
></form>
