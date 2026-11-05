<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import Calendar from '@lucide/svelte/icons/calendar';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import Database from '@lucide/svelte/icons/database';
	import FileText from '@lucide/svelte/icons/file-text';
	import Globe from '@lucide/svelte/icons/globe';
	import Landmark from '@lucide/svelte/icons/landmark';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import UsersRound from '@lucide/svelte/icons/users-round';
	import type { LaunchRow } from '$lib/creation-readiness';
	import ReadinessStatus from './ReadinessStatus.svelte';

	type Props = {
		/** From `launchRows()` in `$lib/creation-readiness.ts`. */
		rows: LaunchRow[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { rows }: Props = $props();

	/** The icon the design draws at the start of each row. */
	const ICONS: Record<LaunchRow['key'], LucideIcon> = {
		organization: Landmark,
		basics: FileText,
		dates: Calendar,
		venue: MapPin,
		public_page: Globe,
		committees: UsersRound,
		applications: ClipboardList,
		fees: Database
	};
</script>

<!--
	One 44 pixel row per part of the conference, with a hairline under each (45
	in all), in the design's four columns: the icon (61), what it is (195), what
	it holds (495) and how ready it is (107), as proportions so that a wider
	window spreads them. On a phone the detail moves under the name.
-->
<ul class="mt-3.25 border-t border-creation-rule">
	<!-- The `(row.key)` key lets Svelte keep each row's element when the list redraws. -->
	{#each rows as row (row.key)}
		<!-- `{@const}` names a value for one pass of the loop. -->
		{@const Icon = ICONS[row.key]}
		<li
			class="grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-creation-rule py-1.5 lg:h-11.25 lg:grid-cols-[61fr_195fr_minmax(0,495fr)_107fr] lg:gap-x-0 lg:py-0 lg:pl-3.75"
		>
			<Icon class="size-5.5 text-creation-ink-700" aria-hidden="true" />
			<span class="fs-14 font-semibold text-creation-ink-950">{row.label}</span>
			<span
				class="col-start-2 row-start-2 fs-13 text-creation-ink-300 lg:col-start-3 lg:row-start-1 lg:truncate"
			>
				{#if row.href}
					<a href={row.href} class="underline underline-offset-3 hover:text-creation-ink-950"
						>{row.detail}</a
					>
				{:else}
					{row.detail}
				{/if}
			</span>
			<span class="col-start-3 row-span-2 row-start-1 lg:col-start-4 lg:row-span-1">
				<ReadinessStatus status={row.status} />
			</span>
		</li>
	{/each}
</ul>
