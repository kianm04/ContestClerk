<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import SidebarGroups from './SidebarGroups.svelte';

	/** One link in the sidebar. */
	export type SidebarItem = {
		label: string;
		/** Built with a helper from `$lib/urls.ts`; a hand-written string is refused. */
		href: ResolvedPathname;
		/** True for the page the reader is on. The page works this out from the URL. */
		isActive: boolean;
	};

	/** Some links of the sidebar under one small heading, such as "Set up". */
	export type SidebarGroup = {
		/** Left out for a group drawn without a heading, such as Dashboard on its own. */
		heading?: string;
		items: SidebarItem[];
	};

	type Props = {
		groups: SidebarGroup[];
		/** Names the navigation for a screen reader, such as "Manage". */
		title: string;
	};

	let { groups, title }: Props = $props();
</script>

<!--
	`aria-label` is what tells a screen reader which navigation this is, because
	several pages have more than one. From `md` up the links are a column of text
	links under their groups' headings; on a phone the same links are one strip
	of tabs that scrolls sideways, because a column this long would push the page
	itself off the first screen. The title is not drawn: the groups' own headings
	are the only ones the column needs.
-->
<nav aria-label={title} class="overflow-x-auto px-2 md:overflow-visible md:px-3 md:pb-6">
	<SidebarGroups {groups} />
</nav>
