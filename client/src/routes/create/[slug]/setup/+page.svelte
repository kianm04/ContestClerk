<script lang="ts">
	import { enhance } from '$app/forms';
	import CreationColumns from '$lib/components/creation/CreationColumns.svelte';
	import CreationFooter from '$lib/components/creation/CreationFooter.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { createStepUrl } from '$lib/urls';
	import type { PageProps } from './$types';
	import ApplicationsCard from './ApplicationsCard.svelte';
	import AtAGlance from './AtAGlance.svelte';
	import CommitteesCard from './CommitteesCard.svelte';
	import FeesCard from './FeesCard.svelte';
	import PublicPageCard from './PublicPageCard.svelte';
	import SetupDialogs from './SetupDialogs.svelte';

	// `data` is what `load` in `+page.server.ts` (and the layout above it)
	// returned. `form` is what a dialog's action sent back when it refused.
	let { data, form }: PageProps = $props();

	/** The form the footer's "Continue to launch" button sends, from outside it. */
	const CONTINUE_FORM_ID = 'setup-continue-form';

	// Keeps the page in place while the form is on its way, then follows the
	// action's redirect to the Launch step.
	const continueForm = createInPlaceForm();

	// `$derived` works this out again whenever `data` changes.
	const slug = $derived(data.draft.slug);
</script>

<svelte:head>
	<title>Set up {data.draft.name} · MUNMeet</title>
</svelte:head>

<!--
	The design's columns: 1066 and 494 pixels, 53 and 49 in from the sides.
	Both run the height of the taller one, so the right-hand panel can end
	where the left column ends. Columns and panels sit 14 apart, a little
	roomier than the board, which the owner found crowded.
-->
<CreationColumns
	left={1066}
	right={494}
	class="gap-3.5 lg:pr-12.25 lg:pl-13.25"
	leftClass="gap-3.5"
>
	<PublicPageCard
		{slug}
		draft={data.draft}
		status={data.statuses.publicPage}
		facts={data.publicPageFacts}
	/>
	<CommitteesCard
		{slug}
		committees={data.committees}
		previous={data.previous}
		showAll={data.showAllCommittees}
		allCommitteesUrl={data.allCommitteesUrl}
		canManageCommittees={data.canManageCommittees}
		canOpenCommitteesPage={data.canOpenCommitteesPage}
	/>
	<ApplicationsCard
		{slug}
		summary={data.applications}
		questions={data.questions}
		status={data.statuses.applications}
		deadlineNote={data.deadlineNote}
	/>
	<FeesCard
		{slug}
		fees={data.fees}
		currency={data.draft.currency}
		feeStatus={data.draft.feeStatus}
		status={data.statuses.fees}
		previousFeeSummary={data.previousFeeSummary}
	/>

	{#snippet aside()}
		<AtAGlance preview={data.preview} statuses={data.statuses} />
	{/snippet}
</CreationColumns>

<!--
	The footer's primary button sits outside this form and names it with
	`form=`, so the form itself has nothing in it. `use:enhance` sends it
	without reloading the page when JavaScript is on.
-->
<form
	id={CONTINUE_FORM_ID}
	method="POST"
	action="?/continue"
	use:enhance={continueForm.submit}
></form>

<CreationFooter
	status="saved"
	savedAt={data.draft.updatedAt}
	now={data.now}
	timezone={data.draft.timezone}
	backHref={createStepUrl(slug, 'when')}
	primaryLabel="Continue to launch"
	primaryForm={CONTINUE_FORM_ID}
	isPrimaryBusy={continueForm.isBusy}
	density="dense"
/>

<SetupDialogs {data} {form} />
