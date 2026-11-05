<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import Gavel from '@lucide/svelte/icons/gavel';
	import StickyNote from '@lucide/svelte/icons/sticky-note';
	import UserCheck from '@lucide/svelte/icons/user-check';
	import type { ResolvedPathname } from '$app/types';
	import Section from '$lib/components/Section.svelte';
	import ParagraphText from '$lib/components/ParagraphText.svelte';
	import type { SeatGroup } from '$lib/allocation';
	import {
		canAllocate,
		type ReviewActionUrls,
		type ReviewApplication,
		type ReviewSeat,
		type RevokeTo
	} from '$lib/application-review';
	import type { MyApplicationInvoice } from '$lib/applications';
	import type { TeamAccept } from '$lib/application-teams';
	import AllocationPanel from './AllocationPanel.svelte';
	import DecisionPanel from './DecisionPanel.svelte';
	import InternalNoteForm from './InternalNoteForm.svelte';
	import TeamAcceptPanel from './TeamAcceptPanel.svelte';

	type Props = {
		application: ReviewApplication;
		timezone: string;
		seat: ReviewSeat | null;
		invoice: MyApplicationInvoice | null;
		invoiceHref: ResolvedPathname | null;
		changeSeatHref: ResolvedPathname | null;
		actionUrls: ReviewActionUrls;
		/** Whether the reader holds `decide_applications`; without it the column only reads. */
		canDecide: boolean;
		seatGroups: SeatGroup[];
		/** What was typed or chosen when the last post to each form was refused. */
		formSeatId: string;
		formDecisionNote: string;
		formRevokeTo: RevokeTo;
		formInternalNote: string;
		/** Why the last post to each form was refused, or `null`. */
		acceptError: string | null;
		decisionError: string | null;
		noteError: string | null;
		/** The page's one instant form; see `$lib/instant-form.svelte.ts` (T142). */
		onSubmit: SubmitFunction;
		/**
		 * Set while this applicant and a teammate are both undecided: the team is
		 * then accepted into one country instead of one seat (Trello pZNcdPqU).
		 */
		teamAccept: TeamAccept | null;
		formCountryCode: string;
		teamAcceptError: string | null;
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
		seatGroups,
		formSeatId,
		formDecisionNote,
		formRevokeTo,
		formInternalNote,
		acceptError,
		decisionError,
		noteError,
		onSubmit,
		teamAccept,
		formCountryCode,
		teamAcceptError
	}: Props = $props();

	// `$derived` works this out again whenever `teamAccept` changes.
	const decisionDescription = $derived(
		teamAccept
			? 'Waitlisting or rejecting this application does the same for the whole team.'
			: 'Accept, waitlist, reject or revoke this application.'
	);
</script>

<div class="flex flex-col gap-6">
	{#if canDecide && teamAccept}
		<Section title="Accept the team" icon={UserCheck}>
			<TeamAcceptPanel {teamAccept} countryCode={formCountryCode} error={teamAcceptError} />
		</Section>
	{:else if canDecide && canAllocate(application.status)}
		<Section
			title="Accept"
			icon={UserCheck}
			description="Choose a seat to allocate to this applicant."
		>
			<AllocationPanel
				{seatGroups}
				seatId={formSeatId}
				error={acceptError}
				formaction={actionUrls.accept}
				{onSubmit}
			/>
		</Section>
	{/if}

	<!-- A reader who may not decide sees the decision once one has been made. -->
	{#if canDecide || application.decidedAt !== null}
		<Section
			title="Decision"
			icon={Gavel}
			description={canDecide ? decisionDescription : undefined}
		>
			<DecisionPanel
				{application}
				{timezone}
				{seat}
				{invoice}
				{invoiceHref}
				{changeSeatHref}
				{actionUrls}
				{canDecide}
				decisionNote={formDecisionNote}
				revokeTo={formRevokeTo}
				error={decisionError}
				{onSubmit}
			/>
		</Section>
	{/if}

	{#if canDecide}
		<Section title="Internal note" icon={StickyNote} description="Only your team sees this.">
			<InternalNoteForm
				formaction={actionUrls.saveInternalNote}
				internalNote={formInternalNote}
				error={noteError}
				{onSubmit}
			/>
		</Section>
	{:else if application.internalNote}
		<Section title="Internal note" icon={StickyNote} description="Only your team sees this.">
			<ParagraphText text={application.internalNote} />
		</Section>
	{/if}
</div>
