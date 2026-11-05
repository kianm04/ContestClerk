<script lang="ts">
	// `page` from `$app/state` is the page being shown, and reading its address
	// here is what lets the sidebar mark the link the reader is already on. The
	// root layout underlines a top bar link the same way.
	import { page } from '$app/state';
	import ManagePhoneBand from '$lib/components/manage/ManagePhoneBand.svelte';
	import ManageSidebar from '$lib/components/manage/ManageSidebar.svelte';
	import { activeSidebarLink, manageSidebarGroups, phoneMenuLabel } from '$lib/manage-sidebar';
	import { setupSteps } from '$lib/setup-steps';
	import type { LayoutProps } from './$types';

	// `data` is whatever `load` in `+layout.server.ts` returned: this conference,
	// the organisation running it, and what the sidebar shows. Every page under
	// `/manage/[slug]` is drawn inside this layout, so every one of them gets it
	// all. `children` is that page.
	let { data, children }: LayoutProps = $props();

	// A draft's six numbered steps, or `null` once it is published.
	const steps = $derived(
		data.setupProgress === null ? null : setupSteps(data.conference.slug, data.setupProgress)
	);

	// `$derived` works the list out again whenever the data or the address
	// changes, which is what moves the marked link as the reader goes from one
	// management page to the next.
	const sidebarGroups = $derived(
		manageSidebarGroups({
			slug: data.conference.slug,
			pathname: page.url.pathname,
			setupSteps: steps,
			count: data.sidebarCount,
			permissions: data.permissions
		})
	);

	const menuLabel = $derived(phoneMenuLabel(activeSidebarLink(sidebarGroups)));
</script>

<!--
	The organiser frame of the manage redesign: the sidebar on the left from
	`lg` up, a band with a menu above the page under it, and the page beside or
	below. `flex-1` stretches it to the bottom of the white sheet the root
	layout draws, so the sidebar's border runs all the way down.
-->
<div class="flex flex-1 flex-col lg:flex-row">
	<div class="hidden w-[16.5rem] shrink-0 border-r border-border lg:block">
		<ManageSidebar
			groups={sidebarGroups}
			status={data.statusLine}
			current={data.conference}
			conferences={data.switcherConferences}
		/>
	</div>

	<div class="lg:hidden">
		<ManagePhoneBand
			name={data.conference.name}
			status={data.statusLine}
			groups={sidebarGroups}
			{menuLabel}
		/>
	</div>

	<!--
		`min-w-0` lets this column be narrower than what is inside it, so a wide
		table on a management page scrolls in its own box instead of pushing the
		whole page sideways. The page inside is held to 72rem, a normal page.
	-->
	<div class="min-w-0 flex-1 px-4 pt-6 pb-12 lg:px-12 lg:pt-9 lg:pb-16">
		<div class="max-w-[67.5rem]">
			{@render children()}
		</div>
	</div>
</div>
