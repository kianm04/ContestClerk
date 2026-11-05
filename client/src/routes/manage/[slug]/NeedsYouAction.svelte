<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import type { AttentionItem } from '$lib/dashboard-attention';

	type Props = {
		/** One line of `dashboardAttention`. */
		item: AttentionItem;
		/** Whether this line carries the page's one filled button. */
		isPrimary: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { item, isPrimary }: Props = $props();
</script>

<!-- The way to what one "Needs you" line is about: a filled button on the first line, a link on the rest. -->
{#if isPrimary}
	<Button label={item.actionLabel} variant="primary" size="dense-sm" href={item.href} />
{:else}
	<a href={item.href} class="font-medium text-link hover:underline">{item.actionLabel}</a>
{/if}
