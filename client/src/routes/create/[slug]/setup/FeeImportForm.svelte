<script lang="ts">
	import FileText from '@lucide/svelte/icons/file-text';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** "€35 delegate fee": what the last edition charged. */
		previousFeeSummary: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { previousFeeSummary }: Props = $props();

	// Answers in place, so the page keeps its scroll position after the import.
	const importForm = createInPlaceForm();

	// The design sets the amount in bold: it is everything before the first space.
	const spaceAt = $derived(previousFeeSummary.indexOf(' '));
	const amount = $derived(
		spaceAt === -1 ? previousFeeSummary : previousFeeSummary.slice(0, spaceAt)
	);
	const rest = $derived(spaceAt === -1 ? '' : previousFeeSummary.slice(spaceAt));
</script>

<!--
	Last edition's fee, offered even after a fee exists, as the design draws it:
	the line 24 design pixels after the choices, the button at the far right.
	Bringing it over twice is harmless: the server skips a fee whose name this
	edition already has. `contents` lets the line and the button sit in the
	row of the parent as if this form were not there.
-->
<form
	method="POST"
	action="?/importFees"
	use:enhance={importForm.submit}
	class="flex flex-wrap items-center gap-2 lg:contents"
>
	<p class="fs-13 whitespace-nowrap text-creation-ink-450 lg:ml-6">
		Last year: <strong class="font-semibold text-creation-ink-950">{amount}</strong>{rest}
	</p>
	<Button
		type="submit"
		variant="outline"
		class="h-8.5 gap-2.5 rounded-md border-creation-track bg-white px-3.5 fs-13 font-medium text-creation-blue hover:bg-creation-hover hover:text-creation-blue max-lg:min-h-11 lg:ml-auto"
		disabled={importForm.isBusy}
	>
		<FileText class="size-4" aria-hidden="true" />
		Use last year's fee
	</Button>
</form>
