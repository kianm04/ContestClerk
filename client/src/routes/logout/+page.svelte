<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { signedInHomeUrl } from '$lib/urls';
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned, so it holds the
	// name, picture and address of whoever is logged in right now.
	let { data }: PageProps = $props();

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	// The action always redirects elsewhere, so the helper follows it as a
	// normal navigation.
	const inPlaceForm = createInPlaceForm();
</script>

<!--
	Only somebody already signed in reaches this page, so it needs no `og:` tags
	for a shared link, only a name in the browser tab.
-->
<svelte:head>
	<title>Log out · MUNMeet</title>
</svelte:head>

<AuthCard title="Log out of MUNMeet?">
	<div class="flex items-center gap-3">
		<Avatar name={data.fullName} imagePath={data.avatarPath} size="md" />

		<p class="text-body text-ink-600">
			Signed in as {data.fullName} ({data.email})
		</p>
	</div>

	<!--
		An ordinary HTML form with no `action` attribute, so it posts to the
		default action in `+page.server.ts`. Logging out therefore works even if
		the JavaScript never loads.
	-->
	<form method="post" class="mt-6 flex flex-wrap gap-3" use:enhance={inPlaceForm.submit}>
		<Button label="Log out" variant="danger" isLoading={inPlaceForm.isBusy} />

		<!--
			A link rather than a second submit button, because cancelling only
			takes the visitor somewhere else and changes nothing.
		-->
		<Button label="Cancel" variant="secondary" href={signedInHomeUrl()} />
	</form>
</AuthCard>
