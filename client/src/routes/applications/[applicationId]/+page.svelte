<script lang="ts">
	import type { ApplicationConference } from '$lib/applications';
	import Avatar from '$lib/components/Avatar.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { formatConferenceDay } from '$lib/conferences';
	import { formatEventTime } from '$lib/dates';
	import { myApplicationsUrl } from '$lib/urls';
	import ApplicationAnswers from './ApplicationAnswers.svelte';
	import { createInstantForm } from '$lib/instant-form.svelte';
	import { applicationAfterPresses, describeWithdrawFailure } from '$lib/my-application-presses';
	import ApplicationStatusCard from './ApplicationStatusCard.svelte';
	import ApplicationTeamCard from './ApplicationTeamCard.svelte';
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned. It is read again
	// every time the URL changes and after every action on this page. `PageProps`
	// comes from `./$types`, the types SvelteKit generates for this one route.
	let { data }: PageProps = $props();

	/**
	 * The warning a draft shows once the conference has stopped taking
	 * applications.
	 *
	 * There is not always a date to name: `isAcceptingApplications` also refuses
	 * a conference that is no longer published, and such a conference may never
	 * have had a closing date at all.
	 */
	function closedDraftNotice(conference: ApplicationConference): string {
		const ending = 'This draft can no longer be submitted.';

		if (conference.applicationsCloseAt === null) {
			return `Applications for ${conference.name} are closed. ${ending}`;
		}

		const closedOn = formatConferenceDay(conference.applicationsCloseAt, conference.timezone);

		return `Applications for ${conference.name} closed on ${closedOn}. ${ending}`;
	}

	/** The quiet line under both cards, and nothing at all while this is a draft. */
	function submittedLine(submittedAt: string | null, timezone: string): string | null {
		if (submittedAt === null) {
			return null;
		}

		const day = formatConferenceDay(submittedAt, timezone);
		const time = formatEventTime(submittedAt, null, timezone);

		return `Submitted ${day} · ${time}`;
	}

	// `$derived` works each of these out again whenever `data` changes.
	/*
		"Withdraw application" goes through an instant form
		(`$lib/instant-form.svelte.ts`): once the answer is confirmed the status
		reads "Withdrawn" at once, with no spinner, and a failure goes back with
		a toast. Without JavaScript the form posts and reloads as before.
	*/
	const withdrawForm = createInstantForm({ describeFailure: describeWithdrawFailure });

	// The status card's part of `data`, with a withdrawal still on its way laid on top.
	const shown = $derived(
		applicationAfterPresses(
			{ application: data.application, canEdit: data.canEdit, canWithdraw: data.canWithdraw },
			withdrawForm.presses
		)
	);

	const isClosedDraft = $derived(data.application.status === 'draft' && !data.isWindowOpen);
	const closedMessage = $derived(isClosedDraft ? closedDraftNotice(data.conference) : null);
	const submitted = $derived(submittedLine(data.application.submittedAt, data.conference.timezone));
</script>

<svelte:head>
	<!-- A page only its owner can open writes its own title, rather than using
		`PageMeta`, which asks for a description for a link card. -->
	<title>Your application · {data.conference.name} · MUNMeet</title>
</svelte:head>

<!-- Two columns at most, so the page keeps to 960px inside the shell. -->
<div class="mx-auto max-w-240">
	<a href={myApplicationsUrl()} class="text-small text-brand-700 hover:underline">← Applications</a>

	<!--
		`PageHeader` has no room for a picture, so the conference logo sits beside
		it.
	-->
	<div class="mt-2 mb-6 flex items-start gap-4">
		<Avatar name={data.conference.name} imagePath={data.conference.logoPath} size="md" />

		<div class="min-w-0 flex-1">
			<PageHeader eyebrow={data.conference.name} title="Your application" />
		</div>
	</div>

	{#if closedMessage}
		<div class="mb-6">
			<Notice tone="warning">{closedMessage}</Notice>
		</div>
	{/if}

	<!--
		The status card comes first in the markup, so a phone stacks it above the
		answers. From the `lg` width up the grid gives it the left third and the
		answers the other two.
	-->
	<div class="grid items-start gap-6 lg:grid-cols-3">
		<div class="flex flex-col gap-6">
			<ApplicationStatusCard
				application={shown.application}
				conferenceSlug={data.conference.slug}
				seat={data.seat ?? undefined}
				invoice={data.invoice ?? undefined}
				canEdit={shown.canEdit}
				canWithdraw={shown.canWithdraw}
				canDeleteDraft={data.canDeleteDraft}
				onWithdraw={withdrawForm.submit}
			/>

			<ApplicationTeamCard team={data.team} canChangeTeam={data.canChangeTeam} />
		</div>

		<div class="lg:col-span-2">
			<ApplicationAnswers
				application={data.application}
				questions={data.questions}
				committeeNames={data.committeeNames}
			/>
		</div>
	</div>

	{#if submitted}
		<p class="mt-6 text-small text-ink-600">{submitted}</p>
	{/if}
</div>
