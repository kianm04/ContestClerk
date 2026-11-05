<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { SessionMotion } from '$lib/motions';
	import DecidedMotionRow from './DecidedMotionRow.svelte';

	type Props = {
		/** The session's passed, failed, dropped and withdrawn motions, newest first. */
		motions: SessionMotion[];
		/** The conference's time zone, which each decision's time is shown in. */
		timeZone: string;
		/** Whether a dropped motion offers "Restore": not on an ended session's record. */
		canAct: boolean;
		/** Sends "Restore" through the chair's instant form. */
		onSubmit: SubmitFunction;
	};

	let { motions, timeZone, canAct, onSubmit }: Props = $props();
</script>

<!--
	"Decided this session", under "Further motions" and divided from it by a
	rule; left out while nothing is decided. Failed, dropped and withdrawn
	motions stay listed for the record.
-->
{#if motions.length > 0}
	<section aria-labelledby="decided-motions-heading" class="mt-6 border-t border-line pt-5">
		<h2 id="decided-motions-heading" class="mb-1 text-h3">Decided this session</h2>
		<ul>
			<!-- The `(motion.id)` key lets Svelte reuse each row as new decisions arrive on top. -->
			{#each motions as motion (motion.id)}
				<DecidedMotionRow {motion} {timeZone} {canAct} {onSubmit} />
			{/each}
		</ul>
	</section>
{/if}
