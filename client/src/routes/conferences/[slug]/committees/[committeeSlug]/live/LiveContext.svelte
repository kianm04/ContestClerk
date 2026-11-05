<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { LiveStatus } from '$lib/committee-room-live';

	type Props = {
		/** The committee's abbreviation, "UNSC", or its name when it has none. */
		committee: { name: string; abbreviation: string | null };
		/** The topic under debate, or null while the agenda is not set. */
		agendaTopic: string | null;
		/** The reader's seat, "Brazil", or null for staff watching. */
		seatName: string | null;
		/** "5/6 present" once the session has a roll call, or null. */
		attendanceText: string | null;
		/** The realtime connection, null until the page's script listens. */
		liveStatus: LiveStatus | null;
		/** "Resolutions", or "Directives" in a crisis committee. */
		papersTitle: string;
		/** The committee's papers, which the link beside the heading opens. */
		papersHref: ResolvedPathname;
	};

	let {
		committee,
		agendaTopic,
		seatName,
		attendanceText,
		liveStatus,
		papersTitle,
		papersHref
	}: Props = $props();

	// `$derived` works these out again whenever the page's data is read again.
	const shortName = $derived(committee.abbreviation ?? committee.name);
	const heading = $derived(agendaTopic ? `${shortName} · ${agendaTopic}` : shortName);
	const facts = $derived([seatName, attendanceText].filter((fact) => fact !== null).join(' · '));
	// Without JavaScript, or while still connecting, the line claims no connection either way.
	const hasConnectionWord = $derived(liveStatus === 'live' || liveStatus === 'paused');
</script>

<!--
	The page's own heading, above the panels: the committee and the agenda, with
	the way to the committee's papers at its right, then a quiet line with the
	reader's seat, who is present and whether the page is following the room
	live. `min-w-0` lets a long agenda topic wrap instead of pushing the link
	off a phone's screen, and below `lg` the link is 44px tall for a thumb.
-->
<header class="flex flex-col gap-0.5 px-1">
	<div class="flex items-center justify-between gap-4">
		<h1 class="min-w-0 font-semibold break-words">{heading}</h1>
		<a
			href={papersHref}
			class="inline-flex shrink-0 items-center text-small text-link hover:underline max-lg:min-h-11"
		>
			{papersTitle}
		</a>
	</div>
	<p class="flex flex-wrap items-center gap-x-2 text-small text-ink-600 tabular-nums">
		{#if facts}
			<span>{facts}{hasConnectionWord ? ' ·' : ''}</span>
		{/if}
		{#if liveStatus === 'live'}
			<span class="inline-flex items-center gap-2">
				<span class="size-2 rounded-full bg-brand-500" aria-hidden="true"></span>
				Connected
			</span>
		{:else if liveStatus === 'paused'}
			<span class="text-warning-700">Reconnecting…</span>
		{/if}
	</p>
</header>
