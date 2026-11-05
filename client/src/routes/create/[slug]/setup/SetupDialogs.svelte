<script lang="ts">
	import { createStepUrl } from '$lib/urls';
	import type { PageProps } from './$types';
	import ApplicationsDialog from './ApplicationsDialog.svelte';
	import CommitteeDialog from './CommitteeDialog.svelte';
	import DeleteDialog from './DeleteDialog.svelte';
	import FeeDialog from './FeeDialog.svelte';
	import QuestionDialog from './QuestionDialog.svelte';

	// The page's own `data` and `form`, handed down whole: each dialog needs a
	// different few pieces of them.
	let { data, form }: Pick<PageProps, 'data' | 'form'> = $props();

	// `$derived` works these out again whenever the address or the answer changes.
	const dialog = $derived(data.dialog);
	const closeHref = $derived(createStepUrl(data.draft.slug, 'setup'));
	// A refused form comes back as `form`; it belongs to the open dialog only
	// when it is the same kind, and then what was typed wins over what is saved.
	const failure = $derived(form && dialog && form.kind === dialog.kind ? form : null);
</script>

<!-- At most one dialog is open: the one `?dialog=` in the address names. -->
{#if dialog?.kind === 'committee'}
	<CommitteeDialog
		values={failure?.kind === 'committee' ? failure.values : dialog.values}
		errors={failure?.kind === 'committee' ? failure.errors : {}}
		slug={data.draft.slug}
		conferenceName={data.draft.name}
		{closeHref}
	/>
{:else if dialog?.kind === 'question'}
	<QuestionDialog
		values={failure?.kind === 'question' ? failure.values : dialog.values}
		errors={failure?.kind === 'question' ? failure.errors : {}}
		conferenceName={data.draft.name}
		{closeHref}
	/>
{:else if dialog?.kind === 'fee'}
	<FeeDialog
		values={failure?.kind === 'fee' ? failure.values : dialog.values}
		errors={failure?.kind === 'fee' ? failure.errors : {}}
		slug={data.draft.slug}
		currency={data.draft.currency}
		previous={data.previous}
		previousFeeSummary={data.previousFeeSummary}
		isStripeConnected={data.isStripeConnected}
		stripeSettingsUrl={data.stripeSettingsUrl}
		{closeHref}
	/>
{:else if dialog?.kind === 'applications'}
	<ApplicationsDialog
		values={failure?.kind === 'applications' ? failure.values : dialog.values}
		errors={failure?.kind === 'applications' ? failure.errors : {}}
		draft={data.draft}
		previous={data.previous}
		questions={data.questions}
		committeeCount={data.committees.length}
		{closeHref}
	/>
{:else if dialog?.kind === 'delete'}
	<DeleteDialog content={dialog.content} {closeHref} />
{/if}
