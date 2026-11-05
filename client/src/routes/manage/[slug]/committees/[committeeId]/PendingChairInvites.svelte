<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import {
		chairInvitesAfterPresses,
		describeChairInviteWithdrawalFailure,
		expectChairInviteWithdrawn
	} from '$lib/committee-editor-presses';
	import { DENSE_CONTROL_CLASSES } from '$lib/form-fields';
	import { createInstantForm, type InstantSubmitInput } from '$lib/instant-form.svelte';
	import type { PendingChairInvite } from '$lib/team';
	import { inviteUrl } from '$lib/urls';

	type Props = {
		/** This committee's chair invitations nobody has accepted yet. */
		invites: PendingChairInvite[];
		/** Where this site lives, such as `https://munmeet.app`, for the full link. */
		origin: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { invites, origin }: Props = $props();

	/*
		One instant form for every "Withdraw" (`$lib/instant-form.svelte.ts`): the
		row goes the moment it is pressed, and a refused press brings it back
		with a toast, the same as a chair's "Remove".
	*/
	const withdrawForm = createInstantForm<string>({
		describeFailure: describeChairInviteWithdrawalFailure
	});

	function expectPress(input: InstantSubmitInput): string | null {
		return expectChairInviteWithdrawn(input, invites);
	}

	const submitWithdrawal = withdrawForm.submitExpecting(expectPress);

	/*
		`$derived` works these out again whenever the invitations or the presses
		change: the invitations still waiting, each with its full link.
	*/
	const shownInvites = $derived(chairInvitesAfterPresses(invites, withdrawForm.presses));
	const rows = $derived(
		shownInvites.map((invite) => ({ invite, link: `${origin}${inviteUrl(invite.token)}` }))
	);

	/**
	 * Put one invitation link on the clipboard. `navigator.clipboard` is a
	 * browser API, so this only runs from a click; without JavaScript the box
	 * under the address holds the link to copy by hand.
	 */
	function handleCopyLink(link: string) {
		navigator.clipboard.writeText(link);
	}
</script>

<div class="flex flex-col gap-2">
	<h3 class="text-small font-medium text-foreground">Waiting to accept</h3>

	<ul class="divide-y divide-border">
		<!-- The `(row.invite.id)` key lets Svelte reuse rows instead of rebuilding them. -->
		{#each rows as row (row.invite.id)}
			<li class="flex flex-col gap-2 py-2">
				<div class="flex flex-wrap items-center gap-2">
					<!-- `break-all`: an address is one long word with nowhere to wrap. -->
					<p class="min-w-0 flex-1 basis-40 text-dense break-all">{row.invite.email}</p>

					<Button
						label="Copy link"
						variant="secondary"
						size="dense-sm"
						type="button"
						onclick={() => handleCopyLink(row.link)}
					/>

					<form method="post" action="?/withdrawChairInvite" use:enhance={submitWithdrawal}>
						<input type="hidden" name="inviteId" value={row.invite.id} />
						<Button label="Withdraw" variant="ghost" size="dense-sm" />
					</form>
				</div>

				<!-- A wrapping `<label>` names the box without an `id`, which every
					row would otherwise want the same one of. -->
				<label>
					<span class="sr-only">Invitation link for {row.invite.email}</span>
					<input readonly value={row.link} class={DENSE_CONTROL_CLASSES} />
				</label>
			</li>
		{/each}
	</ul>
</div>
