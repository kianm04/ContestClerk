<script lang="ts">
	import type { MajorityType, VoteCounts } from '$lib/committee-room';
	import { tallyBarGeometry } from '$lib/vote-view';

	type Props = {
		/** The votes as counted. Abstentions are not part of the bar. */
		counts: VoteCounts;
		majority: MajorityType;
		/** Whether the mark where the majority is met shows: on an open vote, not on a result. */
		showsMark: boolean;
		/** `display` is the projector's, as thick as a share of the window's width (S12). */
		size?: 'console' | 'display';
	};

	let { counts, majority, showsMark, size = 'console' }: Props = $props();

	/* How thick the bar is: 12px on the console and a phone, 1.4% of the projector's width. */
	const HEIGHT_CLASSES = { console: 'h-3 rounded-md', display: 'h-[1.4vw] rounded-[0.7vw]' };
	/* The mark's words, and the room left above the bar for them, which grow with the projector too. */
	const MARK_ROOM_CLASSES = { console: 'pt-7', display: 'pt-[2.6vw]' };
	const MARK_TEXT_CLASSES = { console: 'text-small', display: 'text-[1.5vw]/[1.3]' };

	// `$derived` works the widths out again whenever the counts change.
	const geometry = $derived(tallyBarGeometry(counts, majority));

	/* How the mark's words hang from it, written out in full so Tailwind can find the classes. */
	const MARK_ALIGN_CLASSES = {
		start: 'items-start',
		center: 'items-center -translate-x-1/2',
		end: 'items-end -translate-x-full'
	};
</script>

<!--
	The straight tally bar (`TallyBar`, components.md): For in green against
	Against in red on a grey track, and a mark where the majority is met,
	"passes at 7 for". The widths change with every press, so they are set in
	a `style` attribute; Tailwind cannot know them in advance. The bar itself
	is a picture of the counts written beside it, so a screen reader skips it.
-->
<div class="relative {showsMark ? MARK_ROOM_CLASSES[size] : ''}">
	{#if showsMark}
		<span
			class="absolute top-0 -bottom-1.5 flex flex-col whitespace-nowrap text-ink-600 {MARK_TEXT_CLASSES[
				size
			]} {MARK_ALIGN_CLASSES[geometry.markAlign]}"
			style="left: {geometry.markPercent}%"
		>
			passes at {geometry.needed} for
			<span aria-hidden="true" class="mt-1 w-0.5 flex-1 bg-ink-900"></span>
		</span>
	{/if}
	<div aria-hidden="true" class="flex overflow-hidden bg-line {HEIGHT_CLASSES[size]}">
		<div
			class="bg-success-500 motion-safe:transition-[width] motion-safe:duration-150"
			style="width: {geometry.forPercent}%"
		></div>
		<div
			class="bg-danger-500 motion-safe:transition-[width] motion-safe:duration-150"
			style="width: {geometry.againstPercent}%"
		></div>
	</div>
</div>
