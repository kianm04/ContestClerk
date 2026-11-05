<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** What needs doing, such as "4 applications are waiting for a decision". */
		title: string;
		/** A quiet second line, such as "The oldest came in 6 days ago." */
		detail?: string;
		/** The button or link that does it. */
		children?: Snippet;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { title, detail, children }: Props = $props();
</script>

<!--
	One line of a list on a management page, with its action on the right. It
	is an `<li>`, so the page puts these rows inside a `<ul>`.

	From `sm` (640px) up the action sits beside the text. On a phone it takes a
	line of its own under the text, right-aligned, rather than squeezing the
	title into half the width beside it: `max-sm:flex-wrap` lets the row wrap
	there, and `basis-full` asks the slot for the whole width, so it always
	does. `min-w-0` lets a long title wrap instead of pushing the action off the
	edge.
-->
<li
	class="flex min-h-13 items-center justify-between gap-x-4 gap-y-1 border-b border-border px-1 py-2 text-dense max-sm:flex-wrap"
>
	<div class="min-w-0">
		<p class="font-medium text-foreground">{title}</p>

		{#if detail}
			<p class="text-small text-muted-foreground">{detail}</p>
		{/if}
	</div>

	{#if children}
		<div class="flex shrink-0 items-center gap-2 max-sm:basis-full max-sm:justify-end">
			{@render children()}
		</div>
	{/if}
</li>
