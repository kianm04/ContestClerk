<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { LucideIcon } from '@lucide/svelte';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import { menuItemClasses } from '$lib/button-classes';
	import { closeDetailsOnEscape, closeDetailsOnOutsideClick } from '$lib/details-menu';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import DropdownSummary from './DropdownSummary.svelte';

	/** One line of the menu: either a link, or a button that posts to a form action. */
	export type DropdownItem = {
		label: string;
		/** Built with a helper from `$lib/urls.ts`; a hand-written string is refused. */
		href?: ResolvedPathname;
		/** The form action this line posts to, such as `?/signOut`. */
		formaction?: string;
		/**
		 * A field the button sends with its form action, such as which speaker
		 * to move. A menu line has no form of its own, so this is how it says
		 * what it is about.
		 */
		name?: string;
		value?: string;
		/** `danger` colours a destructive line red. */
		tone?: 'default' | 'danger';
	};

	type Props = {
		/** What the menu is called. With an `icon` it is read by screen readers only. */
		label: string;
		/** An icon component from `@lucide/svelte`, for a menu with no visible words. */
		icon?: LucideIcon;
		/**
		 * A person's picture shown before the words, which is what the profile menu
		 * in the app shell opens from. On a phone the picture stands in for the
		 * words altogether; they are still there for a screen reader.
		 */
		avatar?: { name: string; imagePath?: string | null };
		items: DropdownItem[];
		/**
		 * Send a line's form action through this instead, such as an instant
		 * form's `submit` (`$lib/instant-form.svelte.ts`), whose result the page
		 * shows at once. The menu then folds away the moment a line is pressed.
		 */
		onSubmit?: SubmitFunction;
		/** A bare icon with no border, for a menu on every row of a list (`DropdownSummary`). */
		isQuiet?: boolean;
	};

	let { label, icon: Icon, avatar, items, onSubmit, isQuiet = false }: Props = $props();

	/*
		`bind:this` puts the real `<details>` element in this variable once Svelte
		has put it on the page. CLAUDE.md asks us to avoid it, but the two handlers
		below cannot do their job without it: only the element itself can say
		whether a click landed inside the menu.
	*/
	let details: HTMLDetailsElement | undefined = $state();

	// What each rule does, and why a `<details>` needs them, is in `$lib/details-menu.ts`.
	function handleDocumentClick(event: MouseEvent) {
		closeDetailsOnOutsideClick(details, event);
	}

	function handleDocumentKeydown(event: KeyboardEvent) {
		closeDetailsOnEscape(details, event);
	}

	/*
		With JavaScript a line's form action is sent in the background and the
		page redraws without reloading (`$lib/in-place-form.svelte.ts`). A menu
		that answered in place folds away again, as a page reload would leave it.
	*/
	function handleSettle() {
		if (details) details.open = false;
	}

	const inPlaceForm = createInPlaceForm({ onSettle: handleSettle });

	/** Fold the menu away at once and hand the press to `onSubmit`, which shows its result. */
	const submitInstantly: SubmitFunction = (input) => {
		handleSettle();
		return onSubmit?.(input);
	};
</script>

<!--
	`<svelte:document>` adds these listeners to the document itself rather than
	to an element in this component. Svelte removes them again when the menu
	leaves the page. Without JavaScript nothing here runs and the menu still
	opens and closes from its button, as before.
-->
<svelte:document onclick={handleDocumentClick} onkeydown={handleDocumentKeydown} />

<!--
	A native `<details>`, so the menu opens and closes with no JavaScript at all
	and the keyboard reaches it the way the browser intends. The `<form>` is what
	lets a line post to a form action; lines that are links ignore it.
-->
<details bind:this={details} class="relative">
	<DropdownSummary {label} icon={Icon} {avatar} {isQuiet} />

	<!-- `use:enhance` hands the form to the helper above; without JavaScript it posts as usual. -->
	<form
		method="post"
		use:enhance={onSubmit ? submitInstantly : inPlaceForm.submit}
		class="absolute right-0 z-10 mt-1 min-w-48 rounded-control border border-border bg-background py-1 shadow-card"
	>
		<ul>
			<!-- The `(item.label)` key lets Svelte reuse list items instead of rebuilding them. -->
			{#each items as item (item.label)}
				<li>
					{#if item.href}
						<a href={item.href} class={menuItemClasses(item.tone)}>{item.label}</a>
					{:else}
						<button
							type="submit"
							formaction={item.formaction}
							name={item.name}
							value={item.value}
							aria-busy={!onSubmit && inPlaceForm.isBusy ? 'true' : undefined}
							class={menuItemClasses(item.tone)}
						>
							{item.label}
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	</form>
</details>
