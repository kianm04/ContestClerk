<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import type { ConferenceHero } from '$lib/home-hero';
	import HeroFacts from './HeroFacts.svelte';
	import HeroPhoto from './HeroPhoto.svelte';

	type Props = {
		/** The reader's next conference as `homeHero` in `$lib/home-hero.ts` worked it out. */
		hero: ConferenceHero;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { hero }: Props = $props();

	/*
		Written out in full so Tailwind can find the classes. On an ordinary day
		the panel is white with a hairline border; on a conference day it takes
		the light-blue fill of the `InSessionBand` on `/manage` and no visible
		border. The border stays in place, see-through, so the panel is the same
		size on both days and nothing under it moves.
	*/
	const FILL_CLASSES = {
		ordinary: 'border-border',
		live: 'border-transparent bg-accent'
	};

	// `$derived` works this out again whenever the hero changes.
	const fillClass = $derived(hero.label.isLive ? FILL_CLASSES.live : FILL_CLASSES.ordinary);
</script>

<!--
	The reader's next conference as one panel, the boarding pass of
	`docs/home.md` (section 3.2): a shadcn `Card` with the same overrides the
	directory's `ConferenceCard` uses, so the two read as one product. Its
	corner is the 10px that `rounded-2xl` resolves to in `layout.css`, the
	radius of menus and dialogs. No shadow and no hover: the panel holds several
	links and is not itself one.

	From `md` (768px) up it is two columns, the facts and a 22rem photo column
	centred beside them, with 1.5rem of padding and 1.5rem between. Below `md`
	it is one column: the photo first, 3:1 and bleeding to the panel's edges
	under its top corners, then the facts with 1rem of padding. The photo is
	one element that `order-first` puts at the top of the column and
	`md:order-last` at the right of the row, after the facts in the markup so
	a screen reader meets the name first. A conference without a banner gets
	no photo at all, and the facts take the whole width.
-->
<Card.Root
	class="gap-0 rounded-2xl border py-0 shadow-none ring-0 md:flex-row md:gap-6 md:p-6 {fillClass}"
>
	<div class="min-w-0 flex-1 p-4 md:p-0">
		<HeroFacts {hero} />
	</div>

	{#if hero.bannerPath}
		<div class="order-first md:order-last md:w-[22rem] md:shrink-0 md:self-center">
			<HeroPhoto bannerPath={hero.bannerPath} />
		</div>
	{/if}
</Card.Root>
