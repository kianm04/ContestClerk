<script lang="ts">
	import type { Snippet } from 'svelte';
	import { buttonVariants } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';

	type Props = {
		/** How many filters are set, shown in the summary as "Filters (2)". */
		activeFilterCount: number;
		/** The filter controls themselves. */
		children: Snippet;
	};

	let { activeFilterCount, children }: Props = $props();
</script>

<!--
	On a phone the filters fold away behind this "Filters" disclosure; from
	tablet width up they are always on screen. A `<details>` is a browser
	feature, so it opens and closes with no JavaScript at all. Its summary is
	dressed as a shadcn outline button by `buttonVariants`; `list-none` takes
	away the triangle a browser draws on a summary. The `<style>` block below is
	what makes the difference between the two widths, and says why it cannot be
	a Tailwind class.
-->
<details class="filters-disclosure">
	<summary class={cn(buttonVariants({ variant: 'outline' }), 'h-11 list-none px-4')}>
		Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
	</summary>

	<div class="mt-3">
		<!-- `{@render children()}` draws whatever the page put inside this component. -->
		{@render children()}
	</div>
</details>

<style>
	/*
		Why this is not a Tailwind class: a browser hides the contents of a closed
		`<details>` by setting `content-visibility: hidden` on its
		`::details-content` pseudo-element, and turning that off from tablet width
		up has to be wrapped in an `@supports` test that Tailwind cannot express
		readably.

		Both rules are inside that test on purpose. `::details-content` is recent, and
		a browser that has never heard of it cannot be talked out of hiding the
		contents. There the summary therefore stays on screen at every width, so the
		filters can still be opened by hand. Hiding the summary unconditionally would
		leave an older browser with filters it could not reach at all.

		48rem is Tailwind's `md`, the width the phone layout ends at.
	*/
	@supports selector(::details-content) {
		@media (min-width: 48rem) {
			.filters-disclosure::details-content {
				content-visibility: visible;
			}

			.filters-disclosure > summary {
				display: none;
			}
		}
	}
</style>
