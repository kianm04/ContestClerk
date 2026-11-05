<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import {
		comboboxKeyAction,
		highlightedIndex as highlightOf,
		type ComboboxKeyAction
	} from '$lib/combobox-keys';
	import { pickedText } from '$lib/seat-picker';
	import { movedHighlight, type SeatOption } from '$lib/seat-search';
	import BoxKeyHint from './BoxKeyHint.svelte';
	import SeatOptionList from './SeatOptionList.svelte';

	type Props = {
		/** The input's `id`. The listbox and its options take theirs from it. */
		id: string;
		/** What the box is called for a screen reader: "Add a delegation". */
		label: string;
		placeholder: string;
		/** The options for what is typed (`$lib/seat-search.ts`). Each box decides its own. */
		optionsFor: (query: string) => SeatOption[];
		/** The key that puts the cursor here ("/"), shown at the box's right edge. */
		keyShortcut?: string;
		/**
		 * What Space in the empty box does instead of typing a space: a list's add
		 * box starts or pauses the clock with it. Left out, Space types a space.
		 */
		onEmptySpace?: () => void;
		/** Called with the option the chair chose, by Enter or a click. */
		onChoose: (option: SeatOption) => void;
		/** Picks for a form field ("Raised by", "Who"): a choice stays in the box, the list closes. */
		isPicker?: boolean;
	};

	let { id, label, placeholder, optionsFor, keyShortcut, onEmptySpace, onChoose, isPicker }: Props =
		$props();

	// `$state` makes Svelte redraw what reads these when they change.
	let query = $state('');
	let isOpen = $state(false);
	// Where ↑ and ↓ moved the highlight, or null until they do.
	let movedIndex: number | null = $state(null);

	const options = $derived(optionsFor(query));
	// The option Enter chooses (`$lib/combobox-keys.ts`).
	const highlightedIndex = $derived(highlightOf(options, movedIndex));
	const listboxId = $derived(`${id}-options`);
	const activeOptionId = $derived(
		isOpen && highlightedIndex >= 0 ? `${listboxId}-${highlightedIndex}` : undefined
	);

	/**
	 * Choose the option at `index` and hand it on. An add box empties and stays open for the
	 * next seat; a form field keeps the choice's words (`pickedText`) and closes its list.
	 */
	function chooseAt(index: number) {
		const option = options[index];

		if (option === undefined || !option.isChoosable) return;

		onChoose(option);
		query = isPicker ? pickedText(option) : '';
		movedIndex = null;
		if (isPicker) isOpen = false;
	}

	/** Do what a key does in the box (`$lib/combobox-keys.ts`). */
	function runKeyAction(action: ComboboxKeyAction, input: HTMLInputElement) {
		if (action === 'open') isOpen = true;
		if (action === 'highlightNext') movedIndex = movedHighlight(options, highlightedIndex, 1);
		if (action === 'highlightPrevious') movedIndex = movedHighlight(options, highlightedIndex, -1);
		if (action === 'choose') chooseAt(highlightedIndex);
		if (action === 'close') isOpen = false;
		if (action === 'leave') input.blur();
		if (action === 'pressClock') {
			isOpen = false;
			onEmptySpace?.();
		}
	}

	function handleKeydown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
		const isSpaceForTheClock = onEmptySpace !== undefined;
		const action = comboboxKeyAction(event.key, { isOpen, query, isSpaceForTheClock });

		if (action === null) return;

		// The box does this key's work, so the browser and the console's keys must not.
		event.preventDefault();
		runKeyAction(action, event.currentTarget);
	}

	function handleInput() {
		isOpen = true;
		movedIndex = null;
	}

	/**
	 * A click opens the list again after Escape. `focus()` is for a click made
	 * by a script, such as the console's "/" key, which does not move the focus
	 * by itself; a real click has already put the cursor in the box.
	 */
	function handleClick(event: MouseEvent & { currentTarget: HTMLInputElement }) {
		event.currentTarget.focus();
		isOpen = true;
	}
</script>

<!--
	A box to type a delegation into, following the ARIA combobox pattern: the
	input is the `combobox`, the list under it the `listbox`. It opens with
	every seat when it takes the focus, which it never does by itself ("/" or a
	click puts the cursor in it), and filters as the chair types. Enter chooses
	the highlighted seat and keeps the focus here, so "fra ⏎ ger ⏎ ken ⏎" adds
	three. `bind:value` keeps `query` and the box's text the same.
-->
<div class="relative">
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
			aria-label={label}
			aria-expanded={isOpen}
			aria-controls={listboxId}
			aria-activedescendant={activeOptionId}
			aria-autocomplete="list"
			aria-keyshortcuts={keyShortcut}
			autocomplete="off"
			{placeholder}
			bind:value={query}
			oninput={handleInput}
			onfocus={() => (isOpen = true)}
			onblur={() => (isOpen = false)}
			onclick={handleClick}
			onkeydown={handleKeydown}
			class="peer h-11 w-full rounded-control border border-line bg-surface px-10 text-body placeholder:text-ink-400 focus:border-transparent focus:ring-2 focus:ring-brand-500"
		/>
		{#if keyShortcut}
			<BoxKeyHint keyName={keyShortcut} />
		{/if}
	</div>
	<SeatOptionList id={listboxId} {options} {highlightedIndex} {isOpen} {query} onPick={chooseAt} />
</div>
