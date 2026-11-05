<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import CirclePause from '@lucide/svelte/icons/circle-pause';
	import CircleStop from '@lucide/svelte/icons/circle-stop';
	import { buttonClasses } from '$lib/button-classes';
	import { sharedChairForm, type ChairSubmitInput } from '$lib/chair-form';
	import {
		END_SESSION_ASK_ID,
		END_SESSION_KEEP_GOING_ID,
		type SessionControls
	} from '$lib/chair-frame';
	import { PRESSED_AT_FIELD, serverNow } from '$lib/clock-offset';
	import { QUIET_BUTTON_CLASSES } from '$lib/console-buttons';
	import { KEY_SHORTCUTS } from '$lib/console-keys';
	import { focusHeadingAfterPress } from '$lib/room-focus';
	import { endSessionPress } from '$lib/room-presses';
	import { suspendPress } from '$lib/room-session-presses';
	import Button from '$lib/components/Button.svelte';

	type Props = {
		/** Suspend and End, and End's confirmation (`SessionControls` in `$lib/chair-frame.ts`). */
		controls: SessionControls;
	};

	let { controls }: Props = $props();

	/**
	 * With JavaScript, End asks in place without following its link, and the
	 * focus goes to "Keep going" (R12). `focusHeadingAfterPress` waits for the
	 * confirmation to be drawn, then focuses the element with that id.
	 */
	function handleEndClick(event: MouseEvent) {
		event.preventDefault();
		controls.onAskToEnd();
		focusHeadingAfterPress([END_SESSION_KEEP_GOING_ID]);
	}

	/** "Keep going", or Escape, which presses it: End comes back, with the focus on it. */
	function handleKeepGoingClick(event: MouseEvent) {
		event.preventDefault();
		controls.onKeepGoing();
		focusHeadingAfterPress([END_SESSION_ASK_ID]);
	}

	// The chair layout's instant form (`$lib/chair-form.ts`): the room changes
	// the moment a button is pressed. Without JavaScript each form posts and reloads.
	const chairForm = sharedChairForm();

	/**
	 * Suspend: the suspended screen shows at once, and the focus goes to its
	 * heading (R12). The press carries its moment on the server's clock
	 * (`pressedAt`), at which every clock pauses, so the stored clocks are the
	 * ones the screen already shows.
	 */
	function handleSuspendPress(input: ChairSubmitInput) {
		const pressed = serverNow(controls.clockOffsetMs);
		input.formData.set(PRESSED_AT_FIELD, pressed.toISOString());
		focusHeadingAfterPress(['suspended-heading']);

		return suspendPress(controls.committeeState, pressed);
	}

	/** "End session": the ended screen shows at once, and the focus goes to its heading (R12). */
	function handleEndSessionPress() {
		controls.onKeepGoing();
		focusHeadingAfterPress(['ended-heading']);

		return endSessionPress(controls.session, serverNow(controls.clockOffsetMs));
	}

	const sessionName = $derived(controls.session?.name ?? 'the session');

	// The console's quiet button (`$lib/console-buttons.ts`), with room for its icon.
	const QUIET_CLASSES = `${QUIET_BUTTON_CLASSES} gap-2 px-4`;
</script>

<!--
	Suspend and End at the far right of the mode bar, after a divider, as quiet
	text buttons. End never opens a dialog: pressed, this end of the bar becomes
	"End Session 1?", "Keep going" and "End session", the one danger button on
	the floor. Without JavaScript End is a link to the same page with
	`?end=confirm`, which draws the same confirmation, and "Keep going" a link
	back without it. On a phone the mode bar has no room for them (they are in
	the committee menu), so the confirmation is drawn full width above the bar.
-->
{#if controls.isConfirming}
	<div
		class="flex items-center gap-2 font-medium max-md:fixed max-md:inset-x-0 max-md:bottom-16 max-md:z-20 max-md:justify-end max-md:border-t max-md:border-line max-md:bg-surface max-md:p-2 md:ml-auto md:pl-4"
	>
		<p class="mr-auto md:mr-1">End {sessionName}?</p>
		<!-- eslint-disable svelte/no-navigation-without-resolve -- the page being shown without `?end=confirm` (`pageWithQuery`), built from its own address, so there is no route for `resolve()` to build -->
		<a
			id={END_SESSION_KEEP_GOING_ID}
			href={controls.cancelHref}
			aria-keyshortcuts={KEY_SHORTCUTS.close}
			onclick={handleKeepGoingClick}
			class={buttonClasses('secondary', 'md', false)}
		>
			Keep going
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
		<form
			method="post"
			action={controls.endSessionAction}
			use:enhance={chairForm.submitExpecting(handleEndSessionPress)}
		>
			<input type="hidden" name="confirm" value="1" />
			<Button label="End session" variant="danger" />
		</form>
	</div>
{:else}
	<div
		class="ml-auto flex items-center gap-1 pl-4 before:mr-3 before:h-7 before:w-px before:bg-line max-md:hidden"
	>
		{#if controls.isSuspendShown}
			<form
				method="post"
				action={controls.suspendAction}
				use:enhance={chairForm.submitExpecting(handleSuspendPress)}
			>
				<button type="submit" class={QUIET_CLASSES}>
					<CirclePause size={20} strokeWidth={1.75} aria-hidden="true" />
					Suspend
				</button>
			</form>
		{/if}
		<!-- eslint-disable svelte/no-navigation-without-resolve -- the page being shown with `?end=confirm` (`pageWithQuery`), built from its own address, so there is no route for `resolve()` to build -->
		<a
			id={END_SESSION_ASK_ID}
			href={controls.confirmHref}
			onclick={handleEndClick}
			class={QUIET_CLASSES}
		>
			<CircleStop size={20} strokeWidth={1.75} aria-hidden="true" />
			End
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</div>
{/if}
