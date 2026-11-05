<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { AttendanceStatus, RoomSeat } from '$lib/committee-room';
	import type { ChairPage } from '$lib/live-mode';
	import { keyToAction } from '$lib/roll-call-keys';
	import RollCallRow from './RollCallRow.svelte';

	type Props = {
		/** The available seats, in alphabetical order. */
		seats: RoomSeat[];
		/** Every seat's answer, keyed by seat id, with the presses on their way laid on top. */
		marks: Record<string, AttendanceStatus>;
		/** The roll call the rows answer in, or null before the session's first. */
		rollCallId: string | null;
		/** The page the view was opened from, which every press keeps. */
		from: ChairPage;
		/** The row the focus marker starts on, from `?seat=` in the address, or null for the first. */
		markedSeatId: string | null;
		/** Sends a row's form in the background; handed to each row's `use:enhance`. */
		onSubmit: SubmitFunction;
	};

	let { seats, marks, rollCallId, from, markedSeatId, onSubmit }: Props = $props();

	// The row the keys act on, the focus marker (▸). `$state` redraws the rows
	// when it changes. It starts on the row the address names and from then on
	// follows the focus and the chair's clicks, so the answer coming back from
	// the server, which names the row pressed, never pulls it back.
	// svelte-ignore state_referenced_locally
	let markedId: string | null = $state(markedSeatId ?? seats[0]?.id ?? null);

	/** The row a key press or a click happened in, by its `data-seat-id`. */
	function rowOf(target: EventTarget | null): HTMLElement | null {
		return target instanceof Element ? target.closest<HTMLElement>('[data-roll-call-row]') : null;
	}

	/** Put the focus on a row's chosen answer, or its first button before it has one. */
	function focusRow(row: Element | null) {
		const chosen = row?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
		const first = row?.querySelector<HTMLButtonElement>('button');
		(chosen ?? first)?.focus();
	}

	/** The marker follows the focus, so it shows how far the chair has got. */
	function handleFocusIn(event: FocusEvent) {
		markedId = rowOf(event.target)?.dataset.seatId ?? markedId;
	}

	/** After an answer, on to the next seat; after the last one the focus stays on the answer just given. */
	function moveOn(row: Element, pressed: HTMLButtonElement | null) {
		if (row.nextElementSibling) focusRow(row.nextElementSibling);
		else pressed?.focus();
	}

	/**
	 * A press on a row moves the marker there too. Two presses need more:
	 *
	 * - A mouse click (`detail` counts the clicks) also focuses the button, as
	 *   Chrome does by itself and Safari does not, so the keys work next.
	 * - A click with no mouse and the focus outside the list is the console
	 *   pressing A, P or V on the marked row (`aria-keyshortcuts` in
	 *   `RollCallRow.svelte`). It moves on to the next seat, as the list's own
	 *   keys do, and so brings the focus into the list.
	 *
	 * Enter or Space on a button is a click with no mouse but with the focus
	 * on it, and keeps the focus where it is.
	 */
	function handleClick(event: MouseEvent & { currentTarget: HTMLElement }) {
		const row = rowOf(event.target);
		const pressed = event.target instanceof Element ? event.target.closest('button') : null;

		if (row === null) return;

		const isMouse = event.detail > 0;
		const isFromOutside = !event.currentTarget.contains(document.activeElement);

		if (!isMouse && isFromOutside) {
			moveOn(row, pressed);
			return;
		}

		markedId = row.dataset.seatId ?? markedId;
		if (isMouse) pressed?.focus();
	}

	/**
	 * The roll call's keys, while the focus is inside the list: ↓ and ↑ move to
	 * the next or the previous seat; A, P and V answer the marked seat and move
	 * on to the next, so P six times marks six seats present. After the last
	 * seat the marker stays on it. `keyToAction` in `$lib/roll-call-keys.ts`
	 * says what a key means; this only does it. One handler on the list hears
	 * every key pressed inside it, because a key event travels up from the
	 * focused button through everything around it. It works with the
	 * console's shortcuts off: it answers only while the list has the focus.
	 * With them on, A, P and V also work from anywhere else on the page,
	 * through the console (`handleClick` above).
	 */
	function handleKeydown(event: KeyboardEvent) {
		// Leave the browser's own shortcuts, such as Ctrl+P for printing, alone.
		if (event.ctrlKey || event.metaKey || event.altKey) return;

		const action = keyToAction(event.key);
		const row = rowOf(event.target);

		if (action === null || row === null) return;

		// Arrow keys would otherwise also scroll the list.
		event.preventDefault();

		if (action.kind === 'mark') {
			const pressed = row.querySelector<HTMLButtonElement>(`button[value="${action.status}"]`);
			// Clicking the button sends the row's form, exactly as a mouse would.
			pressed?.click();
			moveOn(row, pressed);

			return;
		}

		const nextRow =
			action.direction === 'next' ? row.nextElementSibling : row.previousElementSibling;
		focusRow(nextRow);
	}
</script>

<!--
	The seats in alphabetical order, the way a chair calls them. The handlers
	are on the list rather than on each button, so they are written once. The
	list itself never takes the focus; its buttons do.
-->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<ul onkeydown={handleKeydown} onfocusin={handleFocusIn} onclick={handleClick}>
	<!-- The `(seat.id)` key lets Svelte reuse a row instead of rebuilding it. -->
	{#each seats as seat (seat.id)}
		<RollCallRow
			{seat}
			status={marks[seat.id] ?? 'absent'}
			{rollCallId}
			{from}
			isMarked={seat.id === markedId}
			hasAutofocus={seat.id === (markedSeatId ?? seats[0]?.id)}
			{onSubmit}
		/>
	{/each}
</ul>
