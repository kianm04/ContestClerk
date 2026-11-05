import { describe, expect, it } from 'vitest';
import type { PaperPerson } from './committee-papers';
import {
	hasEnoughSupport,
	paperSupport,
	sponsorCapSentence,
	supportCountLine,
	supportRuleSentence,
	supportShare,
	type SupportRules
} from './paper-support';

const RULES: SupportRules = {
	minimum: 20,
	unit: 'percent',
	countsSponsors: true,
	sponsorLimit: 5,
	checksFormat: true
};

function seat(name: string, role: PaperPerson['role']): PaperPerson {
	return {
		seatId: name,
		seatName: name,
		countryCode: null,
		holderId: null,
		holderName: null,
		role,
		isLead: false,
		isMine: false
	};
}

const sponsors = ['Ghana', 'Chile', 'Japan', 'Peru', 'Kenya'].map((name) => seat(name, 'author'));

describe('paperSupport', () => {
	it('counts the sponsors and the signatories, or the signatories alone', () => {
		const people = [...sponsors, seat('Fiji', 'signatory')];

		expect(paperSupport(people, RULES, 9, 44).count).toBe(6);
		expect(paperSupport(people, { ...RULES, countsSponsors: false }, 9, 44).count).toBe(1);
	});
});

describe('hasEnoughSupport and supportCountLine', () => {
	it('says how many of the needed it has, then that it has enough', () => {
		const short = paperSupport(sponsors, RULES, 9, 44);
		const signatories = ['Fiji', 'Iran', 'Cuba', 'Mali', 'Oman'].map((name) =>
			seat(name, 'signatory')
		);
		const enough = paperSupport([...sponsors, ...signatories], RULES, 9, 44);

		expect([hasEnoughSupport(short), supportCountLine(short)]).toEqual([false, '5 of 9']);
		expect([hasEnoughSupport(enough), supportCountLine(enough)]).toEqual([true, '10, 9 needed']);
	});
});

describe('supportShare', () => {
	it('is how full the bar is, never past full', () => {
		expect(supportShare(paperSupport(sponsors, RULES, 10, 44))).toBe(50);
		expect(supportShare(paperSupport(sponsors, RULES, 3, 44))).toBe(100);
		expect(supportShare(paperSupport([], RULES, 0, 0))).toBe(100);
	});
});

describe('supportRuleSentence', () => {
	it('says who counts and what the minimum comes to', () => {
		const support = paperSupport(sponsors, RULES, 9, 44);
		const inSeats = paperSupport(sponsors, { ...RULES, unit: 'seats', minimum: 3 }, 3, 44);
		const signatoriesOnly = paperSupport(sponsors, { ...RULES, countsSponsors: false }, 9, 44);

		expect(supportRuleSentence(support, 'sponsors_and_signatories')).toBe(
			'Sponsors count. 9 is 20% of the 44 seats with a delegate, rounded up.'
		);
		expect(supportRuleSentence(inSeats, 'submitters')).toBe(
			'Submitters count. The committee asks for 3.'
		);
		expect(supportRuleSentence(signatoriesOnly, 'sponsors_and_signatories')).toMatch(
			/^Only signatories count\./
		);
	});
});

describe('sponsorCapSentence', () => {
	it('speaks up only at the cap and past it', () => {
		const atCap = paperSupport(sponsors, RULES, 9, 44);
		const pastCap = paperSupport(sponsors, { ...RULES, sponsorLimit: 3 }, 9, 44);

		expect(sponsorCapSentence(atCap)).toBe('5 is the most this committee allows.');
		expect(sponsorCapSentence(pastCap)).toBe(
			'This committee allows 3, so 2 have to leave before it is submitted.'
		);
		expect(
			sponsorCapSentence(paperSupport(sponsors, { ...RULES, sponsorLimit: null }, 9, 44))
		).toBe(null);
		expect(sponsorCapSentence(paperSupport(sponsors.slice(1), RULES, 9, 44))).toBe(null);
	});
});
