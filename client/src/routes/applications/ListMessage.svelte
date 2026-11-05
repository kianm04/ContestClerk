<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { Button, type ButtonVariant } from '$lib/components/ui/button';

	type Props = {
		/** States the fact: "No applications yet." */
		title: string;
		/** Says what to do about it. */
		description: string;
		/** The words on the one button. */
		actionLabel: string;
		/** Built with a helper from `$lib/urls.ts`. */
		actionHref: ResolvedPathname;
		/** `default` is the dark blue button, for when it is the page's one next step. */
		actionVariant: ButtonVariant;
	};

	let { title, description, actionLabel, actionHref, actionVariant }: Props = $props();
</script>

<!--
	What the page says in place of the cards: the fact, what to do about it, and
	one button. docs/DESIGN.md keeps an empty state to words and an action, with
	no picture and no box round it, left-aligned like the rest of the page.
	`items-start` keeps the button as wide as its words rather than the column.
-->
<div class="flex flex-col items-start gap-4">
	<div class="flex flex-col gap-1">
		<p class="text-h3 text-foreground">{title}</p>
		<p class="text-muted-foreground">{description}</p>
	</div>

	<!-- Given an `href`, the shadcn `Button` draws a link. `h-11` is the 44px a finger needs. -->
	<Button href={actionHref} variant={actionVariant} class="h-11 px-4">{actionLabel}</Button>
</div>
