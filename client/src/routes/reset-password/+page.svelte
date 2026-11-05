<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import Button from '$lib/components/Button.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import { MINIMUM_PASSWORD_LENGTH } from '$lib/auth';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned. `form` is what the
	// action returned, or `null` before the visitor has submitted anything.
	let { data, form }: PageProps = $props();

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	// Both fields hold nothing but a password, and a password is never shown
	// again once typed, so `clearPasswords` below empties them the moment the
	// server answers, saved or refused, the way a reload used to.
	const inPlaceForm = createInPlaceForm({ onSettle: clearPasswords });

	function clearPasswords(formElement: HTMLFormElement) {
		formElement.reset();
	}
</script>

<!--
	Only somebody who followed the link in a reset email reaches this page, so it
	needs no `og:` tags for a shared link, only a name in the browser tab.
-->
<svelte:head>
	<title>Choose a new password · MUNMeet</title>
</svelte:head>

<AuthCard title="Choose a new password." subtitle="for {data.email}">
	<!--
		The password fields carry no `minlength`, unlike the one on `/register`.
		`05-pages/auth/reset-password.md` asks for the server's own
		"Please use at least 8 characters." to be seen, and a browser that stops
		the form itself never lets the page ask.
	-->
	<form method="post" class="flex flex-col gap-4" use:enhance={inPlaceForm.submit}>
		{#if form}
			<Notice tone="error">{form.message.text}</Notice>
		{/if}

		<!-- Both fields always start empty: a password is never sent back. -->
		<TextField
			label="New password"
			name="password"
			type="password"
			value=""
			autocomplete="new-password"
			help="At least {MINIMUM_PASSWORD_LENGTH} characters."
			isRequired
		/>

		<TextField
			label="Confirm password"
			name="confirmPassword"
			type="password"
			value=""
			autocomplete="new-password"
			isRequired
		/>

		<Button label="Save password" variant="primary" isFullWidth isLoading={inPlaceForm.isBusy} />
	</form>
</AuthCard>
