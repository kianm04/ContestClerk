<script lang="ts">
	import type { LiveStatus } from '$lib/committee-room-live';

	type Props = {
		/** Null until the page's JavaScript has started listening, when there is nothing to report. */
		status: LiveStatus | null;
	};

	let { status }: Props = $props();
</script>

<!--
	The top bar's connection: "● Connected" once the page's script has
	subscribed to the room, or "Reconnecting…" in the warning tone while the
	channel is down. Without JavaScript the page cannot hear the room change,
	so rather than claim to be live it says nothing at all, and while the
	channel is still connecting it says nothing either.

	The box is always drawn, as wide as "Reconnecting…", so the words appearing
	never move the rest of the bar (T126). Below 1180 px the word "Connected"
	leaves the screen, the dot staying (`max-[1180px]:sr-only` keeps it for a
	screen reader); "Reconnecting…" always keeps its word. The dot changes
	colour and never pulses (`visual-language.md`, "Movement").
-->
<p class="flex min-h-5 items-center gap-2 text-small text-ink-600 min-[1180px]:min-w-24">
	{#if status === 'live'}
		<span class="size-2 shrink-0 rounded-full bg-brand-500" aria-hidden="true"></span>
		<span class="max-[1180px]:sr-only">Connected</span>
	{:else if status === 'paused'}
		<span class="size-2 shrink-0 rounded-full bg-warning-500" aria-hidden="true"></span>
		<span class="text-warning-700">Reconnecting…</span>
	{/if}
</p>
