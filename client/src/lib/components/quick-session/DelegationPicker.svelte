<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '$lib/components/Button.svelte';
	import SearchInput from '$lib/components/SearchInput.svelte';
	import {
		addCustomMember,
		addMember,
		addPastedNames,
		fillFromList,
		isCountryChosen,
		searchMemberStates,
		type DraftChange,
		type QuickSessionDraft,
		type QuickSessionErrors
	} from '$lib/quick-session';
	import { QUICK_COLUMN_CLASSES, QUICK_LIST_CLASSES } from '$lib/quick-session-classes';
	import type { SeatListName } from '$lib/seat-lists';
	import CustomMemberRow from './CustomMemberRow.svelte';
	import MemberStateRow from './MemberStateRow.svelte';
	import PasteListForm from './PasteListForm.svelte';
	import ReadyListButtons from './ReadyListButtons.svelte';

	type Props = {
		/** The draft as it stands: its search and its members. */
		draft: QuickSessionDraft;
		/** The messages of the last change, of which this column shows the paste's and the custom name's. */
		errors: QuickSessionErrors;
		/** Called with the changed draft whenever something here changes it with JavaScript. */
		onChange: (change: DraftChange) => void;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { draft, errors, onChange }: Props = $props();

	// `$derived` works these out again whenever the search changes.
	const typed = $derived(draft.search.trim());
	const stateCodes = $derived(searchMemberStates(draft.search));

	/*
		Whether the page has come to life. Without JavaScript the search is
		sent with its "Search" button; with it the list follows every keystroke
		and the button is not drawn. `onMount` only ever runs in the browser,
		once Svelte has taken over the page, which is exactly when that starts.
	*/
	let isScriptRunning = $state(false);
	onMount(() => {
		isScriptRunning = true;
	});

	function handleChoose(listName: SeatListName) {
		onChange({ draft: fillFromList(draft, listName), errors: {} });
	}

	/** Add a pasted list; answers whether it was added, so the box can empty itself. */
	function handlePaste(text: string): boolean {
		const change = addPastedNames(draft, text);

		onChange(change);

		return change.errors.paste === undefined;
	}

	function handleSearchInput(event: Event & { currentTarget: HTMLInputElement }) {
		onChange({ draft: { ...draft, search: event.currentTarget.value }, errors: {} });
	}

	function handleAdd(value: string) {
		onChange({ draft: addMember(draft, value), errors: {} });
	}

	function handleAddCustom() {
		onChange(addCustomMember(draft));
	}
</script>

<!--
	The left-hand column, what can be added: the ready-made lists and "Paste a
	list", the search, then every member state it lets through and, while
	something is typed, a member that is not a state. The row of buttons is
	`relative` so the pasted list's box can hang under it.
-->
<section aria-labelledby="add-delegations-heading" class={QUICK_COLUMN_CLASSES}>
	<h2 id="add-delegations-heading" class="text-body font-semibold">Add delegations</h2>

	<div class="relative flex flex-wrap items-center gap-1.5">
		<ReadyListButtons onChoose={handleChoose} />
		<PasteListForm onAdd={handlePaste} error={errors.paste} />
	</div>

	<div class="flex gap-2">
		<div class="min-w-0 flex-1">
			<SearchInput
				name="q"
				value={draft.search}
				placeholder="Search countries"
				label="Search countries"
				oninput={handleSearchInput}
			/>
		</div>
		{#if !isScriptRunning}
			<Button label="Search" variant="secondary" formaction="?/search" />
		{/if}
	</div>

	<!-- About six rows tall on a phone, where the page itself scrolls. -->
	<div class="{QUICK_LIST_CLASSES} max-md:h-66 max-md:flex-none">
		<!-- The `(code)` key lets Svelte keep each row while the search changes which are shown. -->
		{#each stateCodes as code (code)}
			<MemberStateRow {code} isAdded={isCountryChosen(draft, code)} onAdd={handleAdd} />
		{/each}
		{#if typed !== ''}
			<CustomMemberRow
				{typed}
				hasNoMatch={stateCodes.length === 0}
				error={errors.custom}
				onAdd={handleAddCustom}
			/>
		{/if}
	</div>
</section>
