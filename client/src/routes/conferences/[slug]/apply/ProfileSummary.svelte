<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { countryName } from '$lib/countries';
	import {
		PROFILE_REQUIRED_FIELD_LABELS,
		type MyProfile,
		type ProfileRequiredField
	} from '$lib/profiles';
	import { statusLabel } from '$lib/status';
	import { profileEditUrl } from '$lib/urls';

	type Props = {
		/** The applicant's own profile, as the organisers will read it. */
		profile: MyProfile;
		/** The required profile fields still empty. They block submitting. */
		missingFields: ProfileRequiredField[];
	};

	let { profile, missingFields }: Props = $props();

	// `$derived` works both of these out again whenever the props change. The
	// words for a missing field ("your country") come from `$lib/profiles`, so
	// this warning and the one on `/profile` cannot disagree about them.
	const experience = $derived(statusLabel('experience_level', profile.experienceLevel));
	const missingFieldWords = $derived(
		missingFields.map((field) => PROFILE_REQUIRED_FIELD_LABELS[field]).join(', ')
	);
</script>

<div class="flex flex-col gap-3">
	<div>
		<!-- The page's one `<h1>` is `PageHeader`'s "Apply to …", and the card's
			own heading is above this, so the applicant's name is plain text. -->
		<p class="text-body font-medium">{profile.fullName}</p>

		{#if profile.institutionName !== ''}
			<p class="text-small text-ink-600">{profile.institutionName}</p>
		{/if}
	</div>

	<!-- The flag and the country's name are left out when there is no country,
		which is then one of the fields the warning below names. The experience
		level is always there, because its column always holds one of its four
		values. -->
	<div class="flex flex-wrap items-center gap-2 text-body">
		{#if profile.countryCode !== ''}
			<Flag countryCode={profile.countryCode} />
			<span>{countryName(profile.countryCode)}</span>
			<span class="text-ink-600">·</span>
		{/if}

		<span>{experience}</span>
	</div>

	<!-- `profileEditUrl()` builds the address with `resolve()` from `$app/paths`,
		which checks it against the folders under `src/routes/`. The button is
		really a link, so it does not submit the form around it. -->
	<div>
		<Button label="Edit profile" variant="ghost" href={profileEditUrl()} />
	</div>

	{#if missingFields.length > 0}
		<Notice tone="warning" title="Complete your profile">
			<p>Organisers need {missingFieldWords} before you can submit this application.</p>
		</Notice>
	{/if}
</div>
