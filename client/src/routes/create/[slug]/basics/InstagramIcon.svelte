<script lang="ts">
	type Props = {
		/** The size, as a class such as `size-4.5`, so it counts in the design's pixels. */
		class?: string;
	};

	// `class` is a reserved word in JavaScript, so it is renamed on the way in.
	let { class: className }: Props = $props();
</script>

<!--
	The Instagram mark the design draws. Lucide dropped its brand icons, so this
	is lucide's old `instagram` glyph copied in, drawn like every lucide icon:
	a 24 unit box, a 2 unit stroke in the colour of the words around it.
-->
<svg
	class={className}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
	<path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
	<line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
</svg>
