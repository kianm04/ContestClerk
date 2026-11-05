<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import { formatFileSize, type BackgroundGuide } from '$lib/documents';

	type Props = {
		/** The committee's guide, or null when there is none this reader may see. */
		guide: BackgroundGuide | null;
		/**
		 * Whether the reader is a delegate of this committee or on the conference's
		 * team: the people told "No background guide yet" rather than shown nothing.
		 */
		isInsider: boolean;
	};

	let { guide, isInsider }: Props = $props();
</script>

<!-- A visitor is shown nothing at all when there is no guide they may download. -->
{#if guide}
	<Card>
		<h2 class="font-display text-h2 text-brand-900">Background guide</h2>
		<p class="mt-2 text-body break-words">{guide.title}</p>
		<p class="text-small text-ink-600">
			{guide.fileName} · {formatFileSize(guide.fileSizeBytes)}
		</p>
		{#if guide.downloadUrl}
			<!--
				A signed Storage address made in `load`, good for one minute, rather
				than a page of ours, so `rel="external"` tells SvelteKit and the lint
				rule for `resolve()` so, the way `PublicResourceRow.svelte` does.
			-->
			<a
				href={guide.downloadUrl}
				target="_blank"
				rel="external"
				class="mt-2 inline-block font-medium text-brand-700 hover:underline"
			>
				Download<span class="sr-only"> the background guide (opens in a new tab)</span>
			</a>
		{:else}
			<p class="mt-2 text-small text-ink-600">Temporarily unavailable</p>
		{/if}
	</Card>
{:else if isInsider}
	<Card>
		<h2 class="font-display text-h2 text-brand-900">Background guide</h2>
		<p class="mt-2 text-body text-ink-600">No background guide yet</p>
	</Card>
{/if}
