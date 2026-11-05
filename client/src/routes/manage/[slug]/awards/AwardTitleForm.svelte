<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import Button from '$lib/components/Button.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import { AWARD_TITLE_MAX_LENGTH } from '$lib/awards';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** The award being renamed, sent along as `awardId`. */
		awardId: string;
		/** The title in the box: the current one, or what a refusal sent back. */
		title: string;
		/** Why the last title was refused, or null. */
		error: string | null;
		/** Where the form posts, `?edit=<id>&/updateTitle`, so a refusal keeps it open. */
		action: string;
		/** Where "Cancel" leads: the page without `?edit`. */
		cancelHref: ResolvedPathname;
	};

	let { awardId, title, error, action, cancelHref }: Props = $props();

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	const inPlaceForm = createInPlaceForm();
</script>

<form method="post" {action} class="flex flex-col gap-3" use:enhance={inPlaceForm.submit}>
	<input type="hidden" name="awardId" value={awardId} />
	<TextField
		label="Title"
		name="title"
		idKey="title-{awardId}"
		value={title}
		maxLength={AWARD_TITLE_MAX_LENGTH}
		isRequired
		{error}
		isDense
	/>
	<div class="flex flex-wrap justify-end gap-2">
		<Button label="Cancel" variant="ghost" size="dense-sm" href={cancelHref} />
		<Button label="Save title" variant="primary" size="dense-sm" isLoading={inPlaceForm.isBusy} />
	</div>
</form>
