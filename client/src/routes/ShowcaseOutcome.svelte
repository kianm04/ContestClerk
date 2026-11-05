<script lang="ts">
	import ArrowRight from 'carbon-icons-svelte/lib/ArrowRight.svelte';
	import CheckmarkFilled from 'carbon-icons-svelte/lib/CheckmarkFilled.svelte';
	import { buttonVariants } from '$lib/components/ui/button';
	import type { ShowcaseStory } from '$lib/landing-showcase';
	import { cn } from '$lib/utils';

	type Props = {
		/** The view whose news, details and button are shown. */
		story: ShowcaseStory;
	};

	let { story }: Props = $props();

	/* The button at the foot is only a picture of one, so it is a `<span>`
	   wearing the shadcn button's classes: `buttonVariants()` gives the classes
	   of the dark blue default, and `cn` merges the mockup's height and shape
	   over them. Only sizing classes are added, never a project type token. */
	const BUTTON_CLASSES = cn(
		buttonVariants(),
		'mt-2.5 ml-2.5 h-11 gap-3 rounded-xl px-4 text-sm font-medium'
	);
</script>

<!--
	The right-hand column of the card on the right of the example, after the
	landing page's mockup (Trello RBz46aTQ): a green box of news, a grey box of
	details, and a blue button. Nothing in the example can be pressed.

	The tick is Carbon's filled circle in green. Its tick is cut out of the
	circle, so the white disc behind it is what shows through. Everything
	under the green box starts 10px further in (`ml-2.5`), as the mockup draws it.
-->
<div class="flex flex-col">
	<div class="flex gap-3 rounded-lg bg-success-100 px-4 py-3.5">
		<span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface">
			<CheckmarkFilled size={20} class="text-success-500" aria-hidden="true" />
		</span>
		<div class="flex flex-col text-caption">
			<span class="font-medium text-success-700">{story.notice.title}</span>
			<span class="text-ink-600">{story.notice.text}</span>
		</div>
	</div>

	<span class="mt-2.5 ml-2.5 text-caption text-ink-600">{story.detailsHeading}</span>

	<!-- The `(detail.label)` key lets Svelte reuse each line instead of rebuilding it. -->
	<ul class="ml-2.5 flex flex-col gap-1 rounded-lg bg-brand-50 px-4 py-2.5">
		{#each story.details as detail (detail.label)}
			<li class="flex items-center gap-3.5 text-small text-neutral-700">
				<!-- `<detail.icon />` draws whichever icon component the detail holds. -->
				<detail.icon size={18} aria-hidden="true" />
				{detail.label}
			</li>
		{/each}
	</ul>

	<span class={BUTTON_CLASSES}>
		{story.actionLabel}
		<ArrowRight aria-hidden="true" />
	</span>
</div>
