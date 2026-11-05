<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import { sharedChairForm, type ChairSubmitInput } from '$lib/chair-form';
	import { END_SESSION_KEEP_GOING_ID, type SessionControls } from '$lib/chair-frame';
	import { PRESSED_AT_FIELD, serverNow } from '$lib/clock-offset';
	import { focusHeadingAfterPress } from '$lib/room-focus';
	import { suspendPress } from '$lib/room-session-presses';

	type Props = {
		/** Suspend and End, as the mode bar has them from a tablet up. */
		controls: SessionControls;
		/** Called as either is pressed, so the menu folds away. */
		onPress: () => void;
	};

	let { controls, onPress }: Props = $props();

	// The chair layout's instant form (`$lib/chair-form.ts`): the room changes at the press.
	const chairForm = sharedChairForm();

	/**
	 * Suspend folds the menu away; the suspended screen shows at once, its
	 * heading focused (R12), with every clock paused at the press's moment.
	 */
	function handleSuspendPress(input: ChairSubmitInput) {
		const pressed = serverNow(controls.clockOffsetMs);
		input.formData.set(PRESSED_AT_FIELD, pressed.toISOString());
		onPress();
		focusHeadingAfterPress(['suspended-heading']);

		return suspendPress(controls.committeeState, pressed);
	}

	/**
	 * With JavaScript, End asks in place, drawn above the mode bar, rather than
	 * following its link to `?end=confirm`, which is what it does without. The
	 * focus goes to "Keep going", as from the mode bar's own End (R12).
	 */
	function handleEndClick(event: MouseEvent) {
		event.preventDefault();
		onPress();
		controls.onAskToEnd();
		focusHeadingAfterPress([END_SESSION_KEEP_GOING_ID]);
	}

	const ITEM_CLASSES =
		'flex min-h-11 w-full items-center rounded-lg px-3 text-left hover:bg-neutral-100';
</script>

<!--
	On a phone the mode bar has room only for the six views, so Suspend and End
	move into the committee menu (`committee-room.md`, "On a 390 phone").
	`md:hidden` leaves them out from a tablet up, where the mode bar has them.
-->
<div class="border-t border-line pt-1.5 md:hidden">
	{#if controls.isSuspendShown}
		<form
			method="post"
			action={controls.suspendAction}
			use:enhance={chairForm.submitExpecting(handleSuspendPress)}
		>
			<button type="submit" class={ITEM_CLASSES}>Suspend</button>
		</form>
	{/if}
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the page being shown with or without `?end=confirm` (`pageWithQuery`), built from its own address, so there is no route for `resolve()` to build -->
	<a href={controls.confirmHref} onclick={handleEndClick} class={ITEM_CLASSES}>End</a>
</div>
