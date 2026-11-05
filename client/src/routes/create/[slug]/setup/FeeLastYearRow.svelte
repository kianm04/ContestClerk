<script lang="ts">
	import Clock from '@lucide/svelte/icons/clock';
	import FileText from '@lucide/svelte/icons/file-text';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** Last year's fee in a few words, such as "€35 delegate fee". */
		summary: string;
		previousName: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { summary, previousName }: Props = $props();

	// Answers in place; copying last year's fees closes nothing.
	const importForm = createInPlaceForm();
</script>

<!-- The board's 60 pixel pale blue row under the new fee's fields, offering last year's fee instead. -->
<form
	method="POST"
	action="?/importFees"
	use:enhance={importForm.submit}
	class="mt-4 flex items-center gap-3.75 rounded-lg bg-creation-note pr-2.25 pl-4.25 max-lg:flex-wrap max-lg:py-3 lg:h-15"
>
	<Clock class="size-6.5 shrink-0 text-creation-blue" aria-hidden="true" />
	<div class="min-w-0 flex-1">
		<p class="fs-13 lh-18 font-semibold text-creation-ink-950">Last year: {summary}</p>
		<p class="fs-12 lh-17 text-creation-ink-450">
			Based on {previousName}. You can use this amount or set a different fee.
		</p>
	</div>
	<Button
		type="submit"
		variant="outline"
		class="h-9.5 shrink-0 gap-3 rounded-md border-creation-input-border bg-white px-3.5 fs-12.5 font-semibold text-creation-blue hover:bg-creation-field hover:text-creation-blue max-lg:min-h-11"
		disabled={importForm.isBusy}
	>
		<FileText class="size-4.5" aria-hidden="true" />
		Use last year's fee
	</Button>
</form>
