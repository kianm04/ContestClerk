<script lang="ts">
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Star from '@lucide/svelte/icons/star';
	import SourceChip from '$lib/components/creation/SourceChip.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { EditionComparison } from '$lib/creation-start';
	import EditionLines from './EditionLines.svelte';
	import EditionThumb from './EditionThumb.svelte';

	type Props = {
		next: EditionComparison['next'];
		/** The previous banner, which the new draft starts with too. */
		bannerPath: string | null;
		/** The `id` of the step's form, which "Use this setup" sends. */
		formId: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { next, bannerPath, formId }: Props = $props();

	// The pills that say where each suggested value came from, those that apply.
	const chips = $derived(
		[next.name.chip, next.dates.chip, next.place.chip].filter((chip) => chip !== null)
	);
</script>

<!--
	The right card of the comparison: the next edition this draft would start
	as, with the blue "Recommended" pill in its top right corner, the pills
	that say where each value came from, and "Use this setup" in its own row
	at the right.
-->
<div
	class="relative rounded-lg border border-creation-card-border bg-white pt-3 pr-3.75 pb-3 pl-4 lg:h-57"
>
	<span
		class="absolute top-3 right-3.5 inline-flex h-7.25 items-center gap-2 rounded-full bg-creation-blue px-3.5 fs-14 font-semibold text-white"
	>
		<Star aria-hidden="true" class="size-3.5 fill-current" strokeWidth={1} />Recommended
	</span>
	<div class="flex gap-3.5 max-lg:mt-9">
		<EditionThumb {bannerPath} class="h-29.5 w-31" />
		<div class="min-w-0">
			<span
				class="inline-flex h-7 items-center rounded-full bg-creation-pill px-3 fs-14 font-medium whitespace-nowrap text-creation-blue-pill"
			>
				Suggested next edition
			</span>
			<p class="mt-1.5 truncate fs-20 lh-26 font-bold text-creation-ink-950">{next.name.text}</p>
			<EditionLines dates={next.dates.text} place={next.place.text} lineClass="mt-1.5" />
		</div>
	</div>
	<div class="mt-1.5 flex justify-between gap-2 max-lg:flex-wrap">
		<!-- Each pill's words differ from the others', so they key the list. -->
		{#each chips as chip (chip)}
			<SourceChip label={chip} />
		{/each}
	</div>
	<div class="mt-2 flex justify-end">
		<Button
			type="submit"
			form={formId}
			class="h-10 gap-3.5 rounded-md px-5.5 fs-16 font-semibold hover:bg-creation-blue-hover max-lg:min-h-11"
		>
			Use this setup <ArrowRight aria-hidden="true" class="size-4.5" />
		</Button>
	</div>
</div>
