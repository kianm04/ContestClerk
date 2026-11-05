<script lang="ts">
	import Calendar from '@lucide/svelte/icons/calendar';
	import Landmark from '@lucide/svelte/icons/landmark';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import { datesLine, locationLine, type CreationDraft } from '$lib/creation-draft';
	import { cn } from '$lib/utils';

	type Props = {
		draft: CreationDraft;
		/** Its distance from the banner, which depends on whether there is one. */
		class?: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { draft, class: className }: Props = $props();

	// `$derived` works the lines out again whenever the draft changes. The dates
	// and the place always say something ("to be announced" at worst); the
	// tagline is left out when there is none, rather than drawn as a blank line.
	const lines = $derived(
		[
			{ icon: Calendar, text: datesLine(draft) },
			{ icon: MapPin, text: locationLine(draft) },
			{ icon: Landmark, text: draft.tagline ?? '' }
		].filter((line) => line.text !== '')
	);
</script>

<!--
	The conference's name in the serif, then what a delegate learns first, each line behind its 20 pixel icon, in a 336 design pixel column.
-->
<div class={cn('flex min-w-0 shrink-0 flex-col pt-2.5 lg:w-84', className)}>
	<h3 class="truncate font-display fs-20 lh-26 font-bold text-creation-ink-950">{draft.name}</h3>
	<!-- Keyed by position: two lines could read the same. -->
	{#each lines as line, index (index)}
		<p
			class="flex items-center gap-3 fs-14 lh-20 text-creation-ink-450 {index === 0
				? 'mt-1.5'
				: 'mt-2'}"
		>
			<line.icon class="size-5 shrink-0 text-creation-ink-650" aria-hidden="true" />
			<span class="min-w-0 truncate">{line.text}</span>
		</p>
	{/each}
</div>
