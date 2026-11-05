<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { SettingsMessage } from '$lib/accounts';
	import Button from '$lib/components/Button.svelte';
	import FormActions from '$lib/components/FormActions.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import TextField from '$lib/components/TextField.svelte';

	type Props = {
		/** What the last submit had to say about this card, if anything. */
		message: SettingsMessage | null;
	};

	let { message }: Props = $props();

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	// This card stays on the page whether the change is saved or refused, and
	// every field here holds nothing but a password, so `clearPasswords` empties
	// them either way, the way a reload used to.
	const inPlaceForm = createInPlaceForm({ onSettle: clearPasswords });

	function clearPasswords(formElement: HTMLFormElement) {
		formElement.reset();
	}
</script>

<!-- The card around this form, a `Section` on the settings page, carries its "Password" heading. -->
{#if message}
	<div class="mb-4">
		<Notice tone={message.tone}>{message.text}</Notice>
	</div>
{/if}

<!--
	A real form posting to the `changePassword` action in `+page.server.ts`.

	Every field starts empty and stays empty: a password is never sent back to a
	screen, so a failed submit is retyped rather than corrected. The new password
	field carries no `minlength`, so that the server's own wording is what a
	person sees whether or not JavaScript is running, which is the same choice
	`/reset-password` makes.
-->
<form
	method="post"
	action="?/changePassword"
	class="flex flex-col gap-4"
	use:enhance={inPlaceForm.submit}
>
	<TextField
		label="Current password"
		name="currentPassword"
		type="password"
		value=""
		autocomplete="current-password"
	/>

	<TextField
		label="New password"
		name="newPassword"
		type="password"
		value=""
		autocomplete="new-password"
		help="At least 8 characters."
	/>

	<TextField
		label="Repeat new password"
		name="repeatPassword"
		type="password"
		value=""
		autocomplete="new-password"
	/>

	<FormActions>
		<Button label="Change password" variant="primary" isLoading={inPlaceForm.isBusy} />
	</FormActions>
</form>
