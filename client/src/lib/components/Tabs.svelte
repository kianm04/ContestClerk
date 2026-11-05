<script lang="ts">
	import type { ResolvedPathname } from '$app/types';

	/** One tab. Every tab is a real link, so the URL says which one is open. */
	export type Tab = {
		label: string;
		/** Built with a helper from `$lib/urls.ts`; a hand-written string is refused. */
		href: ResolvedPathname;
		/** True for the tab the reader is on. The page works this out from the URL. */
		isActive: boolean;
		/**
		 * A number beside the label, such as how many applications are waiting,
		 * or a short count in words, such as "6 of 9".
		 */
		count?: number | string;
	};

	type Props = {
		tabs: Tab[];
	};

	let { tabs }: Props = $props();

	/**
	 * The colours and the underline of one tab. Written out in full for Tailwind.
	 * The open tab is the selected navigation item, so its words are dark blue
	 * and its underline the logo's light blue, as in the top bar.
	 */
	function tabClasses(isActive: boolean): string {
		if (isActive) {
			return 'border-ring text-primary font-medium';
		}

		return 'border-transparent text-muted-foreground hover:text-foreground';
	}
</script>

<!--
	Links rather than buttons, so that a tab can be opened in a new window and
	the back button works.

	The grey line under the whole strip is a shadow drawn inside the list rather
	than a border, so that the open tab's own underline covers it. A border would
	sit outside the list's scrolling area, and pulling the tabs down over it made
	the list taller than its box, which drew a vertical scrollbar beside the tabs
	in some browsers.
-->
<nav aria-label="Sections">
	<ul class="flex gap-4 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-line)]">
		<!-- The `(tab.href)` key lets Svelte reuse list items instead of rebuilding them. -->
		{#each tabs as tab (tab.href)}
			<li>
				<a
					href={tab.href}
					aria-current={tab.isActive ? 'page' : undefined}
					class="flex items-center gap-2 border-b-2 px-1 py-3 text-body whitespace-nowrap {tabClasses(
						tab.isActive
					)}"
				>
					{tab.label}

					{#if tab.count !== undefined}
						<span class="rounded-full bg-muted px-2 text-small text-muted-foreground"
							>{tab.count}</span
						>
					{/if}
				</a>
			</li>
		{/each}
	</ul>
</nav>
