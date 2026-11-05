<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { fieldId } from '$lib/form-fields';

	type Props = {
		/** What the search box shows: what was typed, or else the search in the URL. */
		searchText: string;
		/** Called on every keystroke in the search box. */
		onSearchInput: (event: Event & { currentTarget: HTMLInputElement }) => void;
		/** Called with the form when Enter is pressed in the search box, to search at once. */
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
		Whether the page has come to life. The server always sends `false`, so
		"Apply filters" is on screen until then. `onMount` only ever runs in the
		browser, once Svelte has taken over the page's HTML, so it flips this to
		`true` exactly when the page's handlers start working, and the button is
		hidden. `DragHandle` does the same.
	*/
	let isEnhanced = $state(false);

	onMount(() => {
		isEnhanced = true;
	});

	/*
		The box's own id. The top bar has a search box called `q` as well, so this
		one cannot take the id `fieldId('q')` would give it: a label can only point
		at one box.
	*/
	const inputId = fieldId('conference-search');

	/**
	 * Enter in the search box searches at once. With "Apply filters" hidden the
	 * browser would not send the form on Enter by itself, so this does what the
	 * button would have done, through the same navigation as every other control.
	 */
	function handleSearchKeydown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
		// `isComposing` is true while a keyboard for Chinese or Japanese, say, is
		// still putting a character together, when Enter only confirms that character.
		if (event.key !== 'Enter' || event.isComposing) return;

		// An input's `form` is the form it sits in.
		const form = event.currentTarget.form;

		if (!form) return;

		// Stops the browser sending the form as well, which would navigate twice.
		event.preventDefault();
		onSearchNow(form);
	}
</script>

<!--
	The row is centred and never wider than 61rem, as the mockup draws it. The
	search box takes whatever room the button leaves, so when the button is
	hidden the box grows to the right and its left edge stays where it was.
-->
<div class="mx-auto flex w-full max-w-[61rem] gap-3">
	<!-- `relative` is what the magnifier inside the box is placed against. -->
	<div class="relative min-w-0 flex-1">
		<!-- `sr-only` hides the label from the screen but not from a screen reader. -->
		<label for={inputId} class="sr-only">Search conferences</label>

		<!-- The magnifier sits inside the box; `pl-13` on the box keeps the words clear of it. -->
		<span
			class="pointer-events-none absolute inset-y-0 left-5 flex items-center text-muted-foreground"
		>
			<Search size={20} strokeWidth={1.75} aria-hidden="true" />
		</span>

		<!--
			The shadcn `Input`, drawn as the mockup's pill (Trello WMcXfry0): 3.25rem
			tall, round ends and a soft shadow. The `Input` is see-through by itself,
			which over the hero picture would show the building through the box, so
			`bg-background` paints it white. Only sizing, shape, shadow and that
			colour are passed to it; the project's own type tokens (`text-body`)
			would be mistaken for colours by its class merger and knock the colour out.
		-->
		<Input
			id={inputId}
			type="search"
			name="q"
			bind:value={currentText}
			placeholder="Search conferences, cities or organisations…"
			oninput={onSearchInput}
			onkeydown={handleSearchKeydown}
			class="h-13 rounded-full bg-background pr-5 pl-13 shadow-card"
		/>
	</div>

	<!--
		"Apply filters" rather than "Apply": on this page the bare word collides
		with applying to a conference, which is what the tick box below it and the
		pill on every card are about.

		Without JavaScript it is the form's submit button, and it is also what lets
		Enter in the search box send the form then (the browser only does that for a
		form with a submit button), so it stays in the markup. The `hidden`
		attribute on the box around it takes it off the screen once the page has
		come to life, while the button keeps its name for a screen reader.
	-->
	<div class="flex shrink-0" hidden={isEnhanced}>
		<Button type="submit" variant="outline" class="h-13 rounded-full px-5">Apply filters</Button>
	</div>
</div>
