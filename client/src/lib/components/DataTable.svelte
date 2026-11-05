<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ResolvedPathname } from '$app/types';

	/** One column of the table. */
	export type TableColumn = {
		/** What the column is called in the data, and what a sort link sends as `?sort=`. */
		key: string;
		/** The heading the reader sees. */
		label: string;
		isSortable?: boolean;
		/** A Tailwind width class for the column, such as `w-32`. */
		width?: string;
		/**
		 * Tailwind classes that hide the heading at some widths, such as
		 * `xl:hidden`. The page's own cells for that column must carry the same.
		 */
		visibility?: string;
	};

	/** Which column the rows are sorted by, and which way round. */
	export type TableSort = {
		key: string;
		direction: 'asc' | 'desc';
	};

	type Props = {
		columns: TableColumn[];
		/** The sort the page is showing. Left out when the rows are in their natural order. */
		sort?: TableSort;
		/**
		 * The address a sort link points at for a column. Without it no heading is
		 * a link. Build the address with a helper from `$lib/urls.ts`.
		 */
		hrefForSort?: (key: string) => ResolvedPathname;
		/**
		 * The `<tr>` rows. The table stays dumb on purpose: the page writes its own
		 * rows, so a page that needs tick boxes or buttons in a cell just writes
		 * them. Under `md` a page shows cards instead of this table.
		 */
		children: Snippet;
		/**
		 * The flat table of the management pages (the manage redesign): no card
		 * around it and headings in sentence case. Its rows use `p-3 text-dense`
		 * cells.
		 */
		isDense?: boolean;
	};

	let { columns, sort, hrefForSort, children, isDense = false }: Props = $props();

	/*
		The two looks of the table, written out in full for Tailwind. The ordinary
		one sits in a white card, so it does not float on the page's grey, and
		`*:last:border-b-0` takes the line off its last row, whose bottom edge is
		the card's own border. The dense one lies flat on the white management
		page and keeps every row's line.
	*/
	const LOOKS = {
		card: {
			box: 'overflow-x-auto rounded-2xl border border-border bg-background',
			headingCell: 'px-3 py-2',
			heading: 'inline-flex min-h-11 items-center text-label text-muted-foreground uppercase',
			body: '*:last:border-b-0'
		},
		dense: {
			box: 'overflow-x-auto',
			headingCell: 'px-3',
			heading: 'inline-flex min-h-10 items-center text-small font-medium text-muted-foreground',
			body: ''
		}
	};

	const look = $derived(isDense ? LOOKS.dense : LOOKS.card);

	/**
	 * What a screen reader should say about a column: "sorted ascending",
	 * "sorted descending", or that it can be sorted but is not.
	 */
	function ariaSort(column: TableColumn): 'ascending' | 'descending' | 'none' | undefined {
		if (!column.isSortable) {
			return undefined;
		}

		if (sort?.key !== column.key) {
			return 'none';
		}

		return sort.direction === 'asc' ? 'ascending' : 'descending';
	}

	/** The little arrow after the heading of the column the rows are sorted by. */
	function sortArrow(column: TableColumn): string {
		if (sort?.key !== column.key) {
			return '';
		}

		return sort.direction === 'asc' ? ' ↑' : ' ↓';
	}
</script>

<!--
	A table that is wider than the screen scrolls sideways inside its box
	instead of pushing the page out.
-->
<div class={look.box}>
	<table class="w-full border-collapse text-left">
		<thead>
			<tr class="border-b border-border">
				<!-- The `(column.key)` key lets Svelte reuse headings instead of rebuilding them. -->
				{#each columns as column (column.key)}
					<th
						scope="col"
						aria-sort={ariaSort(column)}
						class="{look.headingCell} {column.width ?? ''} {column.visibility ?? ''}"
					>
						{#if column.isSortable && hrefForSort}
							<!-- A real link, so sorting works without JavaScript and can be shared. -->
							<a href={hrefForSort(column.key)} class="{look.heading} hover:text-link">
								{column.label}{sortArrow(column)}
							</a>
						{:else}
							<span class={look.heading}>
								{column.label}
							</span>
						{/if}
					</th>
				{/each}
			</tr>
		</thead>

		<tbody class={look.body}>
			{@render children()}
		</tbody>
	</table>
</div>
