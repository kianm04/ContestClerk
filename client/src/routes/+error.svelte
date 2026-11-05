<script lang="ts">
	// `page` from `$app/state` holds the error SvelteKit is showing: its status
	// code and the object in `page.error`. It updates on its own when another
	// error, or a real page, takes this one's place.
	import { page } from '$app/state';
	import Button from '$lib/components/Button.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { landingUrl } from '$lib/urls';

	/*
		SvelteKit draws this file in place of a page whenever a `load` function or
		an action throws: a deliberate `error(404, 'This committee does not exist.')`,
		an address that matches no route, or an error nobody planned for. The words
		are never written here. A deliberate error brings its own, and for an
		unplanned one `handleError` in `src/hooks.server.ts`, or in
		`src/hooks.client.ts` when the `load` ran in the browser, has already swapped
		the real error for "Something went wrong on our side. Please try again.",
		so a database message can never reach the screen.

		`page.error` is only null while no error is being shown, which cannot be
		the case on this page; the fallback keeps the type check honest.
	*/
	const message = $derived(page.error?.message ?? '');
</script>

<svelte:head>
	<title>Error {page.status} · MUNMeet</title>
</svelte:head>

<div class="mb-6">
	<PageHeader title={message} eyebrow="Error {page.status}" />
</div>

<!--
	The landing page sends a signed-in reader on to `/home`, so one address
	gets both a visitor and a signed-in reader back somewhere useful.
-->
<Button label="Go to the home page" variant="primary" href={landingUrl()} />
