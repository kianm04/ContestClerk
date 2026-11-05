<script lang="ts">
	import { LANDING_DELEGATES_IMAGE_PATH, LANDING_ORGANISERS_IMAGE_PATH } from '$lib/media';

	/** The pictures fade in as the page loads, and stay still for anybody who asked for less motion. */
	const ARRIVAL_CLASSES =
		'animate-in fade-in fill-mode-both duration-1000 motion-reduce:animate-none';
</script>

<!--
	The two pictures behind the hero, after the landing page's mockup (Trello
	RBz46aTQ): a university on the left for delegates, and a desk on the right
	for organisers, divided by a slanted white line. They run up behind the top
	bar, and a white hill rises over their lower edge.

	Every layer is `absolute`, so it is placed against the hero's `<section>`
	rather than taking up room in the page, and the words of the hero are drawn
	over it. The pictures say nothing the words do not, so their `alt` is empty.
	`pointer-events-none` lets clicks pass through to the links on top.

	From `lg` (1024px) up the backdrop is 27.5rem tall, a little taller than the
	hero itself, so the hill reaches down behind the switch under it. On a phone
	the two halves of the hero sit one under the other, so the backdrop is as
	tall as the hero and shows only the university.
-->
<div class="pointer-events-none absolute inset-0 overflow-hidden lg:bottom-auto lg:h-[27.5rem]">
	<!-- `object-bottom` keeps the bottom of the picture, where the buildings are. -->
	<div class="absolute inset-y-0 left-0 w-full {ARRIVAL_CLASSES} lg:w-[57%]">
		<img src={LANDING_DELEGATES_IMAGE_PATH} alt="" class="size-full object-cover object-bottom" />
		<!-- A white wash, so the words over the sky stay easy to read. -->
		<div
			class="absolute inset-0 bg-surface/70 lg:bg-transparent lg:bg-linear-to-r lg:from-surface/45 lg:to-surface/10"
		></div>
	</div>

	<!--
		`clip-path` cuts the box down to the four corners listed, as percentages of
		its width and height, which is what slants its left edge. The white layer
		under the picture is cut the same way but reaches a little further left,
		so a thin white line shows between the two pictures.
	-->
	<div
		class="absolute inset-y-0 right-0 hidden w-[60.3%] bg-surface [clip-path:polygon(28%_0,100%_0,100%_100%,9.1%_100%)] lg:block"
	></div>
	<div
		class="absolute inset-y-0 right-0 hidden w-[60%] [clip-path:polygon(28%_0,100%_0,100%_100%,9.1%_100%)] {ARRIVAL_CLASSES} lg:block"
	>
		<img
			src={LANDING_ORGANISERS_IMAGE_PATH}
			alt=""
			class="size-full object-cover object-[50%_38%]"
		/>
		<!-- A stronger wash on the left, where the words are, fading towards the laptop. -->
		<div class="absolute inset-0 bg-linear-to-r from-surface/80 via-surface/65 to-surface/30"></div>
	</div>

	<!--
		The hill: an oval far wider than the window, in the page's own `mist`,
		whose top edge curves across the bottom of the pictures. `rounded-[50%]`
		is what makes a box an oval. From `lg` up its top is 23rem down, just
		under the hero's links.
	-->
	<div
		class="absolute -inset-x-[10%] -bottom-12 h-24 rounded-[50%] bg-mist lg:top-[23rem] lg:bottom-auto lg:h-64"
	></div>
</div>
