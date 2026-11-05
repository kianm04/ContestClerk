<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import type { PreparationItem } from '$lib/dashboard-preparation';

	type Props = {
		/** What is done and what is left before the first day, from `preparationItems`. */
		items: PreparationItem[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { items }: Props = $props();
</script>

<!--
	While seats are given: what is ready for the conference days and what is
	not. A finished line is grey with a tick; one still to do links to where it
	is done.
-->
<ManageSection title="Before the first day">
	<ul>
		<!-- Each line's `key` is fixed and distinct, so Svelte can reuse the lines. -->
		{#each items as item (item.key)}
			<li
				class="flex min-h-13 items-center justify-between gap-4 border-b border-border px-1 py-2 text-dense"
			>
				{#if item.isDone}
					<span class="inline-flex items-center gap-2.5 text-muted-foreground">
						<Check size={16} strokeWidth={2} class="text-success" aria-hidden="true" />
						<span class="sr-only">Done:</span>
						{item.text}
					</span>
				{:else}
					<span class="min-w-0 text-foreground">{item.text}</span>
				{/if}

				{#if item.link}
					<a href={item.link.href} class="shrink-0 font-medium text-link hover:underline">
						{item.link.label}
					</a>
				{/if}
			</li>
		{/each}
	</ul>
</ManageSection>
