<script lang="ts">
	import Download from '@lucide/svelte/icons/download';
	import Button from '$lib/components/Button.svelte';
	import ManageHeader from '$lib/components/manage/ManageHeader.svelte';
	import ManageTabs from '$lib/components/manage/ManageTabs.svelte';
	import StepFooter from '$lib/components/manage/StepFooter.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { feesPageTabs, shownFeesTab } from '$lib/fees-tabs';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { findSetupStep, setupStepEyebrow, setupSteps } from '$lib/setup-steps';
	import { manageFeesExportUrl } from '$lib/urls';
	import FeesTab from './FeesTab.svelte';
	import InvoicesTab from './InvoicesTab.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned together with what the
	// layout above it loaded, which is where the conference and the organisation
	// come from. `load` runs again after every action, so the lists are never
	// stale. `form` is what the last action returned: the ones that work redirect
	// instead, so `form` is always a refusal.
	let { data, form }: PageProps = $props();

	/** The `id` of the payment form, which the footer's "Save and continue" sends. */
	const COLLECTION_FORM_ID = 'payment-collection';

	// `$derived` works each of these out again whenever `data` or `form` changes.
	// A refused post sends back everything that was typed, so nothing is lost;
	// otherwise the forms show what is saved.
	const modeValues = $derived(
		form?.modeValues ?? {
			mode: data.payment.collectsPaymentsManually ? 'manual' : 'stripe',
			paymentInstructions: data.payment.paymentInstructions ?? ''
		}
	);
	const modeErrors = $derived(form?.modeErrors ?? {});
	const feeValues = $derived(form?.feeValues ?? data.feeForm);
	const feeErrors = $derived(form?.feeErrors ?? {});

	// The tab on screen: the address's, unless a refusal belongs to the other one.
	const tab = $derived(shownFeesTab(data.tab, form));
	const tabs = $derived(feesPageTabs(data.conference.slug, tab, data.invoiceCount));

	// The six setup steps while the conference is a draft, and null once it is
	// published, when this page has no eyebrow and no footer.
	const steps = $derived(
		data.setupProgress === null ? null : setupSteps(data.conference.slug, data.setupProgress)
	);
	const eyebrow = $derived(
		steps === null ? undefined : setupStepEyebrow(findSetupStep(steps, 'fees'))
	);
	const summary = $derived(
		steps === null
			? undefined
			: 'Leave this out if the conference is free. Fees can be added after publishing too.'
	);

	// The moment `load` read, so every row agrees on which fee is being charged.
	const now = $derived(new Date(data.now));

	// Sends the payment form in the background (`$lib/in-place-form.svelte.ts`).
	// It is made here because both the form's own "Save" and the footer's
	// "Save and continue" send it, and both show its spinner.
	const collectionForm = createInPlaceForm();
</script>

<svelte:head>
	<!-- A private page has nothing to share, so it writes its own title rather
		than using `PageMeta`, which asks for a description for the link card. -->
	<title>Fees · {data.conference.name} · MUNMeet</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<!--
		The export is a plain link to an endpoint that answers with a file, so the
		browser downloads it instead of leaving the page. It carries the table's
		search and status filter, so the CSV holds the invoices on screen.
	-->
	<ManageHeader title="Fees" {eyebrow} {summary}>
		{#if tab === 'invoices' && steps === null && data.access.canManageInvoices}
			<Button
				label="Export CSV"
				variant="secondary"
				size="dense"
				icon={Download}
				href={manageFeesExportUrl(data.conference.slug, data.invoiceQuery)}
			/>
		{/if}
	</ManageHeader>

	<!-- A reader who may not see invoices has only the fee list, so no tabs. -->
	{#if data.access.canReadInvoices}
		<ManageTabs {tabs} label="Fees and invoices" />
	{/if}

	{#if form?.message}
		<Notice tone="error">{form.message}</Notice>
	{/if}

	{#if tab === 'fees'}
		<FeesTab
			fees={data.fees}
			currency={data.payment.currency}
			collectsPaymentsManually={data.payment.collectsPaymentsManually}
			{modeValues}
			{modeErrors}
			{feeValues}
			{feeErrors}
			organization={data.organization}
			conferenceSlug={data.conference.slug}
			timezone={data.conference.timezone}
			{now}
			isDraft={steps !== null}
			collectionFormId={COLLECTION_FORM_ID}
			{collectionForm}
			canEdit={data.access.canEditFees}
		/>
	{:else}
		<InvoicesTab
			table={data.invoiceTable}
			totals={data.invoiceTotals}
			currency={data.invoiceCurrency}
			query={data.invoiceQuery}
			hasInvoices={data.hasInvoices}
			message={form?.invoiceMessage ?? null}
			timezone={data.conference.timezone}
			conferenceSlug={data.conference.slug}
			canManage={data.access.canManageInvoices}
		/>
	{/if}

	<!-- Only while the conference is a draft. On the "Invoices" tab there is no form to send. -->
	{#if steps}
		<StepFooter
			{steps}
			current="fees"
			formId={tab === 'fees' && data.access.canEditFees ? COLLECTION_FORM_ID : undefined}
			isLoading={collectionForm.isBusy}
		/>
	{/if}
</div>
