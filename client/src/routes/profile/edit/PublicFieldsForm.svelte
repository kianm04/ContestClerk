<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import CountrySelect from '$lib/components/CountrySelect.svelte';
	import FormActions from '$lib/components/FormActions.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import { createInstantForm } from '$lib/instant-form.svelte';
	import { describeProfileFailure, describeProfileSaved } from '$lib/profile-presses';
	import {
		BIO_MAX_LENGTH,
		EXPERIENCE_LEVEL_CHOICES,
		type ProfileFormErrors,
		type ProfileFormValues
	} from '$lib/profiles';

	type Props = {
		/** What the profile holds now, or what was typed on a submit that failed. */
		values: ProfileFormValues;
		/** One message per field that has something wrong with it. */
		errors: ProfileFormErrors;
	};

	let { values, errors }: Props = $props();

	// Sends the form in the background (`$lib/instant-form.svelte.ts`) and
	// says "saved" the moment it is pressed, with no spinner, unless a field
	// is wrong. A save the server refuses marks its fields and says so in a
	// toast. `use:enhance` in the markup hands the form over; without
	// JavaScript it posts and reloads the page as before.
	const instantForm = createInstantForm({
		describeFailure: describeProfileFailure,
		describeSuccess: describeProfileSaved
	});
</script>

<div class="mb-4">
	<h2 class="font-display text-h2 text-brand-900">Public profile</h2>
	<p class="mt-1 text-body text-ink-600">How you appear to organisers and chairs.</p>
</div>

<!--
	`action="?/updatePublic"` names which of this page's two actions the form
	posts to. It is an ordinary HTML form, so the profile can be saved with the
	JavaScript switched off.

	None of the required fields carries the HTML `required` attribute. The
	browser would refuse the form in its own wording before the server ever saw
	it, so somebody with JavaScript switched off and somebody without would be
	told two different things. `validateProfileForm` on the server says all of
	them in our words instead, exactly as the welcome form does.
-->
<form
	method="post"
	action="?/updatePublic"
	class="flex flex-col gap-4"
	use:enhance={instantForm.submit}
>
	<TextField
		label="Full name"
		name="fullName"
		value={values.fullName}
		error={errors.fullName}
		autocomplete="name"
	/>

	<TextField
		label="Institution"
		name="institutionName"
		value={values.institutionName}
		error={errors.institutionName}
		help="School, university or club."
	/>

	<CountrySelect name="countryCode" value={values.countryCode} error={errors.countryCode} />

	<SelectField
		label="Experience"
		name="experienceLevel"
		value={values.experienceLevel}
		options={EXPERIENCE_LEVEL_CHOICES}
		error={errors.experienceLevel}
		placeholder="Pick your experience level"
	/>

	<TextField
		label="Pronouns"
		name="pronouns"
		value={values.pronouns}
		error={errors.pronouns}
		help="Shown next to your name. Leave it blank to show nothing."
	/>

	<TextArea
		label="Bio"
		name="bio"
		value={values.bio}
		error={errors.bio}
		rows={4}
		maxLength={BIO_MAX_LENGTH}
	/>

	<FormActions>
		<Button label="Save profile" variant="primary" />
	</FormActions>
</form>
