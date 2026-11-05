<script lang="ts">
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { ResolvedPathname } from '$app/types';

	type Props = {
		/** What the row is, for the two links' spoken names: "Edit UNSC". */
		name: string;
		editHref: ResolvedPathname;
		deleteHref: ResolvedPathname;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { name, editHref, deleteHref }: Props = $props();

	// Both links share their box: 28 design pixels around an 18 pixel icon, 44 on a phone.
	const linkClass =
		'flex size-7 items-center justify-center rounded-sm transition-colors duration-150 hover:bg-creation-field max-lg:size-11';
</script>

<!--
	The blue pencil and the red bin at the end of a committee, question or fee
	row, 20 design pixels apart, as the design colours them. Both are links that
	open a dialog, so they work without JavaScript; nothing is deleted until the
	dialog confirms.
-->
<span class="flex shrink-0 items-center justify-end gap-5 max-lg:gap-1">
	<a href={editHref} aria-label="Edit {name}" class="{linkClass} text-creation-blue">
		<Pencil class="size-4.5" aria-hidden="true" />
	</a>
	<a href={deleteHref} aria-label="Delete {name}" class="{linkClass} text-creation-red-icon">
		<Trash2 class="size-4.5" aria-hidden="true" />
	</a>
</span>
