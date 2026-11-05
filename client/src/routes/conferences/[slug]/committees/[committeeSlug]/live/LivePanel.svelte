<script lang="ts">
	// `Snippet` is the type of `children`: whatever the page writes between
	// `<LivePanel>` and `</LivePanel>`, which `{@render children()}` draws.
	import type { Snippet } from 'svelte';

	type Props = {
		/** The panel's heading, such as "Speakers’ list", or null for a panel with none. */
		title?: string | null;
		/** What the panel holds. */
		children: Snippet;
	};

	let { title = null, children }: Props = $props();

	// `$props.id()` gives this panel an id of its own, the same on the server and
	// in the browser, so its heading can name the panel for a screen reader.
	const headingId = $props.id();
</script>

<!--
	One white panel of the live view, with a hairline border and a 16px radius,
	as the console draws its floor and queue. With a title it is a named region
	a screen-reader user can jump to.
-->
<section
	aria-labelledby={title ? headingId : undefined}
	class="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-4"
>
	{#if title}
		<h2 id={headingId} class="text-[15px]/6 font-semibold break-words">{title}</h2>
	{/if}
	{@render children()}
</section>
