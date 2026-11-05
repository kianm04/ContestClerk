<script lang="ts">
	import type { StatusDotTone } from '$lib/manage-status';

	type Props = {
		/** The words, such as "Applications open", "Paid" or "Day 2 of 3". */
		text: string;
		/** The colour of the dot. */
		tone: StatusDotTone;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { text, tone }: Props = $props();

	/* Written out in full, because Tailwind reads the class names out of this file. */
	const DOT_CLASSES = {
		neutral: 'bg-placeholder',
		success: 'bg-success',
		brand: 'bg-ring',
		warning: 'bg-warning',
		danger: 'bg-destructive'
	};
</script>

<!--
	A few words with a coloured dot in front, as the management pages show a
	status: the conference's under its name in the sidebar, an invoice's
	"Paid" or "Unpaid" in a table. The dot only repeats the words in colour, so
	a screen reader skips it. The words follow the dot with no whitespace
	between (the gap is the flex gap), so the element's text is exactly the
	words: a test looking for text that starts with "Running now" finds it.
-->
<span class="inline-flex items-center gap-2 text-small whitespace-nowrap text-foreground"
	><span aria-hidden="true" class="size-2 shrink-0 rounded-full {DOT_CLASSES[tone]}"
	></span>{text}</span
>
