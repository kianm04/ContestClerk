<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { onMount, type Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import type { ResolvedPathname } from '$app/types';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';

	type Props = {
		/** The serif title, such as "Roles for Tomasz Zielinski". */
		title: string;
		/** One line of facts under the title, in grey. */
		description?: string;
		/** The page with no dialog open, which closing it goes back to. */
		closeHref: ResolvedPathname;
		/** What the dialog holds: a form and its buttons. */
		children: Snippet;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { title, description, closeHref, children }: Props = $props();

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
		swaps the history entry rather than adding one, so Back does not reopen
		the dialog; `noScroll` keeps the page where it was.
	*/
	async function handleOpenChange(isOpen: boolean) {
		if (isOpen) return;
		// The link that opened this dialog points at the address it has now. It
		// is found before leaving and given the focus back once the dialog is
		// gone, so a keyboard reader carries on from where they were.
		const address = window.location.pathname + window.location.search;
		const opener = document.querySelector<HTMLElement>(`main a[href="${CSS.escape(address)}"]`);
		await goto(closeHref, { replaceState: true, noScroll: true, keepFocus: true });
		opener?.focus();
	}
</script>

<!--
	A dialog of the management pages, drawn from the theme: white, the 10px
	corner and the one shadow docs/DESIGN.md gives floating things, a serif
	title with its line of facts, and a cross at the top right. `open` is
	always true: the page only draws this while the address asks for it. It
	never grows taller than the window, and scrolls inside itself instead.
-->
<Dialog.Root open={true} onOpenChange={handleOpenChange}>
	<Dialog.Content
		showCloseButton={false}
		portalProps={{ disabled: !isMounted }}
		class="max-h-[calc(100dvh-1.5rem)] gap-4 overflow-y-auto bg-background p-6 text-foreground shadow-card ring-0 sm:max-w-[30rem]"
	>
		<div class="pr-10">
			<Dialog.Title class="font-display text-h2">{title}</Dialog.Title>
			{#if description}
				<Dialog.Description class="mt-1 text-small text-muted-foreground">
					{description}
				</Dialog.Description>
			{/if}
		</div>

		<!-- A link rather than a button, so it closes the dialog without JavaScript too. -->
		<Button
			variant="ghost"
			size="icon"
			href={closeHref}
			aria-label="Close"
			class="absolute top-5 right-5 max-lg:size-11"
		>
			<X class="size-4" aria-hidden="true" />
		</Button>

		{@render children()}
	</Dialog.Content>
</Dialog.Root>
