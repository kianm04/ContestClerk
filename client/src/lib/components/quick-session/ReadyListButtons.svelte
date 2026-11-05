<script lang="ts">
	import type { SeatListName } from '$lib/seat-lists';
	import { QUICK_SEGMENT_CLASSES } from '$lib/quick-session-classes';

	type Props = {
		/** Called with the list's name when one is pressed with JavaScript. */
		onChoose: (listName: SeatListName) => void;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { onChoose }: Props = $props();

	/** The three ready-made lists, by the word the form sends for each. */
	const READY_LISTS: { name: SeatListName; label: string }[] = [
		{ name: 'un_members', label: 'UN members' },
		{ name: 'security_council', label: 'Security Council' },
		{ name: 'eu_members', label: 'EU members' }
	];

	/*
		Without JavaScript a list's button posts the whole form to
		`?/fillFromList`, carrying `list=un_members` and so on. With it the click
		is stopped here and the committee is filled in the browser instead.
	*/
	function handleChoose(event: MouseEvent, listName: SeatListName) {
		event.preventDefault();
		onChoose(listName);
	}
</script>

<!--
	"Start from" and the three ready-made lists, each replacing the members
	chosen so far, as myMUN's own lists do. "Paste a list", the fourth, is
	`PasteListForm`, which the column puts beside these in the same row.
-->
<span class="text-small text-ink-600">Start from</span>
<!-- The `(list.name)` key lets Svelte tell the three buttons apart. -->
{#each READY_LISTS as list (list.name)}
	<button
		type="submit"
		formaction="?/fillFromList"
		name="list"
		value={list.name}
		onclick={(event) => handleChoose(event, list.name)}
		class={QUICK_SEGMENT_CLASSES}
	>
		{list.label}
	</button>
{/each}
