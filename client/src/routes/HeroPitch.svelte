<script lang="ts">
	import ArrowRight from 'carbon-icons-svelte/lib/ArrowRight.svelte';
	import { Button, type ButtonVariant } from '$lib/components/ui/button';
	import type { HeroPitch } from '$lib/landing';

	type Props = {
		/** The words and the link of one half of the hero. */
		pitch: HeroPitch;
		/**
		 * `delegate` is the left half, on the picture of a university, with a blue
		 * eyebrow and a dark blue link. `organiser` is the right half, on the
		 * picture of a desk, with a warm brown eyebrow and a link of white glass.
		 */
		side: 'delegate' | 'organiser';
	};

	let { pitch, side }: Props = $props();

	/* The link is a shadcn `Button` drawn as the mockup's pill: 44px tall and
	   round-ended. The organiser's side turns the outline variant into white
	   glass over the photo. Only sizing and colour classes are passed, never a
	   project type token, which the class merger would mistake for a colour. */
	const PILL_CLASSES = 'h-11 rounded-full px-7 text-base';
	const GLASS_CLASSES =
		'border-surface bg-surface/60 text-ink-900 backdrop-blur-sm hover:bg-surface/80 hover:text-ink-900';

	/** Each half settles into place as the page loads, the right one a beat after the left. */
	const ARRIVAL_CLASSES =
		'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-700 ease-out motion-reduce:animate-none';

	// `$derived` works these out again if `side` changes.
	const eyebrowColour = $derived(side === 'delegate' ? 'text-brand-700' : 'text-sand-700');
	const linkVariant: ButtonVariant = $derived(side === 'delegate' ? 'default' : 'outline');
	const linkClasses = $derived(
		side === 'delegate' ? PILL_CLASSES : `${PILL_CLASSES} ${GLASS_CLASSES}`
	);
	const arrivalDelay = $derived(side === 'delegate' ? 'delay-0' : 'delay-150');
</script>

<!--
	One half of the hero: the eyebrow, a heading of two lines, a sentence and a
	link. The heading's lines are each a block, so it breaks where the mockup
	breaks it, and from `lg` up `whitespace-nowrap` keeps a line whole even
	where the column is a little too narrow for it. The sentence's lines only
	become blocks from `lg` up; on a phone they run on as one paragraph.

	The space after each line keeps its last word apart from the next line's
	first, for a phone and for a screen reader, which reads the lines as one.
	Svelte drops a space typed at the end of an element, so the space is added
	to the line inside the braces instead, `{line + ' '}`, which it keeps. The
	lines are plain strings with no id, so they are keyed by position.

	`[font-variation-settings:normal]` lets the browser use the serif's
	narrower, finer shape drawn for large type, which the mockup's headlines are
	set in; `layout.css` holds every other heading in the shape for small type.
-->
<div class="flex flex-col items-start {ARRIVAL_CLASSES} {arrivalDelay}">
	<p class="text-label tracking-[0.14em] uppercase {eyebrowColour}">{pitch.eyebrow}</p>

	<h2
		class="mt-2.5 font-display text-display-mobile font-medium text-ink-900 [font-variation-settings:normal] md:text-display lg:text-pitch lg:whitespace-nowrap"
	>
		{#each pitch.headingLines as line, index (index)}
			<span class="block">{line + ' '}</span>
		{/each}
	</h2>

	<p class="mt-1.5 text-h3 font-normal text-ink-600">
		{#each pitch.leadLines as line, index (index)}
			<span class="lg:block">{line + ' '}</span>
		{/each}
	</p>

	<div class="mt-5">
		<Button href={pitch.link.href} variant={linkVariant} class={linkClasses}>
			{pitch.link.label}
			<ArrowRight aria-hidden="true" />
		</Button>
	</div>
</div>
