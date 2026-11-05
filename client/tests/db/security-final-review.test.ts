import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addApplication,
	addChair,
	addCommittee,
	addFee,
	addRole,
	addSeat,
	addStaff,
	createConferenceOwnedByMe,
	createOpenConferenceOwnedByMe,
	giveRole,
	giveSeatTo,
	type ConferenceFixture
} from './conference-fixtures';

// The holes the final review of the security fixes found still open, closed
// by migration 20261022170000_final_review_fixes (findings from
// docs/security-review-2026-10-10.md):
//
//   L8   a browser assigns to a committee only somebody already on the team,
//        because ensure_chair_is_staff put whoever was assigned on it (the
//        trigger committee_chairs_already_on_team, function
//        protect_committee_chairs_team, which asks
//        private.chair_is_off_the_team); and, from migration
//        20261022170100_chairs_leave_with_the_team, somebody who leaves the
//        team leaves its committees too (the trigger
//        conference_staff_takes_chairs_along, function
//        remove_chairs_of_departed_staff), so no chair row is left behind for
//        a change of title to put them back on it; and, from migration
//        20261022170200_team_rows_keep_their_person, a browser changes only
//        the title of a staff row or a chair row, a staff row moved off its
//        person takes their chair rows too (the trigger
//        conference_staff_moved_takes_chairs_along), and
//        private.lock_place_on_team makes a removal and an assignment wait for
//        each other (checked by hand in two psql sessions: a test request
//        cannot hold its transaction open while another runs);
//   L65  a committee's topics, and its agenda, have a ceiling
//        (committees_topics_bounded, through private.topics_are_bounded, and
//        committee_state_agenda_topic_length); and a quick session cannot be
//        archived out of the count of live ones;
//   L34, L35  revoke_seat locks the seat and the application it rejects, and
//        voids only the bills of the delegate who loses the seat.
//
// As everywhere in this folder, a refused insert comes back as an error, while
// a refused update comes back as no rows unless a trigger or a check raised.

/** A topic of exactly `length` characters. */
function topicOf(length: number): string {
	return 'T'.repeat(length);
}

/** Whether `userId` is on the conference's team, read past every policy. */
async function isOnTeam(conferenceId: string, userId: string): Promise<boolean> {
	const { data, error } = await createServiceRoleClient()
		.from('conference_staff')
		.select('user_id')
		.eq('conference_id', conferenceId)
		.eq('user_id', userId);

	if (error) {
		throw new Error(`Could not read the team: ${error.message}`);
	}

	return data.length > 0;
}

describe('L8: a browser assigns to a committee only somebody already on the team', () => {
	it('refuses moving an assignment onto somebody not on the team', async () => {
		const fixture = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const member = await createSignedInClient('Tomas Teammate');
		const newcomer = await createSignedInClient('Nadia Newcomer');
		await addStaff(fixture.supabase, fixture.conferenceId, member.userId);

		const { error: assignError } = await fixture.supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: member.userId });

		expect(assignError).toBeNull();

		// An update that names somebody else is a new assignment in disguise.
		// Since 20261022170200 a browser may not change the person at all, so
		// the grant refuses it before ensure_chair_is_staff could fire.
		const { error: movedError } = await fixture.supabase
			.from('committee_chairs')
			.update({ user_id: newcomer.userId })
			.eq('committee_id', committeeId)
			.eq('user_id', member.userId);

		expect(movedError?.code).toBe('42501');
		expect(movedError?.message).toContain('permission denied');
		expect(await isOnTeam(fixture.conferenceId, newcomer.userId)).toBe(false);

		// A change of title keeps the same person, and goes through.
		const { data: retitled } = await fixture.supabase
			.from('committee_chairs')
			.update({ title: 'Co-chair' })
			.eq('committee_id', committeeId)
			.eq('user_id', member.userId)
			.select('title');

		expect(retitled).toEqual([{ title: 'Co-chair' }]);
	});

	it('lets an administrator chair a committee themselves, as "Chair it yourself" does', async () => {
		const fixture = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);

		const { error } = await fixture.supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: fixture.userId });

		expect(error).toBeNull();
	});

	it('tells somebody who does not run the team nothing about who is on it', async () => {
		const fixture = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const member = await createSignedInClient('Tomas Teammate');
		const newcomer = await createSignedInClient('Nadia Newcomer');
		const stranger = await createSignedInClient('Sam Stranger');
		await addStaff(fixture.supabase, fixture.conferenceId, member.userId);

		// Both are refused by the insert policy, in the same words, whether or
		// not the person named is on the team.
		const { error: memberError } = await stranger.supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: member.userId });
		const { error: newcomerError } = await stranger.supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: newcomer.userId });

		expect(memberError?.message).toContain('row-level security');
		expect(newcomerError?.message).toContain('row-level security');
	});
});

/** The chair rows `userId` holds on this committee, read past every policy. */
async function chairRowsOf(committeeId: string, userId: string): Promise<string[]> {
	const { data, error } = await createServiceRoleClient()
		.from('committee_chairs')
		.select('title')
		.eq('committee_id', committeeId)
		.eq('user_id', userId);

	if (error) {
		throw new Error(`Could not read the chairs: ${error.message}`);
	}

	return data.map((row) => row.title);
}

describe('L8: leaving the team leaves its committees (remove_chairs_of_departed_staff)', () => {
	it('takes a removed chair off the committee, so a team manager cannot retitle them back onto the team', async () => {
		const fixture = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const chair = await createSignedInClient('Rosa Removed');
		const manager = await createSignedInClient('Milo Manager');
		await addChair(fixture.supabase, committeeId, chair.userId);
		const managerRoleId = await addRole(fixture.supabase, fixture.conferenceId, {
			name: 'Team runner',
			permissions: ['manage_team']
		});
		await giveRole(fixture.supabase, fixture.conferenceId, manager.userId, managerRoleId);

		const { data: removed } = await fixture.supabase
			.from('conference_staff')
			.delete()
			.eq('conference_id', fixture.conferenceId)
			.eq('user_id', chair.userId)
			.select('user_id');

		expect(removed).toEqual([{ user_id: chair.userId }]);
		expect(await chairRowsOf(committeeId, chair.userId)).toEqual([]);

		// The way back the final review's check found: a change of title on the
		// row left behind, which ensure_chair_is_staff answered by putting the
		// person on the team again. There is no row left to change.
		const { data: retitled, error } = await manager.supabase
			.from('committee_chairs')
			.update({ title: 'Sneaked back' })
			.eq('committee_id', committeeId)
			.eq('user_id', chair.userId)
			.select('title');

		expect(error).toBeNull();
		expect(retitled).toEqual([]);
		expect(await isOnTeam(fixture.conferenceId, chair.userId)).toBe(false);
	});

	it('takes somebody who leaves on their own off its committees, and leaves the other chairs alone', async () => {
		const fixture = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const otherCommitteeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const leaving = await createSignedInClient('Lena Leaving');
		const staying = await createSignedInClient('Sven Staying');
		await addChair(fixture.supabase, committeeId, leaving.userId);
		await addChair(fixture.supabase, committeeId, staying.userId);

		// A second committee for the same person: they are on the team and hold
		// the Chair role already, so only the assignment is new.
		const { error: secondError } = await fixture.supabase
			.from('committee_chairs')
			.insert({ committee_id: otherCommitteeId, user_id: leaving.userId });

		expect(secondError).toBeNull();

		const { data: left } = await leaving.supabase
			.from('conference_staff')
			.delete()
			.eq('conference_id', fixture.conferenceId)
			.eq('user_id', leaving.userId)
			.select('user_id');

		expect(left).toEqual([{ user_id: leaving.userId }]);
		expect(await chairRowsOf(committeeId, leaving.userId)).toEqual([]);
		expect(await chairRowsOf(otherCommitteeId, leaving.userId)).toEqual([]);
		expect(await chairRowsOf(committeeId, staying.userId)).toEqual(['Chair']);
	});

	it('leaves their chair rows on another conference that they are still on the team of', async () => {
		const fixture = await createConferenceOwnedByMe();
		const other = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const otherCommitteeId = await addCommittee(other.supabase, other.conferenceId);
		const chair = await createSignedInClient('Bea Both');
		await addChair(fixture.supabase, committeeId, chair.userId);
		await addChair(other.supabase, otherCommitteeId, chair.userId);

		await fixture.supabase
			.from('conference_staff')
			.delete()
			.eq('conference_id', fixture.conferenceId)
			.eq('user_id', chair.userId);

		expect(await chairRowsOf(committeeId, chair.userId)).toEqual([]);
		expect(await chairRowsOf(otherCommitteeId, chair.userId)).toEqual(['Chair']);
		expect(await isOnTeam(other.conferenceId, chair.userId)).toBe(true);
	});
});

/** Puts somebody on the team with no role, as ensure_chair_is_staff does for a new chair. */
async function addBareStaff(conferenceId: string, userId: string): Promise<void> {
	const { error } = await createServiceRoleClient()
		.from('conference_staff')
		.insert({ conference_id: conferenceId, user_id: userId });

	if (error) {
		throw new Error(`Could not put the fixture person on the team: ${error.message}`);
	}
}

describe('L8: a staff row and a chair row keep their person (20261022170200)', () => {
	it('refuses a team manager pointing somebody’s staff row at another account or conference', async () => {
		const fixture = await createConferenceOwnedByMe();
		const other = await createConferenceOwnedByMe();
		const manager = await createSignedInClient('Milo Manager');
		const member = await createSignedInClient('Yara Member');
		const stranger = await createSignedInClient('Zed Stranger');
		const managerRoleId = await addRole(fixture.supabase, fixture.conferenceId, {
			name: 'Team runner',
			permissions: ['manage_team']
		});
		await giveRole(fixture.supabase, fixture.conferenceId, manager.userId, managerRoleId);
		await addBareStaff(fixture.conferenceId, member.userId);

		const { error: personError } = await manager.supabase
			.from('conference_staff')
			.update({ user_id: stranger.userId })
			.eq('conference_id', fixture.conferenceId)
			.eq('user_id', member.userId);
		const { error: conferenceError } = await fixture.supabase
			.from('conference_staff')
			.update({ conference_id: other.conferenceId })
			.eq('conference_id', fixture.conferenceId)
			.eq('user_id', member.userId);

		expect(personError?.code).toBe('42501');
		expect(conferenceError?.code).toBe('42501');
		expect(await isOnTeam(fixture.conferenceId, stranger.userId)).toBe(false);
		expect(await isOnTeam(fixture.conferenceId, member.userId)).toBe(true);
		expect(await isOnTeam(other.conferenceId, member.userId)).toBe(false);

		// The title is still theirs to change, as updateStaffTitle does.
		const { data: retitled } = await manager.supabase
			.from('conference_staff')
			.update({ title: 'Logistics' })
			.eq('conference_id', fixture.conferenceId)
			.eq('user_id', member.userId)
			.select('title');

		expect(retitled).toEqual([{ title: 'Logistics' }]);
	});

	it('refuses moving a chair row to another committee, and still takes a new title', async () => {
		const fixture = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const otherCommitteeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const chair = await createSignedInClient('Carla Chair');
		await addChair(fixture.supabase, committeeId, chair.userId);

		const { error: movedError } = await fixture.supabase
			.from('committee_chairs')
			.update({ committee_id: otherCommitteeId })
			.eq('committee_id', committeeId)
			.eq('user_id', chair.userId);

		expect(movedError?.code).toBe('42501');
		expect(await chairRowsOf(otherCommitteeId, chair.userId)).toEqual([]);

		const { data: retitled } = await fixture.supabase
			.from('committee_chairs')
			.update({ title: 'Co-chair' })
			.eq('committee_id', committeeId)
			.eq('user_id', chair.userId)
			.select('title');

		expect(retitled).toEqual([{ title: 'Co-chair' }]);
	});

	it('takes the chair rows away when a staff row is moved off its person, and not on a new title', async () => {
		const fixture = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const moved = await createSignedInClient('Mara Moved');
		const kept = await createSignedInClient('Kofi Kept');
		const newcomer = await createSignedInClient('Nadia Newcomer');
		await addBareStaff(fixture.conferenceId, moved.userId);
		await addBareStaff(fixture.conferenceId, kept.userId);

		for (const person of [moved, kept]) {
			const { error } = await fixture.supabase
				.from('committee_chairs')
				.insert({ committee_id: committeeId, user_id: person.userId });

			expect(error).toBeNull();
		}

		// Only a writer the grants do not stop can make this change now, such as
		// the service role here.
		const serviceRole = createServiceRoleClient();
		const { error: movedError } = await serviceRole
			.from('conference_staff')
			.update({ user_id: newcomer.userId })
			.eq('conference_id', fixture.conferenceId)
			.eq('user_id', moved.userId);
		const { error: retitledError } = await serviceRole
			.from('conference_staff')
			.update({ title: 'Archivist' })
			.eq('conference_id', fixture.conferenceId)
			.eq('user_id', kept.userId);

		expect(movedError).toBeNull();
		expect(retitledError).toBeNull();
		expect(await chairRowsOf(committeeId, moved.userId)).toEqual([]);
		expect(await chairRowsOf(committeeId, kept.userId)).toEqual(['Chair']);
	});

	it('refuses somebody chairing a committee themselves when they may not run its team', async () => {
		const fixture = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const stranger = await createSignedInClient('Sam Stranger');

		const { error } = await stranger.supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: stranger.userId });

		// The insert policy would refuse this row too, with the same code, so the
		// message is what shows the refusal is protect_committee_chairs_team's.
		expect(error?.code).toBe('42501');
		expect(error?.message).toContain('Invite them first');
		expect(await isOnTeam(fixture.conferenceId, stranger.userId)).toBe(false);
	});
});

describe('L65: a committee holds at most 50 topics of at most 200 characters', () => {
	it('refuses a topic of 201 characters and a 51st topic, and takes 50 of 200', async () => {
		const fixture = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);

		function setTopics(topics: string[]) {
			return fixture.supabase
				.from('committees')
				.update({ topics })
				.eq('id', committeeId)
				.select('id');
		}

		const tooLong = await setTopics([topicOf(201)]);
		const tooMany = await setTopics(Array.from({ length: 51 }, (_, index) => `Topic ${index}`));
		const atTheLine = await setTopics(Array.from({ length: 50 }, () => topicOf(200)));

		expect(tooLong.error?.message).toContain('committees_topics_bounded');
		expect(tooMany.error?.message).toContain('committees_topics_bounded');
		expect(atTheLine.error).toBeNull();
		expect(atTheLine.data).toEqual([{ id: committeeId }]);
	});

	it('refuses an agenda of 201 characters, even from the server', async () => {
		const fixture = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
		const service = createServiceRoleClient();

		// An update of the agenda meets check_committee_agenda_topic first, which
		// asks that it is one of the topics, and those are bounded above. The
		// check is for the row written whole, which is what this does.
		await service.from('committee_state').delete().eq('committee_id', committeeId);
		const { error } = await service
			.from('committee_state')
			.insert({ committee_id: committeeId, agenda_topic: topicOf(201) });

		expect(error?.message).toContain('committee_state_agenda_topic_length');
	});

	it('refuses a quick session started with a topic of 201 characters', async () => {
		const creator = await createSignedInClient('Quinn Quick');

		const { error } = await startQuickSession(creator.supabase, topicOf(201));

		expect(error?.message).toContain('committees_topics_bounded');
	});
});

describe('L65: a quick session cannot leave the count of live ones by being archived', () => {
	it('refuses the creator archiving a quick session (conferences_quick_session_is_draft)', async () => {
		const creator = await createSignedInClient('Quinn Quick');
		const { data: started, error: startError } = await startQuickSession(creator.supabase, null);
		const address = started?.[0];

		if (startError || !address) {
			throw new Error(`The quick session was refused: ${startError?.message}`);
		}

		// create_quick_session leaves archived conferences out of its count of
		// 25, so an archived quick session would make room for another. The
		// check keeps every quick session a draft, so none ever is archived.
		const { error } = await creator.supabase
			.from('conferences')
			.update({ status: 'archived' })
			.eq('slug', address.conference_slug);

		expect(error?.message).toContain('conferences_quick_session_is_draft');
	});
});

/** "Start session" on /quick/new as `client`, with two members and `topic`. */
function startQuickSession(client: SupabaseClient, topic: string | null) {
	return client.rpc('create_quick_session', {
		committee_name: 'Security Council',
		committee_slug: 'security-council',
		topic,
		speaking_time_seconds: 90,
		seats: [
			{ name: 'France', country_code: 'FR' },
			{ name: 'Germany', country_code: 'DE' }
		],
		timezone: 'Europe/Amsterdam'
	});
}

/** An open conference charging one individual fee, with one committee of two seats. */
async function createConferenceWithTwoSeats() {
	const organiser = await createOpenConferenceOwnedByMe();
	await addFee(organiser.supabase, organiser.conferenceId, 'Delegate fee', 5000, {
		appliesTo: 'individual'
	});
	const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
	const firstSeatId = await addSeat(organiser.supabase, committeeId, 'France', 'FR');
	const secondSeatId = await addSeat(organiser.supabase, committeeId, 'Japan', 'JP');

	return { organiser, committeeId, firstSeatId, secondSeatId };
}

/** A new person whose submitted application `organiser` accepts into `seatId`. */
async function acceptNewApplicant(
	organiser: ConferenceFixture,
	committeeId: string,
	seatId: string,
	fullName: string
): Promise<SignedInClient & { applicationId: string }> {
	const applicant = await createSignedInClient(fullName);
	const applicationId = await addApplication(applicant.supabase, organiser.conferenceId, {
		committeePreferences: [committeeId]
	});
	const { error } = await organiser.supabase.rpc('accept_application', {
		application_id: applicationId,
		seat_id: seatId
	});

	if (error) {
		throw new Error(`Could not accept the fixture application: ${error.message}`);
	}

	return { ...applicant, applicationId };
}

/** Each invoice of the conference as payer, seat and status, read past every policy. */
async function readInvoices(conferenceId: string) {
	const { data, error } = await createServiceRoleClient()
		.from('invoices')
		.select('payer_user_id, seat_id, status')
		.eq('conference_id', conferenceId);

	if (error) {
		throw new Error(`Could not read the invoices: ${error.message}`);
	}

	return data;
}

/** An application's status, read past every policy. */
async function readApplicationStatus(applicationId: string): Promise<string | undefined> {
	const { data } = await createServiceRoleClient()
		.from('applications')
		.select('status')
		.eq('id', applicationId)
		.single();

	return data?.status;
}

describe('L34 and L35: revoke_seat acts on one delegate', () => {
	// A test that talks to PostgREST cannot hold two transactions open at
	// once, so the race with swap_delegates itself was checked by hand in two
	// psql sessions. These pin down what the function does to the one delegate
	// it finds in the seat.
	it('voids only the unpaid bills of the delegate who loses the seat', async () => {
		const { organiser, committeeId, firstSeatId } = await createConferenceWithTwoSeats();
		const ana = await acceptNewApplicant(organiser, committeeId, firstSeatId, 'Ana Silva');

		// Somebody else with a part in the conference, billed by hand against
		// the same seat. Before the fix revoke_seat voided every unpaid invoice
		// on the seat, whoever owed it.
		const otherCommitteeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const otherSeatId = await addSeat(organiser.supabase, otherCommitteeId);
		const bruno = await createSignedInClient('Bruno Costa');
		await giveSeatTo(organiser.supabase, otherSeatId, bruno.userId);
		const { error: raiseError } = await organiser.supabase.from('invoices').insert({
			conference_id: organiser.conferenceId,
			payer_user_id: bruno.userId,
			seat_id: firstSeatId,
			description: 'Late registration · Fixture Conference',
			quantity: 1,
			unit_amount_cents: 2000,
			currency: 'EUR'
		});

		expect(raiseError).toBeNull();

		const { error } = await organiser.supabase.rpc('revoke_seat', { seat_id: firstSeatId });

		expect(error).toBeNull();

		const invoices = await readInvoices(organiser.conferenceId);
		expect(invoices).toEqual(
			expect.arrayContaining([
				{ payer_user_id: ana.userId, seat_id: firstSeatId, status: 'void' },
				{ payer_user_id: bruno.userId, seat_id: firstSeatId, status: 'unpaid' }
			])
		);
		expect(await readApplicationStatus(ana.applicationId)).toBe('rejected');
	});

	it('rejects, unseats and voids whoever a swap left in the seat, and leaves the other alone', async () => {
		const { organiser, committeeId, firstSeatId, secondSeatId } =
			await createConferenceWithTwoSeats();
		const ana = await acceptNewApplicant(organiser, committeeId, firstSeatId, 'Ana Silva');
		const beatriz = await acceptNewApplicant(organiser, committeeId, secondSeatId, 'Beatriz Costa');

		const { error: swapError } = await organiser.supabase.rpc('swap_delegates', {
			first_seat_id: firstSeatId,
			second_seat_id: secondSeatId
		});

		expect(swapError).toBeNull();

		const { error } = await organiser.supabase.rpc('revoke_seat', { seat_id: firstSeatId });

		expect(error).toBeNull();
		expect(await readApplicationStatus(beatriz.applicationId)).toBe('rejected');
		expect(await readApplicationStatus(ana.applicationId)).toBe('accepted');

		const { data: seats } = await createServiceRoleClient()
			.from('seats')
			.select('id, user_id, application_id')
			.in('id', [firstSeatId, secondSeatId]);

		expect(seats).toEqual(
			expect.arrayContaining([
				{ id: firstSeatId, user_id: null, application_id: null },
				{ id: secondSeatId, user_id: ana.userId, application_id: ana.applicationId }
			])
		);

		const invoices = await readInvoices(organiser.conferenceId);
		expect(invoices).toEqual(
			expect.arrayContaining([
				{ payer_user_id: beatriz.userId, seat_id: firstSeatId, status: 'void' },
				{ payer_user_id: ana.userId, seat_id: secondSeatId, status: 'unpaid' }
			])
		);
	});
});
