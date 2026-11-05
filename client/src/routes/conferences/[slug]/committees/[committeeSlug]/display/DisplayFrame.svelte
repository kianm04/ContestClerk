<script lang="ts">
	// `Snippet` is the type of `children`: whatever the page writes between
	// `<DisplayFrame>` and `</DisplayFrame>`, which `{@render children()}` draws.
	import type { Snippet } from 'svelte';
	import type { LiveStatus } from '$lib/committee-room-live';
	import DisplayTopLine from './DisplayTopLine.svelte';
	import FullScreenHint from './FullScreenHint.svelte';

	type Props = {
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
		/** The screen the room is on, drawn under the top line. */
		children: Snippet;
	};

	let { committee, agendaTopic, timezone, clockOffsetMs, attendance, liveStatus, children }: Props =
		$props();

	/** How long the mouse must stay still before the pointer is hidden from the projector. */
	const CURSOR_IDLE_MS = 3000;

	// `$state` makes Svelte redraw the page's class when the pointer hides or shows.
	let isCursorHidden = $state(false);
	const cursorClasses = $derived(isCursorHidden ? 'cursor-none' : '');
	// The timer that hides the pointer. A plain variable: nothing is drawn from it.
	let cursorTimeout: ReturnType<typeof setTimeout> | undefined;

	/** Show the pointer, and hide it again once the mouse has been still for a while. */
	function handleMouseMove() {
		isCursorHidden = false;
		clearTimeout(cursorTimeout);
		cursorTimeout = setTimeout(() => {
			isCursorHidden = true;
		}, CURSOR_IDLE_MS);
	}

	// `$effect` runs in the browser only, once the page is on screen. Here the
	// page talks to the browser: the pointer starts counting towards hiding at
	// once, and the timer is stopped when the page is left.
	$effect(() => {
		handleMouseMove();

		return () => clearTimeout(cursorTimeout);
	});

	/**
	 * F enters full screen, and F again leaves it, through the browser's
	 * Fullscreen API on the whole page. Escape leaves it too; the browser does
	 * that by itself. A refusal (the browser allows full screen only after a
	 * key or a click) changes nothing, so it is quietly ignored.
	 */
	function handleKeydown(event: KeyboardEvent) {
		const isPlainF = event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey;

		if (!isPlainF || event.altKey) return;

		const change = document.fullscreenElement
			? document.exitFullscreen()
			: document.documentElement.requestFullscreen();

		change.catch(() => undefined);
	}
</script>

<!--
	`<svelte:window>` listens to the whole browser window: here the page talks
	to the browser, for the pointer and for F. Neither works without
	JavaScript, which is why the hint is only drawn with it.
-->
<svelte:window onmousemove={handleMouseMove} onkeydown={handleKeydown} />

<!--
	The projector's own page: plain white, no header, no footer, no cards, the
	window's full height and never a scroll bar. Every size is a share of the
	window's width (`vw`), so it fills any projector the same way.
-->
<main
	id="main"
	class="relative flex h-dvh flex-col overflow-hidden bg-surface px-[4vw] py-[3vw] text-ink-900 {cursorClasses}"
>
	<DisplayTopLine {committee} {agendaTopic} {timezone} {clockOffsetMs} {attendance} {liveStatus} />
	{@render children()}
	<FullScreenHint />
</main>
