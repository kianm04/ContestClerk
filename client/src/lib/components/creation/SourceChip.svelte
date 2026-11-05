<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import Calendar from '@lucide/svelte/icons/calendar';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import History from '@lucide/svelte/icons/history';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Users from '@lucide/svelte/icons/users';
	import { creationClasses } from '$lib/creation-classes';

	type Props = {
		/** Where a filled-in value came from, such as "Based on last conference". */
		label: string;
		/** Another icon than the one the designs give this label. */
		icon?: LucideIcon;
		/** `success` for the green "Generated" inside the name field. */
		tone?: 'neutral' | 'success';
		/** Another size than the Organisation board's 32 pixel pill, such as `h-6 px-2 fs-12`. */
		class?: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { label, icon, tone = 'neutral', class: className }: Props = $props();

	/** The icon the designs draw in each pill, by the words of `sourceChipLabel()`. */
	const ICONS: Record<string, LucideIcon> = {
		'Generated name': CircleCheck,
		'Suggested dates': Calendar,
		'From organisation': Users,
		'Based on last conference': History,
		Generated: Sparkles
	};

	// `$derived` picks the icon again if `icon` or `label` changes.
	const Icon = $derived(icon ?? ICONS[label]);
</script>

<!--
	A pale pill that says where a value came from, as the Organisation board
	draws it: 32 pixels tall, 13 pixel words that never wrap, a 16 pixel blue
	icon. `creationClasses` merges a size passed in over these, `fs-*` included.
-->
<span
	class={creationClasses(
		'inline-flex h-8 shrink-0 items-center gap-2 rounded-full px-3 fs-13 lh-16 font-medium whitespace-nowrap',
		tone === 'success'
			? 'bg-creation-green-pill text-creation-green-pill-text'
			: 'bg-creation-pill-soft text-creation-ink-500',
		className
	)}
>
	{#if Icon}
		<Icon
			aria-hidden="true"
			class={['size-4 shrink-0', tone === 'success' ? 'text-current' : 'text-creation-blue']}
		/>
	{/if}
	{label}
</span>
