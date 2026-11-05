<script lang="ts">
	import { fieldHelpId, fieldId } from '$lib/form-fields';

	type Props = {
		/** The words beside the box. */
		label: string;
		/** The name sent with the form. A ticked box sends `on`; an unticked one sends nothing. */
		name: string;
		isChecked: boolean;
		/** A quiet line under the label explaining what ticking it does. */
		help?: string;
		/**
		 * The id of a message drawn outside this component, for a screen reader to
		 * read out with the box.
		 *
		 * A tick box has no `error` of its own, unlike every other field here: the
		 * three places that need one — a multiple-choice group, a tick-box question
		 * and the consent box on the apply form — put one `FieldError` under a
		 * whole group rather than under each box, so the message lives outside and
		 * only its id comes in. Without this the message is drawn but never
		 * announced.
		 */
		describedById?: string;
		/**
		 * Draws the box and its words inside a white box with a border, as tall as
		 * the dropdown beside it, for a row of filters such as the conference
		 * directory's (T180).
		 */
		isBoxed?: boolean;
	};

	let { label, name, isChecked, help, describedById, isBoxed = false }: Props = $props();

	const inputId = $derived(fieldId(name));

	// A box can be described by its own help line, by a message beside it, or by
	// both. `aria-describedby` takes them space-separated, and `undefined` leaves
	// the attribute off altogether when there is nothing to say.
	const describedBy = $derived(
		[help ? fieldHelpId(name) : null, describedById ?? null].filter((id) => id !== null).join(' ')
	);

	/*
		Whether the box is ticked now: the server's answer to begin with, and
		whatever the reader does after that. `bind:checked` rather than writing
		`checked` onto the box keeps a tick made before Svelte brought the page to
		life, which `$lib/components/TextField.svelte` explains in full.
	*/
	let isCurrentlyChecked = $derived(isChecked);

	// A boxed row is exactly 44px tall with its border, like a dropdown, and
	// centres the box and its words in it.
	const rowClasses = $derived(
		isBoxed
			? 'flex min-h-11 items-center gap-3 rounded-control border border-line bg-surface px-3'
			: 'flex min-h-11 items-start gap-3 py-2'
	);
</script>

<!--
	The whole row is at least 44px tall, which is the touch target the design
	system asks for. The label sits beside the box rather than above it, because
	a tick box reads as a sentence.
-->
<div class={rowClasses}>
	<input
		id={inputId}
		{name}
		type="checkbox"
		bind:checked={isCurrentlyChecked}
		aria-describedby={describedBy === '' ? undefined : describedBy}
		class="mt-0.5 h-5 w-5 shrink-0 rounded border-line text-brand-700"
	/>

	<div>
		<label for={inputId} class="text-body text-ink-900">{label}</label>

		{#if help}
			<p id={fieldHelpId(name)} class="text-small text-ink-600">{help}</p>
		{/if}
	</div>
</div>
