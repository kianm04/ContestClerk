<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import type { Conference } from '$lib/conferences';
	import { formatDayAndTime } from '$lib/dates';
	import { manageApplicationFormUrl } from '$lib/urls';

	type Props = {
		conference: Conference;
	};

	let { conference }: Props = $props();

	// `$derived` works this out again whenever the conference changes. The
	// deadline is shown in the conference's own timezone, the one delegates see.
	const deadlineText = $derived(
		conference.positionPaperDeadline
			? `Deadline ${formatDayAndTime(conference.positionPaperDeadline, conference.timezone)}`
			: 'No deadline set'
	);
</script>

<!--
	The deadline and whether papers are required are set with the application
	form, which is why "Change" goes there.
-->
{#if conference.positionPaperRequired}
	<Notice tone="warning">
		{deadlineText} · required.
		<a href={manageApplicationFormUrl(conference.slug)} class="text-brand-700 underline">Change</a>
	</Notice>
{:else}
	<Notice tone="info">
		Position papers are optional for this conference.
		<a href={manageApplicationFormUrl(conference.slug)} class="text-brand-700 underline">Change</a>
	</Notice>
{/if}
