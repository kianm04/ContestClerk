import { describe, expect, it } from 'vitest';
import {
	buildApplicationCards,
	type ApplicationCard,
	type ApplicationCardFacts,
	type CardConferenceFacts,
	type CardDelegationFacts,
	type CardInvoiceFacts,
	type CardSeatFacts
} from './application-cards';
import type {
	ApplicationListConference,
	ApplicationListEntry,
	ApplicationListSeat,
	MyApplicationListItem,
	MyDelegationListItem
} from './applications';

/**
 * The moment every test is run at unless it says otherwise: a morning at the
 * end of September 2026, months before either conference below starts.
 */
const NOW = new Date('2026-09-30T09:00:00Z');

/**
 * The conference most cards are about. It runs in February 2027 and takes
 * applications until the last evening of 2026. Tests spread it and change only
 * the field they are about.
 */
const DELFT_MUN: ApplicationListConference = {
	id: 'conference-delft',
	slug: 'delftmun-2027',
	name: 'DelftMUN 2027',
	organizationName: 'Delft MUN Society',
	logoPath: null,
	bannerPath: 'conferences/delft/banner.png',
	startDate: '2027-02-12',
	endDate: '2027-02-15',
	timezone: 'Europe/Amsterdam',
	isArchived: false,
	applicationsCloseAt: '2026-12-31T22:59:00Z',
	city: 'Delft',
	venueName: null,
	locationMode: 'in_person'
};

/** A second conference, in London, which the delegation below belongs to. */
const LSE_MUN: ApplicationListConference = {
	...DELFT_MUN,
	id: 'conference-lse',
	slug: 'lse-mun-2027',
	name: 'LSE MUN 2027',
	bannerPath: null,
	startDate: '2027-03-04',
	endDate: '2027-03-07',
	timezone: 'Europe/London'
};

/** Where DelftMUN is held. It asks for no position paper unless a test says so. */
const DELFT_MUN_FACTS: CardConferenceFacts = {
	conferenceId: 'conference-delft',
	city: 'Amsterdam',
	countryCode: 'NL',
	isPositionPaperRequired: false,
	positionPaperDeadline: null
};

/** Where LSE MUN is held. */
const LSE_MUN_FACTS: CardConferenceFacts = {
	conferenceId: 'conference-lse',
	city: 'London',
	countryCode: 'GB',
	isPositionPaperRequired: false,
	positionPaperDeadline: null
};

/** The seat an accepted application is given in the tests that need one. */
const FRANCE_IN_UNHRC: ApplicationListSeat = {
	seatName: 'France',
	committeeHeading: 'UNHRC',
	countryCode: 'FR'
};

/** The reader's seat at DelftMUN, with no position paper sent for it yet. */
const UNHRC_SEAT_FACTS: CardSeatFacts = {
	conferenceId: 'conference-delft',
	committeeSlug: 'unhrc',
	hasPositionPaper: false
};

/** An individual application at DelftMUN, sent on 8 September, for a test to change one field of. */
function individualEntry(changes: Partial<MyApplicationListItem> = {}): ApplicationListEntry {
	const application: MyApplicationListItem = {
		id: 'application-1',
		status: 'submitted',
		submittedAt: '2026-09-08T10:00:00Z',
		updatedAt: '2026-09-08T10:00:00Z',
		conference: DELFT_MUN,
		seat: null,
		...changes
	};

	return { kind: 'individual', id: application.id, application };
}

/** The reader's place in a delegation at LSE MUN, for a test to change one field of. */
function delegationEntry(changes: Partial<MyDelegationListItem> = {}): ApplicationListEntry {
	const membership: MyDelegationListItem = {
		id: 'delegation-1',
		name: 'LSE Team',
		status: 'draft',
		conference: LSE_MUN,
		seat: null,
		...changes
	};

	return { kind: 'delegation', id: membership.id, membership };
}

/**
 * The facts the server read, with both conferences' places and nothing else.
 * Tests add the seats, invoices and delegation dates they are about.
 */
function cardFacts(changes: Partial<ApplicationCardFacts> = {}): ApplicationCardFacts {
	return {
		conferences: [DELFT_MUN_FACTS, LSE_MUN_FACTS],
		seats: [],
		invoices: [],
		delegations: [],
		...changes
	};
}

/** An unpaid invoice for DelftMUN, for a test to change one field of. */
function invoiceFacts(changes: Partial<CardInvoiceFacts> = {}): CardInvoiceFacts {
	return {
		id: 'invoice-1',
		conferenceId: 'conference-delft',
		status: 'unpaid',
		createdAt: '2026-09-10T10:00:00Z',
		...changes
	};
}

/** The card for a single entry, which is what most tests below look at. */
function onlyCard(
	entry: ApplicationListEntry,
	facts: ApplicationCardFacts,
	now: Date = NOW
): ApplicationCard {
	const cards = buildApplicationCards([entry], facts, now);

	return cards[0];
}

describe('buildApplicationCards', () => {
	it('gives one card per entry, in the order the entries came in', () => {
		const entries = [delegationEntry(), individualEntry()];

		const cards = buildApplicationCards(entries, cardFacts(), NOW);

		const ids = cards.map((card) => card.id);
		expect(ids).toEqual(['delegation-1', 'application-1']);
	});

	it('gives no cards to somebody who has applied to nothing', () => {
		expect(buildApplicationCards([], cardFacts(), NOW)).toEqual([]);
	});
});

describe('buildApplicationCards: an accepted application', () => {
	/**
	 * DelftMUN asks for a position paper by the evening of 8 October in
	 * Amsterdam, which is eight days after `NOW` there.
	 */
	const PAPER_DUE_IN_EIGHT_DAYS: CardConferenceFacts = {
		...DELFT_MUN_FACTS,
		isPositionPaperRequired: true,
		positionPaperDeadline: '2026-10-08T21:59:00Z'
	};

	const SEATED_AND_ACCEPTED = individualEntry({ status: 'accepted', seat: FRANCE_IN_UNHRC });

	it('asks for the position paper that is still owed, in the blue panel', () => {
		const facts = cardFacts({
			conferences: [PAPER_DUE_IN_EIGHT_DAYS],
			seats: [UNHRC_SEAT_FACTS]
		});

		const card = onlyCard(SEATED_AND_ACCEPTED, facts);

		expect(card.action.tone).toBe('info');
		expect(card.action.title).toBe('Position paper due in 8 days');
		expect(card.action.primary?.href).toBe(
			'/conferences/delftmun-2027/committees/unhrc/position-paper'
		);
	});

	it('sits under "Accepted" with a green pill, because the paper is not urgent yet', () => {
		const facts = cardFacts({
			conferences: [PAPER_DUE_IN_EIGHT_DAYS],
			seats: [UNHRC_SEAT_FACTS]
		});

		const card = onlyCard(SEATED_AND_ACCEPTED, facts);

		expect(card.stage).toBe('accepted');
		expect(card.status).toEqual({ label: 'Accepted', tone: 'success' });
		expect(card.progress.tone).toBe('success');
	});

	it('shows the seat in the details column instead of the materials alone', () => {
		const facts = cardFacts({
			conferences: [PAPER_DUE_IN_EIGHT_DAYS],
			seats: [UNHRC_SEAT_FACTS]
		});

		const card = onlyCard(SEATED_AND_ACCEPTED, facts);

		expect(card.details).toEqual({
			title: 'Delegate application',
			line: 'Submitted 8 Sept 2026',
			seat: FRANCE_IN_UNHRC,
			materials: [{ label: 'Form', statusLabel: 'Complete', tone: 'success' }]
		});
	});

	it('asks for nothing once the position paper has been sent', () => {
		const paperSent: CardSeatFacts = { ...UNHRC_SEAT_FACTS, hasPositionPaper: true };
		const facts = cardFacts({ conferences: [PAPER_DUE_IN_EIGHT_DAYS], seats: [paperSent] });

		const card = onlyCard(SEATED_AND_ACCEPTED, facts);

		expect(card.action.tone).toBe('success');
		expect(card.action.primary).toBeNull();
		expect(card.stage).toBe('accepted');
	});
});

describe('buildApplicationCards: a sent application', () => {
	it('needs action while an invoice for its conference is unpaid', () => {
		const facts = cardFacts({ invoices: [invoiceFacts()] });

		const card = onlyCard(individualEntry(), facts);

		expect(card.stage).toBe('needsAction');
		expect(card.status).toEqual({ label: 'Needs action', tone: 'danger' });
		expect(card.action.primary?.href).toBe('/invoices/invoice-1');
	});

	it('draws the whole progress line red while it needs action', () => {
		// On its own a sent application's line is orange, waiting on the
		// organisers. The unpaid invoice turns it red, but the steps stay where
		// they were: the outcome is still what the application is waiting for.
		const facts = cardFacts({ invoices: [invoiceFacts()] });

		const card = onlyCard(individualEntry(), facts);

		expect(card.progress.tone).toBe('danger');
		expect(card.progress.steps[2]).toEqual({
			label: 'Outcome',
			state: 'current',
			isEmphasised: false
		});
	});

	it('lists the form as complete and the payment as pending', () => {
		const facts = cardFacts({ invoices: [invoiceFacts()] });

		const card = onlyCard(individualEntry(), facts);

		expect(card.details.materials).toEqual([
			{ label: 'Form', statusLabel: 'Complete', tone: 'success' },
			{ label: 'Payment', statusLabel: 'Pending', tone: 'warning' }
		]);
	});

	it('is under review, with only the form listed, while there is no invoice', () => {
		const card = onlyCard(individualEntry(), cardFacts());

		expect(card.stage).toBe('underReview');
		expect(card.status).toEqual({ label: 'Under review', tone: 'warning' });
		expect(card.details.line).toBe('Submitted 8 Sept 2026');
		expect(card.details.seat).toBeNull();
		expect(card.details.materials).toEqual([
			{ label: 'Form', statusLabel: 'Complete', tone: 'success' }
		]);
	});

	it('is under review while it is on the waiting list', () => {
		const card = onlyCard(individualEntry({ status: 'waitlisted' }), cardFacts());

		expect(card.stage).toBe('underReview');
	});

	it('sits under no stage tab once it was not accepted or was withdrawn', () => {
		const rejected = onlyCard(individualEntry({ status: 'rejected' }), cardFacts());
		const withdrawn = onlyCard(individualEntry({ status: 'withdrawn' }), cardFacts());

		expect(rejected.stage).toBe('other');
		expect(withdrawn.stage).toBe('other');
	});

	it('ignores an unpaid invoice for a different conference', () => {
		const elsewhere = invoiceFacts({ conferenceId: 'conference-lse' });

		const card = onlyCard(individualEntry(), cardFacts({ invoices: [elsewhere] }));

		expect(card.stage).toBe('underReview');
		expect(card.details.materials).toHaveLength(1);
	});
});

describe('buildApplicationCards: a draft', () => {
	it('needs action while the conference is still taking applications', () => {
		// DelftMUN's window shuts on the evening of 3 October, three days after `NOW`.
		const closingSoon = { ...DELFT_MUN, applicationsCloseAt: '2026-10-03T21:59:00Z' };
		const draft = individualEntry({ status: 'draft', submittedAt: null, conference: closingSoon });

		const card = onlyCard(draft, cardFacts());

		expect(card.stage).toBe('needsAction');
		expect(card.status).toEqual({ label: 'Needs action', tone: 'danger' });
		expect(card.details.line).toBe('Draft · closes in 3 days');
		expect(card.details.materials).toEqual([
			{ label: 'Form', statusLabel: 'In progress', tone: 'warning' }
		]);
	});

	it('sits under no stage tab once applications have closed', () => {
		const closed = { ...DELFT_MUN, applicationsCloseAt: '2026-09-20T21:59:00Z' };
		const draft = individualEntry({ status: 'draft', submittedAt: null, conference: closed });

		const card = onlyCard(draft, cardFacts());

		expect(card.stage).toBe('other');
		expect(card.status).toEqual({ label: 'Draft', tone: 'neutral' });
		expect(card.details.line).toBe('Draft · closed');
		// Grey rather than orange, so a draft nobody can send is not picked out as owed.
		expect(card.details.materials).toEqual([
			{ label: 'Form', statusLabel: 'Not submitted', tone: 'neutral' }
		]);
	});
});

describe('buildApplicationCards: the payment line', () => {
	const ACCEPTED = individualEntry({ status: 'accepted', seat: FRANCE_IN_UNHRC });

	it('says "Paid" in green once the invoice is paid', () => {
		const paid = invoiceFacts({ status: 'paid' });

		const card = onlyCard(ACCEPTED, cardFacts({ invoices: [paid] }));

		expect(card.details.materials[1]).toEqual({
			label: 'Payment',
			statusLabel: 'Paid',
			tone: 'success'
		});
		expect(card.stage).toBe('accepted');
	});

	it('shows the unpaid invoice even when a paid one is newer', () => {
		// The unpaid one is the one the reader still has to do something about.
		const olderUnpaid = invoiceFacts({
			id: 'invoice-unpaid',
			status: 'unpaid',
			createdAt: '2026-09-10T10:00:00Z'
		});
		const newerPaid = invoiceFacts({
			id: 'invoice-paid',
			status: 'paid',
			createdAt: '2026-09-20T10:00:00Z'
		});

		const card = onlyCard(ACCEPTED, cardFacts({ invoices: [newerPaid, olderUnpaid] }));

		expect(card.details.materials[1].statusLabel).toBe('Pending');
		expect(card.action.primary?.href).toBe('/invoices/invoice-unpaid');
		expect(card.stage).toBe('needsAction');
	});

	it('shows the newest invoice when none is unpaid, in its own words', () => {
		const olderPaid = invoiceFacts({
			id: 'invoice-old',
			status: 'paid',
			createdAt: '2026-09-10T10:00:00Z'
		});
		const newerRefunded = invoiceFacts({
			id: 'invoice-new',
			status: 'refunded',
			createdAt: '2026-09-20T10:00:00Z'
		});

		const card = onlyCard(ACCEPTED, cardFacts({ invoices: [olderPaid, newerRefunded] }));

		expect(card.details.materials[1]).toEqual({
			label: 'Payment',
			statusLabel: 'Refunded',
			tone: 'neutral'
		});
	});
});

describe('buildApplicationCards: a delegation', () => {
	/** When the LSE Team delegation was sent and last changed. */
	const LSE_TEAM_DATES: CardDelegationFacts = {
		delegationId: 'delegation-1',
		submittedAt: '2026-09-08T10:00:00Z',
		updatedAt: '2026-09-12T10:00:00Z'
	};

	it('names the delegation and calls it a draft while its dates are unknown', () => {
		const card = onlyCard(delegationEntry(), cardFacts());

		expect(card.kind).toBe('delegation');
		expect(card.details.title).toBe('Delegation application');
		expect(card.details.line).toBe('LSE Team · Draft');
	});

	it("names only the delegation when a sent one's dates are unknown, rather than calling it a draft", () => {
		const card = onlyCard(delegationEntry({ status: 'submitted' }), cardFacts());

		expect(card.details.line).toBe('LSE Team');
	});

	it("keeps a draft delegation's form in progress, since its head can still send it", () => {
		const card = onlyCard(delegationEntry(), cardFacts());

		expect(card.details.materials).toEqual([
			{ label: 'Form', statusLabel: 'In progress', tone: 'warning' }
		]);
	});

	it('sorts last under "Most recent" while its dates are unknown', () => {
		const card = onlyCard(delegationEntry(), cardFacts());

		expect(card.updatedAt).toBe('');
	});

	it('says when a sent delegation was submitted, on the conference calendar', () => {
		const sent = delegationEntry({ status: 'submitted' });

		const card = onlyCard(sent, cardFacts({ delegations: [LSE_TEAM_DATES] }));

		expect(card.details.line).toBe('LSE Team · Submitted 8 Sept 2026');
		expect(card.updatedAt).toBe('2026-09-12T10:00:00Z');
		expect(card.stage).toBe('underReview');
	});

	it('offers no "Finish" on a draft, which only the head of the delegation can send', () => {
		const card = onlyCard(delegationEntry(), cardFacts());

		expect(card.stage).toBe('other');
		expect(card.action.primary).toBeNull();
		expect(card.action.secondary.href).toBe('/delegations/delegation-1');
	});
});

describe('buildApplicationCards: the conference', () => {
	it('names the city and the country the conference is held in', () => {
		const card = onlyCard(individualEntry(), cardFacts());

		expect(card.conference).toEqual({
			name: 'DelftMUN 2027',
			bannerPath: 'conferences/delft/banner.png',
			startDate: '2027-02-12',
			endDate: '2027-02-15',
			place: 'Amsterdam, Netherlands',
			countryCode: 'NL'
		});
	});

	it('leaves the place out for a conference with no city, such as an online one', () => {
		const onlineFacts = { ...DELFT_MUN_FACTS, city: null, countryCode: null };
		const card = onlyCard(individualEntry(), cardFacts({ conferences: [onlineFacts] }));

		expect(card.conference.place).toBeNull();
		expect(card.conference.countryCode).toBeNull();
	});

	it('leaves the place out when the conference facts could not be read', () => {
		const card = onlyCard(individualEntry(), cardFacts({ conferences: [] }));

		expect(card.conference.place).toBeNull();
		expect(card.conference.countryCode).toBeNull();
	});

	it('is not past while the conference is still running', () => {
		const card = onlyCard(individualEntry(), cardFacts(), new Date('2027-02-14T09:00:00Z'));

		expect(card.isPast).toBe(false);
	});

	it('is past once the last day of the conference has gone, and asks nothing more', () => {
		const card = onlyCard(individualEntry(), cardFacts(), new Date('2027-02-16T09:00:00Z'));

		expect(card.isPast).toBe(true);
		expect(card.action.title).toBe('This conference has ended');
		expect(card.action.primary).toBeNull();
	});

	it('is past once the organisers have archived the conference', () => {
		const archived = individualEntry({ conference: { ...DELFT_MUN, isArchived: true } });

		const card = onlyCard(archived, cardFacts());

		expect(card.isPast).toBe(true);
	});
});

describe('buildApplicationCards: the search text', () => {
	it('holds the conference, the place, the status, the line and the seat, in lower case', () => {
		const accepted = individualEntry({ status: 'accepted', seat: FRANCE_IN_UNHRC });

		const card = onlyCard(accepted, cardFacts());

		expect(card.searchText).toBe(
			'delftmun 2027 amsterdam, netherlands accepted submitted 8 sept 2026 unhrc france'
		);
	});

	it('holds the words on the status pill, which read "Needs action" when something waits', () => {
		const card = onlyCard(individualEntry(), cardFacts({ invoices: [invoiceFacts()] }));

		expect(card.searchText).toContain('needs action');
	});

	it('does not hold the word "null" when the place is unknown', () => {
		const card = onlyCard(individualEntry(), cardFacts({ conferences: [] }));

		expect(card.searchText).not.toContain('null');
		expect(card.searchText).toContain('delftmun 2027');
	});
});
