<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import AwardFields from '$lib/components/AwardFields.svelte';
	import Button from '$lib/components/Button.svelte';
	import type { AwardFormErrors, AwardFormValues } from '$lib/award-form';
	import type { AwardSeat } from '$lib/awards';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** The committee the award is added to, sent along as `committeeId`. */
		committeeId: string;
		/** The committee's seats that have a delegate. */
		filledSeats: AwardSeat[];
		/** What the form holds: empty, or what a refused add sent back. */
		values: AwardFormValues;
		/** A message under each field the last refusal was about. */
		errors: AwardFormErrors;
		/** Where Cancel goes: the same committee with the form closed. */
		cancelHref: ResolvedPathname;
	};

	let { committeeId, filledSeats, values, errors, cancelHref }: Props = $props();

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before. A
	// saved award empties the fields, the way a reload would leave them.
	const inPlaceForm = createInPlaceForm({ isResetAfterSave: true });
</script>

<!--
	The `id` is where the heading's "Add award" link lands, so the next Tab
	reaches the first field; `scroll-mt-24` keeps the form clear of the sticky
	bar at the top of the window.
-->
<form
	id="add-award-{committeeId}"
	method="post"
	action="?/add"
	class="flex scroll-mt-24 flex-col gap-3 px-1 pt-4"
	use:enhance={inPlaceForm.submit}
>
	<h3 class="text-dense font-semibold">Add award</h3>
	<input type="hidden" name="committeeId" value={committeeId} />
	<!-- From md up the fields and the buttons share one line, to keep the page short. -->
	<div class="flex flex-col items-end gap-3 md:flex-row">
		<div class="w-full min-w-0 md:flex-1">
			<AwardFields seats={filledSeats} {values} {errors} idSuffix={committeeId} isDense />
		</div>
		<div class="flex gap-2">
			<Button label="Cancel" variant="ghost" size="dense" href={cancelHref} />
			<Button label="Add" variant="secondary" size="dense" isLoading={inPlaceForm.isBusy} />
		</div>
	</div>
</form>
