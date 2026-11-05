<script lang="ts">
	import type { Snippet } from 'svelte';
	import Avatar from './Avatar.svelte';

	type Props = {
		name: string;
		/** One quiet line under the name, such as an institution or a title. */
		subtitle?: string | null;
		/** Where the person's picture sits in the `public-media` bucket. */
		imagePath?: string | null;
		/** What sits on the right of the row: a badge, a button, a menu. */
		children?: Snippet;
	};

	let { name, subtitle, imagePath, children }: Props = $props();
</script>

<!-- `min-w-0` lets the middle column shrink, so a long name wraps instead of pushing the row wide. -->
<div class="flex items-center gap-3 py-2">
	<Avatar {name} {imagePath} size="md" />

	<div class="min-w-0 flex-1">
		<p class="text-h3">{name}</p>

		{#if subtitle}
			<p class="text-small text-ink-600">{subtitle}</p>
		{/if}
	</div>

	{#if children}
		<div class="flex shrink-0 items-center gap-2">
			{@render children()}
		</div>
	{/if}
</div>
