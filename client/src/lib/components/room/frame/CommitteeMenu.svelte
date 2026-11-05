<script lang="ts">
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import type { ResolvedPathname } from '$app/types';
	import type { CommitteeMenuLink, SessionControls } from '$lib/chair-frame';
	import { KEY_SHORTCUTS } from '$lib/console-keys';
	import MenuSessionControls from './MenuSessionControls.svelte';
	import ShortcutsSection from './ShortcutsSection.svelte';

	type Props = {
		/** Papers, Notes, Awards and the session record (`committeeMenuLinks`). */
		links: CommitteeMenuLink[];
		/** Where "Leave chair room" goes: `/home`. */
		leaveHref: ResolvedPathname;
		/** Whether the console's single-key shortcuts are on in this browser. */
		areShortcutsOn: boolean;
		onToggleShortcuts: () => void;
		/**
		 * How many times "?" has asked for the list of keys. Each new ask opens
		 * the menu at the list, even when the chair closed it after the last one.
		 */
		keyListRequestCount: number;
		/** Suspend and End for a phone, or null while no session runs. */
		sessionControls: SessionControls | null;
	};

	let {
		links,
		leaveHref,
		areShortcutsOn,
		onToggleShortcuts,
		keyListRequestCount,
		sessionControls
	}: Props = $props();

	// Whether the menu and its list of keys are open. Both open whenever "?"
	// asks again; a `$derived` can be assigned to, so the chair's own clicks
	// then open and close them. `askCount` passes a change on only when the
	// count itself changes, so the parent drawing the bar again (a realtime
	// reload, say) does not reopen a menu the chair has closed.
	const askCount = $derived(keyListRequestCount);
	let isMenuOpen = $derived(askCount > 0);
	const isKeyListOpen = $derived(askCount > 0);

	/** The browser opened or closed the `<details>` itself, from its summary. */
	function handleToggle(event: Event & { currentTarget: HTMLDetailsElement }) {
		isMenuOpen = event.currentTarget.open;
	}

	/** Escape closes the menu; a click outside it does too. */
	function handleDocumentKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') isMenuOpen = false;
	}

	function handleDocumentClick(event: MouseEvent) {
		const isInside =
			event.target instanceof Element && event.target.closest('[data-committee-menu]');

		if (!isInside) isMenuOpen = false;
	}

	/** Following a link or pressing Suspend or End folds the menu away, as a reload would. */
	function handleClose() {
		isMenuOpen = false;
	}

	const ITEM_CLASSES = 'flex min-h-10 items-center rounded-lg px-3 hover:bg-neutral-100';
</script>

<!-- Listens on the whole page for Escape and a click outside; without JavaScript, nothing here runs. -->
<svelte:document onclick={handleDocumentClick} onkeydown={handleDocumentKeydown} />

<!--
	The committee menu, `⋯` in the top bar: a native `<details>`, so it opens
	without JavaScript. Papers, Notes and Awards open inside the frame, with the
	mode bar still at the bottom. "?" opens it at the list of keys, which is
	what its `aria-keyshortcuts` tells a screen reader.
-->
<details data-committee-menu class="relative" open={isMenuOpen} ontoggle={handleToggle}>
	<summary
		aria-label="Committee menu"
		aria-keyshortcuts={KEY_SHORTCUTS.keyList}
		class="flex size-11 cursor-pointer list-none items-center justify-center rounded-control text-ink-600 hover:bg-neutral-100 hover:text-ink-900 [&::-webkit-details-marker]:hidden"
	>
		<Ellipsis size={20} strokeWidth={1.75} aria-hidden="true" />
	</summary>

	<nav
		aria-label="Committee"
		class="absolute top-full right-0 z-30 mt-1.5 max-h-[calc(100dvh-8rem)] w-max max-w-[min(26rem,calc(100vw-1rem))] min-w-56 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 text-body whitespace-normal shadow-card"
	>
		<!-- Each page has its own address, so the address keys its line. -->
		{#each links as link (link.href)}
			<a href={link.href} onclick={handleClose} class={ITEM_CLASSES}>{link.label}</a>
		{/each}

		<div class="my-1.5 border-t border-line pt-1.5">
			<ShortcutsSection {areShortcutsOn} {onToggleShortcuts} isOpen={isKeyListOpen} />
		</div>

		{#if sessionControls}
			<MenuSessionControls controls={sessionControls} onPress={handleClose} />
		{/if}

		<div class="mt-1.5 border-t border-line pt-1.5">
			<a href={leaveHref} onclick={handleClose} class={ITEM_CLASSES}>Leave chair room</a>
		</div>
	</nav>
</details>
