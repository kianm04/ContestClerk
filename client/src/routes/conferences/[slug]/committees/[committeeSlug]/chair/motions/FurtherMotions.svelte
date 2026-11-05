<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { SessionMotion } from '$lib/motions';
	import { chairMotionsMotionUrl } from '$lib/urls';
	import FurtherMotionRow from './FurtherMotionRow.svelte';

	type Props = {
		/** The floor in rank order, less the motion "Next to vote" shows. */
		motions: SessionMotion[];
		/** Each motion's place in the order the whole floor goes to the vote, by id. */
		ranks: Record<string, number>;
		/** Whether anything is on the floor, the motion to decide included: "Clear the floor" shows then. */
		hasFloor: boolean;
		/** Whether the rows can be acted on: not on an ended session's record. */
		canAct: boolean;
		conferenceSlug: string;
		committeeSlug: string;
		/** Sends "Withdraw" and "Clear the floor" through the chair's instant form. */
		onSubmit: SubmitFunction;
	};

	let { motions, ranks, hasFloor, canAct, conferenceSlug, committeeSlug, onSubmit }: Props =
		$props();
</script>

<!--
	"Further motions": the rest of the floor, in the order it goes to the
	vote, with how many at the right. Under the rows, while anything is on the
	floor, "Clear the floor", a quiet button of its own small form.
-->
<section aria-labelledby="further-motions-heading">
	<header class="mb-3 flex items-baseline justify-between gap-3">
		<h2 id="further-motions-heading" class="text-h3">Further motions</h2>
		{#if motions.length > 0}
			<span class="text-small text-ink-600 tabular-nums">{motions.length}</span>
		{/if}
	</header>

	{#if motions.length === 0}
		<p class="py-2 text-small text-ink-600">None</p>
	{:else}
		<ul>
			<!-- The `(motion.id)` key lets Svelte reuse each row as the floor is re-ranked. -->
			{#each motions as motion (motion.id)}
				<FurtherMotionRow
					{motion}
					rank={ranks[motion.id] ?? 0}
					{canAct}
					voteNowHref={chairMotionsMotionUrl(conferenceSlug, committeeSlug, motion.id)}
					{onSubmit}
				/>
			{/each}
		</ul>
	{/if}

	{#if canAct && hasFloor}
		<form method="post" action="?/clearFloor" use:enhance={onSubmit} class="mt-2">
			<button
				type="submit"
				class="min-h-8 text-small font-medium text-ink-600 hover:underline max-md:min-h-11"
			>
				Clear the floor
			</button>
		</form>
	{/if}
</section>
