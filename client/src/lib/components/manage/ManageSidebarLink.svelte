<script lang="ts">
	import Lock from '@lucide/svelte/icons/lock';
	import type { ManageSidebarLink } from '$lib/manage-sidebar';
	import StepMarker from './StepMarker.svelte';

	type Props = {
		link: ManageSidebarLink;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { link }: Props = $props();

	/* Written out in full, because Tailwind reads the class names out of this file. */
	const SHARED_CLASSES =
		'flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 text-dense hover:no-underline lg:min-h-9';
	const ACTIVE_CLASSES = 'bg-selected font-semibold text-primary';
	const IDLE_CLASSES = 'text-foreground hover:bg-muted';
</script>

<!--
	One line of the management sidebar. `aria-current` tells a screen reader
	which page is open: "current step" on a draft's setup step, "current page"
	everywhere else.
-->
<a
	href={link.href}
	aria-current={link.isActive ? link.currentKind : undefined}
	class="{SHARED_CLASSES} {link.isActive ? ACTIVE_CLASSES : IDLE_CLASSES}"
>
	{#if link.marker.kind === 'step'}
		<StepMarker number={link.marker.number} isDone={link.marker.isDone} isCurrent={link.isActive} />
	{:else}
		<!-- A tag with a dot in its name draws whichever icon component the link holds. -->
		<link.marker.icon
			size={18}
			strokeWidth={1.75}
			aria-hidden="true"
			class="shrink-0 {link.isActive ? 'text-link' : 'text-muted-foreground'}"
		/>
	{/if}

	<span class="flex-1">
		{link.label}
		{#if link.marker.kind === 'step' && link.marker.isDone}
			<span class="sr-only">, done</span>
		{/if}
	</span>

	{#if link.note}
		<span class="text-caption font-normal text-muted-foreground">{link.note}</span>
	{/if}

	{#if link.count !== null}
		<span class="text-small font-normal text-muted-foreground tabular-nums">{link.count}</span>
	{/if}

	{#if link.isLocked}
		<span title="Finish the steps above first" class="text-placeholder">
			<Lock size={14} strokeWidth={1.75} aria-hidden="true" />
			<span class="sr-only">, finish the steps above first</span>
		</span>
	{/if}
</a>
