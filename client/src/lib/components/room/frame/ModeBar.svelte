<script lang="ts">
	import type { SessionControls } from '$lib/chair-frame';
	import type { ModeBarTab } from '$lib/live-mode';
	import { chairPageUrl } from '$lib/urls';
	import ModeBarItem from './ModeBarItem.svelte';
	import SessionEndControl from './SessionEndControl.svelte';

	type Props = {
		/** The views in myMUN's order, each marked selected or live (`modeBarTabs`). */
		tabs: ModeBarTab[];
		/** The conference's and the committee's slugs, which every tab's address is built from. */
		conferenceSlug: string;
		committeeSlug: string;
		/** Suspend, End and End's confirmation, at the far right. */
		sessionControls: SessionControls;
	};

	let { tabs, conferenceSlug, committeeSlug, sessionControls }: Props = $props();
</script>

<!--
	The console's bottom bar, 64 px, on every chair page while a session runs:
	the views, then Suspend and End. The layout draws it only while a session
	is in progress (`isModeBarShown`). It stays at the bottom of the window,
	because the console is exactly the window's height and the page between
	the two bars scrolls on its own.
-->
<nav
	aria-label="Modes"
	class="relative flex h-16 shrink-0 items-stretch border-t border-line bg-surface px-3 max-md:px-0 print:hidden"
>
	<div class="flex max-md:flex-1">
		<!-- Each view has its own name, so the name keys its tab. -->
		{#each tabs as tab (tab.view)}
			<ModeBarItem {tab} href={chairPageUrl(conferenceSlug, committeeSlug, tab.route)} />
		{/each}
	</div>
	<SessionEndControl controls={sessionControls} />
</nav>
