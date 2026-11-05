<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import {
		comboboxKeyAction,
		highlightedIndex as highlightOf,
		type ComboboxKeyAction
	} from '$lib/combobox-keys';
	import type { AttendanceStatus, RoomSeat } from '$lib/committee-room';
	import { KEY_SHORTCUTS } from '$lib/console-keys';
	import { raisedByLabel } from '$lib/motions';
	import { movedHighlight, raisedByOptions } from '$lib/seat-search';
	import RaisedByOptions from './RaisedByOptions.svelte';

	type Props = {
		/** The input's `id`, which its label points at. */
		id: string;
		/** Every seat of the committee. */
		seats: RoomSeat[];
		/** The latest roll call, keyed by seat id; empty before the first. */
		attendance: Record<string, AttendanceStatus>;
		/** The chosen seat's id, `chair`, or `''` while nothing is chosen. */
		value: string;
		/** The `id` of the field the cursor moves to once a seat is chosen, or null to stay. */
		nextFieldId: string | null;
		/** The `id` of the message under the field, while there is one. */
		errorId: string | null;
		/** Called with the chosen option's value. */
		onChoose: (value: string) => void;
	};

	let { id, seats, attendance, value, nextFieldId, errorId, onChoose }: Props = $props();

	// The chosen seat's name as the box shows it: "Kenya", "The chair", or nothing.
	const chosenLabel = $derived(raisedByLabel(value, seats));
	// What the box shows. A `$derived` can be assigned to: what the chair types
	// stays until the choice from outside changes, as it does when the composer
	// empties itself after a motion is added.
	let query = $derived(chosenLabel);
	let isOpen = $state(false);
	// Where ↑ and ↓ moved the highlight, or null until they do.
	let movedIndex: number | null = $state(null);

	// Only a box still showing the chosen name sends it; typing over it unchooses it.
	const isChoiceShown = $derived(value !== '' && query === chosenLabel);
	// Showing a choice, the list offers every seat again until the chair types.
	const options = $derived(raisedByOptions(seats, attendance, isChoiceShown ? '' : query));
	const highlightedIndex = $derived(highlightOf(options, movedIndex));
	const listboxId = $derived(`${id}-options`);
	const activeOptionId = $derived(
		isOpen && highlightedIndex >= 0 ? `${listboxId}-${highlightedIndex}` : undefined
	);

	/** Choose the option at `index`, show its name and move on to the next field. */
	function chooseAt(index: number) {
		const option = options[index];

		if (option === undefined || !option.isChoosable) return;

		onChoose(option.value);
		query = option.label;
		isOpen = false;
		movedIndex = null;

		if (nextFieldId !== null) document.getElementById(nextFieldId)?.focus();
	}

	/** Do what a key does in the box (`$lib/combobox-keys.ts`). */
	function runKeyAction(action: ComboboxKeyAction, input: HTMLInputElement) {
		if (action === 'open') isOpen = true;
		if (action === 'highlightNext') movedIndex = movedHighlight(options, highlightedIndex, 1);
		if (action === 'highlightPrevious') movedIndex = movedHighlight(options, highlightedIndex, -1);
		if (action === 'choose') chooseAt(highlightedIndex);
		if (action === 'close') isOpen = false;
		if (action === 'leave') input.blur();
	}

	function handleKeydown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
		// With the list closed, Enter is the form's: it adds the motion.
		if (event.key === 'Enter' && !isOpen) return;

		const action = comboboxKeyAction(event.key, { isOpen, query, isSpaceForTheClock: false });

		if (action === null) return;

		// The box does this key's work, so the browser and the console's keys must not.
		event.preventDefault();
		runKeyAction(action, event.currentTarget);
	}

	function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
		query = event.currentTarget.value;
		isOpen = true;
		movedIndex = null;
	}

	/**
	 * Taking the focus, the whole name is selected, so typing replaces it. The
	 * list waits for typing, ↓ or a click: the cursor comes back here after
	 * every motion added, and an open list would cover the row of kinds.
	 */
	function handleFocus(event: FocusEvent & { currentTarget: HTMLInputElement }) {
		event.currentTarget.select();
	}
</script>

<!--
	"Raised by" with JavaScript, following the ARIA combobox pattern: type part
	of a delegation, Enter chooses the highlighted one and the cursor moves on
	to the next field. "The chair" comes first. The hidden field is what the
	form sends. `aria-keyshortcuts="M"` lets the console's M key put the cursor
	here while Motions is open.
-->
<div class="relative">
	<input type="hidden" name="proposedBySeatId" value={isChoiceShown ? value : ''} />
	<div class="relative flex items-center">
		<Search
			size={18}
			strokeWidth={1.75}
			aria-hidden="true"
			class="pointer-events-none absolute left-3 text-ink-400"
		/>
		<input
			{id}
			type="text"
			role="combobox"
			aria-expanded={isOpen}
			aria-controls={listboxId}
			aria-activedescendant={activeOptionId}
			aria-autocomplete="list"
			aria-invalid={errorId !== null}
			aria-describedby={errorId ?? undefined}
			aria-keyshortcuts={KEY_SHORTCUTS.motions}
			autocomplete="off"
			placeholder="Search delegations"
			value={query}
			oninput={handleInput}
			onfocus={handleFocus}
			onclick={() => (isOpen = true)}
			onblur={() => (isOpen = false)}
			onkeydown={handleKeydown}
			class="h-10 w-full rounded-control border border-line bg-surface pr-3 pl-10 placeholder:text-ink-400 focus:border-transparent focus:ring-2 focus:ring-brand-500 max-md:h-11"
		/>
	</div>
	<RaisedByOptions id={listboxId} {options} {highlightedIndex} {isOpen} {query} onPick={chooseAt} />
</div>
