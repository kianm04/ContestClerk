<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { SEAT_DROP_FORM_ID, type PendingSeatDrop } from '$lib/seat-drop';

	type Props = {
		/** The drop being saved: what was dragged, and the seat it landed on. */
		pendingDrop: PendingSeatDrop | null;
		/** Where the drop posts to: the page's `moveDelegate`, `swapDelegates` or `assignDelegation`. */
		action: string;
		/** Called once the server has answered, saved or refused. */
		onSettle: () => void;
	};

	let { pendingDrop, action, onSettle }: Props = $props();

	/** Put what was dropped where into the form being sent, in the fields the action reads. */
	function handleSend(formData: FormData) {
		if (pendingDrop === null) return;

		formData.set('toSeatId', pendingDrop.target.id);

		if (pendingDrop.source.kind === 'delegation') {
			formData.set('delegationId', pendingDrop.source.delegation.id);
			return;
		}

		formData.set('seatId', pendingDrop.source.seat.id);
	}

	// Sends the drop in the background (`$lib/in-place-form.svelte.ts`). A refusal
	// or a lost connection shows as a message, and `onSettle` lets the grid put
	// everybody back where the server really has them.
	const inPlaceForm = createInPlaceForm({ onSend: handleSend, onSettle: () => onSettle() });
</script>

<!--
	The form a drop is saved through. It has no fields of its own:
	`AllocationBoard` sends it when a delegate or a delegation is dropped on a
	seat, and `handleSend` fills in what to save. Dragging needs JavaScript, so
	without it this form is never sent; the seat menus and the delegation's
	review page do the same work with plain forms.
-->
<form
	id={SEAT_DROP_FORM_ID}
	method="post"
	{action}
	class="hidden"
	use:enhance={inPlaceForm.submit}
></form>
