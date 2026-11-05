<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { PAPER_COMMENT_MAX_LENGTH, type PaperComment } from '$lib/paper-comments';

	type Props = {
		comment: PaperComment;
		threadId: string;
		/** Where Cancel goes: the paper without `?editComment=`. */
		paperUrl: ResolvedPathname;
	};

	let { comment, threadId, paperUrl }: Props = $props();

	const uid = $props.id();
	const fieldId = `${uid}-edit`;
	const inPlace = createInPlaceForm();
</script>

<!--
	The reader's own comment, open to change. The page shows it in place of
	the comment when its address has `?editComment=<id>`, so it needs no script; the
	save comes back to the paper without it.
-->
<form method="post" action="?/editComment" use:enhance={inPlace.submit} class="mt-1">
	<input type="hidden" name="commentId" value={comment.id} />
	<input type="hidden" name="threadId" value={threadId} />
	<label for={fieldId} class="sr-only">Your comment</label>
	<Textarea
		id={fieldId}
		name="body"
		rows={3}
		required
		maxlength={PAPER_COMMENT_MAX_LENGTH}
		value={comment.body}
		readonly={inPlace.isBusy}
		class="min-h-0 resize-none px-2.5 py-1.5 text-dense md:text-dense"
	/>
	<div class="mt-2 flex items-center gap-3">
		<Button
			type="submit"
			variant="outline"
			class="h-8 border-input px-3 text-small font-medium max-lg:h-11"
			disabled={inPlace.isBusy}
		>
			Save changes
		</Button>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the paper's own address, already resolved by the page that passes it -->
		<a href={paperUrl} class="text-caption text-link hover:underline">Cancel</a>
	</div>
</form>
