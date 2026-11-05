<script lang="ts">
	import { serverNow } from '$lib/clock-offset';
	import { suspensionLine, type Suspension } from '$lib/suspension';

	type Props = {
		/** When the room was suspended, and when it is due back, or null while no time is set. */
		suspension: Suspension;
		/** The conference's timezone, which "Back at 14:00" is written in. */
		timezone: string;
		/** How far the server's clock is ahead of this browser's (`$lib/clock-offset.ts`). */
		clockOffsetMs: number;
	};

	let { suspension, timezone, clockOffsetMs }: Props = $props();

	/** How often the line is read again; it changes once a minute, so a second is plenty. */
	const TICK_MS = 1000;

	// `$state` makes Svelte redraw what reads it: the browser's clock, moved on below.
	let browserNow = $state(new Date());
	// `$derived` writes the line again whenever the clock or the suspension changes.
	const line = $derived(suspensionLine(suspension, serverNow(clockOffsetMs, browserNow), timezone));

	/*
		`$effect` is how a component talks to something outside Svelte, here the
		browser's clock. It runs in the browser only, once the line is on screen;
		the function it returns stops the ticking when the line leaves the page.
		Without JavaScript the line shows the minute the page was drawn.
	*/
	$effect(() => {
		const interval = setInterval(() => (browserNow = new Date()), TICK_MS);

		return () => clearInterval(interval);
	});
</script>

<!--
	"Back at 14:00 · in 41 min", counting down, then "· 3 min ago" once it has
	passed; or "12 min so far", counting up, until a return time is set. In
	figures of one width, so the line does not shift as it counts.
-->
<p class="mt-2 text-h2 tabular-nums">{line}</p>
