<script lang="ts">
	type Props = {
		/** "Suspended for lunch", "Session 1 has started", the committee's name in the lobby. */
		title: string;
		/** The quieter lines under it, such as "Back at 14:00 · in 41 min". */
		lines: string[];
	};

	let { title, lines }: Props = $props();
</script>

<!--
	A screen that is only a title and its lines (the lobby, the opening, a
	suspension, the end of a session, a vote not yet open), centred in the
	space under the top line. Long words wrap over balanced lines.
-->
<div class="flex flex-1 flex-col items-center justify-center gap-[1.6vw] text-center">
	<h1 class="font-display text-[5vw]/[1.1] font-semibold text-balance">{title}</h1>
	<!-- Plain lines have no id of their own, so each is keyed by its place. -->
	{#each lines as line, index (index)}
		<p class="text-[2.4vw]/[1.3] text-balance text-ink-600 tabular-nums">{line}</p>
	{/each}
</div>
