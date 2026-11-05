<script lang="ts">
	import Calendar from '@lucide/svelte/icons/calendar';
	import Globe from '@lucide/svelte/icons/globe';
	import Landmark from '@lucide/svelte/icons/landmark';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Users from '@lucide/svelte/icons/users-round';
	import type { PreviewFact, PreviewFactKind } from '$lib/creation-draft';

	type Props = { facts: PreviewFact[] };

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { facts }: Props = $props();

	// The icon the design draws before each kind of line.
	const ICONS = {
		dates: Calendar,
		place: MapPin,
		venue: Landmark,
		level: Users,
		audience: Users,
		timezone: Globe
	} satisfies Partial<Record<PreviewFactKind, unknown>>;

	// `$derived` keeps the lines the design shows here, in the preview's order.
	// The fees are left out: the Fees panel beside this one already says them.
	const shown = $derived(
		facts.flatMap((fact) =>
			fact.kind in ICONS ? [{ ...fact, icon: ICONS[fact.kind as keyof typeof ICONS] }] : []
		)
	);
</script>

<!-- One 32 design pixel line per fact, each behind its 20 pixel icon. -->
<ul class="mt-1.5 pl-3.75 fs-14 text-creation-ink-375">
	<!-- Keyed by the kind, which appears once at most. -->
	{#each shown as fact (fact.kind)}
		<li class="flex h-8 items-center gap-3">
			<fact.icon class="size-5 shrink-0 text-creation-ink-550" aria-hidden="true" />
			<span class="min-w-0 truncate">{fact.text}</span>
		</li>
	{/each}
</ul>
