<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import ManageDialog from '$lib/components/manage/ManageDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** The paper's title. */
		title: string;
		/** What leaving does, from `leavePaperSentence`. */
		sentence: string;
		/** The paper's page with this dialog closed, where "Keep writing" goes. */
		closeHref: ResolvedPathname;
	};

	let { title, sentence, closeHref }: Props = $props();

	// Sent in the background, so the browser does not ask about unsaved text on the way out.
	const inPlace = createInPlaceForm();
</script>

<!--
	The confirmation "Leave" opens. Only this step is red; the link that
	opened it is plain. Leaving goes to the committee's papers, because the
	paper is no longer the reader's to open.
-->
<ManageDialog title="Leave “{title}”?" {closeHref}>
	<p class="max-w-md text-body text-foreground">{sentence}</p>

	<form
		method="post"
		action="?/leave"
		use:enhance={inPlace.submit}
		class="flex flex-wrap gap-3 pt-3"
	>
		<Button
			type="submit"
			variant="destructive"
			size="lg"
			class="max-lg:h-11"
			disabled={inPlace.isBusy}
		>
			Leave paper
		</Button>
		<Button href={closeHref} variant="outline" size="lg" class="max-lg:h-11">Keep writing</Button>
	</form>
</ManageDialog>
