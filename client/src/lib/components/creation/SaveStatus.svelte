<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import type { AutosaveStatus } from '$lib/autosave-form.svelte';
	import { formatRelativeTime } from '$lib/dates';

	type Props = {
		status: AutosaveStatus | 'none';
		savedAt: string | null;
		now: string;
		/** The conference's timezone, which a save more than a week old is dated in. */
		timezone?: string;
		/** `roomy` on the first three steps, `dense` on Setup and Launch, as the designs draw the footer. */
		density?: 'roomy' | 'dense';
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { status, savedAt, now, timezone = 'Europe/Amsterdam', density = 'roomy' }: Props = $props();

	// `$derived` works this out again whenever `savedAt` or `now` changes. The
	// timezone only matters for a save more than a week old, written as a date.
	// The Organisation step has no conference yet, so it keeps the default.
	const savedWhen = $derived(
		savedAt === null ? null : formatRelativeTime(savedAt, new Date(now), timezone)
	);

	/** The one line for the states that are not "saved". */
	const WORDS = { saving: 'Saving…', unsaved: 'Unsaved changes', failed: 'Could not save' };

	/* The design's pixels for the two sizes of the footer. Written out in full so Tailwind can find the classes. */
	const SIZES = {
		roomy: {
			row: 'gap-5.5',
			circle: 'size-10',
			tick: 'size-5',
			title: 'fs-17 lh-22',
			when: 'fs-14 lh-18'
		},
		dense: {
			row: 'gap-3.75',
			circle: 'size-9.5',
			tick: 'size-5',
			title: 'fs-13 lh-16',
			when: 'fs-11 lh-14'
		}
	};
	const size = $derived(SIZES[density]);
</script>

<!--
	Whether the draft is safe, in the footer's left corner: the green circle
	with a tick and "Draft saved" over "Just now" as the designs draw it, or the
	words for the other states. `aria-live` makes a screen reader say the new
	words when a save finishes or fails.
-->
<div aria-live="polite" class="flex items-center {size.row}">
	{#if status === 'saved'}
		<span
			aria-hidden="true"
			class="flex shrink-0 items-center justify-center rounded-full bg-creation-green text-white {size.circle}"
		>
			<Check class={size.tick} strokeWidth={3} />
		</span>
		<div>
			<p class="font-semibold text-creation-green-text {size.title}">Draft saved</p>
			{#if savedWhen}
				<p class="text-creation-ink-200 {size.when}">{savedWhen}</p>
			{/if}
		</div>
	{:else if status !== 'none'}
		<p
			class="{size.title} {status === 'failed'
				? 'font-semibold text-creation-red'
				: 'text-creation-ink-350'}"
		>
			{WORDS[status]}
		</p>
	{/if}
</div>
