import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	createVisitorClient,
	type SignedInClient
} from './supabase-test-client';
import { addChair, createCommitteeRoom, createConferenceOwnedByMe } from './conference-fixtures';
import { listTimezones } from '../../src/lib/timezones';

// Quick sessions (S14, D7): specs/02-architecture/data-model.md ("Quick
// sessions"), specs/02-architecture/permissions.md ("Quick sessions") and
// specs/05-pages/chair/quick-session.md.
//
// A quick session is a conference of kind 'quick_session', always a draft,
// holding one committee. `create_quick_session` makes all of it as the caller,
// through the same policies /create and the committee editor use, in one
// transaction. These tests show what it makes, that it writes everything or
// nothing, that nobody but its creator ever reads it, that a session started on
// a later day moves its last day, and that deleting the account takes it along.

/** The members a fixture quick session is made with, in the order the setup screen lists them. */
const MEMBERS = [
	{ name: 'France', country_code: 'FR' },
	{ name: 'Germany', country_code: 'DE' },
	{ name: 'Amnesty International', country_code: null }
];

/** What `makeQuickSession` may be told to do differently. */
type QuickSessionFields = {
	committeeName?: string;
	committeeSlug?: string;
	topic?: string | null;
	speakingTimeSeconds?: number;
	seats?: unknown;
	timezone?: string | null;
};

/** "Start session" on /quick/new, as `client`, answering what the database said. */
function makeQuickSession(client: SupabaseClient, fields: QuickSessionFields = {}) {
	return client.rpc('create_quick_session', {
		committee_name: fields.committeeName ?? 'Security Council',
		committee_slug: fields.committeeSlug ?? 'security-council',
		topic: fields.topic === undefined ? 'Humanitarian access' : fields.topic,
		speaking_time_seconds: fields.speakingTimeSeconds ?? 90,
		seats: fields.seats ?? MEMBERS,
		timezone: fields.timezone === undefined ? 'Europe/Amsterdam' : fields.timezone
	});
}

/** The slugs a successful `create_quick_session` answered with. */
type QuickSessionAddress = { conference_slug: string; committee_slug: string };

/** Make a quick session as `creator`, failing the test if it was refused. */
async function startQuickSession(
	creator: SignedInClient,
	fields: QuickSessionFields = {}
): Promise<QuickSessionAddress> {
	const { data, error } = await makeQuickSession(creator.supabase, fields);

	if (error || !data) throw new Error(`Could not make the quick session: ${error?.message}`);

	const [address] = data as QuickSessionAddress[];

	return address;
}

/** Today's date in `timezone` as Postgres writes a date, at the moment `at`. */
function dayIn(timezone: string, at = new Date()): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(at);
}

/** The quick session's conference, read by `reader`, or null when they cannot see it. */
async function readConference(reader: SupabaseClient, slug: string) {
	const { data } = await reader
		.from('conferences')
		.select(
			'id, kind, status, city, country_code, timezone, start_date, end_date, organization_id, accepts_individual_applications, accepts_delegations, position_paper_required, committee_preference_count'
		)
		.eq('slug', slug)
		.maybeSingle();

	return data;
}

/** The quick session's one committee, read by its creator. */
async function readCommittee(creator: SignedInClient, conferenceId: string) {
	const { data, error } = await creator.supabase
		.from('committees')
		.select('id, name, slug, topics, default_speaking_time_seconds')
		.eq('conference_id', conferenceId)
		.single();

	if (error || !data) throw new Error(`Could not read the committee: ${error?.message}`);

	return data;
}

describe('create_quick_session, a committee with no conference around it', () => {
	it('makes the personal organisation, a draft quick session for today, its committee, seats, chair rows, agenda and first session', async () => {
		const creator = await createSignedInClient('Quick Chair');
		const before = dayIn('Pacific/Kiritimati');

		const address = await startQuickSession(creator, { timezone: 'Pacific/Kiritimati' });

		expect(address.conference_slug).toMatch(/^quick-[a-z0-9]{10}$/);
		expect(address.committee_slug).toBe('security-council');

		const conference = await readConference(creator.supabase, address.conference_slug);
		expect(conference).toMatchObject({
			kind: 'quick_session',
			status: 'draft',
			city: null,
			country_code: null,
			timezone: 'Pacific/Kiritimati',
			accepts_individual_applications: false,
			accepts_delegations: false,
			position_paper_required: false,
			committee_preference_count: 0
		});
		// Its first and last day are today in its own timezone, here fourteen
		// hours ahead of UTC, so the database's own date would often be wrong.
		expect([before, dayIn('Pacific/Kiritimati')]).toContain(conference?.start_date);
		expect(conference?.end_date).toBe(conference?.start_date);

		const { data: organization } = await creator.supabase
			.from('organizations')
			.select('name, slug, is_personal, created_by')
			.eq('id', conference?.organization_id)
			.single();
		expect(organization).toMatchObject({
			name: 'Quick sessions',
			is_personal: true,
			created_by: creator.userId
		});
		expect(organization?.slug).toMatch(/^personal-[a-z0-9]{10}$/);

		const committee = await readCommittee(creator, conference?.id);
		expect(committee).toMatchObject({
			name: 'Security Council',
			slug: 'security-council',
			topics: ['Humanitarian access'],
			default_speaking_time_seconds: 90
		});

		const { data: seats } = await creator.supabase
			.from('seats')
			.select('name, kind, country_code, position')
			.eq('committee_id', committee.id)
			.order('position');
		expect(seats).toEqual([
			{ name: 'France', kind: 'country', country_code: 'FR', position: 0 },
			{ name: 'Germany', kind: 'country', country_code: 'DE', position: 1 },
			{ name: 'Amnesty International', kind: 'other', country_code: null, position: 2 }
		]);

		const { data: chairs } = await creator.supabase
			.from('committee_chairs')
			.select('user_id, title')
			.eq('committee_id', committee.id);
		expect(chairs).toEqual([{ user_id: creator.userId, title: 'Chair' }]);

		// The chair row put the creator on the team (ensure_chair_is_staff). What
		// they may do comes from owning the personal organisation, not from a
		// role on this row, which is why there is none to assert on.
		const { data: staff } = await creator.supabase
			.from('conference_staff')
			.select('user_id')
			.eq('conference_id', conference?.id);
		expect(staff).toEqual([{ user_id: creator.userId }]);

		const { data: sessions } = await creator.supabase
			.from('committee_sessions')
			.select('id, name, status')
			.eq('committee_id', committee.id);
		expect(sessions).toEqual([
			{ id: expect.any(String), name: 'Session 1', status: 'in_progress' }
		]);

		const { data: state } = await creator.supabase
			.from('committee_state')
			.select('mode, current_session_id, agenda_topic, active_speakers_list_id')
			.eq('committee_id', committee.id)
			.single();
		expect(state).toMatchObject({
			mode: 'formal_debate',
			current_session_id: sessions?.[0].id,
			agenda_topic: 'Humanitarian access'
		});
		expect(state?.active_speakers_list_id).not.toBeNull();
	});

	it('makes its creator the organiser and the chair, as permissions.md says', async () => {
		const creator = await createSignedInClient('Quick Chair');
		const address = await startQuickSession(creator);
		const conference = await readConference(creator.supabase, address.conference_slug);
		const committee = await readCommittee(creator, conference?.id);

		const { data: isOrganiser } = await creator.supabase.rpc('has_permission', {
			conference_id: conference?.id,
			permission: 'administrator'
		});
		const { data: isChair } = await creator.supabase.rpc('has_committee_permission', {
			committee_id: committee.id,
			permission: 'run_room'
		});

		expect(isOrganiser).toBe(true);
		expect(isChair).toBe(true);
	});

	it('puts a second quick session in the same personal organisation', async () => {
		const creator = await createSignedInClient('Quick Chair');
		const first = await startQuickSession(creator);
		const second = await startQuickSession(creator, { committeeName: 'Human Rights Council' });

		const firstConference = await readConference(creator.supabase, first.conference_slug);
		const secondConference = await readConference(creator.supabase, second.conference_slug);

		expect(second.conference_slug).not.toBe(first.conference_slug);
		expect(secondConference?.organization_id).toBe(firstConference?.organization_id);

		const { data: personal } = await creator.supabase
			.from('organizations')
			.select('id')
			.eq('created_by', creator.userId)
			.eq('is_personal', true);
		expect(personal).toHaveLength(1);
	});

	it('leaves the topics and the agenda empty without a topic, and is in Amsterdam without a timezone', async () => {
		const creator = await createSignedInClient('Quick Chair');

		const address = await startQuickSession(creator, { topic: '  ', timezone: null });

		const conference = await readConference(creator.supabase, address.conference_slug);
		const committee = await readCommittee(creator, conference?.id);
		const { data: state } = await creator.supabase
			.from('committee_state')
			.select('agenda_topic')
			.eq('committee_id', committee.id)
			.single();

		expect(conference?.timezone).toBe('Europe/Amsterdam');
		expect(committee.topics).toEqual([]);
		expect(state?.agenda_topic).toBeNull();
	});

	it('writes everything or nothing: a member given twice leaves no quick session and no organisation behind', async () => {
		const creator = await createSignedInClient('Quick Chair');
		const twice = [
			{ name: 'France', country_code: 'FR' },
			{ name: 'France', country_code: 'FR' }
		];

		const { error } = await makeQuickSession(creator.supabase, { seats: twice });

		// 23505 is unique_violation: `unique (committee_id, name)` on seats.
		expect(error?.code).toBe('23505');

		const { data: organizations } = await creator.supabase
			.from('organizations')
			.select('id')
			.eq('created_by', creator.userId);
		const { data: conferences } = await creator.supabase
			.from('conferences_with_organization')
			.select('id')
			.eq('created_by', creator.userId);
		expect(organizations).toEqual([]);
		expect(conferences).toEqual([]);
	});

	it('refuses a blank name, too few or too many members, a nameless member, no speaking time and an unknown timezone', async () => {
		const creator = await createSignedInClient('Quick Chair');
		const tooMany = Array.from({ length: 301 }, (_, index) => ({
			name: `Member ${index}`,
			country_code: null
		}));
		const cases: { fields: QuickSessionFields; refusal: string }[] = [
			{ fields: { committeeName: '  ' }, refusal: "Please enter the committee's name." },
			{
				fields: { seats: [MEMBERS[0]] },
				refusal: 'A quick session needs at least two delegations.'
			},
			{ fields: { seats: {} }, refusal: 'A quick session needs at least two delegations.' },
			{ fields: { seats: tooMany }, refusal: 'A quick session holds at most 300 delegations.' },
			{
				fields: { seats: [MEMBERS[0], { name: ' ', country_code: 'DE' }] },
				refusal: 'Every delegation needs a name.'
			},
			{
				fields: { speakingTimeSeconds: 0 },
				refusal: 'The speaking time must be a positive number of seconds.'
			},
			{
				fields: { timezone: 'Mars/Olympus_Mons' },
				refusal: 'That is not a timezone the database knows.'
			},
			// Postgres would read a POSIX rule and an abbreviation as a zone, but
			// the browser's Intl refuses both, so the function does too.
			{ fields: { timezone: 'XYZ+3' }, refusal: 'That is not a timezone the database knows.' },
			{ fields: { timezone: 'PST' }, refusal: 'That is not a timezone the database knows.' },
			{
				fields: { timezone: 'posix/Europe/Amsterdam' },
				refusal: 'That is not a timezone the database knows.'
			}
		];

		for (const { fields, refusal } of cases) {
			const { error } = await makeQuickSession(creator.supabase, fields);
			expect(error?.message).toBe(refusal);
		}

		const { data: organizations } = await creator.supabase
			.from('organizations')
			.select('id')
			.eq('created_by', creator.userId);
		expect(organizations).toEqual([]);
	});

	it('accepts every timezone the setup page can send, each as the day it is there', async () => {
		// 20261001121500 checks the zone by working out today's date in it
		// rather than reading pg_timezone_names, so every name the app offers
		// (`$lib/timezones.ts`, which `readQuickSessionForm` keeps a browser's
		// zone to) is asked for once here.
		//
		// Migration 20261022120000 lets one person have 25 live quick sessions,
		// so a fresh account takes over every 25 zones.
		let creator = await createSignedInClient('Quick Chair');
		const timezones = listTimezones().flatMap((group) => group.timezones);

		for (const [index, timezone] of timezones.entries()) {
			if (index > 0 && index % 25 === 0) {
				creator = await createSignedInClient('Quick Chair');
			}

			const address = await startQuickSession(creator, { timezone });
			const conference = await readConference(creator.supabase, address.conference_slug);

			expect(conference?.timezone, timezone).toBe(timezone);
			expect(conference?.start_date, timezone).toBe(dayIn(timezone));
		}
		// Ninety quick sessions and a few sign-ups: well over the suite's 20 s on
		// a busy machine.
	}, 120_000);

	it('refuses a visitor who is not signed in', async () => {
		const { error } = await makeQuickSession(createVisitorClient());

		// The function is granted to signed-in users only.
		expect(error?.code).toBe('42501');
	});
});

describe('a quick session is never public', () => {
	it('is in no list a visitor or another signed-in user reads', async () => {
		const creator = await createSignedInClient('Quick Chair');
		const address = await startQuickSession(creator);
		const conference = await readConference(creator.supabase, address.conference_slug);
		const committee = await readCommittee(creator, conference?.id);
		const stranger = await createSignedInClient('Stranger');

		for (const reader of [createVisitorClient(), stranger.supabase]) {
			expect(await readConference(reader, address.conference_slug)).toBeNull();

			const { data: directory } = await reader
				.from('conferences_with_organization')
				.select('id')
				.eq('slug', address.conference_slug);
			const { data: committees } = await reader
				.from('committees')
				.select('id')
				.eq('id', committee.id);
			const { data: publicSeats } = await reader
				.from('public_seats')
				.select('id')
				.eq('committee_id', committee.id);

			expect(directory).toEqual([]);
			expect(committees).toEqual([]);
			expect(publicSeats).toEqual([]);
		}
	});

	it('shows its creator its kind in the directory view, so the organiser’s lists can leave it out', async () => {
		const creator = await createSignedInClient('Quick Chair');
		const address = await startQuickSession(creator);

		const { data } = await creator.supabase
			.from('conferences_with_organization')
			.select('kind, organization_name')
			.eq('slug', address.conference_slug)
			.single();

		expect(data).toEqual({ kind: 'quick_session', organization_name: 'Quick sessions' });
	});

	it('cannot be published, while an ordinary conference still needs a place to go public', async () => {
		const creator = await createSignedInClient('Quick Chair');
		const address = await startQuickSession(creator);

		const { error: publishError } = await creator.supabase
			.from('conferences')
			.update({ status: 'published' })
			.eq('slug', address.conference_slug);
		expect(publishError?.message).toContain('conferences_quick_session_is_draft');

		// A draft may still be looking for its city (the creation redesign,
		// Trello fe3reN7Y), so the place is only insisted on once it goes public.
		// It goes public by an update: since the security review a conference is
		// always inserted as a draft (security-conference-lifecycle-limits.test.ts).
		const organiser = await createConferenceOwnedByMe();
		const { data: nowhere, error: draftError } = await organiser.supabase
			.from('conferences')
			.insert({
				name: 'Nowhere MUN',
				slug: `nowhere-mun-${crypto.randomUUID()}`,
				start_date: '2020-03-01',
				end_date: '2020-03-03',
				organization_id: organiser.organizationId,
				created_by: organiser.userId
			})
			.select('id')
			.single();
		expect(draftError).toBeNull();

		const { error: placeError } = await organiser.supabase
			.from('conferences')
			.update({ status: 'published' })
			.eq('id', nowhere?.id ?? '');
		expect(placeError?.message).toContain('conferences_place_unless_quick_session');
	});
});

describe('move_quick_session_end_date, a quick session kept for another evening', () => {
	/** End the running session and start the next one as `chair`, pressed at `pressedAt`. */
	async function startNextSession(
		creator: SignedInClient,
		chair: SignedInClient,
		committeeId: string,
		pressedAt: Date
	) {
		await creator.supabase
			.from('committee_sessions')
			.update({ status: 'ended' })
			.eq('committee_id', committeeId);

		const { error } = await chair.supabase.rpc('start_committee_session', {
			committee_id: committeeId,
			name: 'Session 2',
			pressed_at: pressedAt.toISOString()
		});

		if (error) throw new Error(`Could not start the next session: ${error.message}`);
	}

	it('moves the last day forward to the day a later session starts, even for a co-chair who may not edit the conference', async () => {
		const creator = await createSignedInClient('Quick Chair');
		const address = await startQuickSession(creator, { timezone: 'America/New_York' });
		const conference = await readConference(creator.supabase, address.conference_slug);
		const committee = await readCommittee(creator, conference?.id);
		const coChair = await createSignedInClient('Co-chair');
		await addChair(creator.supabase, committee.id, coChair.userId);
		const threeDaysOn = new Date(Date.now() + 3 * 86_400_000);

		// The co-chair cannot move the date themselves.
		const { data: edited } = await coChair.supabase
			.from('conferences')
			.update({ end_date: '2099-01-01' })
			.eq('id', conference?.id)
			.select('id');
		expect(edited).toEqual([]);

		await startNextSession(creator, coChair, committee.id, threeDaysOn);

		const moved = await readConference(creator.supabase, address.conference_slug);
		expect(moved?.end_date).toBe(dayIn('America/New_York', threeDaysOn));
		expect(moved?.start_date).toBe(conference?.start_date);
	});

	it('never moves the last day back, and leaves an ordinary conference alone', async () => {
		const creator = await createSignedInClient('Quick Chair');
		const address = await startQuickSession(creator);
		const conference = await readConference(creator.supabase, address.conference_slug);
		const committee = await readCommittee(creator, conference?.id);

		await startNextSession(creator, creator, committee.id, new Date(Date.now() - 5 * 86_400_000));

		expect((await readConference(creator.supabase, address.conference_slug))?.end_date).toBe(
			conference?.end_date
		);

		// A fixture conference ended on 3 March 2020; a session started today
		// does not make it a conference of today.
		const room = await createCommitteeRoom();
		await room.chair.supabase.rpc('start_committee_session', {
			committee_id: room.committeeId,
			name: 'Session 1'
		});
		const { data: ordinary } = await room.supabase
			.from('conferences')
			.select('end_date')
			.eq('id', room.conferenceId)
			.single();
		expect(ordinary?.end_date).toBe('2020-03-03');
	});
});

describe('delete_my_account, with quick sessions', () => {
	it('deletes the person’s quick sessions and their personal organisation with the account', async () => {
		const creator = await createSignedInClient('Quick Chair');
		const address = await startQuickSession(creator);
		const conference = await readConference(creator.supabase, address.conference_slug);

		const { error } = await creator.supabase.rpc('delete_my_account');

		expect(error).toBeNull();

		// Read with the service role, because nobody signed in could see them anyway.
		const admin = createServiceRoleClient();
		const { data: conferences } = await admin
			.from('conferences')
			.select('id')
			.eq('id', conference?.id);
		const { data: organizations } = await admin
			.from('organizations')
			.select('id')
			.eq('id', conference?.organization_id);
		expect(conferences).toEqual([]);
		expect(organizations).toEqual([]);
	});

	it('still asks a sole owner of a real organisation to hand it over, keeping their quick sessions', async () => {
		const organiser = await createConferenceOwnedByMe();
		const creator: SignedInClient = {
			supabase: organiser.supabase,
			userId: organiser.userId,
			email: organiser.email
		};
		const address = await startQuickSession(creator);

		const { error } = await creator.supabase.rpc('delete_my_account');

		expect(error?.message).toContain('Make somebody else an owner of Fixture org');
		expect(await readConference(creator.supabase, address.conference_slug)).not.toBeNull();
	});
});
