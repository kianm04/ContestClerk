<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import Building2 from '@lucide/svelte/icons/building-2';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Coins from '@lucide/svelte/icons/coins';
	import Globe from '@lucide/svelte/icons/globe';
	import Landmark from '@lucide/svelte/icons/landmark';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Users from '@lucide/svelte/icons/users';
	import type { PreviewFact, PreviewFactKind } from '$lib/creation-draft';
	import { cn } from '$lib/utils';

	type Props = {
		facts: PreviewFact[];
		/** The list's spacing and type in the design's pixels, such as `mt-4 gap-2.75 fs-17 lh-22`. */
		class?: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { facts, class: className }: Props = $props();

	const ICONS: Record<PreviewFactKind, LucideIcon> = {
		dates: Calendar,
		place: MapPin,
		venue: Building2,
		level: Users,
		timezone: Globe,
		fees: Coins,
		organiser: Landmark,
		audience: Users
	};
</script>

<!--
	The short facts under the conference's name in the preview, as the designs
	draw them: one line each, a 22 pixel blue-grey icon 16 pixels before it, the
	row set in 8 pixels from the panel's edge. Keyed by position, because two
	lines may read the same, such as "Online" for both the place and the venue.
	`{@const}` names a value for one pass of the loop, here the icon component
	for that line.
-->
<ul class={cn('flex flex-col gap-2.75 fs-17 lh-22 text-creation-ink-375', className)}>
	{#each facts as fact, index (index)}
		{@const Icon = ICONS[fact.kind]}
		<li class="flex items-center gap-4 pl-2">
			<Icon class="size-5.5 shrink-0 text-creation-ink-550" aria-hidden="true" />
			<span class="min-w-0 break-words">{fact.text}</span>
		</li>
	{/each}
</ul>
