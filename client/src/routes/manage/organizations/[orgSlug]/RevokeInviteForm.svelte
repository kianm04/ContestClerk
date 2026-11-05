<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';

	type Props = {
		/** The invitation this button revokes. */
		inviteId: string;
		/**
		 * The members table's instant form, which takes the invitation off the
		 * list the moment "Revoke" is pressed (T142).
		 */
		onSubmit: SubmitFunction;
	};

	let { inviteId, onSubmit }: Props = $props();
</script>

<!-- `use:enhance` hands the form to the instant form; without JavaScript it posts as usual. -->
<form method="post" action="?/revokeInvite" use:enhance={onSubmit}>
	<input type="hidden" name="inviteId" value={inviteId} />
	<Button label="Revoke" variant="ghost" size="sm" />
</form>
