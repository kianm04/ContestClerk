<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import Button from '$lib/components/Button.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import FilterSearch from '$lib/components/manage/FilterSearch.svelte';
	import FilterSelect from '$lib/components/manage/FilterSelect.svelte';
	import type { AllocationQuery } from '$lib/allocation';
	import type { CommitteeChoice } from '$lib/applications';
	import type { FilterOption } from '$lib/filter-options';

	type Props = {
		/** The filters the grid on screen was built from, so every control shows its own. */
		query: AllocationQuery;
		/** Every committee of the conference, whether or not it has a seat left. */
		committees: CommitteeChoice[];
		/**
		 * Where "Reset" goes: the same grid with no filters on it. `ResolvedPathname`
		 * is the type `resolve()` from `$app/paths` gives back, so only an address
		 * built by a helper in `$lib/urls.ts` can be passed in.
		 */
		resetHref: ResolvedPathname;
	};

	let { query, committees, resetHref }: Props = $props();

	/*
		The four states a seat can be in. A reserved seat is called "held" on
		screen, the word the line under the title uses; the address keeps
		`reserved`.
	*/
	const STATE_OPTIONS: FilterOption[] = [
		{ value: 'free', label: 'Free' },
		{ value: 'reserved', label: 'Held' },
		{ value: 'filled', label: 'Filled' },
		{ value: 'hidden', label: 'Hidden' }
	];

	// `$derived` builds the list again whenever the committees change, which is
	// after `load` has run for a new address. The abbreviation is what the column
	// headings use, so the dropdown says the same word.
	const committeeOptions: FilterOption[] = $derived(
		committees.map((committee) => ({
			value: committee.id,
			label: committee.abbreviation ?? committee.name
		}))
	);
</script>

<!--
	A real GET form and nothing else, so filtering works with JavaScript switched
	off and every filter is in the address, which is what makes the back button,
	a refresh and a shared link all show the same grid.

	It has no `action`, so the browser submits it to this same page. A GET form
	replaces the whole query string with its own fields, which also drops `?seat=`
	and `?action=`, so changing a filter shuts any panel that was open.
-->
<form method="get">
	<FilterBar {resetHref} isTwoColumnsOnPhone>
		<div class="col-span-2">
			<FilterSearch
				name="q"
				value={query.q}
				placeholder="Delegate, school or seat"
				label="Search seats"
			/>
		</div>

		<FilterSelect
			label="Committee"
			name="committee"
			value={query.committee}
			options={committeeOptions}
			placeholder="Every committee"
		/>

		<FilterSelect
			label="State"
			name="state"
			value={query.state}
			options={STATE_OPTIONS}
			placeholder="Every state"
		/>

		<Button label="Apply filters" type="submit" variant="secondary" size="dense" />
	</FilterBar>
</form>
