<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import RadioGroup from '$lib/components/RadioGroup.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import {
		COLLECTION_MODE_OPTIONS,
		PAYMENT_INSTRUCTIONS_MAX_LENGTH,
		type CollectionModeErrors,
		type CollectionModeValues
	} from '$lib/fees';
	import type { InPlaceForm } from '$lib/in-place-form.svelte';
	import { organizationSettingsUrl } from '$lib/urls';

	type Props = {
		/** The form's `id`, which the setup footer's "Save and continue" sends it by. */
		id: string;
		/** What the fields show: the saved setting, or what was typed into a refused form. */
		values: CollectionModeValues;
		/** One message per field that has something wrong with it. */
		errors: CollectionModeErrors;
		/** Whether the organisation has finished Stripe onboarding. */
		isStripeConnected: boolean;
		/** The organisation's name and slug, for the line about Stripe and its link. */
		organizationName: string;
		organizationSlug: string;
		/** True while the conference is a draft, when the footer's button is the main one. */
		isDraft: boolean;
		/**
		 * Sends the form in the background (`$lib/in-place-form.svelte.ts`). The
		 * page makes it, because the footer's "Save and continue" sends this same
		 * form and shows its spinner too.
		 */
		inPlaceForm: InPlaceForm;
	};

	let {
		id,
		values,
		errors,
		isStripeConnected,
		organizationName,
		organizationSlug,
		isDraft,
		inPlaceForm
	}: Props = $props();
</script>

<!--
	An ordinary HTML form posting to the page's own `saveCollectionMode`
	action, so this works with JavaScript switched off. `use:enhance` hands it
	to the in-place form, which saves it without reloading the page.
-->
<form
	{id}
	method="post"
	action="?/saveCollectionMode"
	class="flex flex-col gap-5"
	use:enhance={inPlaceForm.submit}
>
	<RadioGroup
		legend="Payment"
		name="mode"
		value={values.mode}
		options={COLLECTION_MODE_OPTIONS}
		error={errors.mode}
		isDense
	/>

	<!-- The server refuses cards until Stripe is connected, so the form says so first. -->
	{#if !isStripeConnected}
		<p class="text-dense text-muted-foreground">
			Paying by card needs Stripe, which {organizationName} has not connected yet.
			<a class="font-medium text-link" href={organizationSettingsUrl(organizationSlug)}>
				Connect Stripe
			</a>
		</p>
	{/if}

	<!--
		The box is always in the HTML rather than appearing once "Outside
		MUNMeet" is chosen: the page has to work with JavaScript switched off,
		and the server is what refuses an empty one in manual mode.
	-->
	<TextArea
		label="Payment instructions"
		name="paymentInstructions"
		value={values.paymentInstructions}
		error={errors.paymentInstructions}
		help="Delegates see this on their invoice."
		rows={3}
		maxLength={PAYMENT_INSTRUCTIONS_MAX_LENGTH}
		isDense
	/>

	<!--
		`stay` tells the action to come back here rather than move on to the
		next setup step, which is what the footer's "Save and continue" does.
		Fees can only be added once this is saved, so a draft needs it too.
	-->
	<div>
		<Button
			label="Save"
			variant={isDraft ? 'secondary' : 'primary'}
			size="dense"
			name="stay"
			value="yes"
			isLoading={inPlaceForm.isBusy}
		/>
	</div>
</form>
