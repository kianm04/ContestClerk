<script lang="ts">
	import AuthCard from '$lib/components/AuthCard.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import PageMeta from '$lib/components/shell/PageMeta.svelte';
	import { registerUrl } from '$lib/urls';
	import Login from './Login.svelte';
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned. `form` is what the
	// action returned after a submit, and is `null` until the visitor submits.
	let { data, form }: PageProps = $props();
</script>

<PageMeta title="Log in" description="Sign in to your MUNMeet account." />

<AuthCard title="Welcome back." subtitle="Log in to apply, organise and take part.">
	{#if data.hasConfirmedEmail}
		<div class="mb-4">
			<Notice tone="success">Your email is confirmed. Log in to continue.</Notice>
		</div>
	{/if}

	<Login result={form} next={data.next} />

	<hr class="my-6 border-line" />

	<!--
		Creating an account happens on its own page, so this is only a link there.
		`registerUrl` carries `next` along, so the visitor still reaches the page
		they were heading for.
	-->
	<p class="text-small text-ink-600">
		New here?
		<a href={registerUrl(data.next)} class="text-brand-700 hover:underline">Create an account</a>
	</p>
</AuthCard>
