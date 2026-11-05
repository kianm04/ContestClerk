<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import Hand from '@lucide/svelte/icons/hand';
	import ListOrdered from '@lucide/svelte/icons/list-ordered';
	import MessagesSquare from '@lucide/svelte/icons/messages-square';
	import Mic from '@lucide/svelte/icons/mic';
	import Users from '@lucide/svelte/icons/users';
	import Vote from '@lucide/svelte/icons/vote';
	import type { ResolvedPathname } from '$app/types';
	import { tabKeyShortcuts } from '$lib/chair-frame';
	import type { ConsoleViewIcon, ModeBarTab } from '$lib/live-mode';
	import Kbd from '$lib/components/Kbd.svelte';

	type Props = {
		/** The view, whether it is selected or live, and its count (`modeBarTabs`). */
		tab: ModeBarTab;
		/** Where it links: `chair` for the live view, its own route for any other (`chairPageUrl`). */
		href: ResolvedPathname;
	};

	let { tab, href }: Props = $props();

	/** The Lucide icon of each view, by the name `$lib/live-mode.ts` gives it. */
	const ICONS: Record<ConsoleViewIcon, LucideIcon> = {
		'list-ordered': ListOrdered,
		hand: Hand,
		'messages-square': MessagesSquare,
		users: Users,
		mic: Mic,
		vote: Vote
	};

	// `$derived` follows the tab, so the icon changes if the tab does.
	const Icon = $derived(ICONS[tab.icon]);

	/* The two looks, written out in full so Tailwind can find the class names. */
	const SELECTED_CLASSES =
		'font-medium text-brand-900 shadow-[inset_0_2px_0_var(--color-brand-500)]';
	const RESTING_CLASSES = 'text-ink-600 hover:text-ink-900';
</script>

<!--
	One view of the mode bar: its icon above its label, as in myMUN. The view
	the chair is looking at has dark blue words and a light blue rule above it
	(`aria-current="page"`). The view the room is in carries a light blue dot,
	a shape with no words on it, so a screen reader is told "live" instead.
	"Motions 2" counts the motions on the floor. A phone shows the short label,
	and the six tabs share its width.
-->
<a
	{href}
	aria-current={tab.isSelected ? 'page' : undefined}
	aria-keyshortcuts={tabKeyShortcuts(tab)}
	class="group/key relative flex w-26 flex-col items-center justify-center gap-0.5 text-small leading-4 max-[1180px]:w-23 max-md:w-auto max-md:min-w-11 max-md:flex-1 max-md:text-[12px] {tab.isSelected
		? SELECTED_CLASSES
		: RESTING_CLASSES}"
>
	<Icon size={24} strokeWidth={1.75} aria-hidden="true" />
	<span class="inline-flex items-center gap-1.5">
		{#if tab.isLive}
			<span class="size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true"></span>
		{/if}
		<span class="max-md:hidden">{tab.label}</span>
		<span class="md:hidden">{tab.shortLabel}</span>
		{#if tab.isLive}
			<span class="sr-only">, live</span>
		{/if}
		{#if tab.count !== null}
			<span
				class="min-w-[18px] rounded-full px-[5px] text-center text-[12px] leading-[18px] tabular-nums {tab.isSelected
					? 'bg-brand-100 text-brand-900'
					: 'bg-neutral-100 text-ink-600'}"
			>
				{tab.count}
			</span>
		{/if}
	</span>
	<Kbd keyName={tab.keyShortcut} />
</a>
