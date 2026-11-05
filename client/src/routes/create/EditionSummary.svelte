<script lang="ts">
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import { Button } from '$lib/components/ui/button';
	import type { ResolvedPathname } from '$app/types';
	import EditionLines from './EditionLines.svelte';
	import EditionThumb from './EditionThumb.svelte';

	type Props = {
		edition: { name: string; dates: string; place: string };
		bannerPath: string | null;
		/** The previous conference's public page. */
		detailsHref: ResolvedPathname;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { edition, bannerPath, detailsHref }: Props = $props();
</script>

<!--
	The left card of the comparison: last year's conference as it ran, a 130
	by 134 picture beside its name, and "View details" pinned to the bottom
	right corner. On a phone the button drops under the words instead.
-->
<div
	class="relative flex gap-3.5 rounded-lg border border-creation-card-border bg-white p-3.5 max-lg:flex-wrap lg:h-57"
>
	<EditionThumb {bannerPath} class="h-33.5 w-32.5" />
	<div class="min-w-0">
		<span
			class="inline-flex h-7 items-center rounded-full bg-creation-pill px-3 fs-14 font-medium text-creation-blue-deep"
		>
			Previous conference
		</span>
		<p class="mt-2 truncate fs-20 lh-26 font-bold text-creation-ink-950">{edition.name}</p>
		<EditionLines dates={edition.dates} place={edition.place} lineClass="mt-2" />
	</div>
	<!-- A new tab, so the organiser keeps their place here. -->
	<Button
		variant="outline"
		href={detailsHref}
		target="_blank"
		rel="noopener"
		class="h-10 gap-3 rounded-md border-creation-panel-border bg-white px-4.5 fs-16 font-semibold text-creation-cancel hover:bg-creation-field max-lg:ml-auto max-lg:min-h-11 lg:absolute lg:right-3 lg:bottom-3"
	>
		View details <ArrowRight aria-hidden="true" class="size-4.5" />
	</Button>
</div>
