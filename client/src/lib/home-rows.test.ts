import { describe, expect, it } from 'vitest';
import type {
	ApplicationListConference,
	ApplicationListEntry,
	MyApplicationListItem,
	MyDelegationListItem
} from './applications';
import type { HomeAnnouncement, HomeDashboard, UpcomingEvent } from './home';
import type { TodayEvent } from './home-today';
import type { ConferenceHero } from './home-hero';
import {
	announcementsLink,
	applicationStatus,
	COMING_UP_LIMIT,
	comingUpLink,
	conferenceRows,
	dueWord,
	eventsLeftToday,
	heroCommitteeIds,
	programmeRows,
	programmeSection,
	QUICK_SESSION_LIMIT,
	quickSessionRows,
	todayProgrammeRows,
	type DueWord
} from './home-rows';
import type { MyQuickSession } from './my-quick-sessions';
import type { TaskDeadline } from './tasks';
import type { UpcomingConferenceCard } from './upcoming-conferences';
import { chairRoomUrl, committeeLiveUrl, committeeUrl, manageUrl, myScheduleUrl } from './urls';

// The rows of `docs/home.md` sections 3.4 to 3.9, and the status vocabulary of
// section 5: what each row says, which word has a dot, and where the limits fall.

/** Seven in the evening in Amsterdam, 29 Oct 2026, with the clocks back on winter time. */
const NOW = new Date('2026-10-29T18:00:00Z');

/** A deadline on `day`, read where Amsterdam Open MUN is. */
function deadline(day: string): TaskDeadline {
	return { day, timezone: 'Europe/Amsterdam' };
}

/** A status word with no dot, the way most rows read. */
function plainWord(text: string): DueWord {
	return { text, tone: 'neutral', hasDot: false };
}

describe('dueWord', () => {
	it('says "Overdue" in red once the day has passed', () => {
		expect(dueWord(deadline('2026-10-28'), NOW)).toEqual({
			text: 'Overdue',
			tone: 'danger',
			hasDot: true
		});
	});

	it('says "Today" and "Tomorrow" in amber', () => {
		expect(dueWord(deadline('2026-10-29'), NOW)).toEqual({
			text: 'Today',
			tone: 'warning',
			hasDot: true
		});
		expect(dueWord(deadline('2026-10-30'), NOW)).toEqual({
			text: 'Tomorrow',
			tone: 'warning',
			hasDot: true
		});
	});

	it('counts the days in amber up to a week away', () => {
		expect(dueWord(deadline('2026-10-31'), NOW)).toEqual({
			text: 'In 2 days',
			tone: 'warning',
			hasDot: true
		});
		expect(dueWord(deadline('2026-11-05'), NOW)).toEqual({
			text: 'In 7 days',
			tone: 'warning',
			hasDot: true
		});
	});

	it('counts the days in plain grey, with no dot, for the rest of the month', () => {
		expect(dueWord(deadline('2026-11-06'), NOW)).toEqual(plainWord('In 8 days'));
		expect(dueWord(deadline('2026-11-28'), NOW)).toEqual(plainWord('In 30 days'));
	});

	it('names the date, with its year, beyond thirty days', () => {
		expect(dueWord(deadline('2026-11-29'), NOW)).toEqual(plainWord('By 29 Nov 2026'));
		expect(dueWord(deadline('2027-07-25'), NOW)).toEqual(plainWord('By 25 Jul 2027'));
	});

	it('reads the day where the conference is, not where the reader is', () => {
		// Half past midnight on the 30th in Amsterdam is still half past eleven on
		// the 29th in London, so the same day is overdue at one and due today at
		// the other.
		const lateEvening = new Date('2026-10-29T23:30:00Z');

		expect(dueWord(deadline('2026-10-29'), lateEvening).text).toBe('Overdue');
		expect(dueWord({ day: '2026-10-29', timezone: 'Europe/London' }, lateEvening).text).toBe(
			'Today'
		);
	});
});

/** A card with none of the four role details set; each role sets its own. */
const NO_ROLE = { seat: null, chair: null, delegation: null, organiser: null };

/** Sofia's card: Morocco in UNHRC at Amsterdam Open MUN 2027, eight months out. */
function makeCard(overrides: Partial<UpcomingConferenceCard> = {}): UpcomingConferenceCard {
	return {
		id: 'conference-amsterdam',
		slug: 'amsterdam-open-mun-2027',
		name: 'Amsterdam Open MUN 2027',
		bannerPath: 'banners/amsterdam.jpg',
		startDate: '2027-07-25',
		endDate: '2027-07-27',
		timezone: 'Europe/Amsterdam',
		city: 'Amsterdam',
		venueName: 'Beurs van Berlage',
		locationMode: 'in_person',
		roleKind: 'seat',
		...NO_ROLE,
		seat: {
			name: 'Morocco',
			countryCode: 'MA',
			committeeHeading: 'UNHRC',
			committeeId: 'committee-unhrc',
			positionPaper: 'due'
		},
		when: { text: 'In 8 months', isLive: false },
		href: committeeUrl('amsterdam-open-mun-2027', 'unhrc'),
		isLive: false,
		liveButton: null,
		...overrides
	};
}

/** Lucas's card: chair of DISEC at The Hague, where no venue has been named. */
function makeChairCard(overrides: Partial<UpcomingConferenceCard> = {}): UpcomingConferenceCard {
	return makeCard({
		id: 'conference-hague',
		slug: 'the-hague-junior',
		name: 'The Hague International MUN Junior',
		bannerPath: null,
		startDate: '2026-12-08',
		endDate: '2026-12-10',
		city: 'The Hague',
		venueName: null,
		roleKind: 'chair',
		...NO_ROLE,
		chair: {
			title: 'Chair',
			committeeHeading: 'DISEC',
			committeeId: 'committee-disec',
			papersWaiting: 3
		},
		when: { text: 'In 1 month', isLive: false },
		href: chairRoomUrl('the-hague-junior', 'disec'),
		...overrides
	});
}

/** Hugo's card for BERMUN 2026, which he organises and whose applications are open. */
function makeOrganiserCard(
	overrides: Partial<UpcomingConferenceCard> = {}
): UpcomingConferenceCard {
	return makeCard({
		id: 'conference-bermun',
		slug: 'bermun-2026',
		name: 'BERMUN 2026',
		startDate: '2026-12-25',
		endDate: '2026-12-29',
		city: 'Berlin',
		venueName: null,
		roleKind: 'organiser',
		...NO_ROLE,
		organiser: {
			status: { text: 'Applications open', tone: 'success' },
			applicationsWaiting: 7,
			setupSteps: null
		},
		when: { text: 'In 1 month', isLive: false },
		href: '/manage/bermun-2026',
		...overrides
	});
}

/** Jasper's card: head of the Rotterdam Grammar delegation at Amsterdam, two seats unfilled. */
function makeDelegationCard(isHead: boolean): UpcomingConferenceCard {
	return makeCard({
		roleKind: isHead ? 'head' : 'member',
		...NO_ROLE,
		delegation: {
			id: 'delegation-1',
			name: 'Rotterdam Grammar Delegation',
			isHead,
			seatCount: 2,
			emptySeatCount: 2
		},
		href: '/delegations/delegation-1'
	});
}

describe('conferenceRows', () => {
	it('carries the card’s name, door and banner', () => {
		const { rows } = conferenceRows([makeCard()], false);

		expect(rows[0]).toMatchObject({
			id: 'conference-amsterdam',
			name: 'Amsterdam Open MUN 2027',
			href: '/conferences/amsterdam-open-mun-2027/committees/unhrc',
			bannerPath: 'banners/amsterdam.jpg'
		});
	});

	it('writes a seat’s row as the committee, the seat with its flag, the dates and the city', () => {
		const { rows } = conferenceRows([makeCard()], false);

		expect(rows[0].metaParts).toEqual(['UNHRC', 'Morocco', '25 – 27 Jul 2027', 'Amsterdam']);
		expect(rows[0].flagCountryCode).toBe('MA');
	});

	it('gives a seat that is not a country no flag', () => {
		const card = makeCard();
		const pressCorps = makeCard({
			seat: { ...card.seat!, name: 'Press corps', countryCode: null }
		});

		const { rows } = conferenceRows([pressCorps], false);

		expect(rows[0].metaParts).toEqual(['UNHRC', 'Press corps', '25 – 27 Jul 2027', 'Amsterdam']);
		expect(rows[0].flagCountryCode).toBeNull();
	});

	it('writes a chair’s row as the committee and the title', () => {
		const { rows } = conferenceRows([makeChairCard()], false);

		expect(rows[0].metaParts).toEqual(['DISEC', 'Chair', '8 – 10 Dec 2026', 'The Hague']);
		expect(rows[0].flagCountryCode).toBeNull();
	});

	it('writes an organiser’s row as "Organiser", whether the conference is a draft or not', () => {
		const draft = makeOrganiserCard({
			organiser: {
				status: { text: 'Draft · not public', tone: 'neutral' },
				applicationsWaiting: 0,
				setupSteps: { done: 2, required: 6 }
			}
		});

		const { rows } = conferenceRows([makeOrganiserCard(), draft], false);

		expect(rows.map((row) => row.metaParts)).toEqual([
			['Organiser', '25 – 29 Dec 2026', 'Berlin'],
			['Organiser', '25 – 29 Dec 2026', 'Berlin']
		]);
	});

	it('writes a delegation’s row, telling a head from a member', () => {
		const { rows } = conferenceRows([makeDelegationCard(true), makeDelegationCard(false)], false);

		expect(rows.map((row) => row.metaParts)).toEqual([
			['Head of delegation', 'Rotterdam Grammar Delegation', '25 – 27 Jul 2027', 'Amsterdam'],
			['Delegation', 'Rotterdam Grammar Delegation', '25 – 27 Jul 2027', 'Amsterdam']
		]);
	});

	it('writes an accepted applicant’s and a volunteer’s rows', () => {
		const accepted = makeCard({ roleKind: 'accepted', ...NO_ROLE });
		const volunteer = makeCard({ roleKind: 'volunteer', ...NO_ROLE });

		const { rows } = conferenceRows([accepted, volunteer], false);

		expect(rows.map((row) => row.metaParts)).toEqual([
			['Delegate', 'seat to come', '25 – 27 Jul 2027', 'Amsterdam'],
			['Volunteer', '25 – 27 Jul 2027', 'Amsterdam']
		]);
	});

	it('says "Online" for an online conference with no city, and nothing for a draft that has not said', () => {
		const online = makeCard({
			roleKind: 'volunteer',
			...NO_ROLE,
			city: null,
			locationMode: 'online'
		});
		const unplaced = makeCard({ roleKind: 'volunteer', ...NO_ROLE, city: null });

		const { rows } = conferenceRows([online, unplaced], false);

		expect(rows.map((row) => row.metaParts)).toEqual([
			['Volunteer', '25 – 27 Jul 2027', 'Online'],
			['Volunteer', '25 – 27 Jul 2027']
		]);
	});

	it('gives every row but an organiser’s the countdown as a plain word', () => {
		const { rows } = conferenceRows([makeCard(), makeChairCard()], false);

		expect(rows.map((row) => row.status)).toEqual([
			plainWord('In 8 months'),
			plainWord('In 1 month')
		]);
	});

	it('says "Today" with a light-blue dot while the conference runs', () => {
		const live = makeCard({ when: { text: 'Today', isLive: true }, isLive: true });

		const { rows } = conferenceRows([live], false);

		expect(rows[0].status).toEqual({ text: 'Today', tone: 'brand', hasDot: true });
	});

	it('gives an organiser’s row the manage list’s words, with a dot only where the colour says something', () => {
		const opensLater = makeOrganiserCard({
			organiser: {
				status: { text: 'Applications open on 13 Dec', tone: 'neutral' },
				applicationsWaiting: 0,
				setupSteps: null
			}
		});
		const running = makeOrganiserCard({
			organiser: {
				status: { text: 'Day 2 of 3', tone: 'brand' },
				applicationsWaiting: 0,
				setupSteps: null
			}
		});

		const { rows } = conferenceRows([makeOrganiserCard(), opensLater, running], false);

		expect(rows.map((row) => row.status)).toEqual([
			{ text: 'Applications open', tone: 'success', hasDot: true },
			plainWord('Applications open on 13 Dec'),
			{ text: 'Day 2 of 3', tone: 'brand', hasDot: true }
		]);
	});

	it('draws eight rows and counts the rest, until the reader asks for all', () => {
		const cards = Array.from({ length: 11 }, (_, index) =>
			makeCard({ id: `conference-${index}`, bannerPath: null })
		);

		const limited = conferenceRows(cards, false);
		const all = conferenceRows(cards, true);

		expect(COMING_UP_LIMIT).toBe(8);
		expect(limited.rows).toHaveLength(8);
		expect(limited.moreCount).toBe(3);
		expect(all.rows).toHaveLength(11);
		expect(all.moreCount).toBe(0);
	});

	it('says whether any row drawn has a banner, so the thumbnail column can go', () => {
		const withoutBanner = makeCard({ id: 'conference-plain', bannerPath: null });

		expect(conferenceRows([withoutBanner], false).hasThumbs).toBe(false);
		expect(conferenceRows([withoutBanner, makeCard()], false).hasThumbs).toBe(true);

		// A banner on a row that is not drawn does not count.
		const nineCards = [...Array.from({ length: 8 }, () => withoutBanner), makeCard()];

		expect(conferenceRows(nineCards, false).hasThumbs).toBe(false);
	});
});

describe('heroCommitteeIds', () => {
	it('names the committee the reader sits in or chairs, and none for the other roles', () => {
		expect(heroCommitteeIds(makeCard())).toEqual(['committee-unhrc']);
		expect(heroCommitteeIds(makeChairCard())).toEqual(['committee-disec']);
		expect(heroCommitteeIds(makeOrganiserCard())).toEqual([]);
		expect(heroCommitteeIds(makeDelegationCard(true))).toEqual([]);
	});
});

/** Eleven in the morning in Amsterdam on 26 Jul 2027, day 2 of Sofia's conference. */
const NOW_LIVE = new Date('2027-07-26T09:00:00Z');

/** An event on the conference's programme on day 2; the defaults are UNHRC's third session. */
function makeTodayEvent(overrides: Partial<TodayEvent> = {}): TodayEvent {
	return {
		id: 'event-session-3',
		title: 'Committee session 3',
		// 09:00 to 12:30 in Amsterdam in July.
		startsAt: '2027-07-26T07:00:00Z',
		endsAt: '2027-07-26T10:30:00Z',
		location: 'Room 2.04',
		conferenceId: 'conference-amsterdam',
		committeeId: 'committee-unhrc',
		...overrides
	};
}

/** Lunch for the whole conference, after the session. */
const LUNCH = makeTodayEvent({
	id: 'event-lunch',
	title: 'Lunch',
	startsAt: '2027-07-26T10:30:00Z',
	endsAt: '2027-07-26T11:30:00Z',
	location: 'Atrium',
	committeeId: null
});

/**
 * The first session of day 3. The server reads a day ahead so that an event in
 * progress is kept, which brings this one in from 09:00 on day 2; it is not
 * today's.
 */
const TOMORROWS_SESSION = makeTodayEvent({
	id: 'event-session-4',
	title: 'Committee session 4',
	// 09:00 to 12:30 in Amsterdam on the 27th.
	startsAt: '2027-07-27T07:00:00Z',
	endsAt: '2027-07-27T10:30:00Z'
});

/** The hero as `homeHero` builds it for Sofia on day 2; the rows read its conference and zone. */
function makeHero(overrides: Partial<ConferenceHero> = {}): ConferenceHero {
	return {
		kind: 'conference',
		conferenceId: 'conference-amsterdam',
		slug: 'amsterdam-open-mun-2027',
		name: 'Amsterdam Open MUN 2027',
		href: committeeUrl('amsterdam-open-mun-2027', 'unhrc'),
		bannerPath: 'banners/amsterdam.jpg',
		timezone: 'Europe/Amsterdam',
		label: { text: 'Running now · day 2 of 3', isLive: true },
		metaLine: 'Delegate · 25 – 27 Jul 2027 · Beurs van Berlage, Amsterdam',
		figures: [],
		nextStep: null,
		primary: {
			label: 'Open live room',
			href: committeeLiveUrl('amsterdam-open-mun-2027', 'unhrc')
		},
		secondary: null,
		...overrides
	};
}

describe('eventsLeftToday', () => {
	it('keeps the conference’s own events and the reader’s committee’s, leaving the rest', () => {
		const otherCommittee = makeTodayEvent({ id: 'event-disec', committeeId: 'committee-disec' });
		const otherConference = makeTodayEvent({
			id: 'event-elsewhere',
			conferenceId: 'conference-hague',
			committeeId: null
		});

		const left = eventsLeftToday(
			[makeTodayEvent(), otherCommittee, LUNCH, otherConference],
			'conference-amsterdam',
			['committee-unhrc'],
			'Europe/Amsterdam',
			NOW_LIVE
		);

		expect(left.map((event) => event.id)).toEqual(['event-session-3', 'event-lunch']);
	});

	it('leaves out an event that has ended', () => {
		const opening = makeTodayEvent({
			id: 'event-opening',
			startsAt: '2027-07-26T06:00:00Z',
			endsAt: '2027-07-26T07:00:00Z',
			committeeId: null
		});

		const left = eventsLeftToday(
			[opening, LUNCH],
			'conference-amsterdam',
			[],
			'Europe/Amsterdam',
			NOW_LIVE
		);

		expect(left.map((event) => event.id)).toEqual(['event-lunch']);
	});

	it('leaves out tomorrow morning’s first session, which the server’s day-ahead window lets in', () => {
		const left = eventsLeftToday(
			[LUNCH, TOMORROWS_SESSION],
			'conference-amsterdam',
			['committee-unhrc'],
			'Europe/Amsterdam',
			NOW_LIVE
		);

		expect(left.map((event) => event.id)).toEqual(['event-lunch']);

		// Nine in the evening with the day's programme over: nothing is left, not the
		// 09:00 session twelve hours on.
		const evening = new Date('2027-07-26T19:00:00Z');

		expect(
			eventsLeftToday(
				[TOMORROWS_SESSION],
				'conference-amsterdam',
				['committee-unhrc'],
				'Europe/Amsterdam',
				evening
			)
		).toEqual([]);
	});

	it('reads the day where the conference is, not where the reader is', () => {
		// Half past midnight on the 27th in Amsterdam is still half past eleven on
		// the 26th in London, so the 09:00 session is today at one and tomorrow at
		// the other.
		const justAfterMidnight = new Date('2027-07-26T22:30:00Z');
		const leftIn = (timezone: string) =>
			eventsLeftToday(
				[TOMORROWS_SESSION],
				'conference-amsterdam',
				['committee-unhrc'],
				timezone,
				justAfterMidnight
			);

		expect(leftIn('Europe/Amsterdam')).toEqual([TOMORROWS_SESSION]);
		expect(leftIn('Europe/London')).toEqual([]);
	});
});

describe('todayProgrammeRows', () => {
	it('writes the time, the title and the room, and marks the event in progress "Now"', () => {
		const rows = todayProgrammeRows(
			[makeTodayEvent(), LUNCH],
			makeHero(),
			['committee-unhrc'],
			NOW_LIVE
		);

		expect(rows).toEqual([
			{
				id: 'event-session-3',
				href: '/conferences/amsterdam-open-mun-2027/schedule?day=2027-07-26',
				when: '09:00 – 12:30',
				title: 'Committee session 3',
				meta: 'Room 2.04',
				isNow: true
			},
			{
				id: 'event-lunch',
				href: '/conferences/amsterdam-open-mun-2027/schedule?day=2027-07-26',
				when: '12:30 – 13:30',
				title: 'Lunch',
				meta: 'Atrium',
				isNow: false
			}
		]);
	});

	it('has no meta line for an event with no room written', () => {
		const rows = todayProgrammeRows(
			[makeTodayEvent({ location: null })],
			makeHero(),
			['committee-unhrc'],
			NOW_LIVE
		);

		expect(rows[0].meta).toBeNull();
	});

	it('lists what is left of today alone, not tomorrow morning’s first session', () => {
		const rows = todayProgrammeRows(
			[LUNCH, TOMORROWS_SESSION],
			makeHero(),
			['committee-unhrc'],
			NOW_LIVE
		);

		expect(rows.map((row) => row.title)).toEqual(['Lunch']);
	});

	it('lists at most six events', () => {
		const events = Array.from({ length: 8 }, (_, index) =>
			makeTodayEvent({
				id: `event-${index}`,
				committeeId: null,
				startsAt: `2027-07-26T${String(10 + index).padStart(2, '0')}:00:00Z`,
				endsAt: `2027-07-26T${String(11 + index).padStart(2, '0')}:00:00Z`
			})
		);

		expect(todayProgrammeRows(events, makeHero(), [], NOW_LIVE)).toHaveLength(6);
	});
});

/** A delegate's dashboard with nothing on it, which a test fills as it needs. */
function makeDashboard(overrides: Partial<HomeDashboard> = {}): HomeDashboard {
	return {
		upcomingConferences: [makeCard()],
		tasks: [],
		todayItems: [],
		todayEvents: [],
		upcomingEvents: [],
		announcements: [],
		myApplications: [],
		quickSessions: [],
		exploreConferences: [],
		hasManagedConferences: false,
		chairsSomething: false,
		hasTakenPart: false,
		openConferenceCount: null,
		heroSeats: null,
		showAll: null,
		...overrides
	};
}

/** An event on the "Programme" list, at a conference in Amsterdam. */
function makeUpcomingEvent(overrides: Partial<UpcomingEvent> = {}): UpcomingEvent {
	return {
		id: 'event-1',
		title: 'Opening ceremony',
		// 08:00 to 09:30 in Amsterdam, the morning after `NOW`.
		startsAt: '2026-10-30T07:00:00Z',
		endsAt: '2026-10-30T08:30:00Z',
		location: 'Main hall',
		conferenceName: 'DelftMUN 2026',
		conferenceSlug: 'delftmun-2026',
		conferenceTimezone: 'Europe/Amsterdam',
		...overrides
	};
}

describe('programmeRows', () => {
	it('names the day and the time, the room and the conference, and links to that day', () => {
		expect(programmeRows([makeUpcomingEvent()], NOW)).toEqual([
			{
				id: 'event-1',
				href: '/conferences/delftmun-2026/schedule?day=2026-10-30',
				when: 'Tomorrow · 08:00 – 09:30',
				title: 'Opening ceremony',
				meta: 'Main hall · DelftMUN 2026',
				isNow: false
			}
		]);
	});

	it('names the conference alone when no room was written', () => {
		const [row] = programmeRows([makeUpcomingEvent({ location: null })], NOW);

		expect(row.meta).toBe('DelftMUN 2026');
	});

	it('marks an event in progress "Now"', () => {
		const running = makeUpcomingEvent({
			startsAt: '2026-10-29T17:00:00Z',
			endsAt: '2026-10-29T19:00:00Z'
		});

		const [row] = programmeRows([running], NOW);

		expect(row.when).toBe('Today · 18:00 – 20:00');
		expect(row.isNow).toBe(true);
	});
});

/** The conference an application row names. */
const DELFT: ApplicationListConference = {
	id: 'conference-delft',
	slug: 'delftmun-2026',
	name: 'DelftMUN 2026',
	organizationName: 'Delft MUN Society',
	logoPath: null,
	bannerPath: null,
	startDate: '2026-11-20',
	endDate: '2026-11-22',
	timezone: 'Europe/Amsterdam',
	isArchived: false,
	applicationsCloseAt: null,
	city: 'Delft',
	venueName: null,
	locationMode: 'in_person'
};

describe('programmeSection', () => {
	it('is "Today\'s programme" on a conference day, leading to that conference\'s schedule', () => {
		const dashboard = makeDashboard({ todayEvents: [makeTodayEvent(), LUNCH] });

		const section = programmeSection(dashboard, makeHero(), NOW_LIVE);

		expect(section?.title).toBe("Today's programme");
		expect(section?.link).toEqual({
			label: 'Full schedule',
			href: '/conferences/amsterdam-open-mun-2027/schedule'
		});
		expect(section?.rows.map((row) => row.title)).toEqual(['Committee session 3', 'Lunch']);
	});

	it('is "Programme" on an ordinary day, leading to the reader\'s own schedule', () => {
		const dashboard = makeDashboard({ upcomingEvents: [makeUpcomingEvent()] });
		const hero = makeHero({ label: { text: 'Your next conference', isLive: false } });

		const section = programmeSection(dashboard, hero, NOW);

		expect(section?.title).toBe('Programme');
		expect(section?.link).toEqual({ label: 'Full schedule', href: myScheduleUrl() });
		expect(section?.rows.map((row) => row.title)).toEqual(['Opening ceremony']);
	});

	it('falls back to the next events when nothing is left of today', () => {
		const dashboard = makeDashboard({ upcomingEvents: [makeUpcomingEvent()] });

		const section = programmeSection(dashboard, makeHero(), NOW_LIVE);

		expect(section?.title).toBe('Programme');
	});

	it('falls back in the evening too, when the server has already read tomorrow’s first session', () => {
		const dashboard = makeDashboard({
			todayEvents: [TOMORROWS_SESSION],
			upcomingEvents: [makeUpcomingEvent()]
		});
		const evening = new Date('2027-07-26T19:00:00Z');

		const section = programmeSection(dashboard, makeHero(), evening);

		expect(section?.title).toBe('Programme');
	});

	it('is nothing when there is no event to list', () => {
		expect(programmeSection(makeDashboard(), makeHero(), NOW_LIVE)).toBeNull();
	});
});

describe('comingUpLink', () => {
	it('is "Manage" for a reader who helps run a conference', () => {
		expect(comingUpLink(makeDashboard({ hasManagedConferences: true }))).toEqual({
			label: 'Manage',
			href: manageUrl()
		});
	});

	it('is nothing for anybody else', () => {
		expect(comingUpLink(makeDashboard())).toBeNull();
	});
});

/** One application of the reader's own, as an entry on the merged list. */
function makeApplicationEntry(status: MyApplicationListItem['status']): ApplicationListEntry {
	const application: MyApplicationListItem = {
		id: 'application-1',
		status,
		submittedAt: '2026-10-02T09:00:00Z',
		updatedAt: '2026-10-02T09:00:00Z',
		conference: DELFT,
		seat: null
	};

	return { kind: 'individual', id: application.id, application };
}

/** One delegation the reader belongs to, as an entry on the same list. */
function makeDelegationEntry(status: MyDelegationListItem['status']): ApplicationListEntry {
	const membership: MyDelegationListItem = {
		id: 'delegation-1',
		name: 'Rotterdam Grammar Delegation',
		status,
		conference: DELFT,
		seat: null
	};

	return { kind: 'delegation', id: membership.id, membership };
}

describe('applicationStatus', () => {
	it('words an application with the status page’s own words, amber while it waits', () => {
		expect(applicationStatus(makeApplicationEntry('submitted'))).toEqual({
			text: 'Under review',
			tone: 'warning',
			hasDot: true
		});
		expect(applicationStatus(makeApplicationEntry('waitlisted'))).toEqual({
			text: 'Waitlisted',
			tone: 'warning',
			hasDot: true
		});
	});

	it('says "Not accepted" in red', () => {
		expect(applicationStatus(makeApplicationEntry('rejected'))).toEqual({
			text: 'Not accepted',
			tone: 'danger',
			hasDot: true
		});
	});

	it('leaves a draft in plain grey with no dot', () => {
		expect(applicationStatus(makeApplicationEntry('draft'))).toEqual(plainWord('Draft'));
	});

	it('reads a delegation’s status as a delegation’s', () => {
		expect(applicationStatus(makeDelegationEntry('submitted')).text).toBe('Under review');
		expect(applicationStatus(makeDelegationEntry('rejected'))).toEqual({
			text: 'Not accepted',
			tone: 'danger',
			hasDot: true
		});
	});
});

/** An announcement from Amsterdam Open MUN 2027, three days old. */
function makeAnnouncement(overrides: Partial<HomeAnnouncement> = {}): HomeAnnouncement {
	return {
		id: 'announcement-1',
		title: 'Position paper deadline moved',
		publishedAt: '2026-10-26T15:00:00Z',
		conferenceName: 'Amsterdam Open MUN 2027',
		conferenceSlug: 'amsterdam-open-mun-2027',
		conferenceTimezone: 'Europe/Amsterdam',
		...overrides
	};
}

describe('announcementsLink', () => {
	it('leads to the one conference’s announcements when every row is from it', () => {
		const announcements = [makeAnnouncement(), makeAnnouncement({ id: 'announcement-2' })];

		expect(announcementsLink(announcements)).toEqual({
			label: 'All announcements',
			href: '/conferences/amsterdam-open-mun-2027/announcements'
		});
	});

	it('has no link when the rows come from several conferences', () => {
		const announcements = [
			makeAnnouncement(),
			makeAnnouncement({ id: 'announcement-2', conferenceSlug: 'bermun-2026' })
		];

		expect(announcementsLink(announcements)).toBeNull();
	});

	it('has no link with no announcements', () => {
		expect(announcementsLink([])).toBeNull();
	});
});

/** A quick session the reader chairs. */
function makeQuickSession(index: number): MyQuickSession {
	return {
		committeeId: `committee-${index}`,
		committeeName: `Practice ${index}`,
		statusLine: 'No session yet',
		isInProgress: false,
		href: chairRoomUrl(`quick-${index}`, 'practice')
	};
}

describe('quickSessionRows', () => {
	it('draws three and counts the rest, until the reader asks for all', () => {
		const sessions = Array.from({ length: 5 }, (_, index) => makeQuickSession(index));

		expect(QUICK_SESSION_LIMIT).toBe(3);
		expect(quickSessionRows(sessions, false)).toEqual({
			rows: sessions.slice(0, 3),
			moreCount: 2
		});
		expect(quickSessionRows(sessions, true)).toEqual({ rows: sessions, moreCount: 0 });
	});

	it('counts nothing more when the list fits', () => {
		const sessions = [makeQuickSession(0), makeQuickSession(1)];

		expect(quickSessionRows(sessions, false)).toEqual({ rows: sessions, moreCount: 0 });
	});
});
