<script lang="ts">
	type Props = {
		/** The paper's whole text as HTML, drawn by `renderMarkdown` on the server. */
		html: string;
	};

	let { html }: Props = $props();
</script>

<!--
	A paper without clauses, such as a working paper, shown whole: its
	paragraphs, lists and headings as its authors wrote them, at the size of a
	clause, scrolling inside the projector's paper area when it is long.

	`{@html}` draws a string as HTML instead of as text. It is only safe for HTML
	nobody can slip a script into, which is why it only ever draws what
	`renderMarkdown` made on the server.
-->
<div
	class={[
		'max-w-[76vw]',
		'[&_li]:mb-[0.6vw] [&_li]:pl-[0.6vw] [&_li>p]:mb-0 [&_p]:mb-[1vw] [&>:last-child]:mb-0',
		'[&_:is(ul,ol)]:pl-[3.4vw] [&_li]:marker:tabular-nums [&_ol]:list-decimal [&_ul]:list-disc',
		'[&_:is(h1,h2,h3)]:font-display [&_:is(h1,h2,h3)]:font-semibold'
	]}
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- made safe on the server, as said above -->
	{@html html}
</div>
