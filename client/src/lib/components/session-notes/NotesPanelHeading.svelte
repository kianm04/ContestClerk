<script lang="ts">
	import type { Snippet } from 'svelte';
	import FileText from '@lucide/svelte/icons/file-text';

	type Props = {
		/** The heading's id, which the panel and the editor are named by. */
		headingId: string;
		/** What sits on the right, the save status. Written between the tags. */
		children: Snippet;
	};

	let { headingId, children }: Props = $props();
</script>

<div class="flex flex-wrap items-start justify-between gap-3">
	<div class="flex items-start gap-3">
		<FileText size={24} strokeWidth={1.75} aria-hidden="true" class="mt-1 text-brand-700" />
		<div>
			<h2 id={headingId} class="font-display text-h2">Chair Notes</h2>
			<p class="text-small text-ink-600">Keep track of key points, arguments, and decisions.</p>
		</div>
	</div>
	{@render children()}
</div>
