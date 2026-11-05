<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { SortableList } from '$lib/sortable-list.svelte';

	type Props = {
		/** The list's dragging helper, which says where this row is drawn while one is dragged. */
		sortable: SortableList;
		/** The id of the row, the same one its `DragHandle` is given. */
		id: string;
		/** Where the row stands in the list, counting from 0. */
		index: number;
		/** Extra Tailwind classes for the `<li>`, such as the rounded corners of the card inside it. */
		classes?: string;
		/** The row itself, written between `<SortableItem>` and `</SortableItem>`. */
		children: Snippet;
	};

	let { sortable, id, index, classes = '', children }: Props = $props();

	// Where the dragging helper draws this row now: how far it has slid, and
	// whether it is the one lifted out of the list. Both change as a drag goes on.
	const offset = $derived(sortable.offsetOf(index));
	const dragClasses = $derived(sortable.rowClassesOf(id));
</script>

<!--
	One row of a list that can be dragged into order. `data-sortable-row` lets
	the dragging helper (`$lib/sortable-list.svelte.ts`) measure the row, and
	`style:transform` slides it by `offset` pixels while a row is dragged,
	without changing the order the rows are in. The list around it carries
	`data-sortable-list`.
-->
<li
	data-sortable-row
	style:transform={offset === 0 ? undefined : `translateY(${offset}px)`}
	class="{classes} {dragClasses}"
>
	{@render children()}
</li>
