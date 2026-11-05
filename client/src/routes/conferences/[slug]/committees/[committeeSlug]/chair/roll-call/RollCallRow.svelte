<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import SeatFlag from '$lib/components/room/floor/SeatFlag.svelte';
	import type { AttendanceStatus, RoomSeat } from '$lib/committee-room';
	import type { ChairPage } from '$lib/live-mode';
	import { ROLL_CALL_ANSWER_KEYS } from '$lib/console-keys';
	import { ATTENDANCE_LABELS, ATTENDANCE_STATUSES, ROLL_CALL_FROM_FIELD } from '$lib/roll-calls';
	import { rollCallAnswerClasses } from '$lib/roll-call-view';

	type Props = {
		/** The seat, with its flag and the delegate sitting in it. */
		seat: RoomSeat;
		/** The seat's answer, with a press still on its way already in it. */
		status: AttendanceStatus;
		/** The roll call the buttons answer in, or null before the session's first, which they make (R2). */
		rollCallId: string | null;
		/** The page the view was opened from, which every press keeps. */
		from: ChairPage;
		/** Whether the focus marker (▸) is on this row: the row the keys act on, whose answers declare A, P and V. */
		isMarked: boolean;
		/** Whether the row's chosen answer takes the focus when the page opens. */
		hasAutofocus: boolean;
		/**
		 * Sends the form in the background (`$lib/instant-form.svelte.ts`). Every
		 * row shares the one roll call form, so presses go in the order made.
		 */
		onSubmit: SubmitFunction;
	};

	let { seat, status, rollCallId, from, isMarked, hasAutofocus, onSubmit }: Props = $props();
</script>

<!--
	One seat: the focus marker, the flag, the country, the delegate's name, and
	the answer as one segmented control of three buttons in full words, the
	chosen one pressed (`aria-pressed`). `data-roll-call-row` and
	`data-seat-id` are how the list's keys and focus marker find the rows.

	The form has three submit buttons that all send `status`, each with its
	own value: whichever the chair presses is the answer the server gets.
	Without JavaScript it is an ordinary form; with it, `use:enhance` sends it
	in the background. On a phone the answers go under the country, full width.
-->
<li
	data-roll-call-row
	data-seat-id={seat.id}
	class="-mx-2 grid h-13 grid-cols-[16px_20px_minmax(0,240px)_minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-2 max-md:h-auto max-md:grid-cols-[16px_20px_minmax(0,1fr)] max-md:gap-y-2 max-md:py-2 {isMarked
		? 'bg-brand-50'
		: ''}"
>
	<span aria-hidden="true" class="text-[10px] text-brand-500">{isMarked ? '▸' : ''}</span>
	<SeatFlag {seat} size="row" />
	<span class="truncate">{seat.name}</span>
	<span class="truncate text-ink-600 max-md:hidden">{seat.delegateName ?? 'No delegate'}</span>

	<form
		method="post"
		action="?/setStatus"
		aria-label="Attendance of {seat.name}"
		use:enhance={onSubmit}
		class="flex max-md:col-span-3"
	>
		{#if rollCallId !== null}
			<input type="hidden" name="rollCallId" value={rollCallId} />
		{/if}
		{#if from !== 'chair'}
			<input type="hidden" name={ROLL_CALL_FROM_FIELD} value={from} />
		{/if}
		<input type="hidden" name="seatId" value={seat.id} />

		<!-- A list of plain strings has nothing but its position to be keyed by. -->
		{#each ATTENDANCE_STATUSES as answer, index (index)}
			<!-- `hasAutofocus` is on for one row only: the one the address names, or the first. -->
			<!-- svelte-ignore a11y_autofocus -->
			<button
				type="submit"
				name="status"
				value={answer}
				aria-pressed={answer === status}
				aria-keyshortcuts={isMarked ? ROLL_CALL_ANSWER_KEYS[answer] : undefined}
				autofocus={hasAutofocus && answer === status}
				class={rollCallAnswerClasses(answer, answer === status)}
			>
				{ATTENDANCE_LABELS[answer]}
			</button>
		{/each}
	</form>
</li>
