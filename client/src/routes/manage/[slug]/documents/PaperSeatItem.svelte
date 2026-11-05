<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import { paperStatusLabel } from '$lib/documents';
	import { paperStatusTone, type PaperSeatRow } from '$lib/documents-page';

	type Props = {
		seat: PaperSeatRow;
		isSelected: boolean;
		/** Called when the tick box changes, with the paper and whether it is ticked. */
		onSelect: (documentId: string, isSelected: boolean) => void;
		/** Where this paper's Approve button posts, or `null` when there is no paper. */
		approveAction: string | null;
		/** The address that opens "Request changes" for this paper, or `null`. */
		reviewHref: ResolvedPathname | null;
		/** The reading page of a paper written on MUNMeet (T146), or `null` for an upload. */
		readHref: ResolvedPathname | null;
	};

	let { seat, isSelected, onSelect, approveAction, reviewHref, readHref }: Props = $props();

	// `$derived` works these out again whenever the seat changes.
	const delegateName = $derived(seat.delegateName ?? 'Delegate');
	const canApprove = $derived(seat.paper !== null && seat.status !== 'approved');
	const canRequestChanges = $derived(seat.paper !== null && seat.status !== 'changes_requested');

	function handleSelectChange(event: Event & { currentTarget: HTMLInputElement }) {
		if (seat.paper) {
			onSelect(seat.paper.id, event.currentTarget.checked);
		}
	}
</script>

<!-- On a phone the row stacks; from `md` up it is one line. -->
<div class="px-1 py-3 text-dense">
	<div class="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
		<div class="flex min-w-0 flex-1 items-center gap-3">
			<!--
			A bare box rather than `CheckboxField`, which gives every box the same
			`field-<name>` id. Only a paper that is not approved yet can be ticked.
		-->
			{#if canApprove && seat.paper}
				<input
					type="checkbox"
					name="ids"
					value={seat.paper.id}
					checked={isSelected}
					onchange={handleSelectChange}
					aria-label="Select the paper of {delegateName}"
					class="h-5 w-5 shrink-0 rounded border-border text-link"
				/>
			{/if}
			<Avatar name={delegateName} imagePath={seat.delegateAvatarPath} size="sm" />
			<div class="min-w-0">
				<p class="font-medium text-foreground">{delegateName}</p>
				<p class="text-small text-muted-foreground">{seat.seatName}</p>
			</div>
		</div>

		<div class="md:w-40">
			<StatusDot tone={paperStatusTone(seat.status)} text={paperStatusLabel(seat.status)} />
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<!-- A one-minute Storage address; `BackgroundGuidePanel.svelte` explains the rule switched off. -->
			{#if seat.paper?.downloadUrl}
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={seat.paper.downloadUrl}
					target="_blank"
					rel="noreferrer"
					title="Link valid for one minute"
					class="text-link hover:underline"
				>
					Open
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{:else if readHref}
				<a href={readHref} class="text-link hover:underline">
					Read the paper<span class="sr-only"> of {seat.seatName}</span>
				</a>
			{/if}
			{#if canApprove && approveAction}
				<Button label="Approve" variant="secondary" size="dense-sm" formaction={approveAction} />
			{/if}
			{#if canRequestChanges && reviewHref}
				<a href={reviewHref} class="text-link hover:underline">Request changes</a>
			{/if}
		</div>
	</div>
</div>
