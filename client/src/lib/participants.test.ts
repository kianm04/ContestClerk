import { describe, expect, it } from 'vitest';
import {
	EMPTY_PARTICIPANT_QUERY,
	PARTICIPANTS_PAGE_SIZE,
	ageOnDay,
	matchesParticipantQuery,
	pageOfParticipants,
	parseParticipantQuery,
	participantCsvRows,
	participantInvoiceLabel,
	participantPageCount,
	participantQuerySearch,
	participantRemovedFlash,
	participantTotals,
	participantsCsvFileName,
	representativeInvoice,
	seatedDelegations,
	sortParticipants,
	type Participant,
	type ParticipantExportRow,
	type ParticipantQuery
} from './participants';

const UNSC = { id: 'committee-unsc', name: 'Security Council', abbreviation: 'UNSC' };
const HRC = { id: 'committee-hrc', name: 'Human Rights Council', abbreviation: null };
const LYCEE = { id: 'delegation-lycee', name: 'Lycée Français' };

/** An individual delegate in UNSC who owes their fee and has sent no paper. */
const ANNA: Participant = {
	seatId: 'seat-france',
	seatName: 'France',
	seatKind: 'country',
	seatCountryCode: 'FR',
	committee: UNSC,
	userId: 'user-anna',
	fullName: 'Anna Kowalski',
	pronouns: 'she/her',
	avatarPath: null,
	institutionName: 'Lyceum 7',
	countryCode: 'PL',
	experienceLevel: 'intermediate',
	delegation: null,
	applicationId: 'application-anna',
	invoice: {
		id: 'invoice-anna',
		number: 'T-0001',
		status: 'unpaid',
		paidAt: null,
		isGroupInvoice: false
	},
	paperStatus: 'missing'
};

/** A delegation member in the Human Rights Council, paid by the group, paper approved. */
const BRUNO: Participant = {
	...ANNA,
	seatId: 'seat-brazil',
	seatName: 'Brazil',
	committee: HRC,
	userId: 'user-bruno',
	fullName: 'bruno Alves',
	pronouns: null,
	institutionName: 'Colégio Santa Cruz',
	countryCode: 'BR',
	delegation: LYCEE,
	applicationId: null,
	invoice: {
		id: 'invoice-lycee',
		number: 'T-0002',
		status: 'paid',
		paidAt: '2026-09-01T10:00:00+00:00',
		isGroupInvoice: true
	},
	paperStatus: 'approved'
};

/** Nobody billed and no institution given. */
const CHLOE: Participant = {
	...ANNA,
	seatId: 'seat-chile',
	seatName: 'Chile',
	userId: 'user-chloe',
	fullName: 'Chloé Martin',
	institutionName: null,
	invoice: null,
	paperStatus: 'submitted'
};

describe('parseParticipantQuery', () => {
	it('opens on the unfiltered first page, sorted by committee', () => {
		expect(parseParticipantQuery(new URLSearchParams())).toEqual(EMPTY_PARTICIPANT_QUERY);
	});

	it('reads every filter, the sort and the page', () => {
		const searchParams = new URLSearchParams(
			'q=%20anna%20&committee=committee-unsc&delegation=none&invoice=none&paper=changes_requested&sort=institution&page=3'
		);

		expect(parseParticipantQuery(searchParams)).toEqual({
			q: 'anna',
			committee: 'committee-unsc',
			delegation: 'none',
			invoice: 'none',
			paper: 'changes_requested',
			sort: 'institution',
			page: 3
		});
	});

	it('falls back to the default for anything it does not know', () => {
		const searchParams = new URLSearchParams('invoice=void&paper=lost&sort=age&page=-2');

		const query = parseParticipantQuery(searchParams);

		expect(query.invoice).toBe('');
		expect(query.paper).toBe('');
		expect(query.sort).toBe('committee');
		expect(query.page).toBe(1);
	});

	it('reads its own address back to the same query', () => {
		const query: ParticipantQuery = {
			q: 'anna',
			committee: 'committee-unsc',
			delegation: LYCEE.id,
			invoice: 'paid',
			paper: 'submitted',
			sort: 'name',
			page: 2
		};

		const searchParams = new URLSearchParams(participantQuerySearch(query));

		expect(parseParticipantQuery(searchParams)).toEqual(query);
	});
});

describe('participantQuerySearch', () => {
	it('leaves every default off, so the plain list has a plain address', () => {
		expect(participantQuerySearch(EMPTY_PARTICIPANT_QUERY)).toBe('');
	});
});

describe('matchesParticipantQuery', () => {
	/** Which of the three participants these filters keep. */
	function namesMatching(filters: Partial<ParticipantQuery>): string[] {
		const query = { ...EMPTY_PARTICIPANT_QUERY, ...filters };

		return [ANNA, BRUNO, CHLOE]
			.filter((participant) => matchesParticipantQuery(participant, query))
			.map((participant) => participant.fullName);
	}

	it('keeps everybody when nothing is filtered', () => {
		expect(namesMatching({})).toHaveLength(3);
	});

	it('searches the name, the institution and the seat, ignoring case', () => {
		expect(namesMatching({ q: 'KOWAL' })).toEqual(['Anna Kowalski']);
		expect(namesMatching({ q: 'santa cruz' })).toEqual(['bruno Alves']);
		expect(namesMatching({ q: 'chile' })).toEqual(['Chloé Martin']);
	});

	it('filters by committee', () => {
		expect(namesMatching({ committee: HRC.id })).toEqual(['bruno Alves']);
	});

	it('filters by delegation, with `none` meaning the individual delegates', () => {
		expect(namesMatching({ delegation: LYCEE.id })).toEqual(['bruno Alves']);
		expect(namesMatching({ delegation: 'none' })).toEqual(['Anna Kowalski', 'Chloé Martin']);
	});

	it('filters by invoice status, with `none` meaning nobody was billed', () => {
		expect(namesMatching({ invoice: 'unpaid' })).toEqual(['Anna Kowalski']);
		expect(namesMatching({ invoice: 'paid' })).toEqual(['bruno Alves']);
		expect(namesMatching({ invoice: 'none' })).toEqual(['Chloé Martin']);
	});

	it('filters by paper status', () => {
		expect(namesMatching({ paper: 'missing' })).toEqual(['Anna Kowalski']);
		expect(namesMatching({ paper: 'approved' })).toEqual(['bruno Alves']);
	});
});

describe('sortParticipants', () => {
	it('keeps the order the rows arrived in for the committee sort', () => {
		const sorted = sortParticipants([CHLOE, ANNA, BRUNO], 'committee');

		expect(sorted.map((participant) => participant.seatId)).toEqual([
			'seat-chile',
			'seat-france',
			'seat-brazil'
		]);
	});

	it('sorts by name the way a person reads, ignoring case', () => {
		const sorted = sortParticipants([CHLOE, BRUNO, ANNA], 'name');

		expect(sorted.map((participant) => participant.fullName)).toEqual([
			'Anna Kowalski',
			'bruno Alves',
			'Chloé Martin'
		]);
	});

	it('sorts by institution, with a missing one last', () => {
		const sorted = sortParticipants([CHLOE, ANNA, BRUNO], 'institution');

		expect(sorted.map((participant) => participant.fullName)).toEqual([
			'bruno Alves',
			'Anna Kowalski',
			'Chloé Martin'
		]);
	});

	it('breaks a tie on institution by name', () => {
		const zofia = { ...ANNA, seatId: 'seat-germany', fullName: 'Zofia Nowak' };

		const sorted = sortParticipants([zofia, ANNA], 'institution');

		expect(sorted.map((participant) => participant.fullName)).toEqual([
			'Anna Kowalski',
			'Zofia Nowak'
		]);
	});

	it('does not reorder the list it was given', () => {
		const list = [CHLOE, ANNA];

		sortParticipants(list, 'name');

		expect(list).toEqual([CHLOE, ANNA]);
	});
});

describe('paging', () => {
	const many = Array.from({ length: PARTICIPANTS_PAGE_SIZE + 3 }, (_, index) => ({
		...ANNA,
		seatId: `seat-${index}`
	}));

	it('counts at least one page, and one more for every fifty', () => {
		expect(participantPageCount(0)).toBe(1);
		expect(participantPageCount(PARTICIPANTS_PAGE_SIZE)).toBe(1);
		expect(participantPageCount(many.length)).toBe(2);
	});

	it('cuts out one page, and nothing past the last', () => {
		expect(pageOfParticipants(many, 1)).toHaveLength(PARTICIPANTS_PAGE_SIZE);
		expect(pageOfParticipants(many, 2).map((participant) => participant.seatId)).toEqual([
			'seat-50',
			'seat-51',
			'seat-52'
		]);
		expect(pageOfParticipants(many, 3)).toEqual([]);
	});
});

describe('participantTotals', () => {
	it('counts everybody, the unpaid, the missing papers and each committee', () => {
		expect(participantTotals([ANNA, BRUNO, CHLOE])).toEqual({
			participantCount: 3,
			unpaidCount: 1,
			missingPaperCount: 1,
			countByCommittee: { [UNSC.id]: 2, [HRC.id]: 1 }
		});
	});
});

describe('seatedDelegations', () => {
	it('lists each delegation with somebody seated once, by name', () => {
		const zulu = { id: 'delegation-zulu', name: 'Aardvark Academy' };
		const secondLycee = { ...BRUNO, seatId: 'seat-chad' };
		const aardvark = { ...BRUNO, seatId: 'seat-cuba', delegation: zulu };

		expect(seatedDelegations([ANNA, BRUNO, secondLycee, aardvark])).toEqual([zulu, LYCEE]);
	});
});

describe('representativeInvoice', () => {
	const invoice = (id: string, status: 'unpaid' | 'paid' | 'waived' | 'refunded' | 'void') => ({
		id,
		number: id,
		status,
		paidAt: null
	});

	it('shows anything still owed before anything settled', () => {
		const chosen = representativeInvoice(
			[invoice('first', 'paid'), invoice('second', 'unpaid')],
			true
		);

		expect(chosen).toEqual({ ...invoice('second', 'unpaid'), isGroupInvoice: true });
	});

	it('prefers paid, then waived, then refunded', () => {
		expect(
			representativeInvoice([invoice('a', 'refunded'), invoice('b', 'waived')], false)?.id
		).toBe('b');
		expect(representativeInvoice([invoice('a', 'waived'), invoice('b', 'paid')], false)?.id).toBe(
			'b'
		);
	});

	it('never picks a cancelled invoice', () => {
		expect(representativeInvoice([invoice('a', 'void')], false)).toBeNull();
		expect(representativeInvoice([], false)).toBeNull();
	});
});

describe('the words on a row', () => {
	it('names the invoice status the way the fees page does', () => {
		expect(participantInvoiceLabel(ANNA.invoice)).toBe('Unpaid');
		expect(participantInvoiceLabel(null)).toBe('No invoice');
	});
});

describe('ageOnDay', () => {
	it('counts whole years, a year older from the birthday itself', () => {
		expect(ageOnDay('2008-04-11', '2027-04-10')).toBe(18);
		expect(ageOnDay('2008-04-11', '2027-04-11')).toBe(19);
		expect(ageOnDay('2008-04-11', '2027-12-01')).toBe(19);
	});

	it('makes somebody born on 29 February older on 1 March', () => {
		expect(ageOnDay('2008-02-29', '2027-02-28')).toBe(18);
		expect(ageOnDay('2008-02-29', '2027-03-01')).toBe(19);
	});
});

describe('participantCsvRows', () => {
	const ANNA_EXPORT: ParticipantExportRow = {
		...ANNA,
		email: 'anna@example.com',
		dateOfBirth: '2008-04-11',
		phone: '+48 600 100 200',
		dietaryRequirements: 'Vegetarian',
		emergencyContactName: 'Ewa Kowalska',
		emergencyContactPhone: '+48 600 300 400',
		delegationHeadName: null,
		awardTitles: ['Best Delegate', 'Outstanding Position Paper']
	};

	it('starts with the headings, private columns included', () => {
		const [headings] = participantCsvRows([], '2027-01-28');

		expect(headings).toEqual([
			'Full name',
			'Email',
			'Pronouns',
			'Institution',
			'Country',
			'Experience',
			'Date of birth',
			'Age at conference',
			'Phone',
			'Dietary requirements',
			'Emergency contact name',
			'Emergency contact phone',
			'Committee',
			'Seat',
			'Seat kind',
			'Delegation',
			'Delegation head',
			'Invoice number',
			'Invoice status',
			'Paid at',
			'Paper status',
			'Awards'
		]);
	});

	it('writes one line per participant, with the age on the first day', () => {
		const [, line] = participantCsvRows([ANNA_EXPORT], '2027-01-28');

		expect(line).toEqual([
			'Anna Kowalski',
			'anna@example.com',
			'she/her',
			'Lyceum 7',
			'Poland',
			'Intermediate',
			'2008-04-11',
			'18',
			'+48 600 100 200',
			'Vegetarian',
			'Ewa Kowalska',
			'+48 600 300 400',
			'UNSC',
			'France',
			'Country',
			'',
			'',
			'T-0001',
			'Unpaid',
			'',
			'Missing',
			'Best Delegate, Outstanding Position Paper'
		]);
	});

	it('leaves the cells it knows nothing about empty', () => {
		const bare: ParticipantExportRow = {
			...ANNA_EXPORT,
			...CHLOE,
			email: null,
			dateOfBirth: null,
			phone: null,
			dietaryRequirements: null,
			emergencyContactName: null,
			emergencyContactPhone: null,
			delegationHeadName: null,
			awardTitles: [],
			countryCode: null,
			pronouns: null
		};

		const [, line] = participantCsvRows([bare], '2027-01-28');

		expect(line[1]).toBe('');
		expect(line[4]).toBe('');
		expect(line[7]).toBe('');
		expect(line.slice(17, 20)).toEqual(['', '', '']);
		expect(line[21]).toBe('');
	});
});

describe('participantsCsvFileName', () => {
	it('names the conference and the day', () => {
		expect(participantsCsvFileName('thimun-2027', '2026-09-23')).toBe(
			'participants-thimun-2027-2026-09-23.csv'
		);
	});
});

describe('participantRemovedFlash', () => {
	it('says who left which seat', () => {
		expect(participantRemovedFlash('Anna Kowalski', 'France', UNSC, null)).toBe(
			'Anna Kowalski removed from France in UNSC.'
		);
	});

	it('names a paid invoice that needs refunding by hand', () => {
		expect(participantRemovedFlash('Anna Kowalski', 'France', UNSC, 'T-0001')).toBe(
			'Anna Kowalski removed from France in UNSC. Invoice T-0001 was paid and needs a manual refund.'
		);
	});
});
