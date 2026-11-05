<script lang="ts">
	type Props = {
		/** The sentence in place of a speaker, in the display serif: "Nobody has the floor". */
		title: string;
		/** The quieter line under it, or null for none. */
		line: string | null;
	};

	let { title, line }: Props = $props();
</script>

<!-- The floor with no speaker on it: one large grey sentence and a quieter line. -->
<div class="flex flex-col gap-2">
	<p class="font-display text-[32px]/10 font-semibold text-ink-600 max-md:text-2xl">{title}</p>
	{#if line}
		<p class="text-ink-600">{line}</p>
	{/if}
</div>
