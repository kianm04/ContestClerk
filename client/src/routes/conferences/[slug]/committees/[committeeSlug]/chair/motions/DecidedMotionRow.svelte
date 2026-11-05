<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { MotionStatus } from '$lib/chair-room';
	import { formatTimeOfDay } from '$lib/dates';
	import { motionTitle } from '$lib/motion-input';
	import { decidedMotionTally, type SessionMotion } from '$lib/motions';
	import { statusLabel } from '$lib/status';

	type Props = {
		/** A motion that passed, failed, was dropped or was withdrawn. */
		motion: SessionMotion;
		/** The conference's time zone, which the time of the decision is shown in. */
		timeZone: string;
		/** Whether a dropped motion offers "Restore": not on an ended session's record. */
		canAct: boolean;
		/** Sends "Restore" through the chair's instant form. */
		onSubmit: SubmitFunction;
	};

	let { motion, timeZone, canAct, onSubmit }: Props = $props();

	/* The status word's colour: words, not badges. Written out in full for Tailwind. */
	const STATUS_CLASSES: Record<MotionStatus, string> = {
		proposed: 'text-ink-600',
		passed: 'text-success-700',
		failed: 'text-danger-700',
		dropped: 'text-ink-600',
		withdrawn: 'text-ink-600'
	};

	const raisedBy = $derived(motion.proposedBy?.name ?? 'the chair');
	const tally = $derived(decidedMotionTally(motion));
	const decidedAt = $derived(motion.decidedAt ? formatTimeOfDay(motion.decidedAt, timeZone) : null);
	// "9–4 · 10:41": the count, or "started without a vote", and the time, as far as there are.
	const details = $derived([tally, decidedAt].filter((part) => part !== null).join(' · '));
	const canRestore = $derived(canAct && motion.status === 'dropped');
</script>

<!--
	One decided motion: the status word, the motion and who raised it, then the
	count and the time it was decided. A dropped motion adds "Restore", a small
	form posting `?/restore`, which puts it back on the floor without
	JavaScript too.
-->
<li
	class="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 border-b border-line py-2 text-small tabular-nums last:border-b-0"
>
	<span class="font-medium {STATUS_CLASSES[motion.status]}">
		{statusLabel('motion_status', motion.status)}
	</span>
	<span>
		{motionTitle(motion)}
		<span class="text-ink-600">· {raisedBy}</span>
	</span>
	<span class="col-start-2 text-ink-600">
		{details}
		{#if canRestore}
			{details ? ' · ' : ''}
			<form method="post" action="?/restore" use:enhance={onSubmit} class="inline">
				<input type="hidden" name="motionId" value={motion.id} />
				<button type="submit" class="font-medium text-brand-700 hover:underline max-md:min-h-11">
					Restore
				</button>
			</form>
		{/if}
	</span>
</li>
