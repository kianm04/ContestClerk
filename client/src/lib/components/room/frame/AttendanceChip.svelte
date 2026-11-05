<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { attendanceChipText, type FramePresence } from '$lib/chair-frame';
	import { KEY_SHORTCUTS } from '$lib/console-keys';
	import Kbd from '$lib/components/Kbd.svelte';

	type Props = {
		/** Who is present, with the roll call presses on their way counted in (`framePresence`). */
		presence: FramePresence;
		/** Whether the session is still opening, when a missing quorum is not yet a problem. */
		isOpening: boolean;
		/** The roll call view, naming the page the chair opens it from. */
		rollCallHref: ResolvedPathname;
	};

	let { presence, isOpening, rollCallHref }: Props = $props();

	// `$derived` works the words out again whenever the count or the room's state changes.
	const text = $derived(attendanceChipText(presence, isOpening));

	/* The two looks, written out in full so Tailwind can find the class names. */
	const NEUTRAL_CLASSES = 'border-line bg-surface text-ink-900 hover:bg-neutral-100';
	const WARNING_CLASSES = 'border-transparent bg-warning-100 text-warning-700';
</script>

<!--
	Who is in the room, as a chip that opens the roll call view; R does the
	same. Before the first roll call it asks for one, in the neutral tone: a
	step not taken yet is not a warning (P4). Only a missing quorum once
	debate has started is drawn in the warning tone.

	A narrower screen leaves the later words out ("5/6 present" from 1100 px
	down, "5/6" on a phone), as `sr-only`, so a screen reader still hears the
	whole sentence. On a phone the chip is 44 px tall, for a thumb.
-->
<a
	href={rollCallHref}
	aria-keyshortcuts={KEY_SHORTCUTS.rollCall}
	class="group/key relative inline-flex h-11 shrink-0 items-center rounded-lg border px-3 text-small whitespace-nowrap tabular-nums md:h-8 {text.isWarning
		? WARNING_CLASSES
		: NEUTRAL_CLASSES}"
>
	<!-- One line of text inside the flex box, so the spaces before "present" and "·" stay. -->
	<span>
		{text.count}<span class="max-md:sr-only">{text.word}</span><span class="max-[1100px]:sr-only"
			>{text.detail}</span
		>
	</span>
	<Kbd keyName={KEY_SHORTCUTS.rollCall} />
</a>
