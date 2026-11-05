<script lang="ts">
	import { bannerImageUrl } from '$lib/media';

	type Props = {
		bannerPath: string | null;
		/** The design's size for this card, such as `w-31 h-29.5` (124 by 118). */
		class: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { bannerPath, class: className }: Props = $props();
</script>

<!--
	The conference's banner, cropped to the card's picture; the sample picture
	when it has none, so the card keeps its shape. Left out on a phone, where
	the card has no room beside it for the words.
-->
<img
	src={bannerImageUrl(bannerPath)}
	alt=""
	class="shrink-0 self-start rounded-md object-cover max-lg:hidden {className}"
/>
