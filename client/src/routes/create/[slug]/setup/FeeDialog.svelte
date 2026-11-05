<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { enhance } from '$app/forms';
	import type { PreviousConference } from '$lib/creation-draft';
	import { dialogAction, type FeeDialogValues } from '$lib/creation-setup-dialog';
	import { FEE_KIND_OPTIONS, type FeeKind } from '$lib/creation-setup-forms';
	import type { FeeFormErrors } from '$lib/fees';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { createSetupDialogUrl } from '$lib/urls';
	import DialogFrame from './DialogFrame.svelte';
	import FeeActions from './FeeActions.svelte';
	import FeeCollectionChoice from './FeeCollectionChoice.svelte';
	import FeeEditFields from './FeeEditFields.svelte';
	import FeeFields from './FeeFields.svelte';
	import FeeLastYearRow from './FeeLastYearRow.svelte';
	import FeeTypeChoice from './FeeTypeChoice.svelte';

	type Props = {
		values: FeeDialogValues;
		errors: FeeFormErrors & { description?: string };
		slug: string;
		currency: string;
		previous: PreviousConference | null;
		previousFeeSummary: string | null;
		isStripeConnected: boolean;
		stripeSettingsUrl: ResolvedPathname;
		closeHref: ResolvedPathname;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let {
		values,
		errors,
		slug,
		currency,
		previous,
		previousFeeSummary,
		isStripeConnected,
		stripeSettingsUrl,
		closeHref
	}: Props = $props();

	// Writable `$derived`: the kind sets who pays and a name to start from.
	let name = $derived(values.name);
	let appliesTo = $derived(values.appliesTo);

	const FORM_ID = 'fee-form';
	const isNew = $derived(values.feeId === '');
	const saveForm = createInPlaceForm();

	/** A new kind brings its name, unless the organiser has written one of their own. */
	function handleKindChange(kind: FeeKind) {
		const option = FEE_KIND_OPTIONS.find((candidate) => candidate.value === kind);
		if (option === undefined) return;
		appliesTo = option.appliesTo;
		const isDefaultName =
			name === '' || FEE_KIND_OPTIONS.some((other) => other.defaultName === name);
		if (isDefaultName) name = option.defaultName;
	}
</script>

<!--
	Two boards share this dialog. Create fee (771 pixels) asks for the kind,
	the fields with their help beside the labels, and how it is collected.
	Edit fee (655 pixels) asks only for what changes, larger, with the help
	under each field.
-->
{#if isNew}
	<DialogFrame
		title="Create fee"
		description="Add a fee for this conference. You can always edit it later."
		width={771}
		class="px-8 pt-5.5 pb-3.75 max-lg:px-4"
		titleClass="fs-30 lh-36"
		descriptionClass="mt-0 fs-15 lh-22"
		closeClass="top-6 right-7.5 size-7.5 text-creation-ink-800 [&_svg]:size-5.5 max-lg:right-3"
		{closeHref}
	>
		<!--
			The import row below is a form of its own, and a form cannot sit inside
			another, so the save button joins this one by its `form` attribute.
		-->
		<form
			id={FORM_ID}
			method="POST"
			action={dialogAction('addFee', 'fee', values.feeId)}
			use:enhance={saveForm.submit}
			class="mt-2.5 border-t border-creation-rule"
		>
			<input type="hidden" name="feeId" value={values.feeId} />
			<FeeTypeChoice kind={values.kind} onchange={handleKindChange} />
			<FeeFields {values} {errors} {currency} bind:name bind:appliesTo />
			<FeeCollectionChoice collection={values.collection} />
		</form>
		{#if previous !== null && previousFeeSummary !== null}
			<FeeLastYearRow summary={previousFeeSummary} previousName={previous.name} />
		{/if}
		<FeeActions form={FORM_ID} isBusy={saveForm.isBusy} {closeHref} />
	</DialogFrame>
{:else}
	<DialogFrame
		title="Edit fee"
		description="Update the details for this fee. Changes will be shown on the public page."
		width={655}
		class="pt-4.5 pr-6.25 pb-5.5 pl-7 max-lg:px-4"
		titleClass="fs-32 lh-40"
		descriptionClass="mt-0 fs-17 lh-24"
		closeClass="top-5.5 right-5.5 size-7.5 text-creation-ink-800 [&_svg]:size-5.5"
		{closeHref}
	>
		<form
			id={FORM_ID}
			method="POST"
			action={dialogAction('updateFee', 'fee', values.feeId)}
			use:enhance={saveForm.submit}
		>
			<input type="hidden" name="feeId" value={values.feeId} />
			<FeeEditFields {values} {errors} {currency} {isStripeConnected} {stripeSettingsUrl} />
		</form>
		<hr class="mt-4.25 border-creation-rule" />
		<FeeActions
			form={FORM_ID}
			isBusy={saveForm.isBusy}
			{closeHref}
			deleteHref={createSetupDialogUrl(slug, 'delete-fee', values.feeId)}
		/>
	</DialogFrame>
{/if}
