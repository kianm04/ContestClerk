<script lang="ts">
	// `page` from `$app/state` is SvelteKit's read-only view of the request being
	// drawn, so `page.url.pathname` is the address the reader is on. Reading it
	// here is what lets the strip mark the tab they are already looking at; the
	// organisers' layout marks its sidebar link the same way.
	import { page } from '$app/state';
	import Tabs from '$lib/components/Tabs.svelte';
	import { delegationTabs } from '$lib/delegations';
	// `./$types` holds the types SvelteKit generates for this one route, so
	// `LayoutProps` already knows what `+layout.server.ts` beside this file
	// returned.
	import type { LayoutProps } from './$types';

	// `data` is whatever `load` in `+layout.server.ts` returned: this delegation,
	// its conference, the reader's role and the counts. Every page under
	// `/delegations/[delegationId]` is drawn inside this layout, so every one of
	// them gets all of it. `children` is that page.
	let { data, children }: LayoutProps = $props();

	// `$derived` works the list out again whenever the data or the address
	// changes, which is what moves the marked tab as the reader goes from one page
	// to the next. A plain member gets only Overview and Papers, because Members
	// and Seats are pages only a head may open.
	const tabs = $derived(
		delegationTabs(
			data.delegation.id,
			data.myRole,
			data.memberCount,
			data.seatCounts.allocated,
			page.url.pathname
		)
	);
</script>

<!--
	`max-w-240` is the width every page under this layout wraps itself in, so the
	strip lines up with what is below it.
-->
<div class="mx-auto mb-6 max-w-240">
	<Tabs {tabs} />
</div>

{@render children()}
