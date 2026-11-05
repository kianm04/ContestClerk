<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import SelectField, { type SelectOption } from '$lib/components/SelectField.svelte';
	import type { GridSeat, SeatGroup } from '$lib/allocation';

	type Props = {
		/** The seat the delegate is in now. */
		seat: GridSeat;
		/** Every seat they may be moved into, grouped by committee. */
		freeSeatsByCommittee: SeatGroup[];
		/** Where the form posts to: `?/moveDelegate` with the filters kept. */
		actionUrl: string;
		/**
		 * Back to the grid with this panel shut. `ResolvedPathname` is the type
		 * `resolve()` from `$app/paths` gives back, so only an address built by a
		 * helper in `$lib/urls.ts` can be passed in.
		 */
		cancelHref: ResolvedPathname;
		/**
		 * The page's instant form (`$lib/instant-form.svelte.ts`), handed to
		 * `use:enhance` below so the move shows on the grid at once, with no
		 * spinner, rather than waiting for the server to answer.
		 */
		onSubmit: SubmitFunction;
	};

	let { seat, freeSeatsByCommittee, actionUrl, cancelHref, onSubmit }: Props = $props();

	// `$derived` works each of these out again whenever the seat changes, which
	// is whenever `?seat=` names a different one.
	const committeeLabel = $derived(seat.committee.abbreviation ?? seat.committee.name);
	const hasSomebodyToMove = $derived(seat.userId !== null);
	const hasSomewhereToGo = $derived(freeSeatsByCommittee.length > 0);
	const title = $derived(hasSomebodyToMove ? `Move ${seat.holderName}` : 'Move a delegate');

	/*
		`SelectOption` is flat — one value and one label — so the committee travels
		in the label, "UNSC · France", rather than in an `<optgroup>` the component
		has no way to draw.
	*/
	const seatOptions: SelectOption[] = $derived(
		freeSeatsByCommittee.flatMap((group) =>
			group.seats.map((freeSeat) => ({
				value: freeSeat.id,
				label: `${group.committeeLabel} · ${freeSeat.name}`
			}))
		)
	);
</script>

<!--
	A section of the page rather than a dialog, opened by `?seat=…&action=move`,
	so that moving somebody works with JavaScript switched off. The spec asks for
	that in so many words.
-->
<Card>
	<h2 class="text-h3 text-foreground">{title}</h2>
	<p class="text-dense text-muted-foreground">{seat.name} in {committeeLabel}</p>

	{#if !hasSomebodyToMove}
		<p class="mt-3 text-dense text-muted-foreground">There is nobody in this seat to move.</p>
	{:else if !hasSomewhereToGo}
		<p class="mt-3 text-dense text-muted-foreground">There is no free seat to move them to.</p>
	{:else}
		<form method="post" action={actionUrl} class="mt-3 flex flex-col gap-3" use:enhance={onSubmit}>
			<!-- Which seat they are being moved out of. The action reads it back by name. -->
			<input type="hidden" name="seatId" value={seat.id} />

			<SelectField
				label="New seat"
				name="toSeatId"
				value=""
				options={seatOptions}
				placeholder="Pick a seat"
				isRequired
				isDense
			/>

			<div>
				<Button label="Move the delegate" variant="primary" size="dense" />
			</div>
		</form>
	{/if}

	<p class="mt-3">
		<a href={cancelHref} class="text-dense font-medium text-link hover:underline">Cancel</a>
	</p>
</Card>
