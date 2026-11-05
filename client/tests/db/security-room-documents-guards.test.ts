import type { SupabaseClient } from '@supabase/supabase-js';
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
	addRole,
	addSeat,
	addSession,
	createCommitteeRoom,
	createConferenceOwnedByMe,
	giveRole,
	giveSeatTo,
	type CommitteeRoomFixture,
	type ConferenceFixture
} from './conference-fixtures';
import {
	addSeatedDelegate,
	approvePaper,
	createPaperCommittee,
	fixtureTextFor,
	introducePaper,
	startPaper,
	storedPaper,
	submitPaper,
	writePaper,
	type PaperCommittee,
	type SeatedDelegate
} from './committee-paper-fixtures';

/*
 * The committee room and documents guards of the security review of
 * 10 October 2026 (docs/security-review-2026-10-10.md), closed by
 * 20261022142000_room_documents_guards.sql:
 *
 *   L47  a closed vote and its answers are the record of what the committee
 *        decided; `protect_closed_votes` (votes_refuse_closed_changes) and
 *        `protect_closed_vote_entries` (vote_entries_refuse_closed_vote) keep
 *        a browser from rewriting, moving or deleting them, and
 *        `protect_committee_session_record` (committee_sessions_keep_record)
 *        from putting a session back to scheduled, moving it to another
 *        committee, or removing one that holds a closed vote, which would
 *        cascade it away; `private.session_holds_closed_vote` answers that
 *        last question whichever votes the remover may read.
 *   L48  "A chair can open a vote" takes only an open vote with no result.
 *   L49  `documents_position_paper_has_review_status`: a position paper always
 *        says where its review stands, and `protect_documents_columns` no
 *        longer lets a null slip past the reset rule.
 *   L50  the uploader of a guide or a resource keeps no rights of their own:
 *        "Administrators can change a guide or shared file" and "A delegate
 *        can remove their own paper while it waits for review" replace the two
 *        policies that named the uploader for ever.
 *   L51  `protect_documents_columns`: a reviewer who did not upload the paper
 *        writes its review and nothing else of it.
 *   L58  `notify_schedule_changed` tells the audience once per half hour per
 *        event, remembering when in `schedule_events.last_notified_at`, which
 *        `guard_schedule_event_notified_at` (schedule_events_guard_notified_at)
 *        keeps a browser from writing.
 *   L21  the nine room tables are closed to visitors (anon) altogether, since
 *        a realtime delete reaches every subscriber whose role may read the
 *        table at all.
 *   L22  committee_paper_seats and amendment_seats leave the realtime
 *        publication; `touch_paper_for_seat_change`
 *        (committee_paper_seats_touch_paper) and
 *        `touch_amendment_for_seat_change` (amendment_seats_touch_amendment)
 *        bump the paper and the amendment instead, which the pages do hear.
 *        Realtime itself is asked which tables it publishes.
 *
 * Refusals are proved with signed-in clients, and the service role only
 * arranges what nobody may write by hand.
 */

/** The nine tables the room publishes to realtime (20260921130000, 20260923200000, 20261001120600). */
const ROOM_TABLES = [
	'committee_state',
	'committee_sessions',
	'speakers_lists',
	'speakers_list_entries',
	'motions',
	'votes',
	'roll_calls',
	'roll_call_entries',
	'vote_entries'
] as const;

/** Postgres's code for "permission denied" and for a refused row-level policy. */
const PERMISSION_DENIED = '42501';

/** Milliseconds in one hour and one minute, for placing fixture events and cool-downs. */
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
const MILLISECONDS_PER_MINUTE = 60 * 1000;

/** A moment this many hours from now, as the ISO string Supabase expects. */
function hoursFromNow(hours: number): string {
	return new Date(Date.now() + hours * MILLISECONDS_PER_HOUR).toISOString();
}

/** A room with a session, so votes can be opened in it. */
async function roomWithSession(): Promise<CommitteeRoomFixture & { sessionId: string }> {
	const room = await createCommitteeRoom();
	const sessionId = await addSession(room.chair.supabase, room.committeeId);

	return { ...room, sessionId };
}

/** One vote opened by the chair, roll call by default so it can have answers. */
async function openVote(
	room: CommitteeRoomFixture & { sessionId: string },
	method: 'roll_call' | 'show_of_hands' = 'roll_call'
): Promise<string> {
	const { data, error } = await room.chair.supabase
		.from('votes')
		.insert({
			committee_id: room.committeeId,
			session_id: room.sessionId,
			kind: 'substantive',
			subject: 'Draft Resolution 1.1',
			method
		})
		.select('id')
		.single();

	if (error || !data) throw new Error(`Could not open the fixture vote: ${error?.message}`);

	return data.id;
}

/** The chair closes the vote with a result, the one write "Close vote" makes. */
async function closeVote(chair: SupabaseClient, voteId: string): Promise<void> {
	const { error } = await chair
		.from('votes')
		.update({
			status: 'closed',
			votes_for: 3,
			votes_against: 1,
			votes_abstain: 0,
			passed: true,
			closed_at: new Date().toISOString()
		})
		.eq('id', voteId);

	if (error) throw new Error(`Could not close the fixture vote: ${error.message}`);
}

/** The chair starts the session and ends it, the two writes the room makes to a session. */
async function runAndEndSession(chair: SupabaseClient, sessionId: string): Promise<void> {
	const { error: started } = await chair
		.from('committee_sessions')
		.update({ status: 'in_progress', started_at: new Date().toISOString() })
		.eq('id', sessionId);
	const { error: ended } = await chair
		.from('committee_sessions')
		.update({ status: 'ended', ended_at: new Date().toISOString() })
		.eq('id', sessionId);

	if (started || ended) {
		throw new Error(`Could not run the fixture session: ${(started ?? ended)?.message}`);
	}
}

/** One seat's answer in a roll call vote, through the chair's own client. */
async function answer(
	chair: SupabaseClient,
	voteId: string,
	seatId: string,
	choice: 'for' | 'against' | 'abstain'
): Promise<void> {
	const { error } = await chair
		.from('vote_entries')
		.insert({ vote_id: voteId, seat_id: seatId, choice });

	if (error) throw new Error(`Could not record the fixture answer: ${error.message}`);
}

/** A delegate seated in a published conference, who may upload the paper for their seat. */
type SeatedPaperDelegate = ConferenceFixture & {
	committeeId: string;
	seatId: string;
	delegate: SignedInClient;
};

async function createSeatedDelegate(): Promise<SeatedPaperDelegate> {
	const fixture = await createConferenceOwnedByMe();
	const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
	const seatId = await addSeat(fixture.supabase, committeeId, 'France', 'FR');
	const delegate = await createSignedInClient('Ana Silva');

	await giveSeatTo(fixture.supabase, seatId, delegate.userId);

	// `check_document_scope` runs as the writer, who has to be able to read the
	// committee, which a delegate can only once the conference is published.
	const { error } = await fixture.supabase
		.from('conferences')
		.update({ status: 'published' })
		.eq('id', fixture.conferenceId);

	if (error) throw new Error(`Could not publish the fixture conference: ${error.message}`);

	return { ...fixture, committeeId, seatId, delegate };
}

/** A fresh path in the documents bucket for the seat's paper; nothing is uploaded behind it. */
function positionPaperPath(seated: SeatedPaperDelegate): string {
	return `${seated.conferenceId}/position-papers/${seated.seatId}-${crypto.randomUUID()}.pdf`;
}

/** The row the delegate writes when they upload the paper for their seat, as the app writes it. */
function positionPaperRow(seated: SeatedPaperDelegate, reviewStatus: string | null = 'submitted') {
	return {
		conference_id: seated.conferenceId,
		committee_id: seated.committeeId,
		seat_id: seated.seatId,
		uploaded_by: seated.delegate.userId,
		kind: 'position_paper',
		title: 'Position paper',
		storage_path: positionPaperPath(seated),
		file_name: 'position-paper.pdf',
		file_size_bytes: 120_000,
		mime_type: 'application/pdf',
		review_status: reviewStatus
	};
}

/** The delegate uploads their paper through their own client. */
async function uploadPositionPaper(seated: SeatedPaperDelegate): Promise<string> {
	const { data, error } = await seated.delegate.supabase
		.from('documents')
		.insert(positionPaperRow(seated))
		.select('id')
		.single();

	if (error || !data) throw new Error(`Could not upload the fixture paper: ${error?.message}`);

	return data.id;
}

/** The row a chair writes for the committee's background guide. */
function backgroundGuideRow(uploadedBy: string, conferenceId: string, committeeId: string) {
	return {
		conference_id: conferenceId,
		committee_id: committeeId,
		uploaded_by: uploadedBy,
		kind: 'background_guide',
		title: 'Background guide',
		storage_path: `${conferenceId}/background-guides/${committeeId}-${crypto.randomUUID()}.pdf`,
		file_name: 'background-guide.pdf',
		file_size_bytes: 120_000,
		mime_type: 'application/pdf',
		audience: 'everyone'
	};
}

/**
 * The row a document manager writes for a resource of the conference. A
 * staff file, so that the manager, who stays on the team when they lose the
 * role, can still read it: Postgres asks the select policy of a row before
 * an update or a delete with a where clause, and a row they could not read
 * would prove nothing about the uploader policies.
 */
function resourceRow(uploadedBy: string, conferenceId: string) {
	return {
		conference_id: conferenceId,
		uploaded_by: uploadedBy,
		kind: 'resource',
		title: 'Rules of procedure',
		storage_path: `${conferenceId}/resources/${crypto.randomUUID()}.pdf`,
		file_name: 'rules.pdf',
		file_size_bytes: 120_000,
		mime_type: 'application/pdf',
		audience: 'staff'
	};
}

/** Inserts a document through `uploader`'s own client and answers its id. */
async function uploadDocument(uploader: SupabaseClient, row: object): Promise<string> {
	const { data, error } = await uploader.from('documents').insert(row).select('id').single();

	if (error || !data) throw new Error(`Could not upload the fixture document: ${error?.message}`);

	return data.id;
}

/** Takes every role a person holds on the conference away, through the organiser's client. */
async function takeRolesFrom(
	organiser: SupabaseClient,
	conferenceId: string,
	userId: string
): Promise<void> {
	const { error } = await organiser
		.from('conference_role_members')
		.delete()
		.eq('conference_id', conferenceId)
		.eq('user_id', userId);

	if (error) throw new Error(`Could not take the fixture role away: ${error.message}`);
}

/** A document's title and file as the organiser reads them, past nothing. */
async function readDocument(organiser: SupabaseClient, documentId: string) {
	const { data, error } = await organiser
		.from('documents')
		.select('title, file_name')
		.eq('id', documentId);

	if (error) throw new Error(`Could not read the fixture document: ${error.message}`);

	return data;
}

/** An organiser with a committee, a seated delegate and an event starting soon. */
async function conferenceWithSoonEvent() {
	const organiser = await createConferenceOwnedByMe();
	const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
	const seatId = await addSeat(organiser.supabase, committeeId, 'France', 'FR');
	const delegate = await createSignedInClient();
	await giveSeatTo(organiser.supabase, seatId, delegate.userId);

	const { data, error } = await organiser.supabase
		.from('schedule_events')
		.insert({
			conference_id: organiser.conferenceId,
			title: 'Opening ceremony',
			audience: 'everyone',
			starts_at: hoursFromNow(2),
			ends_at: hoursFromNow(3)
		})
		.select('id')
		.single();

	if (error || !data) throw new Error(`Could not create the fixture event: ${error?.message}`);

	return { organiser, delegate, eventId: data.id };
}

/** Moves the event to start this many hours from now, through the organiser's client. */
async function moveEvent(organiser: SupabaseClient, eventId: string, startsInHours: number) {
	return organiser
		.from('schedule_events')
		.update({ starts_at: hoursFromNow(startsInHours), ends_at: hoursFromNow(startsInHours + 1) })
		.eq('id', eventId)
		.select('id');
}

/** The schedule notifications this person can see, through their own client. */
async function scheduleNotificationCount(person: SignedInClient): Promise<number> {
	const { data, error } = await person.supabase
		.from('notifications')
		.select('id')
		.eq('kind', 'schedule_changed');

	if (error) throw new Error(`Could not read the notifications: ${error.message}`);

	return (data ?? []).length;
}

/** When the event last told its audience, read past Row Level Security. */
async function lastNotifiedAt(eventId: string): Promise<string | null> {
	const { data, error } = await createServiceRoleClient()
		.from('schedule_events')
		.select('last_notified_at')
		.eq('id', eventId)
		.single();

	if (error || !data) throw new Error(`Could not read the fixture event: ${error?.message}`);

	return data.last_notified_at;
}

/** A draft resolution France leads with Spain as co-author, approved and introduced. */
async function introducedDraftWith(
	committee: PaperCommittee,
	coAuthor: SeatedDelegate
): Promise<string> {
	const paperId = await startPaper(committee.france, committee.committeeId);
	const { error } = await committee.france.supabase.rpc('add_paper_author', {
		paper_id: paperId,
		seat_id: coAuthor.seatId
	});

	if (error) throw new Error(`Could not add the fixture author: ${error.message}`);

	await writePaper(committee.france, paperId, fixtureTextFor('draft_resolution'));
	await submitPaper(committee.france, paperId);
	await approvePaper(committee.chair, paperId);
	await introducePaper(committee, paperId);

	return paperId;
}

/** Germany proposes to change a clause of the draft, and the amendment's id comes back. */
async function proposeChange(proposer: SignedInClient, paperId: string): Promise<string> {
	const { data, error } = await proposer.supabase.rpc('propose_amendment', {
		paper_id: paperId,
		action: 'change',
		target_part: 'operative',
		target_clause_id: 'o1a',
		text_markdown: 'to keep human control over every use of force;',
		parent_amendment_id: null
	});

	if (error || !data) throw new Error(`Could not propose the fixture amendment: ${error?.message}`);

	return data;
}

/** An amendment's `updated_at`, read past Row Level Security. */
async function amendmentUpdatedAt(amendmentId: string): Promise<string> {
	const { data, error } = await createServiceRoleClient()
		.from('amendments')
		.select('updated_at')
		.eq('id', amendmentId)
		.single();

	if (error || !data) throw new Error(`Could not read the fixture amendment: ${error?.message}`);

	return data.updated_at;
}

/** How long a test waits for Realtime to answer a subscription. */
const REALTIME_TIMEOUT_MS = 10_000;

/**
 * What Realtime answers a signed-in person who asks to hear a table's changes:
 * 'ok' for a table in the supabase_realtime publication, 'error' for one that
 * is not. The publication cannot be read through PostgREST, but Realtime
 * reads it for every subscription and says so in a "system" message on the
 * channel ("Subscribed to PostgreSQL", or "Unable to subscribe to changes
 * with given parameters").
 */
function realtimeAnswerTo(person: SignedInClient, table: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const giveUp = setTimeout(() => {
			void person.supabase.removeChannel(channel);
			reject(new Error(`Realtime did not answer the subscription to ${table}.`));
		}, REALTIME_TIMEOUT_MS);

		const channel = person.supabase
			.channel(`publication-${table}-${crypto.randomUUID()}`)
			.on('postgres_changes', { event: '*', schema: 'public', table }, () => {})
			.on('system', {}, (message: { extension?: string; status?: string }) => {
				if (message.extension !== 'postgres_changes') return;

				clearTimeout(giveUp);
				void person.supabase.removeChannel(channel);
				resolve(String(message.status));
			})
			.subscribe();
	});
}

describe('protect_closed_votes, votes_refuse_closed_changes (L47)', () => {
	it('keeps a chair from rewriting or deleting a vote once it is closed', async () => {
		const room = await roomWithSession();
		const voteId = await openVote(room, 'show_of_hands');
		await closeVote(room.chair.supabase, voteId);

		const { error: rewritten } = await room.chair.supabase
			.from('votes')
			.update({ passed: false, votes_for: 0, votes_against: 4 })
			.eq('id', voteId);
		const { error: deleted } = await room.chair.supabase.from('votes').delete().eq('id', voteId);

		expect(rewritten).toMatchObject({ code: PERMISSION_DENIED });
		expect(rewritten?.message).toContain('stays as it closed');
		expect(deleted).toMatchObject({ code: PERMISSION_DENIED });

		const { data: still } = await room.chair.supabase
			.from('votes')
			.select('status, passed, votes_for')
			.eq('id', voteId);

		expect(still).toEqual([{ status: 'closed', passed: true, votes_for: 3 }]);
	});

	it('still lets the chair close an open vote, and cancel one with its answers', async () => {
		const room = await roomWithSession();
		const voteId = await openVote(room);
		await answer(room.chair.supabase, voteId, room.seatId, 'for');

		// Cancelling an open vote deletes it, and its answers go with it as the
		// table's owner: a cascade is not a browser's write.
		const { data: cancelled, error } = await room.chair.supabase
			.from('votes')
			.delete()
			.eq('id', voteId)
			.select('id');

		expect(error).toBeNull();
		expect(cancelled).toEqual([{ id: voteId }]);
	});

	it('lets a committee be deleted with its closed votes, since the cascade is not a browser write', async () => {
		// A committee nobody sits in, so its organiser may delete it, with a chair
		// who opens and closes a vote in it first.
		const fixture = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const chair = await createSignedInClient('Fixture Chair');
		await addChair(fixture.supabase, committeeId, chair.userId);
		const sessionId = await addSession(chair.supabase, committeeId);

		const { data: vote, error: opened } = await chair.supabase
			.from('votes')
			.insert({
				committee_id: committeeId,
				session_id: sessionId,
				kind: 'procedural',
				subject: 'Motion to adjourn',
				method: 'show_of_hands'
			})
			.select('id')
			.single();

		if (opened || !vote) throw new Error(`Could not open the fixture vote: ${opened?.message}`);

		await closeVote(chair.supabase, vote.id);

		const { error } = await fixture.supabase.from('committees').delete().eq('id', committeeId);

		expect(error).toBeNull();

		const { data: left } = await createServiceRoleClient()
			.from('votes')
			.select('id')
			.eq('id', vote.id);

		expect(left).toEqual([]);
	});
});

describe('protect_closed_vote_entries, vote_entries_refuse_closed_vote (L47)', () => {
	it("keeps a closed vote's answers as they were given", async () => {
		const room = await roomWithSession();
		const germanySeatId = await addSeat(room.supabase, room.committeeId, 'Germany', 'DE');
		const voteId = await openVote(room);
		await answer(room.chair.supabase, voteId, room.seatId, 'for');
		await closeVote(room.chair.supabase, voteId);

		const { error: added } = await room.chair.supabase
			.from('vote_entries')
			.insert({ vote_id: voteId, seat_id: germanySeatId, choice: 'against' });
		const { error: changed } = await room.chair.supabase
			.from('vote_entries')
			.update({ choice: 'against' })
			.eq('vote_id', voteId)
			.eq('seat_id', room.seatId);
		const { error: removed } = await room.chair.supabase
			.from('vote_entries')
			.delete()
			.eq('vote_id', voteId)
			.eq('seat_id', room.seatId);

		expect(added).toMatchObject({ code: PERMISSION_DENIED });
		expect(changed).toMatchObject({ code: PERMISSION_DENIED });
		expect(removed).toMatchObject({ code: PERMISSION_DENIED });
		expect(removed?.message).toContain('answers stay as they were given');

		const { data: still } = await room.chair.supabase
			.from('vote_entries')
			.select('seat_id, choice')
			.eq('vote_id', voteId);

		expect(still).toEqual([{ seat_id: room.seatId, choice: 'for' }]);
	});

	it('still lets the chair change and take off an answer while the vote is open', async () => {
		const room = await roomWithSession();
		const voteId = await openVote(room);
		await answer(room.chair.supabase, voteId, room.seatId, 'for');

		const { error: changed } = await room.chair.supabase
			.from('vote_entries')
			.update({ choice: 'abstain' })
			.eq('vote_id', voteId)
			.eq('seat_id', room.seatId);
		const { error: removed } = await room.chair.supabase
			.from('vote_entries')
			.delete()
			.eq('vote_id', voteId)
			.eq('seat_id', room.seatId);

		expect(changed).toBeNull();
		expect(removed).toBeNull();
	});

	it("refuses moving a closed vote's answer onto another vote, or another vote's answer onto it", async () => {
		const room = await roomWithSession();
		const germanySeatId = await addSeat(room.supabase, room.committeeId, 'Germany', 'DE');
		const closedVoteId = await openVote(room);
		await answer(room.chair.supabase, closedVoteId, room.seatId, 'for');
		await closeVote(room.chair.supabase, closedVoteId);
		const openVoteId = await openVote(room);
		await answer(room.chair.supabase, openVoteId, germanySeatId, 'against');

		// Moved away, the answer would leave the closed vote's record, and
		// cancelling the open vote would then erase it for good.
		const { error: movedOff } = await room.chair.supabase
			.from('vote_entries')
			.update({ vote_id: openVoteId })
			.eq('vote_id', closedVoteId)
			.eq('seat_id', room.seatId);
		const { error: movedOn } = await room.chair.supabase
			.from('vote_entries')
			.update({ vote_id: closedVoteId })
			.eq('vote_id', openVoteId)
			.eq('seat_id', germanySeatId);

		expect(movedOff).toMatchObject({ code: PERMISSION_DENIED });
		expect(movedOff?.message).toContain('answers stay as they were given');
		expect(movedOn).toMatchObject({ code: PERMISSION_DENIED });

		const { data: closedAnswers } = await room.chair.supabase
			.from('vote_entries')
			.select('seat_id, choice')
			.eq('vote_id', closedVoteId);
		const { data: openAnswers } = await room.chair.supabase
			.from('vote_entries')
			.select('seat_id, choice')
			.eq('vote_id', openVoteId);

		expect(closedAnswers).toEqual([{ seat_id: room.seatId, choice: 'for' }]);
		expect(openAnswers).toEqual([{ seat_id: germanySeatId, choice: 'against' }]);
	});
});

describe('protect_committee_session_record, committee_sessions_keep_record (L47)', () => {
	it('keeps a chair from putting a running or ended session back to scheduled', async () => {
		const room = await roomWithSession();

		const { error: started } = await room.chair.supabase
			.from('committee_sessions')
			.update({ status: 'in_progress', started_at: new Date().toISOString() })
			.eq('id', room.sessionId);

		expect(started).toBeNull();

		const { error: unstarted } = await room.chair.supabase
			.from('committee_sessions')
			.update({ status: 'scheduled' })
			.eq('id', room.sessionId);

		expect(unstarted).toMatchObject({ code: PERMISSION_DENIED });
		expect(unstarted?.message).toContain('cannot go back');

		const { error: ended } = await room.chair.supabase
			.from('committee_sessions')
			.update({ status: 'ended', ended_at: new Date().toISOString() })
			.eq('id', room.sessionId);

		expect(ended).toBeNull();

		const { error: resumed } = await room.chair.supabase
			.from('committee_sessions')
			.update({ status: 'in_progress' })
			.eq('id', room.sessionId);
		const { error: unended } = await room.chair.supabase
			.from('committee_sessions')
			.update({ status: 'scheduled' })
			.eq('id', room.sessionId);

		expect(resumed).toMatchObject({ code: PERMISSION_DENIED });
		expect(unended).toMatchObject({ code: PERMISSION_DENIED });

		// Renaming an ended session is still a change a chair may make.
		const { error: renamed } = await room.chair.supabase
			.from('committee_sessions')
			.update({ name: 'Opening session' })
			.eq('id', room.sessionId);

		expect(renamed).toBeNull();

		const { data: still } = await room.chair.supabase
			.from('committee_sessions')
			.select('name, status')
			.eq('id', room.sessionId);

		expect(still).toEqual([{ name: 'Opening session', status: 'ended' }]);
	});

	it('refuses removing a scheduled session that holds a closed vote, and its vote stays', async () => {
		const room = await roomWithSession();
		const voteId = await openVote(room);
		await answer(room.chair.supabase, voteId, room.seatId, 'for');
		await closeVote(room.chair.supabase, voteId);

		// The session never started, so the delete policy matches it, and the
		// cascade would take the closed vote and its answers as the owner.
		const { error } = await room.chair.supabase
			.from('committee_sessions')
			.delete()
			.eq('id', room.sessionId);

		expect(error).toMatchObject({ code: PERMISSION_DENIED });
		expect(error?.message).toContain('closed vote');

		const { data: vote } = await createServiceRoleClient()
			.from('votes')
			.select('status')
			.eq('id', voteId);
		const { data: answers } = await createServiceRoleClient()
			.from('vote_entries')
			.select('choice')
			.eq('vote_id', voteId);

		expect(vote).toEqual([{ status: 'closed' }]);
		expect(answers).toEqual([{ choice: 'for' }]);
	});

	it('still lets a chair remove a scheduled session whose only vote is open', async () => {
		const room = await roomWithSession();
		const voteId = await openVote(room);
		await answer(room.chair.supabase, voteId, room.seatId, 'for');

		const { data: removed, error } = await room.chair.supabase
			.from('committee_sessions')
			.delete()
			.eq('id', room.sessionId)
			.select('id');

		expect(error).toBeNull();
		expect(removed).toEqual([{ id: room.sessionId }]);

		const { data: left } = await createServiceRoleClient()
			.from('votes')
			.select('id')
			.eq('id', voteId);

		expect(left).toEqual([]);
	});

	it('keeps a chair of two committees from moving an ended session with a closed vote to the other', async () => {
		const room = await roomWithSession();
		const otherCommitteeId = await addCommittee(
			room.supabase,
			room.conferenceId,
			'General Assembly'
		);

		// The chair already holds the Chair role, whose scope is the committees
		// its holder is assigned to, so a second assignment is all it takes.
		const { error: assigned } = await room.supabase
			.from('committee_chairs')
			.insert({ committee_id: otherCommitteeId, user_id: room.chair.userId });

		if (assigned) throw new Error(`Could not assign the fixture chair: ${assigned.message}`);

		const voteId = await openVote(room);
		await answer(room.chair.supabase, voteId, room.seatId, 'for');
		await closeVote(room.chair.supabase, voteId);
		await runAndEndSession(room.chair.supabase, room.sessionId);

		const { data: moved, error } = await room.chair.supabase
			.from('committee_sessions')
			.update({ committee_id: otherCommitteeId })
			.eq('id', room.sessionId)
			.select('id');

		expect(error).toMatchObject({ code: PERMISSION_DENIED });
		expect(error?.message).toContain('committee it was started in');
		expect(moved).toBeNull();

		const serviceRole = createServiceRoleClient();
		const { data: session } = await serviceRole
			.from('committee_sessions')
			.select('committee_id, status')
			.eq('id', room.sessionId);
		const { data: vote } = await serviceRole
			.from('votes')
			.select('committee_id, session_id, status')
			.eq('id', voteId);

		expect(session).toEqual([{ committee_id: room.committeeId, status: 'ended' }]);
		expect(vote).toEqual([
			{ committee_id: room.committeeId, session_id: room.sessionId, status: 'closed' }
		]);
	});

	it("keeps a chair of two conferences from moving a session, and its roll call, into the other's", async () => {
		const room = await roomWithSession();
		const otherConference = await createConferenceOwnedByMe();
		const otherCommitteeId = await addCommittee(
			otherConference.supabase,
			otherConference.conferenceId
		);
		await addChair(otherConference.supabase, otherCommitteeId, room.chair.userId);

		const voteId = await openVote(room);
		await closeVote(room.chair.supabase, voteId);
		const { data: rollCall, error: taken } = await room.chair.supabase
			.from('roll_calls')
			.insert({ session_id: room.sessionId, taken_by: room.chair.userId })
			.select('id')
			.single();

		if (taken || !rollCall)
			throw new Error(`Could not take the fixture roll call: ${taken?.message}`);

		const { error } = await room.chair.supabase
			.from('committee_sessions')
			.update({ committee_id: otherCommitteeId })
			.eq('id', room.sessionId);

		expect(error).toMatchObject({ code: PERMISSION_DENIED });

		// The roll calls' read rule finds the committee through the session, so a
		// session that moved would have taken its roll call to the other
		// conference's team and out of this one's sight.
		const { data: seenByOwner } = await room.supabase
			.from('roll_calls')
			.select('id')
			.eq('id', rollCall.id);
		const { data: seenByOtherOwner } = await otherConference.supabase
			.from('roll_calls')
			.select('id')
			.eq('id', rollCall.id);

		expect(seenByOwner).toEqual([{ id: rollCall.id }]);
		expect(seenByOtherOwner).toEqual([]);

		// Nor can the other conference's owner remove the session, which they
		// cannot even see, and the closed vote stays.
		const { data: removed } = await otherConference.supabase
			.from('committee_sessions')
			.delete()
			.eq('id', room.sessionId)
			.select('id');
		const { data: vote } = await createServiceRoleClient()
			.from('votes')
			.select('status')
			.eq('id', voteId);

		expect(removed).toEqual([]);
		expect(vote).toEqual([{ status: 'closed' }]);
	});

	it('refuses removing a session with a closed vote even when the remover cannot read that vote', async () => {
		const room = await roomWithSession();
		const voteId = await openVote(room);
		await closeVote(room.chair.supabase, voteId);

		// A scheduled session of another conference's committee, holding a closed
		// vote of this one that the other owner may not read. No browser can make
		// this any more (the session's committee is fixed), so the service role
		// arranges it, as the move the review proved used to.
		const otherConference = await createConferenceOwnedByMe();
		const otherCommitteeId = await addCommittee(
			otherConference.supabase,
			otherConference.conferenceId
		);
		const serviceRole = createServiceRoleClient();
		const { error: arranged } = await serviceRole
			.from('committee_sessions')
			.update({ committee_id: otherCommitteeId })
			.eq('id', room.sessionId);

		if (arranged) throw new Error(`Could not arrange the fixture session: ${arranged.message}`);

		const { data: hidden } = await otherConference.supabase
			.from('votes')
			.select('id')
			.eq('id', voteId);

		expect(hidden).toEqual([]);

		const { error } = await otherConference.supabase
			.from('committee_sessions')
			.delete()
			.eq('id', room.sessionId);

		expect(error).toMatchObject({ code: PERMISSION_DENIED });
		expect(error?.message).toContain('closed vote');

		const { data: vote } = await serviceRole.from('votes').select('status').eq('id', voteId);

		expect(vote).toEqual([{ status: 'closed' }]);
	});

	it('keeps private.session_holds_closed_vote, which the trigger asks, out of the API', async () => {
		const room = await roomWithSession();
		const voteId = await openVote(room);
		await closeVote(room.chair.supabase, voteId);

		// supabase-js types `rpc` by the generated list of API functions, which
		// does not name the helper; the point is that the API does not know it,
		// so it is called by plain name. PGRST202 is PostgREST's "no such
		// function in the schema cache": not refused, not on offer.
		const rpcByName = room.chair.supabase.rpc.bind(room.chair.supabase) as (
			functionName: string,
			functionArgs: Record<string, string>
		) => PromiseLike<{ error: { code: string } | null }>;
		const { error } = await rpcByName('session_holds_closed_vote', {
			session_id: room.sessionId
		});

		expect(error?.code).toBe('PGRST202');
	});
});

describe('A chair can open a vote, only open and without a result (L48)', () => {
	it('refuses a vote inserted already closed with a result', async () => {
		const room = await roomWithSession();

		const { error } = await room.chair.supabase.from('votes').insert({
			committee_id: room.committeeId,
			session_id: room.sessionId,
			kind: 'substantive',
			subject: 'Draft Resolution 1.1',
			status: 'closed',
			votes_for: 9,
			votes_against: 0,
			votes_abstain: 0,
			passed: true,
			closed_at: new Date().toISOString()
		});

		expect(error).toMatchObject({ code: PERMISSION_DENIED });
	});

	it('refuses an open vote that already carries counts or a result', async () => {
		const room = await roomWithSession();

		const { error: withResult } = await room.chair.supabase.from('votes').insert({
			committee_id: room.committeeId,
			session_id: room.sessionId,
			kind: 'substantive',
			subject: 'Draft Resolution 1.1',
			passed: true
		});
		const { error: withCounts } = await room.chair.supabase.from('votes').insert({
			committee_id: room.committeeId,
			session_id: room.sessionId,
			kind: 'substantive',
			subject: 'Draft Resolution 1.1',
			votes_for: 9
		});

		expect(withResult).toMatchObject({ code: PERMISSION_DENIED });
		expect(withCounts).toMatchObject({ code: PERMISSION_DENIED });
	});
});

describe('documents_position_paper_has_review_status (L49)', () => {
	it('refuses a position paper with no review status, even past the policies', async () => {
		const seated = await createSeatedDelegate();

		const { error: byDelegate } = await seated.delegate.supabase
			.from('documents')
			.insert(positionPaperRow(seated, null));
		const { error: byServiceRole } = await createServiceRoleClient()
			.from('documents')
			.insert(positionPaperRow(seated, null));

		expect(byDelegate?.message).toContain('documents_position_paper_has_review_status');
		expect(byServiceRole?.message).toContain('documents_position_paper_has_review_status');
	});

	it('keeps a delegate from clearing the review while replacing the paper (protect_documents_columns)', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createSignedInClient('Chen Wei');
		await addChair(seated.supabase, seated.committeeId, chair.userId);
		const documentId = await uploadPositionPaper(seated);

		const { error: reviewError } = await chair.supabase
			.from('documents')
			.update({
				review_status: 'changes_requested',
				review_comment: 'Please add your sources.',
				reviewed_by: chair.userId,
				reviewed_at: new Date().toISOString()
			})
			.eq('id', documentId);

		expect(reviewError).toBeNull();

		// A new file with the review nulled out: `is_review_reset` used to come
		// out null here and the guard let it through, leaving a paper that was
		// neither submitted nor sent back.
		const { error } = await seated.delegate.supabase
			.from('documents')
			.update({
				storage_path: positionPaperPath(seated),
				file_name: 'position-paper-v2.pdf',
				review_status: null,
				review_comment: null,
				reviewed_by: null,
				reviewed_at: null
			})
			.eq('id', documentId);

		expect(error).not.toBeNull();

		const { data: still } = await seated.supabase
			.from('documents')
			.select('review_status, file_name')
			.eq('id', documentId);

		expect(still).toEqual([
			{ review_status: 'changes_requested', file_name: 'position-paper.pdf' }
		]);
	});
});

describe('Administrators can change a guide or shared file (L50)', () => {
	it('a chair who uploaded the background guide loses it with the Chair role', async () => {
		const room = await createCommitteeRoom();
		const guideId = await uploadDocument(
			room.chair.supabase,
			backgroundGuideRow(room.chair.userId, room.conferenceId, room.committeeId)
		);

		// With the Chair role the chair still changes the guide, as a committee editor.
		const { data: whileChair } = await room.chair.supabase
			.from('documents')
			.update({ title: 'Background guide, second edition' })
			.eq('id', guideId)
			.select('title');

		expect(whileChair).toEqual([{ title: 'Background guide, second edition' }]);

		await takeRolesFrom(room.supabase, room.conferenceId, room.chair.userId);

		// Without it, having uploaded the guide counts for nothing: the policy
		// hides the row, so the update and the delete match nothing.
		const { data: changed } = await room.chair.supabase
			.from('documents')
			.update({ title: 'Mine still' })
			.eq('id', guideId)
			.select('title');
		const { data: removed } = await room.chair.supabase
			.from('documents')
			.delete()
			.eq('id', guideId)
			.select('id');

		expect(changed).toEqual([]);
		expect(removed).toEqual([]);
		expect(await readDocument(room.supabase, guideId)).toEqual([
			{ title: 'Background guide, second edition', file_name: 'background-guide.pdf' }
		]);
	});

	it('a document manager who uploaded a resource loses it with the permission, and the administrator keeps it', async () => {
		const fixture = await createConferenceOwnedByMe();
		const manager = await createSignedInClient('Document Manager');
		const roleId = await addRole(fixture.supabase, fixture.conferenceId, {
			name: 'Documents',
			permissions: ['manage_documents']
		});
		await giveRole(fixture.supabase, fixture.conferenceId, manager.userId, roleId);
		const resourceId = await uploadDocument(
			manager.supabase,
			resourceRow(manager.userId, fixture.conferenceId)
		);

		await takeRolesFrom(fixture.supabase, fixture.conferenceId, manager.userId);

		const { data: changed } = await manager.supabase
			.from('documents')
			.update({ title: 'Mine still' })
			.eq('id', resourceId)
			.select('title');
		const { data: removed } = await manager.supabase
			.from('documents')
			.delete()
			.eq('id', resourceId)
			.select('id');

		expect(changed).toEqual([]);
		expect(removed).toEqual([]);
		expect(await readDocument(fixture.supabase, resourceId)).toEqual([
			{ title: 'Rules of procedure', file_name: 'rules.pdf' }
		]);

		const { data: byAdministrator, error } = await fixture.supabase
			.from('documents')
			.update({ title: 'Rules of procedure, 2027' })
			.eq('id', resourceId)
			.select('title');

		expect(error).toBeNull();
		expect(byAdministrator).toEqual([{ title: 'Rules of procedure, 2027' }]);
	});
});

describe('A delegate can remove their own paper while it waits for review (L50)', () => {
	it('lets the delegate take back a submitted paper, and not an approved one', async () => {
		const seated = await createSeatedDelegate();
		const chair = await createSignedInClient('Chen Wei');
		await addChair(seated.supabase, seated.committeeId, chair.userId);
		const submittedId = await uploadPositionPaper(seated);

		const { data: taken, error } = await seated.delegate.supabase
			.from('documents')
			.delete()
			.eq('id', submittedId)
			.select('id');

		expect(error).toBeNull();
		expect(taken).toEqual([{ id: submittedId }]);

		const approvedId = await uploadPositionPaper(seated);
		const { error: approveError } = await chair.supabase
			.from('documents')
			.update({
				review_status: 'approved',
				reviewed_by: chair.userId,
				reviewed_at: new Date().toISOString()
			})
			.eq('id', approvedId);

		expect(approveError).toBeNull();

		const { data: kept } = await seated.delegate.supabase
			.from('documents')
			.delete()
			.eq('id', approvedId)
			.select('id');

		expect(kept).toEqual([]);
	});
});

describe('protect_documents_columns, a reviewer writes the review only (L51)', () => {
	it("refuses a reviewer changing anything but the review of somebody else's paper", async () => {
		const seated = await createSeatedDelegate();
		const chair = await createSignedInClient('Chen Wei');
		await addChair(seated.supabase, seated.committeeId, chair.userId);
		const documentId = await uploadPositionPaper(seated);

		const { error: retitled } = await chair.supabase
			.from('documents')
			.update({ title: 'Position paper (France), as the chair would have it' })
			.eq('id', documentId);
		const { error: replaced } = await chair.supabase
			.from('documents')
			.update({ storage_path: positionPaperPath(seated), file_name: 'chairs-version.pdf' })
			.eq('id', documentId);

		expect(retitled).toMatchObject({ code: PERMISSION_DENIED });
		expect(retitled?.message).toContain('nothing else of it');
		expect(replaced).toMatchObject({ code: PERMISSION_DENIED });

		const { data: reviewed, error } = await chair.supabase
			.from('documents')
			.update({
				review_status: 'approved',
				review_comment: 'Clear and well sourced.',
				reviewed_by: chair.userId,
				reviewed_at: new Date().toISOString()
			})
			.eq('id', documentId)
			.select('review_status, title, file_name');

		expect(error).toBeNull();
		expect(reviewed).toEqual([
			{ review_status: 'approved', title: 'Position paper', file_name: 'position-paper.pdf' }
		]);
	});

	it("still lets a chair retitle the committee's background guide, which has no review", async () => {
		const room = await createCommitteeRoom();
		const guideId = await uploadDocument(
			room.supabase,
			backgroundGuideRow(room.userId, room.conferenceId, room.committeeId)
		);

		const { data, error } = await room.chair.supabase
			.from('documents')
			.update({ title: 'Background guide, second edition' })
			.eq('id', guideId)
			.select('title');

		expect(error).toBeNull();
		expect(data).toEqual([{ title: 'Background guide, second edition' }]);
	});
});

describe('notify_schedule_changed, the half-hour cool-down (L58)', () => {
	it('tells the audience once about an event moved twice within half an hour, and remembers when', async () => {
		const { organiser, delegate, eventId } = await conferenceWithSoonEvent();

		const { error: first } = await moveEvent(organiser.supabase, eventId, 4);
		const { error: second } = await moveEvent(organiser.supabase, eventId, 5);

		expect(first).toBeNull();
		expect(second).toBeNull();
		expect(await scheduleNotificationCount(delegate)).toBe(1);
		expect(await lastNotifiedAt(eventId)).not.toBeNull();
	});

	it('tells them again once the half hour has passed', async () => {
		const { organiser, delegate, eventId } = await conferenceWithSoonEvent();
		await moveEvent(organiser.supabase, eventId, 4);

		// Half an hour and a minute ago: the trigger wrote the column as the
		// database's own user, and only that user may move it back in time.
		const thirtyOneMinutesAgo = new Date(Date.now() - 31 * MILLISECONDS_PER_MINUTE).toISOString();
		const { error: arranged } = await createServiceRoleClient()
			.from('schedule_events')
			.update({ last_notified_at: thirtyOneMinutesAgo })
			.eq('id', eventId);

		expect(arranged).toBeNull();

		await moveEvent(organiser.supabase, eventId, 5);

		expect(await scheduleNotificationCount(delegate)).toBe(2);
	});

	it('refuses a programme editor writing last_notified_at by hand (guard_schedule_event_notified_at, schedule_events_guard_notified_at)', async () => {
		const { organiser, eventId } = await conferenceWithSoonEvent();
		await moveEvent(organiser.supabase, eventId, 4);

		const { error: cleared } = await organiser.supabase
			.from('schedule_events')
			.update({ last_notified_at: null })
			.eq('id', eventId);
		const { error: inserted } = await organiser.supabase.from('schedule_events').insert({
			conference_id: organiser.conferenceId,
			title: 'Closing ceremony',
			audience: 'everyone',
			starts_at: hoursFromNow(20),
			ends_at: hoursFromNow(21),
			last_notified_at: hoursFromNow(1000)
		});

		expect(cleared).toMatchObject({ code: PERMISSION_DENIED });
		expect(inserted).toMatchObject({ code: PERMISSION_DENIED });
	});
});

describe('the room tables are closed to visitors (L21)', () => {
	it.each(ROOM_TABLES)('refuses a signed-out visitor reading %s at all', async (table) => {
		const { error } = await createVisitorClient().from(table).select('*').limit(1);

		expect(error).toMatchObject({ code: PERMISSION_DENIED });
	});

	it('still lets a signed-in delegate read their room', async () => {
		const room = await roomWithSession();

		const { data, error } = await room.delegate.supabase
			.from('committee_sessions')
			.select('id')
			.eq('id', room.sessionId);

		expect(error).toBeNull();
		expect(data).toEqual([{ id: room.sessionId }]);
	});
});

describe('committee_paper_seats and amendment_seats, heard through their paper and amendment (L22)', () => {
	it('bumps the paper when a seat joins it (touch_paper_for_seat_change, committee_paper_seats_touch_paper)', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startPaper(committee.france, committee.committeeId);
		const before = (await storedPaper(paperId)).updated_at;

		const { error } = await committee.france.supabase.rpc('add_paper_author', {
			paper_id: paperId,
			seat_id: committee.germany.seatId
		});

		expect(error).toBeNull();

		const after = (await storedPaper(paperId)).updated_at;

		expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
	});

	it('bumps the amendment when a sponsor answers (touch_amendment_for_seat_change, amendment_seats_touch_amendment) and when its own row changes (amendments_set_updated_at)', async () => {
		const committee = await createPaperCommittee();
		const spain = await addSeatedDelegate(committee, 'Spain', 'ES');
		const paperId = await introducedDraftWith(committee, spain);
		const amendmentId = await proposeChange(committee.germany, paperId);
		const proposedAt = await amendmentUpdatedAt(amendmentId);

		// France accepts: nothing on the amendment's own row changes yet, since
		// Spain has still to answer, and the answer touches the row all the same.
		const { error: accepted } = await committee.france.supabase.rpc('answer_amendment', {
			amendment_id: amendmentId,
			accepts: true
		});

		expect(accepted).toBeNull();

		const acceptedAt = await amendmentUpdatedAt(amendmentId);

		expect(new Date(acceptedAt).getTime()).toBeGreaterThan(new Date(proposedAt).getTime());

		// Spain declines: the amendment is unfriendly, and the proposer alone is
		// the support a committee this small needs (10% of its seats), so it goes
		// straight to the dais. That is a change to its own row, which stamps the
		// column like any other.
		const { error: declined } = await spain.supabase.rpc('answer_amendment', {
			amendment_id: amendmentId,
			accepts: false
		});

		expect(declined).toBeNull();

		const { data: moved } = await createServiceRoleClient()
			.from('amendments')
			.select('status, updated_at')
			.eq('id', amendmentId)
			.single();

		expect(moved?.status).toBe('with_the_dais');
		expect(new Date(moved?.updated_at ?? 0).getTime()).toBeGreaterThan(
			new Date(acceptedAt).getTime()
		);
	});

	it('keeps both seat tables out of the realtime publication, and the paper and the amendment in it', async () => {
		const person = await createSignedInClient('Realtime Listener');

		expect(await realtimeAnswerTo(person, 'committee_paper_seats')).toBe('error');
		expect(await realtimeAnswerTo(person, 'amendment_seats')).toBe('error');
		expect(await realtimeAnswerTo(person, 'committee_papers')).toBe('ok');
		expect(await realtimeAnswerTo(person, 'amendments')).toBe('ok');
	});
});
