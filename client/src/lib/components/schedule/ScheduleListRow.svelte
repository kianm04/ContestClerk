<script lang="ts">
	import { formatEventTime, type ScheduleEvent } from '$lib/schedule';
	import { eventState, nowUntilText } from '$lib/schedule-calendar';
	import type { RoomLink } from '$lib/schedule-rooms';

	type Props = {
		event: ScheduleEvent;
		timezone: string;
		/** The moment the page was drawn, which decides what is over and what is on now. */
		now: Date;
		/** "UNSC" or "Staff" in a small badge after the title, or `null` for none. */
		badgeLabel: string | null;
		/** The way into the committee's room on a conference day, or `null`. */
		roomLink: RoomLink | null;
	};

	let { event, timezone, now, badgeLabel, roomLink }: Props = $props();

	// `$derived` works these out again whenever the props change.
	const state = $derived(eventState(event, now));
	const time = $derived(
		state === 'now' ? nowUntilText(event, timezone) : formatEventTime(event, timezone)
	);
</script>

<!--
	One event of the list: the time, then the title with what it is about under
	it, then where. The event on now is tinted and says until when; an event
	that is over turns grey. Where the list is narrow the three stack; the
	`@xl:` and `@3xl:` classes ask how wide the list is, not the window.
-->
<li
	class="flex flex-col gap-1 px-4 py-3 text-dense not-first:border-t not-first:border-border @xl:flex-row @xl:gap-4 @3xl:pr-8 {state ===
	'now'
		? 'bg-brand-50'
		: ''}"
>
	<span
		class="shrink-0 tabular-nums @xl:w-37 {state === 'now'
			? 'font-semibold text-brand-900'
			: 'text-ink-600'}"
	>
		{#if state === 'now'}<span aria-hidden="true" class="text-brand-500">●</span>{/if}
		{time}
	</span>
	<div class="flex min-w-0 flex-1 flex-col gap-0.5">
		<p class="flex flex-wrap items-center gap-2">
			<span class="font-semibold {state === 'past' ? 'text-ink-600' : 'text-ink-900'}">
				{event.title}
			</span>
			{#if badgeLabel}
				<span
					class="rounded-sm border border-border bg-background px-1.5 text-small leading-[18px] font-medium text-ink-600"
				>
					{badgeLabel}
				</span>
			{/if}
		</p>
		{#if event.description}
			<p class="max-w-prose text-small whitespace-pre-line text-ink-600">{event.description}</p>
		{/if}
	</div>
	<div class="flex shrink-0 flex-col items-start gap-1 @xl:w-40 @3xl:w-50">
		{#if event.location}
			<span class="text-ink-600">{event.location}</span>
		{/if}
		{#if roomLink}
			<a class="font-medium text-brand-700 hover:underline" href={roomLink.href}>{roomLink.label}</a
			>
		{/if}
	</div>
</li>
