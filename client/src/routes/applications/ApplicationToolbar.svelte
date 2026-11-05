<script lang="ts">
	import { onDestroy } from 'svelte';
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import {
		parseMyApplicationsQuery,
		type ApplicationTabCounts,
		type MyApplicationsQuery
	} from '$lib/my-applications-query';
	import { myApplicationsUrl } from '$lib/urls';
	import ApplicationSearchBox from './ApplicationSearchBox.svelte';
	import ApplicationSortSelect from './ApplicationSortSelect.svelte';
	import ApplicationTabs from './ApplicationTabs.svelte';

	type Props = {
		/** The search, tab and order the cards on screen were picked with, as the server read them. */
		query: MyApplicationsQuery;
		/** The numbers beside three of the tabs. */
		counts: ApplicationTabCounts;
	};

	let { query, counts }: Props = $props();

	/** How long to wait after the last keystroke before searching. */
	const SEARCH_DEBOUNCE_MS = 300;

	/*
		What the search box shows: what was typed, or else the search in the URL
		(`undefined` means nothing typed yet). Kept apart from `query` so that a
		slow answer carrying the old search cannot wipe out letters typed while it
		was on its way. `ConferenceFilters` on `/conferences` does the same.
	*/
	let typedSearch: string | undefined = $state();
	const searchText = $derived(typedSearch ?? query.q);

	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	/**
	 * Go to the address that describes what the form now holds. Nothing is
	 * filtered here: the new URL re-runs `load` on the server, which picks the cards.
	 */
	function navigateToQuery(form: HTMLFormElement) {
		clearTimeout(searchTimer);

		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a throwaway inside this one function, not state the page is drawn from
		const parameters = new URLSearchParams();

		// `FormData` reads every named control in the form: the search box, the
		// tab (a hidden field) and the order.
		for (const [name, value] of new FormData(form)) {
			parameters.set(name, String(value));
		}

		// Read back through the server's own function, so the two cannot disagree.
		const next = parseMyApplicationsQuery(parameters);

		// Keep the focus and the scroll, and replace the history entry rather than
		// add one, so the back button does not step through every search.
		return goto(myApplicationsUrl(next), { keepFocus: true, noScroll: true, replaceState: true });
	}

	/** A new order is picked: a `change` event bubbles up from the dropdown to the form. */
	function handleFormChange(event: Event & { currentTarget: HTMLFormElement }) {
		navigateToQuery(event.currentTarget);
	}

	/** Search as the reader types, but only once they pause. */
	function handleSearchInput(event: Event & { currentTarget: HTMLInputElement }) {
		typedSearch = event.currentTarget.value;
		const form = event.currentTarget.form;

		if (!form) return;

		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => navigateToQuery(form), SEARCH_DEBOUNCE_MS);
	}

	// A tab, a link or the back button decides the search instead: drop the
	// waiting search, and once there, let the box follow the URL again.
	beforeNavigate(({ type }) => {
		if (type !== 'goto') clearTimeout(searchTimer);
	});

	afterNavigate(({ type }) => {
		if (type !== 'goto') typedSearch = undefined;
	});

	// Otherwise a waiting search could fire after the page is gone.
	onDestroy(() => clearTimeout(searchTimer));
</script>

<!--
	A real GET form, so searching and sorting work without JavaScript too; the
	handlers above only save a click. The `data-sveltekit-*` attributes apply to
	the form and to the tab links inside it: keep the focus where it is, and
	replace the history entry, the way `/conferences` does with its filters.
-->
<form
	method="get"
	action={myApplicationsUrl()}
	onchange={handleFormChange}
	data-sveltekit-keepfocus
	data-sveltekit-replacestate
	class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center xl:flex-nowrap"
>
	<!-- The tab rides along with a search, so searching keeps the tab that is open. -->
	<input type="hidden" name="show" value={query.tab} />

	<ApplicationSearchBox
		{searchText}
		onSearchInput={handleSearchInput}
		onSearchNow={navigateToQuery}
	/>

	<!--
		From `xl` the three sit on one row, as the mockup draws them. Below it the
		tabs would not fit beside the search box, so `sm:order-last` and
		`sm:w-full` give them a row of their own under the search box and the
		order; `xl:order-none` puts them back between the two.
	-->
	<div class="min-w-0 sm:order-last sm:w-full xl:order-none xl:w-auto">
		<ApplicationTabs {query} {counts} />
	</div>

	<ApplicationSortSelect sort={query.sort} />
</form>
