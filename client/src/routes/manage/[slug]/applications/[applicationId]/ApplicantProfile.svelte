<script lang="ts">
	import KeyValueList from '$lib/components/KeyValueList.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import {
		applicantProfileItems,
		type ApplicantDetails,
		type ApplicantProfile
	} from '$lib/application-review';
	import type { PrivateDetailsAccess } from '$lib/private-details';

	type Props = {
		/** The public half of the applicant: name, school, country, experience. */
		profile: ApplicantProfile;
		/** The private half: contact details, diet, emergency contact. */
		details: ApplicantDetails | null;
		/** Worked out from the date of birth, or `null` without one. */
		age: number | null;
		/** Why the age is outside the conference's range, or `null` when it is not. */
		ageWarning: string | null;
		/** Which halves of the private details the reader's permissions show. */
		access: PrivateDetailsAccess;
	};

	let { profile, details, age, ageWarning, access }: Props = $props();

	/* `$derived` builds the rows again whenever any of the props change. */
	const items = $derived(applicantProfileItems(profile, details, age, access));
</script>

<div class="flex flex-col gap-4">
	<!-- A warning and never a block: the organiser decides whether it matters. -->
	{#if ageWarning}
		<Notice tone="warning">{ageWarning}</Notice>
	{/if}

	<KeyValueList {items} />
</div>
