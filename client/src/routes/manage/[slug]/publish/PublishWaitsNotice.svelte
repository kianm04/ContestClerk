<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import type { PublishChecklistLine } from '$lib/publish-checklist';

	type Props = {
		/** The required steps still undone, each linking to the page that finishes it. */
		missingLines: PublishChecklistLine[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { missingLines }: Props = $props();
</script>

<Notice tone="warning" title="Publishing waits for these">
	<ul class="mt-1 flex flex-col gap-1">
		<!-- The `(line.key)` key lets Svelte reuse list items instead of rebuilding them. -->
		{#each missingLines as line (line.key)}
			<li>
				<a href={line.href} class="font-medium text-link">{line.label}</a>
				{#if line.detail}
					<span>· {line.detail}</span>
				{/if}
			</li>
		{/each}
	</ul>
</Notice>
