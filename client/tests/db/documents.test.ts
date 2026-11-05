import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	createVisitorClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addApplication,
	addChair,
	addCommittee,
	addSeat,
	addStaff,
	createConferenceOwnedByMe,
	createOpenConferenceOwnedByMe,
	giveSeatTo,
	type ConferenceFixture
} from './conference-fixtures';

// The `documents` row of the policy matrix in specs/02-architecture/permissions.md,
// the "`documents` select rule" table below it, and everything else task T34
// hangs on that table: the checks the table carries itself, the
// `protect_documents_columns` guard, the `notify_document_reviewed` trigger,
// and the three ways a position paper follows or stops following a delegate
// (`move_delegate`, `revoke_seat` and the `seats_clear_position_paper` trigger).
// specs/06-features/documents.md has the rules in words.
//
// Nothing here uploads anything. The bytes in the `documents` bucket are the
// storage half of T34 and have a file of their own; from this table's point of
// view `storage_path` is a unique piece of text, so every row below gets a path
// of the right shape with a fresh uuid in it and no file behind it.

// A day in milliseconds. The position paper deadline is only ever set to
// "yesterday" here, because the one thing these tests ask of it is which side
// of `now()` it falls on.
const ONE_DAY_IN_MILLISECONDS = 86_400_000;

// A file size comfortably inside what the table allows. The number itself is
// never the point except in the two size tests, which say what they mean.
const FIXTURE_FILE_SIZE_BYTES = 120_000;

// The limit the `documents_file_size_within_limit` check carries, in bytes,
// which is 20 MB and the same number the storage bucket holds.
const TWENTY_MB_IN_BYTES = 20_971_520;

/**
 * A path in the `documents` bucket for a position paper, in the shape
 * specs/02-architecture/storage.md asks for. The uuid on the end is what keeps
 * two rows from colliding on the unique `storage_path` column.
 */
function positionPaperPath(conferenceId: string, seatId: string): string {
	return `${conferenceId}/position-papers/${seatId}-${crypto.randomUUID()}.pdf`;
}

/** The same, for the one background guide a committee has. */
function backgroundGuidePath(conferenceId: string, committeeId: string): string {
	return `${conferenceId}/background-guides/${committeeId}-${crypto.randomUUID()}.pdf`;
}

/** The same, for a conference-level resource, which belongs to nothing smaller. */
function resourcePath(conferenceId: string): string {
	return `${conferenceId}/resources/${crypto.randomUUID()}.pdf`;
}

/**
 * The row a delegate writes when they upload the position paper for their seat.
 * `review_status` starts at `'submitted'`, which is what
 * specs/02-architecture/data-model.md says a freshly uploaded paper is.
 */
function positionPaperRow(
	uploadedBy: string,
	conferenceId: string,
	committeeId: string,
	seatId: string
) {
	return {
		conference_id: conferenceId,
		committee_id: committeeId,
		seat_id: seatId,
		uploaded_by: uploadedBy,
		kind: 'position_paper',
		title: 'Position paper',
		storage_path: positionPaperPath(conferenceId, seatId),
		file_name: 'position-paper.pdf',
		file_size_bytes: FIXTURE_FILE_SIZE_BYTES,
		mime_type: 'application/pdf',
		review_status: 'submitted'
	};
}

/** The row a chair or an organiser writes for a committee's background guide. */
function backgroundGuideRow(
	uploadedBy: string,
	conferenceId: string,
	committeeId: string,
	audience = 'everyone'
) {
	return {
		conference_id: conferenceId,
		committee_id: committeeId,
		uploaded_by: uploadedBy,
		kind: 'background_guide',
		title: 'Background guide',
		storage_path: backgroundGuidePath(conferenceId, committeeId),
		file_name: 'background-guide.pdf',
		file_size_bytes: FIXTURE_FILE_SIZE_BYTES,
		mime_type: 'application/pdf',
		audience
	};
}

/** The row an organiser writes for a conference-level resource. */
function resourceRow(uploadedBy: string, conferenceId: string, audience = 'delegates') {
	return {
		conference_id: conferenceId,
		uploaded_by: uploadedBy,
		kind: 'resource',
		title: 'Rules of procedure',
		storage_path: resourcePath(conferenceId),
		file_name: 'rules-of-procedure.pdf',
		file_size_bytes: FIXTURE_FILE_SIZE_BYTES,
		mime_type: 'application/pdf',
		audience
	};
}

/**
 * The columns a delegate writes when they upload a new file over their old one.
 * specs/06-features/documents.md: the paper goes back to `'submitted'`, and
 * what the chair wrote about the version before it is cleared with it.
 */
function replacementPaperColumns(conferenceId: string, seatId: string) {
	return {
		storage_path: positionPaperPath(conferenceId, seatId),
		file_name: 'position-paper-v2.pdf',
		review_status: 'submitted',
		review_comment: null,
		reviewed_by: null,
		reviewed_at: null
	};
}

/** A conference with one committee, one seat, and the delegate sitting in it. */
type SeatedDelegate = ConferenceFixture & {
	committeeId: string;
	seatId: string;
	delegate: SignedInClient;
};

/**
 * Builds that fixture. The seat is filled through the organiser's own client,
 * which is what `giveSeatTo` does, so the `seats` update policy has to allow
 * it.
 *
 * The conference is published because `check_document_scope` runs as whoever
 * is writing the row rather than as the database owner. A delegate writing a
 * paper therefore has to be able to read the committee it names, and the
 * `committees` select policies only offer that to the staff of a conference or
 * to anybody at all once it is published.
 */
async function createSeatedDelegate(): Promise<SeatedDelegate> {
	const fixture = await createConferenceOwnedByMe();
	const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
	const seatId = await addSeat(fixture.supabase, committeeId, 'France', 'FR');
	const delegate = await createSignedInClient('Ana Silva');

	await giveSeatTo(fixture.supabase, seatId, delegate.userId);

	const { error } = await fixture.supabase
		.from('conferences')
		.update({ status: 'published' })
		.eq('id', fixture.conferenceId);

	if (error) {
		throw new Error(`Could not publish the fixture conference: ${error.message}`);
	}

	return { ...fixture, committeeId, seatId, delegate };
}

/** Uploads the delegate's own position paper, through their own client. */
async function uploadPositionPaper(seated: SeatedDelegate): Promise<string> {
	const { data, error } = await seated.delegate.supabase
		.from('documents')
		.insert(
			positionPaperRow(
				seated.delegate.userId,
				seated.conferenceId,
				seated.committeeId,
				seated.seatId
			)
		)
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not upload the fixture position paper: ${error?.message}`);
	}

	return data.id;
}

/** Signs up a new person and makes them a chair of the fixture's committee. */
async function createChairOfCommittee(seated: SeatedDelegate): Promise<SignedInClient> {
	const chair = await createSignedInClient('Chen Wei');

	await addChair(seated.supabase, seated.committeeId, chair.userId);

	return chair;
}

/** The review a chair writes when the paper is good enough. */
async function approvePaper(chair: SignedInClient, documentId: string): Promise<void> {
	const { error } = await chair.supabase
		.from('documents')
		.update({
			review_status: 'approved',
			review_comment: 'Clear and well sourced.',
			reviewed_by: chair.userId,
			reviewed_at: new Date().toISOString()
		})
		.eq('id', documentId);

	if (error) {
		throw new Error(`Could not approve the fixture paper: ${error.message}`);
	}
}

/** The review a chair writes when they want the paper done again. */
async function requestChangesToPaper(chair: SignedInClient, documentId: string): Promise<void> {
	const { error } = await chair.supabase
		.from('documents')
		.update({
			review_status: 'changes_requested',
			review_comment: 'Please add your sources.',
			reviewed_by: chair.userId,
			reviewed_at: new Date().toISOString()
		})
		.eq('id', documentId);

	if (error) {
		throw new Error(`Could not send the fixture paper back: ${error.message}`);
	}
}

/**
 * Moves the conference's position paper deadline to yesterday, through the
 * organiser's own client. A null deadline means "no deadline", so a test about
 * a closed one has to put a real moment in the past there.
 */
async function closePositionPaperDeadline(fixture: ConferenceFixture): Promise<void> {
	const yesterday = new Date(Date.now() - ONE_DAY_IN_MILLISECONDS).toISOString();

	const { error } = await fixture.supabase
		.from('conferences')
		.update({ position_paper_deadline: yesterday })
		.eq('id', fixture.conferenceId);

	if (error) {
		throw new Error(`Could not close the fixture deadline: ${error.message}`);
	}
}

/**
 * Somebody who counts as a participant of the conference. `is_conference_participant`
 * is true of anybody whose application was sent and is not withdrawn or
 * rejected, which is the way into a conference that does not need a seat. It is
 * not `is_conference_admitted`: an application under review does not make
 * somebody a delegate.
 */
async function addParticipant(conferenceId: string, committeeId: string): Promise<SignedInClient> {
	const participant = await createSignedInClient('Beatriz Costa');

	await addApplication(participant.supabase, conferenceId, {
		committeePreferences: [committeeId]
	});

	return participant;
}

describe('documents, reading a position paper', () => {
	it("lets the seat's delegate, a chair of the committee and an organiser read it", async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);
		const documentId = await uploadPositionPaper(seated);

		const { data: byDelegate } = await seated.delegate.supabase
			.from('documents')
			.select('title')
			.eq('id', documentId);
		const { data: byChair } = await chair.supabase
			.from('documents')
			.select('title')
			.eq('id', documentId);
		const { data: byOrganiser } = await seated.supabase
			.from('documents')
			.select('title')
			.eq('id', documentId);

		expect(byDelegate).toEqual([{ title: 'Position paper' }]);
		expect(byChair).toEqual([{ title: 'Position paper' }]);
		expect(byOrganiser).toEqual([{ title: 'Position paper' }]);
	});

	it('hides it from another delegate sitting in the same committee', async () => {
		const seated = await createSeatedDelegate();
		const otherSeatId = await addSeat(seated.supabase, seated.committeeId, 'Japan', 'JP');
		const otherDelegate = await createSignedInClient('Luca Rossi');
		await giveSeatTo(seated.supabase, otherSeatId, otherDelegate.userId);

		const documentId = await uploadPositionPaper(seated);

		const { data } = await otherDelegate.supabase
			.from('documents')
			.select('title')
			.eq('id', documentId);

		expect(data).toEqual([]);
	});

	it('hides it from a chair of another committee of the same conference', async () => {
		const seated = await createSeatedDelegate();
		const otherCommitteeId = await addCommittee(
			seated.supabase,
			seated.conferenceId,
			'General Assembly'
		);
		const otherChair = await createSignedInClient('Mateo Diaz');
		await addChair(seated.supabase, otherCommitteeId, otherChair.userId);

		const documentId = await uploadPositionPaper(seated);

		// The chair's papers page (`05-pages/chair/papers.md`) lists the papers of
		// one committee, and its criterion is that a chair of another committee
		// cannot fetch them, however the request is made.
		const { data } = await otherChair.supabase
			.from('documents')
			.select('title')
			.eq('id', documentId);

		expect(data).toEqual([]);
	});
});

describe('documents, reading a file marked for everyone', () => {
	it('lets a visitor read a background guide of a published conference', async () => {
		const fixture = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);

		await fixture.supabase
			.from('documents')
			.insert(backgroundGuideRow(fixture.userId, fixture.conferenceId, committeeId));
		await fixture.supabase
			.from('conferences')
			.update({ status: 'published' })
			.eq('id', fixture.conferenceId);

		const visitor = createVisitorClient();
		const { data, error } = await visitor
			.from('documents')
			.select('title')
			.eq('conference_id', fixture.conferenceId);

		expect(error).toBeNull();
		expect(data).toEqual([{ title: 'Background guide' }]);
	});

	it('hides the same guide on a draft conference, while its own staff still read it', async () => {
		const fixture = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const volunteer = await createSignedInClient('Sofia Marino');
		await addStaff(fixture.supabase, fixture.conferenceId, volunteer.userId);

		await fixture.supabase
			.from('documents')
			.insert(backgroundGuideRow(fixture.userId, fixture.conferenceId, committeeId));

		const visitor = createVisitorClient();
		const { data: toVisitor } = await visitor
			.from('documents')
			.select('title')
			.eq('conference_id', fixture.conferenceId);

		expect(toVisitor).toEqual([]);

		const { data: toVolunteer } = await volunteer.supabase
			.from('documents')
			.select('title')
			.eq('conference_id', fixture.conferenceId);

		expect(toVolunteer).toEqual([{ title: 'Background guide' }]);
	});
});

describe("documents, a chair reading their own committee's background guide", () => {
	it('shows it to them whichever audience they chose for it', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);

		await chair.supabase
			.from('documents')
			.insert(
				backgroundGuideRow(chair.userId, seated.conferenceId, seated.committeeId, 'delegates')
			);

		// Without a policy of its own this would be hidden from the person who
		// wrote it: the `delegates` line of the select rule asks
		// `is_conference_participant`, and a chair is staff rather than somebody
		// taking part.
		const { data } = await chair.supabase
			.from('documents')
			.select('title')
			.eq('committee_id', seated.committeeId);

		expect(data).toEqual([{ title: 'Background guide' }]);
	});

	it('hides it from a chair of another committee of the same conference', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);
		const otherCommitteeId = await addCommittee(
			seated.supabase,
			seated.conferenceId,
			'General Assembly'
		);
		const otherChair = await createSignedInClient('Mateo Diaz');
		await addChair(seated.supabase, otherCommitteeId, otherChair.userId);

		await chair.supabase
			.from('documents')
			.insert(
				backgroundGuideRow(chair.userId, seated.conferenceId, seated.committeeId, 'delegates')
			);

		const { data } = await otherChair.supabase
			.from('documents')
			.select('title')
			.eq('committee_id', seated.committeeId);

		expect(data).toEqual([]);
	});
});

describe('documents_kind_is_not_a_committee_paper', () => {
	it('refuses a working paper or a draft resolution, which are committee papers now', async () => {
		const seated = await createSeatedDelegate();
		const serviceRole = createServiceRoleClient();

		// Through the service role, past every policy: no insert policy ever
		// allowed these two kinds, so the check is what keeps a row from using
		// them now that committee_papers holds what a committee writes.
		for (const kind of ['working_paper', 'draft_resolution'] as const) {
			const { error } = await serviceRole.from('documents').insert({
				conference_id: seated.conferenceId,
				committee_id: seated.committeeId,
				uploaded_by: seated.delegate.userId,
				kind,
				title: 'Working paper 1.1',
				storage_path: resourcePath(seated.conferenceId),
				file_name: 'working-paper.pdf',
				file_size_bytes: FIXTURE_FILE_SIZE_BYTES,
				mime_type: 'application/pdf'
			});

			expect(error?.message).toContain('documents_kind_is_not_a_committee_paper');
		}
	});
});

describe('documents_background_guide_has_committee', () => {
	it('refuses a background guide that names no committee', async () => {
		const fixture = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);

		// Through the service role, past the insert policy: that policy already
		// refuses a guide without a committee, because it asks `manage_committees`
		// of the committee the guide names. The constraint is what is left when
		// no policy is asked.
		const { error } = await createServiceRoleClient()
			.from('documents')
			.insert({
				...backgroundGuideRow(fixture.userId, fixture.conferenceId, committeeId),
				committee_id: null
			});

		expect(error?.message).toContain('documents_background_guide_has_committee');
	});
});

describe('documents_review_is_for_papers', () => {
	it('refuses a review on a resource, which nobody reviews', async () => {
		const fixture = await createConferenceOwnedByMe();

		// `submitted` rather than `approved`, because guard_document_insert runs
		// first -- a trigger fires before the table's own checks -- and would
		// refuse an approval before this constraint ever saw the row. `submitted`
		// is the one review status an upload may carry, so it reaches the check,
		// which is the rule being tested here: a resource has no review at all.
		const { error } = await fixture.supabase.from('documents').insert({
			...resourceRow(fixture.userId, fixture.conferenceId),
			review_status: 'submitted'
		});

		expect(error?.message).toContain('documents_review_is_for_papers');
	});
});

describe('documents, reading a file marked for the delegates', () => {
	it('lets an accepted applicant read it, and not one still under review', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const participant = await addParticipant(fixture.conferenceId, committeeId);

		await fixture.supabase
			.from('documents')
			.insert(resourceRow(fixture.userId, fixture.conferenceId, 'delegates'));

		// "For the delegates" means the people who are coming, which since
		// migration 20261022140000 (security review M5) is `is_conference_admitted`:
		// a seat, an accepted application or an accepted delegation. An
		// application under review is inside the conference, not yet admitted.
		const { data: underReview } = await participant.supabase
			.from('documents')
			.select('title')
			.eq('conference_id', fixture.conferenceId);

		expect(underReview).toEqual([]);

		// Accepting is accept_application's, as the database's owner; the seat it
		// hands out with it is beside the point here, so the row is marked the
		// same way.
		await createServiceRoleClient()
			.from('applications')
			.update({ status: 'accepted' })
			.eq('user_id', participant.userId)
			.eq('conference_id', fixture.conferenceId);

		const { data } = await participant.supabase
			.from('documents')
			.select('title')
			.eq('conference_id', fixture.conferenceId);

		expect(data).toEqual([{ title: 'Rules of procedure' }]);
	});

	it('hides it from a signed-in stranger', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const stranger = await createSignedInClient();

		await fixture.supabase
			.from('documents')
			.insert(resourceRow(fixture.userId, fixture.conferenceId, 'delegates'));

		const { data } = await stranger.supabase
			.from('documents')
			.select('title')
			.eq('conference_id', fixture.conferenceId);

		expect(data).toEqual([]);
	});
});

describe('documents, reading a file marked for the staff', () => {
	it('lets a volunteer on the team read it', async () => {
		const fixture = await createConferenceOwnedByMe();
		const volunteer = await createSignedInClient('Sofia Marino');
		await addStaff(fixture.supabase, fixture.conferenceId, volunteer.userId);

		await fixture.supabase
			.from('documents')
			.insert(resourceRow(fixture.userId, fixture.conferenceId, 'staff'));

		const { data } = await volunteer.supabase
			.from('documents')
			.select('title')
			.eq('conference_id', fixture.conferenceId);

		expect(data).toEqual([{ title: 'Rules of procedure' }]);
	});

	it('hides it from a participant, who is in the conference but not on the team', async () => {
		const fixture = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const participant = await addParticipant(fixture.conferenceId, committeeId);

		await fixture.supabase
			.from('documents')
			.insert(resourceRow(fixture.userId, fixture.conferenceId, 'staff'));

		const { data } = await participant.supabase
			.from('documents')
			.select('title')
			.eq('conference_id', fixture.conferenceId);

		expect(data).toEqual([]);
	});
});

describe('documents, uploading a position paper', () => {
	it('lets the delegate in a seat upload the paper for it', async () => {
		const seated = await createSeatedDelegate();

		// `.select()` after an insert is the "insert ... returning" a page uses to
		// get the new row. It only works if a select policy passes for that row.
		const { data, error } = await seated.delegate.supabase
			.from('documents')
			.insert(
				positionPaperRow(
					seated.delegate.userId,
					seated.conferenceId,
					seated.committeeId,
					seated.seatId
				)
			)
			.select('kind, review_status');

		expect(error).toBeNull();
		expect(data).toEqual([{ kind: 'position_paper', review_status: 'submitted' }]);
	});

	it('refuses a paper from somebody who holds no seat at all', async () => {
		const seated = await createSeatedDelegate();
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase
			.from('documents')
			.insert(
				positionPaperRow(stranger.userId, seated.conferenceId, seated.committeeId, seated.seatId)
			);

		expect(error).not.toBeNull();
	});

	it("refuses a delegate uploading for somebody else's seat", async () => {
		const seated = await createSeatedDelegate();
		const otherSeatId = await addSeat(seated.supabase, seated.committeeId, 'Japan', 'JP');
		const otherDelegate = await createSignedInClient('Luca Rossi');
		await giveSeatTo(seated.supabase, otherSeatId, otherDelegate.userId);

		const { error } = await otherDelegate.supabase
			.from('documents')
			.insert(
				positionPaperRow(
					otherDelegate.userId,
					seated.conferenceId,
					seated.committeeId,
					seated.seatId
				)
			);

		expect(error).not.toBeNull();
	});

	it('refuses a first upload once the deadline has passed', async () => {
		const seated = await createSeatedDelegate();
		await closePositionPaperDeadline(seated);

		const { error } = await seated.delegate.supabase
			.from('documents')
			.insert(
				positionPaperRow(
					seated.delegate.userId,
					seated.conferenceId,
					seated.committeeId,
					seated.seatId
				)
			);

		expect(error).not.toBeNull();
	});

	it('refuses a row that says somebody else uploaded it', async () => {
		const seated = await createSeatedDelegate();

		const { error } = await seated.delegate.supabase
			.from('documents')
			.insert(
				positionPaperRow(seated.userId, seated.conferenceId, seated.committeeId, seated.seatId)
			);

		expect(error).not.toBeNull();
	});
});

describe('documents, uploading a background guide', () => {
	it('lets a chair upload the guide for their own committee', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);

		const { data, error } = await chair.supabase
			.from('documents')
			.insert(backgroundGuideRow(chair.userId, seated.conferenceId, seated.committeeId))
			.select('kind, audience');

		expect(error).toBeNull();
		expect(data).toEqual([{ kind: 'background_guide', audience: 'everyone' }]);
	});

	it('refuses a guide from a delegate of that committee', async () => {
		const seated = await createSeatedDelegate();

		const { error } = await seated.delegate.supabase
			.from('documents')
			.insert(backgroundGuideRow(seated.delegate.userId, seated.conferenceId, seated.committeeId));

		expect(error).not.toBeNull();
	});
});

describe('documents, uploading a resource', () => {
	it('lets an organiser upload a resource for their conference', async () => {
		const fixture = await createConferenceOwnedByMe();

		const { data, error } = await fixture.supabase
			.from('documents')
			.insert(resourceRow(fixture.userId, fixture.conferenceId))
			.select('kind, title');

		expect(error).toBeNull();
		expect(data).toEqual([{ kind: 'resource', title: 'Rules of procedure' }]);
	});

	it('refuses a conference-level resource from a chair', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);

		// A chair runs one committee. A resource belongs to the whole conference,
		// which is the organisers' to fill.
		const { error } = await chair.supabase
			.from('documents')
			.insert(resourceRow(chair.userId, seated.conferenceId));

		expect(error).not.toBeNull();
	});
});

describe('documents_position_paper_has_seat', () => {
	it('refuses a position paper that names no seat', async () => {
		const seated = await createSeatedDelegate();

		// Only a delegate may write a position paper at all, and their insert
		// policy asks for the seat the row names, so a row with no seat on it is
		// turned away by Row Level Security before the check constraint is
		// reached. The row is refused either way, which is what this asks; which
		// of the two says no first is Postgres's business.
		const { error } = await seated.delegate.supabase.from('documents').insert({
			...positionPaperRow(
				seated.delegate.userId,
				seated.conferenceId,
				seated.committeeId,
				seated.seatId
			),
			seat_id: null
		});

		expect(error).not.toBeNull();
	});
});

describe('documents_position_paper_is_pdf', () => {
	it('refuses a position paper that is not a PDF', async () => {
		const seated = await createSeatedDelegate();

		const { error } = await seated.delegate.supabase.from('documents').insert({
			...positionPaperRow(
				seated.delegate.userId,
				seated.conferenceId,
				seated.committeeId,
				seated.seatId
			),
			file_name: 'position-paper.png',
			mime_type: 'image/png'
		});

		expect(error?.message).toContain('documents_position_paper_is_pdf');
	});
});

describe('documents_file_size_within_limit', () => {
	it('refuses a file one byte over 20 MB', async () => {
		const seated = await createSeatedDelegate();

		const { error } = await seated.delegate.supabase.from('documents').insert({
			...positionPaperRow(
				seated.delegate.userId,
				seated.conferenceId,
				seated.committeeId,
				seated.seatId
			),
			file_size_bytes: TWENTY_MB_IN_BYTES + 1
		});

		expect(error?.message).toContain('documents_file_size_within_limit');
	});

	it('accepts a file of exactly 20 MB', async () => {
		const seated = await createSeatedDelegate();

		const { data, error } = await seated.delegate.supabase
			.from('documents')
			.insert({
				...positionPaperRow(
					seated.delegate.userId,
					seated.conferenceId,
					seated.committeeId,
					seated.seatId
				),
				file_size_bytes: TWENTY_MB_IN_BYTES
			})
			.select('file_size_bytes');

		expect(error).toBeNull();
		expect(data).toEqual([{ file_size_bytes: TWENTY_MB_IN_BYTES }]);
	});
});

describe('documents_audience_is_answerable', () => {
	it("refuses a resource addressed to 'committee'", async () => {
		const fixture = await createConferenceOwnedByMe();

		// The select rule in specs/02-architecture/permissions.md answers for
		// three audiences. A row with a fourth on it would be a row no policy can
		// decide, so it is refused on the way in rather than becoming invisible.
		const { error } = await fixture.supabase
			.from('documents')
			.insert(resourceRow(fixture.userId, fixture.conferenceId, 'committee'));

		expect(error?.message).toContain('documents_audience_is_answerable');
	});

	it("accepts a resource addressed to 'staff'", async () => {
		const fixture = await createConferenceOwnedByMe();

		const { data, error } = await fixture.supabase
			.from('documents')
			.insert(resourceRow(fixture.userId, fixture.conferenceId, 'staff'))
			.select('audience');

		expect(error).toBeNull();
		expect(data).toEqual([{ audience: 'staff' }]);
	});
});

describe('documents_one_paper_per_seat', () => {
	it('refuses a second position paper for the same seat', async () => {
		const seated = await createSeatedDelegate();
		await uploadPositionPaper(seated);

		// Uploading again replaces the row rather than adding a second one, which
		// is what makes "the paper" something a page can talk about.
		const { error } = await seated.delegate.supabase
			.from('documents')
			.insert(
				positionPaperRow(
					seated.delegate.userId,
					seated.conferenceId,
					seated.committeeId,
					seated.seatId
				)
			);

		expect(error?.message).toContain('documents_one_paper_per_seat');
	});
});

describe('documents_one_guide_per_committee', () => {
	it('refuses a second background guide for the same committee', async () => {
		const fixture = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);

		await fixture.supabase
			.from('documents')
			.insert(backgroundGuideRow(fixture.userId, fixture.conferenceId, committeeId));

		const { error } = await fixture.supabase
			.from('documents')
			.insert(backgroundGuideRow(fixture.userId, fixture.conferenceId, committeeId));

		expect(error?.message).toContain('documents_one_guide_per_committee');
	});
});

describe('guard_document_insert', () => {
	it('lets a delegate upload their own paper with none of the review on it', async () => {
		const seated = await createSeatedDelegate();

		const { data, error } = await seated.delegate.supabase
			.from('documents')
			.insert(
				positionPaperRow(
					seated.delegate.userId,
					seated.conferenceId,
					seated.committeeId,
					seated.seatId
				)
			)
			.select('review_status, review_comment, reviewed_by, reviewed_at');

		// `submitted` is the one review status an upload may carry, because it is
		// what a paper arriving means.
		expect(error).toBeNull();
		expect(data).toEqual([
			{
				review_status: 'submitted',
				review_comment: null,
				reviewed_by: null,
				reviewed_at: null
			}
		]);
	});

	it("refuses a paper uploaded already approved in the chair's name", async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);

		// The update guard below refuses this, so without an insert guard the way
		// round it is to write the review on the way in: the delegate's insert
		// policy asks about the kind, the owner, the seat and the deadline, and
		// nothing at all about the four review columns. The chair's own paper list
		// reads `review_status` and would have counted this one as done.
		const { error } = await seated.delegate.supabase.from('documents').insert({
			...positionPaperRow(
				seated.delegate.userId,
				seated.conferenceId,
				seated.committeeId,
				seated.seatId
			),
			review_status: 'approved',
			review_comment: 'Excellent, no changes needed.',
			reviewed_by: chair.userId,
			reviewed_at: new Date().toISOString()
		});

		expect(error?.message).toContain('A document cannot be uploaded already reviewed');

		// Nothing was written, so the seat still has no paper at all.
		const { data: papers } = await seated.supabase
			.from('documents')
			.select('id')
			.eq('seat_id', seated.seatId);

		expect(papers).toEqual([]);
	});

	it('refuses a paper uploaded with a review comment on it', async () => {
		const seated = await createSeatedDelegate();

		// The comment on its own is enough: it is the sentence the chair page
		// shows the delegate, so a paper could arrive quoting praise nobody wrote.
		const { error } = await seated.delegate.supabase.from('documents').insert({
			...positionPaperRow(
				seated.delegate.userId,
				seated.conferenceId,
				seated.committeeId,
				seated.seatId
			),
			review_comment: 'My chair said this was excellent.'
		});

		expect(error?.message).toContain('A document cannot be uploaded already reviewed');
	});
});

describe('protect_documents_columns', () => {
	it('lets a chair approve a paper with a comment', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);
		const documentId = await uploadPositionPaper(seated);

		const { data, error } = await chair.supabase
			.from('documents')
			.update({
				review_status: 'approved',
				review_comment: 'Clear and well sourced.',
				reviewed_by: chair.userId,
				reviewed_at: new Date().toISOString()
			})
			.eq('id', documentId)
			.select('review_status, review_comment');

		expect(error).toBeNull();
		expect(data).toEqual([
			{ review_status: 'approved', review_comment: 'Clear and well sourced.' }
		]);
	});

	it('lets the delegate replace their own paper and put it back in the queue', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);
		const documentId = await uploadPositionPaper(seated);
		await requestChangesToPaper(chair, documentId);

		const { data, error } = await seated.delegate.supabase
			.from('documents')
			.update(replacementPaperColumns(seated.conferenceId, seated.seatId))
			.eq('id', documentId)
			.select('file_name, review_status, review_comment, reviewed_by, reviewed_at');

		expect(error).toBeNull();
		expect(data).toEqual([
			{
				file_name: 'position-paper-v2.pdf',
				review_status: 'submitted',
				review_comment: null,
				reviewed_by: null,
				reviewed_at: null
			}
		]);
	});

	it('refuses a delegate approving their own paper', async () => {
		const seated = await createSeatedDelegate();
		const documentId = await uploadPositionPaper(seated);

		const { error } = await seated.delegate.supabase
			.from('documents')
			.update({ review_status: 'approved' })
			.eq('id', documentId);

		expect(error?.message).toContain('Only a chair of this committee can review a position paper');
	});

	it('refuses a delegate writing a review comment on their own paper', async () => {
		const seated = await createSeatedDelegate();
		const documentId = await uploadPositionPaper(seated);

		const { error } = await seated.delegate.supabase
			.from('documents')
			.update({ review_comment: 'My chair said this was excellent.' })
			.eq('id', documentId);

		expect(error?.message).toContain('Only a chair of this committee can review a position paper');
	});

	it('refuses moving a paper to another seat, even for the organiser', async () => {
		const seated = await createSeatedDelegate();
		const otherSeatId = await addSeat(seated.supabase, seated.committeeId, 'Japan', 'JP');
		const documentId = await uploadPositionPaper(seated);

		// `move_delegate` is what really moves a paper between seats, and it runs
		// as the database owner rather than as `authenticated`, so this guard
		// never sees it.
		const { error } = await seated.supabase
			.from('documents')
			.update({ seat_id: otherSeatId })
			.eq('id', documentId);

		expect(error?.message).toContain('or moved to another conference, committee, seat or owner');
	});

	it("refuses a chair changing more of a delegate's paper than the review", async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);
		const documentId = await uploadPositionPaper(seated);

		// The guard used to return early for a chair, so the four review columns
		// were not the limit of what they could write, and a reviewer could
		// retitle or replace a delegate's paper. Since 20261022142000 (security
		// review L51) a reviewer who did not upload the paper writes its review
		// and nothing else of it; security-room-documents-guards.test.ts has the
		// rest of that rule.
		const { error } = await chair.supabase
			.from('documents')
			.update({ title: 'Position paper (France)' })
			.eq('id', documentId);

		expect(error?.message).toContain('nothing else of it');

		const { data: unchanged } = await seated.supabase
			.from('documents')
			.select('title')
			.eq('id', documentId);

		expect(unchanged).toEqual([{ title: 'Position paper' }]);
	});

	it('refuses changing who uploaded a paper, even for its chair', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);
		const documentId = await uploadPositionPaper(seated);

		const { error } = await chair.supabase
			.from('documents')
			.update({ uploaded_by: chair.userId })
			.eq('id', documentId);

		expect(error?.message).toContain('or moved to another conference, committee, seat or owner');
	});
});

describe('documents, changing a background guide or a resource', () => {
	it('lets the chair who uploaded a guide retitle it, and an organiser too', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);

		const { data: guide } = await chair.supabase
			.from('documents')
			.insert(backgroundGuideRow(chair.userId, seated.conferenceId, seated.committeeId))
			.select('id')
			.single();

		const { data: byChair, error: chairError } = await chair.supabase
			.from('documents')
			.update({ title: 'Background guide, second edition' })
			.eq('id', guide?.id)
			.select('title');

		expect(chairError).toBeNull();
		expect(byChair).toEqual([{ title: 'Background guide, second edition' }]);

		const { data: byOrganiser, error: organiserError } = await seated.supabase
			.from('documents')
			.update({ audience: 'delegates' })
			.eq('id', guide?.id)
			.select('audience');

		expect(organiserError).toBeNull();
		expect(byOrganiser).toEqual([{ audience: 'delegates' }]);
	});

	it('refuses a chair of another committee and a signed-in stranger', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);
		const otherCommitteeId = await addCommittee(
			seated.supabase,
			seated.conferenceId,
			'General Assembly'
		);
		const otherChair = await createSignedInClient('Mateo Diaz');
		await addChair(seated.supabase, otherCommitteeId, otherChair.userId);
		const stranger = await createSignedInClient();

		const { data: guide } = await chair.supabase
			.from('documents')
			.insert(backgroundGuideRow(chair.userId, seated.conferenceId, seated.committeeId))
			.select('id')
			.single();

		// The policies are "org. or uploader" and, since T46's migration, a chair
		// of the guide's own committee, and a chair of another committee is none
		// of these. A refused update is not an error: the policy hides the row, so
		// nothing matches and nothing changes.
		const { data: byOtherChair } = await otherChair.supabase
			.from('documents')
			.update({ title: 'Mine now' })
			.eq('id', guide?.id)
			.select('title');
		expect(byOtherChair).toEqual([]);

		const { data: byStranger } = await stranger.supabase
			.from('documents')
			.update({ title: 'Mine now' })
			.eq('id', guide?.id)
			.select('title');
		expect(byStranger).toEqual([]);

		const { data: unchanged } = await seated.supabase
			.from('documents')
			.select('title')
			.eq('id', guide?.id);
		expect(unchanged).toEqual([{ title: 'Background guide' }]);
	});

	it('refuses a delegate turning their own position paper into a public resource', async () => {
		const seated = await createSeatedDelegate();
		const documentId = await uploadPositionPaper(seated);

		// Postgres combines permissive policies with "or" for "using" and again,
		// separately, for "with check". The old row is picked by "A delegate can
		// replace their own position paper" and the new one would be accepted by
		// "Uploaders and organisers can change a file", which asks only that they
		// uploaded it -- so without `kind` in the guard's identity list a delegate
		// could publish their own paper to the whole internet.
		const { error } = await seated.delegate.supabase
			.from('documents')
			.update({ kind: 'resource', audience: 'everyone' })
			.eq('id', documentId);

		expect(error?.message).toContain('A document cannot be turned into another kind');

		const { data: unchanged } = await seated.supabase
			.from('documents')
			.select('kind, audience')
			.eq('id', documentId);

		expect(unchanged).toEqual([{ kind: 'position_paper', audience: 'delegates' }]);
	});
});

describe('documents, a chair changing a guide somebody else uploaded', () => {
	// T46's migration, `20260924120000_chair_background_guide_changes.sql`: the
	// chair papers page replaces and removes the committee's guide, which an
	// organiser may have uploaded first. Storage already let every chair of the
	// committee change the object; now the row agrees.
	it("lets a chair of the committee replace the organiser's guide", async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);

		const { data: guide } = await seated.supabase
			.from('documents')
			.insert(backgroundGuideRow(seated.userId, seated.conferenceId, seated.committeeId))
			.select('id')
			.single();

		const newPath = backgroundGuidePath(seated.conferenceId, seated.committeeId);
		const { data, error } = await chair.supabase
			.from('documents')
			.update({ storage_path: newPath, file_name: 'second-edition.pdf', audience: 'delegates' })
			.eq('id', guide?.id)
			.select('file_name, audience, uploaded_by');

		expect(error).toBeNull();
		// The uploader stays the organiser: `protect_documents_columns` freezes it.
		expect(data).toEqual([
			{ file_name: 'second-edition.pdf', audience: 'delegates', uploaded_by: seated.userId }
		]);
	});

	it("lets a chair of the committee remove the organiser's guide", async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);

		const { data: guide } = await seated.supabase
			.from('documents')
			.insert(backgroundGuideRow(seated.userId, seated.conferenceId, seated.committeeId))
			.select('id')
			.single();

		const { data, error } = await chair.supabase
			.from('documents')
			.delete()
			.eq('id', guide?.id)
			.select('id');

		expect(error).toBeNull();
		expect(data).toEqual([{ id: guide?.id }]);
	});

	it('still refuses a chair of another committee both changing and removing it', async () => {
		const seated = await createSeatedDelegate();
		const otherCommitteeId = await addCommittee(
			seated.supabase,
			seated.conferenceId,
			'General Assembly'
		);
		const otherChair = await createSignedInClient('Mateo Diaz');
		await addChair(seated.supabase, otherCommitteeId, otherChair.userId);

		const { data: guide } = await seated.supabase
			.from('documents')
			.insert(backgroundGuideRow(seated.userId, seated.conferenceId, seated.committeeId))
			.select('id')
			.single();

		const { data: updated } = await otherChair.supabase
			.from('documents')
			.update({ title: 'Mine now' })
			.eq('id', guide?.id)
			.select('id');
		const { data: deleted } = await otherChair.supabase
			.from('documents')
			.delete()
			.eq('id', guide?.id)
			.select('id');

		expect(updated).toEqual([]);
		expect(deleted).toEqual([]);
	});

	it("does not let a chair change a resource, which is the organiser's", async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);

		const { data: resource } = await seated.supabase
			.from('documents')
			.insert(resourceRow(seated.userId, seated.conferenceId))
			.select('id')
			.single();

		const { data } = await chair.supabase
			.from('documents')
			.update({ title: 'Mine now' })
			.eq('id', resource?.id)
			.select('id');

		expect(data).toEqual([]);
	});
});

describe('documents, replacing a paper after the deadline', () => {
	it('lets a delegate replace a paper the chair sent back', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);
		const documentId = await uploadPositionPaper(seated);
		await requestChangesToPaper(chair, documentId);
		await closePositionPaperDeadline(seated);

		const { data, error } = await seated.delegate.supabase
			.from('documents')
			.update(replacementPaperColumns(seated.conferenceId, seated.seatId))
			.eq('id', documentId)
			.select('file_name');

		expect(error).toBeNull();
		expect(data).toEqual([{ file_name: 'position-paper-v2.pdf' }]);
	});

	it('refuses a delegate replacing a paper that is still waiting for review', async () => {
		const seated = await createSeatedDelegate();
		const documentId = await uploadPositionPaper(seated);
		await closePositionPaperDeadline(seated);

		const { data } = await seated.delegate.supabase
			.from('documents')
			.update(replacementPaperColumns(seated.conferenceId, seated.seatId))
			.eq('id', documentId)
			.select('file_name');

		// A refused update is not an error: the policy hides the row, so nothing
		// matches and nothing changes.
		expect(data).toEqual([]);

		const { data: unchanged } = await seated.supabase
			.from('documents')
			.select('file_name')
			.eq('id', documentId);

		expect(unchanged).toEqual([{ file_name: 'position-paper.pdf' }]);
	});
});

describe('documents, deleting one', () => {
	it('lets the uploader delete their own paper while it is waiting for review', async () => {
		const seated = await createSeatedDelegate();
		const documentId = await uploadPositionPaper(seated);

		const { error } = await seated.delegate.supabase
			.from('documents')
			.delete()
			.eq('id', documentId);

		expect(error).toBeNull();

		const { data } = await seated.supabase.from('documents').select('id').eq('id', documentId);
		expect(data).toEqual([]);
	});

	it('refuses the uploader once a chair has approved it', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);
		const documentId = await uploadPositionPaper(seated);
		await approvePaper(chair, documentId);

		// Nothing is refused out loud: the delete policy hides an approved paper
		// from its own uploader, so the statement matches nothing.
		await seated.delegate.supabase.from('documents').delete().eq('id', documentId);

		const { data } = await seated.supabase.from('documents').select('id').eq('id', documentId);
		expect(data).toEqual([{ id: documentId }]);
	});

	it('lets an organiser delete any file of their conference', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);
		const documentId = await uploadPositionPaper(seated);
		await approvePaper(chair, documentId);

		const { error } = await seated.supabase.from('documents').delete().eq('id', documentId);

		expect(error).toBeNull();

		const { data } = await seated.supabase.from('documents').select('id').eq('id', documentId);
		expect(data).toEqual([]);
	});

	it('refuses a signed-in stranger deleting anything', async () => {
		const seated = await createSeatedDelegate();
		const documentId = await uploadPositionPaper(seated);
		const stranger = await createSignedInClient();

		await stranger.supabase.from('documents').delete().eq('id', documentId);

		const { data } = await seated.supabase.from('documents').select('id').eq('id', documentId);
		expect(data).toEqual([{ id: documentId }]);
	});
});

describe('documents_set_updated_at, the trigger that stamps a change', () => {
	it('stamps the moment a document was last changed, whatever the caller sent', async () => {
		const seated = await createSeatedDelegate();
		const documentId = await uploadPositionPaper(seated);

		const { data: before } = await seated.delegate.supabase
			.from('documents')
			.select('updated_at')
			.eq('id', documentId)
			.single();

		// The backdated `updated_at` travels with a real change, so the trigger
		// has something to do and it is the trigger's value that wins rather than
		// the uploader's. Without it, "when was this paper last replaced?" would
		// be a question the person replacing it gets to answer.
		const { data: after } = await seated.delegate.supabase
			.from('documents')
			.update({
				...replacementPaperColumns(seated.conferenceId, seated.seatId),
				updated_at: '2020-01-01T00:00:00Z'
			})
			.eq('id', documentId)
			.select('updated_at')
			.single();

		expect(new Date(after?.updated_at).getTime()).toBeGreaterThan(
			new Date(before?.updated_at).getTime()
		);
	});
});

describe('documents_check_scope', () => {
	it('refuses a background guide filed under another conference', async () => {
		const fixture = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const otherConference = await createConferenceOwnedByMe();

		// Every policy on this table asks about one of the three ids on the row
		// and takes the other two on trust, so without this trigger a guide could
		// be filed under a conference whose readers would then find it.
		const { error } = await fixture.supabase.from('documents').insert({
			...backgroundGuideRow(fixture.userId, fixture.conferenceId, committeeId),
			conference_id: otherConference.conferenceId
		});

		expect(error?.message).toContain('That committee is not part of this conference');
	});

	it('refuses a position paper whose seat is in another committee', async () => {
		const seated = await createSeatedDelegate();
		const otherCommitteeId = await addCommittee(
			seated.supabase,
			seated.conferenceId,
			'General Assembly'
		);

		const { error } = await seated.delegate.supabase.from('documents').insert({
			...positionPaperRow(
				seated.delegate.userId,
				seated.conferenceId,
				otherCommitteeId,
				seated.seatId
			)
		});

		expect(error?.message).toContain('That seat is not part of this committee');
	});
});

describe('notify_document_reviewed, the documents_notify_reviewed trigger', () => {
	it('tells the delegate their paper was approved', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);
		const documentId = await uploadPositionPaper(seated);

		await approvePaper(chair, documentId);

		// Read through the uploader's own client, because that is what proves the
		// `notifications` select policy really lets them see it. Being seated in
		// the first place sent them a `seat_allocated` notification as well, so
		// this asks for the one kind under test.
		const { data } = await seated.delegate.supabase
			.from('notifications')
			.select('kind, title')
			.eq('kind', 'document_reviewed');

		expect(data).toEqual([
			{
				kind: 'document_reviewed',
				title: 'Your position paper for Security Council was approved'
			}
		]);
	});

	it('tells the delegate their paper was sent back for changes', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);
		const documentId = await uploadPositionPaper(seated);

		await requestChangesToPaper(chair, documentId);

		const { data } = await seated.delegate.supabase
			.from('notifications')
			.select('title')
			.eq('kind', 'document_reviewed');

		expect(data).toEqual([
			{ title: 'Your position paper for Security Council was sent back for changes' }
		]);
	});

	it('refuses a chair clearing the review instead of making one, and says nothing', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);
		const documentId = await uploadPositionPaper(seated);
		await approvePaper(chair, documentId);

		await seated.delegate.supabase
			.from('documents')
			.update(replacementPaperColumns(seated.conferenceId, seated.seatId))
			.eq('id', documentId);

		const { error } = await chair.supabase
			.from('documents')
			.update({ review_status: null, review_comment: null })
			.eq('id', documentId);

		// A null review_status is not a decision, and since 20261022142000
		// (security review L49) it is not a state a paper can be in either: the
		// documents_position_paper_has_review_status check refuses it before
		// the trigger ever sees the row. The trigger keeps its own null test all
		// the same. Without one it would fall through to the "else" of the two endings
		// and tell the delegate their paper was sent back for changes, because
		// "null not in (…)" is null rather than true.
		expect(error?.message).toContain('documents_position_paper_has_review_status');

		const { data } = await seated.delegate.supabase
			.from('notifications')
			.select('title')
			.eq('kind', 'document_reviewed');

		expect(data).toEqual([{ title: 'Your position paper for Security Council was approved' }]);
	});

	it('says nothing when the paper goes back into the queue as submitted', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);
		const documentId = await uploadPositionPaper(seated);
		await requestChangesToPaper(chair, documentId);

		await seated.delegate.supabase
			.from('documents')
			.update(replacementPaperColumns(seated.conferenceId, seated.seatId))
			.eq('id', documentId);

		const { data } = await seated.delegate.supabase
			.from('notifications')
			.select('title')
			.eq('kind', 'document_reviewed');

		// Only the chair's decision is there. Putting the paper back in the queue
		// is not a decision about it, so nobody is told.
		expect(data).toEqual([
			{ title: 'Your position paper for Security Council was sent back for changes' }
		]);
	});
});

describe('move_delegate and the position paper', () => {
	it('carries the paper to the new seat and its committee', async () => {
		const seated = await createSeatedDelegate();
		const otherCommitteeId = await addCommittee(
			seated.supabase,
			seated.conferenceId,
			'Human Rights Council'
		);
		const toSeatId = await addSeat(seated.supabase, otherCommitteeId, 'France', 'FR');
		const documentId = await uploadPositionPaper(seated);

		const { error } = await seated.supabase.rpc('move_delegate', {
			from_seat_id: seated.seatId,
			to_seat_id: toSeatId
		});

		expect(error).toBeNull();

		// Read as the delegate, because the point of moving both columns is that
		// the paper is still theirs to read from the seat they now sit in.
		const { data } = await seated.delegate.supabase
			.from('documents')
			.select('seat_id, committee_id')
			.eq('id', documentId);

		expect(data).toEqual([{ seat_id: toSeatId, committee_id: otherCommitteeId }]);
	});
});

describe('revoke_seat and the position paper', () => {
	it('deletes the paper along with the seat', async () => {
		const seated = await createSeatedDelegate();
		const documentId = await uploadPositionPaper(seated);

		const { error } = await seated.supabase.rpc('revoke_seat', { seat_id: seated.seatId });

		expect(error).toBeNull();

		const { data } = await seated.supabase.from('documents').select('id').eq('id', documentId);
		expect(data).toEqual([]);
	});
});

describe('seats_clear_position_paper', () => {
	it('deletes the paper when a plain write empties the seat', async () => {
		const seated = await createSeatedDelegate();
		const documentId = await uploadPositionPaper(seated);

		// A delegation head unassigning a member does exactly this: it is a plain
		// update of `seats.user_id` rather than one of the allocation functions,
		// which is why the rule has to live in a trigger on `seats`. An organiser
		// may no longer make that plain write (protect_seats_columns), so the
		// service role makes it here and only the trigger runs.
		await createServiceRoleClient().from('seats').update({ user_id: null }).eq('id', seated.seatId);

		const { data } = await seated.supabase.from('documents').select('id').eq('id', documentId);
		expect(data).toEqual([]);
	});

	it('leaves the paper alone when the seat changes in some other way', async () => {
		const seated = await createSeatedDelegate();
		const documentId = await uploadPositionPaper(seated);

		await seated.supabase.from('seats').update({ is_available: false }).eq('id', seated.seatId);

		const { data } = await seated.supabase.from('documents').select('id').eq('id', documentId);
		expect(data).toEqual([{ id: documentId }]);
	});
});

// Migration 0017 (task T37): the organiser reviews papers from
// /manage/[slug]/documents, a delegate's delete keeps to the deadline, and for
// anybody who may not review a paper the review columns change only together
// with a new file.
describe('documents, an organiser reviewing a position paper', () => {
	it('lets an organiser approve a paper, and tells the delegate', async () => {
		const seated = await createSeatedDelegate();
		const documentId = await uploadPositionPaper(seated);

		const { data, error } = await seated.supabase
			.from('documents')
			.update({
				review_status: 'approved',
				reviewed_by: seated.userId,
				reviewed_at: new Date().toISOString()
			})
			.eq('id', documentId)
			.select('review_status');

		expect(error).toBeNull();
		expect(data).toEqual([{ review_status: 'approved' }]);

		const { data: notifications } = await seated.delegate.supabase
			.from('notifications')
			.select('title')
			.eq('kind', 'document_reviewed');

		expect(notifications).toEqual([
			{ title: 'Your position paper for Security Council was approved' }
		]);
	});

	it('lets an organiser send a paper back with a comment', async () => {
		const seated = await createSeatedDelegate();
		const documentId = await uploadPositionPaper(seated);

		const { data, error } = await seated.supabase
			.from('documents')
			.update({
				review_status: 'changes_requested',
				review_comment: 'Please add your sources.',
				reviewed_by: seated.userId,
				reviewed_at: new Date().toISOString()
			})
			.eq('id', documentId)
			.select('review_status, review_comment');

		expect(error).toBeNull();
		expect(data).toEqual([
			{ review_status: 'changes_requested', review_comment: 'Please add your sources.' }
		]);
	});

	it('refuses a volunteer on the team, who is staff but not an organiser', async () => {
		const seated = await createSeatedDelegate();
		const documentId = await uploadPositionPaper(seated);
		const volunteer = await createSignedInClient('Dara Okafor');
		await addStaff(seated.supabase, seated.conferenceId, volunteer.userId);

		// A refused update is not an error: no update policy offers the row to a
		// volunteer, so nothing matches and nothing changes.
		const { data } = await volunteer.supabase
			.from('documents')
			.update({ review_status: 'approved' })
			.eq('id', documentId)
			.select('id');

		expect(data).toEqual([]);

		const { data: unchanged } = await seated.supabase
			.from('documents')
			.select('review_status')
			.eq('id', documentId);

		expect(unchanged).toEqual([{ review_status: 'submitted' }]);
	});
});

describe('protect_documents_columns, the review changes only with the file', () => {
	it('refuses a delegate putting a sent-back paper back in the queue without a new file', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);
		const documentId = await uploadPositionPaper(seated);
		await requestChangesToPaper(chair, documentId);

		const { error } = await seated.delegate.supabase
			.from('documents')
			.update({
				review_status: 'submitted',
				review_comment: null,
				reviewed_by: null,
				reviewed_at: null
			})
			.eq('id', documentId);

		expect(error?.message).toContain('Only a chair of this committee can review a position paper');
	});

	it("refuses a delegate clearing the chair's comment without a new file", async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);
		const documentId = await uploadPositionPaper(seated);
		await requestChangesToPaper(chair, documentId);

		const { error } = await seated.delegate.supabase
			.from('documents')
			.update({ review_comment: null })
			.eq('id', documentId);

		expect(error?.message).toContain('Only a chair of this committee can review a position paper');
	});

	it('refuses a new file on an approved paper that keeps saying approved', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);
		const documentId = await uploadPositionPaper(seated);
		await approvePaper(chair, documentId);

		const { error } = await seated.delegate.supabase
			.from('documents')
			.update({
				storage_path: positionPaperPath(seated.conferenceId, seated.seatId),
				file_name: 'position-paper-v2.pdf'
			})
			.eq('id', documentId);

		expect(error?.message).toContain('a new file goes back to submitted');
	});

	it('lets a delegate retitle their paper without touching the review', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);
		const documentId = await uploadPositionPaper(seated);
		await requestChangesToPaper(chair, documentId);

		const { data, error } = await seated.delegate.supabase
			.from('documents')
			.update({ title: 'France · Security Council' })
			.eq('id', documentId)
			.select('title, review_status');

		expect(error).toBeNull();
		expect(data).toEqual([
			{ title: 'France · Security Council', review_status: 'changes_requested' }
		]);
	});
});

describe('documents, a delegate removing their paper after the deadline', () => {
	it('refuses the delete once the deadline has passed', async () => {
		const seated = await createSeatedDelegate();
		const documentId = await uploadPositionPaper(seated);
		await closePositionPaperDeadline(seated);

		// Refused without an error: the delete policy no longer offers the row.
		await seated.delegate.supabase.from('documents').delete().eq('id', documentId);

		const { data } = await seated.supabase.from('documents').select('id').eq('id', documentId);
		expect(data).toEqual([{ id: documentId }]);
	});

	it('still lets the chair who uploaded a background guide remove it after the deadline', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);
		await closePositionPaperDeadline(seated);

		const { data: inserted, error: insertError } = await chair.supabase
			.from('documents')
			.insert(backgroundGuideRow(chair.userId, seated.conferenceId, seated.committeeId))
			.select('id')
			.single();

		expect(insertError).toBeNull();

		await chair.supabase.from('documents').delete().eq('id', inserted?.id);

		const { data } = await seated.supabase.from('documents').select('id').eq('id', inserted?.id);
		expect(data).toEqual([]);
	});
});

// Migration 20260927140000 (task T145): a position paper may be written on
// MUNMeet instead of uploaded. It is the same row, with `body_markdown` in
// place of the four file columns, so the deadline, the review and the delete
// policies above cover it without anything of their own.

/** The columns of a written paper: a body and no file at all. */
function writtenPaperColumns(body = 'France **supports** the treaty.') {
	return {
		storage_path: null,
		file_name: null,
		file_size_bytes: null,
		mime_type: null,
		body_markdown: body
	};
}

/** The delegate's own written paper, submitted through their own client. */
async function submitWrittenPaper(seated: SeatedDelegate): Promise<string> {
	const { data, error } = await seated.delegate.supabase
		.from('documents')
		.insert({
			...positionPaperRow(
				seated.delegate.userId,
				seated.conferenceId,
				seated.committeeId,
				seated.seatId
			),
			...writtenPaperColumns()
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not submit the fixture written paper: ${error?.message}`);
	}

	return data.id;
}

describe('documents, a written position paper', () => {
	it('lets the delegate submit one, and the chair read it', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);
		const documentId = await submitWrittenPaper(seated);

		const { data } = await chair.supabase
			.from('documents')
			.select('body_markdown, storage_path, review_status')
			.eq('id', documentId);

		expect(data).toEqual([
			{
				body_markdown: 'France **supports** the treaty.',
				storage_path: null,
				review_status: 'submitted'
			}
		]);
	});

	it('refuses a first written paper once the deadline has passed', async () => {
		const seated = await createSeatedDelegate();
		await closePositionPaperDeadline(seated);

		const { error } = await seated.delegate.supabase.from('documents').insert({
			...positionPaperRow(
				seated.delegate.userId,
				seated.conferenceId,
				seated.committeeId,
				seated.seatId
			),
			...writtenPaperColumns()
		});

		expect(error?.message).toContain('row-level security');
	});

	it('lets the delegate swap an uploaded file for a written paper, back in the queue', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);
		const documentId = await uploadPositionPaper(seated);
		await requestChangesToPaper(chair, documentId);

		const { data, error } = await seated.delegate.supabase
			.from('documents')
			.update({
				...writtenPaperColumns(),
				review_status: 'submitted',
				review_comment: null,
				reviewed_by: null,
				reviewed_at: null
			})
			.eq('id', documentId)
			.select('review_status, file_name');

		expect(error).toBeNull();
		expect(data).toEqual([{ review_status: 'submitted', file_name: null }]);
	});

	it('refuses resending the very text the chair sent back', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);
		const documentId = await submitWrittenPaper(seated);
		await requestChangesToPaper(chair, documentId);

		const { error } = await seated.delegate.supabase
			.from('documents')
			.update({
				...writtenPaperColumns(),
				review_status: 'submitted',
				review_comment: null,
				reviewed_by: null,
				reviewed_at: null
			})
			.eq('id', documentId);

		expect(error?.message).toContain('Only a chair of this committee can review a position paper');
	});

	it('takes a changed text back into the queue after the chair asked for changes', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);
		const documentId = await submitWrittenPaper(seated);
		await requestChangesToPaper(chair, documentId);
		await closePositionPaperDeadline(seated);

		const { data, error } = await seated.delegate.supabase
			.from('documents')
			.update({
				...writtenPaperColumns('France supports the treaty, with sources.'),
				review_status: 'submitted',
				review_comment: null,
				reviewed_by: null,
				reviewed_at: null
			})
			.eq('id', documentId)
			.select('review_status');

		expect(error).toBeNull();
		expect(data).toEqual([{ review_status: 'submitted' }]);
	});

	it('deletes a written paper with its seat, with no file to queue for removal', async () => {
		const seated = await createSeatedDelegate();
		const documentId = await submitWrittenPaper(seated);

		// The plain write is the service role's, as in seats_clear_position_paper above.
		const { error } = await createServiceRoleClient()
			.from('seats')
			.update({ user_id: null })
			.eq('id', seated.seatId);

		expect(error).toBeNull();
		const { data } = await seated.supabase.from('documents').select('id').eq('id', documentId);
		expect(data).toEqual([]);
	});
});

describe('documents_file_or_body', () => {
	it('refuses a paper with both a file and a body', async () => {
		const seated = await createSeatedDelegate();

		const { error } = await seated.delegate.supabase.from('documents').insert({
			...positionPaperRow(
				seated.delegate.userId,
				seated.conferenceId,
				seated.committeeId,
				seated.seatId
			),
			body_markdown: 'And a body too'
		});

		expect(error?.message).toContain('documents_file_or_body');
	});

	it('refuses a paper with neither a file nor a body', async () => {
		const seated = await createSeatedDelegate();

		const { error } = await seated.delegate.supabase.from('documents').insert({
			...positionPaperRow(
				seated.delegate.userId,
				seated.conferenceId,
				seated.committeeId,
				seated.seatId
			),
			...writtenPaperColumns(),
			body_markdown: null
		});

		expect(error?.message).toContain('documents_file_or_body');
	});

	it('refuses a background guide written instead of uploaded', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createChairOfCommittee(seated);

		const { error } = await chair.supabase.from('documents').insert({
			...backgroundGuideRow(chair.userId, seated.conferenceId, seated.committeeId),
			...writtenPaperColumns()
		});

		expect(error?.message).toContain('documents_file_or_body');
	});
});

describe('documents_body_is_written', () => {
	it('refuses a blank written paper, and one over 100 000 characters', async () => {
		const seated = await createSeatedDelegate();
		const row = positionPaperRow(
			seated.delegate.userId,
			seated.conferenceId,
			seated.committeeId,
			seated.seatId
		);

		const blank = await seated.delegate.supabase
			.from('documents')
			.insert({ ...row, ...writtenPaperColumns('  \n ') });
		const tooLong = await seated.delegate.supabase
			.from('documents')
			.insert({ ...row, ...writtenPaperColumns('a'.repeat(100_001)) });

		expect(blank.error?.message).toContain('documents_body_is_written');
		expect(tooLong.error?.message).toContain('documents_body_is_written');
	});
});
