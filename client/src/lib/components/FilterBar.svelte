<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ResolvedPathname } from '$app/types';

	type Props = {
		/** The filter controls: search boxes, dropdowns, date fields. */
		children: Snippet;
		/**
		 * Where "Reset" goes: the same list with no filters on it. Without it no
		 * reset link is shown. Build it with a helper from `$lib/urls.ts`.
		 */
		resetHref?: ResolvedPathname;
		/**
		 * On a phone, lays the controls out two to a row, each half the width,
		 * instead of letting each keep its own width. A control that should take
		 * the whole row gives itself `col-span-2`. From tablet width up the row is
		 * the same either way. The conference directory asks for it (T180).
		 */
		isTwoColumnsOnPhone?: boolean;
	};

	let { children, resetHref, isTwoColumnsOnPhone = false }: Props = $props();

	/*
		A wrapping row: the controls fall onto as many lines as they need rather
		than squeezing. `items-end` lines the boxes up along their bottoms, because
		a labelled field is taller than a bare one. The phone grid switches back to
		that row at `md`, Tailwind's tablet width.
	*/
	const rowClasses = $derived(
		isTwoColumnsOnPhone
			? 'grid grid-cols-2 items-end gap-3 md:flex md:flex-wrap'
			: 'flex flex-wrap items-end gap-3'
	);
</script>

<div class={rowClasses}>
	{@render children()}

	{#if resetHref}
		<a
			href={resetHref}
			class="inline-flex min-h-11 items-center text-small text-brand-700 hover:underline"
		>
			Reset
		</a>
	{/if}
</div>
