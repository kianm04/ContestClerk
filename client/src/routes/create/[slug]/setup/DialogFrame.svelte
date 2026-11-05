<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { onMount, type Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import type { ResolvedPathname } from '$app/types';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { creationClasses } from '$lib/creation-classes';

	type Props = {
		title: string;
		/** One line under the title. */
		description?: string;
		/** The dialog's width in the design's pixels, such as 649 for Create committee. */
		width: number;
		/** The design's padding for this dialog when not Create committee's `pt-5.5 pr-7 pb-3.5 pl-7`, and anything else about the box. */
		class?: string;
		/** The title's size when not 32 over 38, such as `fs-30 lh-36`. */
		titleClass?: string;
		/** The line's size when not 17 over 24. */
		descriptionClass?: string;
		/** Where the close cross sits and how big it is, when not Create committee's. */
		closeClass?: string;
		/** `center` for a delete, whose icon, title and sentence are centred. */
		align?: 'left' | 'center';
		/** Drawn above the title, such as the red circle of a delete. */
		above?: Snippet;
		/** The plain Setup address, which is the page with no dialog open. */
		closeHref: ResolvedPathname;
		children: Snippet;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let {
		title,
		description,
		width,
		class: className,
		titleClass,
		descriptionClass,
		closeClass,
		align = 'left',
		above,
		closeHref,
		children
	}: Props = $props();

	/*
		shadcn's dialog draws itself in a "portal", a spot at the end of <body>,
		which only exists once JavaScript runs. Until then (and for anybody
		without JavaScript) the portal is switched off, so the server draws the
		dialog where it stands and its form still works. `onMount` runs once, in
		the browser only.
	*/
	let isMounted = $state(false);
	onMount(() => {
		isMounted = true;
	});

	/*
		Which dialog is open lives in the address, so closing one (Escape, a
		click outside) goes back to the address without it. `replaceState`
		swaps the history entry rather than adding one, so Back leaves the step
		instead of reopening the dialog; `noScroll` keeps the page where it was.
	*/
	async function handleOpenChange(isOpen: boolean) {
		if (isOpen) return;
		// The link that opened this dialog points at the address it has now. It
		// is found before leaving, then given the focus back once the dialog is
		// gone, so a keyboard reader carries on from where they were.
		const address = window.location.pathname + window.location.search;
		const opener = document.querySelector<HTMLElement>(`main a[href="${CSS.escape(address)}"]`);
		await goto(closeHref, { replaceState: true, noScroll: true, keepFocus: true });
		opener?.focus();
	}
</script>

<!--
	The box every Setup dialog is drawn in, as the designs draw it: white, a 16
	pixel corner, a deep soft shadow, the serif title with its one line and a
	cross at the top right, over a dim of the step behind. shadcn's `Dialog`
	brings the behaviour; the classes bring the design's sizes.
	`open` is always true here: the page only draws this while the address asks
	for it. The portal puts the dialog outside the step, so it carries
	`creation-root` itself (layout.css) and every size inside counts in the
	design's pixels; `creation-root-dialog` draws it at least as large as
	Setup behind it, which the product owner asked for. Its width is the design's, set as a style because a class
	cannot hold a number that changes per dialog, and never wider than the
	window less a margin. Never taller than the window either, so on a short
	screen it scrolls inside itself instead of running off the bottom.
-->
<Dialog.Root open={true} onOpenChange={handleOpenChange}>
	<Dialog.Content
		showCloseButton={false}
		portalProps={{ disabled: !isMounted }}
		class={creationClasses(
			'creation-root creation-root-dialog flex max-h-[calc(100dvh-1.5rem)] flex-col gap-0 overflow-y-auto rounded-2xl bg-white pt-5.5 pr-7 pb-3.5 pl-7 text-creation-ink-950 shadow-creation-dialog ring-0 sm:max-w-none',
			align === 'center' && 'items-center text-center',
			className
		)}
		style="max-width: min(calc(100% - 2rem), calc({width} * var(--u)))"
	>
		{#if above}
			{@render above()}
		{/if}
		<Dialog.Title
			class={creationClasses(
				'font-display fs-32 lh-38 font-bold text-creation-ink-950',
				titleClass
			)}
		>
			{title}
		</Dialog.Title>
		{#if description}
			<Dialog.Description
				class={creationClasses('mt-0.5 fs-17 lh-24 text-creation-ink-500', descriptionClass)}
			>
				{description}
			</Dialog.Description>
		{/if}
		<!-- A link rather than a button, so it closes the dialog without JavaScript too. -->
		<Button
			variant="ghost"
			size="icon"
			href={closeHref}
			aria-label="Close"
			class={creationClasses(
				'absolute top-7.5 right-6 size-8 rounded-md text-creation-ink-600 hover:bg-creation-field hover:text-creation-ink-950 max-lg:size-11',
				closeClass
			)}
		>
			<X class="size-6" aria-hidden="true" />
		</Button>
		{@render children()}
	</Dialog.Content>
</Dialog.Root>
