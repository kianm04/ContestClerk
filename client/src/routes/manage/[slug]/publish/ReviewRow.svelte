<script lang="ts">
	import { reviewRowLinkName, type PublishReviewRow } from '$lib/publish-review';

	type Props = {
		/** One row of "What goes public", from `publishReviewRows` in `$lib/publish-review.ts`. */
		row: PublishReviewRow;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { row }: Props = $props();

	// "Edit committees" rather than a fourth "Edit", for a screen reader that
	// lists the page's links on their own. `$derived` follows `row`.
	const linkName = $derived(reviewRowLinkName(row));
</script>

<!--
	One part of the conference as visitors will read it: a quiet label, what
	is there, and a link to the page that changes it. `flex-wrap` and the
	`basis-*` widths drop the text under the label on a phone. From `sm` up the
	row stays on one line, and the middle column gives way to a long link such
	as "Set the application window".
-->
<li
	class="flex flex-wrap items-start gap-x-6 gap-y-1 border-b border-border px-1 py-3.5 text-dense sm:flex-nowrap"
>
	<p class="shrink-0 basis-33 text-muted-foreground">{row.label}</p>

	<div class="min-w-0 flex-1 basis-70 sm:basis-0">
		<!-- The lines are plain strings with no id of their own, so they are keyed by position. -->
		{#each row.lines as line, index (index)}
			<p class="text-foreground">{line}</p>
		{/each}

		{#if row.detail}
			<p class="text-small text-muted-foreground">{row.detail}</p>
		{/if}

		{#if row.missing}
			<p class="text-small font-medium text-destructive">{row.missing}</p>
		{/if}
	</div>

	<a href={row.href} aria-label={linkName} class="shrink-0 font-medium text-link">{row.linkLabel}</a
	>
</li>
