<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import CheckboxField from '$lib/components/CheckboxField.svelte';
	import CountrySelect from '$lib/components/CountrySelect.svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import FormActions from '$lib/components/FormActions.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import {
		DELEGATION_INSTITUTION_MAX_LENGTH,
		DELEGATION_NAME_MAX_LENGTH,
		DELEGATION_NOTE_MAX_LENGTH,
		MAX_REQUESTED_SEATS,
		MIN_REQUESTED_SEATS,
		type DelegationFormErrors,
		type DelegationFormValues
	} from '$lib/delegations';
	import { fieldErrorId } from '$lib/form-fields';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** What every box holds now: the profile's prefill, the saved delegation, or what was typed. */
		values: DelegationFormValues;
		/** One message per field that needs fixing, plus `form` for the whole form. */
		errors: DelegationFormErrors;
		/** The words on the button: "Create delegation" or "Save details". */
		submitLabel: string;
		/** The consent box is on the register form and not on the edit form. */
		asksConsent: boolean;
		/** The form action to post to, such as `?/update`. Left out posts to the page itself. */
		action?: string;
	};

	let { values, errors, submitLabel, asksConsent, action }: Props = $props();

	/**
	 * The sentence the head agrees to, word for word from
	 * `05-pages/delegation/new.md`. Their members' details are not theirs to hand
	 * over without saying so.
	 */
	const CONSENT_LABEL =
		"The organisers may see my members' profile details (phone, dietary requirements, emergency contact).";

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	// This one component is shared by the register page and the dashboard's
	// edit form, and both of their actions always redirect elsewhere on
	// success, so there is no case here that needs `isResetAfterSave`.
	const inPlaceForm = createInPlaceForm();
</script>

<!--
	A real `<form method="post">`, so a delegation can be registered with
	JavaScript switched off. `action` names one of the page's form actions when
	the page has several; left out, the browser posts to the page itself and
	SvelteKit runs its `default` action.

	None of the required fields carries the HTML `required` attribute. The
	browser would refuse the form in its own wording before the server ever saw
	it, so two people would be told two different things about the same empty
	box. `validateDelegationForm` on the server says all of them in our words
	instead, exactly as the profile form does.
-->
<form method="post" {action} class="flex flex-col gap-4" use:enhance={inPlaceForm.submit}>
	{#if errors.form}
		<Notice tone="error">
			<p>{errors.form}</p>
		</Notice>
	{/if}

	<!-- `maxLength` stops the box at what the database takes
		(`delegations_name_length` and `delegations_institution_name_length`);
		`validateDelegationForm` on the server says so in words for a request
		that was not typed into this box. -->
	<TextField
		label="Delegation name"
		name="name"
		value={values.name}
		error={errors.name}
		maxLength={DELEGATION_NAME_MAX_LENGTH}
	/>

	<TextField
		label="Institution"
		name="institutionName"
		value={values.institutionName}
		error={errors.institutionName}
		help="School, university or club."
		maxLength={DELEGATION_INSTITUTION_MAX_LENGTH}
	/>

	<CountrySelect name="countryCode" value={values.countryCode} error={errors.countryCode} />

	<!-- `min` and `max` give the browser's own number box its arrows and stops.
		The server checks the same two numbers again, because a posted form is
		only ever text somebody sent us. -->
	<TextField
		label="Seats you would like"
		name="requestedSeats"
		type="number"
		value={values.requestedSeats}
		error={errors.requestedSeats}
		help="A wish. The organisers decide how many you get."
		min={MIN_REQUESTED_SEATS}
		max={MAX_REQUESTED_SEATS}
	/>

	<TextArea
		label="Note to the organisers"
		name="note"
		value={values.note}
		error={errors.note}
		rows={4}
		maxLength={DELEGATION_NOTE_MAX_LENGTH}
	/>

	{#if asksConsent}
		<!-- `CheckboxField` carries no message of its own, so the error goes under
			it, under the id every other field in `$lib/components` names its message
			by, and `describedById` is what has a screen reader read the two out
			together. The apply page's `ConsentField` does the same. -->
		<div>
			<CheckboxField
				label={CONSENT_LABEL}
				name="consent"
				isChecked={values.hasConsented}
				describedById={errors.consent ? fieldErrorId('consent') : undefined}
			/>
			<FieldError id={fieldErrorId('consent')} message={errors.consent} />
		</div>
	{/if}

	<FormActions>
		<Button label={submitLabel} variant="primary" isLoading={inPlaceForm.isBusy} />
	</FormActions>
</form>
