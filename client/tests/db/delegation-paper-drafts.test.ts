import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addCommittee,
	addDelegation,
	addSeat,
	createConferenceOwnedByMe,
	createOpenConferenceOwnedByMe,
	giveSeatTo,
	type ConferenceFixture
} from './conference-fixtures';

// T147: the members and heads of one delegation work on the position paper
// drafts of every seat one of its members holds. `may_edit_paper_draft` is
// the rule the select, insert and update policies of `position_paper_drafts`
// ask; deleting a draft stays with the seat's own delegate, because dropping
// it is what submitting does. `delegation_papers` is the list the
// delegation's "Position papers" view draws, and answers members only.
//
// `position-paper-drafts.test.ts` keeps T145's tests for the delegate alone
// and for everybody outside a delegation.
//
// A refused insert comes back as an error naming "row-level security"; a
// refused select, update or delete comes back empty, so those tests read the
// row back with the service-role client.

/** A delegation with a head, a seated member and an unseated member, in one conference. */
type DelegationFixture = ConferenceFixture & {
	committeeId: string;
	delegationId: string;
	head: SignedInClient;
	/** Sits in France, the seat whose draft the tests work on. */
	writer: SignedInClient;
	/** Holds no seat, so they are free to leave. */
	helper: SignedInClient;
	seatId: string;
};

/** Put somebody into a delegation, the way `join_delegation` would. */
async function addMember(delegationId: string, userId: string): Promise<void> {
	const { error } = await createServiceRoleClient()
		.from('delegation_members')
		.insert({ delegation_id: delegationId, user_id: userId, role: 'member' });

	if (error) {
		throw new Error(`Could not add the fixture member: ${error.message}`);
	}
}

async function createDelegationFixture(): Promise<DelegationFixture> {
	const fixture = await createOpenConferenceOwnedByMe();
	const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
	const seatId = await addSeat(fixture.supabase, committeeId, 'France', 'FR');
	const head = await createSignedInClient('Rachel Morgan');
	const writer = await createSignedInClient('Tom Price');
	const helper = await createSignedInClient('Aisha Bello');

	const delegationId = await addDelegation(head.supabase, fixture.conferenceId, "St Aidan's");
	await addMember(delegationId, writer.userId);
	await addMember(delegationId, helper.userId);
	await giveSeatTo(fixture.supabase, seatId, writer.userId);

	return { ...fixture, committeeId, delegationId, head, writer, helper, seatId };
}

/** The writer starts the draft of their own seat. */
async function startDraft(fixture: DelegationFixture, body = 'France **supports** the treaty.') {
	const { error } = await fixture.writer.supabase
		.from('position_paper_drafts')
		.insert({ seat_id: fixture.seatId, body_markdown: body });

	if (error) {
		throw new Error(`Could not start the fixture draft: ${error.message}`);
	}
}

/** The draft as the database holds it, read past Row Level Security. */
async function storedDraft(seatId: string) {
	const { data } = await createServiceRoleClient()
		.from('position_paper_drafts')
		.select('body_markdown, revision, updated_by')
		.eq('seat_id', seatId)
		.maybeSingle();

	return data;
}

/** Read and save the draft of `seatId` as `editor`, and answer what each gave back. */
async function readAndSave(editor: SignedInClient, seatId: string, body: string) {
	const read = await editor.supabase
		.from('position_paper_drafts')
		.select('body_markdown')
		.eq('seat_id', seatId);
	const saved = await editor.supabase
		.from('position_paper_drafts')
		.update({ body_markdown: body })
		.eq('seat_id', seatId)
		.select('revision');

	return { read: read.data, saved: saved.data };
}

describe('position_paper_drafts, within a delegation', () => {
	it("lets a member read and save a fellow member's draft, as themselves", async () => {
		const fixture = await createDelegationFixture();
		await startDraft(fixture);

		const { read, saved } = await readAndSave(fixture.helper, fixture.seatId, 'Helped along');

		expect(read).toEqual([{ body_markdown: 'France **supports** the treaty.' }]);
		expect(saved).toEqual([{ revision: 2 }]);
		expect(await storedDraft(fixture.seatId)).toEqual({
			body_markdown: 'Helped along',
			revision: 2,
			updated_by: fixture.helper.userId
		});
	});

	it("lets a member start a fellow member's draft", async () => {
		const fixture = await createDelegationFixture();

		const { error } = await fixture.helper.supabase
			.from('position_paper_drafts')
			.insert({ seat_id: fixture.seatId, body_markdown: 'An outline to start from' });

		expect(error).toBeNull();
		expect((await storedDraft(fixture.seatId))?.updated_by).toBe(fixture.helper.userId);
	});

	it('lets a head without a seat read and save it', async () => {
		const fixture = await createDelegationFixture();
		await startDraft(fixture);

		const { read, saved } = await readAndSave(fixture.head, fixture.seatId, 'The head edits');

		expect(read).toHaveLength(1);
		expect(saved).toEqual([{ revision: 2 }]);
	});

	it("keeps dropping the draft to the seat's own delegate", async () => {
		const fixture = await createDelegationFixture();
		await startDraft(fixture);

		await fixture.helper.supabase
			.from('position_paper_drafts')
			.delete()
			.eq('seat_id', fixture.seatId);
		await fixture.head.supabase
			.from('position_paper_drafts')
			.delete()
			.eq('seat_id', fixture.seatId);

		expect(await storedDraft(fixture.seatId)).not.toBeNull();
	});

	it('refuses a member of another delegation of the same conference', async () => {
		const fixture = await createDelegationFixture();
		await startDraft(fixture);
		const otherHead = await createSignedInClient('Lena Vogel');
		await addDelegation(otherHead.supabase, fixture.conferenceId, 'Another school');

		const { read } = await readAndSave(otherHead, fixture.seatId, 'Not theirs');
		const { error } = await otherHead.supabase
			.from('position_paper_drafts')
			.insert({ seat_id: fixture.seatId, body_markdown: 'Not theirs either' });

		expect(read).toEqual([]);
		expect(error?.message).toContain('row-level security');
		expect((await storedDraft(fixture.seatId))?.body_markdown).toBe(
			'France **supports** the treaty.'
		);
	});

	it("refuses the delegation a member's seat at another conference", async () => {
		const fixture = await createDelegationFixture();
		const elsewhere = await createConferenceOwnedByMe();
		const elsewhereCommittee = await addCommittee(elsewhere.supabase, elsewhere.conferenceId);
		const elsewhereSeat = await addSeat(elsewhere.supabase, elsewhereCommittee, 'Chile', 'CL');
		await giveSeatTo(elsewhere.supabase, elsewhereSeat, fixture.writer.userId);
		await fixture.writer.supabase
			.from('position_paper_drafts')
			.insert({ seat_id: elsewhereSeat, body_markdown: 'For another conference' });

		const { read } = await readAndSave(fixture.helper, elsewhereSeat, 'Not this one');

		expect(read).toEqual([]);
		expect((await storedDraft(elsewhereSeat))?.body_markdown).toBe('For another conference');
	});

	it('takes the access away from a member who leaves the delegation', async () => {
		const fixture = await createDelegationFixture();
		await startDraft(fixture);

		const { error: leaveError } = await fixture.helper.supabase
			.from('delegation_members')
			.delete()
			.eq('delegation_id', fixture.delegationId)
			.eq('user_id', fixture.helper.userId);
		const { read } = await readAndSave(fixture.helper, fixture.seatId, 'After leaving');

		expect(leaveError).toBeNull();
		expect(read).toEqual([]);
		expect((await storedDraft(fixture.seatId))?.body_markdown).toBe(
			'France **supports** the treaty.'
		);
	});

	it('takes the access away when the seat changes hands to somebody outside', async () => {
		const fixture = await createDelegationFixture();
		await startDraft(fixture);
		const stranger = await createSignedInClient('Chen Wei');

		await giveSeatTo(fixture.supabase, fixture.seatId, stranger.userId);
		await stranger.supabase
			.from('position_paper_drafts')
			.insert({ seat_id: fixture.seatId, body_markdown: "The new delegate's own" });

		const { read } = await readAndSave(fixture.helper, fixture.seatId, 'Too late');
		const { error } = await fixture.head.supabase
			.from('position_paper_drafts')
			.insert({ seat_id: fixture.seatId, body_markdown: 'Nor this' });

		expect(read).toEqual([]);
		expect(error).not.toBeNull();
		expect((await storedDraft(fixture.seatId))?.body_markdown).toBe("The new delegate's own");
	});
});

describe('delegation_papers', () => {
	it('lists every seat a member holds, with its paper, draft and word count', async () => {
		const fixture = await createDelegationFixture();
		await startDraft(fixture, 'France **supports** the treaty, in 2027.');
		await readAndSave(fixture.helper, fixture.seatId, 'France **supports** the treaty — fully.');

		const { data, error } = await fixture.head.supabase.rpc('delegation_papers', {
			target_delegation_id: fixture.delegationId
		});

		expect(error).toBeNull();
		expect(data).toEqual([
			expect.objectContaining({
				seat_id: fixture.seatId,
				seat_name: 'France',
				country_code: 'FR',
				committee_id: fixture.committeeId,
				holder_id: fixture.writer.userId,
				holder_name: 'Tom Price',
				paper_kind: null,
				review_status: null,
				draft_updated_by: fixture.helper.userId,
				draft_updated_by_name: 'Aisha Bello',
				// The dash stands alone and has no letter in it, so it is not a word.
				word_count: 5
			})
		]);
	});

	it('gives the review of a submitted paper but not its text', async () => {
		const fixture = await createDelegationFixture();
		await createServiceRoleClient().from('documents').insert({
			conference_id: fixture.conferenceId,
			committee_id: fixture.committeeId,
			seat_id: fixture.seatId,
			uploaded_by: fixture.writer.userId,
			kind: 'position_paper',
			title: 'Position paper',
			body_markdown: 'Three short words',
			review_status: 'changes_requested',
			review_comment: 'Say more about finance.'
		});

		const { data } = await fixture.helper.supabase.rpc('delegation_papers', {
			target_delegation_id: fixture.delegationId
		});

		expect(data?.[0]).toMatchObject({
			paper_kind: 'written',
			review_status: 'changes_requested',
			review_comment: 'Say more about finance.',
			draft_updated_by: null,
			word_count: 3
		});
		expect(Object.keys(data?.[0] ?? {})).not.toContain('body_markdown');
	});

	it('answers nobody outside the delegation', async () => {
		const fixture = await createDelegationFixture();
		const stranger = await createSignedInClient('Tomás Rojas');

		const asStranger = await stranger.supabase.rpc('delegation_papers', {
			target_delegation_id: fixture.delegationId
		});
		const asOrganiser = await fixture.supabase.rpc('delegation_papers', {
			target_delegation_id: fixture.delegationId
		});

		expect(asStranger.data).toEqual([]);
		expect(asOrganiser.data).toEqual([]);
	});
});
