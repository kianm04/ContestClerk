<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import type { FindHero } from '$lib/home-hero';
	import HeroActions from './HeroActions.svelte';

	type Props = {
		/** The invitation to find a conference, from `homeHero` in `$lib/home-hero.ts`. */
		hero: FindHero;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { hero }: Props = $props();
</script>

<!--
	The hero panel for a reader with no conference to come (`docs/home.md`
	section 3.3): the same white panel as `HomeHero`, facts only. The page's
	`<h1>`, one line about how many conferences are open, the page's one
	button and, beside it, the text link to a quick session when the page
	offers it nowhere else. Nothing more: no search box, since the top bar has
	one, no second sentence, no outline button.

	The fact line is left out when it is empty, which is how `homeHero` says
	the count was not read.
-->
<Card.Root class="gap-0 rounded-2xl border border-border py-0 shadow-none ring-0">
	<div class="p-4 md:p-6">
		<h1 class="font-display text-h1-mobile text-foreground md:text-manage-title">{hero.title}</h1>

		{#if hero.factLine}
			<p class="mt-1 max-w-[68ch] text-small text-muted-foreground">{hero.factLine}</p>
		{/if}

		<HeroActions primary={hero.primary} secondary={hero.secondary} />
	</div>
</Card.Root>
