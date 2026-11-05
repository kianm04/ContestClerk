<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import Eye from '@lucide/svelte/icons/eye';
	import { creationClasses } from '$lib/creation-classes';
	import type { CreationPreview } from '$lib/creation-draft';
	import { bannerImageUrl } from '$lib/media';
	import CreationPanel from './CreationPanel.svelte';
	import DraftBadge from './DraftBadge.svelte';
	import InfoBox from './InfoBox.svelte';
	import PreviewFacts from './PreviewFacts.svelte';

	type Props = {
		/** From `creationPreview()` in `$lib/creation-draft.ts`. */
		preview: CreationPreview;
		/** Which step's design to follow: the banner, the name, the facts and the note each sit a little differently on the three steps that show this panel. */
		variant?: 'organisation' | 'basics' | 'when';
		/** The blue note at the foot of the panel. */
		note?: { icon?: LucideIcon; title: string; text: string };
		/** Extra classes for the panel. */
		class?: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { preview, variant = 'organisation', note, class: className }: Props = $props();

	/*
		The design's pixels for each step: how far the banner, the name, its line,
		the facts and the note sit from what is above them, and the two sizes the
		facts and the note's sentence come in. Written out in full so Tailwind can
		find the classes.
	*/
	const VARIANTS = {
		organisation: {
			panel: 'pb-5',
			bannerTop: 'mt-5',
			bannerHeight: 'h-44.5',
			name: 'mt-4',
			line: 'mt-1',
			facts: 'mt-4 gap-2.75 fs-17 lh-22',
			note: 'mt-6',
			noteText: ''
		},
		basics: {
			panel: 'pb-4',
			bannerTop: 'mt-3.5',
			bannerHeight: 'h-37.5',
			name: 'mt-2',
			line: 'mt-0.5',
			facts: 'mt-2.5 gap-1.75 fs-16 lh-22',
			note: 'mt-2 pt-3.5 pb-3.5',
			noteText: 'fs-15 lh-21'
		},
		when: {
			panel: 'pb-4.5',
			bannerTop: 'mt-4',
			bannerHeight: 'h-44.5',
			name: 'mt-2.5',
			line: 'mt-1',
			facts: 'mt-3 gap-2 fs-17 lh-22',
			note: 'mt-4 pt-4 pb-4',
			noteText: 'fs-16 lh-22'
		}
	};
	const sizes = $derived(VARIANTS[variant]);

	// Under the name: the tagline once there is one (Basics), else who organises it.
	const line = $derived(preview.tagline ?? `Organised by ${preview.organizedBy}`);
</script>

<!--
	The panel on the right of the first three creation steps, as the designs
	draw it: the conference roughly as delegates will meet it, redrawn as the
	organiser types. The banner is a 10 pixel-cornered picture with the "Draft"
	pill over its top right corner; until one is uploaded the sample picture
	stands in, so the panel keeps its shape and nothing moves when the real one
	comes. The panel fills its column's height (`h-full`), so it ends level with
	the panels beside it, as in the design.
-->
<CreationPanel
	title="Conference preview"
	description="This is a draft. You can change everything later."
	icon={Eye}
	size="large"
	headerClass="gap-4.5"
	class={creationClasses('h-full pr-4.5 pl-4.5', sizes.panel, className)}
>
	<div class="relative {sizes.bannerTop} {sizes.bannerHeight}">
		<!-- Decorative here: the conference's name is written right under it. -->
		<img
			src={bannerImageUrl(preview.bannerPath)}
			alt=""
			class="size-full rounded-lg object-cover"
		/>
		<DraftBadge class="absolute top-3.5 right-3.5" />
	</div>
	<h3 class="font-display fs-28 lh-34 font-bold break-words text-creation-ink-950 {sizes.name}">
		{preview.name}
	</h3>
	<p class="fs-18 lh-24 text-creation-ink-375 {sizes.line}">{line}</p>
	<PreviewFacts facts={preview.facts} class={sizes.facts} />
	{#if preview.description}
		<!-- Basics only: a hairline, then the description in the design's small blue-grey. -->
		<div aria-hidden="true" class="mt-2.5 mb-2.25 h-px bg-creation-panel-border"></div>
		<p class="line-clamp-4 fs-14 lh-19 text-creation-ink-450">{preview.description}</p>
	{/if}
	{#if note}
		<InfoBox
			icon={note.icon}
			title={note.title}
			text={note.text}
			class={sizes.note}
			textClass={sizes.noteText}
		/>
	{/if}
</CreationPanel>
