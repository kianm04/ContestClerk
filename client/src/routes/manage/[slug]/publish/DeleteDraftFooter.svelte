<script lang="ts">
	// The word to type before a draft is deleted, the same one `/settings` asks
	// for before an account is deleted.
	import { DELETE_CONFIRMATION_WORD } from '$lib/accounts';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import TextField from '$lib/components/TextField.svelte';

	type Props = {
		/** The conference's name, for the question the dialog asks. */
		conferenceName: string;
		/**
		 * Whether the draft may still be deleted. A draft that has been public
		 * before may not: the database refuses it, so the foot of the page says
		 * so rather than offer a button that would fail.
		 */
		isDeletable: boolean;
		/** Why the last press of "Delete draft" was refused, shown under the box. */
		deleteError: string | null;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { conferenceName, isDeletable, deleteError }: Props = $props();
</script>

<!--
	The way out for a draft nobody needs, at the very foot of the Publish page.
	The box for the word is on the page rather than in the dialog, because a
	dialog only opens with JavaScript, and without it there would be nowhere to
	type the word and the draft could never be deleted.
-->
<footer
	class="mt-12 flex flex-wrap items-end justify-between gap-x-2 gap-y-3 border-t border-border pt-4"
>
	{#if isDeletable}
		<p class="text-small text-muted-foreground">
			Changed your mind? A draft can be deleted; nobody has applied to it.
		</p>

		<ConfirmButton
			label="Delete draft"
			confirmTitle="Delete {conferenceName}?"
			confirmText="This cannot be undone."
			formaction="?/deleteDraft"
			variant="soft-danger"
			size="dense-sm"
		>
			<TextField
				label="Type {DELETE_CONFIRMATION_WORD} to confirm"
				name="confirmation"
				value=""
				error={deleteError}
				isDense
			/>
		</ConfirmButton>
	{:else}
		<p class="text-small text-muted-foreground">
			This draft has been public before, so it cannot be deleted. Publish it again and archive it
			after its last day.
		</p>
	{/if}
</footer>
