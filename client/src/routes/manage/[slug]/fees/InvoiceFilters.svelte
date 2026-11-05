<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import FilterSearch from '$lib/components/manage/FilterSearch.svelte';
	import FilterSelect from '$lib/components/manage/FilterSelect.svelte';
	import {
		EMPTY_INVOICE_LIST_QUERY,
		invoiceStatusOptions,
		type InvoiceListQuery
	} from '$lib/invoices';
	import { manageFeesTableUrl } from '$lib/urls';

	type Props = {
		/** The filters the rows on screen were built from, so every control shows its own. */
		query: InvoiceListQuery;
		/** The conference's slug, for the form's own address and the reset link. */
		conferenceSlug: string;
	};

	let { query, conferenceSlug }: Props = $props();

	// The statuses never change while the page is open, so they are worked out
	// once. The first, "Any status", is left out because `FilterSelect` draws
	// its own empty choice from `placeholder`.
	const statusOptions = invoiceStatusOptions().slice(1);

	// Both the form and the reset link come back to the table rather than the top
	// of the page. `$derived` rebuilds them if the slug changes.
	const tableUrl = $derived(manageFeesTableUrl(conferenceSlug, EMPTY_INVOICE_LIST_QUERY));
</script>

<!--
	A real GET form. Submitting it navigates to `/manage/<slug>/fees?q=…&status=…`,
	which opens the "Invoices" tab (`$lib/fees-tabs.ts`), so filtering works
	without JavaScript and the filters are in the address,
	which is what makes the back button, a refresh and a shared link all show the
	same rows. A GET form replaces the query of its address and keeps the
	`#invoices` on the end, so the browser still scrolls down to the table.

	`page` and `invoice` are not among its fields, so a new filter starts again at
	the first page with nothing highlighted.
-->
<form method="get" action={tableUrl} class="flex flex-col gap-3">
	<FilterBar resetHref={tableUrl}>
		<FilterSearch
			name="q"
			value={query.q}
			placeholder="Payer, delegation or number"
			label="Search invoices"
		/>

		<FilterSelect
			label="Status"
			name="status"
			value={query.status}
			options={statusOptions}
			placeholder="Any status"
		/>

		<Button label="Apply filters" type="submit" variant="secondary" size="dense" />
	</FilterBar>
</form>
