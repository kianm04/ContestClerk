<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ResolvedPathname } from '$app/types';
	import Notice from '$lib/components/Notice.svelte';
	import ParagraphText from '$lib/components/ParagraphText.svelte';
	import type { MyApplicationInvoice } from '$lib/applications';
	import {
		canReject,
		canWaitlist,
		type ReviewActionUrls,
		type ReviewApplication,
		type ReviewSeat,
		type RevokeTo
	} from '$lib/application-review';
	import { formatConferenceDay } from '$lib/conferences';
	import AcceptedSeat from './AcceptedSeat.svelte';
	import PendingDecision from './PendingDecision.svelte';

	type Props = {
		application: ReviewApplication;
		/** The conference's timezone, so the decided day is the day it was there. */
		timezone: string;
		/** The seat an accepted application holds, or `null`. */
		seat: ReviewSeat | null;
		invoice: MyApplicationInvoice | null;
		invoiceHref: ResolvedPathname | null;
		changeSeatHref: ResolvedPathname | null;
		actionUrls: ReviewActionUrls;
		/** Whether the reader holds `decide_applications`; without it nothing here posts. */
		canDecide: boolean;
		/** What the last refused post kept: the note to the applicant and the revoke choice. */
		decisionNote: string;
		revokeTo: RevokeTo;
		/** Why the last waitlist, reject or revoke was refused, or `null`. */
		error: string | null;
		/**
		 * The page's instant form (`$lib/instant-form.svelte.ts`), passed down to
		 * whichever of "Waitlist", "Not accepted" or "Revoke acceptance" is shown,
		 * so the decision changes the page the moment it is pressed (T142).
		 */
		onSubmit: SubmitFunction;
	};

	let {
		application,
		timezone,
		seat,
		invoice,
		invoiceHref,
		changeSeatHref,
		actionUrls,
		canDecide,
		decisionNote,
		revokeTo,
		error,
		onSubmit
	}: Props = $props();

	/* `$derived` works this out again whenever the application changes. */
	const decidedDay = $derived(
		application.decidedAt === null ? null : formatConferenceDay(application.decidedAt, timezone)
	);
</script>

<!--
	What a decided application shows is read-only: when it was decided and what
	the applicant was told. What can still be done depends on the status.
-->
<div class="flex flex-col gap-4">
	{#if decidedDay}
		<p class="text-small text-ink-600">Decided {decidedDay}</p>
	{/if}

	{#if application.decisionNote}
		<ParagraphText text={application.decisionNote} />
	{/if}

	{#if error}
		<Notice tone="error">{error}</Notice>
	{/if}

	{#if canDecide && canReject(application.status)}
		<PendingDecision
			canWaitlist={canWaitlist(application.status)}
			{decisionNote}
			waitlistAction={actionUrls.waitlist}
			rejectAction={actionUrls.reject}
			{onSubmit}
		/>
	{:else if seat && changeSeatHref}
		<AcceptedSeat
			{seat}
			{invoice}
			{invoiceHref}
			{changeSeatHref}
			canRevoke={canDecide}
			{revokeTo}
			revokeAction={actionUrls.revoke}
			{onSubmit}
		/>
	{/if}
</div>
