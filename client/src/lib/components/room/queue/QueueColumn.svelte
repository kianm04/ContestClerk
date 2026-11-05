<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ResolvedPathname } from '$app/types';
	import type { SpeakersListSummary } from '$lib/chair-room';
	import type { AttendanceStatus, RoomSeat } from '$lib/committee-room';
	import { speechesLatestFirst, type GslEntry } from '$lib/gsl-floor';
	import { GSL_ADD_BOX, type QueueAddBoxSettings } from '$lib/queue-add-box';
	import { listEstimate } from '$lib/queue-estimate';
	import { waitingSpeakers } from '$lib/speakers-lists';
	import ListFooter from './ListFooter.svelte';
	import QueueAddBox from './QueueAddBox.svelte';
	import QueueRows from './QueueRows.svelte';
	import SpokenLine from './SpokenLine.svelte';

	type Props = {
		/** The column's heading: "Speakers’ list". */
		title: string;
		/** The list's settings, with the presses on their way laid on top. */
		list: SpeakersListSummary;
		/** Every entry of the list, with the presses on their way laid on top. */
		entries: GslEntry[];
		/** Every seat of the committee, which the add box offers. */
		seats: RoomSeat[];
		/** The latest roll call, keyed by seat id; empty before the first. */
		attendance: Record<string, AttendanceStatus>;
		/** Whether "Speak now" can give a row's seat the floor: the list is on the floor. */
		canSpeakNow: boolean;
		/** Whether the list's settings show at the foot. Mod's caucus list leaves them out. */
		isFooterShown: boolean;
		/** Whether the address asked for the speaking time field (`?time=change`). */
		isTimeFieldOpen: boolean;
		/** The page with `?time=change`, where "Change" leads without JavaScript. */
		timeFieldHref: ResolvedPathname;
		/** Sends every press through the chair's instant form (`$lib/chair-form.ts`). */
		onSubmit: SubmitFunction;
		/** The add box's words and action: the GSL's, or Mod's "Recognise", or "Add a speaker…". */
		addBox?: QueueAddBoxSettings;
		/** What the column says while nobody waits ("Nobody is waiting."), or nothing (the GSL). */
		emptyText?: string | null;
	};

	let {
		title,
		list,
		entries,
		seats,
		attendance,
		canSpeakNow,
		isFooterShown,
		isTimeFieldOpen,
		timeFieldHref,
		onSubmit,
		addBox = GSL_ADD_BOX,
		emptyText = null
	}: Props = $props();

	// `$derived` works these out again whenever the entries change, which
	// includes the moment a press is made.
	const waiting = $derived(waitingSpeakers(entries));
	const speeches = $derived(speechesLatestFirst(entries));
	// "3 · ~4 min": the seats "Next" would call and their speeches, or null when nobody waits.
	const estimate = $derived(listEstimate(entries, attendance, list.speakingTimeSeconds));
</script>

<!--
	The right column, the full height of the view: the heading and the
	estimate, the add box, the waiting rows (which scroll inside the column),
	the spoken line and the list's settings at the foot. A closed list keeps
	its rows and its settings, and says so where the add box was. `@container`
	lets a row measure the column's own width, to hide the delegate when it
	is narrow.
-->
<aside
	aria-labelledby="queue-column-title"
	class="@container flex min-h-0 min-w-0 flex-col border-l border-line px-6 pt-7 pb-5 max-[860px]:border-t max-[860px]:border-l-0 max-[860px]:py-5 max-md:order-2 max-md:p-4"
>
	<header class="mb-3 flex items-baseline justify-between gap-3">
		<h2 id="queue-column-title" class="text-h3">{title}</h2>
		{#if estimate}
			<span class="text-small text-ink-600 tabular-nums">{estimate}</span>
		{/if}
	</header>

	{#if list.isOpen}
		<QueueAddBox listId={list.id} {entries} {seats} {attendance} {onSubmit} settings={addBox} />
	{:else}
		<p class="mb-2 flex h-11 items-center rounded-control bg-neutral-100 px-3 text-ink-600">
			The list is closed.
		</p>
	{/if}

	{#if waiting.length === 0 && emptyText}
		<p class="py-4 text-ink-600">{emptyText}</p>
	{/if}
	<QueueRows {waiting} {attendance} {canSpeakNow} {onSubmit} />

	<footer class="flex flex-col gap-2 pt-3 text-small">
		<SpokenLine {speeches} />
		{#if isFooterShown}
			<ListFooter {list} {isTimeFieldOpen} {timeFieldHref} {onSubmit} />
		{/if}
	</footer>
</aside>
