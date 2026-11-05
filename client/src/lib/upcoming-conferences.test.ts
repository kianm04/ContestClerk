import { describe, expect, it } from 'vitest';
import type { Conference } from './conferences';
import {
	todayItemKey,
	todayItems,
	type TodayCommittee,
	type TodayConference,
	type TodayItem,
	type TodayLink
} from './home-today';
import {
	ownTodayItem,
	upcomingConferenceWhen,
	upcomingConferences,
	type RoleDetails,
	type UpcomingCommitteeRole,
	type UpcomingConferenceFacts,
	type UpcomingConferenceSource,
	type UpcomingDelegation,
	type UpcomingOrganisedConference
} from './upcoming-conferences';
import { chairRoomUrl, manageConferenceUrl } from './urls';

// The rules of `docs/home.md` ("Your next conference"): which conferences the
// home page lists, in which order, and what each card carries for its role.

/** Midday in London, 28 Sep 2026. */
const NOW = new Date('2026-09-28T11:00:00Z');

/** A conference in London, which each test moves in time as it needs. */
function makeConference(
	overrides: Partial<UpcomingConferenceSource> = {}
): UpcomingConferenceSource {
	return {
		id: 'conference-oxford',
		slug: 'oxford-global',
		name: 'Oxford Global MUN',
		bannerPath: null,
		startDate: '2026-10-04',
		endDate: '2026-10-06',
		timezone: 'Europe/London',
		city: 'Oxford',
		venueName: 'Examination Schools',
		locationMode: 'in_person',
		status: 'published',
		...overrides
	};
}

/** Northbridge MUN, running from yesterday to tomorrow. */
const NORTHBRIDGE = makeConference({
	id: 'conference-northbridge',
	slug: 'northbridge-mun',
	name: 'Northbridge MUN',
	startDate: '2026-09-27',
	endDate: '2026-09-29'
});

/** A committee role at `conference`: a seat unless the test says otherwise. */
function makeCommitteeRole(
	conference: UpcomingConferenceSource,
	overrides: Partial<UpcomingCommitteeRole> = {}
): UpcomingCommitteeRole {
	return {
		conference,
		committeeId: 'committee-unsc',
		committeeHeading: 'UNSC',
		committeeSlug: 'unsc',
		roleName: 'Canada',
		seatCountryCode: 'CA',
		papersWaiting: 0,
		positionPaper: 'due',
		...overrides
	};
}

/** The same role as a chair holds it: a title, no flag, papers to review. */
function makeChairRole(
	conference: UpcomingConferenceSource,
	overrides: Partial<UpcomingCommitteeRole> = {}
): UpcomingCommitteeRole {
	return makeCommitteeRole(conference, {
		roleName: 'Chair',
		seatCountryCode: null,
		papersWaiting: 3,
		positionPaper: 'none',
		...overrides
	});
}

/**
 * A whole conference row, as the organiser's role carries it: published,
 * applications open on both sides, from the same place and days as
 * `makeConference`. Tests change only the fields they are about.
 */
function makeFullConference(overrides: Partial<Conference> = {}): Conference {
	return {
		...makeConference(),
		description: null,
		organizationName: 'Oxford MUN Society',
		organizationSlug: 'oxford-mun-society',
		countryCode: 'GB',
		countryName: 'United Kingdom',
		venueStatus: 'known',
		conferenceTimeStatus: 'tba',
		startTime: null,
		endTime: null,
		feeStatus: 'undecided',
		applicationOpenMode: 'on_publish',
		websiteUrl: null,
		logoPath: null,
		level: 'university',
		status: 'published',
		expectedDelegates: null,
		applicationsOpenAt: null,
		applicationsCloseAt: null,
		committeeCount: 4,
		committeeNames: [],
		tagline: null,
		venueAddress: null,
		contactEmail: null,
		instagramUrl: null,
		contactPhone: null,
		facebookUrl: null,
		linkedinUrl: null,
		youtubeUrl: null,
		tiktokUrl: null,
		language: 'English',
		minAge: null,
		maxAge: null,
		positionPaperRequired: false,
		positionPaperDeadline: null,
		acceptsIndividualApplications: true,
		acceptsDelegations: true,
		...overrides
	};
}

/** A conference the reader organises, with nothing waiting. */
function makeOrganised(
	conference: Conference,
	overrides: Partial<UpcomingOrganisedConference> = {}
): UpcomingOrganisedConference {
	return { conference, applicationsWaiting: 0, setupSteps: null, ...overrides };
}

/** A delegation the reader is a member of, with every seat taken. */
function makeDelegation(
	conference: UpcomingConferenceSource,
	overrides: Partial<UpcomingDelegation> = {}
): UpcomingDelegation {
	return {
		conference,
		delegationId: 'delegation-1',
		delegationName: 'Northbridge Academy',
		isHead: false,
		seatCount: 2,
		emptySeatCount: 0,
		...overrides
	};
}

/** Facts with nothing in them, which each test fills in. */
function makeFacts(overrides: Partial<UpcomingConferenceFacts> = {}): UpcomingConferenceFacts {
	return {
		chairs: [],
		seats: [],
		organised: [],
		volunteered: [],
		delegations: [],
		acceptedApplications: [],
		todayItems: [],
		...overrides
	};
}

/** A "Today" item of `conferenceId` whose first link is `label`, keyed as no role's own item is. */
function makeItem(conferenceId: string, label: string): TodayItem {
	return {
		key: `${conferenceId}-${label}`,
		conferenceId,
		title: label,
		detail: null,
		links: [{ label, href: '/schedule' }]
	};
}

/** A "Today" item of Northbridge's, keyed as `todayItems` keys one role's item, with that one link. */
function makeKeyedItem(key: string, link: TodayLink): TodayItem {
	return { key, conferenceId: NORTHBRIDGE.id, title: link.label, detail: null, links: [link] };
}

/** A role with none of the four detail objects set, which each role below fills in. */
const NO_ROLE_DETAILS = { seat: null, chair: null, delegation: null, organiser: null };

/** The reader as chair of DISEC. */
const CHAIR_OF_DISEC: RoleDetails = {
	...NO_ROLE_DETAILS,
	roleKind: 'chair',
	chair: {
		title: 'Chair',
		committeeHeading: 'DISEC',
		committeeId: 'committee-disec',
		papersWaiting: 0
	}
};

/** The links of Northbridge's items: DISEC's chair room, UNSC's, and the dashboard. */
const DISEC_ROOM: TodayLink = {
	label: 'Open chair room',
	href: chairRoomUrl('northbridge-mun', 'disec')
};
const UNSC_ROOM: TodayLink = {
	label: 'Open chair room',
	href: chairRoomUrl('northbridge-mun', 'unsc')
};
const DASHBOARD: TodayLink = {
	label: 'Open dashboard',
	href: manageConferenceUrl('northbridge-mun')
};

describe('upcomingConferences', () => {
	it('lists each kind of role with its door and its kind', () => {
		const conferenceNamed = (id: string) => makeConference({ id, slug: id, name: id });
		const cards = upcomingConferences(
			makeFacts({
				chairs: [
					makeChairRole(conferenceNamed('a-chair'), {
						committeeHeading: 'HRC',
						committeeSlug: 'hrc',
						roleName: 'Vice chair'
					})
				],
				seats: [makeCommitteeRole(conferenceNamed('b-seat'))],
				organised: [
					makeOrganised(
						makeFullConference({ id: 'c-organiser', slug: 'c-organiser', name: 'c-organiser' })
					),
					makeOrganised(
						makeFullConference({ id: 'd-draft', slug: 'd-draft', name: 'd-draft', status: 'draft' })
					)
				],
				volunteered: [conferenceNamed('e-volunteer')],
				delegations: [
					makeDelegation(conferenceNamed('f-delegation')),
					makeDelegation(conferenceNamed('g-headed'), {
						delegationId: 'delegation-2',
						isHead: true
					})
				],
				acceptedApplications: [conferenceNamed('h-accepted')]
			}),
			NOW
		);

		expect(cards.map((card) => [card.id, card.href, card.roleKind])).toEqual([
			['a-chair', '/conferences/a-chair/committees/hrc/chair', 'chair'],
			['b-seat', '/conferences/b-seat/committees/unsc', 'seat'],
			['c-organiser', '/manage/c-organiser', 'organiser'],
			['d-draft', '/manage/d-draft', 'organiser'],
			['e-volunteer', '/conferences/e-volunteer', 'volunteer'],
			['f-delegation', '/delegations/delegation-1', 'member'],
			['g-headed', '/delegations/delegation-2', 'head'],
			['h-accepted', '/conferences/h-accepted', 'accepted']
		]);
	});

	it('carries the conference’s own facts, so the hero and the rows need nothing else', () => {
		const [card] = upcomingConferences(
			makeFacts({ volunteered: [makeConference({ bannerPath: 'banners/oxford.jpg' })] }),
			NOW
		);

		expect(card).toMatchObject({
			id: 'conference-oxford',
			slug: 'oxford-global',
			name: 'Oxford Global MUN',
			bannerPath: 'banners/oxford.jpg',
			startDate: '2026-10-04',
			endDate: '2026-10-06',
			timezone: 'Europe/London',
			city: 'Oxford',
			venueName: 'Examination Schools',
			locationMode: 'in_person'
		});
	});

	it('gives a seat its name, flag, committee and paper, and nothing of the other roles', () => {
		const [card] = upcomingConferences(
			makeFacts({
				seats: [
					makeCommitteeRole(makeConference(), {
						roleName: 'Morocco',
						seatCountryCode: 'MA',
						committeeId: 'committee-unhrc',
						committeeHeading: 'UNHRC',
						positionPaper: 'handed_in'
					})
				]
			}),
			NOW
		);

		expect(card.seat).toEqual({
			name: 'Morocco',
			countryCode: 'MA',
			committeeHeading: 'UNHRC',
			committeeId: 'committee-unhrc',
			positionPaper: 'handed_in'
		});
		expect([card.chair, card.delegation, card.organiser]).toEqual([null, null, null]);
	});

	it('keeps a seat that is not a country without a flag', () => {
		const [card] = upcomingConferences(
			makeFacts({
				seats: [
					makeCommitteeRole(makeConference(), { roleName: 'Press corps', seatCountryCode: null })
				]
			}),
			NOW
		);

		expect(card.seat?.name).toBe('Press corps');
		expect(card.seat?.countryCode).toBeNull();
	});

	it('gives a chair their title, committee and the papers waiting', () => {
		const [card] = upcomingConferences(
			makeFacts({
				chairs: [
					makeChairRole(makeConference(), {
						committeeId: 'committee-disec',
						committeeHeading: 'DISEC',
						papersWaiting: 3
					})
				]
			}),
			NOW
		);

		expect(card.chair).toEqual({
			title: 'Chair',
			committeeHeading: 'DISEC',
			committeeId: 'committee-disec',
			papersWaiting: 3
		});
		expect([card.seat, card.delegation, card.organiser]).toEqual([null, null, null]);
	});

	it('gives an organiser the manage list’s status line and the applications waiting', () => {
		const [card] = upcomingConferences(
			makeFacts({ organised: [makeOrganised(makeFullConference(), { applicationsWaiting: 4 })] }),
			NOW
		);

		expect(card.organiser).toEqual({
			status: { text: 'Applications open', tone: 'success' },
			applicationsWaiting: 4,
			setupSteps: null
		});
		expect([card.seat, card.chair, card.delegation]).toEqual([null, null, null]);
	});

	it('gives a draft its setup steps and says it is not public', () => {
		const [card] = upcomingConferences(
			makeFacts({
				organised: [
					makeOrganised(makeFullConference({ status: 'draft' }), {
						setupSteps: { done: 2, required: 6 }
					})
				]
			}),
			NOW
		);

		expect(card.organiser).toEqual({
			status: { text: 'Draft · not public', tone: 'neutral' },
			applicationsWaiting: 0,
			setupSteps: { done: 2, required: 6 }
		});
	});

	it('gives a delegation its seats, and tells a head from a member', () => {
		const [memberCard] = upcomingConferences(
			makeFacts({ delegations: [makeDelegation(makeConference())] }),
			NOW
		);

		expect(memberCard.roleKind).toBe('member');
		expect(memberCard.delegation).toEqual({
			id: 'delegation-1',
			name: 'Northbridge Academy',
			isHead: false,
			seatCount: 2,
			emptySeatCount: 0
		});
		expect([memberCard.seat, memberCard.chair, memberCard.organiser]).toEqual([null, null, null]);

		const [headCard] = upcomingConferences(
			makeFacts({
				delegations: [makeDelegation(makeConference(), { isHead: true, emptySeatCount: 2 })]
			}),
			NOW
		);

		expect(headCard.roleKind).toBe('head');
		expect(headCard.delegation).toMatchObject({ isHead: true, seatCount: 2, emptySeatCount: 2 });
	});

	it('gives a volunteer and an accepted applicant no role details at all', () => {
		const cards = upcomingConferences(
			makeFacts({
				volunteered: [makeConference()],
				acceptedApplications: [makeConference({ id: 'conference-accepted' })]
			}),
			NOW
		);

		for (const card of cards) {
			expect([card.seat, card.chair, card.delegation, card.organiser]).toEqual([
				null,
				null,
				null,
				null
			]);
		}
	});

	it('draws one card for a conference with several roles, named after the most telling', () => {
		const oxford = makeConference();
		const cards = upcomingConferences(
			makeFacts({
				acceptedApplications: [oxford],
				volunteered: [oxford],
				seats: [
					makeCommitteeRole(oxford, { committeeHeading: 'UNSC', roleName: 'Canada' }),
					makeCommitteeRole(oxford, {
						committeeId: 'committee-disec',
						committeeHeading: 'DISEC',
						committeeSlug: 'disec',
						roleName: 'Chile'
					})
				],
				organised: [makeOrganised(makeFullConference())]
			}),
			NOW
		);

		// A seat outranks organiser, volunteer and application; of two seats the
		// first committee by short name is the one named.
		expect(cards).toHaveLength(1);
		expect(cards[0].roleKind).toBe('seat');
		expect(cards[0].seat).toMatchObject({ committeeHeading: 'DISEC', name: 'Chile' });
		expect(cards[0].href).toBe('/conferences/oxford-global/committees/disec');
		// The organiser's figures are not carried on a card about the seat.
		expect(cards[0].organiser).toBeNull();

		const chairCards = upcomingConferences(
			makeFacts({
				seats: [makeCommitteeRole(oxford)],
				chairs: [makeChairRole(oxford)]
			}),
			NOW
		);

		expect(chairCards.map((card) => [card.roleKind, card.chair?.title])).toEqual([
			['chair', 'Chair']
		]);
	});

	it('keeps a conference ending today and leaves out one that has ended, in its own timezone', () => {
		const endsToday = makeConference({
			id: 'ends-today',
			startDate: '2026-09-26',
			endDate: '2026-09-28'
		});
		const endedYesterday = makeConference({
			id: 'ended-yesterday',
			startDate: '2026-09-25',
			endDate: '2026-09-27'
		});
		// 11:00 UTC is already midnight of 29 Sep in Auckland, so its 28 Sep is over.
		const endedInAuckland = makeConference({
			id: 'ended-in-auckland',
			startDate: '2026-09-26',
			endDate: '2026-09-28',
			timezone: 'Pacific/Auckland'
		});

		const cards = upcomingConferences(
			makeFacts({ volunteered: [endsToday, endedYesterday, endedInAuckland] }),
			NOW
		);

		expect(cards.map((card) => card.id)).toEqual(['ends-today']);
	});

	it('leaves out an archived conference whatever its dates: archiving is how one is cancelled', () => {
		const cancelled = makeConference({ id: 'cancelled', status: 'archived' });
		const cancelledMidway = makeConference({
			...NORTHBRIDGE,
			id: 'cancelled-midway',
			status: 'archived'
		});

		const cards = upcomingConferences(
			makeFacts({ volunteered: [cancelled, makeConference(), cancelledMidway] }),
			NOW
		);

		expect(cards.map((card) => card.id)).toEqual(['conference-oxford']);
	});

	it('puts the conferences running today first, then the soonest, then by name', () => {
		const later = makeConference({ id: 'later', name: 'Alpha MUN', startDate: '2026-11-07' });
		const soonB = makeConference({ id: 'soon-b', name: 'Bravo MUN', startDate: '2026-10-03' });
		const soonA = makeConference({ id: 'soon-a', name: 'Able MUN', startDate: '2026-10-03' });

		const cards = upcomingConferences(
			makeFacts({ volunteered: [later, soonB, NORTHBRIDGE, soonA] }),
			NOW
		);

		expect(cards.map((card) => card.id)).toEqual([
			'conference-northbridge',
			'soon-a',
			'soon-b',
			'later'
		]);
		expect(cards.map((card) => card.isLive)).toEqual([true, false, false, false]);
	});

	it('orders two running conferences by their most urgent "Today" item', () => {
		const hague = { ...NORTHBRIDGE, id: 'conference-hague', slug: 'hague', name: 'Hague MUN' };
		const cards = upcomingConferences(
			makeFacts({
				volunteered: [hague, NORTHBRIDGE],
				todayItems: [makeItem(NORTHBRIDGE.id, 'Open live room'), makeItem(hague.id, 'Schedule')]
			}),
			NOW
		);

		expect(cards.map((card) => card.name)).toEqual(['Northbridge MUN', 'Hague MUN']);
	});

	it('orders two running conferences with no item by name, not by their first day', () => {
		// Hague started a day before Northbridge, but both run today.
		const hague = {
			...NORTHBRIDGE,
			id: 'conference-hague',
			slug: 'hague',
			name: 'Hague MUN',
			startDate: '2026-09-26'
		};
		const cards = upcomingConferences(makeFacts({ volunteered: [NORTHBRIDGE, hague] }), NOW);

		expect(cards.map((card) => card.name)).toEqual(['Hague MUN', 'Northbridge MUN']);

		const renamed = { ...hague, name: 'Zurich MUN' };
		const renamedCards = upcomingConferences(
			makeFacts({ volunteered: [renamed, NORTHBRIDGE] }),
			NOW
		);

		expect(renamedCards.map((card) => card.name)).toEqual(['Northbridge MUN', 'Zurich MUN']);
	});

	it('lists every conference, with no cap', () => {
		const conferences = Array.from({ length: 12 }, (_, index) =>
			makeConference({ id: `conference-${index}`, name: `Conference ${index}` })
		);

		const cards = upcomingConferences(makeFacts({ volunteered: conferences }), NOW);

		expect(cards).toHaveLength(12);
	});

	it('gives a card still to come its countdown word and no button', () => {
		const [card] = upcomingConferences(
			makeFacts({ volunteered: [makeConference({ startDate: '2026-10-04' })] }),
			NOW
		);

		expect(card.when).toEqual({ text: 'In 6 days', isLive: false });
		expect(card.isLive).toBe(false);
		expect(card.liveButton).toBeNull();
	});

	it('capitalises the countdown word for every distance', () => {
		const whenFor = (startDate: string) =>
			upcomingConferences(makeFacts({ volunteered: [makeConference({ startDate })] }), NOW)[0].when
				.text;

		expect(whenFor('2026-09-29')).toBe('Tomorrow');
		expect(whenFor('2026-10-12')).toBe('In 2 weeks');
		expect(whenFor('2027-05-28')).toBe('In 8 months');
		expect(whenFor('2027-09-28')).toBe('In 1 year');
	});

	it('gives the live card the first link of the item of its own role, however urgent the others', () => {
		// The reader chairs DISEC and UNSC and organises Northbridge; UNSC is sitting,
		// so the items run UNSC's, the dashboard's, then DISEC's. The card is named
		// after DISEC, the first committee by name, so its button has to be DISEC's.
		const northbridgeRow = makeFullConference({
			id: NORTHBRIDGE.id,
			slug: NORTHBRIDGE.slug,
			name: NORTHBRIDGE.name,
			startDate: NORTHBRIDGE.startDate,
			endDate: NORTHBRIDGE.endDate
		});
		const [card] = upcomingConferences(
			makeFacts({
				chairs: [
					makeChairRole(NORTHBRIDGE),
					makeChairRole(NORTHBRIDGE, {
						committeeId: 'committee-disec',
						committeeHeading: 'DISEC',
						committeeSlug: 'disec'
					})
				],
				organised: [makeOrganised(northbridgeRow)],
				todayItems: [
					makeItem('conference-elsewhere', 'Open dashboard'),
					makeKeyedItem(todayItemKey('chair', 'committee-unsc'), UNSC_ROOM),
					makeKeyedItem(todayItemKey('organise', NORTHBRIDGE.id), DASHBOARD),
					makeKeyedItem(todayItemKey('chair', 'committee-disec'), DISEC_ROOM)
				]
			}),
			NOW
		);

		expect(card.isLive).toBe(true);
		expect(card.when).toEqual({ text: 'Today', isLive: true });
		expect(card.chair?.committeeHeading).toBe('DISEC');
		expect(card.liveButton).toEqual(DISEC_ROOM);
	});

	it('falls back to the conference’s first item for a role with none of its own, and has no button without any', () => {
		// An accepted applicant has no item of their own; the conference's first item
		// stands in when there is one.
		const [withItem] = upcomingConferences(
			makeFacts({
				acceptedApplications: [NORTHBRIDGE],
				todayItems: [
					makeItem('conference-elsewhere', 'Open dashboard'),
					makeItem(NORTHBRIDGE.id, 'Schedule')
				]
			}),
			NOW
		);
		const [withoutItem] = upcomingConferences(
			makeFacts({ acceptedApplications: [NORTHBRIDGE] }),
			NOW
		);

		expect(withItem.liveButton).toEqual({ label: 'Schedule', href: '/schedule' });
		expect(withoutItem.isLive).toBe(true);
		expect(withoutItem.liveButton).toBeNull();
		expect(withoutItem.href).toBe('/conferences/northbridge-mun');
	});

	it('reads an organiser’s status line at the moment handed in', () => {
		const running = makeFullConference({
			id: 'conference-running',
			startDate: '2026-09-27',
			endDate: '2026-09-29'
		});
		const [card] = upcomingConferences(makeFacts({ organised: [makeOrganised(running)] }), NOW);

		expect(card.isLive).toBe(true);
		expect(card.organiser?.status).toEqual({ text: 'Day 2 of 3', tone: 'brand' });
	});
});

describe('ownTodayItem', () => {
	const unsc = makeKeyedItem(todayItemKey('chair', 'committee-unsc'), UNSC_ROOM);
	const disec = makeKeyedItem(todayItemKey('chair', 'committee-disec'), DISEC_ROOM);

	it('picks the item keyed by the card’s own role over the conference’s first', () => {
		expect(ownTodayItem(CHAIR_OF_DISEC, NORTHBRIDGE.id, [unsc, disec])).toBe(disec);
	});

	it('falls back to the conference’s first item when the role has none there, and to nothing when the conference has none', () => {
		const accepted: RoleDetails = { ...NO_ROLE_DETAILS, roleKind: 'accepted' };

		expect(ownTodayItem(CHAIR_OF_DISEC, NORTHBRIDGE.id, [unsc])).toBe(unsc);
		expect(ownTodayItem(accepted, NORTHBRIDGE.id, [unsc])).toBe(unsc);
		expect(ownTodayItem(accepted, 'conference-elsewhere', [unsc])).toBeNull();
	});

	it('finds the item `todayItems` builds for a seat, a chair, an organiser, a delegation and a volunteer', () => {
		// The items as `$lib/home-today.ts` really builds them, so the two files are
		// shown to agree on every key.
		const conference: TodayConference = NORTHBRIDGE;
		const committee = (id: string, isChair: boolean): TodayCommittee => ({
			id,
			heading: id,
			committeeSlug: id,
			conference,
			isChair,
			currentSession: null,
			nextEvent: null
		});
		const items = todayItems(
			{
				committees: [committee('committee-unsc', false), committee('committee-disec', true)],
				organisedConferences: [{ conference, committeeCount: 2, inSessionCount: 0 }],
				volunteerConferences: [conference],
				delegations: [{ delegationId: 'delegation-1', conference }],
				events: []
			},
			NOW
		);
		const seat: RoleDetails = {
			...NO_ROLE_DETAILS,
			roleKind: 'seat',
			seat: {
				name: 'Canada',
				countryCode: 'CA',
				committeeHeading: 'UNSC',
				committeeId: 'committee-unsc',
				positionPaper: 'due'
			}
		};
		const organiser: RoleDetails = {
			...NO_ROLE_DETAILS,
			roleKind: 'organiser',
			organiser: {
				status: { text: 'Day 2 of 3', tone: 'brand' },
				applicationsWaiting: 0,
				setupSteps: null
			}
		};
		const member: RoleDetails = {
			...NO_ROLE_DETAILS,
			roleKind: 'member',
			delegation: {
				id: 'delegation-1',
				name: 'Northbridge Academy',
				isHead: false,
				seatCount: 2,
				emptySeatCount: 0
			}
		};
		const volunteer: RoleDetails = { ...NO_ROLE_DETAILS, roleKind: 'volunteer' };
		const buttonOf = (role: RoleDetails) =>
			ownTodayItem(role, NORTHBRIDGE.id, items)?.links[0].label;

		expect(buttonOf(seat)).toBe('Open live room');
		expect(buttonOf(CHAIR_OF_DISEC)).toBe('Open chair room');
		expect(buttonOf(organiser)).toBe('Open dashboard');
		expect(buttonOf(member)).toBe('Delegation');
		expect(buttonOf(volunteer)).toBe('Schedule');
	});
});

describe('upcomingConferenceWhen', () => {
	/** When a conference starting `days` after 28 Sep 2026 is, in London. */
	function whenInDays(days: number): string {
		const start = new Date(Date.UTC(2026, 8, 28 + days)).toISOString().slice(0, 10);

		return upcomingConferenceWhen(start, NOW, 'Europe/London');
	}

	it('words every row of home.md’s table at its edges', () => {
		expect(whenInDays(1)).toBe('tomorrow');
		expect(whenInDays(2)).toBe('in 2 days');
		expect(whenInDays(13)).toBe('in 13 days');
		expect(whenInDays(14)).toBe('in 2 weeks');
		expect(whenInDays(29)).toBe('in 4 weeks');
		expect(whenInDays(30)).toBe('in 1 month');
		expect(whenInDays(59)).toBe('in 1 month');
		expect(whenInDays(60)).toBe('in 2 months');
		expect(whenInDays(364)).toBe('in 12 months');
		expect(whenInDays(365)).toBe('in 1 year');
		expect(whenInDays(730)).toBe('in 2 years');
	});

	it('counts the days in the conference’s own timezone', () => {
		// 11:00 UTC is already 29 Sep in Auckland, so 30 Sep is tomorrow there.
		expect(upcomingConferenceWhen('2026-09-30', NOW, 'Pacific/Auckland')).toBe('tomorrow');
		expect(upcomingConferenceWhen('2026-09-30', NOW, 'Europe/London')).toBe('in 2 days');
	});
});
