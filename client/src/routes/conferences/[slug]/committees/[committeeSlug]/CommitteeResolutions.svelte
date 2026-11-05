<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import Section from '$lib/components/Section.svelte';

	type Props = {
		/** "Resolutions", or "Directives" in a crisis committee (`papersPageTitle`). */
		title: string;
		/** What the committee adopted, by number, each with the way to its record copy. */
		resolutions: { id: string; name: string; title: string; href: ResolvedPathname }[];
	};

	let { title, resolutions }: Props = $props();
</script>

<!--
	The committee's record: one row per paper it adopted, "Resolution 1.1"
	linking to the copy a conference prints and archives, its title beside it.
	Nothing at all until the committee has adopted something.
-->
{#if resolutions.length > 0}
	<Section {title}>
		<ul class="divide-y divide-border">
			<!-- `(resolution.id)` keys each row to its paper, so Svelte keeps the right one. -->
			{#each resolutions as resolution (resolution.id)}
				<li class="flex min-h-11 flex-wrap items-baseline gap-x-3 py-2 text-body">
					<a href={resolution.href} class="font-medium text-link hover:underline">
						{resolution.name}
					</a>
					<span class="text-muted-foreground">{resolution.title}</span>
				</li>
			{/each}
		</ul>
	</Section>
{/if}
