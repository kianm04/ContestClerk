<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import FormSelect, { type FormSelectOption } from '$lib/components/FormSelect.svelte';
	import ManageDialog from '$lib/components/manage/ManageDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { AuthorWords } from '$lib/committee-papers';
	import { fieldId, labelClasses } from '$lib/form-fields';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** "Add an author", or "Add a co-submitter" with THIMUN's words. */
		words: AuthorWords;
		/** The committee's seats that may be added, by name. */
		seats: FormSelectOption[];
		/** The paper's page with this dialog closed. */
		closeHref: ResolvedPathname;
	};

	let { words, seats, closeHref }: Props = $props();

	/*
		The form answers in place, so the page behind is never reloaded and the
		live editor stays connected. The server sends the page back without
		`?add=1`, which closes the dialog over a list with the new author in it.
	*/
	const inPlace = createInPlaceForm();
</script>

<!--
	"Add an author" in the paper's people. It lives in the address
	(`?add=1`), so it opens without JavaScript too. The seat that is added
	writes the paper from now on, and is told so by a notification.
-->
<ManageDialog title={words.add} {closeHref}>
	{#if seats.length === 0}
		<p class="max-w-md text-body text-foreground">
			Every seat held by a delegate already writes this paper.
		</p>
		<div class="pt-3">
			<Button href={closeHref} variant="outline" size="lg" class="max-lg:h-11">Close</Button>
		</div>
	{:else}
		<form
			method="post"
			action="?/addAuthor"
			use:enhance={inPlace.submit}
			class="flex flex-col gap-4"
		>
			<div>
				<label for={fieldId('seat')} class={labelClasses(true)}>Seat</label>
				<FormSelect
					id={fieldId('seat')}
					name="seatId"
					value=""
					options={seats}
					placeholder="Choose a seat"
				/>
			</div>
			<div class="flex flex-wrap gap-3 pt-3">
				<Button type="submit" size="lg" class="max-lg:h-11" disabled={inPlace.isBusy}>
					{words.add}
				</Button>
				<Button href={closeHref} variant="outline" size="lg" class="max-lg:h-11">Cancel</Button>
			</div>
		</form>
	{/if}
</ManageDialog>
