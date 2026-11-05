<script lang="ts">
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Button from '$lib/components/Button.svelte';
	import type { InSessionBand } from '$lib/manage-list';

	type Props = {
		/** A conference running today, from `inSessionBands` in `$lib/manage-list.ts`. */
		band: InSessionBand;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { band }: Props = $props();
</script>

<!--
	The light blue band at the top of `/manage` for a conference that is
	running today, so the reader reaches its dashboard in one press.
	`aria-label` names the band, so a screen reader can jump to it.
-->
<section
	aria-label="In session now"
	class="flex flex-wrap items-center justify-between gap-x-10 gap-y-5 rounded-2xl bg-accent px-5 py-6 lg:px-7"
>
	<div class="min-w-0 flex-[1_1_20rem]">
		<p class="mb-2 inline-flex items-center gap-1.75 text-small text-foreground">
			<span class="size-2 shrink-0 rounded-full bg-ring" aria-hidden="true"></span>
			{band.statusLine}
		</p>
		<p class="font-display text-[1.625rem] leading-8.5 font-semibold text-foreground">
			{band.name}
		</p>
		<p class="text-body text-muted-foreground">{band.place}</p>
	</div>

	<Button
		label="Open dashboard"
		variant="primary"
		size="dense"
		href={band.href}
		icon={ArrowRight}
		isIconAfterLabel
	/>
</section>
