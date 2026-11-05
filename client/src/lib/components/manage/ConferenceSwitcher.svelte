<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	// `afterNavigate` runs the function it is given after every move from one
	// page to another, once the new page is on screen.
	import { afterNavigate } from '$app/navigation';
	import { formatDateRange } from '$lib/dates';
	import { closeDetailsOnEscape, closeDetailsOnOutsideClick } from '$lib/details-menu';
	import type { SwitcherConference } from '$lib/manage-sidebar';
	import { manageConferenceUrl } from '$lib/urls';

	type Props = {
		/** The conference being managed, named on the button. */
		current: SwitcherConference;
		/** Every conference the organiser can switch to, the current one among them. */
		conferences: SwitcherConference[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { current, conferences }: Props = $props();

	/*
		`bind:this` puts the real `<details>` element in this variable once Svelte
		has put it on the page. CLAUDE.md asks us to avoid it, but, as in
		`Dropdown`, only the element itself can say whether a click landed inside
		the menu, which is what closes it on a click anywhere else.
	*/
	let details: HTMLDetailsElement | undefined = $state();

	// What each rule does, and why a `<details>` needs them, is in `$lib/details-menu.ts`.
	function handleDocumentClick(event: MouseEvent) {
		closeDetailsOnOutsideClick(details, event);
	}

	function handleDocumentKeydown(event: KeyboardEvent) {
		closeDetailsOnEscape(details, event);
	}

	// The sidebar stays on screen while the organiser moves to another
	// conference, so the menu they picked it from is folded away again.
	afterNavigate(() => {
		if (details) details.open = false;
	});
</script>

<!--
	`<svelte:document>` adds these listeners to the document itself. Without
	JavaScript nothing here runs and the menu still opens and closes from its
	button.
-->
<svelte:document onclick={handleDocumentClick} onkeydown={handleDocumentKeydown} />

<!-- A native `<details>`, so the list opens and closes with no JavaScript at all. -->
<details bind:this={details} class="relative">
	<summary
		aria-label="Switch conference: {current.name}"
		class="flex cursor-pointer items-center justify-between gap-2 rounded-control border border-border bg-background p-2.5 hover:bg-muted"
	>
		<span class="min-w-0">
			<span class="block font-display text-[1rem] leading-[1.375rem] font-semibold text-foreground">
				{current.name}
			</span>
			<span class="block text-small text-muted-foreground">
				{formatDateRange(current.startDate, current.endDate)}
			</span>
		</span>
		<ChevronsUpDown
			size={16}
			strokeWidth={1.75}
			aria-hidden="true"
			class="shrink-0 text-muted-foreground"
		/>
	</summary>

	<ul
		class="absolute inset-x-0 z-10 mt-1 max-h-80 overflow-y-auto rounded-control border border-border bg-background py-1 shadow-card"
	>
		<!--
			The `(conference.slug)` key lets Svelte reuse lines instead of rebuilding
			them. `{@const}` names a value once for each line of the list.
		-->
		{#each conferences as conference (conference.slug)}
			{@const isCurrent = conference.slug === current.slug}
			<li>
				<a
					href={manageConferenceUrl(conference.slug)}
					aria-current={isCurrent ? 'page' : undefined}
					class="flex items-center gap-2 px-3 py-2 text-foreground hover:bg-muted hover:no-underline"
				>
					<span class="min-w-0 flex-1">
						<span class="block text-dense font-medium">{conference.name}</span>
						<span class="block text-small text-muted-foreground">
							{formatDateRange(conference.startDate, conference.endDate)}
						</span>
					</span>
					{#if isCurrent}
						<Check size={16} strokeWidth={2} aria-hidden="true" class="shrink-0 text-link" />
					{/if}
				</a>
			</li>
		{/each}
	</ul>
</details>

<style>
	/*
		Hide the little triangle a browser draws on a `<summary>`, as
		`SectionMenu` does. Safari needs its own rule, which Tailwind cannot write.
	*/
	summary {
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}
</style>
