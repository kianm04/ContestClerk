<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ResolvedPathname } from '$app/types';

	/** A link at the right of the heading, to the page that holds all of it. */
	export type SectionLink = {
		label: string;
		/** Built with a helper from `$lib/urls.ts`. */
		href: ResolvedPathname;
	};

	type Props = {
		title: string;
		/** Such as "All applications" beside "Waiting for a decision". */
		link?: SectionLink;
		/** The rows, the table or the list under the heading. */
		children: Snippet;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { title, link, children }: Props = $props();
</script>

<!--
	A block on a management page, such as "Needs you" on the dashboard. The dark
	rule under the heading is what separates one block from the next; the rows
	inside draw their own thin grey lines. `aria-label` names the section after
	its title, so a screen reader can jump to it.

	On a phone (below `sm`, 640px) the title link is the 44px a finger needs
	(`min-h-11`) without making the heading row any taller: `-my-3` takes back,
	above and below, exactly the 24px that `min-h-11` adds around a 20px line of
	text. The row keeps its height, the title and the link stay on one baseline,
	and the pressable box reaches into the empty space above the row and the
	padding under it instead. From `sm` up the link is as tall as its words, as
	it always was.
-->
<section aria-label={title} class="flex min-w-0 flex-col">
	<div class="flex items-baseline justify-between gap-4 border-b border-foreground pb-2.5">
		<h2 class="text-h3 text-foreground">{title}</h2>

		{#if link}
			<a
				href={link.href}
				class="-my-3 inline-flex min-h-11 items-center text-dense font-medium text-link sm:my-0 sm:min-h-0"
				>{link.label}</a
			>
		{/if}
	</div>

	{@render children()}
</section>
