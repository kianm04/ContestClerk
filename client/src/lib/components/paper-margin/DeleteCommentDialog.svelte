<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import ManageDialog from '$lib/components/manage/ManageDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		commentId: string;
		/** The paper with this dialog closed, where "Keep the comment" goes. */
		closeHref: ResolvedPathname;
	};

	let { commentId, closeHref }: Props = $props();

	const inPlace = createInPlaceForm();
</script>

<!--
	The confirmation a comment's Delete link opens, `?deleteComment=<id>`. The
	comment keeps its place in the thread as "Comment deleted", so the replies
	under it still read in order.
-->
<ManageDialog title="Delete this comment?" {closeHref}>
	<p class="max-w-md text-body text-foreground">
		Its words are removed for everyone. The thread shows that a comment was deleted.
	</p>

	<form
		method="post"
		action="?/deleteComment"
		use:enhance={inPlace.submit}
		class="flex flex-wrap gap-3 pt-3"
	>
		<input type="hidden" name="commentId" value={commentId} />
		<Button
			type="submit"
			variant="destructive"
			size="lg"
			class="max-lg:h-11"
			disabled={inPlace.isBusy}
		>
			Delete comment
		</Button>
		<Button href={closeHref} variant="outline" size="lg" class="max-lg:h-11"
			>Keep the comment</Button
		>
	</form>
</ManageDialog>
