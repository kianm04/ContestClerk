<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import Button from '$lib/components/Button.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned: the heading and
	// the button's words for this kind of link.
	let { data }: PageProps = $props();

	// The heading ends in a full stop, the way every auth page's does; the
	// browser tab does not. `$derived` works it out again if the data changes.
	const tabTitle = $derived(data.title.replace(/\.$/, ''));

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	// The action always redirects elsewhere, so the helper follows it as a
	// normal navigation.
	const inPlaceForm = createInPlaceForm();
</script>

<!--
	Only somebody who opened a link from one of our emails reaches this page, so
	it needs no `og:` tags for a shared link, only a name in the browser tab.
-->
<svelte:head>
	<title>{tabTitle} · MUNMeet</title>
</svelte:head>

<!--
	One heading and one button. Opening the link did nothing yet; pressing the
	button is what confirms the address or starts the password reset
	(`+page.server.ts` says why). The form has no `action` attribute, so it
	posts to the default action at this same address, token and all.
-->
<AuthCard title={data.title}>
	<form method="post" use:enhance={inPlaceForm.submit}>
		<Button label={data.buttonLabel} variant="primary" isFullWidth isLoading={inPlaceForm.isBusy} />
	</form>
</AuthCard>
