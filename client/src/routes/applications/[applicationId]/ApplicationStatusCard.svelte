<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import {
		applicationStatusSentence,
		type MyApplication,
		type MyApplicationInvoice,
		type MyApplicationSeat
	} from '$lib/applications';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import Money from '$lib/components/Money.svelte';
	import SeatName from '$lib/components/SeatName.svelte';
	import { statusBadgeTone, statusLabel } from '$lib/status';
	import { applyUrl, committeeUrl, invoiceUrl } from '$lib/urls';

	type Props = {
		application: MyApplication;
		/** The conference this application is for. Both links below are built from it. */
		conferenceSlug: string;
		/** The seat the organisers gave, once there is one. */
		seat?: MyApplicationSeat;
		/** The fee invoice for that seat, when the conference charges one. */
		invoice?: MyApplicationInvoice;
		/** Whether "Edit application" is offered, worked out by `load`. */
		canEdit: boolean;
		canWithdraw: boolean;
		canDeleteDraft: boolean;
		/**
		 * The page's instant form, which "Withdraw application" is sent through so
		 * the status changes the moment the answer is confirmed. "Delete draft"
		 * keeps its busy button: it moves to another page.
		 */
		onWithdraw: SubmitFunction;
	};

	let {
		application,
		conferenceSlug,
		seat,
		invoice,
		canEdit,
		canWithdraw,
		canDeleteDraft,
		onWithdraw
	}: Props = $props();

	// `$derived` works each of these out again whenever `application` or `seat`
	// changes, which happens after every action on this page.
	const badgeTone = $derived(statusBadgeTone('application_status', application.status));
	const badgeLabel = $derived(statusLabel('application_status', application.status));
	const sentence = $derived(applicationStatusSentence(application.status, seat ?? null));
</script>

<Card>
	<div class="flex flex-col items-start gap-4">
		<!-- Titled like "Your answers" beside it; `self-stretch` lets the badge sit at the far end. -->
		<div class="flex items-center justify-between gap-3 self-stretch">
			<h2 class="font-display text-h2 text-brand-900">Status</h2>
			<Badge tone={badgeTone} label={badgeLabel} />
		</div>

		<p class="text-body">{sentence}</p>

		<!-- A real heading and not a styled paragraph: it titles the quotation
			under it, so a screen reader should be able to jump to it the way it
			jumps to "Your answers". The classes keep it looking like a small
			label. -->
		{#if application.decisionNote}
			<div>
				<h2 class="text-label text-ink-600 uppercase">Note from the organisers</h2>
				<blockquote class="mt-1 border-l-2 border-line pl-3 text-body text-ink-600">
					{application.decisionNote}
				</blockquote>
			</div>
		{/if}

		<!--
			"Edit application" is a link and not an action: the apply page loads the
			existing row, and for a `submitted` application its own `saveDraft` is
			what moves the status back to `draft` (`06-features/applications.md`).
		-->
		{#if canEdit}
			<Button label="Edit application" variant="secondary" href={applyUrl(conferenceSlug)} />
		{/if}

		{#if seat}
			<!-- The seat again under a small label, with its flag, so it can be found at a glance. -->
			<div>
				<h2 class="text-label text-ink-600 uppercase">Your seat</h2>
				<p class="mt-1 text-body">
					<SeatName name={seat.seatName} countryCode={seat.countryCode} /> · {seat.committeeName}
				</p>
			</div>

			<Button
				label="Go to your committee"
				variant="primary"
				href={committeeUrl(conferenceSlug, seat.committeeSlug)}
			/>
		{/if}

		<!--
			`05-pages/delegate/application.md` asks for a "View invoice" button here.
			The number, the status and the amount are shown beside it, so the reader
			knows what is owed and whether it is paid before following the link.
		-->
		{#if invoice}
			<div class="flex flex-wrap items-center gap-2">
				<span class="text-body">Invoice {invoice.number}</span>
				<Badge
					tone={statusBadgeTone('invoice_status', invoice.status)}
					label={statusLabel('invoice_status', invoice.status)}
				/>
				<Money amountCents={invoice.amountCents} currency={invoice.currency} />
			</div>

			<Button label="View invoice" variant="secondary" href={invoiceUrl(invoice.id)} />
		{/if}

		<!-- `ConfirmButton` is its own form posting to the action named here. With
			JavaScript it asks again in a dialog first; without it the confirmation
			page asks, and only the answer carries `confirm=1`. -->
		{#if canWithdraw}
			<ConfirmButton
				label="Withdraw application"
				confirmTitle="Withdraw your application?"
				confirmText="The organisers will no longer consider it. You cannot undo this."
				formaction="?/withdraw"
				variant="soft-danger"
				onSubmit={onWithdraw}
			/>
		{/if}

		{#if canDeleteDraft}
			<ConfirmButton
				label="Delete draft"
				confirmTitle="Delete draft?"
				confirmText="Everything you have written so far is removed and cannot be brought back."
				formaction="?/deleteDraft"
				variant="soft-danger"
			/>
		{/if}
	</div>
</Card>
