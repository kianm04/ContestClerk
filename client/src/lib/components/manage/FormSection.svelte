<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** What this part of the form is about, such as "Place and dates". */
		title: string;
		/** A sentence under the title saying what the fields are for. */
		description?: string;
		/** The fields. */
		children: Snippet;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { title, description, children }: Props = $props();
</script>

<!--
	One part of a long settings form in the manage redesign: a title and a
	sentence on the left, the fields on the right. On a phone the fields wrap
	under the title, because the two columns cannot both have their width.

	A thin line separates each part from the one above it. `first-of-type`
	leaves it off the first `<section>`, which sits right under the page header.
	`aria-label` names the section after its title, so a screen reader can jump to it.
-->
<section
	aria-label={title}
	class="flex flex-wrap gap-x-12 gap-y-4 border-t border-border py-8 first-of-type:border-t-0"
>
	<div class="w-[14.5rem] max-w-full shrink-0">
		<h2 class="text-h3 text-foreground">{title}</h2>

		{#if description}
			<p class="mt-1 text-small text-muted-foreground">{description}</p>
		{/if}
	</div>

	<!-- `flex-[1_1_26rem]` lets the fields grow, and wrap under the title below 26rem. -->
	<div class="flex min-w-0 flex-[1_1_26rem] flex-col gap-5">
		{@render children()}
	</div>
</section>
