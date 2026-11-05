<script lang="ts">
	type Props = {
		/** What an empty writing area says. */
		text: string;
		/** True while the writing area is empty. */
		isShown: boolean;
	};

	let { text, isShown }: Props = $props();
</script>

<!-- Drawn over the empty writing area. A screen reader hears it from `aria-placeholder` instead. -->
{#if isShown}
	<p class="pointer-events-none absolute top-2 left-3 text-body text-ink-400" aria-hidden="true">
		{text}
	</p>
{/if}
