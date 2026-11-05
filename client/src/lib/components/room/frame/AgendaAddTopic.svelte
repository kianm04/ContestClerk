<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import { NEW_TOPIC_MAX_LENGTH } from '$lib/chair-room';
	import { OUTLINED_BUTTON_CLASSES } from '$lib/console-buttons';

	type Props = {
		/** The live room's `addTopic`, naming the page the chair is on. */
		action: string;
		/** Sends the press through the chair's instant form, so the agenda shows the topic at once. */
		onSubmit: SubmitFunction;
	};

	let { action, onSubmit }: Props = $props();
</script>

<!--
	"Add a topic" at the foot of a quick session's agenda menu
	(`chair/quick-session.md`): its chair is its organiser too, so a topic
	typed here joins the committee's and becomes the agenda in one press.
	`required` keeps an empty field from being sent, with or without
	JavaScript; the server checks again.
-->
<form
	method="post"
	{action}
	use:enhance={onSubmit}
	class="mt-1.5 flex gap-1.5 border-t border-line p-1.5 pt-3"
>
	<label for="agenda-new-topic" class="sr-only">New topic</label>
	<input
		id="agenda-new-topic"
		name="topic"
		required
		maxlength={NEW_TOPIC_MAX_LENGTH}
		autocomplete="off"
		placeholder="Add a topic"
		class="h-9 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 placeholder:text-ink-400 focus:border-transparent focus:ring-2 focus:ring-brand-500 max-md:h-11"
	/>
	<!-- "Add topic" to a screen reader, so it is not taken for the list's own "Add". -->
	<button type="submit" aria-label="Add topic" class="{OUTLINED_BUTTON_CLASSES} h-9 max-md:h-11">
		Add
	</button>
</form>
