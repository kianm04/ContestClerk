<script lang="ts">
	type Props = {
		/** The heading's `id`, which names the floor it heads (`aria-labelledby`). */
		id: string;
		/** "Moderated caucus · Opening humanitarian corridors" (`caucusTitle`). */
		title: string;
		/** "raised by Brazil · started without a vote" (`raisedByLine`), or null while unknown. */
		line: string | null;
	};

	let { id, title, line }: Props = $props();
</script>

<!--
	The title of a running caucus, and under it, quieter, who raised it. The
	Mod and Unmod floors both start with it. The heading takes the focus
	(`tabindex="-1"`) when a press makes the control the chair was on go away.
-->
<div class="min-w-0">
	<h2 {id} tabindex="-1" class="text-h3 focus:outline-none">{title}</h2>
	{#if line}
		<p class="text-ink-600">{line}</p>
	{/if}
</div>
