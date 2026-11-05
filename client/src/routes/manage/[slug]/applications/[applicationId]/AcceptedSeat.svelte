<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ResolvedPathname } from '$app/types';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import RadioGroup from '$lib/components/RadioGroup.svelte';
	import type { MyApplicationInvoice } from '$lib/applications';
	import { REVOKE_TO_OPTIONS, type ReviewSeat, type RevokeTo } from '$lib/application-review';
	import { statusBadgeTone, statusLabel } from '$lib/status';

	type Props = {
		/** The seat this accepted applicant holds. */
		seat: ReviewSeat;
		/** The newest invoice for that seat, or `null` when the conference charges nothing. */
		invoice: MyApplicationInvoice | null;
		/** The invoice's row on the fees page, or `null` without an invoice. */
		invoiceHref: ResolvedPathname | null;
		/** The allocation grid, opened on this seat. */
		changeSeatHref: ResolvedPathname;
		/** False for a reader who may not decide applications, who gets no "Revoke acceptance". */
		canRevoke: boolean;
		/** The status "Revoke acceptance" leaves, as chosen last time. */
		revokeTo: RevokeTo;
		/** Where "Revoke acceptance" posts. */
		revokeAction: string;
		/** The page's instant form, so the seat is freed the moment this is pressed (T142). */
		onSubmit: SubmitFunction;
	};

	let {
		seat,
		invoice,
		invoiceHref,
		changeSeatHref,
		canRevoke,
		revokeTo,
		revokeAction,
		onSubmit
	}: Props = $props();
</script>

<div class="flex flex-col gap-4">
	<p class="text-body">
		<strong>{seat.name}</strong> in {seat.committeeLabel}
	</p>

	{#if invoice && invoiceHref}
		<p class="flex flex-wrap items-center gap-2 text-body">
			<a href={invoiceHref} class="text-link hover:underline">Invoice {invoice.number}</a>
			<Badge
				tone={statusBadgeTone('invoice_status', invoice.status)}
				label={statusLabel('invoice_status', invoice.status)}
			/>
		</p>
	{/if}

	<div>
		<Button label="Change seat" variant="secondary" href={changeSeatHref} size="dense" />
	</div>

	{#if canRevoke}
		<!-- The choice sits above the button, so it can be made without JavaScript. -->
		<ConfirmButton
			label="Revoke acceptance"
			confirmTitle="Take this seat back?"
			confirmText="The seat becomes free again. An unpaid invoice is voided; a paid one has to be refunded by hand."
			formaction={revokeAction}
			size="dense"
			variant="danger"
			{onSubmit}
		>
			<RadioGroup
				isDense
				legend="Afterwards the application is"
				name="revokeTo"
				value={revokeTo}
				options={REVOKE_TO_OPTIONS}
			/>
		</ConfirmButton>
	{/if}
</div>
