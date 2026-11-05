<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import { tick } from 'svelte';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import type { SpeakersListSummary } from '$lib/chair-room';
	import { formatDuration } from '$lib/committee-room';
	import SpeakingTimeField from './SpeakingTimeField.svelte';

	type Props = {
		/** The list's settings, with the presses on their way laid on top. */
		list: SpeakersListSummary;
		/** Whether the address asked for the speaking time field (`?time=change`). */
		isTimeFieldOpen: boolean;
		/** The page with `?time=change`, where "Change" leads without JavaScript. */
		timeFieldHref: ResolvedPathname;
		/** Sends every press through the chair's instant form (`$lib/chair-form.ts`). */
		onSubmit: SubmitFunction;
	};

	let { list, isTimeFieldOpen, timeFieldHref, onSubmit }: Props = $props();

	/** The `id` of "Change", which the focus goes back to when the field closes. */
	const CHANGE_LINK_ID = 'speaking-time-change';

	// Whether the address asks for the field. A `$derived` of its own, so that a
	// reload which keeps the same answer (a realtime change, another press's
	// answer) is no change at all, and leaves the chair's field as it is.
	const isFieldAsked = $derived(isTimeFieldOpen);
	// Whether the field shows. A `$derived` can be assigned to: "Change" and
	// Escape open and close it in place, until the address changes, when it
	// is worked out afresh from `?time=change`.
	let isEditing = $derived(isFieldAsked);

	/** With JavaScript, "Change" opens the field in place instead of following its link. */
	function handleChangeClick(event: MouseEvent) {
		event.preventDefault();
		isEditing = true;
	}

	/** The field closed: put the focus back on "Change" once Svelte has drawn it again. */
	async function handleFieldClose() {
		isEditing = false;
		await tick();
		document.getElementById(CHANGE_LINK_ID)?.focus();
	}
</script>

<!--
	The list's settings, at the foot of the column: "1:30 each · Change" and,
	at the right, "Close list" or "Open list". A closed list keeps its order,
	can still be reordered and called from, and takes no new speakers.
-->
<div class="flex items-center gap-3 border-t border-line pt-2 text-small text-ink-600">
	{#if isEditing}
		<SpeakingTimeField
			listId={list.id}
			speakingTimeSeconds={list.speakingTimeSeconds}
			{onSubmit}
			onClose={handleFieldClose}
		/>
	{:else}
		<span class="tabular-nums">{formatDuration(list.speakingTimeSeconds)} each</span>
		<a
			id={CHANGE_LINK_ID}
			href={timeFieldHref}
			onclick={handleChangeClick}
			class="font-medium text-ink-600 hover:text-ink-900 hover:underline max-md:inline-flex max-md:min-h-11 max-md:items-center"
		>
			Change
		</a>
	{/if}
	<form
		method="post"
		action={list.isOpen ? '?/closeList' : '?/openList'}
		use:enhance={onSubmit}
		class="ml-auto"
	>
		<input type="hidden" name="listId" value={list.id} />
		<button
			type="submit"
			class="font-medium text-ink-600 hover:text-ink-900 hover:underline max-md:min-h-11"
		>
			{list.isOpen ? 'Close list' : 'Open list'}
		</button>
	</form>
</div>
