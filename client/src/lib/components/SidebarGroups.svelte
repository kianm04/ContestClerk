<script lang="ts">
	import { cn } from '$lib/utils';
	import type { SidebarGroup } from './Sidebar.svelte';

	type Props = {
		/** The groups to draw, in order. A group with no heading is drawn without one. */
		groups: SidebarGroup[];
	};

	let { groups }: Props = $props();

	/**
	 * One link. The page being read gets a light blue line beside it, under it
	 * on a phone's strip of tabs, and dark blue words. The border is there on
	 * every link so the words do not shift when a link becomes the active one.
	 */
	function linkClasses(isActive: boolean): string {
		return cn(
			'flex min-h-11 items-center border-b-2 px-3 text-body whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none md:border-b-0 md:border-l-2',
			isActive
				? 'border-ring font-medium text-primary'
				: 'border-transparent text-muted-foreground hover:text-foreground'
		);
	}
</script>

<!--
	The groups of links one area of the site is split into, each under a short
	heading. On a phone they run in one row and the headings step aside.
-->
<div class="flex md:flex-col md:gap-4">
	<!--
		A group has no id of its own, and the list never changes order while it is
		on screen, so each group is keyed by its position.
	-->
	{#each groups as group, index (index)}
		<div>
			{#if group.heading}
				<h2 class="hidden px-3 pb-1 text-small text-muted-foreground md:block">{group.heading}</h2>
			{/if}

			<ul class="flex md:flex-col">
				<!-- The `(item.href)` key lets Svelte reuse list items instead of rebuilding them. -->
				{#each group.items as item (item.href)}
					<li class="flex">
						<a
							href={item.href}
							aria-current={item.isActive ? 'page' : undefined}
							class={linkClasses(item.isActive)}
						>
							{item.label}
						</a>
					</li>
				{/each}
			</ul>
		</div>
	{/each}
</div>
