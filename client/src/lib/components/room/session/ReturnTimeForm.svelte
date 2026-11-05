<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import { RETURN_TIME_MINUTES } from '$lib/suspension';

	type Props = {
		/** Whether a return time is set already: then the line offers to change it. */
		hasReturnTime: boolean;
		/** The return time as "14:00" in the conference's timezone, or empty while none is set. */
		backAtValue: string;
		/** Sends a press through the chair's instant form, so "Back at" changes at once. */
		onSubmit: SubmitFunction;
	};

	let { hasReturnTime, backAtValue, onSubmit }: Props = $props();

	/* The minute buttons and "Set" share one look: quiet, 36 px tall, 44 on a phone. */
	const CHOICE_CLASSES =
		'h-9 rounded-control border border-line bg-surface px-3 text-small font-medium tabular-nums hover:bg-neutral-100 max-md:h-11';
</script>

<!--
	When the room is due back: 10, 15, 30 or 60 minutes from the press, or a
	time typed in the field and "Set". Two forms side by side, both posting
	`setReturnTime`: a minute button sends its own `minutes`, and Enter in the
	time field presses "Set", the only button of its own form, rather than the
	first minute button. `contents` lets both forms' buttons sit in this one row.
-->
<div class="flex flex-wrap items-center gap-2">
	<span class="mr-1 text-ink-600">
		{hasReturnTime ? 'Change the return time' : 'Set a return time'}
	</span>
	<form method="post" action="?/setReturnTime" use:enhance={onSubmit} class="contents">
		<!-- A list of plain numbers has nothing but its position to be keyed by. -->
		{#each RETURN_TIME_MINUTES as minutes, index (index)}
			<button type="submit" name="minutes" value={minutes} class={CHOICE_CLASSES}>
				{minutes} min
			</button>
		{/each}
	</form>
	<form method="post" action="?/setReturnTime" use:enhance={onSubmit} class="contents">
		<label for="return-time" class="sr-only">Back at</label>
		<input
			id="return-time"
			type="time"
			name="backAt"
			value={backAtValue}
			class="h-9 w-28 rounded-control border border-line bg-surface px-2 text-small tabular-nums max-md:h-11"
		/>
		<button type="submit" class={CHOICE_CLASSES}>Set</button>
	</form>
</div>
