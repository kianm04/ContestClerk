<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import Button from '$lib/components/Button.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import DragHandle from '$lib/components/DragHandle.svelte';
	import Money from '$lib/components/Money.svelte';
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import { FEE_COLUMNS_CLASS, feeValidityLabel, type FeeStatus } from '$lib/fee-list';
	import {
		FEE_DROP_FORM_ID,
		FEE_DROP_HINT_ID,
		feeAppliesToLabel,
		feeInvoiceCountSentence,
		type ManagedFee
	} from '$lib/fees';
	import type { PendingMove } from '$lib/list-move-preview';
	import type { SortableList } from '$lib/sortable-list.svelte';
	import { manageFeeEditUrl } from '$lib/urls';
	import FeeMoveForm from './FeeMoveForm.svelte';

	type Props = {
		fee: ManagedFee;
		/** A three-letter ISO 4217 code, such as `EUR`. */
		currency: string;
		/** The conference's timezone, which the validity window is read in. */
		timezone: string;
		/** This row's status, or nothing. `FeeList` works it out; the row only draws it. */
		status: FeeStatus | null;
		/** The conference's slug, for the links out of this row. */
		conferenceSlug: string;
		/** Where the fee stands in the list, counting from 0. The first cannot move up. */
		index: number;
		/** True for the last row, which cannot move down. */
		isLast: boolean;
		/** The list's dragging helper, which the row's drag handle reports to. */
		sortable: SortableList;
		/** While a drop is being saved, so no row can be picked up yet. */
		isSaving: boolean;
		/** Tells the list which fee is moving and which way, so it can show the new order at once. */
		onMoveSend: (move: PendingMove | null) => void;
		/** Tells the list the move has settled, whether it saved or was refused. */
		onMoveSettle: () => void;
		/** May the reader move, change and delete the fee? Without it the row only reads. */
		canEdit: boolean;
	};

	let {
		fee,
		currency,
		timezone,
		status,
		conferenceSlug,
		index,
		isLast,
		sortable,
		isSaving,
		onMoveSend,
		onMoveSettle,
		canEdit
	}: Props = $props();

	// `$derived` works these out again whenever `fee` changes, as it does after a move.
	const appliesTo = $derived(feeAppliesToLabel(fee.appliesTo));
	const validity = $derived(feeValidityLabel(fee, timezone));
	const invoices = $derived(feeInvoiceCountSentence(fee.invoiceCount));
</script>

<!--
	A grid of two columns on a phone, the handle and arrows beside the rest,
	and of the table's six columns from `lg` up, shared with the headings
	above the list (`$lib/fee-list.ts`).
-->
<div
	class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-border py-3 text-dense text-foreground lg:items-center lg:gap-0 lg:py-0 {FEE_COLUMNS_CLASS}"
>
	<!-- The handle belongs to the list's hidden drop form, so it sits outside the arrows' form.
		The empty box keeps the grid's columns for a reader who may not move fees. -->
	<div class="row-span-3 flex items-center gap-1 self-start lg:row-span-1 lg:self-auto">
		{#if canEdit}
			<DragHandle
				{sortable}
				row={{ id: fee.id, index, name: fee.name }}
				hintId={FEE_DROP_HINT_ID}
				form={FEE_DROP_FORM_ID}
				isDisabled={isSaving}
			/>
			<FeeMoveForm
				feeId={fee.id}
				feeName={fee.name}
				isFirst={index === 0}
				{isLast}
				{onMoveSend}
				{onMoveSettle}
			/>
		{/if}
	</div>

	<!-- `min-w-0` lets a long fee name wrap instead of pushing the other columns away. -->
	<div class="min-w-0 lg:p-3">
		<h3 class="font-medium">{fee.name}</h3>
		<p class="text-small text-muted-foreground">{invoices}</p>
		{#if status}
			<StatusDot text={status.label} tone={status.tone} />
		{/if}
	</div>

	<!--
		On a phone these three share one line under the name. `lg:contents`
		makes this box itself disappear from `lg` up, so that each of the three
		takes a column of the table of its own.
	-->
	<div class="col-start-2 flex flex-wrap gap-x-4 lg:contents">
		<p class="lg:p-3">{appliesTo}</p>
		<p class="lg:p-3"><span class="text-muted-foreground lg:hidden">Valid:</span> {validity}</p>
		<p class="lg:p-3 lg:text-right"><Money amountCents={fee.amountCents} {currency} /></p>
	</div>

	<div class="col-start-2 flex items-center gap-1 lg:col-start-auto lg:justify-end lg:px-1">
		{#if canEdit}
			<Button
				label="Edit"
				variant="ghost"
				size="dense-sm"
				href={manageFeeEditUrl(conferenceSlug, fee.id)}
			/>
			<!--
				A form cannot sit inside another form, so the id the action needs is a
				child of `ConfirmButton`, which puts it inside its own form. Its label,
				with the fee's name in it, is what a screen reader says.
			-->
			<ConfirmButton
				label="Delete {fee.name}"
				icon={X}
				confirmTitle="Delete this fee?"
				confirmText="Delegates accepted from now on will not be invoiced for it."
				formaction="?/deleteFee"
				variant="soft-danger"
				size="dense-sm"
			>
				<input type="hidden" name="feeId" value={fee.id} />
			</ConfirmButton>
		{/if}
	</div>
</div>
