<script lang="ts">
	import FileText from '@lucide/svelte/icons/file-text';
	import type { ResolvedPathname } from '$app/types';
	import UserRound from '@lucide/svelte/icons/user-round';
	import Section from '$lib/components/Section.svelte';
	import type { ApplicationQuestion } from '$lib/application-questions';
	import {
		reviewAnswers,
		type ApplicantDetails,
		type ApplicantProfile as ApplicantProfileData
	} from '$lib/application-review';
	import type { ApplicationAnswers as ApplicationAnswerMap } from '$lib/applications';
	import type { PrivateDetailsAccess } from '$lib/private-details';
	import ApplicantProfile from './ApplicantProfile.svelte';
	import ApplicationAnswers from './ApplicationAnswers.svelte';

	type Props = {
		/** The public and private halves of the applicant, and any age warning. */
		profile: ApplicantProfileData;
		/** The applicant's public profile, which they filled in for every conference. */
		profileHref: ResolvedPathname;
		details: ApplicantDetails | null;
		age: number | null;
		ageWarning: string | null;
		/** Which halves of the private details the reader's permissions show. */
		access: PrivateDetailsAccess;
		/** What the applicant answered, and the questions they were asked. */
		preferredCommittees: string[];
		seatPreferences: string | null;
		motivation: string | null;
		questions: ApplicationQuestion[];
		applicationAnswers: ApplicationAnswerMap;
	};

	let {
		profile,
		profileHref,
		details,
		age,
		ageWarning,
		access,
		preferredCommittees,
		seatPreferences,
		motivation,
		questions,
		applicationAnswers
	}: Props = $props();

	// `$derived` reruns whenever the application's own answers change.
	const answers = $derived(reviewAnswers(questions, applicationAnswers));
</script>

<div class="flex flex-col gap-6">
	<Section
		title="Profile"
		icon={UserRound}
		description="Who is applying."
		viewAllHref={profileHref}
		viewAllLabel="Public profile"
	>
		<ApplicantProfile {profile} {details} {age} {ageWarning} {access} />
	</Section>

	<Section title="Application" icon={FileText} description="What they answered.">
		<ApplicationAnswers {preferredCommittees} {seatPreferences} {motivation} {answers} />
	</Section>
</div>
