<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { TimerSetting } from '$lib/committee-room';
	import { unmodClockButton } from '$lib/caucus-view';
	import { KEY_SHORTCUTS } from '$lib/console-keys';
	import FloorButton from '../floor/FloorButton.svelte';

	type Props = {
		/** The caucus's one clock, with the presses on their way laid on top. */
		timer: TimerSetting;
		/** Sends every press through the chair's instant form (`$lib/chair-form.ts`). */
		onSubmit: SubmitFunction;
	};

	let { timer, onSubmit }: Props = $props();

	/** The `id`s of the two hidden forms the buttons send. */
	const CLOCK_FORM_ID = 'unmod-clock';
	const ADD_MINUTE_FORM_ID = 'unmod-add-minute';

	/** The seconds "+1 min" adds. It records nothing; an extension the room votes on is a motion. */
	const ADDED_SECONDS = 60;

	// "Pause" or "Resume", and the action it posts to (`$lib/caucus-view.ts`).
	const clock = $derived(unmodClockButton(timer));
</script>

<!--
	The Unmod view's two clock controls, at the left of its floor: the clock
	button (Space), one fixed width so "Pause" becoming "Resume" moves nothing,
	and "+1 min" (the + key in this view). Each button sends a hidden form of
	its own through its `form` attribute; `use:enhance` improves each form once
	JavaScript has loaded, and without it they post and reload.
-->
<form id={CLOCK_FORM_ID} method="post" action="?/timerResume" class="hidden" use:enhance={onSubmit}>
	{#if clock.formAction === '?/timerStart'}
		<input type="hidden" name="seconds" value={timer.totalSeconds ?? ADDED_SECONDS} />
	{/if}
</form>
<form
	id={ADD_MINUTE_FORM_ID}
	method="post"
	action="?/timerAdd"
	class="hidden"
	use:enhance={onSubmit}
>
	<input type="hidden" name="seconds" value={ADDED_SECONDS} />
</form>

<div class="flex items-center gap-2 max-md:gap-1.5">
	<FloorButton
		label={clock.label}
		form={CLOCK_FORM_ID}
		formaction={clock.formAction}
		keyShortcut={KEY_SHORTCUTS.clock}
		widthClasses="w-28 max-md:w-21"
	/>
	<FloorButton
		label="+1 min"
		form={ADD_MINUTE_FORM_ID}
		formaction="?/timerAdd"
		keyShortcut={KEY_SHORTCUTS.addTime}
		isDisabled={timer.totalSeconds === null}
	/>
</div>
