<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { whenInstantFormsAnswered } from '$lib/instant-form.svelte';
	import type { ChairPage } from '$lib/live-mode';
	import { ROLL_CALL_FROM_FIELD } from '$lib/roll-calls';

	type Props = {
		/** The page the view was opened from, which the new roll call's view keeps. */
		from: ChairPage;
	};

	let { from }: Props = $props();

	// A new roll call has an id only the server can give it, so this one press
	// waits for the answer, in the background (`$lib/in-place-form.svelte.ts`),
	// and goes after the answers still on their way, so it never overtakes them.
	const inPlaceForm = createInPlaceForm({ waitBeforeSending: whenInstantFormsAnswered });
</script>

<!--
	"Start a new roll call": a quiet text button at the foot of the view, the
	deliberate way to take a fresh roll call, after lunch say. Every seat
	starts absent again; the earlier one stays in the list above it.
-->
<form method="post" action="?/start" use:enhance={inPlaceForm.submit}>
	{#if from !== 'chair'}
		<input type="hidden" name={ROLL_CALL_FROM_FIELD} value={from} />
	{/if}
	<button
		type="submit"
		disabled={inPlaceForm.isBusy}
		aria-busy={inPlaceForm.isBusy ? 'true' : undefined}
		class="inline-flex min-h-11 items-center font-medium text-ink-600 hover:text-ink-900 disabled:cursor-wait"
	>
		Start a new roll call
	</button>
</form>
