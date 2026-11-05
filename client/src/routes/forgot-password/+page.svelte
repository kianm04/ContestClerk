<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import Button from '$lib/components/Button.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import PageMeta from '$lib/components/shell/PageMeta.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { loginUrl } from '$lib/urls';
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned. `form` is what the
	// action returned, or `null` before the visitor has submitted anything.
	let { data, form }: PageProps = $props();

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	// This page has no password field, and the email field already keeps
	// whatever was typed through the `form?.email` prop above, so nothing
	// beyond the usual busy state is needed here.
	const inPlaceForm = createInPlaceForm();
</script>

<PageMeta title="Reset your password" description="Ask for a link to choose a new password." />

<AuthCard title="Reset your password." subtitle="We will email you a link.">
	<!-- No `action` attribute, so this posts to the default action in `+page.server.ts`. -->
	<form method="post" class="flex flex-col gap-4" use:enhance={inPlaceForm.submit}>
		{#if form}
			<Notice tone={form.message.isSuccess ? 'success' : 'error'}>{form.message.text}</Notice>
		{/if}

		<TextField
			label="Email"
			name="email"
			type="email"
			value={form?.email ?? ''}
			autocomplete="email"
			isRequired
		/>

		<Button label="Send reset link" variant="primary" isFullWidth isLoading={inPlaceForm.isBusy} />
	</form>

	<p class="mt-6 text-small">
		<a href={loginUrl(data.next)} class="text-brand-700 hover:underline">Back to log in</a>
	</p>
</AuthCard>
