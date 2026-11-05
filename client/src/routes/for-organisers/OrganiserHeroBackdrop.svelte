<script lang="ts">
	import { LANDING_ORGANISERS_IMAGE_PATH } from '$lib/media';
</script>

<!--
	The photograph behind the hero: the organisers' desk in warm light, the one
	the landing page uses for organisers, with a white wash over it so the words
	stay easy to read, and a mist hill rising over its lower edge into the page.

	Every layer is `absolute`, placed against the hero's `<section>`, so the
	words are drawn over it. The photograph says nothing the words do not, so
	its `alt` is empty and the whole backdrop is hidden from screen readers.
	`pointer-events-none` lets clicks pass through to the buttons on top.

	From `lg` (1024px) the words sit beside the drawn dashboard, the wash fades
	from left to right, and the backdrop is 32rem tall. Below that the two stack,
	so the backdrop is a little taller and the wash is even.
-->
<div
	aria-hidden="true"
	class="pointer-events-none absolute inset-x-0 top-0 h-[35rem] overflow-hidden lg:h-[32rem]"
>
	<img
		src={LANDING_ORGANISERS_IMAGE_PATH}
		alt=""
		class="absolute inset-0 size-full object-cover object-[50%_38%]"
	/>
	<div
		class="absolute inset-0 bg-surface/78 lg:bg-transparent lg:bg-linear-to-r lg:from-surface/84 lg:via-surface/72 lg:via-40% lg:to-surface/30"
	></div>
	<div class="absolute -inset-x-[10%] top-[31rem] h-64 rounded-[50%] bg-mist lg:top-[26rem]"></div>
</div>
