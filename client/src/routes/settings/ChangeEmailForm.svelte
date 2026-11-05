<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { SettingsMessage } from '$lib/accounts';
	import Button from '$lib/components/Button.svelte';
	import FormActions from '$lib/components/FormActions.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** The address the account has now. */
		currentEmail: string;
		/** An address asked for but not confirmed yet, or nothing. */
		pendingEmail: string | null;
		/** What was typed, so a failed submit keeps it. */
		typedEmail: string;
		/** What the last submit had to say about this card, if anything. */
		message: SettingsMessage | null;
	};

	let { currentEmail, pendingEmail, typedEmail, message }: Props = $props();

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	// This edits an existing address rather than adding something new, so it
	// does not ask for `isResetAfterSave`: `typedEmail` above already keeps
	// whatever was last typed, saved or refused.
	const inPlaceForm = createInPlaceForm();
</script>

<!-- The card around this form, a `Section` on the settings page, carries its "Email" heading. -->
<p class="text-body text-ink-600">Current: {currentEmail}</p>

{#if pendingEmail}
	<!--
		Supabase keeps a new address to one side until the link it emailed is
		opened, so this line is the only sign that anything is in progress.
	-->
	<p class="mt-1 text-small text-ink-600">Waiting for confirmation of {pendingEmail}</p>
{/if}

{#if message}
	<div class="mt-4">
		<Notice tone={message.tone}>{message.text}</Notice>
	</div>
{/if}

<!--
	A real form posting to the `changeEmail` action in `+page.server.ts`, so
	changing an address works with JavaScript switched off.
-->
<form method="post" action="?/changeEmail" class="mt-4" use:enhance={inPlaceForm.submit}>
	<TextField
		label="New email"
		name="email"
		type="email"
		value={typedEmail}
		autocomplete="email"
		help="We send a link to the new address. Nothing changes until you open it."
	/>

	<FormActions>
		<Button label="Change email" variant="primary" isLoading={inPlaceForm.isBusy} />
	</FormActions>
</form>
