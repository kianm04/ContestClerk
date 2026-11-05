<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ResolvedPathname } from '$app/types';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import { awardBadge, noteCountText, type Award } from '$lib/awards';

	type Props = {
		award: Award;
		/** How many chair notes the award's seat has, the same count the Notes page shows. */
		noteCount: number;
		/** Whether the conference's awards are published. */
		isPublished: boolean;
		/** Whether the reader may reword it: their own proposal, before publishing. */
		canEdit: boolean;
		/** Whether the reader may withdraw it: their own proposal, or they organise. */
		canWithdraw: boolean;
		/** The page with this award open in the form at the top, `?edit=<id>`. */
		editHref: ResolvedPathname;
		/** Where "Withdraw" posts, the `withdraw` action. */
		withdrawAction: string;
		/**
		 * Sends "Withdraw" through the chair's instant form, which takes the
		 * proposal off the list at once (`$lib/chair-form.ts`). Every row shares
		 * the one function; it reads which award to withdraw from the row's own
		 * hidden `awardId` field.
		 */
		onSubmit: SubmitFunction;
	};

	let {
		award,
		noteCount,
		isPublished,
		canEdit,
		canWithdraw,
		editHref,
		withdrawAction,
		onSubmit
	}: Props = $props();

	const badge = $derived(awardBadge(award.status, isPublished));
	// Before publishing, a chair cannot change what an organiser confirmed, so
	// the row says who decided rather than showing buttons that would be refused.
	const isConfirmedByOrganisers = $derived(award.status === 'confirmed' && !isPublished);
</script>

<li class="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
	<div class="flex min-w-0 flex-wrap items-center gap-2">
		<strong class="font-semibold">{award.title}</strong>
		<span aria-hidden="true" class="text-ink-400">·</span>
		{#if award.countryCode}
			<Flag countryCode={award.countryCode} />
		{/if}
		<span>{award.seatName}</span>
		{#if award.holderName}
			<span aria-hidden="true" class="text-ink-400">·</span>
			<span>{award.holderName}</span>
		{/if}
		<span class="text-small text-ink-600">{noteCountText(noteCount)}</span>
	</div>
	<div class="flex flex-wrap items-center gap-2">
		<Badge tone={badge.tone} label={badge.label} />
		{#if isConfirmedByOrganisers}
			<span class="text-small text-ink-600">Confirmed by the organisers</span>
		{/if}
		{#if canEdit}
			<Button label="Edit" variant="secondary" size="sm" href={editHref} />
		{/if}
		{#if canWithdraw}
			<ConfirmButton
				label="Withdraw"
				variant="ghost"
				size="sm"
				confirmTitle="Withdraw this proposal?"
				confirmText="The organisers will no longer see it."
				formaction={withdrawAction}
				{onSubmit}
			>
				<input type="hidden" name="awardId" value={award.id} />
			</ConfirmButton>
		{/if}
	</div>
</li>
