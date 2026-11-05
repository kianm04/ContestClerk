<script lang="ts">
	import LivePanel from './LivePanel.svelte';

	type Props = {
		/** "No session is running", "Suspended for lunch", "Session 1 has ended". */
		title: string;
		/** The quieter lines under it, such as "Back at 14:00 · in 41 min". */
		lines: string[];
	};

	let { title, lines }: Props = $props();
</script>

<!--
	A screen that is only a title and its lines: the lobby, the opening, a
	suspension, the end of a session, or a vote not yet open. The page puts it
	in a polite live region, so a screen reader hears the room change.
-->
<LivePanel>
	<div class="flex flex-col items-center gap-2 py-4 text-center">
		<h2 class="font-display text-[26px]/8 font-semibold text-balance">{title}</h2>
		<!-- Plain lines have no id of their own, so each is keyed by its place. -->
		{#each lines as line, index (index)}
			<p class="text-ink-600 tabular-nums">{line}</p>
		{/each}
	</div>
</LivePanel>
