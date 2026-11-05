import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
	createSignedInClient,
	createVisitorClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addChair,
	addCommittee,
	addSeat,
	addSession,
	addStaff,
	createCommitteeRoom,
	giveSeatTo,
	type CommitteeRoomFixture
} from './conference-fixtures';

// The ten committee room rows of the policy matrix in
// specs/02-architecture/permissions.md -- `committee_sessions`,
// `committee_state`, `roll_calls`, `roll_call_entries`, `speakers_lists`,
// `speakers_list_entries`, `motions`, `votes`, `vote_entries` and
// `chair_notes` -- plus the `create_committee_state` trigger, the two check
// constraints these tables carry and the two composite primary keys that stop
// a seat being counted twice. specs/06-features/chairing.md has the same rules
// in words, and specs/02-architecture/data-model.md has the columns.
//
// Almost every rule here comes in two halves. The first asks "are you a chair
// of this committee?", and the second asks "does the seat, session or motion
// you are naming belong to the same committee as the row?". The second half is
// the one that would be quietly missing without a test, so most of the
// refusals below are a chair of one committee reaching into another.
//
// The two shapes a refusal takes, both of which appear below:
//
//   * a refused insert, or an update whose `with check` half fails, comes back
//     as an error, because Postgres raises on it. Those tests ask for the words
//     "row-level security" in the message rather than for any error at all, so
//     that a refusal from somewhere else -- a foreign key, a check constraint,
//     a duplicate key -- cannot make one of them pass for the wrong reason;
//   * a refused select, and a refused update or delete of a row the caller
//     cannot see, comes back as an empty answer with no error, because a
//     policy hides rows rather than complaining about them. Those tests read
//     the row back with a client that can see it, to prove nothing moved.

// How long each speaker gets on a fixture speakers list. Any number works: it
// is only ever read back to prove which list was written.
const FIXTURE_SPEAKING_TIME_SECONDS = 90;

// How long a fixture moderated caucus lasts in total.
const FIXTURE_TOTAL_TIME_SECONDS = 600;

// How long a listener may wait to hear a change through realtime.
const REALTIME_TIMEOUT_MS = 10_000;

// How often a listener that has heard nothing yet gets another roll call.
const REALTIME_RETRY_MS = 1_000;

// What a fixture substantive vote is about. MVP votes name their subject in
// free text, because there is no draft resolution document to point at yet.
const FIXTURE_VOTE_SUBJECT = 'Draft Resolution 1.1';

/**
 * A stored `timestamptz` spelled the way JavaScript spells a moment. Postgres
 * hands one back as "2026-09-21T06:09:05.298+00:00" where `toISOString()`
 * writes "2026-09-21T06:09:05.298Z", so a test that sends a moment and reads it
 * back has to compare the two as moments rather than as text.
 */
function momentOf(stored: string): string {
	return new Date(stored).toISOString();
}

/**
 * One roll call of a session, through a chair's own client so that the
 * `roll_calls` insert policy has to allow it.
 *
 * `taken_by` is left out, because the column defaults to `auth.uid()` and the
 * insert policy refuses any other value: whoever takes a roll call is who it
 * says took it.
 */
async function addRollCall(chair: SupabaseClient, sessionId: string): Promise<string> {
	const { data, error } = await chair
		.from('roll_calls')
		.insert({ session_id: sessionId })
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the fixture roll call: ${error?.message}`);
	}

	return data.id;
}

/**
 * One proposed motion, through a chair's own client. `proposedBySeatId` is
 * null for a motion the chair proposed themselves, which is what the nullable
 * column means.
 */
async function addMotion(
	chair: SupabaseClient,
	committeeId: string,
	sessionId: string,
	proposedBySeatId: string | null = null
): Promise<string> {
	const { data, error } = await chair
		.from('motions')
		.insert({
			committee_id: committeeId,
			session_id: sessionId,
			proposed_by_seat_id: proposedBySeatId,
			kind: 'moderated_caucus',
			topic: 'The situation in the fixture',
			total_time_seconds: FIXTURE_TOTAL_TIME_SECONDS,
			speaking_time_seconds: FIXTURE_SPEAKING_TIME_SECONDS
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the fixture motion: ${error?.message}`);
	}

	return data.id;
}

/**
 * One speakers list, through a chair's own client. With no `motionId` it is
 * the General Speakers' List of the session; with one it is that caucus's
 * list. Every writer names the kind of list it opens (S9), and
 * `speakers_lists_caucus_has_motion` holds a caucus's list to its motion.
 */
async function addSpeakersList(
	chair: SupabaseClient,
	committeeId: string,
	sessionId: string,
	motionId: string | null = null
): Promise<string> {
	const { data, error } = await chair
		.from('speakers_lists')
		.insert({
			committee_id: committeeId,
			session_id: sessionId,
			motion_id: motionId,
			kind: motionId === null ? 'general' : 'caucus',
			name: motionId === null ? "General Speakers' List" : 'Moderated caucus',
			speaking_time_seconds: FIXTURE_SPEAKING_TIME_SECONDS
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the fixture speakers list: ${error?.message}`);
	}

	return data.id;
}

/** One seat's turn on a speakers list, through a chair's own client. */
async function addSpeakersListEntry(
	chair: SupabaseClient,
	speakersListId: string,
	seatId: string,
	position = 0
): Promise<string> {
	const { data, error } = await chair
		.from('speakers_list_entries')
		.insert({ speakers_list_id: speakersListId, seat_id: seatId, position })
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the fixture speakers list entry: ${error?.message}`);
	}

	return data.id;
}

/** What `addVote` may be told to do differently. */
type VoteOptions = {
	/** `'substantive'` by default, the vote on a draft resolution. */
	kind?: 'procedural' | 'substantive';
	subject?: string | null;
	/** Set on the procedural vote that decides a motion. */
	motionId?: string | null;
	/** `'roll_call'` by default, because that is the method with entries. */
	method?: 'show_of_hands' | 'roll_call';
};

/** One open vote, through a chair's own client. */
async function addVote(
	chair: SupabaseClient,
	committeeId: string,
	sessionId: string,
	options: VoteOptions = {}
): Promise<string> {
	const { data, error } = await chair
		.from('votes')
		.insert({
			committee_id: committeeId,
			session_id: sessionId,
			kind: options.kind ?? 'substantive',
			subject: options.subject === undefined ? FIXTURE_VOTE_SUBJECT : options.subject,
			motion_id: options.motionId ?? null,
			method: options.method ?? 'roll_call'
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the fixture vote: ${error?.message}`);
	}

	return data.id;
}

/** One chair's note about one seat, through that chair's own client. */
async function addChairNote(
	chair: SupabaseClient,
	committeeId: string,
	seatId: string,
	body = 'Spoke well on the first clause.'
): Promise<string> {
	const { data, error } = await chair
		.from('chair_notes')
		.insert({ committee_id: committeeId, seat_id: seatId, body })
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the fixture chair note: ${error?.message}`);
	}

	return data.id;
}

/** The other side of every cross-committee rule in this file. */
type OtherCommitteeFixture = {
	committeeId: string;
	/** A seat of that committee, which nobody holds. */
	seatId: string;
	/** A client signed in as a chair of that committee and of no other. */
	chair: SignedInClient;
	/** A session of that committee, started by its own chair. */
	sessionId: string;
};

/**
 * A second committee of the same conference, with its own chair, one seat and
 * one session.
 *
 * It is a second committee of the *same* conference on purpose. A chair of
 * another conference would be turned away by the "are you a chair here?" half
 * of every policy on its own, so it would prove nothing about the half these
 * tests are really about: whether the seat, session or motion a row names
 * belongs to the same committee the row does.
 */
async function addOtherCommittee(fixture: CommitteeRoomFixture): Promise<OtherCommitteeFixture> {
	const committeeId = await addCommittee(
		fixture.supabase,
		fixture.conferenceId,
		'Human Rights Council'
	);
	const seatId = await addSeat(fixture.supabase, committeeId, 'Brazil', 'BR');

	const chair = await createSignedInClient('Fixture Other Chair');
	await addChair(fixture.supabase, committeeId, chair.userId);

	const sessionId = await addSession(chair.supabase, committeeId, 'Their Session I');

	return { committeeId, seatId, chair, sessionId };
}

/**
 * Somebody on the conference team who chairs nothing and holds no seat. When
 * they can read a row, it is the staff half of a select rule answering and not
 * the chair or delegate half.
 */
async function addVolunteer(fixture: CommitteeRoomFixture): Promise<SignedInClient> {
	const volunteer = await createSignedInClient('Fixture Volunteer');

	await addStaff(fixture.supabase, fixture.conferenceId, volunteer.userId, 'volunteer');

	return volunteer;
}

// -----------------------------------------------------------------------------
// committee_sessions
// -----------------------------------------------------------------------------
// permissions.md: `committee_sessions` is read by "deleg., staff", written by
// "chair", and deleted by "chair, while `scheduled`".

describe('committee_sessions, who may read one', () => {
	it('shows a session to a delegate of the committee', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);

		const { data, error } = await room.delegate.supabase
			.from('committee_sessions')
			.select('name')
			.eq('id', sessionId);

		expect(error).toBeNull();
		expect(data).toEqual([{ name: 'Session I' }]);
	});

	it('shows a session to a volunteer on the conference team', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const volunteer = await addVolunteer(room);

		const { data, error } = await volunteer.supabase
			.from('committee_sessions')
			.select('name')
			.eq('id', sessionId);

		expect(error).toBeNull();
		expect(data).toEqual([{ name: 'Session I' }]);
	});

	it('hides a session from a delegate of another committee of the same conference', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const other = await addOtherCommittee(room);

		const otherDelegate = await createSignedInClient('Fixture Other Delegate');
		await giveSeatTo(room.supabase, other.seatId, otherDelegate.userId);

		const { data, error } = await otherDelegate.supabase
			.from('committee_sessions')
			.select('name')
			.eq('id', sessionId);

		expect(error).toBeNull();
		expect(data).toEqual([]);
	});

	it('hides a session from a signed-in stranger and from a visitor', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const stranger = await createSignedInClient('Fixture Stranger');

		const { data: strangerSees } = await stranger.supabase
			.from('committee_sessions')
			.select('name')
			.eq('id', sessionId);

		expect(strangerSees).toEqual([]);

		// Both select policies are `to authenticated`, and since 20261022142000
		// (security review L21) the room's tables are not granted to visitors at
		// all, because a realtime delete would otherwise reach them. So somebody
		// who is not signed in is refused outright rather than shown an empty
		// list; security-room-documents-guards.test.ts asks the same of all nine.
		const visitor = createVisitorClient();
		const { data: visitorSees, error: visitorError } = await visitor
			.from('committee_sessions')
			.select('name')
			.eq('id', sessionId);

		expect(visitorSees).toBeNull();
		expect(visitorError).toMatchObject({ code: '42501' });
	});
});

// The write half of the same row of permissions.md: a chair starts a session
// and changes it, and the delete column, "chair, while `scheduled`", is the one
// place in the committee room where a policy asks about a status.
describe('committee_sessions, who may write one', () => {
	it('lets a chair start a session and then say it is running', async () => {
		const room = await createCommitteeRoom();

		const { data: started, error } = await room.chair.supabase
			.from('committee_sessions')
			.insert({ committee_id: room.committeeId, name: 'Session II' })
			.select('id, name, status')
			.single();

		expect(error).toBeNull();
		expect(started?.name).toBe('Session II');
		expect(started?.status).toBe('scheduled');

		const { data: running } = await room.chair.supabase
			.from('committee_sessions')
			.update({ status: 'in_progress', started_at: new Date().toISOString() })
			.eq('id', started?.id)
			.select('status');

		expect(running).toEqual([{ status: 'in_progress' }]);
	});

	it('refuses a delegate who tries to start a session', async () => {
		const room = await createCommitteeRoom();

		const { error } = await room.delegate.supabase
			.from('committee_sessions')
			.insert({ committee_id: room.committeeId, name: 'Delegate Session' });

		expect(error?.message).toContain('row-level security');
	});

	it('refuses a delegate who tries to change a session', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);

		const { data: changed, error } = await room.delegate.supabase
			.from('committee_sessions')
			.update({ name: 'Renamed by a delegate' })
			.eq('id', sessionId)
			.select('name');

		expect(error).toBeNull();
		expect(changed).toEqual([]);

		const { data: still } = await room.chair.supabase
			.from('committee_sessions')
			.select('name')
			.eq('id', sessionId);

		expect(still).toEqual([{ name: 'Session I' }]);
	});

	it('lets a chair remove a session that has not started', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);

		const { error } = await room.chair.supabase
			.from('committee_sessions')
			.delete()
			.eq('id', sessionId);

		expect(error).toBeNull();

		const { data: left } = await room.chair.supabase
			.from('committee_sessions')
			.select('name')
			.eq('id', sessionId);

		expect(left).toEqual([]);
	});

	it('refuses a chair who tries to remove a session that is running or over', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);

		// A session that has begun is a record of what happened in the room, so
		// the delete policy only matches one that is still `scheduled`. The chair
		// may read the row, so the delete is not an error: it matches no row.
		for (const status of ['in_progress', 'ended']) {
			await room.chair.supabase.from('committee_sessions').update({ status }).eq('id', sessionId);

			const { data: removed, error } = await room.chair.supabase
				.from('committee_sessions')
				.delete()
				.eq('id', sessionId)
				.select('id');

			expect(error).toBeNull();
			expect(removed).toEqual([]);

			const { data: still } = await room.chair.supabase
				.from('committee_sessions')
				.select('status')
				.eq('id', sessionId);

			expect(still).toEqual([{ status }]);
		}
	});
});

// -----------------------------------------------------------------------------
// roll_calls
// -----------------------------------------------------------------------------
// permissions.md: `roll_calls` and `roll_call_entries` are read by "deleg.,
// staff" and written by "chair". Every policy here asks about the roll call's
// session rather than about a committee of its own, so reading a roll call is
// the same question as reading its session.

describe('roll_calls, who is in the room', () => {
	it('lets a chair take a roll call and a delegate read it', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);

		const { data: taken, error } = await room.chair.supabase
			.from('roll_calls')
			.insert({ session_id: sessionId, taken_by: room.chair.userId })
			.select('id')
			.single();

		expect(error).toBeNull();

		const { data: seen } = await room.delegate.supabase
			.from('roll_calls')
			.select('taken_by')
			.eq('id', taken?.id);

		expect(seen).toEqual([{ taken_by: room.chair.userId }]);
	});

	it('refuses a delegate who tries to take a roll call', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);

		const { error } = await room.delegate.supabase
			.from('roll_calls')
			.insert({ session_id: sessionId, taken_by: room.delegate.userId });

		expect(error?.message).toContain('row-level security');
	});

	it('refuses a chair recording a roll call as taken by somebody else', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);

		// `taken_by` is what says who counted the room, so the insert policy pins
		// it to the caller the way `chair_notes.author_id` is pinned. Without
		// that, a chair could record the attendance against the delegate they
		// were marking absent.
		const { error } = await room.chair.supabase
			.from('roll_calls')
			.insert({ session_id: sessionId, taken_by: room.delegate.userId });

		expect(error?.message).toContain('row-level security');

		const { data: left } = await room.chair.supabase
			.from('roll_calls')
			.select('id')
			.eq('session_id', sessionId);

		expect(left).toEqual([]);
	});

	it("refuses a chair taking a roll call on another committee's session", async () => {
		const room = await createCommitteeRoom();
		const other = await addOtherCommittee(room);

		// This is the chained rule the policy's sub-select exists for. The chair
		// of one committee is a real chair, so the first half of the question is
		// satisfied; the session belongs to somebody else's room, which is what
		// has to turn them away.
		const { error } = await room.chair.supabase
			.from('roll_calls')
			.insert({ session_id: other.sessionId });

		expect(error?.message).toContain('row-level security');
	});

	it('hides a roll call from a signed-in stranger', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const rollCallId = await addRollCall(room.chair.supabase, sessionId);
		const stranger = await createSignedInClient('Fixture Stranger');

		const { data, error } = await stranger.supabase
			.from('roll_calls')
			.select('id')
			.eq('id', rollCallId);

		expect(error).toBeNull();
		expect(data).toEqual([]);
	});

	it('lets a chair change a roll call and then remove it', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const rollCallId = await addRollCall(room.chair.supabase, sessionId);

		const retakenAt = new Date().toISOString();
		const { data: retaken, error: updateError } = await room.chair.supabase
			.from('roll_calls')
			.update({ taken_at: retakenAt })
			.eq('id', rollCallId)
			.select('taken_at')
			.single();

		expect(updateError).toBeNull();
		expect(momentOf(retaken?.taken_at)).toBe(retakenAt);

		const { error: deleteError } = await room.chair.supabase
			.from('roll_calls')
			.delete()
			.eq('id', rollCallId);

		expect(deleteError).toBeNull();

		const { data: left } = await room.chair.supabase
			.from('roll_calls')
			.select('id')
			.eq('id', rollCallId);

		expect(left).toEqual([]);
	});

	it('refuses a chair handing a roll call to somebody else on an update', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const rollCallId = await addRollCall(room.chair.supabase, sessionId);

		// The update policy pins `taken_by` the same way the insert policy does,
		// so a co-chair who corrects a roll call becomes the chair it is recorded
		// against and nobody can put a name on it that never counted the room.
		const { error } = await room.chair.supabase
			.from('roll_calls')
			.update({ taken_by: room.delegate.userId })
			.eq('id', rollCallId);

		expect(error?.message).toContain('row-level security');

		const { data: still } = await room.chair.supabase
			.from('roll_calls')
			.select('taken_by')
			.eq('id', rollCallId);

		expect(still).toEqual([{ taken_by: room.chair.userId }]);
	});

	it('refuses a delegate who tries to change or remove a roll call', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const rollCallId = await addRollCall(room.chair.supabase, sessionId);

		const { data: changed } = await room.delegate.supabase
			.from('roll_calls')
			.update({ taken_by: room.delegate.userId })
			.eq('id', rollCallId)
			.select('id');

		expect(changed).toEqual([]);

		const { data: removed } = await room.delegate.supabase
			.from('roll_calls')
			.delete()
			.eq('id', rollCallId)
			.select('id');

		expect(removed).toEqual([]);

		const { data: still } = await room.chair.supabase
			.from('roll_calls')
			.select('taken_by')
			.eq('id', rollCallId);

		expect(still).toEqual([{ taken_by: room.chair.userId }]);
	});

	it('tells a delegate listening to the session about a new roll call', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);

		// The room's screens hear a new roll call through realtime, the way
		// `$lib/committee-room-live.ts` listens. Only a table in the
		// `supabase_realtime` publication is heard at all, which is what
		// `20260923200000_publish_roll_calls.sql` adds `roll_calls` to, and the
		// listener's own read policy still decides whether it may see the row.
		const heardRollCallId = await new Promise<string>((resolve, reject) => {
			// The channel's latest status, so a listener that heard nothing says
			// how far it got.
			let lastStatus = 'not subscribed yet';
			// Set once the channel is listening; see `addRollCallsUntilHeard`.
			let retry: ReturnType<typeof setInterval> | undefined;
			const giveUp = setTimeout(
				() => stop(new Error(`No roll call was heard (channel: ${lastStatus}).`)),
				REALTIME_TIMEOUT_MS
			);

			/** Stop listening, and fail the test when there is a reason to. */
			function stop(failure: Error | null) {
				clearTimeout(giveUp);
				clearInterval(retry);
				void room.delegate.supabase.removeChannel(channel);
				if (failure) reject(failure);
			}

			/** Add a roll call, failing the test when the insert itself fails. */
			function addOneRollCall() {
				addRollCall(room.chair.supabase, sessionId).catch((insertError: Error) =>
					stop(insertError)
				);
			}

			// `pnpm db:reset` restarts Realtime, and the first listener after that
			// can be told "SUBSCRIBED" a moment before the server starts reading
			// the database's changes, so a roll call added in that moment is never
			// sent. Another one every second until one is heard keeps the test to
			// its point: a published, readable roll call reaches the delegate.
			function addRollCallsUntilHeard() {
				addOneRollCall();
				retry = setInterval(addOneRollCall, REALTIME_RETRY_MS);
			}

			// `wait: true` holds back "SUBSCRIBED" until the server is really
			// listening to the table. Without it "SUBSCRIBED" can come first, and
			// a roll call added straight away is then missed when the machine is
			// busy, as it is while every check runs at once.
			const channel = room.delegate.supabase
				.channel(`roll-calls-${sessionId}`, {
					config: { postgres_changes_options: { wait: true } }
				})
				.on(
					'postgres_changes',
					{
						event: 'INSERT',
						schema: 'public',
						table: 'roll_calls',
						filter: `session_id=eq.${sessionId}`
					},
					(change) => {
						stop(null);
						resolve(String(change.new.id));
					}
				)
				.subscribe((status, error) => {
					lastStatus = error ? `${status}: ${error.message}` : status;

					if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
						stop(new Error(`The delegate could not listen (${lastStatus}).`));
						return;
					}

					if (status === 'SUBSCRIBED') addRollCallsUntilHeard();
				});
		});

		const { data: taken } = await room.chair.supabase
			.from('roll_calls')
			.select('id')
			.eq('session_id', sessionId);
		const takenIds = (taken ?? []).map((rollCall) => rollCall.id);

		// What was heard is one of the roll calls the chair really added.
		expect(takenIds).toContain(heardRollCallId);
	});
});

// -----------------------------------------------------------------------------
// roll_call_entries
// -----------------------------------------------------------------------------
// The same permissions.md row as `roll_calls`, one level down, plus the
// `(roll_call_id, seat_id)` primary key that stops a seat being counted twice
// in the same roll call.

describe('roll_call_entries, marking the seats', () => {
	it('lets a chair mark a seat of their own committee present', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const rollCallId = await addRollCall(room.chair.supabase, sessionId);

		const { data, error } = await room.chair.supabase
			.from('roll_call_entries')
			.insert({ roll_call_id: rollCallId, seat_id: room.seatId, status: 'present_and_voting' })
			.select('status');

		expect(error).toBeNull();
		expect(data).toEqual([{ status: 'present_and_voting' }]);
	});

	it('refuses a chair marking a seat of another committee', async () => {
		const room = await createCommitteeRoom();
		const other = await addOtherCommittee(room);
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const rollCallId = await addRollCall(room.chair.supabase, sessionId);

		// This is the `seat.committee_id = session.committee_id` half of the
		// insert policy. Without it a chair could mark another committee's
		// delegate present, and that delegate's name would appear in the wrong
		// room's attendance and in its quorum.
		const { error } = await room.chair.supabase
			.from('roll_call_entries')
			.insert({ roll_call_id: rollCallId, seat_id: other.seatId, status: 'present' });

		expect(error?.message).toContain('row-level security');
	});

	it('shows the marks to a delegate of the committee and refuses their writes', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const rollCallId = await addRollCall(room.chair.supabase, sessionId);

		await room.chair.supabase
			.from('roll_call_entries')
			.insert({ roll_call_id: rollCallId, seat_id: room.seatId, status: 'present' });

		const { data: seen, error: readError } = await room.delegate.supabase
			.from('roll_call_entries')
			.select('status')
			.eq('roll_call_id', rollCallId);

		expect(readError).toBeNull();
		expect(seen).toEqual([{ status: 'present' }]);

		// Attendance is the chair's to record. A delegate cannot mark themselves
		// present, which is why the insert is an error and not an empty answer.
		const secondSeatId = await addSeat(room.supabase, room.committeeId, 'Kenya', 'KE');
		const { error: insertError } = await room.delegate.supabase
			.from('roll_call_entries')
			.insert({ roll_call_id: rollCallId, seat_id: secondSeatId, status: 'present' });

		expect(insertError?.message).toContain('row-level security');
	});

	it('hides the marks from a signed-in stranger', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const rollCallId = await addRollCall(room.chair.supabase, sessionId);
		const stranger = await createSignedInClient('Fixture Stranger');

		await room.chair.supabase
			.from('roll_call_entries')
			.insert({ roll_call_id: rollCallId, seat_id: room.seatId, status: 'present' });

		const { data } = await stranger.supabase
			.from('roll_call_entries')
			.select('status')
			.eq('roll_call_id', rollCallId);

		expect(data).toEqual([]);
	});

	it('lets a chair change a mark and take it off again', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const rollCallId = await addRollCall(room.chair.supabase, sessionId);

		await room.chair.supabase
			.from('roll_call_entries')
			.insert({ roll_call_id: rollCallId, seat_id: room.seatId, status: 'absent' });

		const { data: changed, error: updateError } = await room.chair.supabase
			.from('roll_call_entries')
			.update({ status: 'present' })
			.eq('roll_call_id', rollCallId)
			.eq('seat_id', room.seatId)
			.select('status');

		expect(updateError).toBeNull();
		expect(changed).toEqual([{ status: 'present' }]);

		const { error: deleteError } = await room.chair.supabase
			.from('roll_call_entries')
			.delete()
			.eq('roll_call_id', rollCallId)
			.eq('seat_id', room.seatId);

		expect(deleteError).toBeNull();

		const { data: left } = await room.chair.supabase
			.from('roll_call_entries')
			.select('status')
			.eq('roll_call_id', rollCallId);

		expect(left).toEqual([]);
	});

	it('refuses a delegate who tries to change or remove a mark', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const rollCallId = await addRollCall(room.chair.supabase, sessionId);

		await room.chair.supabase
			.from('roll_call_entries')
			.insert({ roll_call_id: rollCallId, seat_id: room.seatId, status: 'absent' });

		const { data: changed } = await room.delegate.supabase
			.from('roll_call_entries')
			.update({ status: 'present_and_voting' })
			.eq('roll_call_id', rollCallId)
			.eq('seat_id', room.seatId)
			.select('status');

		expect(changed).toEqual([]);

		const { data: removed } = await room.delegate.supabase
			.from('roll_call_entries')
			.delete()
			.eq('roll_call_id', rollCallId)
			.eq('seat_id', room.seatId)
			.select('status');

		expect(removed).toEqual([]);

		const { data: still } = await room.chair.supabase
			.from('roll_call_entries')
			.select('status')
			.eq('roll_call_id', rollCallId);

		expect(still).toEqual([{ status: 'absent' }]);
	});

	it('refuses a second mark for the same seat in the same roll call', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const rollCallId = await addRollCall(room.chair.supabase, sessionId);

		await room.chair.supabase
			.from('roll_call_entries')
			.insert({ roll_call_id: rollCallId, seat_id: room.seatId, status: 'present' });

		// The pair of ids is the row's identity, so changing a seat's attendance
		// is an update of the row that is there and never a second row. A seat
		// counted twice would break every count the room makes.
		const { error } = await room.chair.supabase
			.from('roll_call_entries')
			.insert({ roll_call_id: rollCallId, seat_id: room.seatId, status: 'absent' });

		expect(error?.message).toContain('roll_call_entries_pkey');
	});
});

// -----------------------------------------------------------------------------
// motions
// -----------------------------------------------------------------------------
// permissions.md: `motions` is read by "deleg., staff" and written by "chair".
// The insert and update policies also check that the session and the proposing
// seat belong to the same committee the motion does.

describe('motions, what the committee is asked to do', () => {
	it('lets a chair write down their own motion, with no proposing seat', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);

		// A null `proposed_by_seat_id` is how a chair-initiated caucus or an
		// adjournment is written: nobody in the room proposed it.
		const { data, error } = await room.chair.supabase
			.from('motions')
			.insert({
				committee_id: room.committeeId,
				session_id: sessionId,
				kind: 'adjourn_meeting'
			})
			.select('kind, status, proposed_by_seat_id');

		expect(error).toBeNull();
		expect(data).toEqual([
			{ kind: 'adjourn_meeting', status: 'proposed', proposed_by_seat_id: null }
		]);
	});

	it('lets a chair write down a motion proposed by a seat of their committee', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);

		const { data, error } = await room.chair.supabase
			.from('motions')
			.insert({
				committee_id: room.committeeId,
				session_id: sessionId,
				proposed_by_seat_id: room.seatId,
				kind: 'moderated_caucus',
				topic: 'The situation in the fixture',
				total_time_seconds: FIXTURE_TOTAL_TIME_SECONDS,
				speaking_time_seconds: FIXTURE_SPEAKING_TIME_SECONDS
			})
			.select('topic, proposed_by_seat_id');

		expect(error).toBeNull();
		expect(data).toEqual([
			{ topic: 'The situation in the fixture', proposed_by_seat_id: room.seatId }
		]);
	});

	it("refuses a motion hung off another committee's session", async () => {
		const room = await createCommitteeRoom();
		const other = await addOtherCommittee(room);

		// The motion would otherwise appear in this room and in the other
		// committee's history at the same time.
		const { error } = await room.chair.supabase.from('motions').insert({
			committee_id: room.committeeId,
			session_id: other.sessionId,
			kind: 'suspend_meeting'
		});

		expect(error?.message).toContain('row-level security');
	});

	it("refuses a motion proposed by another committee's seat", async () => {
		const room = await createCommitteeRoom();
		const other = await addOtherCommittee(room);
		const sessionId = await addSession(room.chair.supabase, room.committeeId);

		// The motion would otherwise name a delegate who is not in the room.
		const { error } = await room.chair.supabase.from('motions').insert({
			committee_id: room.committeeId,
			session_id: sessionId,
			proposed_by_seat_id: other.seatId,
			kind: 'suspend_meeting'
		});

		expect(error?.message).toContain('row-level security');
	});

	it('shows a motion to a delegate of the committee and to a volunteer on the team', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const motionId = await addMotion(room.chair.supabase, room.committeeId, sessionId);
		const volunteer = await addVolunteer(room);

		const { data: delegateSees, error } = await room.delegate.supabase
			.from('motions')
			.select('topic')
			.eq('id', motionId);

		expect(error).toBeNull();
		expect(delegateSees).toEqual([{ topic: 'The situation in the fixture' }]);

		const { data: volunteerSees } = await volunteer.supabase
			.from('motions')
			.select('topic')
			.eq('id', motionId);

		expect(volunteerSees).toEqual([{ topic: 'The situation in the fixture' }]);
	});

	it('hides a motion from a signed-in stranger', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const motionId = await addMotion(room.chair.supabase, room.committeeId, sessionId);
		const stranger = await createSignedInClient('Fixture Stranger');

		const { data } = await stranger.supabase.from('motions').select('topic').eq('id', motionId);

		expect(data).toEqual([]);
	});

	it('refuses a delegate who tries to write a motion', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);

		// A delegate raises a motion by speaking. It is the chair who types it in.
		const { error } = await room.delegate.supabase.from('motions').insert({
			committee_id: room.committeeId,
			session_id: sessionId,
			proposed_by_seat_id: room.seatId,
			kind: 'unmoderated_caucus'
		});

		expect(error?.message).toContain('row-level security');
	});

	it('lets a chair decide a motion', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const motionId = await addMotion(room.chair.supabase, room.committeeId, sessionId);

		const decidedAt = new Date().toISOString();
		const { data, error } = await room.chair.supabase
			.from('motions')
			.update({ status: 'passed', votes_for: 9, votes_against: 4, decided_at: decidedAt })
			.eq('id', motionId)
			.select('status, votes_for, votes_against, decided_at')
			.single();

		expect(error).toBeNull();
		expect(data?.status).toBe('passed');
		expect(data?.votes_for).toBe(9);
		expect(data?.votes_against).toBe(4);
		expect(momentOf(data?.decided_at)).toBe(decidedAt);
	});

	it('refuses a delegate who tries to decide or remove a motion', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const motionId = await addMotion(room.chair.supabase, room.committeeId, sessionId);

		const { data: decided } = await room.delegate.supabase
			.from('motions')
			.update({ status: 'passed' })
			.eq('id', motionId)
			.select('status');

		expect(decided).toEqual([]);

		const { data: removed } = await room.delegate.supabase
			.from('motions')
			.delete()
			.eq('id', motionId)
			.select('status');

		expect(removed).toEqual([]);

		const { data: still } = await room.chair.supabase
			.from('motions')
			.select('status')
			.eq('id', motionId);

		expect(still).toEqual([{ status: 'proposed' }]);
	});

	it('lets a chair remove a motion', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const motionId = await addMotion(room.chair.supabase, room.committeeId, sessionId);

		const { error } = await room.chair.supabase.from('motions').delete().eq('id', motionId);

		expect(error).toBeNull();

		const { data: left } = await room.chair.supabase
			.from('motions')
			.select('id')
			.eq('id', motionId);

		expect(left).toEqual([]);
	});
});

// -----------------------------------------------------------------------------
// speakers_lists
// -----------------------------------------------------------------------------
// permissions.md: `speakers_lists` and `speakers_list_entries` are read by
// "deleg., staff" and written by "chair", and the insert policy also checks
// that the session and the motion belong to the committee the list does.

describe('speakers_lists, who speaks and for how long', () => {
	it("lets a chair open the General Speakers' List, which has no motion", async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);

		const { data, error } = await room.chair.supabase
			.from('speakers_lists')
			.insert({
				committee_id: room.committeeId,
				session_id: sessionId,
				kind: 'general',
				name: "General Speakers' List",
				speaking_time_seconds: FIXTURE_SPEAKING_TIME_SECONDS
			})
			.select('name, motion_id, is_open');

		expect(error).toBeNull();
		expect(data).toEqual([{ name: "General Speakers' List", motion_id: null, is_open: true }]);
	});

	it('lets a chair open a caucus list pointing at a motion of the same committee', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const motionId = await addMotion(room.chair.supabase, room.committeeId, sessionId);

		const { data, error } = await room.chair.supabase
			.from('speakers_lists')
			.insert({
				committee_id: room.committeeId,
				session_id: sessionId,
				motion_id: motionId,
				kind: 'caucus',
				name: 'Moderated caucus',
				speaking_time_seconds: FIXTURE_SPEAKING_TIME_SECONDS
			})
			.select('name, motion_id');

		expect(error).toBeNull();
		expect(data).toEqual([{ name: 'Moderated caucus', motion_id: motionId }]);
	});

	it("refuses a list pointing at another committee's motion", async () => {
		const room = await createCommitteeRoom();
		const other = await addOtherCommittee(room);
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const otherMotionId = await addMotion(other.chair.supabase, other.committeeId, other.sessionId);

		const { error } = await room.chair.supabase.from('speakers_lists').insert({
			committee_id: room.committeeId,
			session_id: sessionId,
			motion_id: otherMotionId,
			kind: 'caucus',
			name: 'Moderated caucus',
			speaking_time_seconds: FIXTURE_SPEAKING_TIME_SECONDS
		});

		expect(error?.message).toContain('row-level security');
	});

	it("refuses a chair moving an existing list onto another committee's motion", async () => {
		const room = await createCommitteeRoom();
		const other = await addOtherCommittee(room);
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		// A caucus's own list, so that pointing it at another motion is refused by
		// the policy and not by `speakers_lists_caucus_has_motion`.
		const motionId = await addMotion(room.chair.supabase, room.committeeId, sessionId);
		const listId = await addSpeakersList(
			room.chair.supabase,
			room.committeeId,
			sessionId,
			motionId
		);
		const otherMotionId = await addMotion(other.chair.supabase, other.committeeId, other.sessionId);

		// The update policy asks the same question about the motion as the insert
		// policy does. Without that half, a chair could open a list the rules
		// allow and then point it somewhere the rules do not.
		const { error } = await room.chair.supabase
			.from('speakers_lists')
			.update({ motion_id: otherMotionId })
			.eq('id', listId);

		expect(error?.message).toContain('row-level security');
	});

	it("refuses a list hung off another committee's session", async () => {
		const room = await createCommitteeRoom();
		const other = await addOtherCommittee(room);

		const { error } = await room.chair.supabase.from('speakers_lists').insert({
			committee_id: room.committeeId,
			session_id: other.sessionId,
			kind: 'general',
			name: "General Speakers' List",
			speaking_time_seconds: FIXTURE_SPEAKING_TIME_SECONDS
		});

		expect(error?.message).toContain('row-level security');
	});

	it('shows a list to a delegate of the committee and to a volunteer on the team', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const listId = await addSpeakersList(room.chair.supabase, room.committeeId, sessionId);
		const volunteer = await addVolunteer(room);

		const { data: delegateSees, error } = await room.delegate.supabase
			.from('speakers_lists')
			.select('name')
			.eq('id', listId);

		expect(error).toBeNull();
		expect(delegateSees).toEqual([{ name: "General Speakers' List" }]);

		const { data: volunteerSees } = await volunteer.supabase
			.from('speakers_lists')
			.select('name')
			.eq('id', listId);

		expect(volunteerSees).toEqual([{ name: "General Speakers' List" }]);
	});

	it('hides a list from a signed-in stranger', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const listId = await addSpeakersList(room.chair.supabase, room.committeeId, sessionId);
		const stranger = await createSignedInClient('Fixture Stranger');

		const { data } = await stranger.supabase.from('speakers_lists').select('name').eq('id', listId);

		expect(data).toEqual([]);
	});

	it('lets a chair close a list and then remove it', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const listId = await addSpeakersList(room.chair.supabase, room.committeeId, sessionId);

		const { data: closed, error: updateError } = await room.chair.supabase
			.from('speakers_lists')
			.update({ is_open: false })
			.eq('id', listId)
			.select('is_open');

		expect(updateError).toBeNull();
		expect(closed).toEqual([{ is_open: false }]);

		const { error: deleteError } = await room.chair.supabase
			.from('speakers_lists')
			.delete()
			.eq('id', listId);

		expect(deleteError).toBeNull();

		const { data: left } = await room.chair.supabase
			.from('speakers_lists')
			.select('id')
			.eq('id', listId);

		expect(left).toEqual([]);
	});

	it('refuses a delegate who tries to open, close or remove a list', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const listId = await addSpeakersList(room.chair.supabase, room.committeeId, sessionId);

		const { error: insertError } = await room.delegate.supabase.from('speakers_lists').insert({
			committee_id: room.committeeId,
			session_id: sessionId,
			kind: 'general',
			name: 'A list of my own',
			speaking_time_seconds: FIXTURE_SPEAKING_TIME_SECONDS
		});

		expect(insertError?.message).toContain('row-level security');

		const { data: closed } = await room.delegate.supabase
			.from('speakers_lists')
			.update({ is_open: false })
			.eq('id', listId)
			.select('is_open');

		expect(closed).toEqual([]);

		const { data: removed } = await room.delegate.supabase
			.from('speakers_lists')
			.delete()
			.eq('id', listId)
			.select('is_open');

		expect(removed).toEqual([]);

		const { data: still } = await room.chair.supabase
			.from('speakers_lists')
			.select('is_open')
			.eq('id', listId);

		expect(still).toEqual([{ is_open: true }]);
	});
});

// -----------------------------------------------------------------------------
// speakers_list_entries
// -----------------------------------------------------------------------------
// The same permissions.md row as `speakers_lists`, one level down. Reading an
// entry is the same question as reading its list, and the insert policy also
// checks that the seat belongs to the committee the list does.

describe('speakers_list_entries, one seat at a time', () => {
	it('lets a chair add a seat of their own committee to a list', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const listId = await addSpeakersList(room.chair.supabase, room.committeeId, sessionId);

		const { data, error } = await room.chair.supabase
			.from('speakers_list_entries')
			.insert({ speakers_list_id: listId, seat_id: room.seatId })
			.select('seat_id, position, status');

		expect(error).toBeNull();
		expect(data).toEqual([{ seat_id: room.seatId, position: 0, status: 'waiting' }]);
	});

	it("refuses a chair adding another committee's seat to a list", async () => {
		const room = await createCommitteeRoom();
		const other = await addOtherCommittee(room);
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const listId = await addSpeakersList(room.chair.supabase, room.committeeId, sessionId);

		// A seat that is not in the room cannot be given the floor in it.
		const { error } = await room.chair.supabase
			.from('speakers_list_entries')
			.insert({ speakers_list_id: listId, seat_id: other.seatId });

		expect(error?.message).toContain('row-level security');
	});

	it('lets a chair reorder a list and move the turn on', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const listId = await addSpeakersList(room.chair.supabase, room.committeeId, sessionId);
		const entryId = await addSpeakersListEntry(room.chair.supabase, listId, room.seatId, 3);

		const { data: moved, error: reorderError } = await room.chair.supabase
			.from('speakers_list_entries')
			.update({ position: 1 })
			.eq('id', entryId)
			.select('position');

		expect(reorderError).toBeNull();
		expect(moved).toEqual([{ position: 1 }]);

		// "Next speaker" writes all of this at once: the seat that has finished
		// becomes `spoken` with the seconds it really used, which is less than
		// the list's speaking time when the delegate yields to the chair.
		const startedAt = new Date().toISOString();
		const { data: spoken, error: turnError } = await room.chair.supabase
			.from('speakers_list_entries')
			.update({ status: 'spoken', started_at: startedAt, spoke_seconds: 42 })
			.eq('id', entryId)
			.select('status, started_at, spoke_seconds')
			.single();

		expect(turnError).toBeNull();
		expect(spoken?.status).toBe('spoken');
		expect(spoken?.spoke_seconds).toBe(42);
		expect(momentOf(spoken?.started_at)).toBe(startedAt);
	});

	it('lets a chair take a speaker off the list by marking them removed', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const listId = await addSpeakersList(room.chair.supabase, room.committeeId, sessionId);
		const entryId = await addSpeakersListEntry(room.chair.supabase, listId, room.seatId);

		// Taking a speaker off is a change of status and not a delete, so the
		// record of who was on the list stays and a delegate's screen hears about
		// it as an ordinary update rather than as a row that vanished.
		const { data, error } = await room.chair.supabase
			.from('speakers_list_entries')
			.update({ status: 'removed' })
			.eq('id', entryId)
			.select('status');

		expect(error).toBeNull();
		expect(data).toEqual([{ status: 'removed' }]);
	});

	it('lets a chair delete an entry outright', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const listId = await addSpeakersList(room.chair.supabase, room.committeeId, sessionId);
		const entryId = await addSpeakersListEntry(room.chair.supabase, listId, room.seatId);

		const { error } = await room.chair.supabase
			.from('speakers_list_entries')
			.delete()
			.eq('id', entryId);

		expect(error).toBeNull();

		const { data: left } = await room.chair.supabase
			.from('speakers_list_entries')
			.select('id')
			.eq('id', entryId);

		expect(left).toEqual([]);
	});

	it('shows the list to a delegate of the committee', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const listId = await addSpeakersList(room.chair.supabase, room.committeeId, sessionId);
		await addSpeakersListEntry(room.chair.supabase, listId, room.seatId);

		// This is what tells a delegate "You are 4th": they read the whole list
		// of their own committee, in position order.
		const { data, error } = await room.delegate.supabase
			.from('speakers_list_entries')
			.select('seat_id')
			.eq('speakers_list_id', listId);

		expect(error).toBeNull();
		expect(data).toEqual([{ seat_id: room.seatId }]);
	});

	it('hides the list from a signed-in stranger', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const listId = await addSpeakersList(room.chair.supabase, room.committeeId, sessionId);
		await addSpeakersListEntry(room.chair.supabase, listId, room.seatId);
		const stranger = await createSignedInClient('Fixture Stranger');

		const { data } = await stranger.supabase
			.from('speakers_list_entries')
			.select('seat_id')
			.eq('speakers_list_id', listId);

		expect(data).toEqual([]);
	});

	it('refuses a delegate who tries to add, reorder or remove a speaker', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const listId = await addSpeakersList(room.chair.supabase, room.committeeId, sessionId);
		const entryId = await addSpeakersListEntry(room.chair.supabase, listId, room.seatId, 2);

		// A delegate asks to speak by raising a placard. Putting them on the list
		// is the chair's job, and so is the order they are in.
		const { error: insertError } = await room.delegate.supabase
			.from('speakers_list_entries')
			.insert({ speakers_list_id: listId, seat_id: room.seatId, position: 0 });

		expect(insertError?.message).toContain('row-level security');

		const { data: moved } = await room.delegate.supabase
			.from('speakers_list_entries')
			.update({ position: 0 })
			.eq('id', entryId)
			.select('position');

		expect(moved).toEqual([]);

		const { data: removed } = await room.delegate.supabase
			.from('speakers_list_entries')
			.delete()
			.eq('id', entryId)
			.select('position');

		expect(removed).toEqual([]);

		const { data: still } = await room.chair.supabase
			.from('speakers_list_entries')
			.select('position')
			.eq('id', entryId);

		expect(still).toEqual([{ position: 2 }]);
	});
});

// -----------------------------------------------------------------------------
// votes
// -----------------------------------------------------------------------------
// permissions.md: `votes` is read by "deleg., staff" and written by "chair".
// The table also carries `votes_says_what_it_is_about`, which is the one rule
// here that is a check constraint rather than a policy.

describe('votes, procedural and substantive', () => {
	it('lets a chair open a procedural vote on a motion of their committee', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const motionId = await addMotion(room.chair.supabase, room.committeeId, sessionId);

		const { data, error } = await room.chair.supabase
			.from('votes')
			.insert({
				committee_id: room.committeeId,
				session_id: sessionId,
				motion_id: motionId,
				kind: 'procedural'
			})
			.select('kind, motion_id, status, method, majority, passed');

		expect(error).toBeNull();
		expect(data).toEqual([
			{
				kind: 'procedural',
				motion_id: motionId,
				status: 'open',
				method: 'show_of_hands',
				majority: 'simple',
				passed: null
			}
		]);
	});

	it('lets a chair open a substantive vote with a typed subject', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);

		const { data, error } = await room.chair.supabase
			.from('votes')
			.insert({
				committee_id: room.committeeId,
				session_id: sessionId,
				kind: 'substantive',
				subject: FIXTURE_VOTE_SUBJECT,
				method: 'roll_call',
				majority: 'two_thirds'
			})
			.select('subject, majority, method');

		expect(error).toBeNull();
		expect(data).toEqual([
			{ subject: FIXTURE_VOTE_SUBJECT, majority: 'two_thirds', method: 'roll_call' }
		]);
	});

	it('refuses a vote that says nothing about what it is about', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);

		// No subject, no motion and no document is a row no screen could draw.
		const { error } = await room.chair.supabase.from('votes').insert({
			committee_id: room.committeeId,
			session_id: sessionId,
			kind: 'substantive'
		});

		expect(error?.message).toContain('votes_says_what_it_is_about');
	});

	it("refuses a vote pointing at another committee's motion", async () => {
		const room = await createCommitteeRoom();
		const other = await addOtherCommittee(room);
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const otherMotionId = await addMotion(other.chair.supabase, other.committeeId, other.sessionId);

		const { error } = await room.chair.supabase.from('votes').insert({
			committee_id: room.committeeId,
			session_id: sessionId,
			motion_id: otherMotionId,
			kind: 'procedural'
		});

		expect(error?.message).toContain('row-level security');
	});

	it("refuses a chair moving an existing vote onto another committee's motion", async () => {
		const room = await createCommitteeRoom();
		const other = await addOtherCommittee(room);
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const voteId = await addVote(room.chair.supabase, room.committeeId, sessionId);
		const otherMotionId = await addMotion(other.chair.supabase, other.committeeId, other.sessionId);

		// As with a speakers list, the update policy repeats the insert policy's
		// question about the motion, so a vote cannot be moved onto one.
		const { error } = await room.chair.supabase
			.from('votes')
			.update({ motion_id: otherMotionId })
			.eq('id', voteId);

		expect(error?.message).toContain('row-level security');
	});

	it("refuses a vote hung off another committee's session", async () => {
		const room = await createCommitteeRoom();
		const other = await addOtherCommittee(room);

		const { error } = await room.chair.supabase.from('votes').insert({
			committee_id: room.committeeId,
			session_id: other.sessionId,
			kind: 'substantive',
			subject: FIXTURE_VOTE_SUBJECT
		});

		expect(error?.message).toContain('row-level security');
	});

	it('shows a vote to a delegate of the committee and to a volunteer on the team', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const voteId = await addVote(room.chair.supabase, room.committeeId, sessionId);
		const volunteer = await addVolunteer(room);

		const { data: delegateSees, error } = await room.delegate.supabase
			.from('votes')
			.select('subject')
			.eq('id', voteId);

		expect(error).toBeNull();
		expect(delegateSees).toEqual([{ subject: FIXTURE_VOTE_SUBJECT }]);

		const { data: volunteerSees } = await volunteer.supabase
			.from('votes')
			.select('subject')
			.eq('id', voteId);

		expect(volunteerSees).toEqual([{ subject: FIXTURE_VOTE_SUBJECT }]);
	});

	it('hides a vote from a signed-in stranger', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const voteId = await addVote(room.chair.supabase, room.committeeId, sessionId);
		const stranger = await createSignedInClient('Fixture Stranger');

		const { data } = await stranger.supabase.from('votes').select('subject').eq('id', voteId);

		expect(data).toEqual([]);
	});

	it('refuses a delegate who tries to open a vote', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);

		const { error } = await room.delegate.supabase.from('votes').insert({
			committee_id: room.committeeId,
			session_id: sessionId,
			kind: 'substantive',
			subject: FIXTURE_VOTE_SUBJECT
		});

		expect(error?.message).toContain('row-level security');
	});

	it('lets a chair close a vote with its counts and its result', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const voteId = await addVote(room.chair.supabase, room.committeeId, sessionId);

		const closedAt = new Date().toISOString();
		const { data, error } = await room.chair.supabase
			.from('votes')
			.update({
				status: 'closed',
				votes_for: 11,
				votes_against: 3,
				votes_abstain: 1,
				passed: true,
				closed_at: closedAt
			})
			.eq('id', voteId)
			.select('status, votes_for, votes_against, votes_abstain, passed, closed_at')
			.single();

		expect(error).toBeNull();
		expect(data?.status).toBe('closed');
		expect(data?.votes_for).toBe(11);
		expect(data?.votes_against).toBe(3);
		expect(data?.votes_abstain).toBe(1);
		expect(data?.passed).toBe(true);
		expect(momentOf(data?.closed_at)).toBe(closedAt);
	});

	it('refuses a delegate who tries to close or remove a vote', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const voteId = await addVote(room.chair.supabase, room.committeeId, sessionId);

		const { data: closed } = await room.delegate.supabase
			.from('votes')
			.update({ status: 'closed', passed: true })
			.eq('id', voteId)
			.select('status');

		expect(closed).toEqual([]);

		const { data: removed } = await room.delegate.supabase
			.from('votes')
			.delete()
			.eq('id', voteId)
			.select('status');

		expect(removed).toEqual([]);

		const { data: still } = await room.chair.supabase
			.from('votes')
			.select('status, passed')
			.eq('id', voteId);

		expect(still).toEqual([{ status: 'open', passed: null }]);
	});

	it('lets a chair remove a vote', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const voteId = await addVote(room.chair.supabase, room.committeeId, sessionId);

		const { error } = await room.chair.supabase.from('votes').delete().eq('id', voteId);

		expect(error).toBeNull();

		const { data: left } = await room.chair.supabase.from('votes').select('id').eq('id', voteId);

		expect(left).toEqual([]);
	});
});

// -----------------------------------------------------------------------------
// vote_entries
// -----------------------------------------------------------------------------
// The `vote_entries` row of permissions.md: read by "deleg., staff", written
// by "chair". Only a roll call vote has entries at all; a show of hands is the
// chair typing the counts onto the vote itself.

describe('vote_entries, one seat at a time', () => {
	it('lets a chair record a choice for a seat of their own committee', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const voteId = await addVote(room.chair.supabase, room.committeeId, sessionId);

		const { data, error } = await room.chair.supabase
			.from('vote_entries')
			.insert({ vote_id: voteId, seat_id: room.seatId, choice: 'for' })
			.select('choice');

		expect(error).toBeNull();
		expect(data).toEqual([{ choice: 'for' }]);
	});

	it("refuses a chair recording a choice for another committee's seat", async () => {
		const room = await createCommitteeRoom();
		const other = await addOtherCommittee(room);
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const voteId = await addVote(room.chair.supabase, room.committeeId, sessionId);

		// A seat that is not in the room does not get a say in its votes.
		const { error } = await room.chair.supabase
			.from('vote_entries')
			.insert({ vote_id: voteId, seat_id: other.seatId, choice: 'against' });

		expect(error?.message).toContain('row-level security');
	});

	it('shows the recorded choices to a delegate of the committee', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const voteId = await addVote(room.chair.supabase, room.committeeId, sessionId);

		await room.chair.supabase
			.from('vote_entries')
			.insert({ vote_id: voteId, seat_id: room.seatId, choice: 'abstain' });

		const { data, error } = await room.delegate.supabase
			.from('vote_entries')
			.select('choice')
			.eq('vote_id', voteId);

		expect(error).toBeNull();
		expect(data).toEqual([{ choice: 'abstain' }]);
	});

	it('hides the recorded choices from a signed-in stranger', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const voteId = await addVote(room.chair.supabase, room.committeeId, sessionId);
		const stranger = await createSignedInClient('Fixture Stranger');

		await room.chair.supabase
			.from('vote_entries')
			.insert({ vote_id: voteId, seat_id: room.seatId, choice: 'for' });

		const { data } = await stranger.supabase
			.from('vote_entries')
			.select('choice')
			.eq('vote_id', voteId);

		expect(data).toEqual([]);
	});

	it('refuses two choices for the same seat in the same vote', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const voteId = await addVote(room.chair.supabase, room.committeeId, sessionId);

		await room.chair.supabase
			.from('vote_entries')
			.insert({ vote_id: voteId, seat_id: room.seatId, choice: 'for' });

		// The pair of ids is the row's identity, so a chair who taps the wrong
		// button changes the row that is there. A seat voting twice would make
		// the counts disagree with the roll call.
		const { error } = await room.chair.supabase
			.from('vote_entries')
			.insert({ vote_id: voteId, seat_id: room.seatId, choice: 'against' });

		expect(error?.message).toContain('vote_entries_pkey');
	});

	it('lets a chair change a recorded choice and take it off again', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const voteId = await addVote(room.chair.supabase, room.committeeId, sessionId);

		await room.chair.supabase
			.from('vote_entries')
			.insert({ vote_id: voteId, seat_id: room.seatId, choice: 'for' });

		const { data: changed, error: updateError } = await room.chair.supabase
			.from('vote_entries')
			.update({ choice: 'against' })
			.eq('vote_id', voteId)
			.eq('seat_id', room.seatId)
			.select('choice');

		expect(updateError).toBeNull();
		expect(changed).toEqual([{ choice: 'against' }]);

		const { error: deleteError } = await room.chair.supabase
			.from('vote_entries')
			.delete()
			.eq('vote_id', voteId)
			.eq('seat_id', room.seatId);

		expect(deleteError).toBeNull();

		const { data: left } = await room.chair.supabase
			.from('vote_entries')
			.select('choice')
			.eq('vote_id', voteId);

		expect(left).toEqual([]);
	});

	it('refuses a delegate who tries to record, change or remove a choice', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);
		const voteId = await addVote(room.chair.supabase, room.committeeId, sessionId);
		const secondSeatId = await addSeat(room.supabase, room.committeeId, 'Kenya', 'KE');

		await room.chair.supabase
			.from('vote_entries')
			.insert({ vote_id: voteId, seat_id: room.seatId, choice: 'for' });

		// A delegate votes by raising a placard. The chair is the one who records
		// it, which is what keeps the stored result the chair's own count.
		const { error: insertError } = await room.delegate.supabase
			.from('vote_entries')
			.insert({ vote_id: voteId, seat_id: secondSeatId, choice: 'for' });

		expect(insertError?.message).toContain('row-level security');

		const { data: changed } = await room.delegate.supabase
			.from('vote_entries')
			.update({ choice: 'abstain' })
			.eq('vote_id', voteId)
			.eq('seat_id', room.seatId)
			.select('choice');

		expect(changed).toEqual([]);

		const { data: removed } = await room.delegate.supabase
			.from('vote_entries')
			.delete()
			.eq('vote_id', voteId)
			.eq('seat_id', room.seatId)
			.select('choice');

		expect(removed).toEqual([]);

		const { data: still } = await room.chair.supabase
			.from('vote_entries')
			.select('choice')
			.eq('vote_id', voteId);

		expect(still).toEqual([{ choice: 'for' }]);
	});
});

// -----------------------------------------------------------------------------
// committee_state
// -----------------------------------------------------------------------------
// permissions.md: `committee_state` is read by "deleg., staff", inserted by
// "trigger only", updated by "chair", and the delete column is "—", which
// means no policy and therefore refused. The table also carries
// `committee_state_timer_runs_or_is_paused`, and `create_committee_state` is
// the trigger that writes the one row each committee gets.

describe('create_committee_state', () => {
	it('gives a brand-new committee exactly one idle row with every pointer empty', async () => {
		const room = await createCommitteeRoom();

		// The row is written by an `after insert` trigger on `committees`, so
		// creating a committee the ordinary way is all it takes. Every page in
		// the room can therefore read one row and never handle "no state yet".
		const freshCommitteeId = await addCommittee(
			room.supabase,
			room.conferenceId,
			'Economic and Social Council'
		);

		const { data, error } = await room.supabase
			.from('committee_state')
			.select(
				'mode, current_session_id, current_motion_id, active_speakers_list_id, ' +
					'current_speaker_entry_id, current_vote_id, timer_total_seconds, ' +
					'timer_ends_at, timer_paused_remaining_seconds'
			)
			.eq('committee_id', freshCommitteeId);

		expect(error).toBeNull();
		expect(data).toEqual([
			{
				mode: 'idle',
				current_session_id: null,
				current_motion_id: null,
				active_speakers_list_id: null,
				current_speaker_entry_id: null,
				current_vote_id: null,
				timer_total_seconds: null,
				timer_ends_at: null,
				timer_paused_remaining_seconds: null
			}
		]);
	});
});

// The `committee_state` row of permissions.md read column by column: "deleg.,
// staff" read the row, "chair" updates it, "trigger only" writes it, and the
// delete column is "—", which means no policy and therefore refused.
describe('committee_state, running the room', () => {
	it('refuses a chair and an organiser who try to insert a state row', async () => {
		const room = await createCommitteeRoom();

		// The table has no insert policy at all, because the trigger above is the
		// only thing that ever writes a row. Nobody signed in gets to add one,
		// not even the organiser who owns the conference.
		// The message is asked for, and not just "some error", because this
		// committee already has its row: without it the test would pass on the
		// duplicate key and prove nothing about the missing policy.
		const { error: chairError } = await room.chair.supabase
			.from('committee_state')
			.insert({ committee_id: room.committeeId });

		expect(chairError?.message).toContain('row-level security');

		const { error: organiserError } = await room.supabase
			.from('committee_state')
			.insert({ committee_id: room.committeeId });

		expect(organiserError?.message).toContain('row-level security');
	});

	it('lets a chair set the mode, the current session and the timer', async () => {
		const room = await createCommitteeRoom();
		const sessionId = await addSession(room.chair.supabase, room.committeeId);

		const timerEndsAt = new Date(Date.now() + 60_000).toISOString();
		const { data, error } = await room.chair.supabase
			.from('committee_state')
			.update({
				mode: 'formal_debate',
				current_session_id: sessionId,
				timer_total_seconds: FIXTURE_SPEAKING_TIME_SECONDS,
				timer_ends_at: timerEndsAt
			})
			.eq('committee_id', room.committeeId)
			.select('mode, current_session_id, timer_total_seconds, timer_ends_at')
			.single();

		expect(error).toBeNull();
		expect(data?.mode).toBe('formal_debate');
		expect(data?.current_session_id).toBe(sessionId);
		expect(data?.timer_total_seconds).toBe(FIXTURE_SPEAKING_TIME_SECONDS);
		expect(momentOf(data?.timer_ends_at)).toBe(timerEndsAt);
	});

	it('shows the state to a delegate and to a volunteer, and refuses their writes', async () => {
		const room = await createCommitteeRoom();
		const volunteer = await addVolunteer(room);

		const { data: delegateSees, error } = await room.delegate.supabase
			.from('committee_state')
			.select('mode')
			.eq('committee_id', room.committeeId);

		expect(error).toBeNull();
		expect(delegateSees).toEqual([{ mode: 'idle' }]);

		const { data: volunteerSees } = await volunteer.supabase
			.from('committee_state')
			.select('mode')
			.eq('committee_id', room.committeeId);

		expect(volunteerSees).toEqual([{ mode: 'idle' }]);

		// A delegate's screen mirrors this row and never writes it.
		const { data: changed } = await room.delegate.supabase
			.from('committee_state')
			.update({ mode: 'suspended' })
			.eq('committee_id', room.committeeId)
			.select('mode');

		expect(changed).toEqual([]);

		const { data: still } = await room.chair.supabase
			.from('committee_state')
			.select('mode')
			.eq('committee_id', room.committeeId);

		expect(still).toEqual([{ mode: 'idle' }]);
	});

	it("refuses a chair pointing the room at another committee's rows", async () => {
		const room = await createCommitteeRoom();
		const other = await addOtherCommittee(room);

		const otherMotionId = await addMotion(other.chair.supabase, other.committeeId, other.sessionId);
		const otherListId = await addSpeakersList(
			other.chair.supabase,
			other.committeeId,
			other.sessionId
		);
		const otherEntryId = await addSpeakersListEntry(
			other.chair.supabase,
			otherListId,
			other.seatId
		);
		const otherVoteId = await addVote(other.chair.supabase, other.committeeId, other.sessionId);

		// Every one of the five pointers has to point inside this committee, the
		// same rule a motion's session and a list entry's seat carry above.
		// Nothing leaks without it -- a delegate reading this row would get an id
		// whose row their own select policies refuse -- but the room's screens
		// would be pointing at nothing, and this row is the one thing every
		// screen in the room believes.
		const pointers = [
			{ current_session_id: other.sessionId },
			{ current_motion_id: otherMotionId },
			{ active_speakers_list_id: otherListId },
			{ current_speaker_entry_id: otherEntryId },
			{ current_vote_id: otherVoteId }
		];

		for (const pointer of pointers) {
			const { error } = await room.chair.supabase
				.from('committee_state')
				.update(pointer)
				.eq('committee_id', room.committeeId);

			expect(error?.message).toContain('row-level security');
		}

		// The room is still idle and pointing at nothing, which is where it
		// started.
		const { data: still } = await room.chair.supabase
			.from('committee_state')
			.select('mode, current_session_id, current_motion_id, current_vote_id')
			.eq('committee_id', room.committeeId);

		expect(still).toEqual([
			{
				mode: 'idle',
				current_session_id: null,
				current_motion_id: null,
				current_vote_id: null
			}
		]);
	});

	it('hides the state from a signed-in stranger', async () => {
		const room = await createCommitteeRoom();
		const stranger = await createSignedInClient('Fixture Stranger');

		const { data } = await stranger.supabase
			.from('committee_state')
			.select('mode')
			.eq('committee_id', room.committeeId);

		expect(data).toEqual([]);
	});

	it('leaves the row where it is when a chair tries to delete it', async () => {
		const room = await createCommitteeRoom();

		// There is no delete policy, because the row goes when its committee
		// does. A chair may read the row, so the delete is not an error: it
		// matches nothing and changes nothing.
		const { data: removed, error } = await room.chair.supabase
			.from('committee_state')
			.delete()
			.eq('committee_id', room.committeeId)
			.select('mode');

		expect(error).toBeNull();
		expect(removed).toEqual([]);

		const { data: still } = await room.chair.supabase
			.from('committee_state')
			.select('mode')
			.eq('committee_id', room.committeeId);

		expect(still).toEqual([{ mode: 'idle' }]);
	});
});

// The check constraint on `committee_state`, which is not in permissions.md at
// all: specs/02-architecture/realtime.md asks for a timer that is a moment
// rather than a ticking number, and this is the rule that keeps a row from
// saying it is running and paused at once.
describe('committee_state_timer_runs_or_is_paused', () => {
	it('refuses a timer that is running and paused at the same time', async () => {
		const room = await createCommitteeRoom();

		// Pausing writes the seconds left and clears the moment the timer ends;
		// resuming does the reverse. A row with both set would leave every screen
		// deciding which of the two columns to believe.
		const { error } = await room.chair.supabase
			.from('committee_state')
			.update({
				timer_ends_at: new Date(Date.now() + 60_000).toISOString(),
				timer_paused_remaining_seconds: 45
			})
			.eq('committee_id', room.committeeId);

		expect(error?.message).toContain('committee_state_timer_runs_or_is_paused');
	});

	it('allows a running timer on its own and a paused one on its own', async () => {
		const room = await createCommitteeRoom();

		const timerEndsAt = new Date(Date.now() + 60_000).toISOString();
		const { data: running, error: runningError } = await room.chair.supabase
			.from('committee_state')
			.update({ timer_ends_at: timerEndsAt, timer_paused_remaining_seconds: null })
			.eq('committee_id', room.committeeId)
			.select('timer_ends_at, timer_paused_remaining_seconds')
			.single();

		expect(runningError).toBeNull();
		expect(momentOf(running?.timer_ends_at)).toBe(timerEndsAt);
		expect(running?.timer_paused_remaining_seconds).toBeNull();

		const { data: paused, error: pausedError } = await room.chair.supabase
			.from('committee_state')
			.update({ timer_ends_at: null, timer_paused_remaining_seconds: 45 })
			.eq('committee_id', room.committeeId)
			.select('timer_ends_at, timer_paused_remaining_seconds');

		expect(pausedError).toBeNull();
		expect(paused).toEqual([{ timer_ends_at: null, timer_paused_remaining_seconds: 45 }]);
	});
});

// -----------------------------------------------------------------------------
// chair_notes
// -----------------------------------------------------------------------------
// permissions.md gives every column of `chair_notes` to "chair": the select
// rule is `has_committee_permission(id, 'run_room')`, which is true for a chair of the committee and
// for anybody who can manage its conference, and nobody else. This is the one
// table in this file a delegate may never see, which is why the second test
// below says so about three different people.

describe('chair_notes, what the chairs write down', () => {
	it('lets a chair write a note about a seat of their own committee, and the organiser read it', async () => {
		const room = await createCommitteeRoom();

		// `author_id` defaults to `auth.uid()`, so the page sends a committee, a
		// seat and a body, and the database records who wrote it.
		const { data: written, error } = await room.chair.supabase
			.from('chair_notes')
			.insert({
				committee_id: room.committeeId,
				seat_id: room.seatId,
				body: 'Spoke well on the first clause.'
			})
			.select('body, author_id');

		expect(error).toBeNull();
		expect(written).toEqual([
			{ body: 'Spoke well on the first clause.', author_id: room.chair.userId }
		]);

		// `has_committee_permission(id, 'run_room')` is true for the organiser of the conference too,
		// so the same policy shows them the note.
		const { data: organiserSees } = await room.supabase
			.from('chair_notes')
			.select('body')
			.eq('committee_id', room.committeeId);

		expect(organiserSees).toEqual([{ body: 'Spoke well on the first clause.' }]);
	});

	it('shows a note to nobody else: not the delegate it is about, not another delegate, not a volunteer', async () => {
		const room = await createCommitteeRoom();
		await addChairNote(room.chair.supabase, room.committeeId, room.seatId);

		// The delegate the note is about is the person who must never see it. The
		// seat list in the room shows them a count and nothing else.
		const { data: subjectSees, error } = await room.delegate.supabase
			.from('chair_notes')
			.select('body')
			.eq('committee_id', room.committeeId);

		expect(error).toBeNull();
		expect(subjectSees).toEqual([]);

		const secondSeatId = await addSeat(room.supabase, room.committeeId, 'Kenya', 'KE');
		const secondDelegate = await createSignedInClient('Fixture Second Delegate');
		await giveSeatTo(room.supabase, secondSeatId, secondDelegate.userId);

		const { data: neighbourSees } = await secondDelegate.supabase
			.from('chair_notes')
			.select('body')
			.eq('committee_id', room.committeeId);

		expect(neighbourSees).toEqual([]);

		// Every other table in this file gives the conference team a read. This
		// one does not: `chair_notes` has no staff policy at all.
		const volunteer = await addVolunteer(room);
		const { data: volunteerSees } = await volunteer.supabase
			.from('chair_notes')
			.select('body')
			.eq('committee_id', room.committeeId);

		expect(volunteerSees).toEqual([]);
	});

	it("refuses a chair writing a note in somebody else's name", async () => {
		const room = await createCommitteeRoom();
		const coChair = await createSignedInClient('Fixture Co-Chair');
		await addChair(room.supabase, room.committeeId, coChair.userId);

		// `author_id` is what the update and delete policies ask about, so a
		// chair who could write a co-chair's id into it would be putting words in
		// their mouth and handing them a note they never wrote.
		const { error } = await room.chair.supabase.from('chair_notes').insert({
			committee_id: room.committeeId,
			seat_id: room.seatId,
			author_id: coChair.userId,
			body: 'A note somebody else is said to have written.'
		});

		expect(error?.message).toContain('row-level security');

		const { data: left } = await room.supabase
			.from('chair_notes')
			.select('id')
			.eq('committee_id', room.committeeId);

		expect(left).toEqual([]);
	});

	it("refuses a chair writing a note about another committee's seat", async () => {
		const room = await createCommitteeRoom();
		const other = await addOtherCommittee(room);

		const { error } = await room.chair.supabase.from('chair_notes').insert({
			committee_id: room.committeeId,
			seat_id: other.seatId,
			body: 'About somebody in another room.'
		});

		expect(error?.message).toContain('row-level security');
	});

	it('refuses a delegate who tries to write a note', async () => {
		const room = await createCommitteeRoom();

		const { error } = await room.delegate.supabase.from('chair_notes').insert({
			committee_id: room.committeeId,
			seat_id: room.seatId,
			body: 'A note about myself.'
		});

		expect(error?.message).toContain('row-level security');
	});

	it('lets the author edit and delete their own note', async () => {
		const room = await createCommitteeRoom();
		const noteId = await addChairNote(room.chair.supabase, room.committeeId, room.seatId);

		const { data: edited, error: updateError } = await room.chair.supabase
			.from('chair_notes')
			.update({ body: 'Spoke well, and yielded to the chair.' })
			.eq('id', noteId)
			.select('body');

		expect(updateError).toBeNull();
		expect(edited).toEqual([{ body: 'Spoke well, and yielded to the chair.' }]);

		const { error: deleteError } = await room.chair.supabase
			.from('chair_notes')
			.delete()
			.eq('id', noteId);

		expect(deleteError).toBeNull();

		const { data: left } = await room.supabase.from('chair_notes').select('id').eq('id', noteId);

		expect(left).toEqual([]);
	});

	it('lets a second chair of the same committee read a note but not edit or delete it', async () => {
		const room = await createCommitteeRoom();
		const coChair = await createSignedInClient('Fixture Co-Chair');
		await addChair(room.supabase, room.committeeId, coChair.userId);
		const noteId = await addChairNote(room.chair.supabase, room.committeeId, room.seatId);

		const { data: seen } = await coChair.supabase
			.from('chair_notes')
			.select('body')
			.eq('id', noteId);

		expect(seen).toEqual([{ body: 'Spoke well on the first clause.' }]);

		// A co-chair reading a note is not the same as a co-chair rewriting it.
		// They can see the row, so the update matches nothing rather than failing.
		const { data: edited } = await coChair.supabase
			.from('chair_notes')
			.update({ body: 'Rewritten by somebody else.' })
			.eq('id', noteId)
			.select('body');

		expect(edited).toEqual([]);

		const { data: removed } = await coChair.supabase
			.from('chair_notes')
			.delete()
			.eq('id', noteId)
			.select('body');

		expect(removed).toEqual([]);

		const { data: still } = await room.chair.supabase
			.from('chair_notes')
			.select('body')
			.eq('id', noteId);

		expect(still).toEqual([{ body: 'Spoke well on the first clause.' }]);
	});

	it('lets an organiser delete a note somebody else wrote', async () => {
		const room = await createCommitteeRoom();
		const noteId = await addChairNote(room.chair.supabase, room.committeeId, room.seatId);

		const { error } = await room.supabase.from('chair_notes').delete().eq('id', noteId);

		expect(error).toBeNull();

		const { data: left } = await room.chair.supabase
			.from('chair_notes')
			.select('id')
			.eq('id', noteId);

		expect(left).toEqual([]);
	});
});
