<script lang="ts">
	import { serverNow } from '$lib/clock-offset';
	import { formatTimeOfDay } from '$lib/dates';
	import { millisecondsToNextMinute } from '$lib/room-screen';

	type Props = {
		/** The conference's IANA timezone, such as `Europe/Amsterdam`. */
		timezone: string;
		/** How far the server's clock is ahead of this browser's (`$lib/clock-offset.ts`). */
		clockOffsetMs: number;
	};

	let { timezone, clockOffsetMs }: Props = $props();

	// `$state` makes Svelte redraw whatever reads it when it changes: the
	// browser's clock, which the timer below reads again on every minute.
	let browserNow = $state(new Date());
	// The time of day in the conference's timezone, on the server's clock: "14:07".
	const time = $derived(
		formatTimeOfDay(serverNow(clockOffsetMs, browserNow).toISOString(), timezone)
	);

	// `$effect` is how a component talks to something outside Svelte, here the
	// browser's clock. It runs in the browser only, again whenever the offset
	// changes, and sets one timer at a time for the moment the minute turns
	// over on the server's clock, so the clock moves on the minute. The
	// function it returns stops the timer when the page is left.
	$effect(() => {
		let timeout: ReturnType<typeof setTimeout>;

		function waitForNextMinute() {
			const wait = millisecondsToNextMinute(serverNow(clockOffsetMs));

			timeout = setTimeout(() => {
				browserNow = new Date();
				waitForNextMinute();
			}, wait);
		}

		browserNow = new Date();
		waitForNextMinute();

		return () => clearTimeout(timeout);
	});
</script>

<time>{time}</time>
