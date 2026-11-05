<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import type { RoomSeat, TimerSetting } from '$lib/committee-room';
	import { KEY_SHORTCUTS } from '$lib/console-keys';
	import { clockButton } from '$lib/floor-clock';
	import FloorButton from './FloorButton.svelte';
	import FloorMoreMenu from './FloorMoreMenu.svelte';
	import YieldMenu from './YieldMenu.svelte';

	type Props = {
		/** The speaker's timer, with the presses on their way laid on top. */
		timer: TimerSetting;
		/** What "Start" starts when the speaker has no timer at all: the list's speaking time. */
		startSeconds: number;
		/** The present seats the speaker may yield to, their own left out. */
		yieldSeats: RoomSeat[];
		/** The Notes page open on the speaker's seat, for "Note on this speech". */
		noteHref: ResolvedPathname;
		/** Sends every press through the chair's instant form (`$lib/chair-form.ts`). */
		onSubmit: SubmitFunction;
		/** Whether "Yield" is drawn. A moderated caucus has no yields (`mod.md`). */
		canYield?: boolean;
	};

	let { timer, startSeconds, yieldSeats, noteHref, onSubmit, canYield = true }: Props = $props();

	/** The `id` of the form the clock button, "+15 s" and "End speech" send. */
	const CONTROLS_FORM_ID = 'speech-controls';

	// "Start", "Pause" or "Resume", and the action it posts to (`$lib/floor-clock.ts`).
	const clock = $derived(clockButton(timer));
</script>

<!--
	The five speech controls, always in this order and place: the clock button,
	"+15 s", "Yield ▾", "End speech" and "⋯". The clock button has one fixed
	width, so "Start" becoming "Pause" and "Resume" moves nothing. "End speech"
	is a plain button, not red: ending a speech is routine.

	The three plain buttons send one hidden form through their `form`
	attribute, so the two menus, each a form of its own, can sit between them.
	`use:enhance` is a Svelte action: once JavaScript has loaded it sends the
	form in the background and the screen changes at once (T141). Without
	JavaScript the form posts and the page reloads.

	On a phone the five sit in one row along the bottom of the screen, so their
	padding and gaps are tight: on a 390px phone at the site's 1.1 scale the
	row only just fits, and a second row would cover the speakers' list.
-->
<form
	id={CONTROLS_FORM_ID}
	method="post"
	action="?/timerResume"
	class="hidden"
	use:enhance={onSubmit}
>
	{#if clock.formAction === '?/timerStart'}
		<input type="hidden" name="seconds" value={startSeconds} />
	{/if}
</form>

<div class="flex items-center gap-2 max-md:flex-wrap max-md:gap-1">
	<FloorButton
		label={clock.label}
		form={CONTROLS_FORM_ID}
		formaction={clock.formAction}
		keyShortcut={KEY_SHORTCUTS.clock}
		widthClasses="w-28 max-md:w-21"
	/>
	<FloorButton
		label="+15 s"
		form={CONTROLS_FORM_ID}
		formaction="?/timerAdd"
		keyShortcut={KEY_SHORTCUTS.addTime}
		isDisabled={timer.totalSeconds === null}
	/>
	{#if canYield}
		<YieldMenu seats={yieldSeats} {onSubmit} />
	{/if}
	<FloorButton
		label="End speech"
		shortLabel="End"
		form={CONTROLS_FORM_ID}
		formaction="?/endSpeech"
		keyShortcut={KEY_SHORTCUTS.endSpeech}
	/>
	<FloorMoreMenu {noteHref} {onSubmit} />
</div>
