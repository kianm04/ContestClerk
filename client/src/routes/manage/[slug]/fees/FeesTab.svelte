<script lang="ts">
	import FormSection from '$lib/components/manage/FormSection.svelte';
	import {
		canAddFees,
		type CollectionModeErrors,
		type CollectionModeValues,
		type FeeFormErrors,
		type FeeFormValues,
		type ManagedFee
	} from '$lib/fees';
	import type { InPlaceForm } from '$lib/in-place-form.svelte';
	import type { ManagedOrganization } from '$lib/organizations';
	import CollectionModeForm from './CollectionModeForm.svelte';
	import FeeForm from './FeeForm.svelte';
	import FeeList from './FeeList.svelte';

	type Props = {
		/** Every fee of this conference, in the order the organiser put them. */
		fees: ManagedFee[];
		/** A three-letter ISO 4217 code, such as `EUR`. */
		currency: string;
		/** Whether collecting the money outside MUNMeet is what is saved. */
		collectsPaymentsManually: boolean;
		/** What the two forms show: what is saved, or what was typed into a refused form. */
		modeValues: CollectionModeValues;
		modeErrors: CollectionModeErrors;
		feeValues: FeeFormValues;
		feeErrors: FeeFormErrors;
		/** The organisation running the conference, for the line about Stripe. */
		organization: ManagedOrganization;
		conferenceSlug: string;
		/** The conference's timezone, which the fees' windows are read in. */
		timezone: string;
		/** The moment `load` read, so every row agrees on which fee is being charged. */
		now: Date;
		/** True while the conference is a draft and this page is a setup step. */
		isDraft: boolean;
		/** The payment form's `id` and its sender, shared with the setup footer. */
		collectionFormId: string;
		collectionForm: InPlaceForm;
		/** May the reader change the fees? Without `edit_conference` the list is read-only. */
		canEdit: boolean;
	};

	let {
		fees,
		currency,
		collectsPaymentsManually,
		modeValues,
		modeErrors,
		feeValues,
		feeErrors,
		organization,
		conferenceSlug,
		timezone,
		now,
		isDraft,
		collectionFormId,
		collectionForm,
		canEdit
	}: Props = $props();

	/*
		The fee form is an editor whenever it carries a fee's id: `load` puts one
		there for `?editFee=`, and a refused save hands the same id straight back.
		Reading it from the form rather than from the address is what keeps the
		editor open after a refusal, because posting to `?/updateFee` replaces the
		`?editFee=` in the address. `$derived` works both out again on new data.
	*/
	const isEditing = $derived(feeValues.feeId !== '');
	const canAdd = $derived(
		canAddFees({
			isStripeConnected: organization.isStripeConnected,
			collectsPaymentsManually
		})
	);
</script>

<!-- `FormSection` draws a line above every section but the first in this box. -->
<!-- A reader without `edit_conference` sees the fee list and none of the forms. -->
<div>
	{#if canEdit}
		<FormSection title="How delegates pay">
			<CollectionModeForm
				id={collectionFormId}
				values={modeValues}
				errors={modeErrors}
				isStripeConnected={organization.isStripeConnected}
				organizationName={organization.name}
				organizationSlug={organization.slug}
				{isDraft}
				inPlaceForm={collectionForm}
			/>
		</FormSection>
	{/if}

	<FormSection
		title="What you charge"
		description="A delegate is invoiced when they are given a seat."
	>
		<div>
			<FeeList {fees} {currency} {timezone} {now} {conferenceSlug} {canEdit} />
		</div>
		{#if canEdit}
			<FeeForm
				values={feeValues}
				errors={feeErrors}
				{timezone}
				{currency}
				{canAdd}
				{isEditing}
				{conferenceSlug}
			/>
		{/if}
	</FormSection>
</div>
