<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import {
		eventState,
		hoursFromTop,
		isShortEvent,
		type CalendarHours,
		type EventState,
		type PlacedEvent
	} from '$lib/schedule-calendar';
	import { formatEventTime } from '$lib/schedule';

	type Props = {
		/** The event and where it sits in its day's column. */
		placed: PlacedEvent;
		hours: CalendarHours;
		/** The conference's timezone, which the time is written in. */
		timezone: string;
		/** The moment the page was drawn, which decides whether the event is over, on or to come. */
		now: Date;
		/** Opens this event's details: the same page with `?event=` in the address. */
		href: ResolvedPathname;
		/** True while this event's details are open beside it. */
		isOpen: boolean;
		/** "UNSC" or "Staff" in a small badge, or `null` for no badge. */
		badgeLabel: string | null;
	};

	// `$props()` is how a Svelte 5 component receives what its parent passes in.
	let { placed, hours, timezone, now, href, isOpen, badgeLabel }: Props = $props();

	/** The colours of each state: grey once over, blue while on, a pale tint to come. */
	const STATE_CLASSES: Record<EventState, { block: string; title: string; meta: string }> = {
		past: {
			block: 'border-neutral-100 bg-neutral-100',
			title: 'text-ink-600',
			meta: 'text-ink-600'
		},
		now: {
			block: 'border-brand-500 bg-brand-100',
			title: 'text-brand-900',
			meta: 'text-brand-900'
		},
		upcoming: {
			block: 'border-brand-100 bg-brand-50 hover:border-brand-500',
			title: 'text-ink-900',
			meta: 'text-ink-600'
		}
	};
	const OPEN_CLASSES = 'z-[4] border-brand-500 bg-background shadow-card';
	const BADGE_CLASSES =
		'shrink-0 rounded-sm border border-border bg-background px-1.5 text-small leading-[18px] font-medium text-ink-600';

	// `$derived` works each of these out again whenever the props change.
	const event = $derived(placed.event);
	const colours = $derived(STATE_CLASSES[eventState(event, now)]);
	const isShort = $derived(isShortEvent(placed));
	const time = $derived(formatEventTime(event, timezone));
	const meta = $derived(event.location ? `${time} · ${event.location}` : time);
	// An open block turns white, so its words go back to the page's own colours.
	const titleColour = $derived(isOpen ? 'text-ink-900' : colours.title);
	const metaColour = $derived(isOpen ? 'text-ink-600' : colours.meta);

	/*
		Where the block sits, in hours from the top of the grid and in fractions of
		the column's width. The grid sets `--hour-height` (48px on a desktop, 64px
		on a phone) and `--grid-top`, the space above the first hour line, so the
		same numbers work on both. Events that share their time sit side by side.
	*/
	const position = $derived(
		[
			`top: calc(var(--grid-top) + var(--hour-height) * ${hoursFromTop(placed.startMinute, hours)} + 1px)`,
			`height: calc(var(--hour-height) * ${(placed.endMinute - placed.startMinute) / 60} - 2px)`,
			`left: calc(6px + (100% - 18px) * ${placed.column / placed.columnCount})`,
			`width: calc((100% - 18px) / ${placed.columnCount} - ${placed.columnCount > 1 ? 2 : 0}px)`
		].join('; ')
	);
</script>

<!--
	A link rather than a button, so the details open without JavaScript too:
	it goes to the same page with `?event=` set, and `data-sveltekit-noscroll`
	keeps the page where it is instead of jumping back to the top.
-->
<a
	{href}
	data-sveltekit-noscroll
	class="@container absolute flex min-w-0 overflow-hidden rounded-lg border transition-colors duration-150 {isOpen
		? OPEN_CLASSES
		: colours.block} {isShort ? 'flex-row items-center gap-2 px-2.5' : 'flex-col px-2.5 py-1'}"
	style={position}
>
	<!--
	On a tall block the badge sits at the end of the title's line; on a short one,
	after the time. The tight padding and meta line let an hour-long event, 46px
	tall on a desktop, show both its title and its time.

	The block is a `@container`, so what is inside it can ask how wide the block
	is (`@min-[12rem]:`) rather than how wide the window is. Two events that
	share their time are each half a column, and the title matters most. A
	narrow tall block moves its badge under the time, where it has the height:
	committee sessions added together share a title, and the badge is what
	tells them apart. A narrow short block drops its badge and then its time,
	which its details still show, before it cuts the title short.
-->
	<span class="flex min-w-0 items-center justify-between gap-2">
		<span class="truncate font-semibold {isShort ? 'text-small' : 'text-dense'} {titleColour}">
			{event.title}
		</span>
		{#if badgeLabel && !isShort}
			<span class="hidden @min-[10rem]:block {BADGE_CLASSES}">{badgeLabel}</span>
		{/if}
	</span>
	<span
		class="truncate text-small tabular-nums {isShort
			? 'mr-auto hidden shrink-0 @min-[12rem]:block'
			: 'leading-4'} {metaColour}"
	>
		{isShort ? time : meta}
	</span>
	{#if badgeLabel && !isShort}
		<span class="mt-1 self-start @min-[10rem]:hidden {BADGE_CLASSES}">{badgeLabel}</span>
	{/if}
	{#if badgeLabel && isShort}
		<span class="hidden @min-[16rem]:block {BADGE_CLASSES}">{badgeLabel}</span>
	{/if}
</a>
