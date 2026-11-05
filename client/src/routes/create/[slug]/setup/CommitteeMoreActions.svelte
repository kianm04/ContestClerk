<script lang="ts">
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { goto } from '$app/navigation';
	import type { ResolvedPathname } from '$app/types';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	type Props = {
		/** Where deleting this committee leads: its own confirming dialog. */
		deleteHref: ResolvedPathname;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { deleteHref }: Props = $props();
</script>

<!--
	The square "More actions" button the Edit committee design draws left of
	the cross, 74 pixels from the right edge. Its menu holds the one other
	thing a committee can have done to it here, deleting it, which the footer
	also offers; without JavaScript the menu cannot open, and the footer's
	Delete still works.
-->
<DropdownMenu.Root>
	<DropdownMenu.Trigger
		aria-label="More actions"
		class="absolute top-5 right-18.5 flex size-10 items-center justify-center rounded-md border border-creation-button-border bg-white text-creation-ink-950 transition-colors hover:bg-creation-field max-lg:size-11"
	>
		<EllipsisVertical class="size-5" aria-hidden="true" />
	</DropdownMenu.Trigger>
	<DropdownMenu.Content
		align="end"
		class="creation-root creation-root-dialog rounded-lg border border-creation-panel-border bg-white p-1 shadow-creation-menu ring-0"
	>
		<DropdownMenu.Item
			class="h-7.5 gap-2 rounded-sm px-3 fs-14 lh-20 text-creation-red focus:bg-creation-hover focus:text-creation-red max-lg:h-11"
			onSelect={() => goto(deleteHref)}
		>
			<Trash2 class="size-4" aria-hidden="true" />
			Delete committee
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
