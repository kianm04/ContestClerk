<script lang="ts">
	import { formatFileSize, type ResourceFile } from '$lib/documents';
	import { fileTypeLabel } from '$lib/resources';

	type Props = {
		/** One of the conference's own resources, with its one-minute download link. */
		resource: ResourceFile;
	};

	let { resource }: Props = $props();
</script>

<div class="flex items-center justify-between gap-3 py-3">
	<div class="min-w-0">
		<p class="truncate text-body">{resource.title}</p>
		<p class="text-small text-ink-600">
			{fileTypeLabel(resource.mimeType)} · {formatFileSize(resource.fileSizeBytes)}
		</p>
	</div>

	{#if resource.downloadUrl}
		<!--
			A signed address made in `load`, good for one minute, points at
			Supabase Storage rather than at a page of ours, so there is no
			route of ours for `resolve()` to check it against. `rel="external"`
			tells SvelteKit, and the lint rule that checks our links, that on
			purpose, the way `ConferenceFacts.svelte` and `ResourceRow.svelte`
			already do for addresses this app cannot know ahead of time.
		-->
		<a
			href={resource.downloadUrl}
			target="_blank"
			rel="external"
			class="shrink-0 text-brand-700 hover:underline"
		>
			Download
		</a>
	{:else}
		<span class="shrink-0 text-small text-ink-600">Temporarily unavailable</span>
	{/if}
</div>
