<script lang="ts">
	import type { CreationOrganization } from '$lib/creation-draft';
	import type { CreationStartErrors } from '$lib/creation-start';
	import { NEW_ORGANIZATION } from '$lib/organizations';
	import { createWithOrganizationUrl } from '$lib/urls';
	import NewOrganizationCard from './NewOrganizationCard.svelte';
	import NewOrganizationFields from './NewOrganizationFields.svelte';
	import OrganizationCard from './OrganizationCard.svelte';

	type Props = {
		/** The organisations this account runs, one card each. */
		organizations: CreationOrganization[];
		/** The chosen card: an organisation's id, `NEW_ORGANIZATION`, or `''` for none yet. */
		choice: string;
		errors: CreationStartErrors;
		/** A new organisation's fields, bound so the page's preview follows them. */
		newOrganizationName: string;
		newOrganizationCity: string;
		newOrganizationCountry: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	// `$bindable()` lets the page write `bind:newOrganizationName` and so on.
	let {
		organizations,
		choice,
		errors,
		newOrganizationName = $bindable(),
		newOrganizationCity = $bindable(),
		newOrganizationCountry = $bindable()
	}: Props = $props();

	// `$derived` works this out again whenever the list changes.
	const hasOrganizations = $derived(organizations.length > 0);
</script>

<!--
	The cards to choose from, four to a row 14 pixels apart as the design draws
	them, then a new organisation's fields when that card is chosen. An account
	with no organisation yet has the "New organisation" card alone, so its
	fields sit beside it in the other three columns instead of a row with one
	card and three holes. On a phone the cards stack.
-->
<div
	role="group"
	aria-label="Organisation"
	class={[
		'mt-4.5 grid gap-3.5',
		hasOrganizations
			? 'sm:grid-cols-2 lg:grid-cols-4'
			: 'lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]'
	]}
>
	<!-- The `(organization.id)` key lets Svelte reuse each card when the choice changes. -->
	{#each organizations as organization (organization.id)}
		<OrganizationCard
			{organization}
			href={createWithOrganizationUrl(organization.id)}
			isChosen={choice === organization.id}
		/>
	{/each}
	<NewOrganizationCard
		href={createWithOrganizationUrl(NEW_ORGANIZATION)}
		isChosen={choice === NEW_ORGANIZATION}
	/>
	{#if !hasOrganizations && choice === NEW_ORGANIZATION}
		<NewOrganizationFields
			{errors}
			isBesideCard
			bind:name={newOrganizationName}
			bind:city={newOrganizationCity}
			bind:countryCode={newOrganizationCountry}
		/>
	{/if}
</div>
{#if hasOrganizations && choice === NEW_ORGANIZATION}
	<div class="mt-3.5">
		<NewOrganizationFields
			{errors}
			bind:name={newOrganizationName}
			bind:city={newOrganizationCity}
			bind:countryCode={newOrganizationCountry}
		/>
	</div>
{/if}
