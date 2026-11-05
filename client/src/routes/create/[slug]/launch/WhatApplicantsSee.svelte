<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import Database from '@lucide/svelte/icons/database';
	import Eye from '@lucide/svelte/icons/eye';
	import FileText from '@lucide/svelte/icons/file-text';
	import MapPin from '@lucide/svelte/icons/map-pin';

	type Props = {
		/** From `whatApplicantsSee()` in `$lib/creation-readiness.ts`: venue, applications, fees. */
		facts: { label: string; value: string }[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { facts }: Props = $props();

	/** The design's icon for each of the three facts, by its label. */
	const ICONS: Record<string, LucideIcon> = {
		Venue: MapPin,
		Applications: FileText,
		Fees: Database
	};
</script>

<!--
	The three facts an applicant meets first, in the pale blue box under the
	choices, so the organiser sees that "To be announced" is said plainly
	rather than left blank. The facts sit in the design's three columns (263,
	291, 228) with a hairline between them. They are a description list, not a
	`<ul>`, so the readiness table's rows stay the only list items that name
	"Venue", "Applications" and "Fees".
-->
<div class="mt-2.25 rounded-lg bg-creation-note pt-2 pr-4 pb-2.5 pl-4 lg:pl-6.25">
	<div class="flex gap-5.5">
		<Eye class="mt-0.5 size-6.5 shrink-0 text-creation-blue" aria-hidden="true" />
		<div class="min-w-0">
			<p class="fs-13 lh-20 font-semibold text-creation-blue-text">What applicants will see</p>
			<p class="fs-13 lh-20 text-creation-ink-450">
				This is how your conference will appear on MUNMeet once published.
			</p>
		</div>
	</div>
	<!-- Each label is a `<dt>`, its value the `<dd>` inside the same group. -->
	<dl class="mt-1 grid gap-2 lg:ml-12 lg:grid-cols-[263fr_291fr_228fr] lg:gap-0">
		{#each facts as fact, index (fact.label)}
			{@const Icon = ICONS[fact.label] ?? FileText}
			<div
				class={[
					'flex min-w-0 items-center gap-3.5 lg:h-8',
					index === 0 ? 'pl-0.75' : 'lg:border-l lg:border-creation-connector lg:pl-6.75'
				]}
			>
				<Icon class="size-5 shrink-0 text-creation-ink-650" aria-hidden="true" />
				<div class="min-w-0">
					<dt class="fs-13 lh-16 font-semibold text-creation-ink-950">{fact.label}</dt>
					<dd class="truncate fs-13 lh-16 text-creation-ink-300 italic">{fact.value}</dd>
				</div>
			</div>
		{/each}
	</dl>
</div>
