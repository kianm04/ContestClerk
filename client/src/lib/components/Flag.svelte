<script lang="ts">
	import { countryName } from '$lib/countries';
	import { flagUrl, type FlagSize } from '$lib/media';

	type Props = {
		/** A two-letter ISO country code, such as `NL`. */
		countryCode: string;
		size?: FlagSize;
	};

	let { countryCode, size = 'sm' }: Props = $props();

	// `$derived` works these out again whenever the country or the size changes.
	const source = $derived(flagUrl(countryCode, size));
	const name = $derived(countryName(countryCode));

	/* The 20×15 the design system asks for, twice that, the large flag of
	   the chair's current speaker card, and the projector's 160×120 (S12).
	   Written out in full so Tailwind can find the classes. */
	const SIZE_CLASSES = {
		sm: 'w-5 h-[15px] rounded-[2px]',
		md: 'w-10 h-[30px] rounded-[2px]',
		lg: 'w-24 h-[72px] rounded-md shadow-card',
		xl: 'w-40 h-30 rounded-[4px]'
	};

	const sizeClass = $derived(SIZE_CLASSES[size]);
</script>

<!--
	The country's name is the alt text, so a seat list read aloud says
	"Netherlands" rather than "image". The flags come from flagcdn.com; see
	`specs/03-design/design-system.md`.

	The faint line round the edge is an outline pulled 1px inside the picture
	(`-outline-offset-1`), so it takes up no room. Without it a flag that is
	white at the edge, such as Japan's, has no edge at all on a white card.
-->
<img
	src={source}
	alt={name}
	class="inline-block object-cover outline-1 -outline-offset-1 outline-ink-900/10 {sizeClass}"
/>
