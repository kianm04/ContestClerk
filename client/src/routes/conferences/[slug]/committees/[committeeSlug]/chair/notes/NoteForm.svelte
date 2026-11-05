<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import MarkdownEditor from '$lib/components/markdown-editor/MarkdownEditor.svelte';
	import { NOTE_BODY_MAX_LENGTH } from '$lib/chair-notes';
	import {
		NEW_ROW_ID_FIELD,
		newRowId,
		sharedChairForm,
		type ChairSubmitInput
	} from '$lib/chair-form';
	import { LABEL_CLASSES } from '$lib/form-fields';
	import { addNotePress } from '$lib/note-presses';

	type Props = {
		/** The seat the note is about. */
		seatId: string;
		/** Where the form posts, the `add` action with the seat still in the address. */
		action: string;
		/** What was typed before a refusal, so it is not lost. */
		body: string;
		/** Why the last note was refused, or null. */
		error: string | null;
		/** Puts the cursor in the box, right after a note was added or refused. */
		hasAutofocus: boolean;
		/** The signed-in chair, whom a newly added note is saved under. */
		readerId: string;
	};

	let { seatId, action, body, error, hasAutofocus, readerId }: Props = $props();

	// The chair layout's shared instant form (T141): a note appears on the list
	// the moment "Add note" is pressed, through `handleAdd` below.
	const chairForm = sharedChairForm();

	// `$props.id()` gives this form ids of its own, the same on the server and in the browser.
	const uid = $props.id();
	const labelId = `${uid}-label`;
	const errorId = `${uid}-error`;

	/*
		What the editor starts with, and a number that draws a fresh, empty
		editor when it goes up (see `{#key}` below). `$derived` follows `body`
		when the server sends back a refused note; "Add note" empties it.
	*/
	let startMarkdown = $derived(body);
	let editorVersion = $state(0);
	// The Markdown as typed so far, for the count under the editor.
	let typedMarkdown = $derived(body);

	/**
	 * Reads the box as typed and works out what "Add note" will save. A body
	 * the server would refuse (empty, or too long) is left as typed, for the
	 * chair to fix; a body expected to succeed empties the box at once, the way
	 * it came back empty after a page load before this change.
	 */
	function handleAdd(input: ChairSubmitInput) {
		const typed = String(input.formData.get('body') ?? '');
		const newNoteId = newRowId();
		const expectation = addNotePress(typed, seatId, newNoteId, readerId, new Date());

		if (expectation === null) return null;

		input.formData.set(NEW_ROW_ID_FIELD, newNoteId);
		// A fresh, empty editor, with the cursor in it for the next note at
		// once, as `?added=1` does without JavaScript.
		startMarkdown = '';
		typedMarkdown = '';
		editorVersion += 1;

		return expectation;
	}

	function handleChange(markdown: string) {
		typedMarkdown = markdown;
	}
</script>

<form
	method="post"
	{action}
	class="rounded-2xl border border-line bg-surface p-4"
	use:enhance={chairForm.submitExpecting(handleAdd)}
>
	<input type="hidden" name="seatId" value={seatId} />
	<p id={labelId} class={LABEL_CLASSES}>New note</p>
	<!--
		The shared Markdown editor with its compact toolbar (T144). Without
		JavaScript it is a plain box holding Markdown. `{#key}` draws it afresh,
		empty, once a note has been added.
	-->
	{#key editorVersion}
		<MarkdownEditor
			name="body"
			initialMarkdown={startMarkdown}
			labelledBy={labelId}
			placeholder="Write a note…"
			isCompact
			hasAutofocus={hasAutofocus || editorVersion > 0}
			onChange={handleChange}
		/>
	{/key}
	<p class="mt-1 text-right text-small text-ink-600">
		{typedMarkdown.length} / {NOTE_BODY_MAX_LENGTH}
	</p>
	<FieldError id={errorId} message={error} />
	<div class="mt-3 flex justify-end">
		<Button label="Add note" variant="primary" />
	</div>
</form>
