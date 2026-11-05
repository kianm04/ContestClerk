<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import CheckboxField from '$lib/components/CheckboxField.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import { MINIMUM_PASSWORD_LENGTH, type RegisterFormResult } from '$lib/auth';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { privacyUrl, termsUrl } from '$lib/urls';
	import LogInInstead from './LogInInstead.svelte';

	type Props = {
		/** What came back from the last sign up attempt, or `null` for a fresh form. */
		result: RegisterFormResult | null;
		/** The page the visitor was heading for, carried through the form. */
		next: string;
		/** The address an invite link filled in, or '' when there was none. */
		email: string;
	};

	let { result, next, email }: Props = $props();

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before. A
	// successful sign up moves on to another page, so nothing here has to run
	// for it; a refused one stays on this page, and `clearPassword` below
	// empties the box the way a reload used to, since the field is never told
	// the password that was refused.
	const inPlaceForm = createInPlaceForm({ onSettle: clearPassword });

	function clearPassword(formElement: HTMLFormElement) {
		const passwordField = formElement.querySelector<HTMLInputElement>('input[name="password"]');

		if (passwordField) passwordField.value = '';
	}
</script>

<!--
	No `action` attribute, so this posts to the default action in
	`+page.server.ts`. It is an ordinary HTML form, so creating an account works
	even if the JavaScript never loads.
-->
<form method="post" class="flex flex-col gap-4" use:enhance={inPlaceForm.submit}>
	{#if result}
		<Notice tone={result.message.isSuccess ? 'success' : 'error'}>
			<p>{result.message.text}</p>

			{#if result.offersLogIn}
				<LogInInstead {next} />
			{/if}
		</Notice>
	{/if}

	<!-- The page the visitor was going to. It is checked again on the server. -->
	<input type="hidden" name="next" value={next} />

	<TextField
		label="Full name"
		name="fullName"
		value={result?.fullName ?? ''}
		autocomplete="name"
		isRequired
	/>

	<TextField
		label="Email"
		name="email"
		type="email"
		value={result?.email ?? email}
		autocomplete="email"
		isRequired
	/>

	<!-- The password is never sent back, so this field always starts empty. -->
	<TextField
		label="Password"
		name="password"
		type="password"
		value=""
		autocomplete="new-password"
		minLength={MINIMUM_PASSWORD_LENGTH}
		help="At least {MINIMUM_PASSWORD_LENGTH} characters."
		isRequired
	/>

	<!--
		The box is checked on the server rather than by the browser, so the
		message reads the same with and without JavaScript.
	-->
	<CheckboxField
		label="I agree to the Terms and the Privacy policy."
		name="agree"
		isChecked={false}
	/>

	<!--
		The two documents are linked beside the box rather than inside its label,
		because clicking anything inside a `<label>` ticks the box it belongs to,
		so a link there would agree to the terms on the reader's behalf.
		`target="_blank"` opens them in a new tab, which leaves this half-filled
		form exactly as it was.
	-->
	<p class="-mt-2 text-small text-ink-600">
		Read the
		<a href={termsUrl()} target="_blank" rel="noreferrer" class="text-brand-700 hover:underline">
			Terms
		</a>
		and the
		<a href={privacyUrl()} target="_blank" rel="noreferrer" class="text-brand-700 hover:underline">
			Privacy policy
		</a>.
	</p>

	<Button label="Create account" variant="primary" isFullWidth isLoading={inPlaceForm.isBusy} />
</form>
