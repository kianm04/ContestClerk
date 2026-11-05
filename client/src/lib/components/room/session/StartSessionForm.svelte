<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { whenInstantFormsAnswered } from '$lib/instant-form.svelte';
	import { focusHeadingAfterPress } from '$lib/room-focus';

	type Props = {
		/** The button's words: "Start Session 2", "Start a practice session", "Start another session". */
		label: string;
		/**
		 * `primary` is the screen's one filled button, 56 px tall; `link` is a
		 * button that reads as a plain link, beside another step (P1).
		 */
		look: 'primary' | 'link';
		/** A committee with no seats cannot start a session. */
		isDisabled?: boolean;
		/**
		 * The form's id. The lobby's "Session name" field sits elsewhere on the
		 * screen and joins this form by naming it in its `form` attribute.
		 */
		formId?: string;
	};

	let { label, look, isDisabled = false, formId }: Props = $props();

	/** The opening band's heading, which takes the focus once the session has started (R12). */
	const OPENING_HEADING_ID = 'opening-heading';

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	// Starting a session also makes its General Speakers' List, whose id the
	// browser cannot know, so this one press waits for the server, with the
	// button's delayed spinner (T140). It also waits for the chair's presses
	// still on their way, such as "End session" pressed a moment before: sent
	// at once, it could arrive first and be refused (T184).
	const inPlaceForm = createInPlaceForm({
		waitBeforeSending: whenInstantFormsAnswered,
		onSettle: () => focusHeadingAfterPress([OPENING_HEADING_ID])
	});
</script>

<!-- Starts the next session, from the lobby or the ended screen. -->
<form
	id={formId}
	method="post"
	action="?/startSession"
	use:enhance={inPlaceForm.submit}
	class={look === 'primary' ? 'max-md:w-full' : ''}
>
	{#if look === 'primary'}
		<!-- A grid track as wide as the button's words, at least 200 px; the full width on a phone. -->
		<div class="grid min-w-50 max-md:w-full">
			<Button
				{label}
				variant="primary"
				size="lg"
				isFullWidth
				{isDisabled}
				isLoading={inPlaceForm.isBusy}
			/>
		</div>
	{:else}
		<button
			type="submit"
			disabled={isDisabled || inPlaceForm.isBusy}
			class="inline-flex min-h-11 items-center font-medium text-brand-700 hover:underline disabled:text-ink-400 disabled:no-underline"
		>
			{label}
		</button>
	{/if}
</form>
