<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import type { SelectOption } from '$lib/components/SelectField.svelte';
	import FilterSearch from '$lib/components/manage/FilterSearch.svelte';
	import FilterSelect from '$lib/components/manage/FilterSelect.svelte';
	import type { CommitteeChoice } from '$lib/applications';
	import { committeeHeading } from '$lib/committees';
	import {
		INDIVIDUAL_DELEGATES,
		PARTICIPANT_INVOICE_OPTIONS,
		PARTICIPANT_PAPER_OPTIONS,
		PARTICIPANT_SORT_OPTIONS,
		type ParticipantQuery
	} from '$lib/participants';
	import type { ParticipantColumns } from '$lib/participant-access';
	import { manageParticipantsUrl } from '$lib/urls';

	type Props = {
		/** The filters the rows on screen were built from, so every control shows its own. */
		query: ParticipantQuery;
		/** Every committee of this conference, for the committee dropdown. */
		committees: CommitteeChoice[];
		/** How many participants each committee has, by committee id. */
		countByCommittee: Record<string, number>;
		/** The delegations with somebody seated, for the delegation dropdown. */
		delegations: { id: string; name: string }[];
		/** Which columns the reader sees; a hidden column has no filter either. */
		columns: ParticipantColumns;
		conferenceSlug: string;
	};

	let { query, committees, countByCommittee, delegations, columns, conferenceSlug }: Props =
		$props();

	/* `$derived` builds these again whenever the lists change. Each committee
	   says how many participants it has, which is the "by committee" total. */
	const committeeOptions: SelectOption[] = $derived(
		committees.map((committee) => ({
			value: committee.id,
			label: `${committeeHeading(committee)} (${countByCommittee[committee.id] ?? 0})`
		}))
	);
	const delegationOptions: SelectOption[] = $derived([
		{ value: INDIVIDUAL_DELEGATES, label: 'Individual delegates' },
		...delegations.map((delegation) => ({ value: delegation.id, label: delegation.name }))
	]);
	const resetHref = $derived(manageParticipantsUrl(conferenceSlug));
</script>

<!--
	A real GET form. Submitting it navigates to
	`/manage/<slug>/participants?q=…&committee=…`, so filtering works without
	JavaScript and every filter is in the address. `page` is not among its
	fields, so any change of filter starts again at the first page.
-->
<form method="get" action={manageParticipantsUrl(conferenceSlug)}>
	<!--
		The compact filter row of the management pages: no labels drawn above the
		boxes, because each dropdown's first choice says what it filters by. On a
		phone the boxes go two to a row, under a search box as wide as the screen.
	-->
	<FilterBar {resetHref} isTwoColumnsOnPhone>
		<div class="col-span-2">
			<FilterSearch
				name="q"
				value={query.q}
				placeholder="Name, school or seat"
				label="Search participants"
			/>
		</div>
		<FilterSelect
			label="Committee"
			name="committee"
			value={query.committee}
			options={committeeOptions}
			placeholder="Any committee"
		/>
		<FilterSelect
			label="Delegation"
			name="delegation"
			value={query.delegation}
			options={delegationOptions}
			placeholder="Any delegation"
		/>
		{#if columns.invoice}
			<FilterSelect
				label="Invoice"
				name="invoice"
				value={query.invoice}
				options={PARTICIPANT_INVOICE_OPTIONS}
				placeholder="Any invoice"
			/>
		{/if}
		{#if columns.paper}
			<FilterSelect
				label="Paper"
				name="paper"
				value={query.paper}
				options={PARTICIPANT_PAPER_OPTIONS}
				placeholder="Any paper"
			/>
		{/if}
		<FilterSelect label="Sort" name="sort" value={query.sort} options={PARTICIPANT_SORT_OPTIONS} />

		<Button label="Apply filters" type="submit" variant="secondary" size="dense" />
	</FilterBar>
</form>
