<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import DelegationForm from './DelegationForm.svelte';
	import type { PageProps } from './$types';

	// `PageProps` comes from `./$types`, which SvelteKit writes for this folder.
	// `data` is whatever `load` in `+page.server.ts` returned, and `load` runs
	// again after every post to this page. `form` is what the last post
	// answered with, and it is `null` until one fails: a post that works
	// redirects to the new delegation instead of answering.
	let { data, form }: PageProps = $props();

	// `$derived` works both of these out again after every submit. A refused
	// post sends back everything that was typed, so nothing is lost; otherwise
	// the form shows what `load` read from the profile.
	const values = $derived(form?.values ?? data.values);
	const errors = $derived(form?.errors ?? {});
</script>

<svelte:head>
	<!-- A private page has nothing to share, so it writes its own title rather
		than using `PageMeta`, which asks for a description for the link card. -->
	<title>Register a delegation · {data.conference.name} · MUNMeet</title>
</svelte:head>

<!-- One column at every width, which is what `05-pages/delegation/new.md`
	draws: there is nothing beside the form to put in a second one. -->
<div class="mx-auto max-w-[640px]">
	<div class="mb-6">
		<PageHeader
			eyebrow={data.conference.name}
			title="Register a delegation"
			subtitle="Bring your school or club as a group."
		/>
	</div>

	<Card>
		<DelegationForm {values} {errors} submitLabel="Create delegation" asksConsent />
	</Card>
</div>
