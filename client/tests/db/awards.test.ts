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
	addSeat,
	createCommitteeRoom,
	giveSeatTo,
	type CommitteeRoomFixture,
	type ConferenceFixture
} from './conference-fixtures';

// The `awards` table of task T39: the propose, confirm and publish flow of
// specs/06-features/awards.md, the `awards` row of the policy matrix in
// specs/02-architecture/permissions.md, and the three rules a policy cannot
// say on its own -- `guard_award_insert`, `protect_awards_columns` and
// `freeze_award_user`. The last describe is `notify_awards_published`, the one
// row of specs/02-architecture/notifications.md whose notifications may be
// dated in the future.
//
// Every fixture here is `createCommitteeRoom`: one conference, one committee,
// one seat, a chair of that committee and the delegate sitting in that seat.
// Those are the four people every rule below is written about, and each test
// builds its own so that nothing depends on another test's rows.

// A minute and a day in milliseconds. Every moment these tests publish awards
// at is built out of one of the two, because the only thing the policies and
// the triggers ask of `awards_published_at` is which side of `now()` it falls
// on.
const ONE_MINUTE_IN_MILLISECONDS = 60_000;
const ONE_DAY_IN_MILLISECONDS = 86_400_000;

/**
 * A custom award title long enough that "You received … in Security Council"
 * runs past the 100 characters specs/02-architecture/notifications.md allows a
 * line in the bell. The award itself keeps every word.
 */
const LONG_AWARD_TITLE =
	'Most Determined Diplomat of the Whole Weekend, for never once yielding the floor to anybody';

/** The columns of a notification these tests look at. */
type NotificationRow = {
	kind: string;
	title: string;
	link_path: string;
	created_at: string;
};

/** The columns of an award a reading test looks at. */
type AwardRow = {
	title: string;
	status: string;
};

/**
 * A moment that has already arrived. Publishing awards "now" is really
 * publishing them at a moment just gone, so that the `notifications` select
 * policy, which only returns rows dated `<= now()`, lets the recipient see
 * theirs straight away.
 */
function minutesAgo(minutes: number): string {
	return new Date(Date.now() - minutes * ONE_MINUTE_IN_MILLISECONDS).toISOString();
}

/** A moment that has not arrived yet, which is a publish the organiser scheduled. */
function tomorrow(): string {
	return new Date(Date.now() + ONE_DAY_IN_MILLISECONDS).toISOString();
}

/**
 * What the chair's awards page sends when it proposes one. `status`,
 * `created_by`, `user_id` and the two moments are all left to the database,
 * which is exactly what `guard_award_insert` insists on.
 */
function awardColumns(
	committeeId: string,
	seatId: string,
	overrides: Record<string, unknown> = {}
): Record<string, unknown> {
	return {
		committee_id: committeeId,
		seat_id: seatId,
		kind: 'best_delegate',
		title: 'Best Delegate',
		...overrides
	};
}

/**
 * Proposes one award through the given client, so that the `awards` insert
 * policy and `guard_award_insert` both have to allow it, and gives back its id.
 */
async function proposeAward(
	proposer: SupabaseClient,
	committeeId: string,
	seatId: string,
	overrides: Record<string, unknown> = {}
): Promise<string> {
	const { data, error } = await proposer
		.from('awards')
		.insert(awardColumns(committeeId, seatId, overrides))
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not propose the fixture award: ${error?.message}`);
	}

	return data.id;
}

/** An organiser confirming a proposal, which is the only column they may write. */
async function confirmAward(organiser: SupabaseClient, awardId: string): Promise<void> {
	const { error } = await organiser
		.from('awards')
		.update({ status: 'confirmed' })
		.eq('id', awardId);

	if (error) {
		throw new Error(`Could not confirm the fixture award: ${error.message}`);
	}
}

/** The same organiser changing their mind, which is what unconfirming is. */
async function unconfirmAward(organiser: SupabaseClient, awardId: string): Promise<void> {
	const { error } = await organiser.from('awards').update({ status: 'proposed' }).eq('id', awardId);

	if (error) {
		throw new Error(`Could not unconfirm the fixture award: ${error.message}`);
	}
}

/**
 * The organiser pressing "Publish awards". `moment` goes straight into
 * `conferences.awards_published_at`, the one column both `freeze_award_user`
 * and `notify_awards_published` hang off.
 */
async function publishAwards(
	organiser: SupabaseClient,
	conferenceId: string,
	moment: string
): Promise<void> {
	const { error } = await organiser
		.from('conferences')
		.update({ awards_published_at: moment })
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not publish the fixture awards: ${error.message}`);
	}
}

/**
 * Publishes the fixture conference itself, which is a different thing from
 * publishing its awards.
 *
 * `createCommitteeRoom` leaves its conference a draft, and the second `awards`
 * select policy looks the conference up with a plain sub-select. A sub-select
 * inside a policy runs under the reader's own Row Level Security, and a draft
 * conference is only readable by its own staff, so a delegate or a stranger
 * would see nothing for that reason rather than because of the award. A
 * conference handing out awards has really been published, so the reading
 * tests below publish it and ask the question they mean to ask.
 */
async function publishConference(fixture: ConferenceFixture): Promise<void> {
	const { error } = await fixture.supabase
		.from('conferences')
		.update({ status: 'published' })
		.eq('id', fixture.conferenceId);

	if (error) {
		throw new Error(`Could not publish the fixture conference: ${error.message}`);
	}
}

/**
 * What one client can see of one award. An empty array means a select policy is
 * hiding the row, which is how a refused read looks: a policy hides rows rather
 * than raising, so an error here would be a different bug and is thrown.
 */
async function awardsVisibleTo(supabase: SupabaseClient, awardId: string): Promise<AwardRow[]> {
	const { data, error } = await supabase.from('awards').select('title, status').eq('id', awardId);

	if (error) {
		throw new Error(`Reading an award should never raise, and this did: ${error.message}`);
	}

	return (data ?? []) as AwardRow[];
}

/**
 * What one signed-in client can see of one award through `published_awards`,
 * the view a delegate or a stranger reads awards through since
 * 20261022132000_internal_notes_grants.sql. The view only ever carries
 * confirmed awards, so a row's status is `confirmed` by construction and is
 * written in here so the two readers answer in one shape.
 */
async function publishedAwardsVisibleTo(
	supabase: SupabaseClient,
	awardId: string
): Promise<AwardRow[]> {
	const { data, error } = await supabase.from('published_awards').select('title').eq('id', awardId);

	if (error) {
		throw new Error(`Reading a published award should never raise, and this did: ${error.message}`);
	}

	return (data ?? []).map((row) => ({ title: row.title, status: 'confirmed' }));
}

/**
 * The holder frozen onto an award, read by the organiser, who can see every
 * award of their own conference in any status.
 */
async function readFrozenUserId(
	organiser: SupabaseClient,
	awardId: string
): Promise<string | null> {
	const { data, error } = await organiser
		.from('awards')
		.select('user_id')
		.eq('id', awardId)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the fixture award back: ${error?.message}`);
	}

	return data.user_id;
}

/**
 * A second committee of the same conference, with one seat in it. The seat
 * scope rules are all about this: a chair of one committee must not be able to
 * write an award about another committee's seat.
 */
async function addSecondCommitteeWithSeat(
	room: CommitteeRoomFixture
): Promise<{ committeeId: string; seatId: string }> {
	const committeeId = await addCommittee(
		room.supabase,
		room.conferenceId,
		'General Assembly First Committee'
	);
	const seatId = await addSeat(room.supabase, committeeId, 'Brazil', 'BR');

	return { committeeId, seatId };
}

/** A second chair of the fixture's committee, made the way the first one was. */
async function addSecondChair(room: CommitteeRoomFixture): Promise<SignedInClient> {
	const secondChair = await createSignedInClient('Fixture Second Chair');

	await addChair(room.supabase, room.committeeId, secondChair.userId);

	return secondChair;
}

/**
 * The award notifications one person can see of their own, read with their own
 * client so that the `notifications` select policy has to allow it. The filter
 * on `kind` leaves out the `seat_allocated` row the fixture caused when it put
 * them in their seat.
 */
async function readAwardNotifications(recipient: SignedInClient): Promise<NotificationRow[]> {
	const { data, error } = await recipient.supabase
		.from('notifications')
		.select('kind, title, link_path, created_at')
		.eq('kind', 'award_published');

	if (error) {
		throw new Error(`Could not read the recipient's notifications: ${error.message}`);
	}

	return (data ?? []) as NotificationRow[];
}

/**
 * The same rows read with the service role client, which no policy limits.
 *
 * This is the one job that client is for: showing that a row a real user may
 * not see is nevertheless there. The only test that needs it is the scheduled
 * publish, where the notification is dated in the future and the recipient's
 * own client is supposed to hide it.
 */
async function readAwardNotificationsOnDisk(userId: string): Promise<NotificationRow[]> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('notifications')
		.select('kind, title, link_path, created_at')
		.eq('kind', 'award_published')
		.eq('user_id', userId);

	if (error) {
		throw new Error(`Could not read the notifications on disk: ${error.message}`);
	}

	return (data ?? []) as NotificationRow[];
}

// permissions.md gives the `awards` insert to "chair", and `has_committee_permission(id, 'run_room')`
// is true for a chair of the committee and for anybody who can manage its
// conference, so an organiser proposes one the same way. awards.md step 1: a
// proposal is saved as `proposed`.
describe('awards, proposing one', () => {
	it('lets a chair propose one for a seat of their own committee', async () => {
		const room = await createCommitteeRoom();

		// `.select()` after an insert is the "insert ... returning" a page uses to
		// read the new row back, so a select policy has to pass for it too.
		const { data, error } = await room.chair.supabase
			.from('awards')
			.insert(awardColumns(room.committeeId, room.seatId))
			.select('status, user_id, created_by');

		// `status` and `created_by` both come from the column defaults, which is
		// what makes `guard_award_insert`'s rules easy for a page to obey.
		expect(error).toBeNull();
		expect(data).toEqual([{ status: 'proposed', user_id: null, created_by: room.chair.userId }]);
	});

	it('refuses a chair proposing one for a seat of another committee', async () => {
		const room = await createCommitteeRoom();
		const other = await addSecondCommitteeWithSeat(room);

		// The chair can read that seat, because they are staff of the conference,
		// so it is the second half of the insert policy that refuses this: the
		// seat has to belong to the award's own committee.
		const { error } = await room.chair.supabase
			.from('awards')
			.insert(awardColumns(room.committeeId, other.seatId));

		expect(error).not.toBeNull();

		const { data: awards } = await room.supabase
			.from('awards')
			.select('id')
			.eq('committee_id', room.committeeId);

		expect(awards).toEqual([]);
	});

	it('refuses a signed-in stranger with nothing to do with the conference', async () => {
		const room = await createCommitteeRoom();
		const stranger = await createSignedInClient('Fixture Stranger');

		const { error } = await stranger.supabase
			.from('awards')
			.insert(awardColumns(room.committeeId, room.seatId));

		expect(error).not.toBeNull();
	});

	it("refuses the committee's own delegate", async () => {
		const room = await createCommitteeRoom();

		// Sitting in a committee is not chairing it. A delegate who could write
		// this row would be giving themselves an award.
		const { error } = await room.delegate.supabase
			.from('awards')
			.insert(awardColumns(room.committeeId, room.seatId));

		expect(error).not.toBeNull();
	});

	it('lets an organiser propose one of their own', async () => {
		const room = await createCommitteeRoom();

		const { data, error } = await room.supabase
			.from('awards')
			.insert(awardColumns(room.committeeId, room.seatId))
			.select('status, created_by');

		expect(error).toBeNull();
		expect(data).toEqual([{ status: 'proposed', created_by: room.userId }]);
	});
});

// The column half of the insert rule, which a policy cannot say. awards.md:
// only an organiser confirms an award, and only a publish names its holder.
describe('guard_award_insert', () => {
	it('refuses one that arrives already confirmed', async () => {
		const room = await createCommitteeRoom();

		// Without this, a chair could propose an award that already says
		// "confirmed" and it would appear on a delegate's profile the moment the
		// conference published, with no organiser ever having agreed.
		const { error } = await room.chair.supabase
			.from('awards')
			.insert(awardColumns(room.committeeId, room.seatId, { status: 'confirmed' }));

		expect(error?.message).toContain('An award is proposed first');

		const { data: awards } = await room.supabase
			.from('awards')
			.select('id')
			.eq('committee_id', room.committeeId);

		expect(awards).toEqual([]);
	});

	it('refuses one that arrives naming its holder', async () => {
		const room = await createCommitteeRoom();

		const { error } = await room.chair.supabase
			.from('awards')
			.insert(awardColumns(room.committeeId, room.seatId, { user_id: room.delegate.userId }));

		expect(error?.message).toContain('An award cannot name its holder yet');

		const { data: awards } = await room.supabase
			.from('awards')
			.select('id')
			.eq('committee_id', room.committeeId);

		expect(awards).toEqual([]);
	});

	it('refuses one that says somebody else proposed it', async () => {
		const room = await createCommitteeRoom();
		const secondChair = await addSecondChair(room);

		// `created_by` is what the update and delete policies ask about, so a
		// chair who could write somebody else's id into it would be handing them
		// a proposal they never made.
		const { error } = await room.chair.supabase
			.from('awards')
			.insert(awardColumns(room.committeeId, room.seatId, { created_by: secondChair.userId }));

		expect(error?.message).toContain('An award records the chair who proposed it');

		const { data: awards } = await room.supabase
			.from('awards')
			.select('id')
			.eq('committee_id', room.committeeId);

		expect(awards).toEqual([]);
	});
});

// awards.md: "One award per kind per seat. A seat can have several kinds (rare;
// allowed)." That sentence is the unique index on (committee_id, seat_id, kind).
describe('awards, one award per kind per seat', () => {
	it('refuses a second Best Delegate for the same seat', async () => {
		const room = await createCommitteeRoom();
		await proposeAward(room.chair.supabase, room.committeeId, room.seatId);

		const { error } = await room.chair.supabase
			.from('awards')
			.insert(awardColumns(room.committeeId, room.seatId));

		expect(error).not.toBeNull();
	});

	it('allows a second award of a different kind for the same seat', async () => {
		const room = await createCommitteeRoom();
		await proposeAward(room.chair.supabase, room.committeeId, room.seatId);

		const { data, error } = await room.chair.supabase
			.from('awards')
			.insert(
				awardColumns(room.committeeId, room.seatId, {
					kind: 'best_position_paper',
					title: 'Best Position Paper'
				})
			)
			.select('kind');

		expect(error).toBeNull();
		expect(data).toEqual([{ kind: 'best_position_paper' }]);
	});
});

// The three readers of the `awards` row of permissions.md: "chair and org.
// always; deleg. of the conference once `conferences.awards_published_at <=
// now()` and `status = 'confirmed'`; anyone reading a profile sees confirmed
// published awards of that user".
describe('awards, who may read one', () => {
	it('shows a proposal to the chair who wrote it and to the organiser at once', async () => {
		const room = await createCommitteeRoom();
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);

		expect(await awardsVisibleTo(room.chair.supabase, awardId)).toEqual([
			{ title: 'Best Delegate', status: 'proposed' }
		]);
		expect(await awardsVisibleTo(room.supabase, awardId)).toEqual([
			{ title: 'Best Delegate', status: 'proposed' }
		]);
	});

	it('hides a proposal from a delegate of the conference', async () => {
		const room = await createCommitteeRoom();
		await publishConference(room);
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);
		await publishAwards(room.supabase, room.conferenceId, minutesAgo(1));

		// Even with the conference's awards published, a proposal is nobody's
		// business but the chairs' and the organisers' until it is confirmed.
		expect(await awardsVisibleTo(room.delegate.supabase, awardId)).toEqual([]);
	});

	it('hides a confirmed award from a delegate until the conference publishes', async () => {
		const room = await createCommitteeRoom();
		await publishConference(room);
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);
		await confirmAward(room.supabase, awardId);

		expect(await awardsVisibleTo(room.delegate.supabase, awardId)).toEqual([]);
	});

	it('shows a delegate a confirmed award once the conference has published', async () => {
		const room = await createCommitteeRoom();
		await publishConference(room);
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);
		await confirmAward(room.supabase, awardId);
		await publishAwards(room.supabase, room.conferenceId, minutesAgo(1));

		// Through the view, and only through the view: the table itself answers
		// only the people who propose or confirm awards.
		expect(await publishedAwardsVisibleTo(room.delegate.supabase, awardId)).toEqual([
			{ title: 'Best Delegate', status: 'confirmed' }
		]);
		expect(await awardsVisibleTo(room.delegate.supabase, awardId)).toEqual([]);
	});

	it('shows a published confirmed award to any signed-in stranger too', async () => {
		const room = await createCommitteeRoom();
		await publishConference(room);
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);
		await confirmAward(room.supabase, awardId);
		await publishAwards(room.supabase, room.conferenceId, minutesAgo(1));

		const stranger = await createSignedInClient('Fixture Stranger');

		// This is the third reader in the matrix, and it is deliberately wider
		// than the second: `/profile` shows a person their awards, and profiles
		// are readable by every signed-in user, so a published award is too.
		// What they get is the view's display fields, never the row's ids
		// (tests/db/security-internal-notes-grants.test.ts).
		expect(await publishedAwardsVisibleTo(stranger.supabase, awardId)).toEqual([
			{ title: 'Best Delegate', status: 'confirmed' }
		]);
	});

	it('shows a visitor who is not signed in nothing, published or not', async () => {
		const room = await createCommitteeRoom();
		await publishConference(room);
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);
		await confirmAward(room.supabase, awardId);

		// Both `awards` select policies are granted to `authenticated` only.
		// Public profiles, which would change this, are Phase 2.
		const visitor = createVisitorClient();

		expect(await awardsVisibleTo(visitor, awardId)).toEqual([]);

		await publishAwards(room.supabase, room.conferenceId, minutesAgo(1));

		expect(await awardsVisibleTo(visitor, awardId)).toEqual([]);
	});

	it('hides a published award again when the organiser unpublishes it', async () => {
		const room = await createCommitteeRoom();
		await publishConference(room);
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);
		await confirmAward(room.supabase, awardId);
		await publishAwards(room.supabase, room.conferenceId, minutesAgo(1));

		expect(await publishedAwardsVisibleTo(room.delegate.supabase, awardId)).toEqual([
			{ title: 'Best Delegate', status: 'confirmed' }
		]);

		// awards.md: "Unpublishing (clearing `awards_published_at`) hides them
		// again; notifications already sent stay." The view asks the column on
		// every read, so clearing it is all it takes.
		const { error } = await room.supabase
			.from('conferences')
			.update({ awards_published_at: null })
			.eq('id', room.conferenceId);

		expect(error).toBeNull();
		expect(await publishedAwardsVisibleTo(room.delegate.supabase, awardId)).toEqual([]);

		// The notification the delegate was already sent is still theirs.
		expect(await readAwardNotifications(room.delegate)).toHaveLength(1);
	});

	it('shows a delegate nothing while the publish moment is still in the future', async () => {
		const room = await createCommitteeRoom();
		await publishConference(room);
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);
		await confirmAward(room.supabase, awardId);
		await publishAwards(room.supabase, room.conferenceId, tomorrow());

		// The policy asks for `awards_published_at <= now()`, which is how an
		// organiser schedules a publish for the closing ceremony.
		expect(await awardsVisibleTo(room.delegate.supabase, awardId)).toEqual([]);
	});
});

// The `awards` update column of permissions.md, "chair (own proposed); org.
// (status)", which is one policy and the `protect_awards_columns` trigger
// together. awards.md step 1: "Editable and deletable by the chair while
// proposed."
describe('awards, rewording and confirming one', () => {
	it('lets the chair who proposed one reword it while it is proposed', async () => {
		const room = await createCommitteeRoom();
		const otherSeatId = await addSeat(room.supabase, room.committeeId, 'Japan', 'JP');
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);

		const { data, error } = await room.chair.supabase
			.from('awards')
			.update({
				kind: 'outstanding_delegate',
				title: 'Outstanding Delegate',
				seat_id: otherSeatId
			})
			.eq('id', awardId)
			.select('kind, title, seat_id');

		expect(error).toBeNull();
		expect(data).toEqual([
			{ kind: 'outstanding_delegate', title: 'Outstanding Delegate', seat_id: otherSeatId }
		]);
	});

	it("refuses a second chair of the same committee rewording somebody else's proposal", async () => {
		const room = await createCommitteeRoom();
		const secondChair = await addSecondChair(room);
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);

		// The update policy's `using` half asks for `created_by = auth.uid()`, so
		// the row is not one this chair may write and it is filtered out. A
		// refused update comes back as no rows and no error, the way a refused
		// select does.
		const { data, error } = await secondChair.supabase
			.from('awards')
			.update({ title: 'Best Delegate (mine)' })
			.eq('id', awardId)
			.select('title');

		expect(error).toBeNull();
		expect(data).toEqual([]);

		// And the proposal really is untouched, read by somebody who can see it.
		expect(await awardsVisibleTo(room.supabase, awardId)).toEqual([
			{ title: 'Best Delegate', status: 'proposed' }
		]);
	});

	it('refuses the proposing chair once it is confirmed, and allows them again after', async () => {
		const room = await createCommitteeRoom();
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);
		await confirmAward(room.supabase, awardId);

		const { data: refused, error: refusedError } = await room.chair.supabase
			.from('awards')
			.update({ title: 'Best Delegate of the Weekend' })
			.eq('id', awardId)
			.select('title');

		expect(refusedError).toBeNull();
		expect(refused).toEqual([]);
		expect(await awardsVisibleTo(room.supabase, awardId)).toEqual([
			{ title: 'Best Delegate', status: 'confirmed' }
		]);

		// awards.md gives the organiser an "unconfirm" for exactly this: a chair
		// whose proposal has been confirmed asks for it back before rewording it.
		await unconfirmAward(room.supabase, awardId);

		const { data: allowed, error: allowedError } = await room.chair.supabase
			.from('awards')
			.update({ title: 'Best Delegate of the Weekend' })
			.eq('id', awardId)
			.select('title');

		expect(allowedError).toBeNull();
		expect(allowed).toEqual([{ title: 'Best Delegate of the Weekend' }]);
	});

	it("lets an organiser confirm and unconfirm somebody else's proposal", async () => {
		const room = await createCommitteeRoom();
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);

		const { data: confirmed, error: confirmError } = await room.supabase
			.from('awards')
			.update({ status: 'confirmed' })
			.eq('id', awardId)
			.select('status');

		expect(confirmError).toBeNull();
		expect(confirmed).toEqual([{ status: 'confirmed' }]);

		const { data: unconfirmed, error: unconfirmError } = await room.supabase
			.from('awards')
			.update({ status: 'proposed' })
			.eq('id', awardId)
			.select('status');

		expect(unconfirmError).toBeNull();
		expect(unconfirmed).toEqual([{ status: 'proposed' }]);
	});

	it("refuses an organiser changing an award's title in the same statement", async () => {
		const room = await createCommitteeRoom();
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);

		// "org. (status)" in the matrix really means that one column. The wording
		// of an award belongs to the chair who proposed it.
		const { error } = await room.supabase
			.from('awards')
			.update({ status: 'confirmed', title: 'Best Delegate (renamed)' })
			.eq('id', awardId);

		expect(error?.message).toContain('Only the chair who proposed an award can reword it');

		expect(await awardsVisibleTo(room.supabase, awardId)).toEqual([
			{ title: 'Best Delegate', status: 'proposed' }
		]);
	});

	it('refuses the proposing chair confirming their own award', async () => {
		const room = await createCommitteeRoom();
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);

		// The award is the chair's own and still proposed, so the update policy
		// lets them write the row -- which is why `status` cannot be left to the
		// allow-list in `protect_awards_columns`. An award a chair could confirm
		// themselves would reach the delegate's profile and their notifications
		// at publish with no organiser ever having agreed, which is the whole of
		// awards.md step 2. The preset Chair role proposes awards; confirming
		// them is `confirm_awards`, which it does not hold.
		const { error } = await room.chair.supabase
			.from('awards')
			.update({ status: 'confirmed' })
			.eq('id', awardId);

		expect(error?.message).toContain(
			'Only the people who confirm awards can confirm or unconfirm one'
		);

		expect(await awardsVisibleTo(room.supabase, awardId)).toEqual([
			{ title: 'Best Delegate', status: 'proposed' }
		]);
	});

	it('refuses the proposing chair rewording and confirming in one statement', async () => {
		const room = await createCommitteeRoom();
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);

		// Rewording is theirs and confirming is not, so a statement that does
		// both is refused whole rather than half applied.
		const { error } = await room.chair.supabase
			.from('awards')
			.update({ title: 'Best Delegate of the Weekend', status: 'confirmed' })
			.eq('id', awardId);

		expect(error).not.toBeNull();

		expect(await awardsVisibleTo(room.supabase, awardId)).toEqual([
			{ title: 'Best Delegate', status: 'proposed' }
		]);
	});

	it('refuses a delegate and a stranger confirming an award', async () => {
		const room = await createCommitteeRoom();
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);
		const stranger = await createSignedInClient('Fixture Stranger');

		// Neither can see the row, so neither gets as far as the trigger: the
		// update matches nothing and says nothing.
		for (const client of [room.delegate.supabase, stranger.supabase]) {
			const { data, error } = await client
				.from('awards')
				.update({ status: 'confirmed' })
				.eq('id', awardId)
				.select('status');

			expect(error).toBeNull();
			expect(data).toEqual([]);
		}

		expect(await awardsVisibleTo(room.supabase, awardId)).toEqual([
			{ title: 'Best Delegate', status: 'proposed' }
		]);
	});

	it('refuses a chair moving one onto a seat of another committee', async () => {
		const room = await createCommitteeRoom();
		const other = await addSecondCommitteeWithSeat(room);
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);

		// `seat_id` is one of the columns `protect_awards_columns` lets the
		// proposing chair reword, so the seat has to be checked a second time on
		// the way in. The update policy's `with check` half carries the same
		// `exists` the insert policy does, and a `with check` that fails raises
		// rather than hiding the row.
		const { error } = await room.chair.supabase
			.from('awards')
			.update({ seat_id: other.seatId })
			.eq('id', awardId);

		expect(error).not.toBeNull();

		// The award still points at the seat the chair proposed it for.
		const { data } = await room.supabase.from('awards').select('seat_id').eq('id', awardId);

		expect(data).toEqual([{ seat_id: room.seatId }]);
	});
});

// The allow-list half of the "Trigger-protected columns" rule in the
// cross-cutting section of permissions.md: what an award IS and what it belongs
// to never changes from a browser at all.
describe('protect_awards_columns', () => {
	it('refuses a change to committee_id, even for the organiser', async () => {
		const room = await createCommitteeRoom();
		const other = await addSecondCommitteeWithSeat(room);
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);

		const { error } = await room.supabase
			.from('awards')
			.update({ committee_id: other.committeeId })
			.eq('id', awardId);

		expect(error?.message).toContain(
			'An award keeps the committee, the seat holder and the chair it was written with'
		);
	});

	it('refuses a change to created_by, even for the organiser', async () => {
		const room = await createCommitteeRoom();
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);

		// `created_by` is who may reword and delete the award, so an organiser who
		// could rewrite it would be taking a chair's proposal over.
		const { error } = await room.supabase
			.from('awards')
			.update({ created_by: room.userId })
			.eq('id', awardId);

		expect(error?.message).toContain(
			'An award keeps the committee, the seat holder and the chair it was written with'
		);
	});

	it('refuses a change to user_id, even for the organiser', async () => {
		const room = await createCommitteeRoom();
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);

		// Only `freeze_award_user` writes this column, and it gets through the
		// guard because it is `security definer`, which makes `current_user` the
		// database owner rather than `authenticated`.
		const { error } = await room.supabase
			.from('awards')
			.update({ user_id: room.delegate.userId })
			.eq('id', awardId);

		expect(error?.message).toContain(
			'An award keeps the committee, the seat holder and the chair it was written with'
		);
	});
});

// The `awards` delete column of permissions.md: "chair (own proposed); org."
describe('awards, deleting one', () => {
	it('lets the proposing chair delete their own proposal', async () => {
		const room = await createCommitteeRoom();
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);

		const { data, error } = await room.chair.supabase
			.from('awards')
			.delete()
			.eq('id', awardId)
			.select('id');

		expect(error).toBeNull();
		expect(data).toEqual([{ id: awardId }]);
	});

	it('refuses the proposing chair once an organiser has confirmed it', async () => {
		const room = await createCommitteeRoom();
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);
		await confirmAward(room.supabase, awardId);

		const { data, error } = await room.chair.supabase
			.from('awards')
			.delete()
			.eq('id', awardId)
			.select('id');

		expect(error).toBeNull();
		expect(data).toEqual([]);

		// The award is still there for the organiser who confirmed it.
		expect(await awardsVisibleTo(room.supabase, awardId)).toEqual([
			{ title: 'Best Delegate', status: 'confirmed' }
		]);
	});

	it("refuses a second chair of the same committee deleting somebody else's", async () => {
		const room = await createCommitteeRoom();
		const secondChair = await addSecondChair(room);
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);

		const { data, error } = await secondChair.supabase
			.from('awards')
			.delete()
			.eq('id', awardId)
			.select('id');

		expect(error).toBeNull();
		expect(data).toEqual([]);
		expect(await awardsVisibleTo(room.supabase, awardId)).toEqual([
			{ title: 'Best Delegate', status: 'proposed' }
		]);
	});

	it('lets the organiser delete any award of their conference, confirmed or not', async () => {
		const room = await createCommitteeRoom();
		const proposedAwardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);
		const confirmedAwardId = await proposeAward(
			room.chair.supabase,
			room.committeeId,
			room.seatId,
			{ kind: 'honourable_mention', title: 'Honourable Mention' }
		);
		await confirmAward(room.supabase, confirmedAwardId);

		const { data, error } = await room.supabase
			.from('awards')
			.delete()
			.in('id', [proposedAwardId, confirmedAwardId])
			.select('id');

		expect(error).toBeNull();
		expect(data).toHaveLength(2);
	});

	it('refuses a signed-in stranger', async () => {
		const room = await createCommitteeRoom();
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);
		const stranger = await createSignedInClient('Fixture Stranger');

		const { data, error } = await stranger.supabase
			.from('awards')
			.delete()
			.eq('id', awardId)
			.select('id');

		expect(error).toBeNull();
		expect(data).toEqual([]);
		expect(await awardsVisibleTo(room.supabase, awardId)).toEqual([
			{ title: 'Best Delegate', status: 'proposed' }
		]);
	});

	it('refuses the delegate the award is about', async () => {
		const room = await createCommitteeRoom();
		await publishConference(room);
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);
		await confirmAward(room.supabase, awardId);
		await publishAwards(room.supabase, room.conferenceId, minutesAgo(1));

		// The delegate can read this one through `published_awards`, because it
		// is confirmed and published, and reading is the whole of what they may
		// do with it.
		const { data, error } = await room.delegate.supabase
			.from('awards')
			.delete()
			.eq('id', awardId)
			.select('id');

		expect(error).toBeNull();
		expect(data).toEqual([]);
		expect(await publishedAwardsVisibleTo(room.delegate.supabase, awardId)).toEqual([
			{ title: 'Best Delegate', status: 'confirmed' }
		]);
	});
});

// awards.md step 3: "At publish, `freeze_award_user` copies the seat holder
// onto each confirmed award." An award belongs to a seat but is a person's to
// keep.
describe('freeze_award_user, the conferences_freeze_award_user trigger', () => {
	it("writes the seat's holder onto a confirmed award when the conference publishes", async () => {
		const room = await createCommitteeRoom();
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);
		await confirmAward(room.supabase, awardId);

		expect(await readFrozenUserId(room.supabase, awardId)).toBeNull();

		await publishAwards(room.supabase, room.conferenceId, minutesAgo(1));

		expect(await readFrozenUserId(room.supabase, awardId)).toBe(room.delegate.userId);
	});

	it('keeps the first holder when the seat changes hands and the awards are published again', async () => {
		const room = await createCommitteeRoom();
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);
		await confirmAward(room.supabase, awardId);
		await publishAwards(room.supabase, room.conferenceId, minutesAgo(10));

		const nextDelegate = await createSignedInClient('Fixture Next Delegate');
		await giveSeatTo(room.supabase, room.seatId, nextDelegate.userId);
		await publishAwards(room.supabase, room.conferenceId, minutesAgo(5));

		// This is the whole point of the word "freeze": the trigger only fills a
		// `user_id` that is still null, so the award stays with the person who was
		// sitting in the seat the first time the conference published, and a seat
		// that changes hands afterwards does not carry the award with it.
		expect(await readFrozenUserId(room.supabase, awardId)).toBe(room.delegate.userId);
	});

	it('leaves a proposal alone, because only a confirmed award has a holder', async () => {
		const room = await createCommitteeRoom();
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);

		await publishAwards(room.supabase, room.conferenceId, minutesAgo(1));

		expect(await readFrozenUserId(room.supabase, awardId)).toBeNull();
	});

	it('leaves user_id null when nobody is sitting in the seat', async () => {
		const room = await createCommitteeRoom();
		const emptySeatId = await addSeat(room.supabase, room.committeeId, 'Japan', 'JP');
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, emptySeatId);
		await confirmAward(room.supabase, awardId);

		await publishAwards(room.supabase, room.conferenceId, minutesAgo(1));

		expect(await readFrozenUserId(room.supabase, awardId)).toBeNull();
	});
});

// The `notify_awards_published` row of notifications.md: "every user with a
// confirmed award" is told "You received {title} in {committee}" with a link to
// `/profile`, and the row is dated at `awards_published_at`, which may be in
// the future.
describe('notify_awards_published, the conferences_notify_awards_published trigger', () => {
	it('tells the recipient of a confirmed award, at the moment the conference chose', async () => {
		const room = await createCommitteeRoom();
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);
		await confirmAward(room.supabase, awardId);

		const publishedAt = minutesAgo(1);
		await publishAwards(room.supabase, room.conferenceId, publishedAt);

		const notifications = await readAwardNotifications(room.delegate);

		expect(notifications).toHaveLength(1);
		expect(notifications[0].kind).toBe('award_published');
		expect(notifications[0].title).toBe(`You received Best Delegate in ${room.committeeName}`);
		expect(notifications[0].link_path).toBe('/profile');

		// The row is dated at the publish moment rather than at the moment the
		// organiser pressed the button, which is what lets a scheduled publish
		// work without anything running on a timer.
		expect(new Date(notifications[0].created_at).getTime()).toBe(new Date(publishedAt).getTime());
	});

	it('writes the row for a publish moment in the future and keeps it out of the bell', async () => {
		const room = await createCommitteeRoom();
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);
		await confirmAward(room.supabase, awardId);

		const publishedAt = tomorrow();
		await publishAwards(room.supabase, room.conferenceId, publishedAt);

		// The `notifications` select policy only returns rows dated `<= now()`.
		expect(await readAwardNotifications(room.delegate)).toEqual([]);

		// The row really is there, which is the one thing the recipient's own
		// client cannot show, so the service role client reads it instead.
		const onDisk = await readAwardNotificationsOnDisk(room.delegate.userId);

		expect(onDisk).toHaveLength(1);
		expect(new Date(onDisk[0].created_at).getTime()).toBe(new Date(publishedAt).getTime());
	});

	it('does not tell the same person twice when the organiser publishes again', async () => {
		const room = await createCommitteeRoom();
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId);
		await confirmAward(room.supabase, awardId);

		await publishAwards(room.supabase, room.conferenceId, minutesAgo(10));
		await publishAwards(room.supabase, room.conferenceId, minutesAgo(5));

		// A trigger never deletes a notification, so the only way not to say the
		// same thing twice is to look for the row first.
		expect(await readAwardNotifications(room.delegate)).toHaveLength(1);
	});

	it('tells somebody with a proposal nothing', async () => {
		const room = await createCommitteeRoom();
		await proposeAward(room.chair.supabase, room.committeeId, room.seatId);

		await publishAwards(room.supabase, room.conferenceId, minutesAgo(1));

		expect(await readAwardNotifications(room.delegate)).toEqual([]);
	});

	it('shortens a sentence over 99 characters and leaves the award whole', async () => {
		const room = await createCommitteeRoom();
		const awardId = await proposeAward(room.chair.supabase, room.committeeId, room.seatId, {
			kind: 'custom',
			title: LONG_AWARD_TITLE
		});
		await confirmAward(room.supabase, awardId);
		await publishAwards(room.supabase, room.conferenceId, minutesAgo(1));

		const wholeSentence = `You received ${LONG_AWARD_TITLE} in ${room.committeeName}`;
		const [notification] = await readAwardNotifications(room.delegate);

		expect(notification.title).toHaveLength(99);
		expect(notification.title.endsWith('…')).toBe(true);
		expect(notification.title.slice(0, 98)).toBe(wholeSentence.slice(0, 98));

		// Only the line in the bell is cut. The award keeps every word the chair
		// typed, the way an announcement does.
		expect(await awardsVisibleTo(room.supabase, awardId)).toEqual([
			{ title: LONG_AWARD_TITLE, status: 'confirmed' }
		]);
	});
});
