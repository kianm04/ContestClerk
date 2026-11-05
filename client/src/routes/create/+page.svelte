<script lang="ts">
	import Users from '@lucide/svelte/icons/users';
	import ConferencePreview from '$lib/components/creation/ConferencePreview.svelte';
	import CreationColumns from '$lib/components/creation/CreationColumns.svelte';
	import CreationFooter from '$lib/components/creation/CreationFooter.svelte';
	import CreationPanel from '$lib/components/creation/CreationPanel.svelte';
	import { editionComparison, organizationStepPreview } from '$lib/creation-start';
	import { continueLabel } from '$lib/creation-steps';
	import { NEW_ORGANIZATION } from '$lib/organizations';
	import { manageUrl } from '$lib/urls';
	import type { PageProps } from './$types';
	import OrganizationChoices from './OrganizationChoices.svelte';
	import PreviousEditionCard from './PreviousEditionCard.svelte';

	// `data` is what `load` in `+page.server.ts` returned. `form` is what the
	// `start` action sent back when it refused, or nothing on an ordinary visit.
	let { data, form }: PageProps = $props();

	/** The form the footer's button and "Use this setup" both send, from outside it. */
	const FORM_ID = 'creation-step-form';

	// `$derived` works these out again whenever a card is chosen (a link, so new `data`).
	const errors = $derived(form?.errors ?? {});
	const comparison = $derived(
		data.previous && data.suggestion ? editionComparison(data.previous, data.suggestion) : null
	);

	/*
		What a new organisation's fields hold. They are bound to the fields
		below, so the preview follows the typing. A `$derived` may be assigned
		to, and starts again from what a refused send came back with.
	*/
	let newOrganizationName = $derived(form?.values?.name ?? '');
	let newOrganizationCity = $derived(form?.values?.city ?? '');
	let newOrganizationCountry = $derived(form?.values?.countryCode ?? '');

	const preview = $derived(
		organizationStepPreview({
			chosen:
				data.chosenOrganization && data.suggestion
					? { organization: data.chosenOrganization, suggestion: data.suggestion }
					: null,
			newOrganization:
				data.choice === NEW_ORGANIZATION
					? {
							name: newOrganizationName,
							city: newOrganizationCity,
							countryCode: newOrganizationCountry
						}
					: null,
			now: new Date(data.now)
		})
	);
</script>

<svelte:head>
	<title>Create a conference · MUNMeet</title>
</svelte:head>

<CreationColumns leftClass="gap-1.5">
	<!--
		The address carries the choice to the action too, so a refused form comes
		back with the same card chosen. SvelteKit finds the action by the query
		parameter that starts with a slash, `/start`.
	-->
	<form
		id={FORM_ID}
		method="POST"
		action="?organization={encodeURIComponent(data.choice)}&/start"
		class="flex flex-col gap-1.5"
	>
		<input type="hidden" name="organization" value={data.choice} />
		<CreationPanel
			title="Who is running this conference?"
			description="Choose your organisation. We'll use this information to pre-fill your conference details."
			icon={Users}
		>
			{#if errors.organization}
				<p class="mt-3 fs-14 lh-20 text-creation-red">{errors.organization}</p>
			{/if}
			<OrganizationChoices
				organizations={data.organizations}
				choice={data.choice}
				{errors}
				bind:newOrganizationName
				bind:newOrganizationCity
				bind:newOrganizationCountry
			/>
		</CreationPanel>
		{#if comparison && data.previous && data.chosenOrganization}
			<PreviousEditionCard
				{comparison}
				organizationName={data.chosenOrganization.name}
				previousSlug={data.previous.slug}
				bannerPath={data.previous.bannerPath}
				formId={FORM_ID}
			/>
		{/if}
	</form>

	{#snippet aside()}
		<ConferencePreview
			{preview}
			variant="organisation"
			note={{
				title: 'This is a draft conference',
				text: "You're setting up a new conference based on your organisation's information. You can edit all details in the next steps."
			}}
		/>
	{/snippet}
</CreationColumns>

<CreationFooter
	status="none"
	savedAt={null}
	now={data.now}
	exitHref={manageUrl()}
	primaryLabel={continueLabel('organization') ?? 'Continue'}
	primaryForm={FORM_ID}
	isPrimaryDisabled={data.choice === ''}
/>
