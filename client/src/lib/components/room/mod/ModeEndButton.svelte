<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';

	type Props = {
		/** "End caucus" or "Return to GSL". */
		label: string;
		/** The form action it posts to: `?/endCaucus` or `?/returnToGsl`. */
		action: '?/endCaucus' | '?/returnToGsl';
		/** Quieter words beside it, such as "The speaker may finish", or null. */
		note: string | null;
		/** Sends the press through the chair's instant form (`$lib/chair-form.ts`). */
		onSubmit: SubmitFunction;
	};

	let { label, action, note, onSubmit }: Props = $props();
</script>

<!--
	The floor's primary when it ends the mode and takes the room back to the
	General Speakers' List: "End caucus" on the Unmod view, and on the Mod view
	once the caucus time is up; "Return to GSL" once nobody waits for a single
	speaker. It sits where "Next" does, 56px tall, the one filled button.
-->
<form
	method="post"
	{action}
	use:enhance={onSubmit}
	class="flex items-center gap-4 max-[1100px]:flex-1 max-[1100px]:justify-end max-md:w-full max-md:flex-wrap max-md:gap-2"
>
	{#if note}
		<p class="text-small text-ink-600">{note}</p>
	{/if}
	<button
		type="submit"
		class="flex h-14 max-w-90 min-w-60 items-center justify-center rounded-control border border-brand-900 bg-brand-900 px-5 text-base font-medium text-surface hover:border-brand-800 hover:bg-brand-800 max-[1100px]:max-w-none max-[1100px]:flex-1 max-md:min-w-0 max-md:basis-full"
	>
		{label}
	</button>
</form>
