<script lang="ts">
	import Users from '@lucide/svelte/icons/users';
	import Badge from '$lib/components/Badge.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { countNotesBySeat, hasSeatedDelegate, notesOfSeat } from '$lib/chair-notes';
	import {
		expectationsOf,
		rowsAfterChanges,
		sharedChairForm,
		type ChairSubmitInput
	} from '$lib/chair-form';
	import { deleteNotePress } from '$lib/note-presses';
	import { statusBadgeTone, statusLabel } from '$lib/status';
	import { chairNotesActionUrl } from '$lib/urls';
	import NoteForm from './NoteForm.svelte';
	import SeatNoteList from './SeatNoteList.svelte';
	import SeatNotesColumn from './SeatNotesColumn.svelte';
	import SessionNotesLinks from './SessionNotesLinks.svelte';
	import type { PageProps } from './$types';

	// `data` holds what the chair layout's `load` returned and what this page's
	// `load` added in `+page.server.ts`; both run again after every form sent.
	// `form` is what a refused `add` returned: the message and what was typed.
	let { data, form }: PageProps = $props();

	// The chair layout's shared instant form (T141). "Add note" and "Delete"
	// change this list at once; `shownNotes` lays their presses on top of
	// `data.notes` until the server has answered.
	const chairForm = sharedChairForm();
	const shownNotes = $derived(
		rowsAfterChanges(
			data.notes,
			expectationsOf(chairForm.presses).flatMap((expectation) => expectation.notes ?? [])
		)
	);
	const shownNoteCounts = $derived(countNotesBySeat(shownNotes));

	/** "Delete": the id travels in the row's own hidden `noteId` field. */
	function handleDelete(input: ChairSubmitInput) {
		return deleteNotePress(String(input.formData.get('noteId') ?? ''));
	}

	const submitDelete = chairForm.submitExpecting(handleDelete);

	// Only a refused `add` sends back what was typed and why it was refused.
	const refusedBody = $derived(form?.body ?? '');
	const bodyProblem = $derived(form?.problem ?? null);

	const seat = $derived(data.seats.find((each) => each.id === data.selectedSeatId) ?? null);
	const seatNotes = $derived(notesOfSeat(shownNotes, data.selectedSeatId));
	const allocatedAt = $derived(
		data.allocations.find((each) => each.seatId === data.selectedSeatId)?.allocatedAt ?? null
	);
	const attendance = $derived(seat === null ? undefined : data.attendance[seat.id]);
	const seatTitle = $derived(
		seat?.delegateName ? `${seat.name} · ${seat.delegateName}` : (seat?.name ?? '')
	);
	// Both forms post to an address that still names the seat, so a refusal
	// without JavaScript comes back on the same seat.
	const addAction = $derived(
		chairNotesActionUrl(data.conference.slug, data.committee.slug, data.selectedSeatId ?? '', 'add')
	);
	const deleteAction = $derived(
		chairNotesActionUrl(
			data.conference.slug,
			data.committee.slug,
			data.selectedSeatId ?? '',
			'delete'
		)
	);
</script>

<div class="mb-6 flex flex-col gap-6">
	<PageHeader title="Notes" subtitle="Private to chairs and organisers" />
	<SessionNotesLinks
		sessions={data.sessions}
		conferenceSlug={data.conference.slug}
		committeeSlug={data.committee.slug}
	/>
</div>

{#if !hasSeatedDelegate(data.allocations) || seat === null}
	<EmptyState
		icon={Users}
		title="No delegates seated yet."
		description="Notes become available once seats are allocated."
	/>
{:else}
	<div class="grid gap-6 md:grid-cols-[16rem_minmax(0,1fr)]">
		<SeatNotesColumn
			seats={data.seats}
			noteCounts={shownNoteCounts}
			selectedSeatId={data.selectedSeatId}
			attendance={data.attendance}
			conferenceSlug={data.conference.slug}
			committeeSlug={data.committee.slug}
		/>

		<section aria-labelledby="seat-heading" class="flex min-w-0 flex-col gap-4">
			<div class="flex flex-wrap items-center gap-3">
				{#if seat.countryCode}
					<Flag countryCode={seat.countryCode} />
				{/if}
				<h2 id="seat-heading" class="text-h3 font-semibold">{seatTitle}</h2>
				{#if attendance}
					<Badge
						tone={statusBadgeTone('attendance_status', attendance)}
						label={statusLabel('attendance_status', attendance)}
					/>
				{/if}
			</div>

			<NoteForm
				seatId={seat.id}
				action={addAction}
				body={refusedBody}
				error={bodyProblem}
				hasAutofocus={data.hasJustAdded || bodyProblem !== null}
				readerId={data.readerId}
			/>

			<SeatNoteList
				notes={seatNotes}
				seatName={seat.name}
				canManage={data.canManage}
				readerId={data.readerId}
				timeZone={data.conference.timezone}
				seatAllocatedAt={allocatedAt}
				{deleteAction}
				onSubmit={submitDelete}
			/>
		</section>
	</div>
{/if}
