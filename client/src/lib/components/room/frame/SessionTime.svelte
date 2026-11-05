<script lang="ts">
	import { sessionRunningTime } from '$lib/chair-frame';
	import { serverNow } from '$lib/clock-offset';

	type Props = {
		/** "Session 1". */
		sessionName: string;
		/** When the session started, as the database stores it. */
		startedAt: string;
		/** How far the server's clock is ahead of this browser's (`$lib/clock-offset.ts`). */
		clockOffsetMs: number;
	};

	let { sessionName, startedAt, clockOffsetMs }: Props = $props();

	/** How often the time is read, so each second turns over within a quarter of one. */
	const TICK_MS = 250;

	// `$state` makes Svelte redraw what reads it: the browser's clock, moved on below.
	let browserNow = $state(new Date());
	const runningTime = $derived(sessionRunningTime(startedAt, serverNow(clockOffsetMs, browserNow)));

	/*
		`$effect` is how a component talks to something outside Svelte, here the
		browser's clock. It runs in the browser only, once the bar is on screen;
		the function it returns stops the ticking when the bar leaves the page.
	*/
	$effect(() => {
		const interval = setInterval(() => (browserNow = new Date()), TICK_MS);

		return () => clearInterval(interval);
	});
</script>

<!-- "Session 1 · 1:12:40", in figures of one width so the time does not shift as it counts. -->
<p class="text-small whitespace-nowrap text-ink-600 tabular-nums">
	{sessionName} · <span>{runningTime}</span>
</p>
