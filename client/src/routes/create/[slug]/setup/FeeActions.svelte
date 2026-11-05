<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { Button } from '$lib/components/ui/button';

	type Props = {
		/** The save form's `id`; the button joins it by its `form` attribute. */
		form: string;
		isBusy: boolean;
		closeHref: ResolvedPathname;
		/** Set when editing: the board then draws Delete on the left and no Cancel. */
		deleteHref?: ResolvedPathname;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { form, isBusy, closeHref, deleteHref }: Props = $props();
</script>

<!--
	The fee dialog's buttons, drawn here rather than by `DialogActions`
	because the boards differ from it: Create fee has Cancel and Create on the
	right; Edit fee has a red-outlined Delete on the left and Save alone on the
	right, with no Cancel (the cross closes it).
-->
{#if deleteHref === undefined}
	<div class="mt-4.5 flex flex-wrap items-center justify-end gap-3.75">
		<Button
			href={closeHref}
			variant="outline"
			class="h-10 rounded-md border-creation-button-border bg-white px-6 fs-14 font-medium text-creation-cancel hover:bg-creation-field max-lg:h-11"
		>
			Cancel
		</Button>
		<Button
			type="submit"
			{form}
			disabled={isBusy}
			class="h-10 rounded-md bg-creation-blue px-5.5 fs-14 font-semibold text-white hover:bg-creation-blue/90 max-lg:h-11"
		>
			Create fee
		</Button>
	</div>
{:else}
	<div class="mt-4.25 flex flex-wrap items-center justify-between gap-3">
		<Button
			href={deleteHref}
			variant="outline"
			class="h-10.75 gap-3 rounded-md border-creation-red bg-white px-4.5 fs-17 font-medium text-creation-red hover:bg-creation-red-tint hover:text-creation-red max-lg:h-11"
		>
			<Trash2 class="size-5" aria-hidden="true" />
			Delete
		</Button>
		<Button
			type="submit"
			{form}
			disabled={isBusy}
			class="h-11 rounded-md bg-creation-blue px-6 fs-17 font-semibold text-white hover:bg-creation-blue/90"
		>
			Save changes
		</Button>
	</div>
{/if}
