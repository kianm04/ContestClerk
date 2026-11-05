<script lang="ts">
	import Clock from '@lucide/svelte/icons/clock';
	import Unlink from '@lucide/svelte/icons/unlink';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { conferenceListUrl } from '$lib/urls';
	import JoinCard from './JoinCard.svelte';
	import type { PageProps } from './$types';

	// `PageProps` comes from `./$types`, which SvelteKit writes for this one
	// folder. `data` is whatever `load` in `+page.server.ts` returned, and it is
	// worked out again whenever the address changes or the action on this page
	// finishes. `form` is what that action gave back when it refused, and is
	// `null` until somebody has pressed the button.
	let { data, form }: PageProps = $props();

	// `$derived` recalculates on its own whenever `data` or `form` changes. What
	// the action found when the button was pressed replaces the reason `load`
	// worked out, because by then the database has had the last word.
	const reason = $derived(form?.message ?? data.reason);
	// The link under that reason comes from the same answer as the reason itself.
	const reasonLink = $derived(form ? form.link : data.reasonLink);
</script>

<svelte:head>
	<!-- A page whose address is a group's own join code has nothing for a link
		card, so it writes its own title rather than using `PageMeta`. -->
	<title>Join a delegation · MUNMeet</title>
</svelte:head>

<!-- One centred card at every width, as `05-pages/delegation/join.md` draws it. -->
<div class="mx-auto w-full max-w-xl py-4 md:py-8">
	<div class="mb-6">
		<PageHeader title="Join a delegation" />
	</div>

	<!--
		Both are asked about because `load` answers with all of them empty for a
		code nobody has, and that is the one case the card cannot be drawn for.
	-->
	{#if data.preview && data.me}
		<JoinCard preview={data.preview} me={data.me} {reason} {reasonLink} joinCode={data.joinCode} />
	{:else if data.isTooManyWrongCodes}
		<!-- Ten wrong codes in an hour: the database will not say whether this one is right yet. -->
		<EmptyState
			icon={Clock}
			title="Too many wrong codes."
			description="Try this link again in an hour."
			actionLabel="Browse conferences"
			actionHref={conferenceListUrl()}
		/>
	{:else}
		<EmptyState
			icon={Unlink}
			title="No delegation found for this link."
			description="Codes are 10 letters and digits; check for typing mistakes."
			actionLabel="Browse conferences"
			actionHref={conferenceListUrl()}
		/>
	{/if}
</div>
