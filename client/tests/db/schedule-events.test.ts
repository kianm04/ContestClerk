import type { SupabaseClient } from '@supabase/supabase-js';
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
	giveSeatTo
} from './conference-fixtures';

// The `schedule_events` row of the policy matrix in
// specs/02-architecture/permissions.md: the nine policies task T34 puts on the
// table, the three checks the table carries itself, and the
// `notify_schedule_changed` trigger that tells the audience an event has moved.
// specs/06-features/schedule-and-announcements.md has the same rules in words,
// and specs/02-architecture/notifications.md has the line the trigger answers.
//
// Every notification below is read through the recipient's own signed-in
// client, the way notifications.test.ts does it, because the `notifications`
// select policy gives somebody their own rows and nothing else. Nobody is
// reused across two `it` blocks, so a fresh account's notifications are exactly
// the ones that one test caused.

// The timezone every fixture conference in this file is put in. It is set
// explicitly rather than left at the 'Europe/Amsterdam' default, and it is far
// from both that and UTC, so a notification whose time reads right here can
// only have been written from the conference's own `timezone` column.
const CONFERENCE_TIMEZONE = 'Asia/Tokyo';

// The twelve month names Postgres prints for the `Mon` pattern that
// `notify_schedule_changed` formats its time with. They are written out rather
// than asked of `Intl.DateTimeFormat`, because JavaScript spells some of them
// differently -- British English says "Sept" where Postgres says "Sep" -- and
// the sentence these tests expect has to match the one the database built.
const POSTGRES_MONTH_NAMES = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
];

/** Milliseconds in one hour, for placing a fixture event either side of now. */
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

// The first morning of the fixture conference, which happens in 2020. A default
// event therefore sits years outside the 24-hour window
// `notify_schedule_changed` watches, so only a test that asks for a time near
// now can set that trigger off.
const FIXTURE_EVENT_STARTS_AT = '2020-03-01T09:00:00Z';
const FIXTURE_EVENT_ENDS_AT = '2020-03-01T10:00:00Z';

/** What `addScheduleEvent` may be told to do differently. */
type ScheduleEventOptions = {
	title?: string;
	/** `'delegation'` is missing on purpose: the table refuses it. */
	audience?: 'everyone' | 'delegates' | 'staff' | 'committee';
	/** Required by the table when the audience is `'committee'`, refused otherwise. */
	committeeId?: string | null;
	startsAt?: string;
	endsAt?: string;
	location?: string | null;
};

/**
 * One event on a conference's programme, through the organiser's own client so
 * that the `schedule_events` insert policy has to allow it.
 */
async function addScheduleEvent(
	organiser: SupabaseClient,
	conferenceId: string,
	options: ScheduleEventOptions = {}
): Promise<string> {
	const { data, error } = await organiser
		.from('schedule_events')
		.insert({
			conference_id: conferenceId,
			title: options.title ?? 'Opening ceremony',
			audience: options.audience ?? 'everyone',
			committee_id: options.committeeId ?? null,
			starts_at: options.startsAt ?? FIXTURE_EVENT_STARTS_AT,
			ends_at: options.endsAt ?? FIXTURE_EVENT_ENDS_AT,
			location: options.location ?? null
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not create the fixture schedule event: ${error?.message}`);
	}

	return data.id;
}

/** A moment this many hours from now, as the ISO string Supabase expects. */
function hoursFromNow(hours: number): string {
	return new Date(Date.now() + hours * MILLISECONDS_PER_HOUR).toISOString();
}

/**
 * Puts the fixture conference in `CONFERENCE_TIMEZONE`, through the organiser's
 * own client. Only the tests that check the wording of a notification need it,
 * because that is the one place the column is read.
 */
async function useConferenceTimezone(
	organiser: SupabaseClient,
	conferenceId: string
): Promise<void> {
	const { error } = await organiser
		.from('conferences')
		.update({ timezone: CONFERENCE_TIMEZONE })
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not set the fixture conference timezone: ${error.message}`);
	}
}

/**
 * Publishes a conference and ticks or unticks the organiser's "Show programme
 * publicly" box, which is the `show_schedule_publicly` column a visitor's
 * select policy reads.
 */
async function publishConference(
	organiser: SupabaseClient,
	conferenceId: string,
	options: { showSchedulePublicly: boolean }
): Promise<void> {
	const { error } = await organiser
		.from('conferences')
		.update({ status: 'published', show_schedule_publicly: options.showSchedulePublicly })
		.eq('id', conferenceId);

	if (error) {
		throw new Error(`Could not publish the fixture conference: ${error.message}`);
	}
}

/**
 * The titles of these events that this client may read, sorted so that two runs
 * cannot disagree about the order. An event a policy hides is simply missing
 * from the answer, which is what every refused case below expects.
 */
async function readableTitles(supabase: SupabaseClient, eventIds: string[]): Promise<string[]> {
	const { data, error } = await supabase.from('schedule_events').select('title').in('id', eventIds);

	if (error) {
		throw new Error(`Could not read the fixture programme: ${error.message}`);
	}

	return (data ?? []).map((row: { title: string }) => row.title).sort();
}

type ScheduleNotification = {
	title: string;
	link_path: string;
};

/**
 * The schedule notifications this person can see, read through their own
 * client.
 *
 * Only rows of kind `schedule_changed` are asked for, which is the kind
 * specs/02-architecture/notifications.md gives this trigger. Seating a delegate
 * writes a `seat_allocated` notification of its own, so without that filter
 * every test below would have to expect the seating as well.
 */
async function readScheduleNotifications(person: SignedInClient): Promise<ScheduleNotification[]> {
	const { data, error } = await person.supabase
		.from('notifications')
		.select('title, link_path')
		.eq('kind', 'schedule_changed');

	if (error) {
		throw new Error(`Could not read the notifications: ${error.message}`);
	}

	return (data ?? []) as ScheduleNotification[];
}

/**
 * The sentence `notify_schedule_changed` builds: the event title, " moved to ",
 * and the new start written in the conference's timezone the way
 * `to_char(…, 'FMDD Mon, HH24:MI')` writes it. "Opening ceremony moved to
 * 20 Jan, 09:00": no leading zero on the day, one on the hour.
 */
function movedToSentence(title: string, startsAt: string): string {
	const parts = new Intl.DateTimeFormat('en-GB', {
		timeZone: CONFERENCE_TIMEZONE,
		day: 'numeric',
		month: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		// 'h23' writes midnight as "00" rather than "24", which is what `HH24` does.
		hourCycle: 'h23'
	}).formatToParts(new Date(startsAt));

	const partValue = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';

	const monthName = POSTGRES_MONTH_NAMES[Number(partValue('month')) - 1];
	// With a numeric month, 'en-GB' pads the day to two digits whatever `day`
	// asks for ("01/10"), so the zero is taken off here the way `FM` does.
	const day = String(Number(partValue('day')));
	const time = `${partValue('hour')}:${partValue('minute')}`;

	return `${title} moved to ${day} ${monthName}, ${time}`;
}

describe('schedule_events_ends_after_it_starts', () => {
	it('refuses an event that ends before it starts', async () => {
		const organiser = await createConferenceOwnedByMe();

		const { error } = await organiser.supabase.from('schedule_events').insert({
			conference_id: organiser.conferenceId,
			title: 'Opening ceremony',
			starts_at: FIXTURE_EVENT_ENDS_AT,
			ends_at: FIXTURE_EVENT_STARTS_AT
		});

		expect(error?.message).toContain('schedule_events_ends_after_it_starts');
	});

	it('accepts an event that ends after it starts', async () => {
		const organiser = await createConferenceOwnedByMe();

		const { data, error } = await organiser.supabase
			.from('schedule_events')
			.insert({
				conference_id: organiser.conferenceId,
				title: 'Opening ceremony',
				starts_at: FIXTURE_EVENT_STARTS_AT,
				ends_at: FIXTURE_EVENT_ENDS_AT
			})
			.select('title');

		expect(error).toBeNull();
		expect(data).toEqual([{ title: 'Opening ceremony' }]);
	});
});

describe('schedule_events_audience_is_not_a_delegation', () => {
	it("refuses an event addressed to one school's own group", async () => {
		const organiser = await createConferenceOwnedByMe();

		// A delegation is a group of visitors travelling together, not a part of
		// the programme, so the four audiences the table allows are everyone, the
		// delegates, the team and one committee.
		const { error } = await organiser.supabase.from('schedule_events').insert({
			conference_id: organiser.conferenceId,
			title: 'Coach leaves the hotel',
			audience: 'delegation',
			starts_at: FIXTURE_EVENT_STARTS_AT,
			ends_at: FIXTURE_EVENT_ENDS_AT
		});

		expect(error?.message).toContain('schedule_events_audience_is_not_a_delegation');
	});
});

describe('schedule_events_committee_matches_audience', () => {
	it('refuses a committee event that names no committee', async () => {
		const organiser = await createConferenceOwnedByMe();

		const { error } = await organiser.supabase.from('schedule_events').insert({
			conference_id: organiser.conferenceId,
			title: 'Committee session',
			audience: 'committee',
			committee_id: null,
			starts_at: FIXTURE_EVENT_STARTS_AT,
			ends_at: FIXTURE_EVENT_ENDS_AT
		});

		expect(error?.message).toContain('schedule_events_committee_matches_audience');
	});

	it('refuses an event for everyone that names a committee', async () => {
		const organiser = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);

		// The same constraint, read the other way round: an event everybody is
		// invited to cannot belong to one committee either.
		const { error } = await organiser.supabase.from('schedule_events').insert({
			conference_id: organiser.conferenceId,
			title: 'Opening ceremony',
			audience: 'everyone',
			committee_id: committeeId,
			starts_at: FIXTURE_EVENT_STARTS_AT,
			ends_at: FIXTURE_EVENT_ENDS_AT
		});

		expect(error?.message).toContain('schedule_events_committee_matches_audience');
	});

	it('accepts a committee event that names its own committee', async () => {
		const organiser = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);

		const { data, error } = await organiser.supabase
			.from('schedule_events')
			.insert({
				conference_id: organiser.conferenceId,
				title: 'Security Council session',
				audience: 'committee',
				committee_id: committeeId,
				starts_at: FIXTURE_EVENT_STARTS_AT,
				ends_at: FIXTURE_EVENT_ENDS_AT
			})
			.select('title');

		expect(error).toBeNull();
		expect(data).toEqual([{ title: 'Security Council session' }]);
	});
});

describe('schedule_events, reading a programme as a signed-out visitor', () => {
	it('shows the events for everyone when the conference shows its programme publicly', async () => {
		const organiser = await createConferenceOwnedByMe();
		const eventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId);
		await publishConference(organiser.supabase, organiser.conferenceId, {
			showSchedulePublicly: true
		});

		const visitor = createVisitorClient();

		expect(await readableTitles(visitor, [eventId])).toEqual(['Opening ceremony']);
	});

	it('shows nothing when the organiser has not ticked "Show programme publicly"', async () => {
		const organiser = await createConferenceOwnedByMe();
		const eventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId);
		await publishConference(organiser.supabase, organiser.conferenceId, {
			showSchedulePublicly: false
		});

		const visitor = createVisitorClient();

		expect(await readableTitles(visitor, [eventId])).toEqual([]);
	});

	it('shows nothing while the conference is still a draft', async () => {
		const organiser = await createConferenceOwnedByMe();
		const eventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId);

		// The box is ticked and the conference is not published, which is the
		// half of the rule the other two tests cannot see: a draft programme
		// stays private however the organiser has set that box.
		await organiser.supabase
			.from('conferences')
			.update({ show_schedule_publicly: true })
			.eq('id', organiser.conferenceId);

		const visitor = createVisitorClient();

		expect(await readableTitles(visitor, [eventId])).toEqual([]);
	});
});

describe('schedule_events, reading a programme as a participant', () => {
	it('lets somebody with a submitted application read the events for everyone, and the delegates ones once accepted', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);

		// The conference is published but its programme is not public, so
		// anything the applicant reads below is the participant's own policy at
		// work and not the visitor's.
		const everyoneEventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId, {
			title: 'Opening ceremony'
		});
		const delegatesEventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId, {
			title: 'Delegate briefing',
			audience: 'delegates'
		});

		const applicant = await createSignedInClient();
		const applicationId = await addApplication(applicant.supabase, organiser.conferenceId, {
			committeePreferences: [committeeId]
		});

		// Under review, the applicant is inside the conference but not yet one
		// of its delegates, which is what the "delegates" audience means since
		// migration 20261022140000 (security review M5).
		expect(await readableTitles(applicant.supabase, [everyoneEventId, delegatesEventId])).toEqual([
			'Opening ceremony'
		]);

		// Accepting is accept_application's, as the database's owner; the seat it
		// hands out with it is beside the point here, so the row is marked the
		// same way.
		await createServiceRoleClient()
			.from('applications')
			.update({ status: 'accepted' })
			.eq('id', applicationId);

		expect(await readableTitles(applicant.supabase, [everyoneEventId, delegatesEventId])).toEqual([
			'Delegate briefing',
			'Opening ceremony'
		]);
	});

	it('shows a signed-in stranger neither of them', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const everyoneEventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId, {
			title: 'Opening ceremony'
		});
		const delegatesEventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId, {
			title: 'Delegate briefing',
			audience: 'delegates'
		});

		const stranger = await createSignedInClient();

		expect(await readableTitles(stranger.supabase, [everyoneEventId, delegatesEventId])).toEqual(
			[]
		);
	});
});

describe('schedule_events, reading the events meant for staff', () => {
	it('lets a volunteer on the team read them', async () => {
		const organiser = await createConferenceOwnedByMe();
		const eventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId, {
			title: 'Staff briefing',
			audience: 'staff'
		});

		const volunteer = await createSignedInClient();
		await addStaff(organiser.supabase, organiser.conferenceId, volunteer.userId);

		expect(await readableTitles(volunteer.supabase, [eventId])).toEqual(['Staff briefing']);
	});

	it('shows a participant nothing of them', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const eventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId, {
			title: 'Staff briefing',
			audience: 'staff'
		});

		const applicant = await createSignedInClient();
		await addApplication(applicant.supabase, organiser.conferenceId, {
			committeePreferences: [committeeId]
		});

		// Taking part in a conference says nothing about what the people running
		// it say to each other.
		expect(await readableTitles(applicant.supabase, [eventId])).toEqual([]);
	});
});

describe("schedule_events, reading one committee's events", () => {
	it("lets that committee's own delegate and its chair read them", async () => {
		const organiser = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const eventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId, {
			title: 'Security Council session',
			audience: 'committee',
			committeeId
		});

		const delegate = await createSignedInClient();
		const seatId = await addSeat(organiser.supabase, committeeId, 'France', 'FR');
		await giveSeatTo(organiser.supabase, seatId, delegate.userId);

		const chair = await createSignedInClient();
		await addChair(organiser.supabase, committeeId, chair.userId);

		expect(await readableTitles(delegate.supabase, [eventId])).toEqual([
			'Security Council session'
		]);
		expect(await readableTitles(chair.supabase, [eventId])).toEqual(['Security Council session']);
	});

	it('shows a delegate of another committee of the same conference nothing', async () => {
		const organiser = await createConferenceOwnedByMe();
		const securityCouncilId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const eventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId, {
			title: 'Security Council session',
			audience: 'committee',
			committeeId: securityCouncilId
		});

		// A delegate of this conference, and of the wrong committee: the policy
		// has to ask which committee somebody sits in, not whether they sit
		// anywhere at all.
		const generalAssemblyId = await addCommittee(
			organiser.supabase,
			organiser.conferenceId,
			'General Assembly'
		);
		const otherDelegate = await createSignedInClient();
		const otherSeatId = await addSeat(organiser.supabase, generalAssemblyId, 'Japan', 'JP');
		await giveSeatTo(organiser.supabase, otherSeatId, otherDelegate.userId);

		expect(await readableTitles(otherDelegate.supabase, [eventId])).toEqual([]);
	});
});

describe('schedule_events, reading the whole programme as an organiser', () => {
	it('shows an organiser every event of their conference, whatever the audience', async () => {
		const organiser = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const eventIds = [
			await addScheduleEvent(organiser.supabase, organiser.conferenceId, {
				title: 'Opening ceremony'
			}),
			await addScheduleEvent(organiser.supabase, organiser.conferenceId, {
				title: 'Delegate briefing',
				audience: 'delegates'
			}),
			await addScheduleEvent(organiser.supabase, organiser.conferenceId, {
				title: 'Staff briefing',
				audience: 'staff'
			}),
			await addScheduleEvent(organiser.supabase, organiser.conferenceId, {
				title: 'Security Council session',
				audience: 'committee',
				committeeId
			})
		];

		expect(await readableTitles(organiser.supabase, eventIds)).toEqual([
			'Delegate briefing',
			'Opening ceremony',
			'Security Council session',
			'Staff briefing'
		]);
	});

	it('shows an organiser of another conference nothing', async () => {
		const organiser = await createConferenceOwnedByMe();
		const eventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId);

		const otherOrganiser = await createConferenceOwnedByMe();

		expect(await readableTitles(otherOrganiser.supabase, [eventId])).toEqual([]);
	});
});

describe('schedule_events, adding an event', () => {
	it('lets an organiser add an event and read the new row back', async () => {
		const organiser = await createConferenceOwnedByMe();

		// `.select()` after an insert is the "insert ... returning" a page uses to
		// get the new row. It only works if a select policy passes for that row.
		const { data, error } = await organiser.supabase
			.from('schedule_events')
			.insert({
				conference_id: organiser.conferenceId,
				title: 'Opening ceremony',
				location: 'Main hall',
				starts_at: FIXTURE_EVENT_STARTS_AT,
				ends_at: FIXTURE_EVENT_ENDS_AT
			})
			.select('title, location, audience');

		expect(error).toBeNull();
		expect(data).toEqual([
			{ title: 'Opening ceremony', location: 'Main hall', audience: 'everyone' }
		]);
	});

	it('refuses an event from a chair, even for their own committee', async () => {
		const organiser = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const chair = await createSignedInClient();
		await addChair(organiser.supabase, committeeId, chair.userId);

		// permissions.md gives the schedule to the organisers alone. A chair
		// speaks to their committee through an announcement, not by putting
		// something on the programme.
		const { error } = await chair.supabase.from('schedule_events').insert({
			conference_id: organiser.conferenceId,
			title: 'Extra session',
			audience: 'committee',
			committee_id: committeeId,
			starts_at: FIXTURE_EVENT_STARTS_AT,
			ends_at: FIXTURE_EVENT_ENDS_AT
		});

		expect(error).not.toBeNull();
	});

	it('refuses an event from somebody who has nothing to do with the conference', async () => {
		const organiser = await createConferenceOwnedByMe();
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase.from('schedule_events').insert({
			conference_id: organiser.conferenceId,
			title: 'Gatecrasher party',
			starts_at: FIXTURE_EVENT_STARTS_AT,
			ends_at: FIXTURE_EVENT_ENDS_AT
		});

		expect(error).not.toBeNull();
	});
});

describe('schedule_events, changing an event', () => {
	it('lets an organiser move an event to another room', async () => {
		const organiser = await createConferenceOwnedByMe();
		const eventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId);

		const { data, error } = await organiser.supabase
			.from('schedule_events')
			.update({ location: 'Room 12' })
			.eq('id', eventId)
			.select('location');

		expect(error).toBeNull();
		expect(data).toEqual([{ location: 'Room 12' }]);
	});

	it("refuses a change from a chair, even to their own committee's event", async () => {
		const organiser = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const eventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId, {
			title: 'Security Council session',
			audience: 'committee',
			committeeId,
			location: 'Room 12'
		});
		const chair = await createSignedInClient();
		await addChair(organiser.supabase, committeeId, chair.userId);

		// A refused update is not an error: the update policy hides the row, so
		// nothing matches and nothing changes. The chair can still read the
		// event, which is why this has to be checked against the row itself.
		const { data } = await chair.supabase
			.from('schedule_events')
			.update({ location: 'Room 13' })
			.eq('id', eventId)
			.select('location');

		expect(data).toEqual([]);

		const { data: unchanged } = await organiser.supabase
			.from('schedule_events')
			.select('location')
			.eq('id', eventId);

		expect(unchanged).toEqual([{ location: 'Room 12' }]);
	});

	it('refuses a change from somebody who has nothing to do with the conference', async () => {
		const organiser = await createConferenceOwnedByMe();
		const eventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId, {
			location: 'Room 12'
		});
		const stranger = await createSignedInClient();

		const { data } = await stranger.supabase
			.from('schedule_events')
			.update({ location: 'Room 13' })
			.eq('id', eventId)
			.select('location');

		expect(data).toEqual([]);

		const { data: unchanged } = await organiser.supabase
			.from('schedule_events')
			.select('location')
			.eq('id', eventId);

		expect(unchanged).toEqual([{ location: 'Room 12' }]);
	});
});

describe('schedule_events, removing an event', () => {
	it('lets an organiser delete an event', async () => {
		const organiser = await createConferenceOwnedByMe();
		const eventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId);

		const { error } = await organiser.supabase.from('schedule_events').delete().eq('id', eventId);

		expect(error).toBeNull();
		expect(await readableTitles(organiser.supabase, [eventId])).toEqual([]);
	});

	it("refuses a delete from a chair, even of their own committee's event", async () => {
		const organiser = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const eventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId, {
			title: 'Security Council session',
			audience: 'committee',
			committeeId
		});
		const chair = await createSignedInClient();
		await addChair(organiser.supabase, committeeId, chair.userId);

		// Nothing is refused out loud here either: the delete policy hides the
		// row from anybody who cannot manage the conference, so the statement
		// matches nothing at all.
		await chair.supabase.from('schedule_events').delete().eq('id', eventId);

		expect(await readableTitles(organiser.supabase, [eventId])).toEqual([
			'Security Council session'
		]);
	});

	it('refuses a delete from somebody who has nothing to do with the conference', async () => {
		const organiser = await createConferenceOwnedByMe();
		const eventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId);
		const stranger = await createSignedInClient();

		await stranger.supabase.from('schedule_events').delete().eq('id', eventId);

		expect(await readableTitles(organiser.supabase, [eventId])).toEqual(['Opening ceremony']);
	});
});

describe('schedule_events_set_updated_at, the trigger that stamps a change', () => {
	it('stamps the moment an event was last changed, whatever the caller sent', async () => {
		const organiser = await createConferenceOwnedByMe();
		const eventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId);

		const { data: before } = await organiser.supabase
			.from('schedule_events')
			.select('updated_at')
			.eq('id', eventId)
			.single();

		// The backdated `updated_at` travels with a real change, so the trigger
		// has something to do and it is the trigger's value that wins rather than
		// the organiser's.
		const { data: after } = await organiser.supabase
			.from('schedule_events')
			.update({ location: 'Room 12', updated_at: '2020-01-01T00:00:00Z' })
			.eq('id', eventId)
			.select('updated_at')
			.single();

		expect(new Date(after?.updated_at).getTime()).toBeGreaterThan(
			new Date(before?.updated_at).getTime()
		);
	});
});

describe('schedule_events_check_scope', () => {
	it('refuses a committee event naming a committee of another conference', async () => {
		const organiser = await createConferenceOwnedByMe();
		const otherConference = await createConferenceOwnedByMe();
		const theirCommitteeId = await addCommittee(
			otherConference.supabase,
			otherConference.conferenceId
		);

		// The check constraint above says a committee event names a committee.
		// This says which committees it may name.
		const { error } = await organiser.supabase.from('schedule_events').insert({
			conference_id: organiser.conferenceId,
			title: 'Security Council session',
			audience: 'committee',
			committee_id: theirCommitteeId,
			starts_at: FIXTURE_EVENT_STARTS_AT,
			ends_at: FIXTURE_EVENT_ENDS_AT
		});

		expect(error?.message).toContain('That committee is not part of this conference');
	});
});

describe('notify_schedule_changed, schedule_events_notify_changed', () => {
	it('tells the audience where an event starting within the next 24 hours has moved to', async () => {
		const organiser = await createConferenceOwnedByMe();
		await useConferenceTimezone(organiser.supabase, organiser.conferenceId);

		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const seatId = await addSeat(organiser.supabase, committeeId, 'France', 'FR');
		const delegate = await createSignedInClient();
		await giveSeatTo(organiser.supabase, seatId, delegate.userId);

		const eventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId, {
			title: 'Opening ceremony',
			startsAt: hoursFromNow(2),
			endsAt: hoursFromNow(3)
		});

		const newStart = hoursFromNow(4);
		const { error } = await organiser.supabase
			.from('schedule_events')
			.update({ starts_at: newStart, ends_at: hoursFromNow(5) })
			.eq('id', eventId);

		expect(error).toBeNull();

		// One row, and the time in it is written in the conference's own
		// timezone rather than in UTC or in the reader's.
		expect(await readScheduleNotifications(delegate)).toEqual([
			{
				title: movedToSentence('Opening ceremony', newStart),
				link_path: `/conferences/${organiser.conferenceSlug}/schedule`
			}
		]);
	});

	it('tells the audience when only the room has changed', async () => {
		const organiser = await createConferenceOwnedByMe();
		await useConferenceTimezone(organiser.supabase, organiser.conferenceId);

		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const seatId = await addSeat(organiser.supabase, committeeId, 'France', 'FR');
		const delegate = await createSignedInClient();
		await giveSeatTo(organiser.supabase, seatId, delegate.userId);

		const startsAt = hoursFromNow(2);
		const eventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId, {
			title: 'Opening ceremony',
			startsAt,
			endsAt: hoursFromNow(3),
			location: 'Main hall'
		});

		await organiser.supabase
			.from('schedule_events')
			.update({ location: 'Room 12' })
			.eq('id', eventId);

		// The trigger watches `starts_at`, `ends_at` and `location`, so a room
		// change is news too. The sentence still says "moved to" and names the
		// start, which has not moved.
		expect(await readScheduleNotifications(delegate)).toEqual([
			{
				title: movedToSentence('Opening ceremony', startsAt),
				link_path: `/conferences/${organiser.conferenceSlug}/schedule`
			}
		]);
	});

	it('says nothing when only the title or the description changes', async () => {
		const organiser = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const seatId = await addSeat(organiser.supabase, committeeId, 'France', 'FR');
		const delegate = await createSignedInClient();
		await giveSeatTo(organiser.supabase, seatId, delegate.userId);

		const eventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId, {
			title: 'Opening ceremony',
			startsAt: hoursFromNow(2),
			endsAt: hoursFromNow(3)
		});

		// The trigger is declared "after update of starts_at, ends_at, location",
		// so an organiser fixing a typo or adding a line of description does not
		// even run it, however near the event is.
		await organiser.supabase
			.from('schedule_events')
			.update({ title: 'Opening ceremony and welcome' })
			.eq('id', eventId);

		await organiser.supabase
			.from('schedule_events')
			.update({ description: 'Bring your placard.' })
			.eq('id', eventId);

		expect(await readScheduleNotifications(delegate)).toEqual([]);
	});

	it('says nothing about an event more than 24 hours away', async () => {
		const organiser = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const seatId = await addSeat(organiser.supabase, committeeId, 'France', 'FR');
		const delegate = await createSignedInClient();
		await giveSeatTo(organiser.supabase, seatId, delegate.userId);

		const eventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId, {
			title: 'Opening ceremony',
			startsAt: hoursFromNow(72),
			endsAt: hoursFromNow(73)
		});

		// A programme being built weeks out is edited many times, and nobody
		// wants a notification for each one.
		await organiser.supabase
			.from('schedule_events')
			.update({ starts_at: hoursFromNow(96), ends_at: hoursFromNow(97) })
			.eq('id', eventId);

		expect(await readScheduleNotifications(delegate)).toEqual([]);
	});

	it('tells the audience when an event is moved out of the next 24 hours', async () => {
		const organiser = await createConferenceOwnedByMe();
		await useConferenceTimezone(organiser.supabase, organiser.conferenceId);

		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const seatId = await addSeat(organiser.supabase, committeeId, 'France', 'FR');
		const delegate = await createSignedInClient();
		await giveSeatTo(organiser.supabase, seatId, delegate.userId);

		const eventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId, {
			title: 'Opening ceremony',
			startsAt: hoursFromNow(2),
			endsAt: hoursFromNow(3)
		});

		// The old start is what brings this one inside the window: the people who
		// were about to attend an event in two hours are exactly the people who
		// have to hear that it is now five days away.
		const newStart = hoursFromNow(120);
		await organiser.supabase
			.from('schedule_events')
			.update({ starts_at: newStart, ends_at: hoursFromNow(121) })
			.eq('id', eventId);

		expect(await readScheduleNotifications(delegate)).toEqual([
			{
				title: movedToSentence('Opening ceremony', newStart),
				link_path: `/conferences/${organiser.conferenceSlug}/schedule`
			}
		]);
	});

	it("tells one committee's delegates and chairs about its own event, and nobody else", async () => {
		const organiser = await createConferenceOwnedByMe();
		await useConferenceTimezone(organiser.supabase, organiser.conferenceId);

		const securityCouncilId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const delegate = await createSignedInClient();
		const seatId = await addSeat(organiser.supabase, securityCouncilId, 'France', 'FR');
		await giveSeatTo(organiser.supabase, seatId, delegate.userId);

		const chair = await createSignedInClient();
		await addChair(organiser.supabase, securityCouncilId, chair.userId);

		// A delegate of the same conference and of another committee, who should
		// hear nothing at all about this one's session.
		const generalAssemblyId = await addCommittee(
			organiser.supabase,
			organiser.conferenceId,
			'General Assembly'
		);
		const otherDelegate = await createSignedInClient();
		const otherSeatId = await addSeat(organiser.supabase, generalAssemblyId, 'Japan', 'JP');
		await giveSeatTo(organiser.supabase, otherSeatId, otherDelegate.userId);

		const eventId = await addScheduleEvent(organiser.supabase, organiser.conferenceId, {
			title: 'Security Council session',
			audience: 'committee',
			committeeId: securityCouncilId,
			startsAt: hoursFromNow(2),
			endsAt: hoursFromNow(3)
		});

		const newStart = hoursFromNow(4);
		await organiser.supabase
			.from('schedule_events')
			.update({ starts_at: newStart, ends_at: hoursFromNow(5) })
			.eq('id', eventId);

		const expected = [
			{
				title: movedToSentence('Security Council session', newStart),
				link_path: `/conferences/${organiser.conferenceSlug}/schedule`
			}
		];

		expect(await readScheduleNotifications(delegate)).toEqual(expected);
		expect(await readScheduleNotifications(chair)).toEqual(expected);
		expect(await readScheduleNotifications(otherDelegate)).toEqual([]);
	});
});
