<script lang="ts">
	import type { ManageSidebarGroup } from '$lib/manage-sidebar';
	import ManageSidebarLink from './ManageSidebarLink.svelte';

	type Props = {
		/** Worked out by `manageSidebarGroups` in `$lib/manage-sidebar.ts`. */
		groups: ManageSidebarGroup[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { groups }: Props = $props();
</script>

<!--
	The links of the management sidebar, in groups under quiet headings. The
	column from `lg` up and the phone's menu both draw the same list.
-->
<div class="flex flex-col gap-5">
	<!-- A group's heading never repeats, so it serves as the key; the first has none. -->
	{#each groups as group (group.heading ?? 'first')}
		<div class="flex flex-col gap-0.5">
			{#if group.heading}
				<p class="px-2.5 pb-1 text-caption text-muted-foreground">{group.heading}</p>
			{/if}

			<ul class="flex flex-col gap-0.5">
				<!-- The `(link.href)` key lets Svelte reuse lines instead of rebuilding them. -->
				{#each group.links as link (link.href)}
					<li><ManageSidebarLink {link} /></li>
				{/each}
			</ul>
		</div>
	{/each}
</div>
