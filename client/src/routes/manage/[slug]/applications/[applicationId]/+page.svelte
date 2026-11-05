<script lang="ts">
	import { EMPTY_ALLOCATION_QUERY } from '$lib/allocation';
	import {
		applicationReviewAfterPresses,
		describeApplicationReviewFailure,
		expectApplicationReviewChange
	} from '$lib/application-review-presses';
	import { createInstantForm, type InstantSubmitInput } from '$lib/instant-form.svelte';
	import { manageAllocationUrl, manageFeesInvoiceUrl } from '$lib/urls';
	import ApplicationOverview from './ApplicationOverview.svelte';
	import ApplicationTeamSection from './ApplicationTeamSection.svelte';
	import ReviewDecisionColumn from './ReviewDecisionColumn.svelte';
	import ReviewHeader from './ReviewHeader.svelte';
	import ReviewNavigation from './ReviewNavigation.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` returned plus the conference the layout above it read.
	// It is read again after every action and on every "Previous" or "Next".
	// `form` is what the last refused post sent back, and it is `null` on a fresh
	// page and after every action that succeeded, because those redirect.
	let { data, form }: PageProps = $props();

	/*
		One instant form for the page's five actions — "Accept", "Waitlist", "Not
		accepted", "Revoke acceptance" and "Save note" (`$lib/instant-form.svelte.ts`):
		the page changes the moment a button is pressed, with no spinner, and a
		press that fails goes back with a toast naming what did not happen.
		Without JavaScript every form still posts and reloads the page as before.
	*/
	const reviewForm = createInstantForm({ describeFailure: describeApplicationReviewFailure });

	/** What a press will change, using the review as the page shows it right now. */
	function expectPress(input: InstantSubmitInput) {
		return expectApplicationReviewChange(input, shown, data.seatGroups);
	}

	const submitReviewPress = reviewForm.submitExpecting(expectPress);

	// `$derived` works this out again whenever `data`, or the presses still on
	// their way, change. `shown` is `data` with those presses laid on top.
	const shown = $derived(applicationReviewAfterPresses(data, reviewForm.presses));

	/* `$derived` works each of these out again whenever `shown` or `form` changes. */
	const application = $derived(shown.application);
	const applicantName = $derived(data.profile.fullName);

	// The seat and invoice links are built from `shown` rather than kept from
	// `load`, so they still point at the right place the moment "Accept" or
	// "Revoke acceptance" is pressed, instead of only once the page reloads.
	const changeSeatHref = $derived(
		shown.seat === null
			? null
			: manageAllocationUrl(data.conference.slug, {
					...EMPTY_ALLOCATION_QUERY,
					seat: shown.seat.id
				})
	);
	const invoiceHref = $derived(
		shown.invoice === null ? null : manageFeesInvoiceUrl(data.conference.slug, shown.invoice.id)
	);

	// Only the card the organiser just posted from shows a message.
	const failedAction = $derived(form?.failedAction ?? null);
	const acceptError = $derived(failedAction === 'accept' ? (form?.message ?? null) : null);
	const noteError = $derived(failedAction === 'saveInternalNote' ? (form?.message ?? null) : null);
	const teamAcceptError = $derived(failedAction === 'acceptTeam' ? (form?.message ?? null) : null);
	const teamError = $derived(failedAction === 'team' ? (form?.message ?? null) : null);
	const decisionError = $derived(
		failedAction === 'waitlist' || failedAction === 'reject' || failedAction === 'revoke'
			? (form?.message ?? null)
			: null
	);
</script>

<svelte:head>
	<title>{applicantName} · Applications · MUNMeet</title>
</svelte:head>

<div class="flex flex-col">
	<ReviewNavigation
		backHref={data.backHref}
		previousHref={data.previousHref}
		nextHref={data.nextHref}
	/>

	<ReviewHeader
		{applicantName}
		avatarPath={data.profile.avatarPath}
		status={application.status}
		submittedAt={application.submittedAt}
		timezone={data.timezone}
	/>

	<!--
		One column on a phone, two from `lg` up. The order in the markup is the
		order a phone reads: the decision first, because that is what the
		organiser came to do, then the profile and the answers. `grid-cols-1`
		lets a column be narrower than its longest line, so a long word is cut
		short or wrapped instead of pushing the page sideways.
	-->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<div class="lg:order-2">
			<ReviewDecisionColumn
				{application}
				timezone={data.timezone}
				seat={shown.seat}
				invoice={shown.invoice}
				{invoiceHref}
				{changeSeatHref}
				actionUrls={data.actionUrls}
				canDecide={data.canDecide}
				seatGroups={data.seatGroups}
				formSeatId={form?.seatId ?? ''}
				formDecisionNote={form?.decisionNote ?? ''}
				formRevokeTo={form?.revokeTo ?? 'rejected'}
				formInternalNote={form?.internalNote ?? application.internalNote ?? ''}
				{acceptError}
				{decisionError}
				{noteError}
				onSubmit={submitReviewPress}
				teamAccept={data.teamAccept}
				formCountryCode={form?.countryCode ?? ''}
				{teamAcceptError}
			/>
		</div>

		<!-- The team comes first: who the applicant applied with changes how they are decided. -->
		<div class="flex flex-col gap-6 lg:order-1">
			{#if data.team.members.length > 0 || data.canDecide}
				<ApplicationTeamSection team={data.team} canDecide={data.canDecide} error={teamError} />
			{/if}

			<ApplicationOverview
				profile={data.profile}
				profileHref={data.profileHref}
				details={data.details}
				age={data.age}
				ageWarning={data.ageWarning}
				access={data.detailsAccess}
				preferredCommittees={data.preferredCommittees}
				seatPreferences={application.seatPreferences}
				motivation={application.motivation}
				questions={data.questions}
				applicationAnswers={application.answers}
			/>
		</div>
	</div>
</div>
