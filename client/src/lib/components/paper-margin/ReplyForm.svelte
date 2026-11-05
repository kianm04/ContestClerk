<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { PAPER_COMMENT_MAX_LENGTH } from '$lib/paper-comments';

	type Props = {
		/** Who started the thread, which names the field: "Reply to Daniel Osei". */
		replyingTo: string;
		/**
		 * The thread replied to; or, for the first reply on a suggestion, the
		 * fields that start its thread, read the moment the reply is sent.
		 */
		to: { threadId: string } | { startThread: () => Record<string, string> };
	};

	let { replyingTo, to }: Props = $props();

	// `$props.id()` is an id of this form's own, the same on the server and in the browser.
	const uid = $props.id();
	const fieldId = `${uid}-reply`;
	const action = $derived('threadId' in to ? '?/reply' : '?/startThread');

	// Empties the field once the reply is saved, ready for the next one.
	const inPlace = createInPlaceForm({
		isResetAfterSave: true,
		onSend: (formData) => {
			if ('startThread' in to) {
				for (const [field, value] of Object.entries(to.startThread())) formData.set(field, value);
			}
		}
	});
</script>

<!-- The field's label is for a screen reader; the card it sits in already shows whose thread it is. -->
<form method="post" {action} use:enhance={inPlace.submit} class="mt-3.5">
	{#if 'threadId' in to}
		<input type="hidden" name="threadId" value={to.threadId} />
	{/if}
	<label for={fieldId} class="sr-only">Reply to {replyingTo}</label>
	<Textarea
		id={fieldId}
		name="body"
		rows={3}
		required
		maxlength={PAPER_COMMENT_MAX_LENGTH}
		readonly={inPlace.isBusy}
		class="min-h-0 resize-none px-2.5 py-1.5 text-dense md:text-dense"
	/>
	<div class="mt-2">
		<Button
			type="submit"
			variant="outline"
			class="h-8 border-input px-3 text-small font-medium max-lg:h-11"
			disabled={inPlace.isBusy}
		>
			Reply
		</Button>
	</div>
</form>
