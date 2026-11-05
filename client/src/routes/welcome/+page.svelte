<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import PageMeta from '$lib/components/shell/PageMeta.svelte';
	import { firstName } from '$lib/profiles';
	import WelcomeForm from './WelcomeForm.svelte';
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned. `form` is what the
	// action returned after a failed submit, and is `null` until then.
	let { data, form }: PageProps = $props();

	// After a failed submit the form shows what was posted rather than what was
	// loaded, so that nothing anybody typed is lost. `$derived` works both of
	// these out again after every submit.
	const values = $derived(form?.values ?? data.values);
	const errors = $derived(form?.errors ?? {});

	const greeting = $derived(firstName(values.fullName));
</script>

<PageMeta title="Welcome" description="A few details so applying to a conference takes a minute." />

<div class="mx-auto max-w-lg">
	<Card>
		<h1 class="font-display text-h1-mobile text-brand-900 md:text-h1">
			{greeting ? `Welcome, ${greeting}.` : 'Welcome.'}
		</h1>

		<p class="mt-1 text-body text-ink-600">A few details so applying takes a minute.</p>

		<div class="mt-4">
			<Notice tone="info">
				Organisers see your name, institution, country and experience on an application. Everything
				under "Details organisers may need" is shown only to the organisers of conferences you take
				part in, and to the head of a school delegation you join.
			</Notice>
		</div>

		<div class="mt-6">
			<WelcomeForm {values} {errors} next={data.next} />
		</div>
	</Card>
</div>
