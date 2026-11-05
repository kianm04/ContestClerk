<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import { sharedChairForm, type ChairSubmitInput } from '$lib/chair-form';
	import { REVIEW_COMMENT_MAX_LENGTH } from '$lib/documents-page';
	import { approvePaperPress, requestPaperChangesPress } from '$lib/paper-presses';

	type Props = {
		/** The paper this form reviews. */
		documentId: string;
		/**
		 * What the comment box starts with: what was typed before a refusal, or
		 * nothing. The paper's last comment is never put in the box (T170), so an
		 * approval cannot send an old "please fix the citations" again unseen.
		 */
		typedComment: string;
		/** "Your last comment, 3 Oct: …" above the box, or null when there is none. */
		lastComment: string | null;
		/** Why the last review of this paper was refused, or null. */
		error: string | null;
		/** The form's own address, which runs `approve`. */
		approveAction: string;
		/** The address "Request changes" sends the same form to instead. */
		requestChangesAction: string;
	};

	let { documentId, typedComment, lastComment, error, approveAction, requestChangesAction }: Props =
		$props();

	// The chair layout's shared instant form (T141): the paper's badge and
	// comment change at once, through `handleReview` below.
	const chairForm = sharedChairForm();

	/**
	 * Works out what the pressed button will save. `input.action.search` tells
	 * "Approve" and "Request changes" apart, since both buttons send the same
	 * form. This page's actions carry the status filter too (`chairPapersActionUrl`
	 * builds addresses like `?status=submitted&/approve`), so the check looks
	 * for the action name at the end rather than comparing the whole search
	 * string. A comment the server would refuse is left as typed, for the
	 * chair to fix.
	 *
	 * A review the screen takes at once empties the box again, so that it
	 * starts empty for the next review, as it does after a reload. The comment
	 * then shows as the last one above it. `formData` was read from the form
	 * before this runs, so emptying the box does not change what is sent.
	 */
	function handleReview(input: ChairSubmitInput) {
		const comment = String(input.formData.get('comment') ?? '');
		const isApprove = input.action.search.endsWith('/approve');
		const now = new Date();
		const expected = isApprove
			? approvePaperPress(comment, documentId, now)
			: requestPaperChangesPress(comment, documentId, now);

		if (expected !== null) input.formElement.reset();

		return expected;
	}
</script>

<!--
	One form with two buttons. "Approve" sends it to the form's own address;
	"Request changes" carries a `formaction`, which sends the same fields to
	another action. Both work without JavaScript.
-->
<form
	method="post"
	action={approveAction}
	class="flex flex-col gap-2 md:flex-row md:items-end"
	use:enhance={chairForm.submitExpecting(handleReview)}
>
	<input type="hidden" name="documentId" value={documentId} />

	<div class="min-w-0 flex-1">
		{#if lastComment}
			<p class="mb-2 text-small text-ink-600">{lastComment}</p>
		{/if}
		<TextArea
			label="Comment"
			name="comment"
			idKey="comment-{documentId}"
			value={typedComment}
			rows={2}
			maxLength={REVIEW_COMMENT_MAX_LENGTH}
			help="Optional when approving, required when requesting changes."
			{error}
		/>
	</div>

	<div class="flex flex-wrap gap-2">
		<Button label="Approve" variant="secondary" size="sm" />
		<Button label="Request changes" variant="ghost" size="sm" formaction={requestChangesAction} />
	</div>
</form>
