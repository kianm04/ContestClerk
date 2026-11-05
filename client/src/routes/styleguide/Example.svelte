<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** The component's name, such as `Badge`. */
		name: string;
		/** The props this example passes, written the way the markup writes them. */
		props?: string;
		children: Snippet;
	};

	// `$props()` unpacks what the parent passed in. See the reference component
	// at the bottom of `CLAUDE.md`.
	let { name, props, children }: Props = $props();
</script>

<!--
	One example: the component itself in a dashed box, with its name and the
	props used underneath, so a teammate can copy the line straight out.
-->
<figure class="min-w-0 rounded-2xl border border-dashed border-line p-4">
	{@render children()}

	<figcaption class="mt-3 text-small text-ink-600">
		<span class="font-medium text-ink-900">{name}</span>
		{#if props}
			<code class="break-words">{props}</code>
		{/if}
	</figcaption>
</figure>
