<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import Badge from '$lib/components/Badge.svelte';
	import BulkActionBar from '$lib/components/BulkActionBar.svelte';
	import Button from '$lib/components/Button.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import SearchInput from '$lib/components/SearchInput.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import {
		SAMPLE_COMMITTEE_OPTIONS,
		SAMPLE_SORT_ASCENDING,
		SAMPLE_SORT_DESCENDING,
		SAMPLE_TABLE_COLUMNS,
		SAMPLE_TABLE_ROWS,
		samplePageHref,
		sampleSortHref
	} from '$lib/styleguide-samples';
	import { statusBadgeTone, statusLabel } from '$lib/status';
	import { styleguideUrl } from '$lib/urls';
	import Example from './Example.svelte';
	import Group from './Group.svelte';

	// `DataTable` asks for the address of each sort link rather than for a click
	// handler, so sorting works with no JavaScript. Each table below knows which
	// way it is sorted now, which is what decides where its headers point.
	function ascendingSortHref(key: string): ResolvedPathname {
		return sampleSortHref(SAMPLE_SORT_ASCENDING, key);
	}

	function descendingSortHref(key: string): ResolvedPathname {
		return sampleSortHref(SAMPLE_SORT_DESCENDING, key);
	}
</script>

<Group id="data" title="Data">
	<Example name="DataTable" props="columns, sort by name ascending, hrefForSort">
		<DataTable
			columns={SAMPLE_TABLE_COLUMNS}
			sort={SAMPLE_SORT_ASCENDING}
			hrefForSort={ascendingSortHref}
		>
			<!--
				The page renders its own rows as children, so the table itself stays
				dumb. The `(row.id)` key lets Svelte reuse them instead of rebuilding.
			-->
			{#each SAMPLE_TABLE_ROWS as row (row.id)}
				<tr class="border-b border-line">
					<td class="px-3 py-2">{row.name}</td>
					<td class="px-3 py-2">{row.committee}</td>
					<td class="px-3 py-2">{row.country}</td>
					<td class="px-3 py-2">
						<Badge
							tone={statusBadgeTone('application_status', row.status)}
							label={statusLabel('application_status', row.status)}
						/>
					</td>
				</tr>
			{/each}
		</DataTable>
	</Example>

	<Example name="DataTable" props="sort by status descending · the arrow turns round">
		<DataTable
			columns={SAMPLE_TABLE_COLUMNS}
			sort={SAMPLE_SORT_DESCENDING}
			hrefForSort={descendingSortHref}
		>
			{#each SAMPLE_TABLE_ROWS as row (row.id)}
				<tr class="border-b border-line">
					<td class="px-3 py-2">{row.name}</td>
					<td class="px-3 py-2">{row.committee}</td>
					<td class="px-3 py-2">{row.country}</td>
					<td class="px-3 py-2">
						<Badge
							tone={statusBadgeTone('application_status', row.status)}
							label={statusLabel('application_status', row.status)}
						/>
					</td>
				</tr>
			{/each}
		</DataTable>
	</Example>

	<Example name="Pagination" props="page 1 of 9 · no Previous link on the first page">
		<Pagination page={1} pageCount={9} hrefForPage={samplePageHref} />
	</Example>

	<Example name="Pagination" props="page 5 of 9 · both links">
		<Pagination page={5} pageCount={9} hrefForPage={samplePageHref} />
	</Example>

	<Example
		name="Pagination"
		props="page 9 of 9 · no Next link, and nothing at all when pageCount is 1"
	>
		<Pagination page={9} pageCount={9} hrefForPage={samplePageHref} />
		<Pagination page={1} pageCount={1} hrefForPage={samplePageHref} />
	</Example>

	<Example name="FilterBar" props="children, resetHref">
		<FilterBar resetHref={styleguideUrl()}>
			<SearchInput name="q" value="" placeholder="Search applicants" />
			<SelectField
				label="Committee"
				name="filterCommittee"
				value=""
				options={SAMPLE_COMMITTEE_OPTIONS}
				placeholder="Any committee"
			/>
		</FilterBar>
	</Example>

	<Example name="BulkActionBar" props="selectedCount 0 · the actions stay, the count reads plainly">
		<BulkActionBar selectedCount={0}>
			<Button label="Accept" variant="primary" size="sm" type="button" />
		</BulkActionBar>
		<p class="text-small text-ink-600">
			The bar is drawn with nothing ticked, and only sticks to the foot of the screen once something
			is. Without JavaScript nothing can appear in answer to a tick, so a bar that waited for one
			would put every bulk action out of reach.
		</p>
	</Example>

	<Example name="BulkActionBar" props="selectedCount 3, children (the actions)">
		<BulkActionBar selectedCount={3}>
			<Button label="Accept" variant="primary" size="sm" type="button" />
			<Button label="Waitlist" variant="secondary" size="sm" type="button" />
			<Button label="Reject" variant="danger" size="sm" type="button" />
		</BulkActionBar>
	</Example>
</Group>
