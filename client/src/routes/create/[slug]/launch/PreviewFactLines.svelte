<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Database from '@lucide/svelte/icons/database';
	import Globe from '@lucide/svelte/icons/globe';
	import Landmark from '@lucide/svelte/icons/landmark';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import UsersRound from '@lucide/svelte/icons/users-round';
	import type { PreviewFact, PreviewFactKind } from '$lib/creation-draft';

	type Props = { facts: PreviewFact[] };

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { facts }: Props = $props();

	const ICONS: Record<PreviewFactKind, LucideIcon> = {
		dates: Calendar,
		place: MapPin,
		venue: Landmark,
		level: UsersRound,
		timezone: Globe,
		fees: Database,
		organiser: Landmark,
		audience: UsersRound
	};
</script>

<!--
	The short facts under the name in Launch's preview, smaller than the shared
	`PreviewFacts` of the first three steps: 26 pixel lines of 13 pixel text, a
	20 pixel icon 23 pixels before each. Keyed by position, because two lines
	may read the same, such as "Online" for both the place and the venue.
-->
<ul class="mt-3 pl-1.5 fs-13 text-creation-ink-375">
	{#each facts as fact, index (index)}
		{@const Icon = ICONS[fact.kind]}
		<li class="flex min-h-6.5 items-center gap-5.75">
			<Icon class="size-5 shrink-0 text-creation-ink-550" aria-hidden="true" />
			<span class="min-w-0 break-words">{fact.text}</span>
		</li>
	{/each}
</ul>
