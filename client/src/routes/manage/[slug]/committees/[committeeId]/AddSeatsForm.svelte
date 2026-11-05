<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import { buttonClasses } from '$lib/button-classes';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import type { SeatListName } from '$lib/seat-lists';

	/**
	 * The three ready-made lists, in the order the buttons show them. The
	 * `source` is the word the `addSeats` action reads, and typing it as a
	 * `SeatListName` is what stops a button asking for a list the server has
	 * never heard of.
	 */
	const SEAT_LISTS: { source: SeatListName; label: string }[] = [
		{ source: 'un_members', label: 'Add UN member states' },
		{ source: 'security_council', label: 'Add Security Council' },
		{ source: 'eu_members', label: 'Add EU member states' }
	];

	/** "Paste names" opens like a button, so it looks like the buttons beside it. */
	const PASTE_TOGGLE_CLASSES = buttonClasses('secondary', 'dense-sm', false);

	/*
		Send both kinds of "add seats" form in the background and redraw the page
		without reloading it (`$lib/in-place-form.svelte.ts`); without JavaScript
		both still post and reload the page as before. A saved batch of seats
		empties the fields, the way a reload would leave them. The three
		ready-made-list buttons share one `createInPlaceForm()` because they are
		three copies of the same tiny form rather than three different ones, so
		only one of them is ever sending at a time. A name the committee already
		has is skipped, and the message after the press says how many were.
	*/
	const readyMadeForm = createInPlaceForm({ isResetAfterSave: true });
	const pastedListForm = createInPlaceForm({ isResetAfterSave: true });
</script>

<div class="flex flex-wrap items-start gap-2">
	<!--
		One tiny `<form>` per button, because each of them sends a different
		`source` to the same action and a form sends every field it holds.
		The `(list.source)` key lets Svelte reuse the three forms instead of
		rebuilding them.
	-->
	{#each SEAT_LISTS as list (list.source)}
		<form method="post" action="?/addSeats" use:enhance={readyMadeForm.submit}>
			<input type="hidden" name="source" value={list.source} />
			<Button
				label={list.label}
				variant="secondary"
				size="dense-sm"
				isLoading={readyMadeForm.isBusy}
			/>
		</form>
	{/each}

	<!--
		`<details>` is HTML's own show-and-hide: pressing its `<summary>` opens
		the box under it, with no JavaScript at all. `open:basis-full` gives the
		opened box a whole line of this row, so the names have room. `list-none`
		and the `-webkit-details-marker` rule hide the little triangle browsers
		draw before a summary, which a button does not have.
	-->
	<details class="open:basis-full">
		<summary
			class="{PASTE_TOGGLE_CLASSES} cursor-pointer list-none [&::-webkit-details-marker]:hidden"
		>
			Paste names
		</summary>

		<form
			method="post"
			action="?/addSeats"
			class="mt-3 flex flex-col gap-3"
			use:enhance={pastedListForm.submit}
		>
			<input type="hidden" name="source" value="list" />

			<TextArea
				label="Paste names"
				name="names"
				value=""
				rows={5}
				help="One name per line. A name we recognise as a country gets its flag."
				isDense
			/>

			<div>
				<Button
					label="Add seats"
					variant="secondary"
					size="dense"
					isLoading={pastedListForm.isBusy}
				/>
			</div>
		</form>
	</details>
</div>
