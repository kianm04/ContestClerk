<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	type Props = {
		/** What the box shows: what was typed, or else the search in the URL. */
		searchText: string;
		/** Called on every keystroke. */
		onSearchInput: (event: Event & { currentTarget: HTMLInputElement }) => void;
		/** Called with the form when Enter is pressed, to search at once. */
		onSearchNow: (form: HTMLFormElement) => void;
	};

	let { searchText, onSearchInput, onSearchNow }: Props = $props();

	/*
		What the box holds now: the search the page was given to begin with, and
		whatever is typed after that. `bind:value` rather than a plain `value`
		keeps letters typed before Svelte brought the page to life, which
		`$lib/components/TextField.svelte` explains in full. A `$derived` can be
		written to, and starts over from `searchText` whenever that changes.
	*/
	let currentText = $derived(searchText);

	/*
		Whether the page has come to life. The server always sends `false`, so the
		"Search" button is on screen until then. `onMount` only runs in the browser,
		once the page's handlers work, and then the button is hidden. The search
		row of `/conferences` does the same.
	*/
	let isEnhanced = $state(false);

	onMount(() => {
		isEnhanced = true;
	});

	/**
	 * Enter searches at once. With the button hidden the browser would not send
	 * the form on Enter by itself, so this does what the button would have done.
	 */
	function handleSearchKeydown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
		// `isComposing` is true while a Chinese or Japanese keyboard, say, is still
		// putting a character together, when Enter only confirms that character.
		if (event.key !== 'Enter' || event.isComposing) return;

		const form = event.currentTarget.form;

		if (!form) return;

		// Stops the browser sending the form as well, which would navigate twice.
		event.preventDefault();
		onSearchNow(form);
	}
</script>

<div class="flex min-w-0 gap-3 sm:flex-1">
	<!-- `sr-only` hides the label from the screen but not from a screen reader. -->
	<label for="applications-search" class="sr-only">Search applications</label>

	<!-- `h-11` is the 44px a finger needs; the shadcn `Input` brings everything else. -->
	<Input
		id="applications-search"
		type="search"
		name="q"
		bind:value={currentText}
		placeholder="Conference, committee, country or status"
		oninput={onSearchInput}
		onkeydown={handleSearchKeydown}
		class="h-11 flex-1"
	/>

	<!--
		Without JavaScript this is the form's submit button, which also lets Enter
		send the form then, so it stays in the markup; `hidden` takes it off the
		screen once the page has come to life.
	-->
	<Button type="submit" variant="outline" class="h-11 px-4" hidden={isEnhanced}>Search</Button>
</div>
