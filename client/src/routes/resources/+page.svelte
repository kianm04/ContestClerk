<script lang="ts">
	import Inbox from '@lucide/svelte/icons/inbox';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PageMeta from '$lib/components/shell/PageMeta.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import { myResourcesUrl } from '$lib/urls';
	import ResourceGroup from './ResourceGroup.svelte';
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned. It is read afresh
	// every time the page is opened, including every time the conference filter
	// below navigates to a new `?conference=`.
	let { data }: PageProps = $props();

	/**
	 * Submits the filter form as soon as another conference is chosen, the way
	 * `ConferenceFilters.svelte` does for its own dropdowns: a `change` event on
	 * the `<select>` bubbles up to the form around it. The "Filter" button below
	 * is what makes the same form work with JavaScript turned off.
	 */
	function handleFilterChange(event: Event & { currentTarget: HTMLFormElement }) {
		event.currentTarget.requestSubmit();
	}
</script>

<PageMeta title="Resources" description="Every file shared with you across your conferences." />

<!-- The whole page shares the 880px column the layout section of `resources.md` gives its groups. -->
<div class="mx-auto max-w-220">
	<div class="mb-6">
		<PageHeader
			title="Resources"
			subtitle="Rules of procedure, background guides and other files your organisers share."
		/>
	</div>

	{#if data.conferenceOptions.length > 1}
		<!--
			A real GET form. Submitting it navigates to `/resources?conference=<slug>`,
			so the filter keeps working before, and without, JavaScript; the `change`
			handler above only saves a click once JavaScript has loaded.
			`data-sveltekit-keepfocus`/`-replacestate` keep the focus where it is and
			reuse the current history entry, the way `ConferenceFilters.svelte` does.
		-->
		<form
			method="get"
			action={myResourcesUrl()}
			onchange={handleFilterChange}
			data-sveltekit-keepfocus
			data-sveltekit-replacestate
			class="mb-6 flex flex-wrap items-end gap-3"
		>
			<SelectField
				label="Conference"
				name="conference"
				value={data.conferenceFilter}
				options={data.conferenceOptions}
			/>

			<Button label="Filter" type="submit" variant="secondary" />
		</form>
	{/if}

	{#if data.groups.length === 0}
		<EmptyState
			icon={Inbox}
			title={data.conferenceFilter ? 'No resources for this conference yet.' : 'No resources yet.'}
			description={data.conferenceFilter
				? 'Try a different conference.'
				: 'Files your organisers share appear here.'}
			actionLabel={data.conferenceFilter ? 'View all conferences' : undefined}
			actionHref={data.conferenceFilter ? myResourcesUrl() : undefined}
		/>
	{:else}
		<div class="flex flex-col gap-6">
			<!-- `(group.conferenceId)` lets Svelte reuse each group instead of rebuilding it. -->
			{#each data.groups as group (group.conferenceId)}
				<ResourceGroup {group} />
			{/each}
		</div>
	{/if}
</div>
