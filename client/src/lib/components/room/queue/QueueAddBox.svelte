<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onMount } from 'svelte';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { AttendanceStatus, RoomSeat } from '$lib/committee-room';
	import type { GslEntry } from '$lib/gsl-floor';
	import { KEY_SHORTCUTS } from '$lib/console-keys';
	import { GSL_ADD_BOX, type QueueAddBoxSettings } from '$lib/queue-add-box';
	import { queueSeatOptions, type SeatOption } from '$lib/seat-search';
	import AddSeatSelect from './AddSeatSelect.svelte';
	import SeatCombobox from './SeatCombobox.svelte';

	type Props = {
		/** The list the box adds to. */
		listId: string;
		/** Every entry of that list, with the presses on their way laid on top. */
		entries: GslEntry[];
		/** Every seat of the committee. */
		seats: RoomSeat[];
		/** The latest roll call, keyed by seat id; empty before the first. */
		attendance: Record<string, AttendanceStatus>;
		/** Sends the add through the chair's instant form, which lists the seat at once. */
		onSubmit: SubmitFunction;
		/** Its words and action: the GSL's "Add", or the Mod view's "Recognise" (`$lib/queue-add-box.ts`). */
		settings?: QueueAddBoxSettings;
	};

	let { listId, entries, seats, attendance, onSubmit, settings = GSL_ADD_BOX }: Props = $props();

	/** The add form's `id`, so a choice in the combobox can send it. */
	const ADD_FORM_ID = 'queue-add-form';

	/*
		Whether this component is running in the browser. Without JavaScript the
		box is a `<select>` and "Add"; `onMount` only ever runs in the browser,
		once Svelte has taken over the page, and swaps in the combobox.
	*/
	let isScriptRunning = $state(false);
	onMount(() => {
		isScriptRunning = true;
	});

	// The seat the chair chose last, which the form sends. A plain variable:
	// nothing is drawn from it.
	let chosen: SeatOption | null = null;

	/** The combobox's options for what is typed, with "in list", "speaking" and "absent · Mark present". */
	function optionsFor(query: string): SeatOption[] {
		return queueSeatOptions(seats, query, {
			entries,
			attendance,
			givesTheFloor: settings.givesTheFloor
		});
	}

	/** A seat chosen by Enter or a click: send the add form for it, as "Add" would. */
	function handleChoose(option: SeatOption) {
		chosen = option;

		const form = document.getElementById(ADD_FORM_ID);

		if (form instanceof HTMLFormElement) form.requestSubmit();
	}

	/*
		Space in an empty add box presses the room's clock button, found the way
		the console's `ShortcutKeys` finds any key's button: by the key it
		declares in `aria-keyshortcuts`.
	*/
	function handleEmptySpace() {
		const selector = `button[aria-keyshortcuts="${KEY_SHORTCUTS.clock}"]:not(:disabled)`;

		document.querySelector<HTMLButtonElement>(selector)?.click();
	}

	/**
	 * Fill in the chosen seat, and for "absent · Mark present" that it is to be
	 * marked present first, then hand the press on. Without JavaScript the
	 * `<select>` sends the seat itself.
	 */
	const submitAdd: SubmitFunction = (input) => {
		if (chosen !== null) {
			input.formData.set('seatId', chosen.value);
			if (chosen.marksPresent) input.formData.set('markPresent', '1');
		}

		return onSubmit(input);
	};
</script>

<!--
	The queue column's add box, a form posting to `?/add` (the Mod view's to
	`?/recognise`, `settings.action`). With JavaScript it
	is the combobox: type, then Enter. Without, a `<select>` of the present
	seats not on the list and "Add". `use:enhance` hands the form to
	`submitAdd`, which shows the new row at once.
-->
<form id={ADD_FORM_ID} method="post" action={settings.action} use:enhance={submitAdd} class="mb-2">
	<input type="hidden" name="listId" value={listId} />
	{#if isScriptRunning}
		<SeatCombobox
			id="queue-add-box"
			label={settings.label}
			placeholder={settings.placeholder}
			{optionsFor}
			keyShortcut={KEY_SHORTCUTS.addBox}
			onEmptySpace={handleEmptySpace}
			onChoose={handleChoose}
		/>
	{:else}
		<AddSeatSelect {entries} {seats} {attendance} {settings} />
	{/if}
</form>
