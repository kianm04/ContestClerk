<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Separator } from '$lib/components/ui/separator';
	import type { ShowcaseStory } from '$lib/landing-showcase';
	import ShowcaseOutcome from './ShowcaseOutcome.svelte';
	import ShowcaseTimeline from './ShowcaseTimeline.svelte';

	type Props = {
		/** The view to show, a delegate's or an organiser's. */
		story: ShowcaseStory;
	};

	let { story }: Props = $props();
</script>

<!--
	The card on the right of the example, after the landing page's mockup
	(Trello RBz46aTQ): the steps on the left and, past a thin line, where they
	have led on the right. On a phone the two sit one under the other and the
	line is left out.

	The shell is a shadcn `Card` laid out as a grid, with the mockup's soft
	shadow in place of its ring; the line is a shadcn `Separator`.
-->
<Card.Root
	class="grid gap-5 rounded-2xl p-5 shadow-card ring-0 sm:grid-cols-[minmax(0,1fr)_auto_16rem] sm:gap-3 lg:pr-4.5 lg:pl-7"
>
	<ShowcaseTimeline steps={story.steps} />
	<Separator orientation="vertical" class="hidden bg-neutral-100 sm:block" />
	<ShowcaseOutcome {story} />
</Card.Root>
