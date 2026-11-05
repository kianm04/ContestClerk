<script lang="ts">
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import type { WorthDoingItem } from '$lib/publish-review';

	type Props = {
		/** What would make the page better, from `worthDoingItems` in `$lib/publish-review.ts`. */
		items: WorthDoingItem[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { items }: Props = $props();
</script>

<!--
	"Worth doing, not required": things that would help but never stop the
	conference going public, such as a banner or a chair for every committee.
	The Publish page leaves this section out when there is nothing to suggest.
-->
<ManageSection title="Worth doing, not required">
	<ul>
		<!-- The `(item.key)` key lets Svelte reuse rows instead of rebuilding them. -->
		{#each items as item (item.key)}
			<li
				class="flex min-h-13 items-center justify-between gap-4 border-b border-border px-1 py-2 text-dense"
			>
				<p class="min-w-0 text-foreground">{item.text}</p>

				<!-- "Connect Stripe" has nowhere to go when the organisation could not be read. -->
				{#if item.href}
					<a href={item.href} class="shrink-0 font-medium text-link">{item.linkLabel}</a>
				{/if}
			</li>
		{/each}
	</ul>
</ManageSection>
