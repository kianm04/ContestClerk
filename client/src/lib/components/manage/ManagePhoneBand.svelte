<script lang="ts">
	import SectionMenu from '$lib/components/SectionMenu.svelte';
	import type { ManageSidebarGroup } from '$lib/manage-sidebar';
	import type { ManageStatusLine } from '$lib/manage-status';
	import AllConferencesLink from './AllConferencesLink.svelte';
	import ManageSidebarGroups from './ManageSidebarGroups.svelte';
	import StatusDot from './StatusDot.svelte';

	type Props = {
		/** The conference's name. */
		name: string;
		status: ManageStatusLine;
		groups: ManageSidebarGroup[];
		/** What the menu button says, from `phoneMenuLabel` in `$lib/manage-sidebar.ts`. */
		menuLabel: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { name, status, groups, menuLabel }: Props = $props();
</script>

<!--
	The sidebar's stand-in under `lg`: the conference's name and status, and a
	button naming the page being shown that opens every page of the conference.
	The list opens in the page's own flow and pushes the page down.
-->
<div class="flex flex-col gap-2 border-b border-border px-4 py-3">
	<div class="flex items-center justify-between gap-3">
		<p class="font-display text-[1rem] leading-[1.375rem] font-semibold">{name}</p>
		<StatusDot text={status.text} tone={status.tone} />
	</div>

	<nav aria-label="Manage this conference">
		<SectionMenu label={menuLabel}>
			<div class="flex flex-col gap-3">
				<AllConferencesLink />
				<ManageSidebarGroups {groups} />
			</div>
		</SectionMenu>
	</nav>
</div>
