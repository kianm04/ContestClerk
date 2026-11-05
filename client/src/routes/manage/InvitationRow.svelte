<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import ActionRow from '$lib/components/manage/ActionRow.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { inviteSentence, type PendingInvite } from '$lib/manage';

	type Props = {
		/** One invitation waiting for the reader, from `list_my_invites()`. */
		invite: PendingInvite;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { invite }: Props = $props();

	// `$derived` writes the sentence again whenever the invitation changes.
	const sentence = $derived(inviteSentence(invite));

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	const inPlaceForm = createInPlaceForm();
</script>

<ActionRow title={sentence}>
	<!--
		An ordinary form posting to the `acceptInvite` action in
		`+page.server.ts`, so an invitation can be accepted with no JavaScript at
		all. The row's id travels in a hidden field because it is not something
		anybody types. It is the id and not the link's secret token: the database
		checks that the reader is the person invited, so the id need not be
		secret, and the token never reaches this page.
	-->
	<form method="post" action="?/acceptInvite" use:enhance={inPlaceForm.submit}>
		<input type="hidden" name="id" value={invite.id} />

		<Button
			label="Accept"
			variant="secondary"
			type="submit"
			size="dense-sm"
			isLoading={inPlaceForm.isBusy}
		/>
	</form>
</ActionRow>
