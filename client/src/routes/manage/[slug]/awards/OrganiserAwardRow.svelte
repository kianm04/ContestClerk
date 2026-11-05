<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import Dropdown from '$lib/components/Dropdown.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import { awardBadge, type Award } from '$lib/awards';
	import { organiserAwardMenu } from '$lib/organiser-award-menu';
	import { manageAwardTitleActionUrl, manageAwardsUrl } from '$lib/urls';
	import AwardTitleForm from './AwardTitleForm.svelte';

	type Props = {
		award: Award;
		/** Whether the conference's awards are published. Only Unpublish works then. */
		isPublished: boolean;
		/** Whether the reader may rename it: a custom award they added, before publishing. */
		canRename: boolean;
		/** Whether this row's "Edit title" form is open, `?edit=<this award's id>`. */
		isRenaming: boolean;
		/** A title a refused rename sent back, or null to start from the current one. */
		refusedTitle: string | null;
		/** Why the last rename was refused, or null. */
		titleError: string | null;
		/** The conference's slug, for the page's own links. */
		slug: string;
		/**
		 * Sends "Confirm", "Unconfirm" and "Delete" through the page's one instant
		 * form, which changes this row the moment it is pressed (T142).
		 */
		onPress: SubmitFunction;
	};

	let {
		award,
		isPublished,
		canRename,
		isRenaming,
		refusedTitle,
		titleError,
		slug,
		onPress
	}: Props = $props();

	const badge = $derived(awardBadge(award.status, isPublished));
	// A proposal whose seat was freed since cannot be confirmed: nobody would get it.
	const isConfirmShown = $derived(
		!isPublished && award.status === 'proposed' && !award.isSeatEmpty
	);
	// "Unconfirm" and "Edit title", whichever apply; none once published.
	const menuItems = $derived(
		organiserAwardMenu(award, { slug, isPublished, canRename, isRenaming })
	);
</script>

<li class="flex flex-col gap-3 border-b border-border px-1 py-2">
	<div class="flex min-h-9 flex-col gap-2 md:flex-row md:items-center md:justify-between">
		<!-- The award, then who holds the seat and which seat it is. -->
		<div class="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 text-dense text-foreground">
			<span class="font-medium md:w-50 md:shrink-0">{award.title}</span>
			<span class="inline-flex flex-wrap items-center gap-2">
				{#if award.countryCode}
					<Flag countryCode={award.countryCode} />
				{/if}
				{#if award.holderName && !award.isSeatEmpty}
					<span
						>{award.holderName} <span class="text-muted-foreground">· {award.seatName}</span></span
					>
				{:else}
					<span>{award.seatName}</span>
				{/if}
				{#if award.isSeatEmpty}
					<StatusDot tone="danger" text="Seat empty" />
				{/if}
			</span>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<span class="text-small text-muted-foreground"
				>proposed by {award.proposerName ?? 'a chair'}</span
			>
			{#if isConfirmShown}
				<!-- `use:enhance` hands the press to the page's instant form; without
					JavaScript the form posts and reloads the page as before. -->
				<form method="post" action="?/confirm" use:enhance={onPress}>
					<input type="hidden" name="awardId" value={award.id} />
					<Button label="Confirm" variant="secondary" size="dense-sm" />
				</form>
			{:else}
				<StatusDot tone={badge.tone} text={badge.label} />
			{/if}
			{#if menuItems.length > 0}
				<Dropdown
					label="Actions for {award.title}"
					icon={EllipsisVertical}
					items={menuItems}
					onSubmit={onPress}
					isQuiet
				/>
			{/if}
			{#if !isPublished}
				<!-- A grey bin that turns red under the pointer; "Delete" is its name. -->
				<ConfirmButton
					label="Delete"
					variant="quiet-danger"
					size="dense-sm"
					icon={Trash2}
					confirmTitle="Delete this award?"
					confirmText="The chair's proposal is removed as well."
					formaction="?/delete"
					areFieldsInDialog
					onSubmit={onPress}
				>
					<input type="hidden" name="awardId" value={award.id} />
				</ConfirmButton>
			{/if}
		</div>
	</div>
	{#if isRenaming}
		<AwardTitleForm
			awardId={award.id}
			title={refusedTitle ?? award.title}
			error={titleError}
			action={manageAwardTitleActionUrl(slug, award.id)}
			cancelHref={manageAwardsUrl(slug)}
		/>
	{/if}
</li>
