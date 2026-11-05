<script lang="ts">
	import { publicMediaUrl } from '$lib/media';
	import { initials } from '$lib/text';

	type Props = {
		/** The person's or organisation's name. Used as the picture's alt text. */
		name: string;
		/** Where the picture sits in the `public-media` bucket, or nothing for initials. */
		imagePath?: string | null;
		size: 'sm' | 'md' | 'lg';
	};

	let { name, imagePath, size }: Props = $props();

	/* The three sizes, written out in full so Tailwind can find the classes. */
	const SIZE_CLASSES = {
		sm: 'h-8 w-8 text-small',
		md: 'h-10 w-10 text-body',
		lg: 'h-16 w-16 text-h2'
	};

	const sizeClass = $derived(SIZE_CLASSES[size]);
</script>

{#if imagePath}
	<img
		src={publicMediaUrl(imagePath)}
		alt={name}
		class="shrink-0 rounded-full object-cover {sizeClass}"
	/>
{:else}
	<!--
		No picture, so the initials stand in for one. `role="img"` with an
		`aria-label` makes a screen reader read the name instead of spelling out
		the two letters, exactly as it would for the picture above.
	-->
	<span
		role="img"
		aria-label={name}
		class="flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-medium text-brand-900 {sizeClass}"
	>
		{initials(name)}
	</span>
{/if}
