<script lang="ts">
	import Close from 'carbon-icons-svelte/lib/Close.svelte';
	import type { ResolvedPathname } from '$app/types';
	import type { SourcePaper } from '$lib/committee-papers';
	import { COMMITTEE_PAPER_TEXT_CLASSES } from '$lib/paper-sheet';

	type Props = {
		/** The working paper open beside the draft, as `readSourcePaper` reads it. */
		source: SourcePaper;
		/** The draft's page with no working paper open. */
		closeHref: ResolvedPathname;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { source, closeHref }: Props = $props();
</script>

<!--
	One working paper the draft is based on, read only, beside the draft's
	text: its kind and number with a link that closes it, its title, who wrote
	it and when the committee introduced it, then its text. Nothing in it is
	copied into the draft. It scrolls with the page.

	`{@html}` draws a string as HTML instead of as text. It is only safe for
	HTML nobody can slip a script into, which is why it only ever draws what
	`renderMarkdown` made on the server.
-->
<section aria-label={source.kindAndNumber}>
	<div class="flex items-center justify-between gap-2 border-b border-foreground">
		<p class="py-2 text-label font-semibold text-foreground">{source.kindAndNumber}</p>
		<!-- 44px to a finger on a phone, smaller from `sm` up, where a mouse presses it. -->
		<a
			href={closeHref}
			aria-label="Close {source.kindAndNumber}"
			class="-mr-2 inline-flex size-11 items-center justify-center rounded-control text-foreground transition-colors duration-150 hover:bg-accent sm:size-8"
		>
			<Close size={16} />
		</a>
	</div>

	<h2 class="mt-4 font-display text-h2 text-foreground">{source.title}</h2>
	<p class="mt-1 text-small text-muted-foreground">{source.metaLine}</p>

	<div class="mt-6 {COMMITTEE_PAPER_TEXT_CLASSES}">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- made safe on the server, as said above -->
		{@html source.bodyHtml}
	</div>
</section>
