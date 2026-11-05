<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import FormActions from '$lib/components/FormActions.svelte';
	import type { InPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** The form the two buttons below belong to (`$lib/in-place-form.svelte.ts`). */
		applyForm: InPlaceForm;
	};

	let { applyForm }: Props = $props();
</script>

<!-- The band keeps the two buttons at the foot of the screen all the way
	through a long form, which `05-pages/delegate/apply.md` draws and
	`03-design/design-system.md` asks of every delegate page. It goes static
	from `lg` up, where the form sits beside its summary card and there is
	nothing left to chase. `FormActions` stops being sticky at `md` on its
	own, which is why the band and not the row carries this. -->
<div class="sticky bottom-0 bg-background py-2 lg:static lg:bg-transparent lg:py-0">
	<FormActions>
		<!-- "Save draft" skips the browser's own required-field check, because a
			half-filled draft is exactly what it is for. -->
		<Button
			label="Save draft"
			variant="secondary"
			formaction="?/saveDraft"
			skipsValidation
			isLoading={applyForm.isSending('?/saveDraft')}
		/>
		<Button
			label="Submit application"
			variant="primary"
			formaction="?/submit"
			isLoading={applyForm.isSending('?/submit')}
		/>
	</FormActions>
</div>
