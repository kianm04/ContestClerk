<script lang="ts">
	import type { ResolvedPathname } from '$app/types';

	/** One page above this one. */
	type BreadcrumbLink = {
		/** Built by a helper in `$lib/urls.ts`, the only place `ResolvedPathname`s come from. */
		href: ResolvedPathname;
		/** Its name, such as "DISEC" or "Resolutions". */
		label: string;
	};

	type Props = {
		/** The pages above this one, the furthest first. */
		links: BreadcrumbLink[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { links }: Props = $props();
</script>

<!--
	The pages above this one, such as "DISEC / Resolutions" over a paper,
	each a link. The slash between two links is only drawn, so a screen
	reader skips it (`aria-hidden`). On a phone each link is 44px tall to
	press; from `sm` up a mouse points at it and it is only as tall as its
	words.

	`{#each}` repeats its markup for every link. The `(link.href)` after it is
	the key, which lets Svelte tell the links apart should the list change.
-->
<nav aria-label="Breadcrumb">
	<ol class="flex flex-wrap items-center gap-x-1.5 text-small text-muted-foreground">
		{#each links as link, index (link.href)}
			<li class="flex items-center gap-x-1.5">
				{#if index > 0}
					<span aria-hidden="true">/</span>
				{/if}
				<a href={link.href} class="inline-flex min-h-11 items-center text-link sm:min-h-0">
					{link.label}
				</a>
			</li>
		{/each}
	</ol>
</nav>
