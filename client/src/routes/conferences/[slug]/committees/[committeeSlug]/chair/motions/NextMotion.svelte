<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import CountStepper from '$lib/components/room/CountStepper.svelte';
	import { motionCountLine, motionDecision } from '$lib/motion-count';
	import { motionSubtitle, motionTitle } from '$lib/motion-input';
	import type { SessionMotion } from '$lib/motions';
	import MotionDecision from './MotionDecision.svelte';

	type Props = {
		/** The motion to decide: the most disruptive on the floor, or the one `?motion=` named. */
		motion: SessionMotion;
		/** Whether `?motion=` put it here out of its turn, which the heading says. */
		isOutOfOrder: boolean;
		/** The seats present, or every seat before the session's first roll call. */
		presentCount: number;
		/** The votes for that pass it: a simple majority of `presentCount`. */
		majority: number;
		hasRollCall: boolean;
		/** Sends Pass, Fail and Withdraw through the chair's instant form. */
		onSubmit: SubmitFunction;
	};

	let { motion, isOutOfOrder, presentCount, majority, hasRollCall, onSubmit }: Props = $props();

	/*
		The counts the chair is typing or stepping, null while not counted.
		`$state` redraws the line and the buttons as they change. The page draws
		this component afresh for each motion, so they start empty every time.
	*/
	let votesFor: number | null = $state(null);
	let votesAgainst: number | null = $state(null);

	// What the count means (`$lib/motion-count.ts`), worked out again at every change.
	const facts = $derived({ votesFor, votesAgainst, presentCount, majority, hasRollCall });
	const line = $derived(motionCountLine(facts));
	const decision = $derived(motionDecision(facts));
	const order = $derived(isOutOfOrder ? 'out of order' : 'most disruptive first');
</script>

<!--
	"Next to vote": the motion in large type, the For and Against counts, the
	line that says what they mean, and the decision row, all in one form
	posting to `?/vote`. The motion's title is the largest thing on the view.
-->
<section aria-labelledby="next-motion-heading" class="flex flex-1 flex-col">
	<h2 id="next-motion-heading" class="text-h3">
		Next to vote <span class="font-normal text-ink-600">· {order}</span>
	</h2>

	<form method="post" action="?/vote" use:enhance={onSubmit} class="flex flex-1 flex-col">
		<!--
			Enter in a count field sends the form with its first submit button,
			which would be "Withdraw". A disabled first button stops Enter from
			sending it at all, so a motion is only decided by a press. It is never
			seen or heard; its `aria-label` only says what it is for, so no check
			of the page finds a button without a name.
		-->
		<button
			type="submit"
			disabled
			hidden
			aria-hidden="true"
			aria-label="Enter does not decide the motion"
			tabindex="-1"
		></button>
		<input type="hidden" name="motionId" value={motion.id} />

		<div class="flex flex-1 flex-col justify-center gap-6 py-6">
			<div>
				<p class="font-display text-h1 text-balance">{motionTitle(motion)}</p>
				<p class="mt-1 text-ink-600">{motionSubtitle(motion)}</p>
			</div>
			<div class="flex flex-wrap gap-8 max-md:gap-4">
				<CountStepper
					name="votesFor"
					label="For"
					value={votesFor}
					onChange={(value) => (votesFor = value)}
				/>
				<CountStepper
					name="votesAgainst"
					label="Against"
					value={votesAgainst}
					onChange={(value) => (votesAgainst = value)}
				/>
			</div>
			<!-- `aria-live` reads the line out when the count changes what it says. -->
			<p aria-live="polite" class="text-ink-600">
				{line.majority}
				{#if line.verdict}
					<strong class="font-semibold text-ink-900">{line.verdict}</strong>
				{/if}
				{#if line.rollCallNote}
					{line.rollCallNote}
				{/if}
			</p>
		</div>

		<MotionDecision {decision} />
	</form>
</section>
