<script lang="ts">
	import {
		APPLICATION_DECISIONS,
		APPLICATION_ROWS,
		APPLICATION_TABS,
		APPLICATIONS_TABLE_COLUMNS
	} from '$lib/organiser-seats';
	import ApplicationsPictureRow from './ApplicationsPictureRow.svelte';
	import ApplicationsPictureTickBox from './ApplicationsPictureTickBox.svelte';
</script>

<!--
	A drawing of an organiser's applications table, for section 6.5 of
	`docs/for-organisers-handoff.md`: the tabs by decision, five applications
	under review with two ticked, and the bar that decides the ticked ones
	together. It is hidden from screen readers (`aria-hidden`), which hear the
	sentence beside it instead, and nothing in it can be pressed: the buttons
	are drawn as `<span>`s.

	`{#each … (key)}` repeats its block for every item; the key in brackets
	tells Svelte which drawn row belongs to which item. The rows hand each
	other's neighbour in (`APPLICATION_ROWS[index - 1]`) so a row can draw the
	right rule above itself.
-->
<p class="sr-only">
	An example of an organiser's applications table: five applications under review, two of them
	ticked, with Accept, Waitlist and Reject for the ticked ones together.
</p>
<div
	aria-hidden="true"
	class="overflow-hidden rounded-xl bg-surface text-small text-ink-900 shadow-card"
>
	<div class="flex items-baseline justify-between gap-4 px-5 pt-3.5 pb-2.5">
		<span class="font-medium">Applications</span>
		<span class="text-caption text-ink-600 tabular-nums">142 received</span>
	</div>

	<div class="flex gap-6 overflow-hidden border-b border-neutral-100 px-5 whitespace-nowrap">
		{#each APPLICATION_TABS as tab (tab.label)}
			<span
				class={[
					'flex gap-1.5 pt-2 pb-[0.5625rem]',
					tab.isSelected
						? '-mb-px border-b-2 border-brand-500 font-medium text-brand-900'
						: 'text-ink-600'
				]}
			>
				{tab.label}
				<span class="font-normal text-ink-600 tabular-nums">{tab.count}</span>
			</span>
		{/each}
	</div>

	<div
		class="grid min-h-8 items-center gap-x-3 bg-brand-50 pr-5 text-caption font-medium text-ink-600 {APPLICATIONS_TABLE_COLUMNS}"
	>
		<ApplicationsPictureTickBox isTicked={false} />
		<span>Applicant</span>
		<span class="hidden md:block">Institution</span>
		<span class="hidden md:block">First preference</span>
		<span>Status</span>
	</div>

	{#each APPLICATION_ROWS as application, index (application.name)}
		<ApplicationsPictureRow {application} previous={APPLICATION_ROWS[index - 1]} />
	{/each}

	<div class="flex flex-wrap items-center gap-1.5 border-t border-neutral-100 px-5 py-2.5">
		<span class="mr-1.5 font-medium tabular-nums">2 selected</span>
		{#each APPLICATION_DECISIONS as decision (decision)}
			<span class="rounded-lg border border-line px-2 py-[0.3125rem] font-medium md:px-3">
				{decision}
			</span>
		{/each}
	</div>
</div>
