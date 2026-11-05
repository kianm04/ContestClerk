<script lang="ts">
	import Checkmark from 'carbon-icons-svelte/lib/Checkmark.svelte';
	import { NEW_EDITION } from '$lib/organiser-close';
</script>

<!--
	A drawn "New conference" card: next year's edition with its suggested
	dates, the parts it copies from this year ticked, and a "Continue" button.
	It is a picture of the product, so the card is hidden from screen readers
	and its button is a plain `<span>` that cannot be pressed; the sentence
	before it says what it shows instead.

	`{#each}` draws one ticked line per copied part. The `(part)` in brackets
	is the key: it tells Svelte which line is which, and each part's words are
	different, so they serve.
-->
<p class="sr-only">
	A new conference, {NEW_EDITION.name}, with its dates suggested from 2027 and its committees,
	application form and fees copied from the year before.
</p>

<div
	aria-hidden="true"
	class="flex flex-col rounded-xl bg-surface px-6 pt-5 pb-6 text-small text-ink-900 shadow-card"
>
	<span class="text-caption font-medium text-ink-600">New conference</span>
	<span class="mt-1.5 font-display text-[1.375rem]/[1.75rem] font-semibold">
		{NEW_EDITION.name}
	</span>
	<span class="mt-1 flex flex-wrap items-baseline gap-x-2.5">
		<span class="text-[0.875rem] font-medium tabular-nums">{NEW_EDITION.dates}</span>
		<span class="text-caption text-ink-600">{NEW_EDITION.datesNote}</span>
	</span>

	<div class="mt-4 flex flex-col gap-2 rounded-lg border border-line px-4 py-3.5">
		<span class="font-medium">{NEW_EDITION.copyFrom}</span>
		{#each NEW_EDITION.copiedParts as part (part)}
			<span class="flex items-center gap-2.5">
				<span
					class="flex size-4 flex-none items-center justify-center rounded-[0.1875rem] bg-brand-900 text-surface"
				>
					<Checkmark size={12} />
				</span>
				{part}
			</span>
		{/each}
	</div>

	<span
		class="mt-[1.125rem] self-start rounded-lg bg-brand-900 px-[1.125rem] py-2 font-medium text-surface"
	>
		Continue
	</span>
</div>
