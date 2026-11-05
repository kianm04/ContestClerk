<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import FormActions from '$lib/components/FormActions.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { type FeeFormErrors, type FeeFormValues } from '$lib/fees';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { manageFeesTabUrl } from '$lib/urls';
	import FeeFormFields from './FeeFormFields.svelte';
	import FeeWindowFields from './FeeWindowFields.svelte';

	type Props = {
		/** What the fields show: an empty form, the fee being edited, or what was typed. */
		values: FeeFormValues;
		/** One message per field that has something wrong with it. */
		errors: FeeFormErrors;
		/** The conference's timezone, which the two windows are read in. */
		timezone: string;
		/** Whether fees may be added at all yet: Stripe connected, or manual collection chosen. */
		canAdd: boolean;
		/** True when the form is saving an existing fee rather than adding one. */
		isEditing: boolean;
		conferenceSlug: string;
		/** A three-letter ISO 4217 code, such as `EUR`, named beside the amount. */
		currency: string;
	};

	let { values, errors, timezone, canAdd, isEditing, conferenceSlug, currency }: Props = $props();

	/*
		Most fees are charged all the way through, so a new fee's two dates wait
		behind "Only charge it between two dates". The box starts open when they
		already hold something, such as a refused form coming back with its dates.
	*/
	const hasWindow = $derived(
		values.validFrom !== '' || values.validUntil !== '' || errors.validUntil !== undefined
	);

	/*
		Sends the form in the background and redraws the page without reloading
		it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
		form over; without JavaScript it posts and reloads the page as before.
		Both `addFee` and `updateFee` redirect back to the fees tab with no
		`?editFee=`, which already drops this form back to its empty "Add a fee"
		state once `load` runs again, so resetting the fields to match that is
		correct after either button.
	*/
	const inPlaceForm = createInPlaceForm({ isResetAfterSave: true });
</script>

{#if !canAdd && !isEditing}
	<Notice tone="warning">
		Choose how you collect payments above before adding fees. Fees need either a connected Stripe
		account or payment instructions of your own.
	</Notice>
{:else}
	<!--
		An ordinary HTML form, so adding and editing a fee both work with
		JavaScript switched off. Which action it posts to travels on the button
		(`formaction`), an ordinary HTML attribute, the way the rows' arrows do.
	-->
	<form method="post" class="flex flex-col gap-4" use:enhance={inPlaceForm.submit}>
		{#if isEditing}
			<h3 class="font-medium">Edit this fee</h3>
			<input type="hidden" name="feeId" value={values.feeId} />
			<Notice tone="info">
				Changing the amount leaves the invoices already sent alone. They keep the amount they were
				written for.
			</Notice>
		{/if}

		<!-- One row from `lg` up: the name, the amount, who pays it and, when adding, the button. -->
		<div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_8rem_12rem_auto] lg:items-end">
			<FeeFormFields {values} {errors} {currency} {isEditing} />
			{#if !isEditing}
				<Button
					label="Add fee"
					variant="secondary"
					size="dense"
					formaction="?/addFee"
					isLoading={inPlaceForm.isBusy}
				/>
			{/if}
		</div>

		{#if isEditing}
			<FeeWindowFields {values} {errors} {timezone} />
			<FormActions>
				<Button
					label="Cancel"
					variant="secondary"
					size="dense"
					href={manageFeesTabUrl(conferenceSlug, 'fees')}
				/>
				<Button
					label="Save fee"
					variant="primary"
					size="dense"
					formaction="?/updateFee"
					isLoading={inPlaceForm.isBusy}
				/>
			</FormActions>
		{:else}
			<!-- `<details>` is the browser's own box that opens and closes, with no script. -->
			<details open={hasWindow}>
				<summary class="cursor-pointer text-small font-medium text-link">
					Only charge it between two dates
				</summary>
				<div class="pt-3">
					<FeeWindowFields {values} {errors} {timezone} />
				</div>
			</details>
		{/if}
	</form>
{/if}
