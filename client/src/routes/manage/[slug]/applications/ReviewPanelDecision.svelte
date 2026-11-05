<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import SelectField, { type SelectOption } from '$lib/components/SelectField.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import { DECISION_NOTE_MAX_LENGTH } from '$lib/applications';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** The free seats, the applicant's preferred committees first. */
		seatOptions: SelectOption[];
		/** The seat chosen when the last decision was refused, or `''` for the first one. */
		seatId: string;
		/** Why the last decision was refused, or `null`. */
		error: string | null;
		/** Only an application still under review can go on the waiting list. */
		canWaitlist: boolean;
		canReject: boolean;
		/** Where each button posts: the list, keeping its tab and this application. */
		acceptAction: string;
		waitlistAction: string;
		rejectAction: string;
	};

	let {
		seatOptions,
		seatId,
		error,
		canWaitlist,
		canReject,
		acceptAction,
		waitlistAction,
		rejectAction
	}: Props = $props();

	/** The `id` the buttons below use to reach the seat form; there is one panel per page. */
	const DECISION_FORM_ID = 'review-panel-decision';

	// Sends the decision in the background; the list and the panel then redraw
	// with the next application (`$lib/in-place-form.svelte.ts`).
	const inPlaceForm = createInPlaceForm();

	// The dropdown starts on the first free seat, which is in the applicant's
	// first preference when there is one. `$derived` follows `seatId`.
	const chosenSeatId = $derived(seatId === '' ? (seatOptions[0]?.value ?? '') : seatId);
	const hasFreeSeat = $derived(seatOptions.length > 0);
</script>

<!--
	The seat dropdown, "Accept" and "Waitlist" belong to this one form. "Decline"
	is a `ConfirmButton`, which draws a form of its own, and a form cannot sit
	inside another form. So the three buttons share a row below the form, and the
	first two reach it through its `id` with the `form` attribute.
-->
<form id={DECISION_FORM_ID} method="post" action={acceptAction} use:enhance={inPlaceForm.submit}>
	{#if hasFreeSeat}
		<SelectField
			isDense
			label="Seat"
			name="seatId"
			idKey="panel-seat"
			value={chosenSeatId}
			options={seatOptions}
			help="Free seats in their first preference come first."
		/>
	{:else}
		<p class="text-dense text-muted-foreground">
			Every seat is taken. Free a seat on the allocation page to accept this application.
		</p>
	{/if}
</form>

<div class="mt-4 flex flex-wrap items-start gap-2">
	{#if hasFreeSeat}
		<Button
			label="Accept and give this seat"
			variant="primary"
			size="dense"
			form={DECISION_FORM_ID}
			isLoading={inPlaceForm.isSending(acceptAction)}
		/>
	{/if}
	{#if canWaitlist}
		<Button
			label="Waitlist"
			variant="secondary"
			size="dense"
			form={DECISION_FORM_ID}
			formaction={waitlistAction}
			isLoading={inPlaceForm.isSending(waitlistAction)}
		/>
	{/if}
	{#if canReject}
		<!-- The note box sits in the dialog, so the panel does not carry an empty box. -->
		<ConfirmButton
			label="Decline"
			confirmTitle="Mark this application as not accepted?"
			confirmText="The applicant is told, and can no longer be given a seat."
			formaction={rejectAction}
			variant="secondary"
			size="dense"
			areFieldsInDialog
		>
			<TextArea
				isDense
				label="Why not? The applicant reads this."
				name="decisionNote"
				idKey="panel-decline-note"
				value=""
				rows={3}
				maxLength={DECISION_NOTE_MAX_LENGTH}
			/>
		</ConfirmButton>
	{/if}
</div>

{#if error}
	<div class="mt-3">
		<Notice tone="error">{error}</Notice>
	</div>
{/if}
