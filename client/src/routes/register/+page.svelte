<script lang="ts">
	import AuthCard from '$lib/components/AuthCard.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import PageMeta from '$lib/components/shell/PageMeta.svelte';
	import { loginUrl } from '$lib/urls';
	import LogInInstead from './LogInInstead.svelte';
	import Register from './Register.svelte';
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned. `form` is what the
	// action returned after a submit, and is `null` until the visitor submits.
	let { data, form }: PageProps = $props();

	// The account exists and the confirmation email is on its way, so the form
	// has nothing left to do. `$derived` works this out again after every submit.
	const isWaitingForEmail = $derived(form?.message.isSuccess === true);
</script>

<PageMeta title="Create an account" description="One MUNMeet account for every conference." />

<AuthCard title="Create your account." subtitle="One account for every conference.">
	{#if isWaitingForEmail && form}
		<Notice tone="success">
			<p>{form.message.text}</p>

			{#if form.offersLogIn}
				<LogInInstead next={data.next} />
			{/if}
		</Notice>

		<p class="mt-3 text-small text-ink-600">
			Did not get it? Check spam, or try again in a minute.
		</p>
	{:else}
		<Register result={form} next={data.next} email={data.email} />

		<hr class="my-6 border-line" />

		<p class="text-small text-ink-600">
			Already have an account?
			<a href={loginUrl(data.next)} class="text-brand-700 hover:underline">Log in →</a>
		</p>
	{/if}
</AuthCard>
