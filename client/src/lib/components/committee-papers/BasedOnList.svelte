<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { paperKindAndNumber, type PaperSource } from '$lib/committee-papers';
	import { cn } from '$lib/utils';

	type Props = {
		/** The working papers the draft is based on, by number. */
		sources: PaperSource[];
		/** The one open beside the draft, or `null` while none is. */
		selectedId: string | null;
		/** Where each one opens, such as `committeePaperSourceUrl` in `$lib/urls.ts` makes. */
		hrefFor: (sourceId: string) => ResolvedPathname;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { sources, selectedId, hrefFor }: Props = $props();

	/** A row's look: the pale blue of a chosen option for the open one, the hover tint for the rest. */
	function rowClasses(isSelected: boolean): string {
		return cn(
			'flex min-h-11 items-center border-b border-border px-2 text-body transition-colors duration-150 lg:min-h-9',
			isSelected ? 'bg-selected text-accent-foreground' : 'text-link hover:bg-accent'
		);
	}
</script>

<!--
	The working papers a draft resolution is based on, beside the draft's text.
	Each is a link that opens it in the column beside, kept in the address, so
	it works without JavaScript. `aria-current` tells a screen reader which one
	is open, as the pale blue tells the eye.
-->
<nav aria-label="Based on">
	<h2 class="border-b border-foreground pb-2 text-label font-semibold text-foreground">Based on</h2>
	<ul>
		<!-- The `(source.id)` key lets Svelte keep each row as the list changes. -->
		{#each sources as source (source.id)}
			<li>
				<a
					href={hrefFor(source.id)}
					aria-current={source.id === selectedId ? 'true' : undefined}
					class={rowClasses(source.id === selectedId)}
				>
					{paperKindAndNumber(source)}
				</a>
			</li>
		{/each}
	</ul>
</nav>
