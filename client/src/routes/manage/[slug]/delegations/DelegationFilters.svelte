<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import FilterSearch from '$lib/components/manage/FilterSearch.svelte';
	import FilterSelect from '$lib/components/manage/FilterSelect.svelte';
	import {
		DELEGATION_SORT_OPTIONS,
		EMPTY_DELEGATION_LIST_QUERY,
		type DelegationListQuery
	} from '$lib/delegations';
	import { countryFilterOptions } from '$lib/filter-options';
	import { manageDelegationsUrl } from '$lib/urls';

	type Props = {
		/** The filters the rows on screen were built from, so every control shows its own. */
		query: DelegationListQuery;
		/** The conference's slug, for the form's own address and the reset link. */
		conferenceSlug: string;
	};

	let { query, conferenceSlug }: Props = $props();

	// Reset clears the filters but stays on the tab being read, because the tab is
	// where the organiser is rather than something they filtered by. `$derived`
	// builds the address again whenever the open tab changes.
	const resetHref = $derived(
		manageDelegationsUrl(conferenceSlug, {
			...EMPTY_DELEGATION_LIST_QUERY,
			status: query.status
		})
	);
</script>

<!--
	A real GET form. Submitting it navigates to
	`/manage/<slug>/delegations?q=…&country=…`, so filtering works without
	JavaScript and every filter is in the address, which is what makes the back
	button, a refresh and a shared link all show the same rows. `page` is not
	among its fields, so any change of filter starts again at the first page.
-->
<form method="get" action={manageDelegationsUrl(conferenceSlug)}>
	<!--
		The open tab is part of the same address, so it travels with the filters
		rather than being reset to "Under review" by every search.
	-->
	<input type="hidden" name="status" value={query.status} />

	<FilterBar {resetHref} isTwoColumnsOnPhone>
		<div class="col-span-2">
			<FilterSearch
				name="q"
				value={query.q}
				placeholder="School or head"
				label="Search delegations"
			/>
		</div>

		<!--
			Every country rather than only the ones a delegation came from. The
			empty choice reads "Any country" because here it means "do not filter
			by country".
		-->
		<FilterSelect
			label="Country"
			name="country"
			value={query.country}
			options={countryFilterOptions()}
			placeholder="Any country"
		/>

		<FilterSelect label="Sort" name="sort" value={query.sort} options={DELEGATION_SORT_OPTIONS} />

		<Button label="Apply filters" type="submit" variant="secondary" size="dense" />
	</FilterBar>
</form>
