<script lang="ts">
	import { onMount } from 'svelte';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import { CONTROL_CLASSES } from '$lib/form-fields';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import MarkdownContent from '$lib/components/markdown-editor/MarkdownContent.svelte';
	import { SESSION_NOTES_MAX_LENGTH, type SessionNotes } from '$lib/session-notes';

	type Props = {
		/** The form action the notes are posted to. */
		action: string;
		sessionId: string;
		/** The revision the text in the box starts from, 0 for notes never saved. */
		revision: number;
		/** What the box starts with: the stored Markdown, or what a refused save sent. */
		text: string;
		/** The id of the heading that names the box for a screen reader. */
		labelledBy: string;
		/** Another chair's notes, shown under the box after a save found them. */
		theirNotes: SessionNotes | null;
		/** Called, once the page's script runs, with text typed into the box before it did. */
		onTypedBeforeScript: (text: string) => void;
	};

	let { action, sessionId, revision, text, labelledBy, theirNotes, onTypedBeforeScript }: Props =
		$props();

	/*
		What the box holds now. `bind:value` rather than writing `value` onto the
		box keeps text typed before Svelte brought the page to life, which
		`$lib/components/TextField.svelte` explains in full.
	*/
	let currentText = $derived(text);

	// `onMount` runs in the browser once the page's script has started. The
	// panel then swaps this box for the editor, which takes over anything typed.
	onMount(() => {
		if (currentText !== text) onTypedBeforeScript(currentText);
	});

	const notesForm = createInPlaceForm();
</script>

<!--
	The notes without JavaScript: a plain text box holding the Markdown the
	notes are stored as, and a Save button. Markdown typed here (`**bold**`)
	shows formatted everywhere else.
-->
<form method="post" {action} class="flex flex-col gap-3" use:enhance={notesForm.submit}>
	<input type="hidden" name="sessionId" value={sessionId} />
	<input type="hidden" name="revision" value={revision} />
	<textarea
		name="body"
		rows="8"
		maxlength={SESSION_NOTES_MAX_LENGTH}
		placeholder="Write your notes here…"
		aria-labelledby={labelledBy}
		bind:value={currentText}
		class={CONTROL_CLASSES}></textarea>
	<!-- Outlined, not filled: on the Room page the room's own step is the one filled button (P1). -->
	<div>
		<Button label="Save notes" variant="secondary" isLoading={notesForm.isBusy} />
	</div>
</form>

{#if theirNotes !== null}
	<section aria-label="The notes saved by another chair" class="mt-4 rounded-control border p-3">
		<h3 class="mb-2 text-label text-ink-600 uppercase">Their notes</h3>
		<MarkdownContent html={theirNotes.bodyHtml} />
	</section>
{/if}
