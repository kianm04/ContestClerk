import { describe, expect, it } from 'vitest';
import type {
	ApplicationListConference,
	ApplicationListEntry,
	MyApplicationListItem
} from './applications';
import type { HomeDashboard } from './home';
import {
	doorLabel,
	homeHero,
	isPressing,
	remainingTasks,
	titleRowLink,
	type ConferenceHero,
	type FindHero,
	type HeroFigure,
	type HomeHero
} from './home-hero';
import type { TodayEvent, TodayItem } from './home-today';
import type { MyQuickSession } from './my-quick-sessions';
import type { HomeTask } from './tasks';
import type { UpcomingConferenceCard } from './upcoming-conferences';
import {
	chairPapersUrl,
	chairRoomUrl,
	committeeLiveUrl,
	committeeUrl,
	delegationSeatsUrl,
	invoiceUrl,
	manageApplicationsUrl,
	manageConferenceUrl,
	positionPaperUrl,
	profileEditUrl
} from './urls';

// The hero of `docs/home.md`: sections 3.2 and 3.3 for what the panel says,
// section 4 for the one button, section 6 for the seven readers it is checked
// against.

/** Seven in the evening in Amsterdam, 29 Oct 2026. */
const NOW = new Date('2026-10-29T18:00:00Z');

/** Nine in the morning in Amsterdam on 26 Jul 2027, day 2 of Amsterdam Open MUN. */
const NOW_LIVE = new Date('2027-07-26T07:00:00Z');

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

/** Sofia's card on day 2, her paper in and UNHRC sitting. */
function makeLiveCard(overrides: Partial<UpcomingConferenceCard> = {}): UpcomingConferenceCard {
	const card = makeCard();

	return makeCard({
		seat: { ...card.seat!, positionPaper: 'handed_in' },
		when: { text: 'Today', isLive: true },
		isLive: true,
		liveButton: {
			label: 'Open live room',
			href: committeeLiveUrl('amsterdam-open-mun-2027', 'unhrc')
		},
		...overrides
	});
}

/** Lucas's card: chair of DISEC at The Hague, three papers waiting, no venue named yet. */
function makeChairCard(overrides: Partial<UpcomingConferenceCard> = {}): UpcomingConferenceCard {
	return makeCard({
		id: 'conference-hague',
		slug: 'the-hague-junior',
		name: 'The Hague International MUN Junior',
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

/** Hugo's card for The Hague, which he organises: published, four applications waiting. */
function makeOrganiserCard(
	overrides: Partial<UpcomingConferenceCard> = {}
): UpcomingConferenceCard {
	return makeChairCard({
		roleKind: 'organiser',
		...NO_ROLE,
		organiser: {
			status: { text: 'Applications open', tone: 'success' },
			applicationsWaiting: 4,
			setupSteps: null
		},
		href: manageConferenceUrl('the-hague-junior'),
		...overrides
	});
}

/** Hugo's draft, two of six setup steps done. */
function makeDraftCard(): UpcomingConferenceCard {
	return makeOrganiserCard({
		id: 'conference-draft',
		slug: 'draft-conference',
		name: 'Draft Conference (not public)',
		startDate: '2027-03-01',
		endDate: '2027-03-03',
		city: null,
		organiser: {
			status: { text: 'Draft · not public', tone: 'neutral' },
			applicationsWaiting: 0,
			setupSteps: { done: 2, required: 6 }
		},
		when: { text: 'In 4 months', isLive: false },
		href: manageConferenceUrl('draft-conference')
	});
}

/** Jasper's card: head of the Rotterdam Grammar delegation at Amsterdam, no seat of his own. */
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

/** A task with the fields every task has; the tasks below each fill in their own. */
function makeTask(overrides: Partial<HomeTask> = {}): HomeTask {
	return {
		id: 'task',
		kind: 'position_paper',
		conferenceId: 'conference-amsterdam',
		title: 'Submit position paper (UNHRC)',
		detail: 'Amsterdam Open MUN 2027 · Morocco',
		actionLabel: 'Write paper',
		deadline: null,
		href: positionPaperUrl('amsterdam-open-mun-2027', 'unhrc'),
		...overrides
	};
}

/** Sofia's overdue invoice from last spring's conference. */
const INVOICE_TASK = makeTask({
	id: 'invoice:invoice-1',
	kind: 'invoice',
	conferenceId: 'conference-rotterdam',
	title: 'Pay invoice rotterdammun-2026-0001',
	detail: 'Rotterdam Spring MUN 2026 · €65.00 · was due 2 Apr 2026',
	actionLabel: 'Pay invoice',
	deadline: { day: '2026-04-02', timezone: 'Europe/Amsterdam' },
	href: invoiceUrl('invoice-1')
});

/** Sofia's paper, due on the conference's first day. */
const PAPER_TASK = makeTask({
	id: 'position_paper:seat-1',
	deadline: { day: '2027-07-25', timezone: 'Europe/Amsterdam' }
});

/** Noor's profile, with two fields missing. */
const PROFILE_TASK = makeTask({
	id: 'profile',
	kind: 'profile',
	conferenceId: null,
	title: 'Complete your profile',
	detail: 'Your institution and country are missing.',
	actionLabel: 'Edit profile',
	href: profileEditUrl()
});

/** Jasper's two unfilled seats. */
const SEATS_TASK = makeTask({
	id: 'delegation_seats:delegation-1',
	kind: 'delegation_seats',
	title: 'Assign delegation seats (Rotterdam Grammar Delegation)',
	detail: 'Amsterdam Open MUN 2027 · 2 seats nobody holds yet',
	actionLabel: 'Assign seats',
	href: delegationSeatsUrl('delegation-1')
});

/** Lucas's three papers to review. */
const PAPERS_TASK = makeTask({
	id: 'review_papers:committee-disec',
	kind: 'review_papers',
	conferenceId: 'conference-hague',
	title: 'Review 3 position papers (DISEC)',
	detail: 'The Hague International MUN Junior',
	actionLabel: 'Review papers',
	href: chairPapersUrl('the-hague-junior', 'disec', 'submitted')
});

/** Hugo's applications waiting at The Hague, and at BERMUN. */
const DECIDE_HAGUE_TASK = makeTask({
	id: 'review_applications:conference-hague',
	kind: 'review_applications',
	conferenceId: 'conference-hague',
	title: 'Decide 4 applications (The Hague International MUN Junior)',
	detail: 'The oldest came in 6 days ago.',
	actionLabel: 'Review applications',
	href: manageApplicationsUrl('the-hague-junior')
});

const DECIDE_BERMUN_TASK = makeTask({
	id: 'review_applications:conference-bermun',
	kind: 'review_applications',
	conferenceId: 'conference-bermun',
	title: 'Decide 7 applications (BERMUN 2026)',
	detail: 'The oldest came in 2 days ago.',
	actionLabel: 'Review applications',
	href: manageApplicationsUrl('bermun-2026')
});

/** Hugo's draft, not ready to publish. */
const DRAFT_TASK = makeTask({
	id: 'publish:conference-draft',
	kind: 'publish',
	conferenceId: 'conference-draft',
	title: 'Finish setting up Draft Conference (not public)',
	detail: 'Draft · 2 of 6 setup steps done',
	actionLabel: 'Continue setup',
	href: manageConferenceUrl('draft-conference')
});

/** Sofia's seated item on day 2, with UNHRC's third session running. */
const SEAT_ITEM: TodayItem = {
	key: 'seat-committee-unhrc',
	conferenceId: 'conference-amsterdam',
	title: 'UNHRC · Session 3 in progress',
	detail: null,
	links: [{ label: 'Open live room', href: committeeLiveUrl('amsterdam-open-mun-2027', 'unhrc') }]
};

/** An event on Amsterdam's programme on day 2; the defaults are UNHRC's third session. */
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

/** Amira's application to BERMUN, which was not accepted. */
function makeRejectedApplication(): ApplicationListEntry {
	const conference: ApplicationListConference = {
		id: 'conference-bermun',
		slug: 'bermun-2026',
		name: 'BERMUN 2026',
		organizationName: 'Sample Europe MUN Network',
		logoPath: null,
		bannerPath: null,
		startDate: '2026-12-25',
		endDate: '2026-12-29',
		timezone: 'Europe/Berlin',
		isArchived: false,
		applicationsCloseAt: null,
		city: 'Berlin',
		venueName: null,
		locationMode: 'in_person'
	};
	const application: MyApplicationListItem = {
		id: 'application-1',
		status: 'rejected',
		submittedAt: '2026-10-02T09:00:00Z',
		updatedAt: '2026-10-20T09:00:00Z',
		conference,
		seat: null
	};

	return { kind: 'individual', id: application.id, application };
}

/** A quick session Lucas chairs. */
function makeQuickSession(name: string): MyQuickSession {
	return {
		committeeId: `committee-${name}`,
		committeeName: name,
		statusLine: 'No session yet',
		isInProgress: false,
		href: chairRoomUrl('quick-abcdefghij', 'practice')
	};
}

/** A dashboard with nothing on it, which each reader fills in. */
function makeDashboard(overrides: Partial<HomeDashboard> = {}): HomeDashboard {
	return {
		upcomingConferences: [],
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

/** (a) Noor: a new account with nothing but a profile to finish. */
const NOOR = makeDashboard({ tasks: [PROFILE_TASK], openConferenceCount: 6 });

/** (b) Sofia: a delegate eight months out, with an overdue invoice and a paper to write. */
const SOFIA = makeDashboard({
	upcomingConferences: [makeCard()],
	tasks: [INVOICE_TASK, PAPER_TASK]
});

/** (c) Sofia on day 2, UNHRC in session, lunch next. */
const SOFIA_LIVE = makeDashboard({
	upcomingConferences: [makeLiveCard()],
	tasks: [INVOICE_TASK],
	todayItems: [SEAT_ITEM],
	todayEvents: [makeTodayEvent(), LUNCH]
});

/** (d) Jasper: head of a delegation with two seats unfilled. */
const JASPER = makeDashboard({
	upcomingConferences: [makeDelegationCard(true)],
	tasks: [SEATS_TASK]
});

/** (e) Lucas: chair of DISEC with three papers waiting and two quick sessions. */
const LUCAS = makeDashboard({
	upcomingConferences: [makeChairCard()],
	tasks: [PAPERS_TASK],
	quickSessions: [makeQuickSession('Thursday practice'), makeQuickSession('Rules drill')],
	chairsSomething: true
});

/** (f) Hugo: organiser of The Hague and BERMUN, with a draft, applications waiting at both. */
const HUGO = makeDashboard({
	upcomingConferences: [
		makeOrganiserCard(),
		makeOrganiserCard({ id: 'conference-bermun', slug: 'bermun-2026', name: 'BERMUN 2026' }),
		makeDraftCard()
	],
	tasks: [DECIDE_HAGUE_TASK, DECIDE_BERMUN_TASK, DRAFT_TASK],
	hasManagedConferences: true,
	heroSeats: { held: 41, onOffer: 120 }
});

/**
 * (g) Amira: whose only application was not accepted. The server would say she
 * has taken part; the fixture leaves that false so the test below pins that the
 * application on the page is enough on its own to say "next".
 */
const AMIRA = makeDashboard({
	myApplications: [makeRejectedApplication()],
	openConferenceCount: 6
});

/** The hero as a conference hero, failing plainly when it is the find hero instead. */
function asConferenceHero(hero: HomeHero): ConferenceHero {
	if (hero.kind !== 'conference') {
		throw new Error('expected the conference hero');
	}

	return hero;
}

/** Narrows a hero to the find one, so a test can read its link; fails loudly on the other. */
function asFindHero(hero: HomeHero): FindHero {
	if (hero.kind !== 'find') {
		throw new Error('expected the find hero');
	}

	return hero;
}

describe('homeHero, for each reader of home.md', () => {
	it('(a) invites a new account to find its first conference, and leaves the profile a row', () => {
		const hero = homeHero(NOOR, NOW);

		expect(hero).toEqual({
			kind: 'find',
			title: 'Find your first conference',
			factLine: '6 conferences are open for applications.',
			primary: { label: 'Find a conference', href: '/conferences?open=1' },
			secondary: { label: 'Run a quick session', href: '/quick/new' }
		});
		expect(remainingTasks(NOOR.tasks, hero)).toEqual([PROFILE_TASK]);
		expect(titleRowLink(NOOR)).toEqual({ label: 'Create a conference', href: '/create' });
	});

	it('offers the quick session once: not beside the button when the greeting or the section has it', () => {
		const chairWithNothingToCome = makeDashboard({ chairsSomething: true });
		const withQuickSessions = makeDashboard({ quickSessions: [makeQuickSession('Practice')] });

		expect(titleRowLink(chairWithNothingToCome)?.label).toBe('Run a quick session');
		expect(asFindHero(homeHero(chairWithNothingToCome, NOW)).secondary).toBeNull();
		expect(titleRowLink(withQuickSessions)).toBeNull();
		expect(asFindHero(homeHero(withQuickSessions, NOW)).secondary).toBeNull();
	});

	it('(b) makes Sofia’s overdue invoice the next step and her committee the door', () => {
		const hero = homeHero(SOFIA, NOW);

		expect(hero).toEqual({
			kind: 'conference',
			conferenceId: 'conference-amsterdam',
			slug: 'amsterdam-open-mun-2027',
			name: 'Amsterdam Open MUN 2027',
			href: '/conferences/amsterdam-open-mun-2027/committees/unhrc',
			bannerPath: 'banners/amsterdam.jpg',
			timezone: 'Europe/Amsterdam',
			label: { text: 'Your next conference', isLive: false },
			metaLine: 'Delegate · 25 – 27 Jul 2027 · Beurs van Berlage, Amsterdam',
			figures: [
				{ value: '8 months', label: 'to go' },
				{ value: 'Morocco', label: 'UNHRC', flagCountryCode: 'MA' }
			],
			nextStep: {
				taskId: 'invoice:invoice-1',
				title: 'Pay invoice rotterdammun-2026-0001',
				detail: 'Rotterdam Spring MUN 2026 · €65.00 · was due 2 Apr 2026',
				due: { text: 'Overdue', tone: 'danger', hasDot: true }
			},
			primary: { label: 'Pay invoice', href: '/invoices/invoice-1' },
			secondary: {
				label: 'Open committee page',
				href: '/conferences/amsterdam-open-mun-2027/committees/unhrc'
			}
		});
		expect(remainingTasks(SOFIA.tasks, hero)).toEqual([PAPER_TASK]);
		expect(titleRowLink(SOFIA)).toEqual({ label: 'Create a conference', href: '/create' });
	});

	it('(c) on day 2 the room outranks the debt: the live button, the session and what is next', () => {
		const hero = asConferenceHero(homeHero(SOFIA_LIVE, NOW_LIVE));

		expect(hero.label).toEqual({ text: 'Running now · day 2 of 3', isLive: true });
		expect(hero.figures).toEqual([
			{ value: 'In session', label: 'UNHRC · Session 3' },
			{ value: 'Morocco', label: 'UNHRC', flagCountryCode: 'MA' },
			{ value: '12:30', label: 'Next: Lunch · Atrium' }
		]);
		expect(hero.nextStep).toBeNull();
		expect(hero.primary).toEqual({
			label: 'Open live room',
			href: '/conferences/amsterdam-open-mun-2027/committees/unhrc/live'
		});
		expect(hero.secondary).toEqual({
			label: "Today's programme",
			href: '/conferences/amsterdam-open-mun-2027/schedule'
		});
		// The invoice is the first "To do" row instead of the button.
		expect(remainingTasks(SOFIA_LIVE.tasks, hero)).toEqual([INVOICE_TASK]);
	});

	it('(d) makes Jasper’s unfilled seats the next step, with "0 of 2" in the strip', () => {
		const hero = asConferenceHero(homeHero(JASPER, NOW));

		expect(hero.metaLine).toBe(
			'Head of delegation · Rotterdam Grammar Delegation · 25 – 27 Jul 2027 · Beurs van Berlage, Amsterdam'
		);
		expect(hero.figures).toEqual([
			{ value: '8 months', label: 'to go' },
			{ value: '0 of 2', label: 'seats assigned' }
		]);
		expect(hero.nextStep).toEqual({
			taskId: 'delegation_seats:delegation-1',
			title: 'Assign delegation seats (Rotterdam Grammar Delegation)',
			detail: 'Amsterdam Open MUN 2027 · 2 seats nobody holds yet',
			due: null
		});
		expect(hero.primary).toEqual({
			label: 'Assign seats',
			href: '/delegations/delegation-1/seats'
		});
		expect(hero.secondary).toEqual({ label: 'Open delegation', href: '/delegations/delegation-1' });
		// His one task is the next step, so there is no "To do".
		expect(remainingTasks(JASPER.tasks, hero)).toEqual([]);
	});

	it('(e) makes Lucas’s papers the next step, and leaves the title row to the quick sessions', () => {
		const hero = asConferenceHero(homeHero(LUCAS, NOW));

		expect(hero.metaLine).toBe('Chair of DISEC · 8 – 10 Dec 2026 · The Hague');
		expect(hero.figures).toEqual([
			{ value: '1 month', label: 'to go' },
			{ value: '3', label: 'papers to review' }
		]);
		expect(hero.nextStep?.title).toBe('Review 3 position papers (DISEC)');
		expect(hero.primary).toEqual({
			label: 'Review papers',
			href: '/conferences/the-hague-junior/committees/disec/chair/papers?status=submitted'
		});
		expect(hero.secondary).toEqual({
			label: 'Open chair room',
			href: '/conferences/the-hague-junior/committees/disec/chair'
		});
		expect(titleRowLink(LUCAS)).toBeNull();
	});

	it('(f) counts Hugo’s applications and seats, and makes the first "Decide" the next step', () => {
		const hero = asConferenceHero(homeHero(HUGO, NOW));

		expect(hero.metaLine).toBe('Organiser · 8 – 10 Dec 2026 · The Hague');
		expect(hero.figures).toEqual([
			{ value: '1 month', label: 'to go' },
			{ value: '4', label: 'applications waiting' },
			{ value: '41 of 120', label: 'seats held' }
		]);
		expect(hero.nextStep?.title).toBe('Decide 4 applications (The Hague International MUN Junior)');
		expect(hero.primary).toEqual({
			label: 'Review applications',
			href: '/manage/the-hague-junior/applications'
		});
		expect(hero.secondary).toEqual({ label: 'Open dashboard', href: '/manage/the-hague-junior' });
		expect(remainingTasks(HUGO.tasks, hero)).toEqual([DECIDE_BERMUN_TASK, DRAFT_TASK]);
		expect(titleRowLink(HUGO)).toBeNull();
	});

	it('(f) with nobody applying, Hugo’s button is the dashboard and his draft stays a row', () => {
		const quiet = makeDashboard({ ...HUGO, tasks: [DRAFT_TASK] });

		const hero = asConferenceHero(homeHero(quiet, NOW));

		expect(hero.nextStep).toBeNull();
		expect(hero.primary).toEqual({ label: 'Open dashboard', href: '/manage/the-hague-junior' });
		expect(hero.secondary).toEqual({
			label: 'Public page',
			href: '/conferences/the-hague-junior'
		});
		expect(remainingTasks(quiet.tasks, hero)).toEqual([DRAFT_TASK]);
	});

	it('(g) invites Amira to find her next conference, with the count of open ones', () => {
		expect(homeHero(AMIRA, NOW)).toEqual({
			kind: 'find',
			title: 'Find your next conference',
			factLine: '6 conferences are open for applications.',
			primary: { label: 'Find a conference', href: '/conferences?open=1' },
			secondary: { label: 'Run a quick session', href: '/quick/new' }
		});
	});

	it('never leaves a reader with no button or with two', () => {
		for (const [dashboard, now] of [
			[NOOR, NOW],
			[SOFIA, NOW],
			[SOFIA_LIVE, NOW_LIVE],
			[JASPER, NOW],
			[LUCAS, NOW],
			[HUGO, NOW],
			[AMIRA, NOW]
		] as const) {
			const hero = homeHero(dashboard, now);

			expect(hero.primary.label).not.toBe('');

			if (hero.kind === 'conference' && hero.secondary !== null) {
				expect(hero.secondary.href).not.toBe(hero.primary.href);
			}
		}
	});
});

describe('the find hero’s fact line', () => {
	it('counts the conferences open for applications, in the singular when there is one', () => {
		const hero = homeHero(makeDashboard({ openConferenceCount: 1 }), NOW);

		expect(hero.kind === 'find' && hero.factLine).toBe('1 conference is open for applications.');
	});

	it('says so when none is open', () => {
		const hero = homeHero(makeDashboard({ openConferenceCount: 0 }), NOW);

		expect(hero.kind === 'find' && hero.factLine).toBe(
			'No conference is open for applications right now.'
		);
	});

	it('says nothing when the count was not read', () => {
		const hero = homeHero(makeDashboard(), NOW);

		expect(hero.kind === 'find' && hero.factLine).toBe('');
	});

	it('says "next" for a reader who organises or chairs but has nothing to come', () => {
		const organiser = homeHero(makeDashboard({ hasManagedConferences: true }), NOW);
		const chair = homeHero(makeDashboard({ chairsSomething: true }), NOW);

		expect(organiser.kind === 'find' && organiser.title).toBe('Find your next conference');
		expect(chair.kind === 'find' && chair.title).toBe('Find your next conference');
	});

	it('says "next" for a reader the server knows has taken part, however long ago, and "first" otherwise', () => {
		// A delegate whose only conference is over has nothing on the page to show
		// for it: `hasTakenPart` is the server's word that there was one.
		const pastDelegate = homeHero(makeDashboard({ hasTakenPart: true }), NOW);
		const newcomer = homeHero(makeDashboard({ hasTakenPart: false }), NOW);

		expect(pastDelegate.kind === 'find' && pastDelegate.title).toBe('Find your next conference');
		expect(newcomer.kind === 'find' && newcomer.title).toBe('Find your first conference');
	});
});

describe('the hero’s figures', () => {
	/** The figures of a hero built for one card alone, with nothing else on the dashboard. */
	function figuresOf(card: UpcomingConferenceCard, overrides: Partial<HomeDashboard> = {}) {
		const dashboard = makeDashboard({ upcomingConferences: [card], ...overrides });

		return asConferenceHero(homeHero(dashboard, card.isLive ? NOW_LIVE : NOW)).figures;
	}

	it('keeps "Tomorrow" as it is over "to go"', () => {
		const card = makeCard({
			roleKind: 'volunteer',
			...NO_ROLE,
			when: { text: 'Tomorrow', isLive: false }
		});

		expect(figuresOf(card)).toEqual([{ value: 'Tomorrow', label: 'to go' }]);
	});

	it('leaves the flag off a seat that is not a country', () => {
		const card = makeCard();
		const pressCorps = makeCard({
			seat: { ...card.seat!, name: 'Press corps', countryCode: null }
		});

		expect(figuresOf(pressCorps)[1]).toEqual({ value: 'Press corps', label: 'UNHRC' });
	});

	it('adds "Handed in" once a delegate’s paper is in', () => {
		const card = makeCard();
		const handedIn = makeCard({ seat: { ...card.seat!, positionPaper: 'handed_in' } });

		expect(figuresOf(handedIn)[2]).toEqual({ value: 'Handed in', label: 'position paper' });
		expect(figuresOf(card)).toHaveLength(2);
	});

	it('shows a chair’s "0" papers rather than leaving the figure out', () => {
		const card = makeChairCard();
		const idle = makeChairCard({ chair: { ...card.chair!, papersWaiting: 0 } });

		expect(figuresOf(idle)[1]).toEqual({ value: '0', label: 'papers to review' });
	});

	it('counts a draft’s setup steps instead of applications, and never its seats', () => {
		expect(figuresOf(makeDraftCard(), { heroSeats: { held: 0, onOffer: 0 } })).toEqual([
			{ value: '4 months', label: 'to go' },
			{ value: '2 of 6', label: 'setup steps done' }
		]);
	});

	it('leaves a published organiser’s seats out when they were not read, and until any are on offer', () => {
		const unread = figuresOf(makeOrganiserCard());
		const noneOnOffer = figuresOf(makeOrganiserCard(), { heroSeats: { held: 0, onOffer: 0 } });

		// "0 of 0" is not a value, so the figure waits for the first seat.
		for (const figures of [unread, noneOnOffer]) {
			expect(figures).toEqual([
				{ value: '1 month', label: 'to go' },
				{ value: '4', label: 'applications waiting' }
			]);
		}
	});

	it('leaves a head’s seats out while the delegation has been given none', () => {
		const head = makeDelegationCard(true);
		const unseated = makeCard({
			...head,
			delegation: { ...head.delegation!, seatCount: 0, emptySeatCount: 0 }
		});

		expect(figuresOf(unseated)).toEqual([{ value: '8 months', label: 'to go' }]);
	});

	it('gives a member, an accepted applicant and a volunteer the countdown alone', () => {
		const member = makeDelegationCard(false);
		const accepted = makeCard({ roleKind: 'accepted', ...NO_ROLE });
		const volunteer = makeCard({ roleKind: 'volunteer', ...NO_ROLE });

		for (const card of [member, accepted, volunteer]) {
			expect(figuresOf(card)).toEqual([{ value: '8 months', label: 'to go' }]);
		}
	});

	/** Lucas's card on a day his conference runs, and DISEC's own item saying `title`. */
	function liveChair(title: string): [UpcomingConferenceCard, TodayItem] {
		const card = makeChairCard({
			startDate: '2027-07-25',
			endDate: '2027-07-27',
			id: 'conference-amsterdam',
			when: { text: 'Today', isLive: true },
			isLive: true,
			liveButton: { label: 'Open chair room', href: chairRoomUrl('the-hague-junior', 'disec') }
		});
		const item: TodayItem = { ...SEAT_ITEM, key: 'chair-committee-disec', title };

		return [card, item];
	}

	/** The first figure of Lucas's hero when DISEC's item says `title`. */
	function chairFigure(title: string): HeroFigure {
		const [card, item] = liveChair(title);

		return figuresOf(card, { todayItems: [item] })[0];
	}

	it('reads a chair’s session off their item: in progress, not started, ended', () => {
		expect(chairFigure('DISEC · Session 3 in progress')).toEqual({
			value: 'In session',
			label: 'DISEC · Session 3'
		});
		expect(chairFigure('DISEC · no session yet')).toEqual({
			value: 'No session yet',
			label: 'DISEC'
		});
		expect(chairFigure('DISEC · Session 2 ended')).toEqual({
			value: 'Session 2 ended',
			label: 'DISEC'
		});
	});

	it('reads the item of the card’s own role, not the conference’s most urgent one', () => {
		// Lucas chairs DISEC and organises the conference, where UNSC is sitting: the
		// conference's items run UNSC's, the dashboard's, then DISEC's own. The card is
		// about DISEC, so its figure is DISEC's quiet room, not UNSC's session or the
		// room count.
		const [card, disec] = liveChair('DISEC · no session yet');
		const unsc: TodayItem = {
			...SEAT_ITEM,
			key: 'chair-committee-unsc',
			title: 'UNSC · Session 1 in progress',
			links: [{ label: 'Open chair room', href: chairRoomUrl('the-hague-junior', 'unsc') }]
		};
		const organise: TodayItem = {
			...SEAT_ITEM,
			key: 'organise-conference-amsterdam',
			title: 'The Hague International MUN Junior · day 2 of 3',
			detail: '1 of 4 committees in session',
			links: [{ label: 'Open dashboard', href: manageConferenceUrl('the-hague-junior') }]
		};

		expect(figuresOf(card, { todayItems: [unsc, organise, disec] })[0]).toEqual({
			value: 'No session yet',
			label: 'DISEC'
		});
	});

	it('says "Not in session" for a seated delegate between sessions, whatever is next', () => {
		const card = makeLiveCard();
		const between = { ...SEAT_ITEM, title: 'UNHRC · next: Committee session 4, 14:00' };
		const idle = { ...SEAT_ITEM, title: 'UNHRC · not in session' };

		expect(figuresOf(card, { todayItems: [between] })[0]).toEqual({
			value: 'Not in session',
			label: 'UNHRC'
		});
		expect(figuresOf(card, { todayItems: [idle] })[0]).toEqual({
			value: 'Not in session',
			label: 'UNHRC'
		});
	});

	it('counts an organiser’s committees in session off their item', () => {
		const card = makeOrganiserCard({
			id: 'conference-amsterdam',
			startDate: '2027-07-25',
			endDate: '2027-07-27',
			when: { text: 'Today', isLive: true },
			isLive: true,
			liveButton: { label: 'Open dashboard', href: manageConferenceUrl('the-hague-junior') }
		});
		const item: TodayItem = {
			...SEAT_ITEM,
			key: 'organise-conference-amsterdam',
			title: 'The Hague International MUN Junior · day 2 of 3',
			detail: '3 of 4 committees in session'
		};

		expect(figuresOf(card, { todayItems: [item] })).toEqual([
			{ value: '3 of 4', label: 'committees in session' },
			{ value: '4', label: 'applications waiting' }
		]);
	});

	it('shows when the event in progress ends once nothing follows it today', () => {
		const figures = figuresOf(makeLiveCard(), {
			todayItems: [SEAT_ITEM],
			todayEvents: [makeTodayEvent()]
		});

		expect(figures[2]).toEqual({ value: '12:30', label: 'Committee session 3 ends' });
	});

	it('has no third figure once today’s programme is over, and no first for a reader without an item', () => {
		expect(figuresOf(makeLiveCard(), { todayItems: [SEAT_ITEM] })).toHaveLength(2);

		const volunteer = makeLiveCard({ roleKind: 'volunteer', ...NO_ROLE, liveButton: null });

		expect(figuresOf(volunteer, { todayEvents: [LUNCH] })).toEqual([
			{ value: '12:30', label: 'Next: Lunch · Atrium' }
		]);
	});

	it('has no third figure in the evening, when the server has already read tomorrow’s first session', () => {
		// Nine in the evening on day 2, the day's programme over. The server reads a
		// day ahead, so day 3's 09:00 session is in `todayEvents`; it is not today's.
		const evening = new Date('2027-07-26T19:00:00Z');
		const tomorrowsSession = makeTodayEvent({
			id: 'event-session-4',
			title: 'Committee session 4',
			startsAt: '2027-07-27T07:00:00Z',
			endsAt: '2027-07-27T10:30:00Z'
		});
		const dashboard = makeDashboard({
			upcomingConferences: [makeLiveCard()],
			todayItems: [{ ...SEAT_ITEM, title: 'UNHRC · not in session' }],
			todayEvents: [tomorrowsSession]
		});

		const { figures } = asConferenceHero(homeHero(dashboard, evening));

		expect(figures).toEqual([
			{ value: 'Not in session', label: 'UNHRC' },
			{ value: 'Morocco', label: 'UNHRC', flagCountryCode: 'MA' }
		]);
	});
});

describe('the one button', () => {
	it('gives a draft’s publish task the button, with no door beside it that opens the same page', () => {
		const dashboard = makeDashboard({
			upcomingConferences: [makeDraftCard()],
			tasks: [DRAFT_TASK],
			hasManagedConferences: true
		});

		const hero = asConferenceHero(homeHero(dashboard, NOW));

		expect(hero.nextStep).toEqual({
			taskId: 'publish:conference-draft',
			title: 'Finish setting up Draft Conference (not public)',
			// The strip two lines above already reads "2 of 6 / setup steps done", so the
			// step does not say it again.
			detail: null,
			due: null
		});
		expect(hero.figures[1]).toEqual({ value: '2 of 6', label: 'setup steps done' });
		expect(hero.primary).toEqual({ label: 'Continue setup', href: '/manage/draft-conference' });
		expect(hero.secondary).toBeNull();
	});

	it('opens a volunteer’s conference page, with nothing beside it', () => {
		const volunteer = makeCard({
			roleKind: 'volunteer',
			...NO_ROLE,
			href: '/conferences/amsterdam-open-mun-2027'
		});

		const hero = asConferenceHero(
			homeHero(makeDashboard({ upcomingConferences: [volunteer] }), NOW)
		);

		expect(hero.primary).toEqual({
			label: 'View conference',
			href: '/conferences/amsterdam-open-mun-2027'
		});
		expect(hero.secondary).toBeNull();
	});

	it('lets a delegation member on a conference day fall through to the door', () => {
		const member = makeDelegationCard(false);
		const live = makeCard({
			...member,
			when: { text: 'Today', isLive: true },
			isLive: true,
			liveButton: { label: 'Delegation', href: '/delegations/delegation-1' }
		});

		const hero = asConferenceHero(
			homeHero(makeDashboard({ upcomingConferences: [live] }), NOW_LIVE)
		);

		expect(hero.primary).toEqual({ label: 'Open delegation', href: '/delegations/delegation-1' });
		expect(hero.secondary).toEqual({
			label: "Today's programme",
			href: '/conferences/amsterdam-open-mun-2027/schedule'
		});
	});

	it('puts today’s programme beside a volunteer’s door on a conference day', () => {
		const volunteer = makeCard({
			roleKind: 'volunteer',
			...NO_ROLE,
			href: '/conferences/amsterdam-open-mun-2027',
			when: { text: 'Today', isLive: true },
			isLive: true,
			liveButton: { label: 'Schedule', href: '/conferences/amsterdam-open-mun-2027/schedule' }
		});

		const hero = asConferenceHero(
			homeHero(makeDashboard({ upcomingConferences: [volunteer] }), NOW_LIVE)
		);

		expect(hero.primary).toEqual({
			label: 'View conference',
			href: '/conferences/amsterdam-open-mun-2027'
		});
		expect(hero.secondary).toEqual({
			label: "Today's programme",
			href: '/conferences/amsterdam-open-mun-2027/schedule'
		});
	});

	it('passes over a pressing task with nowhere to go', () => {
		const dashboard = makeDashboard({
			upcomingConferences: [makeDelegationCard(true)],
			tasks: [makeTask({ ...SEATS_TASK, href: undefined })]
		});

		const hero = asConferenceHero(homeHero(dashboard, NOW));

		expect(hero.nextStep).toBeNull();
		expect(hero.primary.label).toBe('Open delegation');
	});
});

describe('isPressing', () => {
	it('is true for a task overdue or due within the week, from any conference', () => {
		expect(isPressing(INVOICE_TASK, 'conference-amsterdam', NOW)).toBe(true);

		const dueInAWeek = makeTask({ deadline: { day: '2026-11-05', timezone: 'Europe/Amsterdam' } });

		expect(isPressing(dueInAWeek, 'conference-amsterdam', NOW)).toBe(true);
	});

	it('is false for a task due in eight days or more', () => {
		const dueLater = makeTask({ deadline: { day: '2026-11-06', timezone: 'Europe/Amsterdam' } });

		expect(isPressing(dueLater, 'conference-amsterdam', NOW)).toBe(false);
		expect(isPressing(PAPER_TASK, 'conference-amsterdam', NOW)).toBe(false);
	});

	it('is true for undated tasks somebody is waiting on the reader for', () => {
		expect(isPressing(DECIDE_HAGUE_TASK, 'conference-amsterdam', NOW)).toBe(true);
		expect(isPressing(PAPERS_TASK, 'conference-amsterdam', NOW)).toBe(true);
		expect(isPressing(SEATS_TASK, 'conference-hague', NOW)).toBe(true);
	});

	it('is true for the hero conference’s own draft and false for another', () => {
		expect(isPressing(DRAFT_TASK, 'conference-draft', NOW)).toBe(true);
		expect(isPressing(DRAFT_TASK, 'conference-hague', NOW)).toBe(false);
		expect(isPressing(DRAFT_TASK, null, NOW)).toBe(false);
	});

	it('is never true for the profile task', () => {
		expect(isPressing(PROFILE_TASK, null, NOW)).toBe(false);
	});
});

describe('remainingTasks', () => {
	it('leaves every task when the hero took none', () => {
		const hero = homeHero(NOOR, NOW);

		expect(remainingTasks([PROFILE_TASK, PAPER_TASK], hero)).toEqual([PROFILE_TASK, PAPER_TASK]);
	});
});

describe('doorLabel', () => {
	it('names the door by what the reader is there', () => {
		expect(doorLabel(makeCard())).toBe('Open committee page');
		expect(doorLabel(makeChairCard())).toBe('Open chair room');
		expect(doorLabel(makeOrganiserCard())).toBe('Open dashboard');
		expect(doorLabel(makeDraftCard())).toBe('Continue setup');
		expect(doorLabel(makeDelegationCard(true))).toBe('Open delegation');
		expect(doorLabel(makeDelegationCard(false))).toBe('Open delegation');
		expect(doorLabel(makeCard({ roleKind: 'accepted', ...NO_ROLE }))).toBe('View conference');
		expect(doorLabel(makeCard({ roleKind: 'volunteer', ...NO_ROLE }))).toBe('View conference');
	});
});

describe('titleRowLink', () => {
	it('is nothing when the quick sessions section is on the page', () => {
		expect(titleRowLink(LUCAS)).toBeNull();
	});

	it('offers a chair a quick session, even one who also organises', () => {
		const chair = makeDashboard({ chairsSomething: true });
		const chairWhoOrganises = makeDashboard({ chairsSomething: true, hasManagedConferences: true });

		expect(titleRowLink(chair)).toEqual({ label: 'Run a quick session', href: '/quick/new' });
		expect(titleRowLink(chairWhoOrganises)).toEqual({
			label: 'Run a quick session',
			href: '/quick/new'
		});
	});

	it('offers everybody who manages nothing a conference to create', () => {
		expect(titleRowLink(SOFIA)).toEqual({ label: 'Create a conference', href: '/create' });
	});

	it('is nothing for an organiser, whose Manage tab is theirs', () => {
		expect(titleRowLink(HUGO)).toBeNull();
	});
});
