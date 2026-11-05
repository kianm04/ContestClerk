import { describe, expect, it } from 'vitest';
import type { ApplicationListConference, MyApplicationListItem } from '$lib/applications';
import type { Conference } from '$lib/conferences';
import type { ProfileFieldsToCheck } from '$lib/profiles';
import { publishChecklistItems, type PublishChecklistCounts } from '$lib/publish-checklist';
import {
	deriveTasks,
	setupStepCounts,
	type ChairedCommitteePapers,
	type DelegationWithEmptySeats,
	type ManagedConferenceFacts,
	type PositionPaperSeat,
	type TaskFacts,
	type UnpaidInvoice,
	type WaitingApplications
} from './tasks';

// These tests are the rules of the "To do" list on `/home`, one describe block
// each, plus the order the finished list comes out in. Nothing here touches a
// database or the clock: `deriveTasks` is handed the rows and the moment, which
// is the whole point of keeping it in `$lib`.

/** A moment in the middle of a day. Every deadline below is written relative to it. */
const NOW = new Date('2026-09-17T12:00:00Z');

/** A profile with all four required fields filled in. */
const COMPLETE_PROFILE: ProfileFieldsToCheck = {
	fullName: 'Daniel Okafor',
	institutionName: 'Delft University of Technology',
	countryCode: 'NL',
	experienceLevel: 'intermediate'
};

/** Nothing at all to do. A test adds only the facts its own rule is about. */
const NO_FACTS: TaskFacts = {
	profile: COMPLETE_PROFILE,
	seats: [],
	invoices: [],
	applications: [],
	waitingApplications: [],
	delegations: [],
	managedConferences: [],
	chairedCommittees: []
};

/** The facts with one part of them replaced by whatever the test is about. */
function makeFacts(overrides: Partial<TaskFacts> = {}): TaskFacts {
	return { ...NO_FACTS, ...overrides };
}

/** A seat at a conference that wants a position paper and has not been given one. */
function makeSeat(overrides: Partial<PositionPaperSeat> = {}): PositionPaperSeat {
	return {
		seatId: 'seat-1',
		seatName: 'France',
		conferenceId: 'conference-thimun',
		conferenceSlug: 'thimun-2027',
		conferenceName: 'THIMUN 2027',
		conferenceStartDate: '2027-01-24',
		committeeSlug: 'unsc',
		committeeHeading: 'UNSC',
		conferenceTimezone: 'Europe/Amsterdam',
		isPositionPaperRequired: true,
		positionPaperDeadline: '2026-09-20T22:00:00Z',
		hasPositionPaper: false,
		...overrides
	};
}

/** An invoice of the reader's own that is still to be paid, due in five weeks. */
function makeInvoice(overrides: Partial<UnpaidInvoice> = {}): UnpaidInvoice {
	return {
		id: 'invoice-1',
		number: 'INV-0007',
		conferenceId: 'conference-rotterdam',
		conferenceName: 'Rotterdam Spring MUN 2026',
		amountCents: 6500,
		currency: 'EUR',
		dueAt: '2026-10-21T22:00:00Z',
		conferenceTimezone: 'Europe/Amsterdam',
		...overrides
	};
}

/** The conference one application row names. */
function makeApplicationConference(
	overrides: Partial<ApplicationListConference> = {}
): ApplicationListConference {
	return {
		id: 'conference-1',
		slug: 'delftmun-2026',
		name: 'DelftMUN 2026',
		organizationName: 'Delft MUN Society',
		logoPath: null,
		bannerPath: null,
		startDate: '2026-11-20',
		endDate: '2026-11-22',
		timezone: 'Europe/Amsterdam',
		isArchived: false,
		applicationsCloseAt: '2026-10-01T22:00:00Z',
		city: 'Delft',
		venueName: null,
		locationMode: 'in_person',
		...overrides
	};
}

/** An application still in draft at a conference whose window is open. */
function makeApplication(overrides: Partial<MyApplicationListItem> = {}): MyApplicationListItem {
	return {
		id: 'application-1',
		status: 'draft',
		submittedAt: null,
		updatedAt: '2026-09-10T09:00:00Z',
		conference: makeApplicationConference(),
		seat: null,
		...overrides
	};
}

/** Four applications waiting at a conference the reader organises, the oldest six days old. */
function makeWaitingApplications(
	overrides: Partial<WaitingApplications> = {}
): WaitingApplications {
	return {
		conferenceId: 'conference-bermun',
		conferenceName: 'BERMUN 2026',
		conferenceSlug: 'bermun-2026',
		conferenceTimezone: 'Europe/Berlin',
		count: 4,
		oldestSubmittedAt: '2026-09-11T10:00:00Z',
		...overrides
	};
}

/** A delegation the reader heads that still has two of its three seats empty. */
function makeDelegation(
	overrides: Partial<DelegationWithEmptySeats> = {}
): DelegationWithEmptySeats {
	return {
		id: 'delegation-1',
		name: 'LSE Team',
		conferenceId: 'conference-1',
		conferenceName: 'DelftMUN 2026',
		seatCount: 3,
		emptySeatCount: 2,
		...overrides
	};
}

/**
 * A draft conference with every required checklist item answered, so that
 * `canPublish` says yes about it.
 */
const READY_DRAFT: Conference = {
	id: 'conference-ready',
	slug: 'thimun-2027',
	name: 'THIMUN 2027',
	description: 'A large conference in The Hague.',
	organizationName: 'THIMUN Foundation',
	organizationSlug: 'thimun-foundation',
	city: 'The Hague',
	countryCode: 'NL',
	countryName: 'Netherlands',
	locationMode: 'in_person',
	venueStatus: 'tba',
	conferenceTimeStatus: 'tba',
	startTime: null,
	endTime: null,
	feeStatus: 'undecided',
	applicationOpenMode: 'on_publish',
	startDate: '2027-01-24',
	endDate: '2027-01-29',
	websiteUrl: null,
	bannerPath: 'conferences/thimun/banner.jpg',
	logoPath: null,
	level: 'high_school',
	status: 'draft',
	timezone: 'Europe/Amsterdam',
	expectedDelegates: null,
	applicationsOpenAt: '2026-09-30T22:00:00Z',
	applicationsCloseAt: '2026-12-01T22:00:00Z',
	committeeCount: 8,
	committeeNames: [],
	tagline: 'The Hague, every January.',
	venueName: 'World Forum',
	venueAddress: null,
	contactEmail: 'team@thimun.example',
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
	acceptsDelegations: true
};

/** Counts that answer the two checklist items a conference row cannot answer itself. */
const READY_COUNTS: PublishChecklistCounts = {
	committeeCount: 8,
	committeesWithoutAvailableSeatsCount: 0,
	onlyCommitteeWithoutSeatsId: null,
	feeCount: 1,
	collectsPaymentsManually: false,
	isStripeConnected: true
};

/** A conference the reader helps run, with what its checklist needs. */
function makeManagedConference(
	conferenceOverrides: Partial<Conference> = {},
	countsOverrides: Partial<PublishChecklistCounts> = {}
): ManagedConferenceFacts {
	return {
		conference: { ...READY_DRAFT, ...conferenceOverrides },
		checklistCounts: { ...READY_COUNTS, ...countsOverrides }
	};
}

/** A committee the reader chairs with `waitingCount` papers awaiting review. */
function makeChairedCommittee(
	overrides: Partial<ChairedCommitteePapers> = {}
): ChairedCommitteePapers {
	return {
		committeeId: 'committee-hrc',
		conferenceId: 'conference-northbridge',
		conferenceSlug: 'northbridge-2026',
		conferenceName: 'Northbridge MUN 2026',
		committeeSlug: 'hrc',
		committeeHeading: 'HRC',
		waitingCount: 2,
		...overrides
	};
}

/** The titles of the tasks a set of facts produces, in the order they come out. */
function titlesOf(facts: TaskFacts): string[] {
	return deriveTasks(facts, NOW).map((task) => task.title);
}

/** The detail line of the one task a set of facts produces. */
function detailOf(facts: TaskFacts): string | null {
	return deriveTasks(facts, NOW)[0].detail;
}

describe('deriveTasks', () => {
	it('gives somebody with nothing outstanding an empty list', () => {
		expect(deriveTasks(NO_FACTS, NOW)).toEqual([]);
	});
});

describe('rule 1: complete your profile', () => {
	it('asks for the profile when a required field is empty, and says which', () => {
		const facts = makeFacts({ profile: { ...COMPLETE_PROFILE, institutionName: '' } });

		expect(deriveTasks(facts, NOW)).toEqual([
			{
				id: 'profile',
				kind: 'profile',
				conferenceId: null,
				title: 'Complete your profile',
				detail: 'Your institution is missing.',
				actionLabel: 'Edit profile',
				deadline: null,
				href: '/profile/edit'
			}
		]);
	});

	it('lists several missing fields in the words the profile page uses', () => {
		const facts = makeFacts({
			profile: { ...COMPLETE_PROFILE, fullName: '', institutionName: '', countryCode: '' }
		});

		expect(detailOf(facts)).toBe('Your name, institution and country are missing.');
	});

	it('counts a field holding only spaces as empty', () => {
		const facts = makeFacts({ profile: { ...COMPLETE_PROFILE, countryCode: '   ' } });

		expect(titlesOf(facts)).toEqual(['Complete your profile']);
	});

	it('drops the task once every field is filled in', () => {
		expect(titlesOf(makeFacts())).toEqual([]);
	});

	it('counts "First time" as a real answer rather than an empty one', () => {
		// `experience_level` is `not null default 'none'`, and 'none' is the
		// "First time" choice on the welcome form, not an unanswered question.
		const facts = makeFacts({ profile: { ...COMPLETE_PROFILE, experienceLevel: 'none' } });

		expect(titlesOf(facts)).toEqual([]);
	});
});

describe('rule 2: submit position paper', () => {
	it('names the committee, the conference and the seat, due in the conference’s own timezone', () => {
		const facts = makeFacts({ seats: [makeSeat()] });

		expect(deriveTasks(facts, NOW)).toEqual([
			{
				id: 'position_paper:seat-1',
				kind: 'position_paper',
				conferenceId: 'conference-thimun',
				title: 'Submit position paper (UNSC)',
				detail: 'THIMUN 2027 · France',
				actionLabel: 'Write paper',
				// 22:00 UTC is midnight in Amsterdam, so the deadline falls on the 21st
				// where the conference is and not on the 20th.
				deadline: { day: '2026-09-21', timezone: 'Europe/Amsterdam' },
				href: '/conferences/thimun-2027/committees/unsc/position-paper'
			}
		]);
	});

	it('says nothing about a conference that does not ask for papers', () => {
		const facts = makeFacts({ seats: [makeSeat({ isPositionPaperRequired: false })] });

		expect(titlesOf(facts)).toEqual([]);
	});

	it('disappears once a paper has been uploaded for the seat', () => {
		const facts = makeFacts({ seats: [makeSeat({ hasPositionPaper: true })] });

		expect(titlesOf(facts)).toEqual([]);
	});

	it('takes the conference’s first day as the deadline when it set none', () => {
		const facts = makeFacts({ seats: [makeSeat({ positionPaperDeadline: null })] });

		expect(deriveTasks(facts, NOW)[0].deadline).toEqual({
			day: '2027-01-24',
			timezone: 'Europe/Amsterdam'
		});
	});

	it('asks once for each seat the reader holds', () => {
		const facts = makeFacts({
			seats: [
				makeSeat(),
				makeSeat({ seatId: 'seat-2', committeeHeading: 'ECOSOC', positionPaperDeadline: null })
			]
		});

		expect(titlesOf(facts)).toEqual([
			'Submit position paper (UNSC)',
			'Submit position paper (ECOSOC)'
		]);
	});
});

describe('rule 3: pay invoice', () => {
	it('names the invoice number, the conference, the amount and the due date', () => {
		const facts = makeFacts({ invoices: [makeInvoice()] });

		expect(deriveTasks(facts, NOW)).toEqual([
			{
				id: 'invoice:invoice-1',
				kind: 'invoice',
				conferenceId: 'conference-rotterdam',
				title: 'Pay invoice INV-0007',
				detail: 'Rotterdam Spring MUN 2026 · €65.00 · due 22 Oct 2026',
				actionLabel: 'Pay invoice',
				deadline: { day: '2026-10-22', timezone: 'Europe/Amsterdam' },
				href: '/invoices/invoice-1'
			}
		]);
	});

	it('says when it was due once the day has passed', () => {
		const facts = makeFacts({ invoices: [makeInvoice({ dueAt: '2026-04-01T22:00:00Z' })] });

		expect(detailOf(facts)).toBe('Rotterdam Spring MUN 2026 · €65.00 · was due 2 Apr 2026');
	});

	it('still says "due" on the day itself', () => {
		// `NOW` is 17 September, 14:00 in Amsterdam; a due moment earlier that
		// same day is not yet a day that has passed.
		const facts = makeFacts({ invoices: [makeInvoice({ dueAt: '2026-09-17T09:00:00Z' })] });

		expect(detailOf(facts)).toMatch(/^Rotterdam Spring MUN 2026 · €65\.00 · due 17 /);
	});

	it('still asks, with the amount alone, when the organisers set no due date', () => {
		const facts = makeFacts({ invoices: [makeInvoice({ dueAt: null })] });
		const [task] = deriveTasks(facts, NOW);

		expect(task.deadline).toBeNull();
		expect(task.detail).toBe('Rotterdam Spring MUN 2026 · €65.00');
	});

	it('writes the amount in the invoice’s own currency', () => {
		const facts = makeFacts({
			invoices: [makeInvoice({ amountCents: 4050, currency: 'GBP', dueAt: null })]
		});

		expect(detailOf(facts)).toBe('Rotterdam Spring MUN 2026 · £40.50');
	});
});

describe('rule 4: finish your application', () => {
	it('names the conference and is due when applications close', () => {
		const facts = makeFacts({ applications: [makeApplication()] });

		expect(deriveTasks(facts, NOW)).toEqual([
			{
				id: 'application:application-1',
				kind: 'application',
				conferenceId: 'conference-1',
				title: 'Finish your application (DelftMUN 2026)',
				detail: 'Applications close 2 Oct 2026',
				actionLabel: 'Finish application',
				deadline: { day: '2026-10-02', timezone: 'Europe/Amsterdam' },
				href: '/conferences/delftmun-2026/apply'
			}
		]);
	});

	it('says there is no closing date when the window has none, and carries no deadline', () => {
		const facts = makeFacts({
			applications: [
				makeApplication({ conference: makeApplicationConference({ applicationsCloseAt: null }) })
			]
		});
		const [task] = deriveTasks(facts, NOW);

		expect(task.detail).toBe('No closing date');
		expect(task.deadline).toBeNull();
	});

	it('says nothing about an application that has already been submitted', () => {
		const facts = makeFacts({
			applications: [makeApplication({ status: 'submitted', submittedAt: '2026-09-12T09:00:00Z' })]
		});

		expect(titlesOf(facts)).toEqual([]);
	});

	it('says nothing once the window has closed', () => {
		const facts = makeFacts({
			applications: [
				makeApplication({
					conference: makeApplicationConference({ applicationsCloseAt: '2026-09-01T22:00:00Z' })
				})
			]
		});

		expect(titlesOf(facts)).toEqual([]);
	});

	it('says nothing about an archived conference', () => {
		const facts = makeFacts({
			applications: [
				makeApplication({ conference: makeApplicationConference({ isArchived: true }) })
			]
		});

		expect(titlesOf(facts)).toEqual([]);
	});
});

describe('rule 5: decide the applications waiting', () => {
	it('counts the applications, names the conference and says how long the oldest has waited', () => {
		const facts = makeFacts({ waitingApplications: [makeWaitingApplications()] });

		expect(deriveTasks(facts, NOW)).toEqual([
			{
				id: 'review_applications:conference-bermun',
				kind: 'review_applications',
				conferenceId: 'conference-bermun',
				title: 'Decide 4 applications (BERMUN 2026)',
				detail: 'The oldest came in 6 days ago.',
				actionLabel: 'Review applications',
				deadline: null,
				href: '/manage/bermun-2026/applications'
			}
		]);
	});

	it('speaks of one application in the singular', () => {
		const facts = makeFacts({
			waitingApplications: [
				makeWaitingApplications({ count: 1, oldestSubmittedAt: '2026-09-16T10:00:00Z' })
			]
		});
		const [task] = deriveTasks(facts, NOW);

		expect(task.title).toBe('Decide 1 application (BERMUN 2026)');
		expect(task.detail).toBe('It came in 1 day ago.');
	});

	it('gives the date once the oldest is a week old', () => {
		const facts = makeFacts({
			waitingApplications: [makeWaitingApplications({ oldestSubmittedAt: '2026-08-30T10:00:00Z' })]
		});

		expect(detailOf(facts)).toBe('The oldest came in on 30 Aug 2026.');
	});

	it('has no detail when nothing says when the oldest came in', () => {
		const facts = makeFacts({
			waitingApplications: [makeWaitingApplications({ oldestSubmittedAt: null })]
		});

		expect(detailOf(facts)).toBeNull();
	});

	it('is gone once none waits, and asks once for each conference that has some', () => {
		const facts = makeFacts({
			waitingApplications: [
				makeWaitingApplications({ count: 0, oldestSubmittedAt: null }),
				makeWaitingApplications({
					conferenceId: 'conference-vienna',
					conferenceName: 'Vienna University MUN 2027',
					conferenceSlug: 'vienna-2027',
					count: 7
				})
			]
		});

		expect(titlesOf(facts)).toEqual(['Decide 7 applications (Vienna University MUN 2027)']);
	});
});

describe('rule 6: assign delegation seats', () => {
	it('names the delegation, the conference and the empty seats, and carries no deadline', () => {
		const facts = makeFacts({ delegations: [makeDelegation()] });

		expect(deriveTasks(facts, NOW)).toEqual([
			{
				id: 'delegation_seats:delegation-1',
				kind: 'delegation_seats',
				conferenceId: 'conference-1',
				title: 'Assign delegation seats (LSE Team)',
				detail: 'DelftMUN 2026 · 2 seats nobody holds yet',
				actionLabel: 'Assign seats',
				deadline: null,
				href: '/delegations/delegation-1/seats'
			}
		]);
	});

	it('speaks of one empty seat in the singular', () => {
		const facts = makeFacts({ delegations: [makeDelegation({ emptySeatCount: 1 })] });

		expect(detailOf(facts)).toBe('DelftMUN 2026 · 1 seat nobody holds yet');
	});

	it('disappears once every reserved seat has somebody in it', () => {
		const facts = makeFacts({ delegations: [makeDelegation({ emptySeatCount: 0 })] });

		expect(titlesOf(facts)).toEqual([]);
	});
});

describe('rule 7: publish or finish setting up the conference', () => {
	it('asks to publish a draft whose required items are all done, with no deadline', () => {
		const facts = makeFacts({ managedConferences: [makeManagedConference()] });

		expect(deriveTasks(facts, NOW)).toEqual([
			{
				id: 'publish:conference-ready',
				kind: 'publish',
				conferenceId: 'conference-ready',
				title: 'Publish THIMUN 2027',
				detail: 'Draft · 5 of 5 setup steps done',
				actionLabel: 'Publish',
				deadline: null,
				href: '/manage/thimun-2027'
			}
		]);
	});

	it('asks to carry on setting up a draft with a required item still open', () => {
		// No venue, which is one of the checklist's required lines.
		const facts = makeFacts({ managedConferences: [makeManagedConference({ venueName: null })] });
		const [task] = deriveTasks(facts, NOW);

		expect(task.title).toBe('Finish setting up THIMUN 2027');
		expect(task.detail).toBe('Draft · 4 of 5 setup steps done');
		expect(task.actionLabel).toBe('Continue setup');
		expect(task.href).toBe('/manage/thimun-2027');
	});

	it('counts a committee without a seat on offer as a step still to do', () => {
		const facts = makeFacts({
			managedConferences: [makeManagedConference({}, { committeesWithoutAvailableSeatsCount: 1 })]
		});

		expect(titlesOf(facts)).toEqual(['Finish setting up THIMUN 2027']);
	});

	it('says nothing about a conference that is already published', () => {
		const facts = makeFacts({
			managedConferences: [makeManagedConference({ status: 'published' })]
		});

		expect(titlesOf(facts)).toEqual([]);
	});

	it('still asks to publish when only an optional item is open, such as connecting Stripe', () => {
		const facts = makeFacts({
			managedConferences: [makeManagedConference({}, { isStripeConnected: false })]
		});
		const [task] = deriveTasks(facts, NOW);

		expect(task.title).toBe('Publish THIMUN 2027');
		expect(task.detail).toBe('Draft · 5 of 5 setup steps done');
	});
});

describe('setupStepCounts', () => {
	it('counts the required items done, of the required ones, and leaves the recommended ones out', () => {
		const ready = publishChecklistItems(READY_DRAFT, { ...READY_COUNTS, isStripeConnected: false });
		const unready = publishChecklistItems({ ...READY_DRAFT, venueName: null }, READY_COUNTS);

		expect(setupStepCounts(ready)).toEqual({ done: 5, required: 5 });
		expect(setupStepCounts(unready)).toEqual({ done: 4, required: 5 });
	});
});

describe('rule 8: review position papers', () => {
	it('counts the waiting papers, names the committee and the conference, and links to the waiting ones', () => {
		const facts = makeFacts({ chairedCommittees: [makeChairedCommittee()] });

		expect(deriveTasks(facts, NOW)).toEqual([
			{
				id: 'review_papers:committee-hrc',
				kind: 'review_papers',
				conferenceId: 'conference-northbridge',
				title: 'Review 2 position papers (HRC)',
				detail: 'Northbridge MUN 2026',
				actionLabel: 'Review papers',
				deadline: null,
				href: '/conferences/northbridge-2026/committees/hrc/chair/papers?status=submitted'
			}
		]);
	});

	it('says "paper" for a single one', () => {
		const facts = makeFacts({ chairedCommittees: [makeChairedCommittee({ waitingCount: 1 })] });

		expect(titlesOf(facts)).toEqual(['Review 1 position paper (HRC)']);
	});

	it('is gone once no paper waits, and asks once for each committee that has some', () => {
		const facts = makeFacts({
			chairedCommittees: [
				makeChairedCommittee({ waitingCount: 0 }),
				makeChairedCommittee({
					committeeId: 'committee-unsc',
					committeeSlug: 'unsc',
					committeeHeading: 'UNSC',
					waitingCount: 3
				})
			]
		});

		expect(titlesOf(facts)).toEqual(['Review 3 position papers (UNSC)']);
	});
});

describe('the order the tasks come out in', () => {
	it('puts the soonest deadline first and everything undated last', () => {
		const facts = makeFacts({
			// Empty institution, so the profile task is on the list. It has no
			// deadline, and neither does the delegation.
			profile: { ...COMPLETE_PROFILE, institutionName: '' },
			invoices: [makeInvoice({ dueAt: '2026-10-30T22:00:00Z' })],
			seats: [makeSeat({ positionPaperDeadline: '2026-09-18T22:00:00Z' })],
			delegations: [makeDelegation()]
		});

		expect(titlesOf(facts)).toEqual([
			'Submit position paper (UNSC)',
			'Pay invoice INV-0007',
			'Complete your profile',
			'Assign delegation seats (LSE Team)'
		]);
	});

	it('puts an overdue task before one still ahead', () => {
		const facts = makeFacts({
			invoices: [makeInvoice({ dueAt: '2026-04-01T22:00:00Z' })],
			seats: [makeSeat()]
		});

		expect(titlesOf(facts)).toEqual(['Pay invoice INV-0007', 'Submit position paper (UNSC)']);
	});

	it('falls back to the order of the rules when two are due the same day', () => {
		const facts = makeFacts({
			// Both fall on 21 September in Amsterdam.
			seats: [makeSeat({ positionPaperDeadline: '2026-09-20T22:00:00Z' })],
			invoices: [makeInvoice({ dueAt: '2026-09-21T09:00:00Z' })]
		});

		expect(titlesOf(facts)).toEqual(['Submit position paper (UNSC)', 'Pay invoice INV-0007']);
	});

	it('orders the undated tasks: profile, applications to decide, seats, papers, then the draft', () => {
		const facts = makeFacts({
			profile: { ...COMPLETE_PROFILE, institutionName: '' },
			managedConferences: [makeManagedConference()],
			chairedCommittees: [makeChairedCommittee()],
			delegations: [makeDelegation()],
			waitingApplications: [makeWaitingApplications()]
		});

		expect(titlesOf(facts)).toEqual([
			'Complete your profile',
			'Decide 4 applications (BERMUN 2026)',
			'Assign delegation seats (LSE Team)',
			'Review 2 position papers (HRC)',
			'Publish THIMUN 2027'
		]);
	});

	it('falls back to the id when two tasks of the same rule are due the same day', () => {
		const facts = makeFacts({
			invoices: [
				makeInvoice({ id: 'invoice-2', number: 'INV-0002' }),
				makeInvoice({ id: 'invoice-1', number: 'INV-0001' })
			]
		});

		expect(titlesOf(facts)).toEqual(['Pay invoice INV-0001', 'Pay invoice INV-0002']);
	});

	it('gives every task on a full list an id of its own and a verb to press', () => {
		const facts = makeFacts({
			profile: { ...COMPLETE_PROFILE, fullName: '' },
			seats: [makeSeat(), makeSeat({ seatId: 'seat-2' })],
			invoices: [makeInvoice()],
			applications: [makeApplication()],
			waitingApplications: [makeWaitingApplications()],
			delegations: [makeDelegation()],
			managedConferences: [makeManagedConference()],
			chairedCommittees: [makeChairedCommittee()]
		});

		const tasks = deriveTasks(facts, NOW);
		const ids = tasks.map((task) => task.id);

		expect(tasks).toHaveLength(9);
		expect(new Set(ids).size).toBe(9);
		expect(tasks.every((task) => task.actionLabel !== '' && task.href !== undefined)).toBe(true);
	});
});
