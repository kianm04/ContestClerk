<script lang="ts">
	import type { Tab } from '../Tabs.svelte';

	type Props = {
		tabs: Tab[];
		/** What the row of tabs chooses between, for a screen reader. */
		label?: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { tabs, label = 'Sections' }: Props = $props();

	/**
	 * The colours and the underline of one tab, written out in full for
	 * Tailwind. The open tab's words are the link blue and its underline the
	 * logo's light blue.
	 */
	function tabClasses(isActive: boolean): string {
		if (isActive) {
			return 'border-ring font-semibold text-link';
		}

		return 'border-transparent text-muted-foreground hover:text-foreground';
	}
</script>

<!--
	The tabs of a management page in the manage redesign, such as "To review",
	"Waitlisted" and "Accepted" over the applications. They work as `Tabs` does,
	links that change the address, drawn smaller and with a plain count.

	The grey line under the strip is a shadow drawn inside the list, so the open
	tab's own underline covers it; `Tabs` explains why it is not a border.
-->
<nav aria-label={label} class="mb-5">
	<ul class="flex gap-6 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-line)]">
		<!-- The `(tab.href)` key lets Svelte reuse list items instead of rebuilding them. -->
		{#each tabs as tab (tab.href)}
			<li>
				<a
					href={tab.href}
					aria-current={tab.isActive ? 'page' : undefined}
					class="flex h-10 items-center gap-2 border-b-2 text-dense whitespace-nowrap {tabClasses(
						tab.isActive
					)}"
				>
					{tab.label}

					{#if tab.count !== undefined}
						<span class="text-small font-normal text-muted-foreground tabular-nums"
							>{tab.count}</span
						>
					{/if}
				</a>
			</li>
		{/each}
	</ul>
</nav>
