<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import ManageDialog from '$lib/components/manage/ManageDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** The paper's title. */
		title: string;
		/** The paper's page with this dialog closed, where "Keep the paper" goes. */
		closeHref: ResolvedPathname;
	};

	let { title, closeHref }: Props = $props();

	// Sent in the background, so the browser does not ask about unsaved text on the way out.
	const inPlace = createInPlaceForm();
</script>

<!--
	The confirmation "Delete paper" opens, in place of "Leave" for the only
	author: nobody else could carry the paper on. It opens only while the
	paper has never been submitted.
-->
<ManageDialog title="Delete “{title}”?" {closeHref}>
	<p class="max-w-md text-body text-foreground">
		Nobody else writes this paper and it has never been submitted. It is deleted for good, with
		everything written in it.
	</p>

	<form
		method="post"
		action="?/delete"
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
			Delete paper
		</Button>
		<Button href={closeHref} variant="outline" size="lg" class="max-lg:h-11">Keep the paper</Button>
	</form>
</ManageDialog>
