<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ResolvedPathname } from '$app/types';
	import Button from '$lib/components/Button.svelte';
	import type { ChairPage } from '$lib/live-mode';
	import { ROLL_CALL_FROM_FIELD, type RollCallCounts } from '$lib/roll-calls';
	import RollCallSummary from './RollCallSummary.svelte';

	type Props = {
		/** "Session 1", the session the roll call belongs to. */
		sessionName: string;
		counts: RollCallCounts;
		/** "Quorum 3 · met · majority 4" or "Quorum 3 · 2 more needed". */
		quorumLine: string;
		/** Whether any seat is present: then "Return to the floor" is the filled button. */
		hasAnyonePresent: boolean;
		/** The roll call "Mark all present" answers in, or null before the session's first (R2). */
		rollCallId: string | null;
		/** The page the view was opened from, which "Return to the floor" leads back to. */
		from: ChairPage;
		returnHref: ResolvedPathname;
		/** Sends "Mark all present" through the roll call's instant form. */
		onSubmit: SubmitFunction;
	};

	let {
		sessionName,
		counts,
		quorumLine,
		hasAnyonePresent,
		rollCallId,
		from,
		returnHref,
		onSubmit
	}: Props = $props();
</script>

<!--
	The view's head: "Roll call · Session 1" (an `<h2>`: the page's `<h1>` is
	the top bar's committee), the counts, and the two buttons. "Mark all
	present" is the one filled button until some seat is present; from then on
	"Return to the floor" is (P1). Every answer is saved as it is pressed, so
	there is no "Finish". On a phone the head stacks, the buttons full width.
-->
<header
	class="flex items-start justify-between gap-6 border-b border-line px-8 pt-7 pb-5 max-[1100px]:px-6 max-md:flex-col max-md:gap-3 max-md:px-4 max-md:pt-4 max-md:pb-4"
>
	<div class="min-w-0">
		<h2 class="font-display text-h1 max-md:text-h1-mobile">Roll call · {sessionName}</h2>
		<RollCallSummary {counts} {quorumLine} />
	</div>
	<div class="flex shrink-0 items-center gap-2 max-md:w-full max-md:flex-col max-md:items-stretch">
		<form method="post" action="?/markAllPresent" use:enhance={onSubmit} class="max-md:grid">
			{#if rollCallId !== null}
				<input type="hidden" name="rollCallId" value={rollCallId} />
			{/if}
			{#if from !== 'chair'}
				<input type="hidden" name={ROLL_CALL_FROM_FIELD} value={from} />
			{/if}
			<Button label="Mark all present" variant={hasAnyonePresent ? 'secondary' : 'primary'} />
		</form>
		<Button
			label="Return to the floor"
			variant={hasAnyonePresent ? 'primary' : 'secondary'}
			href={returnHref}
		/>
	</div>
</header>
