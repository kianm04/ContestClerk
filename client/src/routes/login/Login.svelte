<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { forgotPasswordUrl } from '$lib/urls';
	import type { AuthFormResult } from '$lib/auth';

	type Props = {
		/** What came back from the last sign in attempt, or `null` for a fresh form. */
		result: AuthFormResult | null;
		/** The page the visitor was heading for, carried through the form. */
		next: string;
	};

	let { result, next }: Props = $props();

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before. A
	// correct password moves on to another page, so nothing here has to run for
	// it; a refused one stays on this page, and `clearPassword` below empties
	// the box the way a reload used to, since the field is never told the
	// password that was refused.
	const inPlaceForm = createInPlaceForm({ onSettle: clearPassword });

	function clearPassword(formElement: HTMLFormElement) {
		const passwordField = formElement.querySelector<HTMLInputElement>('input[name="password"]');

		if (passwordField) passwordField.value = '';
	}
</script>

<!--
	No `action` attribute, so this posts to the default action in
	`+page.server.ts`. It is an ordinary HTML form, so logging in works even if
	the JavaScript never loads.
-->
<form method="post" class="flex flex-col gap-4" use:enhance={inPlaceForm.submit}>
	{#if result}
		<Notice tone={result.message.isSuccess ? 'success' : 'error'}>{result.message.text}</Notice>
	{/if}

	<!--
		The page the visitor was going to, travelling with the form so that a
		failed attempt does not lose it. It is checked again on the server.
	-->
	<input type="hidden" name="next" value={next} />

	<TextField
		label="Email"
		name="email"
		type="email"
		value={result?.email ?? ''}
		autocomplete="email"
		isRequired
	/>

	<!-- The password is never sent back, so this field always starts empty. -->
	<TextField
		label="Password"
		name="password"
		type="password"
		value=""
		autocomplete="current-password"
		isRequired
	/>

	<p class="text-small">
		<a href={forgotPasswordUrl(next)} class="text-brand-700 hover:underline">
			Forgot your password?
		</a>
	</p>

	<Button label="Log in" variant="primary" isFullWidth isLoading={inPlaceForm.isBusy} />
</form>
