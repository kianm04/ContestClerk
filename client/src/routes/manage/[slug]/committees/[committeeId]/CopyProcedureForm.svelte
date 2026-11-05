<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import FormCheckbox from '$lib/components/FormCheckbox.svelte';
	import { Label } from '$lib/components/ui/label';
	import { fieldId } from '$lib/form-fields';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import type { ProcedureCopyTarget } from '$lib/committee-procedure';

	type Props = {
		/** The conference's other committees the reader may change. */
		copyTargets: ProcedureCopyTarget[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { copyTargets }: Props = $props();

	// Sends the form in the background; without JavaScript it posts and reloads.
	const inPlaceForm = createInPlaceForm();
</script>

<!--
	"Copy to other committees": every ticked box sends its committee's id
	under `committeeIds`, and `copy_committee_procedure` copies the settings as
	saved, all but the format, to each of them.
-->
<form
	method="post"
	action="?/copyProcedure"
	class="max-w-2xl border-t border-border pt-5"
	use:enhance={inPlaceForm.submit}
>
	<fieldset class="flex flex-col gap-3">
		<legend class="mb-1.5 text-small font-medium text-foreground">Copy to other committees</legend>

		<!-- The `(target.id)` key lets Svelte keep each box with its own committee. -->
		{#each copyTargets as target (target.id)}
			<div class="flex items-center gap-3">
				<FormCheckbox
					id={fieldId(`copy-${target.id}`)}
					name="committeeIds"
					value={target.id}
					isChecked={false}
				/>
				<Label for={fieldId(`copy-${target.id}`)} class="text-body text-foreground">
					{target.name}
				</Label>
			</div>
		{/each}

		<p class="text-small text-muted-foreground">
			Copies the saved settings, all but the format. Save any changes above first.
		</p>

		<div>
			<Button
				label="Copy settings"
				variant="secondary"
				size="dense"
				isLoading={inPlaceForm.isBusy}
			/>
		</div>
	</fieldset>
</form>
