<script lang="ts">
	import { CONFERENCES_HERO_IMAGE_PATH } from '$lib/media';
</script>

<!--
	The top of the directory, after the product owner's mockup (Trello WMcXfry0):
	a picture of a building flying the UN flag, which the search box and the
	quick filter chips sit on (Trello VtIlOpkB). The mockup's line of words
	beside it went when the product owner asked for the search box to move up.

	The picture is `absolute`, so it is placed against the nearest positioned
	element around it, the full-width wrapper in `+page.svelte`. That is what lets
	it reach the right edge of the window while the search box keeps to the
	page's width. It is the hero's background: the search box and the chips come
	after it in the page and are `relative`, so they are drawn on top of it. Its
	left edge fades into the page inside the picture file itself. Its bottom edge
	is cut crisply through the middle of the chips, which hide the cut, and past
	their right end it curves gently down to the window's edge, stopping above
	the results.

	The picture keeps its shape, so its width is what sets how far down that cut
	falls. At 53rem, lifted 2rem up under the top bar, the cut lands behind the
	chips now that the search box starts 2rem below the bar. The wrapper clips
	the lifted strip, which is only sky; at full width the lift would have to be
	twice that and would take the top of the flag and the spire with it. The
	chips are placed in rem too, so this holds at every desktop width. Its left
	side is the faint globe. It says nothing the page does not, so `alt` is
	empty, and below `lg`, where it would fill most of the window, it is left out.
-->
<img
	src={CONFERENCES_HERO_IMAGE_PATH}
	alt=""
	class="pointer-events-none absolute -top-8 right-0 hidden w-[53rem] lg:block"
/>

<!--
	The page's `h1` is drawn for screen readers only (`sr-only`): the product
	owner asked for the headline to go (Trello VtIlOpkB), and a heading nobody
	sees still lets a screen reader jump to the page's start.
-->
<h1 class="sr-only">Conferences</h1>
