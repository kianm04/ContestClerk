import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	createVisitorClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addChair,
	addCommittee,
	addSeat,
	createConferenceOwnedByMe,
	giveSeatTo,
	type ConferenceFixture
} from './conference-fixtures';

// The Row Level Security of `position_paper_drafts` (T145), the working draft
// of a paper a delegate writes on MUNMeet. permissions.md gives the table to
// the delegate sitting in the seat and to nobody else: not another delegate,
// not the chair and not the organiser, who all see only what was submitted.
// The `stamp_position_paper_draft` trigger moves the revision on with every
// save, and `seats_clear_position_paper_draft` drops the draft when the seat
// changes hands.
//
// As in `committee-session-notes.test.ts`, a refused insert comes back as an
// error naming "row-level security", while a refused select, update or delete
// comes back empty, so those tests read the row back with a client that can.

/** A published conference with one committee, one seat, and the delegate in it. */
type SeatedDelegate = ConferenceFixture & {
	committeeId: string;
	seatId: string;
	delegate: SignedInClient;
};

async function createSeatedDelegate(): Promise<SeatedDelegate> {
	const fixture = await createConferenceOwnedByMe();
	const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
	const seatId = await addSeat(fixture.supabase, committeeId, 'France', 'FR');
	const delegate = await createSignedInClient('Ana Silva');

	await giveSeatTo(fixture.supabase, seatId, delegate.userId);
	await fixture.supabase
		.from('conferences')
		.update({ status: 'published' })
		.eq('id', fixture.conferenceId);

	return { ...fixture, committeeId, seatId, delegate };
}

/** The delegate's first save of their draft. */
async function startDraft(seated: SeatedDelegate, body = 'France **supports** the treaty.') {
	const { data, error } = await seated.delegate.supabase
		.from('position_paper_drafts')
		.insert({ seat_id: seated.seatId, body_markdown: body })
		.select('body_markdown, revision, updated_by')
		.single();

	if (error || !data) {
		throw new Error(`Could not start the fixture draft: ${error?.message}`);
	}

	return data;
}

/** The draft as the database holds it, read past Row Level Security. */
async function storedDraft(seatId: string) {
	const { data } = await createServiceRoleClient()
		.from('position_paper_drafts')
		.select('body_markdown, revision')
		.eq('seat_id', seatId)
		.maybeSingle();

	return data;
}

describe('position_paper_drafts, the delegate in the seat', () => {
	it('starts, reads and saves their draft, and each save moves the revision on', async () => {
		const seated = await createSeatedDelegate();

		const started = await startDraft(seated);
		expect(started).toEqual({
			body_markdown: 'France **supports** the treaty.',
			revision: 1,
			updated_by: seated.delegate.userId
		});

		const { data: saved } = await seated.delegate.supabase
			.from('position_paper_drafts')
			.update({ body_markdown: 'Second version', revision: 99 })
			.eq('seat_id', seated.seatId)
			.eq('revision', 1)
			.select('revision');

		// The revision is the trigger's to set, whatever the browser sent.
		expect(saved).toEqual([{ revision: 2 }]);
	});

	it('saves nothing over a revision another window already moved on from', async () => {
		const seated = await createSeatedDelegate();
		await startDraft(seated);
		await seated.delegate.supabase
			.from('position_paper_drafts')
			.update({ body_markdown: 'From the first window' })
			.eq('seat_id', seated.seatId);

		const { data } = await seated.delegate.supabase
			.from('position_paper_drafts')
			.update({ body_markdown: 'From the second window' })
			.eq('seat_id', seated.seatId)
			.eq('revision', 1)
			.select('revision');

		expect(data).toEqual([]);
		expect(await storedDraft(seated.seatId)).toEqual({
			body_markdown: 'From the first window',
			revision: 2
		});
	});

	it('may still save a draft after the deadline, since nobody reviews a draft', async () => {
		const seated = await createSeatedDelegate();
		await seated.supabase
			.from('conferences')
			.update({ position_paper_deadline: '2020-01-01T00:00:00Z' })
			.eq('id', seated.conferenceId);

		expect((await startDraft(seated)).revision).toBe(1);
	});

	it('refuses a draft over 100 000 characters', async () => {
		const seated = await createSeatedDelegate();

		const { error } = await seated.delegate.supabase
			.from('position_paper_drafts')
			.insert({ seat_id: seated.seatId, body_markdown: 'a'.repeat(100_001) });

		expect(error?.message).toContain('position_paper_drafts_body_length');
	});

	it('drops their own draft', async () => {
		const seated = await createSeatedDelegate();
		await startDraft(seated);

		await seated.delegate.supabase
			.from('position_paper_drafts')
			.delete()
			.eq('seat_id', seated.seatId);

		expect(await storedDraft(seated.seatId)).toBeNull();
	});
});

describe('position_paper_drafts, everybody else', () => {
	it('hides the draft from another delegate of the committee, and refuses them writing one', async () => {
		const seated = await createSeatedDelegate();
		await startDraft(seated);
		const neighbourSeatId = await addSeat(seated.supabase, seated.committeeId, 'Chile', 'CL');
		const neighbour = await createSignedInClient('Tomás Rojas');
		await giveSeatTo(seated.supabase, neighbourSeatId, neighbour.userId);

		const { data: read } = await neighbour.supabase
			.from('position_paper_drafts')
			.select('body_markdown')
			.eq('seat_id', seated.seatId);
		const { error: insertError } = await neighbour.supabase
			.from('position_paper_drafts')
			.insert({ seat_id: seated.seatId, body_markdown: 'Not mine' });
		await neighbour.supabase
			.from('position_paper_drafts')
			.update({ body_markdown: 'Overwritten' })
			.eq('seat_id', seated.seatId);

		expect(read).toEqual([]);
		expect(insertError?.message).toContain('row-level security');
		expect((await storedDraft(seated.seatId))?.body_markdown).toBe(
			'France **supports** the treaty.'
		);
	});

	it('hides the draft from the chair of the committee and from the organiser', async () => {
		const seated = await createSeatedDelegate();
		await startDraft(seated);
		const chair = await createSignedInClient('Chen Wei');
		await addChair(seated.supabase, seated.committeeId, chair.userId);

		const asChair = await chair.supabase
			.from('position_paper_drafts')
			.select('body_markdown')
			.eq('seat_id', seated.seatId);
		const asOrganiser = await seated.supabase
			.from('position_paper_drafts')
			.select('body_markdown')
			.eq('seat_id', seated.seatId);
		await seated.supabase.from('position_paper_drafts').delete().eq('seat_id', seated.seatId);

		expect(asChair.data).toEqual([]);
		expect(asOrganiser.data).toEqual([]);
		expect(await storedDraft(seated.seatId)).not.toBeNull();
	});

	it('gives a signed-out visitor nothing', async () => {
		const seated = await createSeatedDelegate();
		await startDraft(seated);

		const { data } = await createVisitorClient()
			.from('position_paper_drafts')
			.select('body_markdown');

		expect(data ?? []).toEqual([]);
	});
});

describe('seats_clear_position_paper_draft', () => {
	it('drops the draft when the seat changes hands, so the next delegate never reads it', async () => {
		const seated = await createSeatedDelegate();
		await startDraft(seated);
		const nextDelegate = await createSignedInClient('Lena Vogel');

		await giveSeatTo(seated.supabase, seated.seatId, nextDelegate.userId);

		expect(await storedDraft(seated.seatId)).toBeNull();
	});

	it('keeps the draft when the seat changes in some other way', async () => {
		const seated = await createSeatedDelegate();
		await startDraft(seated);

		await seated.supabase.from('seats').update({ is_available: false }).eq('id', seated.seatId);

		expect(await storedDraft(seated.seatId)).not.toBeNull();
	});
});
