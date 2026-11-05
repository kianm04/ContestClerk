<script lang="ts">
	import Badge from '$lib/components/Badge.svelte';
	import { formatFileSize } from '$lib/documents';
	import { fileTypeIcon, fileTypeLabel, type ResourceListItem } from '$lib/resources';

	type Props = {
		/** The file this row shows, already carrying its own one-minute download link. */
		resource: ResourceListItem;
	};

	let { resource }: Props = $props();

	// `fileTypeIcon` looks the icon up from the file's `mime_type`; renaming it
	// to a capitalised name is what lets Svelte render it as `<Icon />`.
	const Icon = $derived(fileTypeIcon(resource.mimeType));
</script>

<div class="flex items-start gap-3 py-3">
	<span class="mt-0.5 shrink-0 text-ink-400">
		<Icon size={20} strokeWidth={1.75} aria-hidden="true" />
	</span>

	<div class="min-w-0 flex-1">
		<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
			<p class="text-body">{resource.title}</p>

			{#if resource.committeeLabel}
				<Badge tone="brand" label={resource.committeeLabel} />
			{/if}
		</div>

		<p class="text-small text-ink-600">
			{fileTypeLabel(resource.mimeType)} · {formatFileSize(resource.fileSizeBytes)}
			{#if resource.downloadUrl}
				·
				<!--
					A signed address made in `load`, good for one minute, points at
					Supabase Storage rather than at a page of ours, so there is no route
					of ours for `resolve()` to check it against. `rel="external"` tells
					SvelteKit, and the lint rule that checks our links, that on purpose,
					the way `ConferenceFacts.svelte` and `OrganizationHeader.svelte`
					already do for the other addresses this app cannot know ahead of time.
				-->
				<a
					href={resource.downloadUrl}
					target="_blank"
					rel="external"
					class="text-brand-700 hover:underline"
				>
					Download
				</a>
			{:else}
				· Temporarily unavailable
			{/if}
		</p>
	</div>
</div>
