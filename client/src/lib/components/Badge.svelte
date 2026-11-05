<script lang="ts">
	import type { BadgeTone } from '$lib/status';

	type Props = {
		/**
		 * The colour. `statusBadgeTone(enumName, value)` in `$lib/status` picks it
		 * for any database status, so pages rarely choose one by hand.
		 */
		tone: BadgeTone;
		/** The words. Colour is never the only signal, so a badge always says something. */
		label: string;
		/**
		 * Cut a long label short with "…" instead of letting it wrap onto a second
		 * line. The mouse shows the whole label, and a screen reader still reads it.
		 */
		isShortened?: boolean;
	};

	let { tone, label, isShortened = false }: Props = $props();

	/* Written out in full, because Tailwind reads the class names out of this
	   file and cannot follow a name that is glued together while the page runs. */
	const TONE_CLASSES = {
		brand: 'bg-brand-100 text-brand-900',
		success: 'bg-success-100 text-success-700',
		warning: 'bg-warning-100 text-warning-700',
		danger: 'bg-danger-100 text-danger-700',
		neutral: 'bg-neutral-100 text-neutral-700'
	};

	const toneClass = $derived(TONE_CLASSES[tone]);

	/* A shortened badge is a block that clips its text, because a flex box
	   cannot end its words with "…". */
	const shapeClass = $derived(
		isShortened ? 'inline-block max-w-full truncate align-middle' : 'inline-flex items-center'
	);
</script>

<span
	class="{shapeClass} rounded-full px-2.5 py-0.5 text-small font-medium {toneClass}"
	title={isShortened ? label : undefined}
>
	{label}
</span>
