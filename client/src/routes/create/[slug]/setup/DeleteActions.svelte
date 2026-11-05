<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import type { DeleteDialogContent } from '$lib/creation-setup-dialog';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		content: DeleteDialogContent;
		closeHref: ResolvedPathname;
		/** The row's distance from what is above it and the gap between the buttons, per board. */
		class: string;
		/** The two buttons' height, padding and type size, per board. */
		cancelClass: string;
		submitClass: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { content, closeHref, class: className, cancelClass, submitClass }: Props = $props();

	// Sends the delete without reloading; the action's redirect closes the dialog.
	const deleteForm = createInPlaceForm();
</script>

<!--
	Cancel and the red delete, at the right. The one red button on the step:
	the bin that opened this dialog only asked. The hidden input carries which
	row, so the action can check it is this draft's.
-->
<form
	method="POST"
	action="?/{content.action}"
	use:enhance={deleteForm.submit}
	class="flex flex-wrap items-center justify-end self-stretch {className}"
>
	<input type="hidden" name="id" value={content.id} />
	<Button
		variant="outline"
		href={closeHref}
		class="rounded-md border-creation-button-border bg-white font-medium text-creation-cancel hover:bg-creation-field max-lg:min-h-11 {cancelClass}"
	>
		Cancel
	</Button>
	<Button
		type="submit"
		disabled={deleteForm.isBusy}
		class="rounded-md bg-creation-red font-semibold text-white hover:bg-creation-red/90 max-lg:min-h-11 {submitClass}"
	>
		{content.buttonLabel}
	</Button>
</form>
