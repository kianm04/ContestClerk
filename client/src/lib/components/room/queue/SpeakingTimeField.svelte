<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import { formatDuration } from '$lib/committee-room';
	import { SPEAKING_TIME_FIELD } from '$lib/speaking-time';

	type Props = {
		listId: string;
		/** The list's speaking time now, which the field starts from: "1:30". */
		speakingTimeSeconds: number;
		/** Sends "Save" through the chair's instant form, which shows the new time at once. */
		onSubmit: SubmitFunction;
		/** Called when the field closes: once a time is saved, or on Escape. */
		onClose: () => void;
	};

	let { listId, speakingTimeSeconds, onSubmit, onClose }: Props = $props();

	/** Escape closes the field without saving. */
	function handleKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;

		// The console's keys must not also act on this Escape.
		event.preventDefault();
		onClose();
	}

	/** Close the field at once and hand the press on; the new time shows the moment it is saved. */
	const submitAndClose: SubmitFunction = (input) => {
		onClose();
		return onSubmit(input);
	};
</script>

<!--
	The speaking time, typed the MUN way: "1:30", "90s", or "2" for two
	minutes. Enter in the field sends the form, as in any form; Escape cancels.
	The chair asked for the field by pressing "Change", so the cursor is put
	in it (`autofocus`); nothing else moves the focus into a text field.
-->
<form
	method="post"
	action="?/setSpeakingTime"
	use:enhance={submitAndClose}
	class="inline-flex items-center gap-2"
>
	<input type="hidden" name="listId" value={listId} />
	<label for="speaking-time" class="sr-only">Speaking time</label>
	<!-- svelte-ignore a11y_autofocus -->
	<input
		id="speaking-time"
		name={SPEAKING_TIME_FIELD}
		value={formatDuration(speakingTimeSeconds)}
		autocomplete="off"
		autofocus
		onkeydown={handleKeydown}
		class="h-8 w-16 rounded-control border border-line bg-surface px-2 text-center text-small tabular-nums focus:border-transparent focus:ring-2 focus:ring-brand-500"
	/>
	<button type="submit" class="font-medium text-brand-700 hover:underline max-md:min-h-11">
		Save
	</button>
</form>
