<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import AwardFields from '$lib/components/AwardFields.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import { proposeAwardPress } from '$lib/award-presses';
	import type { AwardFormErrors, AwardFormValues } from '$lib/award-form';
	import type { Award, AwardSeat } from '$lib/awards';
	import {
		NEW_ROW_ID_FIELD,
		newRowId,
		sharedChairForm,
		type ChairSubmitInput
	} from '$lib/chair-form';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** The committee's seats that have a delegate. Only these can be given an award. */
		seats: AwardSeat[];
		/** What the form holds: empty, the proposal being edited, or what a refusal sent back. */
		values: AwardFormValues;
		/** A message under each field the last refusal was about. */
		errors: AwardFormErrors;
		/** Where the form posts: `?/propose`, or `?edit=<id>&/update` while editing. */
		action: string;
		/** The proposal being edited, sent along as `awardId`, or null for a new one. */
		awardId: string | null;
		/** Where "Cancel" leads while editing: the page without `?edit`. */
		cancelHref: ResolvedPathname;
		/** The committee's proposals shown now, so a press can tell a duplicate before the server does. */
		existingAwards: Award[];
		committeeId: string;
		/** The signed-in chair, whom a newly proposed award is saved under. */
		readerId: string;
	};

	let {
		seats,
		values,
		errors,
		action,
		awardId,
		cancelHref,
		existingAwards,
		committeeId,
		readerId
	}: Props = $props();

	/*
		A new proposal changes the screen at once, through the chair layout's
		shared instant form (T141): `handlePropose` below works out the award
		before it is sent, and every screen lays it over the list until the
		server answers (`$lib/chair-form.ts`).

		Editing an existing proposal keeps the older kind of form instead, which
		waits for the server before changing the screen
		(`$lib/in-place-form.svelte.ts`): rewording was not part of this change.
	*/
	const chairForm = sharedChairForm();
	const editForm = createInPlaceForm({ isResetAfterSave: true });

	/**
	 * Reads the form as typed and works out what "Propose" will save. A press
	 * the server would refuse (an invalid form, or a seat that already has that
	 * award) is left as it was typed, for the chair to fix; a press expected to
	 * succeed empties the form at once, the way it came back empty after a
	 * page load before this change.
	 */
	function handlePropose(input: ChairSubmitInput) {
		const typed: AwardFormValues = {
			seatId: String(input.formData.get('seatId') ?? ''),
			kind: String(input.formData.get('kind') ?? ''),
			title: String(input.formData.get('title') ?? '')
		};
		const newAwardId = newRowId();
		const expectation = proposeAwardPress(
			typed,
			seats,
			existingAwards,
			committeeId,
			newAwardId,
			readerId
		);

		if (expectation === null) return null;

		input.formData.set(NEW_ROW_ID_FIELD, newAwardId);
		input.formElement.reset();

		return expectation;
	}
</script>

<Card>
	{#if awardId === null}
		<h2 class="font-display text-h2">Propose an award</h2>
	{:else}
		<h2 class="font-display text-h2">Edit proposal</h2>
	{/if}
	<form
		method="post"
		{action}
		class="mt-4 flex flex-col gap-4"
		use:enhance={awardId === null ? chairForm.submitExpecting(handlePropose) : editForm.submit}
	>
		{#if awardId !== null}
			<input type="hidden" name="awardId" value={awardId} />
		{/if}
		<AwardFields {seats} {values} {errors} idSuffix="proposal" />
		<div class="flex flex-wrap justify-end gap-3">
			{#if awardId === null}
				<Button label="Propose" variant="primary" />
			{:else}
				<Button label="Cancel" variant="ghost" href={cancelHref} />
				<Button label="Save proposal" variant="primary" isLoading={editForm.isBusy} />
			{/if}
		</div>
	</form>
</Card>
