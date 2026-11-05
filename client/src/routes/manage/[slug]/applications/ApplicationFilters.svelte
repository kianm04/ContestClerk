<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import type { SelectOption } from '$lib/components/SelectField.svelte';
	import FilterSearch from '$lib/components/manage/FilterSearch.svelte';
	import FilterSelect from '$lib/components/manage/FilterSelect.svelte';
	import {
		APPLICATION_SORT_OPTIONS,
		EMPTY_APPLICATION_LIST_QUERY,
		type ApplicationListQuery,
		type CommitteeChoice
	} from '$lib/applications';
	import { countryFilterOptions } from '$lib/filter-options';
	import { manageApplicationsUrl } from '$lib/urls';

	type Props = {
		/** The filters the rows on screen were built from, so every control shows its own. */
		query: ApplicationListQuery;
		/** Every committee of this conference, for the committee dropdown. */
		committees: CommitteeChoice[];
		/** The conference's slug, for the form's own address and the reset link. */
		conferenceSlug: string;
	};

	let { query, committees, conferenceSlug }: Props = $props();

	// "UNSC · United Nations Security Council" for a committee with a short name
	// and the plain name for one without, worded the way the apply form words the
	// same list. `$derived` builds it again whenever the committees change.
	const committeeOptions: SelectOption[] = $derived(
		committees.map((committee) => ({
			value: committee.id,
			label:
				committee.abbreviation === null
					? committee.name
					: `${committee.abbreviation} · ${committee.name}`
		}))
	);

	// Reset clears the filters but stays on the tab and the view being read,
	// because those are where the organiser is rather than something they
	// filtered by.
	const resetHref = $derived(
		manageApplicationsUrl(conferenceSlug, {
			...EMPTY_APPLICATION_LIST_QUERY,
			status: query.status,
			view: query.view
		})
	);
</script>

<!--
	A real GET form. Submitting it navigates to
	`/manage/<slug>/applications?q=…&committee=…`, so filtering works without
	JavaScript and every filter is in the address, which is what makes the back
	button, a refresh and a shared link all show the same rows.

	It is a sibling of the page's `<form method="post">` and never inside it,
	because HTML does not allow a form inside a form: the browser would throw the
	inner one away and nothing would submit. `page` is not among its fields, so
	any change of filter starts again at the first page.
-->
<form method="get" action={manageApplicationsUrl(conferenceSlug)}>
	<!--
		The open tab is part of the same address, so it travels with the filters
		rather than being reset to "Under review" by every search.
	-->
	<input type="hidden" name="status" value={query.status} />
	<!-- The board travels the same way, and the table is what an empty `view` means. -->
	{#if query.view === 'board'}
		<input type="hidden" name="view" value="board" />
	{/if}

	<FilterBar {resetHref} isTwoColumnsOnPhone>
		<div class="col-span-2">
			<FilterSearch
				name="q"
				value={query.q}
				placeholder="Name or school"
				label="Search applicants"
			/>
		</div>

		<FilterSelect
			label="Committee"
			name="committee"
			value={query.committee}
			options={committeeOptions}
			placeholder="Any committee"
		/>

		<!--
			Every country rather than only the ones an applicant came from. The
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

		<FilterSelect label="Sort" name="sort" value={query.sort} options={APPLICATION_SORT_OPTIONS} />

		<Button label="Apply filters" type="submit" variant="secondary" size="dense" />
	</FilterBar>
</form>
