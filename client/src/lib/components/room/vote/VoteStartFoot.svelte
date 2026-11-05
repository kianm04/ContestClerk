<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { PRIMARY_BUTTON_CLASSES, QUIET_BUTTON_CLASSES } from '$lib/console-buttons';
	import { attendanceLine, majorityInWords, type VoteAttendance } from '$lib/vote-view';

	type Props = {
		/** Who is in the room, from the latest roll call. */
		room: VoteAttendance;
		/** The majority chosen, which the line puts into words. */
		majority: string;
		/** Without a roll call "Open vote" waits, and the line says why. */
		hasRollCall: boolean;
		/** The roll call view, opened from this page. */
		rollCallHref: ResolvedPathname;
		/** The `id` of the form "End voting" sends, or null when the room is not voting. */
		endVotingFormId: string | null;
	};

	let { room, majority, hasRollCall, rollCallHref, endVotingFormId }: Props = $props();

	const line = $derived(attendanceLine(room));
</script>

<!--
	The foot of the set-up: the room's attendance and the majority in words,
	then "Open vote", the one filled button. Below quorum the line warns and
	stops nothing; without a roll call it says so in a neutral tone, with the
	way to take one. While the room is voting, a quiet "End voting" sits
	before "Open vote"; it sends a form of its own, named with `form`.
-->
<div class="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
	<p class="text-small text-ink-600">
		{#if hasRollCall}
			<span class={line.isBelowQuorum ? 'text-warning-700' : ''}>{line.text}</span>
			· {majorityInWords(majority)}
		{:else}
			Take roll call before opening a vote.
			<a href={rollCallHref} class="font-medium underline">Take roll call</a>
		{/if}
	</p>
	<div class="flex items-center gap-4 max-md:w-full">
		{#if endVotingFormId}
			<button type="submit" form={endVotingFormId} class={QUIET_BUTTON_CLASSES}>End voting</button>
		{/if}
		<button
			type="submit"
			disabled={!hasRollCall}
			class="{PRIMARY_BUTTON_CLASSES} h-14 min-w-[180px] text-[16px] max-md:flex-1"
		>
			Open vote
		</button>
	</div>
</div>
