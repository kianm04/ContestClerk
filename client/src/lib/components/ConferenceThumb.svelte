<script lang="ts">
	import { publicMediaUrl } from '$lib/media';

	type Props = {
		/** Where the banner sits in the `public-media` bucket, or `null` when none was uploaded. */
		bannerPath: string | null;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	// The conference's name is not among them: the row beside the thumbnail says
	// it, so the picture's `alt` is empty and nothing here would read the name.
	let { bannerPath }: Props = $props();

	/*
		Written out in full so Tailwind can find the classes. A 3:2 thumbnail, 6rem
		by 4rem, and 4.5rem by 3rem below `sm` (640px), where a row has less room.
		The picture and the empty slot share the size, so the names beside them
		line up, and `shrink-0` keeps a long name from squashing either.
	*/
	const SLOT_SIZE_CLASSES = 'h-12 w-18 shrink-0 sm:h-16 sm:w-24';
</script>

<!--
	The small picture at the start of a conference row on `/home` ("Also coming
	up"): the organiser's 16:6 banner cropped to 3:2 by `object-cover`, with a
	button's corner radius and a 1px hairline pulled inside the picture's edge
	(`-outline-offset-1`), so a pale photograph keeps an edge on the white page
	without taking up any room.

	A conference without a banner shows no picture at all (docs/DESIGN.md,
	"Images"): no initials, no gradient, no stock picture. Its slot keeps the
	size and stays empty. `ConferenceBanner` is not used here because its
	no-photo branch draws initials on a gradient.
-->
{#if bannerPath}
	<img
		src={publicMediaUrl(bannerPath)}
		alt=""
		class="rounded-md object-cover outline outline-1 -outline-offset-1 outline-foreground/10 {SLOT_SIZE_CLASSES}"
	/>
{:else}
	<div aria-hidden="true" class={SLOT_SIZE_CLASSES}></div>
{/if}
