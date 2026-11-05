<script lang="ts">
	/** How long "Press F for full screen" shows once the page has come to life. */
	const FULL_SCREEN_HINT_MS = 3000;

	// `$state` makes Svelte redraw the hint when this changes. It starts false,
	// so the page drawn on the server, and a page without JavaScript (where F
	// does nothing), never shows it.
	let isShown = $state(false);

	// `$effect` runs in the browser only, once the page has come to life: it
	// shows the hint and sets a timer to take it away again. The function it
	// returns stops the timer if the page is left first.
	$effect(() => {
		isShown = true;
		const timeout = setTimeout(() => {
			isShown = false;
		}, FULL_SCREEN_HINT_MS);

		return () => clearTimeout(timeout);
	});
</script>

<!-- A small dark label centred near the bottom edge, over whatever the screen shows. -->
{#if isShown}
	<p
		class="absolute bottom-[3vw] left-1/2 -translate-x-1/2 rounded-[0.6vw] bg-ink-900 px-[1.4vw] py-[0.6vw] text-[1.2vw] whitespace-nowrap text-surface"
	>
		Press F for full screen
	</p>
{/if}
