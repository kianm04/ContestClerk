<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import CountrySelect from '$lib/components/CountrySelect.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import RadioGroup from '$lib/components/RadioGroup.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import {
		EXPERIENCE_LEVEL_CHOICES,
		FULL_NAME_MAX_LENGTH,
		hasWelcomeFormErrors,
		INSTITUTION_NAME_MAX_LENGTH,
		type WelcomeFormErrors,
		type WelcomeFormValues
	} from '$lib/profiles';
	import OrganiserDetailsFields from './OrganiserDetailsFields.svelte';

	type Props = {
		/** What was typed so far, so a failed submit keeps every answer. */
		values: WelcomeFormValues;
		/** One message per field that has something wrong with it. */
		errors: WelcomeFormErrors;
		/** The page the person was heading for, carried through the form. */
		next: string;
	};

	let { values, errors, next }: Props = $props();

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	// This form edits the profile the account already has, so it does not reset.
	const inPlaceForm = createInPlaceForm();

	// Whether the last "Continue" was refused. A fresh form has no errors, so
	// the summary above the button only appears after a refusal.
	const isRefused = $derived(hasWelcomeFormErrors(errors));
</script>

<!--
	No `action` attribute, so this posts to the default action in
	`+page.server.ts`. It is an ordinary HTML form, so onboarding works even if
	the JavaScript never loads.
-->
<form method="post" class="flex flex-col gap-4" use:enhance={inPlaceForm.submit}>
	<!-- The page the person was going to. It is checked again on the server. -->
	<input type="hidden" name="next" value={next} />

	<!--
		None of the four required fields carries the HTML `required` attribute.
		The browser's own check would pop up its own wording and stop the form
		before the server saw it, so a person with JavaScript switched off and a
		person without would be told different things. `validateWelcomeForm` on
		the server says all four in our words instead, the way the sign up page
		checks its terms box.
	-->
	<TextField
		label="Full name"
		name="fullName"
		value={values.fullName}
		error={errors.fullName}
		autocomplete="name"
		maxLength={FULL_NAME_MAX_LENGTH}
	/>

	<TextField
		label="Institution"
		name="institution"
		value={values.institution}
		error={errors.institution}
		help="School, university or club."
		maxLength={INSTITUTION_NAME_MAX_LENGTH}
	/>

	<CountrySelect name="countryCode" value={values.countryCode} error={errors.countryCode} />

	<RadioGroup
		legend="Experience"
		name="experienceLevel"
		value={values.experienceLevel}
		options={EXPERIENCE_LEVEL_CHOICES}
		error={errors.experienceLevel}
	/>

	<TextField
		label="Date of birth (optional)"
		name="dateOfBirth"
		type="date"
		value={values.dateOfBirth}
		error={errors.dateOfBirth}
		help="Some conferences have age limits. We show it only to organisers of conferences you take part in, and to the head of a school delegation you join."
	/>

	<OrganiserDetailsFields {values} {errors} />

	<!--
		Each field says what is wrong with it, but a screen reader would not hear
		that the form was refused at all. An error `Notice` is a `role="alert"`
		region, which is read out as soon as it appears
		(`05-pages/auth/welcome.md`, "States").
	-->
	{#if isRefused}
		<Notice tone="error">Check the fields marked above.</Notice>
	{/if}

	<Button label="Continue" variant="primary" isFullWidth isLoading={inPlaceForm.isBusy} />
</form>
