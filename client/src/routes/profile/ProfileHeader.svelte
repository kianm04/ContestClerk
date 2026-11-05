<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Card from '$lib/components/Card.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { countryName } from '$lib/countries';
	import {
		PROFILE_REQUIRED_FIELD_LABELS,
		type MyProfile,
		type ProfileCompleteness
	} from '$lib/profiles';
	import { statusLabel } from '$lib/status';
	import { profileEditUrl } from '$lib/urls';

	type Props = {
		/** The signed-in person's own profile, as organisers and chairs see it. */
		profile: MyProfile;
		/** Which of the four required fields are still empty, worked out by `load`. */
		completeness: ProfileCompleteness;
	};

	let { profile, completeness }: Props = $props();

	// Pronouns and institution are both optional, so an empty one is dropped
	// before the dot is put between them: a missing pronoun must not leave a
	// stray "· Delft University" behind. `$derived` works both out again
	// whenever the profile changes.
	const quietParts = $derived(
		[profile.pronouns, profile.institutionName].filter((part) => part !== '')
	);
	const pronounsAndInstitution = $derived(quietParts.join(' · '));

	// The missing fields in the words the warning uses, such as "your country".
	const missingLabels = $derived(
		completeness.missingFields.map((field) => PROFILE_REQUIRED_FIELD_LABELS[field])
	);
	const missingFieldWords = $derived(missingLabels.join(', '));
</script>

<Card>
	<div class="flex flex-col gap-3">
		<Avatar name={profile.fullName} imagePath={profile.avatarPath} size="lg" />

		<div>
			<!-- The page's one `<h1>` is `PageHeader`'s "Your profile", so the
				person's own name is an `<h2>` under it. -->
			<h2 class="font-display text-h2 text-brand-900">{profile.fullName}</h2>

			{#if pronounsAndInstitution !== ''}
				<p class="text-small text-ink-600">{pronounsAndInstitution}</p>
			{/if}
		</div>

		<!-- The flag and the country's name are left out when there is no country,
			which is one of the fields the warning below then names. The badge is
			always drawn, because `experience_level` is a column that always holds
			one of its four values. -->
		<div class="flex flex-wrap items-center gap-2 text-body">
			{#if profile.countryCode !== ''}
				<Flag countryCode={profile.countryCode} />
				<span>{countryName(profile.countryCode)}</span>
			{/if}

			<Badge tone="neutral" label={statusLabel('experience_level', profile.experienceLevel)} />
		</div>

		{#if !completeness.isComplete}
			<Notice tone="warning" title="Complete your profile">
				<p>
					Organisers need {missingFieldWords} before your application tells them anything.
				</p>

				<a href={profileEditUrl()} class="text-brand-700 hover:underline">Edit profile</a>
			</Notice>
		{/if}
	</div>
</Card>
