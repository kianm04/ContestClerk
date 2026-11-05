<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Copy from '@lucide/svelte/icons/copy';
	import Button from '$lib/components/Button.svelte';
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import type { InPlaceForm } from '$lib/in-place-form.svelte';
	import type { PendingStaffInvite } from '$lib/team';

	type Props = {
		invite: PendingStaffInvite;
		isExpired: boolean;
		/** Whether "Send again" and "Revoke" are offered: not for a role at or above the reader's. */
		mayChange: boolean;
		/** "Chair · UNSC · expires 14 Oct 2026", from `pendingInviteDetailLine`. */
		detail: string;
		/** The full invitation link, worked out by the parent. */
		link: string;
		/** Called when "Copy link" is pressed, since `navigator.clipboard` only runs in the browser. */
		onCopyLink: (link: string) => void;
		/** Shared with every other row, since only one "Send again" form can be mid-submit at a time. */
		resendForm: InPlaceForm;
		/** Sends "Revoke" through the list's instant form (`PendingInvites`), which shows the result at once. */
		onRevoke: SubmitFunction;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { invite, isExpired, mayChange, detail, link, onCopyLink, resendForm, onRevoke }: Props =
		$props();

	/*
		The link box is drawn as small as the buttons beside it. It is not a
		`TextField`, which would give it a visible label and the height of a form
		field; this box is a place to select the link from, not something to fill in.
	*/
	const LINK_BOX_CLASSES =
		'block min-h-11 w-full rounded-control border border-border bg-background px-3 text-small text-muted-foreground lg:min-h-8';
</script>

<li
	class="flex min-h-13 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-1 py-2 text-dense"
>
	<div class="min-w-0 flex-1 basis-48">
		<!-- `break-all` because an email address is one long word with
			nowhere to wrap, and without it the row is wider than a phone. -->
		<p class="font-medium break-all text-foreground">{invite.email}</p>
		<p class="text-small text-muted-foreground">{detail}</p>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		{#if isExpired}
			<StatusDot text="Expired" tone="warning" />
		{/if}

		<!-- A wrapping `<label>` names the box without an `id`, which matters
			here because every row would otherwise want the same one. -->
		<label class="w-full sm:w-56">
			<span class="sr-only">Invitation link for {invite.email}</span>
			<input readonly value={link} class={LINK_BOX_CLASSES} />
		</label>

		<Button
			label="Copy link"
			variant="secondary"
			size="dense-sm"
			type="button"
			icon={Copy}
			onclick={() => onCopyLink(link)}
		/>

		<!-- Two small forms rather than one, because a `<form>` cannot sit
			inside another and each button posts to its own action. -->
		{#if isExpired && mayChange}
			<form method="post" action="?/resendInvite" use:enhance={resendForm.submit}>
				<input type="hidden" name="inviteId" value={invite.id} />
				<Button
					label="Send again"
					variant="secondary"
					size="dense-sm"
					isLoading={resendForm.isBusy}
				/>
			</form>
		{/if}

		{#if mayChange}
			<form method="post" action="?/revokeInvite" use:enhance={onRevoke}>
				<input type="hidden" name="inviteId" value={invite.id} />
				<Button label="Revoke" variant="ghost" size="dense-sm" />
			</form>
		{/if}
	</div>
</li>
