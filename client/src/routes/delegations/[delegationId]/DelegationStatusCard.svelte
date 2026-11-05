<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import {
		DRAFT_HEAD_STATUS_SENTENCE,
		canWithdrawDelegation,
		delegationStatusSentence,
		type Delegation,
		type DelegationConference,
		type DelegationProgress,
		type DelegationRole
	} from '$lib/delegations';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		delegation: Delegation;
		/** The conference it is for. The sentence names its days in this timezone. */
		conference: DelegationConference;
		/** Requested, allocated and assigned seats, worked out by `delegationProgress`. */
		progress: DelegationProgress;
		/** Only a head is offered the two buttons. A member reads the card. */
		myRole: DelegationRole;
	};

	let { delegation, conference, progress, myRole }: Props = $props();

	// `$derived` works each of these out again whenever the delegation changes,
	// which happens after every action on this page.
	const isHead = $derived(myRole === 'head');

	/*
		A head's draft is headed "Not sent yet" and says the request can go now,
		with "Submit to the organisers" under it (`dashboard.md`, "Draft"; T177).
		Everyone else, and every other status, reads the status table's sentence
		under "Status".
	*/
	const isHeadsDraft = $derived(isHead && delegation.status === 'draft');
	const heading = $derived(isHeadsDraft ? 'Not sent yet' : 'Status');
	const sentence = $derived(
		isHeadsDraft
			? DRAFT_HEAD_STATUS_SENTENCE
			: delegationStatusSentence(delegation, conference, progress)
	);

	/*
		"Submit" asks nothing about the clock, only about the status. A component
		that called `new Date()` would write one thing while the page is rendered
		on the server and another a moment later in the browser, which Svelte
		reports as a hydration mismatch, so the application window is the `submit`
		action's to judge: it refuses with "Applications for ... closed on ..."
		when the window has already shut.
	*/
	const showsSubmit = $derived(isHeadsDraft);
	const showsWithdraw = $derived(
		isHead && canWithdrawDelegation(delegation, progress.allocated) === null
	);

	// Sends the "Submit to the organisers" form in the background and redraws
	// the page without reloading it (`$lib/in-place-form.svelte.ts`).
	// `use:enhance` in the markup hands the form over; without JavaScript it
	// posts and reloads the page as before. "Withdraw request" is a
	// `ConfirmButton`, which already sends its own form this same way.
	const inPlaceForm = createInPlaceForm();
</script>

<Card>
	<div class="flex flex-col items-start gap-4">
		<div>
			<!-- Titled like the cards beside it, so every card on the page says what it holds. -->
			<h2 class="font-display text-h2 text-brand-900">{heading}</h2>
			<p class="mt-2 text-body">{sentence}</p>
		</div>

		<!--
			A real heading and not a styled paragraph: it titles the quotation under
			it, so a screen reader can jump to it. The classes keep it looking like
			a small label.
		-->
		{#if delegation.status === 'rejected' && delegation.decisionNote}
			<div>
				<h2 class="text-label text-ink-600 uppercase">Note from the organisers</h2>
				<blockquote class="mt-1 border-l-2 border-line pl-3 text-body text-ink-600">
					{delegation.decisionNote}
				</blockquote>
			</div>
		{/if}

		<!--
			A real `<form method="post">`, so the button works with JavaScript
			switched off: the browser posts to the `submit` action by itself.
		-->
		{#if showsSubmit}
			<form method="post" action="?/submit" use:enhance={inPlaceForm.submit}>
				<Button
					label="Submit to the organisers"
					variant="primary"
					type="submit"
					isLoading={inPlaceForm.isBusy}
				/>
			</form>
		{/if}

		<!--
			`ConfirmButton` is its own form posting to the action named here. With
			JavaScript it asks again in a dialog first; without it the confirmation
			page asks, and only the answer carries `confirm=1`. `dashboard.md` quotes the
			question as one sentence, "Withdraw the request? Your members lose their
			place."; the question half is the dialog's title and the consequence
			half is its body, which is how every other `ConfirmButton` is worded.
		-->
		{#if showsWithdraw}
			<ConfirmButton
				label="Withdraw request"
				confirmTitle="Withdraw the request?"
				confirmText="Your members lose their place."
				formaction="?/withdraw"
				variant="soft-danger"
			/>
		{/if}
	</div>
</Card>
