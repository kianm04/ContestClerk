<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ResolvedPathname } from '$app/types';
	import Card from '$lib/components/Card.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import { ALREADY_FREE_REFUSAL, type GridSeat } from '$lib/allocation';

	type Props = {
		/** The seat the question is about. */
		seat: GridSeat;
		/** Which menu line was chosen: "Free the seat" or the visibility one. */
		action: 'free' | 'hide';
		/**
		 * Where "Free the seat" posts to.
		 *
		 * `ConfirmButton` renders a `<form method="post">` of its own and takes no
		 * extra hidden fields, so the seat id travels in this address's query
		 * string instead of in a field. `+page.server.ts` reads it back from
		 * `?seat=` when no `seatId` field arrives.
		 */
		freeActionUrl: string;
		/** The same for "Hide the seat" and "Make it available again". */
		hideActionUrl: string;
		/**
		 * Back to the grid with this panel shut. `ResolvedPathname` is the type
		 * `resolve()` from `$app/paths` gives back, so only an address built by a
		 * helper in `$lib/urls.ts` can be passed in.
		 */
		cancelHref: ResolvedPathname;
		/**
		 * The page's instant form (`$lib/instant-form.svelte.ts`). Handed straight
		 * to `ConfirmButton`'s own `onSubmit`, which closes the dialog and shows
		 * the seat changing at once, without waiting for the server.
		 */
		onSubmit: SubmitFunction;
	};

	let { seat, action, freeActionUrl, hideActionUrl, cancelHref, onSubmit }: Props = $props();

	/** The heading, which is the question the panel is asking. */
	function panelTitle(): string {
		if (action === 'free') {
			return 'Free this seat?';
		}

		if (seat.isAvailable) {
			return 'Hide this seat?';
		}

		return 'Make this seat available again?';
	}

	/** What pressing the button will do, in one sentence. */
	function panelSentence(): string {
		if (action === 'free') {
			if (seat.userId !== null) {
				return 'Whoever is in this seat loses it, and an unpaid invoice for it is cancelled.';
			}

			if (seat.delegationId !== null) {
				return 'The delegation holding this seat loses it, and an unpaid invoice for it is cancelled.';
			}

			/* A seat holding neither is already free, and the menu offers no line for
			   it. Somebody who types the address anyway is told the same thing the
			   action would tell them. */
			return ALREADY_FREE_REFUSAL;
		}

		if (seat.isAvailable) {
			return 'A hidden seat cannot be allocated and appears in no seat picker.';
		}

		return 'The seat can be allocated again and appears in the seat pickers once more.';
	}

	/** The words on the button, which say what it does rather than "OK". */
	function buttonLabel(): string {
		if (action === 'free') {
			return 'Free the seat';
		}

		return seat.isAvailable ? 'Hide the seat' : 'Make it available again';
	}

	// `$derived` works each of these out again whenever the seat or the chosen
	// action changes, which is whenever the address does.
	const committeeLabel = $derived(seat.committee.abbreviation ?? seat.committee.name);
	const title = $derived(panelTitle());
	const sentence = $derived(panelSentence());
	const label = $derived(buttonLabel());
	const formaction = $derived(action === 'free' ? freeActionUrl : hideActionUrl);

	/* Freeing a seat takes somebody out of it, so it is drawn as destructive.
	   Hiding an empty seat is not, and can be undone from the same menu. */
	const variant = $derived(action === 'free' ? 'danger' : 'secondary');
</script>

<!--
	A section of the page rather than a dialog, opened by `?seat=…&action=…`, so
	that freeing and hiding work with JavaScript switched off exactly as moving
	does. `ConfirmButton` asks once more, in a dialog when there is JavaScript and
	on the confirmation page when there is not.
-->
<Card>
	<h2 class="text-h3 text-foreground">{title}</h2>
	<p class="text-dense text-muted-foreground">{seat.name} in {committeeLabel}</p>
	<p class="mt-3 text-dense text-muted-foreground">{sentence}</p>

	<div class="mt-3 flex flex-wrap items-center gap-4">
		<ConfirmButton
			{label}
			confirmTitle={title}
			confirmText={sentence}
			{formaction}
			{variant}
			size="dense-sm"
			{onSubmit}
		/>

		<a href={cancelHref} class="text-dense font-medium text-link hover:underline">Cancel</a>
	</div>
</Card>
