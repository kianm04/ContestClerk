<script lang="ts">
	import AuthCard from '$lib/components/AuthCard.svelte';
	import Button from '$lib/components/Button.svelte';
	import PageMeta from '$lib/components/shell/PageMeta.svelte';
	import { landingUrl } from '$lib/urls';
	import ConfirmationForm from './ConfirmationForm.svelte';
	import type { PageProps } from './$types';

	/*
		`form` is whatever the action in `+page.server.ts` returned for the post
		that opened this page. A plain visit, with no post, leaves it `null`, and
		so does an address the action could not read a question out of.
	*/
	let { form }: PageProps = $props();
</script>

{#if form?.question}
	<PageMeta title={form.question.title} description={form.question.text} />

	<ConfirmationForm question={form.question} fields={form.fields} />
{:else}
	<PageMeta title="Nothing to confirm" description="There is no question waiting here." />

	<AuthCard title="Nothing to confirm">
		<p class="text-body text-ink-600">
			This page asks before a button does something that cannot be undone, and nothing is waiting
			for an answer.
		</p>

		<div class="mt-6">
			<Button label="Go to the home page" variant="secondary" href={landingUrl()} />
		</div>
	</AuthCard>
{/if}
