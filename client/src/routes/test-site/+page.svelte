<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import Button from '$lib/components/Button.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import PageMeta from '$lib/components/shell/PageMeta.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import { formatWeekdayAndTime } from '$lib/dates';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import type { PageProps } from './$types';

	/** Every Northbridge conference, and the guide's times, are on UK time. */
	const TEST_SITE_TIMEZONE = 'Europe/London';

	// `data` is whatever `load` in `+page.server.ts` returned: when the last reset
	// finished, and when the one under way was asked for. `form` is what the action
	// returned, or `null` before anybody has pressed the button.
	let { data, form }: PageProps = $props();

	// Sends the form in the background, then runs `load` again, so the page swaps the
	// form for "A reset was asked for at …" without a reload. Without JavaScript the
	// form posts and the page reloads with the same result.
	const inPlaceForm = createInPlaceForm();

	const lastReset = $derived(
		data.lastResetAt ? formatWeekdayAndTime(data.lastResetAt, TEST_SITE_TIMEZONE) : null
	);
	const resetRequested = $derived(
		data.resetRequestedAt ? formatWeekdayAndTime(data.resetRequestedAt, TEST_SITE_TIMEZONE) : null
	);
</script>

<PageMeta
	title="Reset the test site"
	description="Delete everything on the test site and load the test data again."
/>

<AuthCard title="Reset the test site." subtitle="Delete everything and load the test data again.">
	<div class="flex flex-col gap-4 text-body">
		<p>
			{#if lastReset}
				Last reset {lastReset} UK time.
			{:else}
				No reset has been recorded yet.
			{/if}
			It also resets by itself every night at 4am UK time.
		</p>

		{#if resetRequested}
			<Notice tone="info">
				A reset was asked for {resetRequested}. It takes about two minutes. Then the site holds
				fresh test data and everybody is signed out.
			</Notice>
		{:else}
			<!-- No `action` attribute, so this posts to the default action in `+page.server.ts`. -->
			<form method="post" class="flex flex-col gap-4" use:enhance={inPlaceForm.submit}>
				{#if form?.error}
					<Notice tone="error">{form.error}</Notice>
				{/if}

				<p>
					This deletes everything anybody has changed or made here, accounts included, and signs
					everybody out. It cannot be undone.
				</p>

				<TextField
					label="Reset code"
					name="code"
					type="password"
					value=""
					autocomplete="off"
					help="Ask Kian for it."
					isRequired
				/>

				<Button
					label="Reset the test site"
					variant="danger"
					isFullWidth
					isLoading={inPlaceForm.isBusy}
				/>
			</form>
		{/if}
	</div>
</AuthCard>
