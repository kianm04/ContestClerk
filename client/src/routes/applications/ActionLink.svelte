<script lang="ts">
	import ArrowRight from 'carbon-icons-svelte/lib/ArrowRight.svelte';
	import Upload from 'carbon-icons-svelte/lib/Upload.svelte';
	import type { CardActionLink } from '$lib/application-card-actions';
	import { Button } from '$lib/components/ui/button';

	type Props = {
		link: CardActionLink;
	};

	let { link }: Props = $props();

	/*
		`primary` is the dark blue button, the card's next step. `danger` asks for
		the same button: red is kept for state and errors, not for the button that
		leads to them (docs/DESIGN.md). Everything else is an outline button.
	*/
	const variant = $derived(link.look === 'outline' ? 'outline' : 'default');
</script>

<!--
	Given an `href`, the shadcn `Button` draws a link. `h-11` is the 44px a finger
	needs. `data-icon` tells the button which side an icon is on, so it can
	space it from the words.
-->
<Button href={link.href} {variant} class="h-11 w-full px-4">
	{#if link.hasUploadIcon}
		<Upload data-icon="inline-start" />
	{/if}

	{link.label}

	{#if link.hasArrow}
		<ArrowRight data-icon="inline-end" />
	{/if}
</Button>
