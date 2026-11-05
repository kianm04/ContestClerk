<script lang="ts">
	import StatStrip from '$lib/components/manage/StatStrip.svelte';
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import type { ConferenceHero } from '$lib/home-hero';
	import HeroActions from './HeroActions.svelte';
	import HeroNextStep from './HeroNextStep.svelte';

	type Props = {
		/** The reader's next conference as `homeHero` in `$lib/home-hero.ts` worked it out. */
		hero: ConferenceHero;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { hero }: Props = $props();
</script>

<!--
	The facts column of the hero panel (`docs/home.md` section 3.2), top to
	bottom: the label, the conference's name as the page's `<h1>` and a link to
	the reader's own door, the meta line, the figure strip, the next step when
	the button is about a task, and the button with its link. Every word comes
	from `$lib/home-hero.ts`; this file only lays them out, each block 1rem
	under the one before.

	The label is a `StatusDot` with a light-blue dot on a conference day
	("Running now · day 2 of 3") and plain secondary text otherwise. The strip
	is left out when there is no figure, as for a volunteer on a conference day
	with nothing left on the programme, rather than drawn as two bare lines.
-->
{#if hero.label.isLive}
	<p class="text-small"><StatusDot text={hero.label.text} tone="brand" /></p>
{:else}
	<p class="text-small text-muted-foreground">{hero.label.text}</p>
{/if}

<!--
	The phone title size below `md` (768px), the management pages' title size
	from it up. On a phone the link's padding (`py-1.5`, 6px each way) makes it
	the 44px a finger needs, 2rem of text with 0.75rem round it, and a negative
	margin of the same size (`-my-1.5`) takes that back from the line, so the
	name does not move. `inline-block` is what lets an element inside a line of
	text carry vertical padding and margins of its own.
-->
<h1 class="mt-0.5 font-display text-h1-mobile text-foreground md:text-manage-title">
	<a href={hero.href} class="-my-1.5 inline-block py-1.5 hover:underline md:my-0 md:py-0"
		>{hero.name}</a
	>
</h1>

<p class="mt-1 text-small text-muted-foreground">{hero.metaLine}</p>

{#if hero.figures.length > 0}
	<div class="my-4">
		<StatStrip stats={hero.figures} />
	</div>
{/if}

{#if hero.nextStep}
	<HeroNextStep step={hero.nextStep} />
{/if}

<HeroActions primary={hero.primary} secondary={hero.secondary} />
