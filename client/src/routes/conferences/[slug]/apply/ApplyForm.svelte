<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Card from '$lib/components/Card.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import {
		MOTIVATION_MAX_LENGTH,
		SEAT_PREFERENCES_MAX_LENGTH,
		type ApplicationFormErrors,
		type ApplicationFormValues,
		type CommitteeChoice
	} from '$lib/applications';
	import type { ApplicationQuestion } from '$lib/application-questions';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import type { MyProfile, ProfileRequiredField } from '$lib/profiles';
	import { profileEditUrl } from '$lib/urls';
	import ConsentField from './ConsentField.svelte';
	import PreferenceFields from './PreferenceFields.svelte';
	import ProfileSummary from './ProfileSummary.svelte';
	import QuestionsCard from './QuestionsCard.svelte';
	import SubmitButtons from './SubmitButtons.svelte';

	type Props = {
		/** What every box holds now: the saved application, or what was typed on a refused submit. */
		values: ApplicationFormValues;
		/** One message per part of the form that needs fixing. */
		errors: ApplicationFormErrors;
		committees: CommitteeChoice[];
		/** How many committee selects to draw. */
		preferenceCount: number;
		asksMotivation: boolean;
		questions: ApplicationQuestion[];
		profile: MyProfile;
		missingProfileFields: ProfileRequiredField[];
		/** The line for somebody outside the ages the organisers expect, or `null`. */
		ageNotice: string | null;
	};

	let {
		values,
		errors,
		committees,
		preferenceCount,
		asksMotivation,
		questions,
		profile,
		missingProfileFields,
		ageNotice
	}: Props = $props();

	// The "Edit profile" link belongs under the message only when an unfinished
	// profile is what is holding the application up. The same `errors.form` also
	// carries a window that closed while the form was open, and that link would
	// send the reader to the wrong place.
	const isProfileIncomplete = $derived(missingProfileFields.length > 0);

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	const applyForm = createInPlaceForm();
</script>

<!-- One `<form>` around the whole page, so both buttons work with JavaScript
	switched off: each of them names its own action with `formaction`, and the
	browser posts every field either way. -->
<form method="post" class="flex flex-col gap-6" use:enhance={applyForm.submit}>
	{#if errors.form}
		<Notice tone="error">
			<p>{errors.form}</p>
			{#if isProfileIncomplete}
				<a href={profileEditUrl()} class="text-brand-700 hover:underline">Edit profile</a>
			{/if}
		</Notice>
	{/if}

	<Card>
		<h2 class="mb-3 font-display text-h2 text-brand-900">About you</h2>
		<ProfileSummary {profile} missingFields={missingProfileFields} />
	</Card>

	<Card>
		<h2 class="mb-3 font-display text-h2 text-brand-900">Committee preferences</h2>
		<!-- The seat preferences are asked for whatever the preference count is,
			so this card is never empty. -->
		<div class="flex flex-col gap-4">
			<PreferenceFields
				{committees}
				count={preferenceCount}
				values={values.committeePreferences}
				errors={errors.committeePreferences ?? []}
			/>

			<TextArea
				label="Seat preferences"
				name="seatPreferences"
				value={values.seatPreferences}
				error={errors.seatPreferences ?? null}
				help="Countries or roles you would like, if you have any in mind."
				rows={3}
				maxLength={SEAT_PREFERENCES_MAX_LENGTH}
			/>
		</div>
	</Card>

	{#if asksMotivation}
		<Card>
			<h2 class="mb-3 font-display text-h2 text-brand-900">Motivation</h2>
			<TextArea
				label="Why do you want to take part?"
				name="motivation"
				value={values.motivation}
				error={errors.motivation ?? null}
				rows={6}
				maxLength={MOTIVATION_MAX_LENGTH}
				isRequired
			/>
		</Card>
	{/if}

	{#if questions.length > 0}
		<QuestionsCard {questions} values={values.answers} errors={errors.answers} />
	{/if}

	{#if ageNotice}
		<Notice tone="warning">
			<p>{ageNotice}</p>
		</Notice>
	{/if}

	<Card>
		<ConsentField isChecked={values.hasConsented} error={errors.consent} />
	</Card>

	<SubmitButtons {applyForm} />
</form>
