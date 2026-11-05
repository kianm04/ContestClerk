<script lang="ts">
	import Toast from '$lib/components/Toast.svelte';
	import { FLASH_VISIBLE_MS, type Flash } from '$lib/flash';

	type Props = {
		/** The message to show, or nothing when there is none. */
		flash: Flash | null;
		/** On the chair console the toast sits in the middle above the mode bar (`Toast`). */
		isAboveModeBar?: boolean;
	};

	let { flash, isAboveModeBar = false }: Props = $props();

	// `$state` is a value Svelte watches: changing it redraws whatever reads it.
	// This one turns the message off again once its five seconds are up.
	let isHidden = $state(false);

	// The last message that arrived. A page that answers a button without
	// reloading can drop `flash` again straight away: SvelteKit forgets an
	// action's answer whenever it reads the page's data again, which live
	// updates do at any moment. Keeping the message here gives it its five
	// seconds all the same.
	let lastFlash: Flash | null = $state(null);

	const shownFlash = $derived(isHidden ? null : (flash ?? lastFlash));

	// The countdown of the message on screen. It is a plain variable rather
	// than `$state`, because nothing on screen reads it.
	let hideTimer: ReturnType<typeof setTimeout> | undefined;

	/*
		`$effect` runs in the browser after the message is on screen, and is the
		right place to talk to something outside Svelte, in this case a timer. It
		reads `flash`, so it runs again whenever a new message arrives, and a new
		message restarts the countdown. `flash` going away does not stop it.

		With JavaScript switched off nothing here runs and the message simply stays
		until the next page load, which is the honest thing for it to do.
	*/
	$effect(() => {
		if (!flash) {
			return;
		}

		lastFlash = flash;
		isHidden = false;
		clearTimeout(hideTimer);
		hideTimer = setTimeout(() => (isHidden = true), FLASH_VISIBLE_MS);
	});

	// The function this `$effect` returns runs when the toast leaves the page,
	// so a countdown never fires after that.
	$effect(() => {
		return () => clearTimeout(hideTimer);
	});
</script>

<!--
	`aria-live="polite"` tells a screen reader to read the message out when it
	next pauses. It is on this wrapper rather than on the `Toast` itself, because
	the wrapper is on the page the whole time: a region that appears at the same
	moment as its text is often missed.
-->
<div aria-live="polite" class="print:hidden">
	{#if shownFlash}
		<Toast
			message={shownFlash.message}
			tone={shownFlash.tone}
			undo={shownFlash.undo}
			{isAboveModeBar}
		/>
	{/if}
</div>
