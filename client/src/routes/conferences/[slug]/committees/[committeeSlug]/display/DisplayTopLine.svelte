<script lang="ts">
	import type { LiveStatus } from '$lib/committee-room-live';
	import { LOGO_MARK_IMAGE_PATH } from '$lib/media';
	import DisplayWallClock from './DisplayWallClock.svelte';

	type Props = {
		/** The committee's abbreviation, "UNSC", or its name when it has none. */
		committee: { name: string; abbreviation: string | null };
		/** The topic under debate, or null while the agenda is not set. */
		agendaTopic: string | null;
		/** The conference's IANA timezone, which the wall clock is in. */
		timezone: string;
		/** How far the server's clock is ahead of this browser's (`$lib/clock-offset.ts`). */
		clockOffsetMs: number;
		/** "5/6 present" while a session with a roll call is under way, or null. */
		attendance: string | null;
		/** The realtime connection, null until the page's script listens. */
		liveStatus: LiveStatus | null;
	};

	let { committee, agendaTopic, timezone, clockOffsetMs, attendance, liveStatus }: Props = $props();

	const shortName = $derived(committee.abbreviation ?? committee.name);
</script>

<!--
	The projector's top line, small and quiet: the mark, the committee and the
	agenda on the left, the topic cut short with "…" rather than wrapping; on
	the right the time of day, who is present and, while live updates are
	paused, "Reconnecting…". Every size is a share of the window's width
	(`vw`), so the line keeps its proportions on any projector.
-->
<header
	class="flex items-center justify-between gap-[2vw] text-[1.5vw] leading-[1.3] whitespace-nowrap text-ink-600 tabular-nums"
>
	<p class="flex min-w-0 items-center gap-[0.8vw]">
		<img src={LOGO_MARK_IMAGE_PATH} alt="MUNMeet" class="h-[2vw] w-auto shrink-0" />
		<strong class="shrink-0 font-semibold text-ink-900">{shortName}</strong>
		{#if agendaTopic}
			<span class="truncate">· {agendaTopic}</span>
		{/if}
	</p>
	<p class="shrink-0">
		<DisplayWallClock {timezone} {clockOffsetMs} />
		{#if attendance}
			· {attendance}
		{/if}
		{#if liveStatus === 'paused'}
			· <span class="text-warning-700">Reconnecting…</span>
		{/if}
	</p>
</header>
