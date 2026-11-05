<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import type { Snippet } from 'svelte';
	// `page` holds the current address and the data every `load` above it returned.
	import { page } from '$app/state';
	import StepIndicator from '$lib/components/creation/StepIndicator.svelte';
	import { creationSteps, type CreationShell } from '$lib/creation-steps';
	import { manageUrl } from '$lib/urls';

	// A layout receives the page inside it as `children`, drawn where
	// `{@render children()}` is written below.
	let { children }: { children: Snippet } = $props();

	// Every creation page's `load` returns `shell`: the title, the line under it
	// and the step. It is read from `page.data` because this layout has no `load`
	// of its own; an error page returns no `shell`, and then only the page
	// itself is drawn.
	const shell = $derived(page.data.shell as CreationShell | undefined);
	const steps = $derived(shell ? creationSteps(shell.slug, shell.step) : []);

	/*
		The product owner's designs draw the title row at three sizes: roomy on
		the first three steps, which have the least to show, and tighter on Setup
		and Launch, which have the most. Each entry is the design's pixels: the
		row's height and top padding, the back link, the title, its line, where the
		steps sit, and the size of the words under the steps. Written out in full
		so Tailwind can find the classes.
	*/
	const TITLE_ROWS = {
		roomy: {
			frame: 'pt-5 lg:h-34.75',
			back: 'gap-2.5 fs-15 lh-21 [&_svg]:size-4.5',
			title: 'fs-40 lh-48',
			subtitle: 'mt-0.5 fs-19 lh-26',
			steps: 'lg:top-7.5',
			labels: 'roomy'
		},
		setup: {
			frame: 'pt-2.5 lg:h-27.75',
			back: 'gap-2.5 fs-13 lh-18 [&_svg]:size-4',
			title: 'fs-38 lh-46',
			subtitle: 'mt-0.25 fs-18 lh-24',
			steps: 'lg:top-2.75',
			labels: 'dense'
		},
		launch: {
			frame: 'pt-4.5 lg:h-31.25',
			back: 'gap-2.5 fs-13 lh-18 [&_svg]:size-4',
			title: 'fs-38 lh-46',
			subtitle: 'mt-0.25 fs-17 lh-24',
			steps: 'lg:top-6.5',
			labels: 'dense'
		}
	} as const;

	const titleRow = $derived(
		TITLE_ROWS[shell?.step === 'setup' || shell?.step === 'launch' ? shell.step : 'roomy']
	);
</script>

<!--
	The shell around every creation step, drawn one to one from the product
	owner's designs: the page's pale blue, the way back to the list of
	conferences, the title and its one line, and the five steps at the top
	right. `creation-root` (layout.css) is what makes every size inside count in
	the design's pixels and shrink to fit the window; the page draws its own
	columns and its own footer under this row.
	From `lg` up the steps sit at the design's spot in the row's top right and
	the title keeps clear of them; on a phone they come under the title.
	Setup adds `creation-root-scrolls` (layout.css): the owner reads that step
	rather than skims it, so it keeps the width's scale and scrolls a little on
	a short window instead of shrinking to its height. On a 1920 by 1080 window
	at 100% it is drawn at the design's own size.
-->
<div
	class={[
		'creation-root flex w-full flex-1 flex-col bg-creation-page',
		shell?.step === 'setup' && 'creation-root-scrolls'
	]}
>
	{#if shell}
		<div class="relative px-4 pb-3 lg:pr-14 lg:pb-0 lg:pl-15 {titleRow.frame}">
			<a
				href={manageUrl()}
				class="inline-flex items-center text-creation-ink-325 hover:text-creation-ink-950 max-lg:min-h-11 {titleRow.back}"
			>
				<ArrowLeft aria-hidden="true" />
				Back to your conferences
			</a>
			<div class="lg:max-w-246">
				<h1
					class="mt-0.5 font-display font-bold tracking-[-0.01em] text-creation-ink-950 {titleRow.title}"
				>
					{shell.title}
				</h1>
				<p class="text-creation-ink-500 {titleRow.subtitle}">{shell.subtitle}</p>
			</div>
			<div class="mt-3 lg:absolute lg:right-12 lg:mt-0 {titleRow.steps}">
				<StepIndicator {steps} density={titleRow.labels} />
			</div>
		</div>
	{/if}
	{@render children()}
</div>
