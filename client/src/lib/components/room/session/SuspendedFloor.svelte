<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import { sharedChairForm, type ChairSubmitInput } from '$lib/chair-form';
	import type { CommitteeStateView } from '$lib/chair-room';
	import { createClockOffsetGuess, PRESSED_AT_FIELD, serverNow } from '$lib/clock-offset';
	import { formatTimeOfDay } from '$lib/dates';
	import { focusHeadingAfterPress } from '$lib/room-focus';
	import { ROOM_SCREEN_CLASSES, ROOM_TITLE_CLASSES } from '$lib/room-screen-classes';
	import { resumePress, returnTimePress } from '$lib/room-session-presses';
	import type { Suspension } from '$lib/suspension';
	import ReturnTimeForm from './ReturnTimeForm.svelte';
	import SuspensionLine from './SuspensionLine.svelte';

	type Props = {
		/** "Suspended", or "Suspended for lunch" (`suspendedTitle`). */
		title: string;
		/** When the room was suspended, and when it is due back (`suspensionOf`). */
		suspension: Suspension;
		/** "When the session resumes: GSL, China with 0:52 left" (`resumeSentence`). */
		resumeSentence: string;
		/** The room's state with the presses on their way laid on top, which "Resume session" restores. */
		state: CommitteeStateView;
		/** The conference's timezone, which the return time is read and written in. */
		timezone: string;
		/** The latest reading of how far the server's clock is ahead of this browser's. */
		clockOffsetSampleMs: number;
		/** This page with `?end=confirm`: "End session" on a phone, whose mode bar has no End. */
		endHref: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { title, suspension, resumeSentence, state, timezone, clockOffsetSampleMs, endHref }: Props =
		$props();

	/** The headings of the views "Resume session" can bring back, where the focus then goes (R12). */
	const RESUMED_VIEW_HEADING_IDS = ['gsl-floor-title', 'live-view-heading'];

	// The chair layout's instant form (`$lib/chair-form.ts`): the room changes the
	// moment a button is pressed. Without JavaScript each form posts and reloads.
	const chairForm = sharedChairForm();
	const clockOffsetGuess = createClockOffsetGuess();
	// `$derived` works these out again whenever what they read changes.
	const clockOffsetMs = $derived(clockOffsetGuess.learn(clockOffsetSampleMs));
	const hasReturnTime = $derived(suspension.suspendedUntil !== null);
	const backAtValue = $derived(
		suspension.suspendedUntil === null ? '' : formatTimeOfDay(suspension.suspendedUntil, timezone)
	);

	/**
	 * A return time: stamped with the moment of the press on the server's
	 * clock, so "in 15 min" counts from the moment the chair saw (T139).
	 */
	function handleReturnTimePress(input: ChairSubmitInput) {
		const pressed = serverNow(clockOffsetMs);
		input.formData.set(PRESSED_AT_FIELD, pressed.toISOString());

		return returnTimePress(input.formData, pressed, timezone);
	}

	/** "Resume session": the suspended view comes back at once, with the focus on its heading. */
	function handleResumePress() {
		focusHeadingAfterPress(RESUMED_VIEW_HEADING_IDS);

		return resumePress(state);
	}

	const submitReturnTime = chairForm.submitExpecting(handleReturnTimePress);
	const submitResume = chairForm.submitExpecting(handleResumePress);
</script>

<!--
	The live room while the session is suspended (`committee-room.md`,
	"Suspended"): the title as the page's heading, when the room is due back,
	the return time, what "Resume session" brings back, and that button, this
	screen's one filled button. The heading takes the focus once Suspend
	brings this screen in (`tabindex="-1"`). On a phone the mode bar has no
	End, so "End session" waits here, quiet, beside "Resume session".
-->
<section aria-labelledby="suspended-heading" class={ROOM_SCREEN_CLASSES}>
	<div>
		<h1 id="suspended-heading" tabindex="-1" class={ROOM_TITLE_CLASSES}>{title}</h1>
		<SuspensionLine {suspension} {timezone} {clockOffsetMs} />
	</div>

	<ReturnTimeForm {hasReturnTime} {backAtValue} onSubmit={submitReturnTime} />

	<p class="text-ink-600">{resumeSentence}</p>

	<div class="flex flex-wrap items-center gap-x-6 gap-y-2">
		<form
			method="post"
			action="?/resume"
			use:enhance={submitResume}
			class="grid min-w-50 max-md:w-full"
		>
			<Button label="Resume session" variant="primary" size="lg" isFullWidth />
		</form>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- this page with `?end=confirm` (`pageWithQuery`), built from its own address -->
		<a href={endHref} class="inline-flex min-h-11 items-center font-medium text-ink-600 md:hidden">
			End session
		</a>
	</div>
</section>
