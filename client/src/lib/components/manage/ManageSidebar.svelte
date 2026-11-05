<script lang="ts">
	import type { ManageSidebarGroup, SwitcherConference } from '$lib/manage-sidebar';
	import type { ManageStatusLine } from '$lib/manage-status';
	import AllConferencesLink from './AllConferencesLink.svelte';
	import ConferenceSwitcher from './ConferenceSwitcher.svelte';
	import ManageSidebarGroups from './ManageSidebarGroups.svelte';
	import StatusDot from './StatusDot.svelte';

	type Props = {
		groups: ManageSidebarGroup[];
		status: ManageStatusLine;
		/** The conference being managed. */
		current: SwitcherConference;
		/** The conferences the switcher offers. */
		conferences: SwitcherConference[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { groups, status, current, conferences }: Props = $props();
</script>

<!--
	The column down the left of every management page from `lg` up: which
	conference this is and where it stands, then every page of it.
-->
<nav aria-label="Manage this conference" class="flex flex-col gap-5 px-4 pt-5 pb-8">
	<div class="flex flex-col gap-2.5">
		<AllConferencesLink />
		<ConferenceSwitcher {current} {conferences} />
		<div class="px-2.5"><StatusDot text={status.text} tone={status.tone} /></div>
	</div>

	<ManageSidebarGroups {groups} />
</nav>
