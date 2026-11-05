<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { ChairForm, ChairSubmitInput } from '$lib/chair-form';
	import type { ChairFrameLinks } from '$lib/chair-frame';
	import { backToGslPress, liveFloorPress } from '$lib/caucus-presses';
	import { PRESSED_AT_FIELD, serverNow } from '$lib/clock-offset';
	import { timerWithAddedSeconds, type TimerSetting } from '$lib/committee-room';
	import {
		SMALL_OUTLINED_BUTTON_CLASSES,
		SMALL_PRIMARY_BUTTON_CLASSES
	} from '$lib/console-buttons';
	import { KEY_SHORTCUTS } from '$lib/console-keys';
	import {
		stripPrimaryAddress,
		type ModeStripControls,
		type StripModeFacts
	} from '$lib/mode-strip';
	import { timerPress, type Floor } from '$lib/room-presses';
	import Kbd from '$lib/components/Kbd.svelte';

	type Props = {
		/** Which buttons the strip has (`liveStripControls`, with `modeStripControls`' primary). */
		controls: ModeStripControls;
		/** What the clock and "Next" work on: the live list and the room's timer (`roomFloor`). */
		floor: Floor;
		timer: TimerSetting;
		/** The live room's actions, naming the page the chair is on (`chairFrameLinks`). */
		links: ChairFrameLinks;
		/** How far the server's clock is ahead of this browser's (`$lib/clock-offset.ts`). */
		clockOffsetMs: number;
		/** The chair's instant form, which shows a press at once (`$lib/chair-form.ts`). */
		submitExpecting: ChairForm['submitExpecting'];
		/** The caucus and its clock, and where "End caucus" and "Return to GSL" post. */
		liveMode: StripModeFacts;
	};

	let { controls, floor, timer, links, clockOffsetMs, submitExpecting, liveMode }: Props = $props();

	/** Stamp a press with its moment on the server's clock, so the stored time is the one shown. */
	function stamp(input: ChairSubmitInput): Date {
		const pressed = serverNow(clockOffsetMs);
		input.formData.set(PRESSED_AT_FIELD, pressed.toISOString());

		return pressed;
	}

	function handleClockPress(input: ChairSubmitInput) {
		return liveFloorPress(
			controls.clock?.formAction ?? '',
			floor,
			liveMode.caucusClock,
			stamp(input)
		);
	}

	function handleAddTimePress(input: ChairSubmitInput) {
		const seconds = controls.addTime?.seconds ?? 0;

		return timerPress(timerWithAddedSeconds(timer, seconds, stamp(input)));
	}

	/** "Next" or "Call" moves the floor; "End caucus" and "Return to GSL" put the GSL back, as the views' own do. */
	function handlePrimaryPress(input: ChairSubmitInput) {
		if (!isNext) return backToGslPress(liveMode.state, liveMode.generalListId);

		return liveFloorPress('?/nextSpeaker', floor, liveMode.caucusClock, stamp(input));
	}

	/** Where the clock button posts: the live room's action for the press it makes. */
	function clockActionAddress(): string {
		if (controls.clock?.formAction === '?/timerStart') return links.timerStartAction;
		if (controls.clock?.formAction === '?/timerPause') return links.timerPauseAction;

		return links.timerResumeAction;
	}

	// "Next" and "Call" call the next speaker; "End caucus" and "Return to GSL" go back to the GSL.
	const isNext = $derived(controls.primary?.action === 'nextSpeaker');
	const primaryAction = $derived(
		stripPrimaryAddress(controls.primary?.action, links.nextSpeakerAction, liveMode.endActions)
	);

	/*
		The console's small buttons (`$lib/console-buttons.ts`), 32px tall.
		`group/key relative` is what the key's hint (`Kbd`) is placed against.
	*/
	const SECONDARY_CLASSES = `${SMALL_OUTLINED_BUTTON_CLASSES} group/key relative h-8 px-2.5`;
	const PRIMARY_CLASSES = `${SMALL_PRIMARY_BUTTON_CLASSES} group/key relative h-8 max-w-56 px-2.5`;
</script>

<!--
	The live view's most used buttons, in one line: the clock, the time button
	and the live view's primary, drawn filled. Each is a form posting to the
	live room's action, which sends the chair back to the page they are on, and
	each declares the key it answers to, so Space, + and N keep working from any
	view. On a phone only the primary stays (`max-md:hidden`).
-->
<div class="ml-auto flex shrink-0 items-center gap-1">
	{#if controls.clock}
		<form
			method="post"
			action={clockActionAddress()}
			use:enhance={submitExpecting(handleClockPress)}
		>
			<input type="hidden" name="seconds" value={floor.startSeconds} />
			<button
				type="submit"
				aria-keyshortcuts={KEY_SHORTCUTS.clock}
				class="{SECONDARY_CLASSES} max-md:hidden"
			>
				{controls.clock.label}
				<Kbd keyName={KEY_SHORTCUTS.clock} />
			</button>
		</form>
	{/if}
	{#if controls.addTime}
		<form
			method="post"
			action={links.timerAddAction}
			use:enhance={submitExpecting(handleAddTimePress)}
		>
			<input type="hidden" name="seconds" value={controls.addTime.seconds} />
			<button
				type="submit"
				aria-keyshortcuts={KEY_SHORTCUTS.addTime}
				class="{SECONDARY_CLASSES} max-md:hidden"
			>
				{controls.addTime.label}
				<Kbd keyName={KEY_SHORTCUTS.addTime} />
			</button>
		</form>
	{/if}
	{#if controls.primary}
		<form method="post" action={primaryAction} use:enhance={submitExpecting(handlePrimaryPress)}>
			<button
				type="submit"
				aria-keyshortcuts={isNext ? KEY_SHORTCUTS.next : undefined}
				class={PRIMARY_CLASSES}
			>
				<span class="truncate">{controls.primary.label}</span>
				{#if isNext}
					<Kbd keyName={KEY_SHORTCUTS.next} />
				{/if}
			</button>
		</form>
	{/if}
</div>
