<script lang="ts">
	import type { SeatGroup } from '$lib/allocation';
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import {
		DECISION_NOTE_MAX_LENGTH,
		NO_FREE_SEATS_NOTICE,
		allocateButtonLabel,
		selectedSeatsSentence
	} from '$lib/delegation-review';
	import type { DelegationStatus } from '$lib/delegations';
	import { manageAllocationUrl } from '$lib/urls';
	import SeatCommitteeFieldset from './SeatCommitteeFieldset.svelte';

	type Props = {
		/** The conference's free seats, grouped under their committee. */
		freeSeatsByCommittee: SeatGroup[];
		/** The seats ticked when the last post was refused, so they come back ticked. */
		selectedSeatIds: string[];
		/** Why the last allocation was refused, or `null`. */
		error: string | null;
		/** What the note to the head said when the last post was refused. */
		decisionNote: string;
		/** `submitted` makes this button accept the delegation as well as fill it. */
		status: DelegationStatus;
		/** For the link to the allocation grid in the empty state. */
		slug: string;
		/** Sends "Accept and allocate" through the page's instant form (`$lib/instant-form.svelte.ts`, T142). */
		onSubmit: SubmitFunction;
	};

	let {
		freeSeatsByCommittee,
		selectedSeatIds,
		error,
		decisionNote,
		status,
		slug,
		onSubmit
	}: Props = $props();

	/*
		How many boxes are ticked right now.

		It is a `$derived` that is also assigned to, which Svelte 5 allows: it
		starts at however many seats a refused post sent back ticked, the handler
		below writes to it as boxes are ticked and unticked, and it goes back to
		following the prop whenever `load` hands down a new list. Without
		JavaScript nothing ever assigns to it, the boxes are still posted, and the
		button keeps the words it was drawn with.
	*/
	let selectedCount = $derived(selectedSeatIds.length);

	/** `$derived` writes both of these again whenever the count changes. */
	const counterText = $derived(selectedSeatsSentence(selectedCount));
	const buttonLabel = $derived(allocateButtonLabel(selectedCount, status));

	function handleSeatToggle(event: Event) {
		const box = event.currentTarget as HTMLInputElement;

		selectedCount = box.checked ? selectedCount + 1 : selectedCount - 1;
	}
</script>

{#if freeSeatsByCommittee.length === 0}
	<Notice tone="warning">
		{NO_FREE_SEATS_NOTICE}
		<a href={manageAllocationUrl(slug)} class="text-link hover:underline">Allocation</a>
	</Notice>
{:else}
	<!--
		A plain form of ordinary checkboxes, so the picker works with JavaScript
		switched off. Every box is sent under the same name, `seatIds`, which is
		how the action reads them as a list. `use:enhance` hands it to the page's
		instant form, which shows the seats moving at once; without JavaScript it
		posts and reloads the page as before.
	-->
	<form method="post" action="?/allocate" class="flex flex-col gap-4" use:enhance={onSubmit}>
		{#each freeSeatsByCommittee as group (group.committeeId)}
			<SeatCommitteeFieldset {group} {selectedSeatIds} onToggle={handleSeatToggle} />
		{/each}

		<p class="text-small text-muted-foreground">{counterText}</p>

		<!--
			The note travels with the seats because a form cannot sit inside another
			form, and this is the form the Accept button submits. The reject button
			has a note box of its own for the same reason.
		-->
		<TextArea
			isDense
			label="Note to the head (optional)"
			name="decisionNote"
			value={decisionNote}
			rows={3}
			maxLength={DECISION_NOTE_MAX_LENGTH}
		/>

		{#if error}
			<Notice tone="error">{error}</Notice>
		{/if}

		<div>
			<Button label={buttonLabel} variant="primary" size="dense" />
		</div>
	</form>
{/if}
