/*
	The support a draft resolution or a committee directive collects before
	it goes to the dais (docs/committee-papers.md, section 5): its signatories,
	and its sponsors too where the committee counts them, against a minimum
	that is a number of seats or a share of the seats with a delegate.

	The support count is a rule, not a format check: `submit_paper` refuses a
	paper without enough, and never stops checking it. This file only words
	what the page shows beside the paper. The number needed comes from the
	database's `paper_support_needed`, so the page and the refusal agree.

	This file is plain TypeScript with no Svelte in it, so the browser and the
	server both use it.
*/

import type { PaperPerson, PaperWords } from '$lib/committee-papers';
import type { Database } from '$lib/database.types';

export type SupportUnit = Database['public']['Enums']['support_unit'];

/** The committee's settings for support, as section 5 names them. */
export type SupportRules = {
	/** A number of seats, or a percentage of the seats with a delegate. */
	minimum: number;
	unit: SupportUnit;
	/** False where the signatories alone must reach the minimum. */
	countsSponsors: boolean;
	/** The most sponsors a draft may have, or `null` for no cap. */
	sponsorLimit: number | null;
	/** Whether the writer page lists the format checks. */
	checksFormat: boolean;
};

/** A paper's support as its page shows it. */
export type PaperSupport = {
	sponsors: number;
	signatories: number;
	/** The sponsors and signatories that count towards the minimum. */
	count: number;
	/** How many the minimum comes to, from `paper_support_needed`. */
	needed: number;
	/** The seats of the committee with a delegate, which a percentage is of. */
	seatsWithDelegate: number;
	rules: SupportRules;
};

/** The support of a paper with these people on it. */
export function paperSupport(
	people: readonly PaperPerson[],
	rules: SupportRules,
	needed: number,
	seatsWithDelegate: number
): PaperSupport {
	const sponsors = people.filter((person) => person.role === 'author').length;
	const signatories = people.filter((person) => person.role === 'signatory').length;

	return {
		sponsors,
		signatories,
		count: signatories + (rules.countsSponsors ? sponsors : 0),
		needed,
		seatsWithDelegate,
		rules
	};
}

/** True once the paper has the support it needs to be submitted. */
export function hasEnoughSupport(support: PaperSupport): boolean {
	return support.count >= support.needed;
}

/** "5 of 9" while it lacks support, "10, 9 needed" once it has enough. */
export function supportCountLine(support: PaperSupport): string {
	return hasEnoughSupport(support)
		? `${support.count}, ${support.needed} needed`
		: `${support.count} of ${support.needed}`;
}

/** How far along the bar is, from 0 to 100. */
export function supportShare(support: PaperSupport): number {
	if (support.needed <= 0) return 100;

	return Math.min(100, Math.round((support.count / support.needed) * 100));
}

/**
 * What counts and where the number comes from: "Sponsors count. 9 is 20% of
 * the 44 seats with a delegate, rounded up." With THIMUN's words the
 * sponsors are the submitters.
 */
export function supportRuleSentence(support: PaperSupport, words: PaperWords): string {
	const sponsors = words === 'submitters' ? 'Submitters' : 'Sponsors';
	const signatories = words === 'submitters' ? 'co-submitters who signed' : 'signatories';
	const whoCounts = support.rules.countsSponsors
		? `${sponsors} count.`
		: `Only ${signatories} count.`;
	const { minimum, unit } = support.rules;

	if (unit === 'seats') {
		return `${whoCounts} The committee asks for ${minimum}.`;
	}

	const seats = support.seatsWithDelegate === 1 ? 'seat' : 'seats';

	return `${whoCounts} ${support.needed} is ${minimum}% of the ${support.seatsWithDelegate} ${seats} with a delegate, rounded up.`;
}

/**
 * The line under the sponsors about the committee's cap: "5 is the most this
 * committee allows." once the paper reaches it, a warning past it, and
 * nothing below it or where there is no cap.
 */
export function sponsorCapSentence(support: PaperSupport): string | null {
	const limit = support.rules.sponsorLimit;

	if (limit === null || support.sponsors < limit) return null;

	if (support.sponsors === limit) return `${limit} is the most this committee allows.`;

	const over = support.sponsors - limit;

	return `This committee allows ${limit}, so ${over} ${over === 1 ? 'has' : 'have'} to leave before it is submitted.`;
}
