<script lang="ts">
	import type { Conference } from '$lib/conferences';
	import { publicMediaUrl } from '$lib/media';
	import { initials } from '$lib/text';

	type Props = {
		/** Only the name and the banner are drawn, so a card with less than a whole `Conference` can pass them. */
		conference: Pick<Conference, 'name' | 'bannerPath'>;
		/**
		 * `wide` is the 16:6 of the conference page; `card` is a 5:2 card picture,
		 * which the style guide's sample card shows; `listing` is the lower 3:1 of
		 * `ConferenceCard` in a grid; `square` is the picture at the start of each
		 * card at `/applications`.
		 */
		aspect?: 'wide' | 'card' | 'listing' | 'square';
		/**
		 * Lets the picture grow taller than its shape when it sits in a card that is
		 * a flex column stretched taller than its content. The shape stays the
		 * smallest it can be; a photograph is cropped at the sides to fill the rest.
		 */
		grow?: boolean;
	};

	let { conference, aspect = 'wide', grow = false }: Props = $props();

	/*
		Written out in full so Tailwind can find the classes.

		A card keeps its shape whether or not there is a picture, so the names on a
		row of cards line up. The wide shape is 16:6, the shape of an uploaded banner.
		`listing` is 3:1, as the conference directory's mockup draws it (T185), so a
		grid of cards shows more of its second row on the first screen.
	*/
	const ASPECT_CLASSES = {
		wide: 'aspect-[16/6]',
		card: 'aspect-[5/2]',
		listing: 'aspect-[3/1]',
		square: 'aspect-square'
	};

	/*
		Without a picture, the conference page's banner is shorter from a tablet up:
		at full width a 16:6 block of initials pushed the name and the apply button
		half a screen down with nothing to look at. A card keeps its shape.
	*/
	const INITIALS_ASPECT_CLASSES = {
		wide: 'aspect-[16/6] md:aspect-[4/1]',
		card: 'aspect-[5/2]',
		listing: 'aspect-[3/1]',
		square: 'aspect-square'
	};

	// `$derived` picks the classes again if `aspect` or `grow` changes.
	const aspectClass = $derived(ASPECT_CLASSES[aspect]);
	const initialsAspectClass = $derived(INITIALS_ASPECT_CLASSES[aspect]);
	// `grow` takes a flex item from the size its shape gives it up to all the
	// height its flex column has spare.
	const growClass = $derived(grow ? 'grow' : '');
</script>

{#if conference.bannerPath}
	<img
		src={publicMediaUrl(conference.bannerPath)}
		alt={conference.name}
		class="w-full object-cover {aspectClass} {growClass}"
	/>
{:else}
	<!--
		No photograph was uploaded, so the conference's initials sit on the brand
		gradient. The design system forbids a stock placeholder here.
	-->
	<div
		role="img"
		aria-label={conference.name}
		class="flex w-full items-center justify-center bg-linear-to-br from-brand-900 to-brand-700 {initialsAspectClass} {growClass}"
	>
		<span class="font-display text-display-mobile text-surface md:text-display">
			{initials(conference.name)}
		</span>
	</div>
{/if}
