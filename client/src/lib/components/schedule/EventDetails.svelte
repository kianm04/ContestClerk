<script lang="ts">
	import AlignLeft from '@lucide/svelte/icons/align-left';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Users from '@lucide/svelte/icons/users';
	import X from '@lucide/svelte/icons/x';
	import type { Snippet } from 'svelte';
	import type { ResolvedPathname } from '$app/types';
	import { goto } from '$app/navigation';
	import Button from '$lib/components/Button.svelte';
	import type { ScheduleEvent } from '$lib/schedule';
	import { eventDetailDate } from '$lib/schedule-calendar';
	import type { RoomLink } from '$lib/schedule-rooms';

	type Props = {
		event: ScheduleEvent;
		timezone: string;
		/** The same page without `?event=`, which closes the details. */
		closeHref: ResolvedPathname;
		/** Who the event is for: "For everyone", "Security Council (UNSC)". */
		audienceText: string;
		/** The way into the committee's room on a conference day, or `null`. */
		roomLink: RoomLink | null;
		/** The organiser's actions on the event, such as "Edit", under the details. */
		children?: Snippet;
	};

	let { event, timezone, closeHref, audienceText, roomLink, children }: Props = $props();

	function close() {
		goto(closeHref, { noScroll: true });
	}

	/** Escape closes the details, as it closes any other dialog. */
	function closeOnEscape(keyEvent: KeyboardEvent) {
		if (keyEvent.key === 'Escape') {
			close();
		}
	}

	/*
		A press anywhere outside the details closes them, as in a calendar app,
		so nobody has to aim for the X. A press inside them, or inside the
		"Delete this event?" question they open, keeps them. So does a press on
		anything that does something of its own, such as another event's block:
		that link opens the other event, and closing here as well would race it.
	*/
	const KEEPS_OPEN = '[role="dialog"], dialog, a, button, input, select, textarea, label';

	function closeOnPressOutside(clickEvent: MouseEvent) {
		const target = clickEvent.target;
		if (target instanceof Element && !target.closest(KEEPS_OPEN)) {
			close();
		}
	}
</script>

<!--
	`<svelte:window>` listens for keys and presses anywhere on the page while
	the details are open, and stops listening once they close.
-->
<svelte:window onkeydown={closeOnEscape} onclick={closeOnPressOutside} />

<!--
	On a phone the details are a sheet along the foot of the screen over a dark
	veil; pressing the veil closes them like the X. The veil is left out of the
	tab order and of what a screen reader hears, because the X already says it.
	On a desktop the details float beside the event's block (`CalendarDayColumn`).
-->
<a
	href={closeHref}
	data-sveltekit-noscroll
	tabindex="-1"
	aria-hidden="true"
	class="fixed inset-0 z-40 bg-ink-900/50 md:hidden"
></a>

<div
	role="dialog"
	aria-labelledby="event-details-title"
	class="flex flex-col gap-3.5 border border-border bg-background pt-5 pr-4 pb-6 pl-5 text-body text-ink-900 shadow-card max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-50 max-md:rounded-t-control md:rounded-control md:pr-5 md:pb-5 md:pl-6"
>
	<div class="flex items-start justify-between gap-2">
		<div class="flex min-w-0 flex-col gap-1">
			<h2 id="event-details-title" class="font-display text-h2 text-ink-900">{event.title}</h2>
			<p class="text-dense text-ink-600 tabular-nums">{eventDetailDate(event, timezone)}</p>
		</div>
		<a
			href={closeHref}
			data-sveltekit-noscroll
			aria-label="Close"
			class="-mt-3 -mr-2 grid size-11 shrink-0 place-items-center rounded-control text-ink-600 transition-colors duration-150 hover:bg-neutral-100"
		>
			<X size={18} aria-hidden="true" />
		</a>
	</div>

	<ul class="flex flex-col gap-2.5">
		{#if event.location}
			<li class="flex gap-3">
				<MapPin size={18} class="mt-0.5 shrink-0 text-ink-600" aria-label="Where" />
				<span>{event.location}</span>
			</li>
		{/if}
		<li class="flex gap-3">
			<Users size={18} class="mt-0.5 shrink-0 text-ink-600" aria-label="Who for" />
			<span>{audienceText}</span>
		</li>
		{#if event.description}
			<li class="flex gap-3">
				<AlignLeft size={18} class="mt-0.5 shrink-0 text-ink-600" aria-label="About" />
				<span class="whitespace-pre-line text-ink-600">{event.description}</span>
			</li>
		{/if}
	</ul>

	{#if roomLink}
		<Button variant="secondary" href={roomLink.href} label={roomLink.label} isFullWidth />
	{/if}

	{@render children?.()}
</div>
