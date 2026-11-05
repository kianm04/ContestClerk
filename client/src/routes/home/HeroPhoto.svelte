<script lang="ts">
	import { publicMediaUrl } from '$lib/media';

	type Props = {
		/** Where the organiser's banner sits in the `public-media` bucket. */
		bannerPath: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	// The conference's name is not among them: the `<h1>` beside the picture
	// says it, so the picture's `alt` is empty and nothing here would read it.
	let { bannerPath }: Props = $props();
</script>

<!--
	The hero panel's photograph: the conference's own banner, and only that.
	`HomeHero` mounts this only when there is a banner; without one nothing
	stands in for it (docs/DESIGN.md, "Images"): no initials, no gradient, no
	stock picture. `ConferenceBanner` is not used because its no-photo branch
	draws initials on a gradient.

	One picture takes two shapes. Below `md` (768px) it is a 3:1 strip across
	the top of the panel, bleeding to the panel's edges, so only its top corners
	are rounded, to the panel's own 10px. From `md` up it is the 3:2 photograph
	in the panel's right-hand column, inset in the panel's padding: a button's
	corner radius and a 1px hairline pulled inside the picture's edge
	(`-outline-offset-1`), so a pale photograph keeps an edge without taking up
	any room. The organiser's 16:6 banner is cropped by `object-cover` from its
	centre to each shape. One `<img>` rather than one per shape means one
	file fetched and one picture for a test to find.
-->
<img
	src={publicMediaUrl(bannerPath)}
	alt=""
	class="aspect-[3/1] w-full rounded-t-[0.625rem] object-cover object-center md:aspect-[3/2] md:rounded-md md:outline md:outline-1 md:-outline-offset-1 md:outline-foreground/10"
/>
