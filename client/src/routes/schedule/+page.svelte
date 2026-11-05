<script lang="ts">
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { conferenceListUrl } from '$lib/urls';
</script>

<svelte:head>
	<title>Schedule · MUNMeet</title>
</svelte:head>

<!--
	Only a reader who is part of no conference ever sees this page: everybody
	else is sent on to their conference's schedule by `load` in `+page.server.ts`.
-->
<div class="mx-auto flex max-w-190 flex-col gap-6">
	<PageHeader title="Schedule" />

	<EmptyState
		icon={CalendarDays}
		title="You are not part of a conference yet."
		description="Once you are, its schedule appears here."
		actionLabel="Find a conference"
		actionHref={conferenceListUrl()}
	/>
</div>
