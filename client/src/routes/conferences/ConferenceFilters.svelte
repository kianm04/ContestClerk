<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import { countActiveFilters, parseConferenceQuery, type ConferenceQuery } from '$lib/conferences';
	import type { CountryOption } from '$lib/countries';
	import { conferenceListUrl } from '$lib/urls';
	import ConferenceSearchRow from './ConferenceSearchRow.svelte';
	import FilterSidebar from './FilterSidebar.svelte';
	import FiltersDisclosure from './FiltersDisclosure.svelte';
	import QuickFilters from './QuickFilters.svelte';

	type Props = {
		/** The filters the results on screen were built from, as the server read them. */
		query: ConferenceQuery;
		/** Every country that has a conference. */
		countries: CountryOption[];
		/** The results, inside the form because their "Sort by" is one of its controls. */
		children: Snippet;
	};

	let { query, countries, children }: Props = $props();

	/** How long to wait after the last keystroke before searching. */
	const SEARCH_DEBOUNCE_MS = 300;

	/**
	 * What the search box should show. `undefined` means "nothing typed yet",
	 * and then the box simply shows whatever is in the URL. It is only about
	 * what is shown: `navigateToFilters` builds the address from the form.
	 *
	 * Keeping these two apart matters: without it, a slow response coming back
	 * with the old search text would wipe out characters the user typed while
	 * they were waiting for it.
	 */
	let typedSearch: string | undefined = $state();
	const searchText = $derived(typedSearch ?? query.q);

	// The number in the phone summary, worked out again whenever `query` changes.
	const activeFilterCount = $derived(countActiveFilters(query));

	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	/**
	 * Go to the address that describes what the form now holds. Nothing is
	 * filtered here: the new URL re-runs `load` on the server, which does the
	 * real work.
	 */
	function navigateToFilters(form: HTMLFormElement) {
		// A waiting search would only repeat what this navigation already carries.
		clearTimeout(searchTimer);

		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a throwaway inside this one function, not state the page is drawn from
		const parameters = new URLSearchParams();

		// `FormData` reads every named control in the form at once, straight from
		// the page, so `q` is whatever the search box holds now. That includes a
		// word typed before the page came to life, which no handler here heard.
		// `append` rather than `set`, because every ticked region box sends its own
		// `region`, and `set` would keep only the last of them.
		for (const [name, value] of new FormData(form)) {
			parameters.append(name, String(value));
		}

		// Reading the form back through the same function the server uses means the
		// two can never disagree about what a parameter means. It trims the search
		// text as well, so a box holding nothing but spaces is an empty search.
		const next = { ...parseConferenceQuery(parameters), page: 1 };

		return goto(conferenceListUrl(next), {
			keepFocus: true,
			noScroll: true,
			// Replace the current history entry instead of adding one, so the
			// back button does not have to step through every debounced search.
			replaceState: true
		});
	}

	/**
	 * Every dropdown, radio and tick box navigates through this one handler: a
	 * `change` event bubbles up from the control to the form around it, so the form
	 * can listen once instead of each control carrying a handler of its own.
	 */
	function handleFilterChange(event: Event & { currentTarget: HTMLFormElement }) {
		navigateToFilters(event.currentTarget);
	}

	/** Search as the user types, but only once they pause. */
	function handleSearchInput(event: Event & { currentTarget: HTMLInputElement }) {
		typedSearch = event.currentTarget.value;

		// An input's `form` is the form it sits in, so nothing has to be held on to.
		const form = event.currentTarget.form;

		if (!form) return;

		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => navigateToFilters(form), SEARCH_DEBOUNCE_MS);
	}

	// A link, a form submit or the back button decides the search text instead of
	// us, so drop the search we were about to run rather than let the two fight
	// over the URL. `goto` is our own navigation from the handlers, so it stays.
	beforeNavigate(({ type }) => {
		if (type !== 'goto') clearTimeout(searchTimer);
	});

	// ...and once that navigation lands, the box goes back to following the URL.
	afterNavigate(({ type }) => {
		if (type !== 'goto') typedSearch = undefined;
	});

	// Otherwise a pending search could fire after the page is gone.
	onDestroy(() => clearTimeout(searchTimer));
</script>

<!--
	A real GET form. Submitting it navigates to `/conferences?q=...&country=...`,
	so search and filtering keep working before (or without) JavaScript. The
	handlers above only save the visitor a click; they do not replace the form.
	The two `data-sveltekit-*` attributes make a submit behave like the handlers
	do: keep the focus where it is, and reuse the current history entry.
	`relative` lifts the form above the hero's picture, which is positioned.
-->
<form
	method="get"
	action={conferenceListUrl()}
	onchange={handleFilterChange}
	data-sveltekit-keepfocus
	data-sveltekit-replacestate
	class="relative flex flex-col gap-5"
>
	<ConferenceSearchRow
		{searchText}
		onSearchInput={handleSearchInput}
		onSearchNow={navigateToFilters}
	/>
	<QuickFilters {query} />

	<!-- From `lg` up the filters are a 15rem column; `minmax(0, 1fr)` lets the results shrink. -->
	<div class="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
		<FiltersDisclosure {activeFilterCount}>
			<FilterSidebar {query} {countries} />
		</FiltersDisclosure>

		<!-- `{@render children()}` draws the results the page put inside this form. -->
		{@render children()}
	</div>
</form>
