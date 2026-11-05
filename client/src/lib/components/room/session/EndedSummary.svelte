<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import type { EndedSummaryView } from '$lib/room-ended';
	import { ROOM_SCREEN_CLASSES, ROOM_TITLE_CLASSES } from '$lib/room-screen-classes';
	import StartSessionForm from './StartSessionForm.svelte';
	import TextLink from './TextLink.svelte';

	type Props = {
		/** What the ended screen shows, worked out by `endedSummaryView` in `$lib/room-ended.ts`. */
		view: EndedSummaryView;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { view }: Props = $props();

	// `$derived` works these out again whenever `view` changes.
	const isStartPrimary = $derived(view.primary === 'start');
	const isAwardsPrimary = $derived(view.primary === 'awards' && view.awardsHref !== null);
</script>

<!--
	The live room once the session has ended, for the rest of that day
	(`committee-room.md`, "Ended"): "{session} has ended" as the page's
	heading, its length and record in one line, then the next step as the one
	filled button with the session's record and notes as plain links beside it
	(a quick session's record and "Edit delegations").
	The heading takes the focus once "End session" brings this screen in
	(`tabindex="-1"` lets a script focus it without adding it to the Tab order).
-->
<section aria-labelledby="ended-heading" class={ROOM_SCREEN_CLASSES}>
	<div>
		<h1 id="ended-heading" tabindex="-1" class={ROOM_TITLE_CLASSES}>{view.title}</h1>
		{#if view.summaryLine}
			<p class="mt-2 text-ink-600 tabular-nums">{view.summaryLine}</p>
		{/if}
	</div>

	<div class="flex flex-wrap items-center gap-x-6 gap-y-2">
		{#if isAwardsPrimary && view.awardsHref}
			<div class="grid min-w-50 max-md:w-full">
				<Button label="Propose awards" variant="primary" size="lg" href={view.awardsHref} />
			</div>
		{/if}
		<StartSessionForm label={view.startLabel} look={isStartPrimary ? 'primary' : 'link'} />
		{#if view.awardsHref && !isAwardsPrimary}
			<TextLink href={view.awardsHref} label="Propose awards" />
		{/if}
		<TextLink href={view.recordHref} label="Session record" />
		{#if view.editDelegationsHref}
			<TextLink href={view.editDelegationsHref} label="Edit delegations" />
		{/if}
		{#if view.notesHref}
			<TextLink href={view.notesHref} label="Session notes" />
		{/if}
	</div>

	{#if view.nextOnSchedule}
		<p class="text-small text-ink-600">Next on the schedule: {view.nextOnSchedule}</p>
	{/if}
</section>
