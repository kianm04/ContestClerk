<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import FormActions from '$lib/components/FormActions.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import {
		REVIEW_COMMENT_MAX_LENGTH,
		type DocumentsPageView,
		type PaperSeatRow
	} from '$lib/documents-page';
	import { manageDocumentsActionUrl, manageDocumentsUrl } from '$lib/urls';

	type Props = {
		/** The seat whose paper is being sent back. */
		seat: PaperSeatRow;
		documentId: string;
		view: DocumentsPageView;
		conferenceSlug: string;
		/** What was typed before a refusal. */
		comment: string;
		error: string | null;
		/** `PaperSeatList`'s shared instant form, so this press previews too. */
		onSubmit: SubmitFunction;
	};

	let { seat, documentId, view, conferenceSlug, comment, error, onSubmit }: Props = $props();

	// `$derived` works these out again whenever the address changes.
	const requestAction = $derived(manageDocumentsActionUrl(conferenceSlug, view, 'requestChanges'));
	const cancelHref = $derived(
		manageDocumentsUrl(conferenceSlug, { ...view, reviewDocumentId: null })
	);
</script>

<!--
	An ordinary form on the page rather than the dialog in the page file:
	"Request changes" is a link that adds `?review=<paper>` to the address, so it
	opens this form without JavaScript too, and a form here cannot sit inside the
	list's own form. "Cancel" is the same address without `review`.
-->
<form
	method="post"
	action={requestAction}
	class="flex flex-col gap-4 border-b border-border pb-5"
	use:enhance={onSubmit}
>
	<h3 class="text-body font-semibold text-foreground">
		Request changes from {seat.delegateName ?? 'the delegate'} ({seat.seatName})
	</h3>
	<input type="hidden" name="documentId" value={documentId} />
	<TextArea
		label="What should change"
		name="reviewComment"
		value={comment}
		rows={4}
		maxLength={REVIEW_COMMENT_MAX_LENGTH}
		{error}
		help="The delegate sees this with their paper and can upload a new one."
		isDense
	/>
	<FormActions>
		<Button label="Cancel" variant="secondary" size="dense" href={cancelHref} />
		<Button label="Request changes" variant="primary" size="dense" />
	</FormActions>
</form>
