<script lang="ts">
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import Rocket from '@lucide/svelte/icons/rocket';
	import { enhance } from '$app/forms';
	import Notice from '$lib/components/Notice.svelte';
	import CreationColumns from '$lib/components/creation/CreationColumns.svelte';
	import CreationFooter from '$lib/components/creation/CreationFooter.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { createStepUrl, manageUrl } from '$lib/urls';
	import type { PageProps } from './$types';
	import LaunchAside from './LaunchAside.svelte';
	import LaunchChoice from './LaunchChoice.svelte';
	import LaunchPanel from './LaunchPanel.svelte';
	import ReadinessTable from './ReadinessTable.svelte';
	import WhatApplicantsSee from './WhatApplicantsSee.svelte';

	// `data` is what `load` in `+page.server.ts` (and the layout above it)
	// returned. `form` is what the `publish` action sent back when it refused.
	let { data, form }: PageProps = $props();

	/** The form the footer's "Publish conference" button sends, from outside it. */
	const FORM_ID = 'creation-step-form';

	// Keeps the page in place while the form is on its way, and follows the
	// action's redirect to the management area once it succeeds.
	const publishForm = createInPlaceForm();

	// `$derived` works this out again whenever `data` changes.
	const isBlocked = $derived(data.blockers.length > 0);
	const readinessLine = $derived(
		isBlocked
			? 'A few things are needed before you can publish.'
			: "Here's an overview of your setup. Everything looks good to go."
	);
</script>

<svelte:head>
	<title>Launch {data.draft.name} · MUNMeet</title>
</svelte:head>

<!--
	The design's 915 and 633 pixel columns. The design cuts the left one off at
	the foot of the board, through the second panel's padding; here the panel
	is drawn whole, with its padding and the step's space under it, so on a
	short window the step scrolls a little rather than hiding the applicants'
	facts under the footer.
-->
<CreationColumns
	left={915}
	right={633}
	class="gap-3.5 lg:items-start lg:pr-13.5 lg:pl-14"
	leftClass="gap-4.25"
>
	<LaunchPanel title="Ready to launch" description={readinessLine} icon={Rocket} class="lg:pb-2.75">
		<ReadinessTable rows={data.rows} />
	</LaunchPanel>

	<LaunchPanel
		title="Choose how to launch"
		description="You can always change this later."
		icon={Megaphone}
		descriptionClass="fs-14"
	>
		<!-- `use:enhance` sends the form in place with JavaScript; without, the browser posts it. -->
		<form id={FORM_ID} method="POST" action="?/publish" use:enhance={publishForm.submit}>
			<LaunchChoice choices={data.choices} />
			<WhatApplicantsSee facts={data.applicantsSee} />
			{#if form?.publishError}
				<div class="mt-2"><Notice tone="error">{form.publishError}</Notice></div>
			{/if}
		</form>
	</LaunchPanel>

	{#snippet aside()}
		<LaunchAside
			preview={data.preview}
			applicationsNote={data.applicationsNote}
			publicUrl={data.publicUrl}
			improvements={data.improvements}
		/>
	{/snippet}
</CreationColumns>

<!-- Every earlier step saves as it is typed, so leaving is a plain link. -->
<CreationFooter
	status="saved"
	savedAt={data.draft.updatedAt}
	now={data.now}
	timezone={data.draft.timezone}
	exitHref={manageUrl()}
	exitLabel="Save draft and exit"
	exitStyle="link"
	backHref={createStepUrl(data.draft.slug, 'setup')}
	primaryLabel="Publish conference"
	primaryForm={FORM_ID}
	isPrimaryBusy={publishForm.isBusy}
	isPrimaryDisabled={isBlocked}
	density="dense"
/>
