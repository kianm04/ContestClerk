<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import ManageDialog from '$lib/components/manage/ManageDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** The paper's title. */
		title: string;
		/** The longest comment the database takes. */
		maxLength: number;
		/** The page with this dialog closed, where "Cancel" goes. */
		closeHref: ResolvedPathname;
	};

	let { title, maxLength, closeHref }: Props = $props();

	const inPlace = createInPlaceForm();
	const uid = $props.id();
</script>

<!--
	"Return to the authors", opened from the address (`?return=1`), so without
	JavaScript it is drawn on the page as a section with its form. The paper
	goes back to being written, and its authors read the comment on it.
-->
<ManageDialog title="Return “{title}”?" {closeHref}>
	<form method="post" action="?/return" use:enhance={inPlace.submit} class="flex flex-col gap-4">
		<div class="flex flex-col gap-1.5">
			<label for="{uid}-comment" class="text-label text-foreground">What should change</label>
			<Textarea
				id="{uid}-comment"
				name="comment"
				rows={5}
				required
				maxlength={maxLength}
				readonly={inPlace.isBusy}
			/>
			<p class="text-small text-muted-foreground">The authors read this with the paper.</p>
		</div>
		<div class="flex flex-wrap gap-3">
			<Button type="submit" size="lg" class="max-lg:h-11" disabled={inPlace.isBusy}>
				Return to the authors
			</Button>
			<Button href={closeHref} variant="outline" size="lg" class="max-lg:h-11">Cancel</Button>
		</div>
	</form>
</ManageDialog>
