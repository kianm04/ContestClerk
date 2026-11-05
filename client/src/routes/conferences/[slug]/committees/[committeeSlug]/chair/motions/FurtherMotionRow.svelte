<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ResolvedPathname } from '$app/types';
	import { motionSubtitle, motionTitle } from '$lib/motion-input';
	import type { SessionMotion } from '$lib/motions';
	import FurtherMotionMenu from './FurtherMotionMenu.svelte';

	type Props = {
		motion: SessionMotion;
		/** Its place in the order the floor goes to the vote. */
		rank: number;
		/** Whether its menu shows: not on an ended session's record. */
		canAct: boolean;
		/** `?motion=<id>`, which puts it to the vote out of order. */
		voteNowHref: ResolvedPathname;
		/** Sends "Withdraw" through the chair's instant form. */
		onSubmit: SubmitFunction;
	};

	let { motion, rank, canAct, voteNowHref, onSubmit }: Props = $props();
</script>

<!-- One compact row: the rank, the motion's title and who raised it, and its "⋯". -->
<li
	class="grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-2.5 border-b border-line py-2.5"
>
	<span class="text-right text-small leading-6 text-ink-600 tabular-nums">{rank}</span>
	<div class="min-w-0">
		<p class="font-medium">{motionTitle(motion)}</p>
		<p class="text-small text-ink-600">{motionSubtitle(motion)}</p>
	</div>
	{#if canAct}
		<FurtherMotionMenu motionId={motion.id} {voteNowHref} {onSubmit} />
	{/if}
</li>
