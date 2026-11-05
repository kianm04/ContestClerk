<script lang="ts">
	import ImageIcon from '@lucide/svelte/icons/image';
	import type { ConferencePreview } from '$lib/conference-preview';
	import { publicMediaUrl } from '$lib/media';

	type Props = {
		/** What the card says, from `conferencePreview` in `$lib/conference-preview.ts`. */
		preview: ConferencePreview;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { preview }: Props = $props();
</script>

<!--
	A small picture of how the conference will look to visitors, beside the
	Publish and Published pages (the manage redesign). It only shows; the real
	public page is one link away.
-->
<div class="overflow-hidden rounded-2xl border border-border">
	{#if preview.bannerPath}
		<!-- The banner only decorates; the name below says whose it is. -->
		<img src={publicMediaUrl(preview.bannerPath)} alt="" class="h-24 w-full object-cover" />
	{:else}
		<div
			class="flex h-24 items-center justify-center gap-2 bg-accent text-small text-muted-foreground"
		>
			<ImageIcon aria-hidden="true" class="size-4" />
			No banner yet
		</div>
	{/if}

	<div class="flex flex-col gap-1 px-4 pt-4 pb-4.5 text-small text-muted-foreground">
		<p class="font-display text-lg leading-6.5 font-semibold text-foreground">{preview.name}</p>
		<p>{preview.datesAndPlace}</p>
		<p>{preview.levelLabel}</p>

		{#if preview.committeeChips.length > 0}
			<!-- The chips are plain strings with no id of their own, so they are keyed by position. -->
			<ul class="flex flex-wrap gap-1.5 pt-1.5 pb-1" aria-label="Committees">
				{#each preview.committeeChips as chip, index (index)}
					<li class="rounded-full border border-border px-2 py-0.75 text-caption text-foreground">
						{chip}
					</li>
				{/each}
			</ul>
		{/if}

		{#if preview.closingLine}
			<p class="text-foreground">{preview.closingLine}</p>
		{/if}
	</div>
</div>
