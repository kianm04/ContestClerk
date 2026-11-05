<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { MotionToDecide } from '$lib/motions';
	import EmptyNextMotion from './EmptyNextMotion.svelte';
	import NextMotion from './NextMotion.svelte';

	type Props = {
		/** The motion to decide and whether it is out of order (`motionToDecide` in `$lib/motions.ts`). */
		toDecide: MotionToDecide;
		/** The seats present, or every seat before the session's first roll call. */
		presentCount: number;
		/** The votes for that pass a motion. */
		majority: number;
		hasRollCall: boolean;
		/** Sends Pass, Fail and Withdraw through the chair's instant form. */
		onSubmit: SubmitFunction;
	};

	let { toDecide, presentCount, majority, hasRollCall, onSubmit }: Props = $props();
</script>

<!--
	"Next to vote": the motion to decide, or the empty floor. `{#key}` draws
	what is inside afresh whenever the motion to decide changes, so the counts
	typed for the last motion start empty again.
-->
{#if toDecide.motion}
	{#key toDecide.motion.id}
		<NextMotion
			motion={toDecide.motion}
			isOutOfOrder={toDecide.isOutOfOrder}
			{presentCount}
			{majority}
			{hasRollCall}
			{onSubmit}
		/>
	{/key}
{:else}
	<EmptyNextMotion />
{/if}
