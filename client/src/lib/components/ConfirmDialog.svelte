<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ConfirmVariant } from '$lib/confirmation';
	import Button from './Button.svelte';
	import FormActions from './FormActions.svelte';
	import Modal from './Modal.svelte';

	type Props = {
		/** Whether the dialog is open. `ConfirmButton` sets this the moment its button is pressed. */
		isOpen: boolean;
		/** The heading of the question: "Delete this committee?" */
		title: string;
		/** What will happen, in one sentence, so the reader can weigh it up. */
		text: string;
		/** The words on the button that answers the question, matching the one that opened it. */
		label: string;
		/** The look of the button that answers the question. */
		variant: ConfirmVariant;
		/** True while the confirmed press is on its way, so the button shows it is busy. */
		isLoading: boolean;
		onClose: () => void;
		/**
		 * Fields to show under the sentence, such as `/settings`'s "type DELETE to
		 * confirm" box. `ConfirmButton` decides whether they belong here or above
		 * its button.
		 */
		fields?: Snippet;
	};

	let { isOpen, title, text, label, variant, isLoading, onClose, fields }: Props = $props();
</script>

<Modal {isOpen} {title} {onClose}>
	<p class="text-body text-ink-600">{text}</p>

	{#if fields}
		<div class="mt-3">
			{@render fields()}
		</div>
	{/if}

	<FormActions>
		<Button label="Cancel" variant="secondary" type="button" onclick={onClose} />
		<!-- `confirm=1` tells the action this press answered the question. -->
		<Button {label} {variant} name="confirm" value="1" {isLoading} />
	</FormActions>
</Modal>
