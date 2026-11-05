<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import FileText from '@lucide/svelte/icons/file-text';
	import { enhance } from '$app/forms';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	// Answers in place, so the dialog stays open while the form is copied.
	const importForm = createInPlaceForm();
</script>

<!--
	The pale blue row at the top of the applications dialog: the whole row is
	one button that copies last year's settings and questions.
-->
<form
	method="POST"
	action="?/importApplicationForm"
	use:enhance={importForm.submit}
	class="col-span-2 mt-4"
>
	<button
		type="submit"
		disabled={importForm.isBusy}
		class="flex h-11.25 w-full items-center gap-3 rounded-md bg-creation-note pr-4 pl-6 text-left fs-16 lh-22 font-medium text-creation-ink-950 transition-colors duration-150 hover:bg-creation-hover focus-visible:ring-2 focus-visible:ring-creation-blue-focus focus-visible:outline-none disabled:opacity-60"
	>
		<FileText class="size-5.5 shrink-0 text-creation-blue" aria-hidden="true" />
		<span class="min-w-0 flex-1 truncate">Use last year's form (recommended)</span>
		<ChevronRight class="size-4.5 shrink-0" aria-hidden="true" />
	</button>
</form>
