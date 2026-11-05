<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import { page } from '$app/state';
	import { confirmationPageUrl, type ConfirmVariant } from '$lib/confirmation';
	// The props, each explained, are in `$lib/confirm-button-props.ts`.
	import type { ConfirmButtonProps } from '$lib/confirm-button-props';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import Button from './Button.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';

	let {
		label,
		confirmTitle,
		confirmText,
		formaction,
		variant = 'danger',
		size = 'md',
		icon,
		children,
		areFieldsInDialog = false,
		onSubmit
	}: ConfirmButtonProps = $props();

	// The look of the button that answers the question, in the dialog and on the
	// confirmation page: the two quieter reds answer with the loud one.
	// `$derived` works it out again if `variant` changes.
	const answerVariant: ConfirmVariant = $derived(
		variant === 'soft-danger' || variant === 'quiet-danger' ? 'danger' : variant
	);

	// `$state` makes Svelte redraw when this changes, which is what opens the dialog.
	let isAsking = $state(false);

	/*
		Where the first press posts when there is no JavaScript: the `/confirm`
		page, which asks the same question as the dialog (see
		`$lib/confirmation.ts`). `page` from `$app/state` is the page being shown;
		its address turns a relative `formaction` such as `?/delete` into a full
		one. `$derived` works it out again if any of these change.
	*/
	const confirmationAddress = $derived(
		confirmationPageUrl(
			{ title: confirmTitle, text: confirmText, label, variant: answerVariant },
			formaction,
			page.url
		)
	);

	/*
		With JavaScript, the first press asks rather than acts: the default submit
		is stopped and the dialog opens instead. Without JavaScript nothing stops
		the submit, so the form posts to the confirmation page, which asks the
		same question. Either way the reader is asked once, and only the answer
		carries `confirm=1`.
	*/
	function handleAsk(event: MouseEvent) {
		event.preventDefault();
		isAsking = true;
	}

	function handleClose() {
		isAsking = false;
	}

	/*
		With JavaScript the confirmed form is sent in the background and the page
		redraws without reloading (`$lib/in-place-form.svelte.ts`). The dialog
		stays open, its button busy, until the page shows the answer.
	*/
	const inPlaceForm = createInPlaceForm({ onSettle: handleClose });

	/** Close the dialog at once and hand the press to `onSubmit`, which shows its result. */
	const submitInstantly: SubmitFunction = (input) => {
		handleClose();
		return onSubmit?.(input);
	};
</script>

<!--
	`use:enhance` hands the form to the helper above once JavaScript has loaded.
	Without JavaScript it never runs, and the form posts and reloads as before.
-->
<form
	method="post"
	action={formaction}
	use:enhance={onSubmit ? submitInstantly : inPlaceForm.submit}
>
	{#if children && !areFieldsInDialog}
		<div class="mb-3">
			{@render children()}
		</div>
	{/if}

	<Button
		{label}
		{variant}
		{size}
		{icon}
		isLabelHidden={icon !== undefined}
		formaction={confirmationAddress}
		onclick={handleAsk}
	/>

	<!--
		The dialog is inside the form, so its own button submits that same form. It
		draws the question, the note box and the Cancel/answer buttons.
	-->
	<ConfirmDialog
		isOpen={isAsking}
		title={confirmTitle}
		text={confirmText}
		{label}
		variant={answerVariant}
		isLoading={onSubmit ? false : inPlaceForm.isBusy}
		onClose={handleClose}
		fields={areFieldsInDialog ? children : undefined}
	/>
</form>
