/*
	The heading of a draft resolution or a committee directive
	(docs/committee-papers.md, section 4, "The heading is not typed"): the
	committee, the topic, the sponsors and the signatories, always current
	because they come from the data, and the line the clauses hang from, such
	as "The General Assembly,".

	That line names the body the committee belongs to, not the committee: the
	First Committee writes "The General Assembly," and a historical Security
	Council "The Security Council,". The committee catalogue knows which
	committees are part of which, by abbreviation and by the names it is also
	called; any other committee speaks as itself, "The Human Rights Council,".

	This file is plain TypeScript with no Svelte in it, so the browser and the
	server both use it.
*/

import { COMMITTEE_CATALOGUE, findCatalogueCommittee } from '$lib/committee-catalogue';
import type { PaperPerson, PaperWords } from '$lib/committee-papers';
import type { PaperHeadingLine } from '$lib/paper-sheet';

/** What `ResolutionSheetHeading` draws above the clauses. */
export type ResolutionHeading = {
	/** "Committee", "Topic", "Sponsors", "Signatories", in that order. */
	lines: PaperHeadingLine[];
	/** "The General Assembly,". */
	opening: string;
};

/** The committee as the heading reads it. */
export type HeadingCommittee = { name: string; abbreviation: string | null };

/** Every name a catalogue committee goes by, its own included. */
function namesOf(committee: { name: string; abbreviation: string; aliases: string[] }): string[] {
	return [committee.name, committee.abbreviation, ...committee.aliases];
}

/** The catalogue's committee that this one is, by abbreviation or by one of its names. */
function catalogueEntry(committee: HeadingCommittee) {
	const byAbbreviation =
		committee.abbreviation === null ? null : findCatalogueCommittee(committee.abbreviation);
	const wanted = committee.name.toLowerCase();

	return (
		byAbbreviation ??
		COMMITTEE_CATALOGUE.find((entry) =>
			namesOf(entry).some((name) => name.toLowerCase() === wanted)
		) ??
		null
	);
}

/**
 * The body a committee's resolutions speak as, without "The": "General
 * Assembly" for the General Assembly and its main committees, "Security
 * Council" for the Security Council and its historical sitting, and the
 * committee's own name for anything else.
 */
export function resolutionBody(committee: HeadingCommittee): string {
	const entry = catalogueEntry(committee);
	const names = entry === null ? [committee.name] : namesOf(entry);
	const isNamed = (body: string) => names.some((name) => name.includes(body));

	if (isNamed('General Assembly')) return 'General Assembly';
	if (isNamed('Security Council')) return 'Security Council';

	return committee.name;
}

/** Seat names joined for one heading line, or "None yet". */
function seatList(people: readonly PaperPerson[]): string {
	return people.length === 0 ? 'None yet' : people.map((person) => person.seatName).join(', ');
}

/**
 * The heading of a paper with these people on it. With THIMUN's words the
 * lead is the main submitter, and every other author and every signatory a
 * co-submitter (section 5).
 */
export function resolutionHeading(source: {
	committee: HeadingCommittee;
	topic: string | null;
	people: readonly PaperPerson[];
	words: PaperWords;
}): ResolutionHeading {
	const authors = source.people.filter((person) => person.role === 'author');
	const signatories = source.people.filter((person) => person.role === 'signatory');
	const lines: PaperHeadingLine[] = [{ label: 'Committee', value: source.committee.name }];

	if (source.topic !== null) lines.push({ label: 'Topic', value: source.topic });

	if (source.words === 'submitters') {
		const lead = authors.filter((person) => person.isLead);
		const others = [...authors.filter((person) => !person.isLead), ...signatories];
		lines.push({ label: 'Main submitter', value: seatList(lead) });
		lines.push({ label: 'Co-submitters', value: seatList(others) });
	} else {
		lines.push({ label: 'Sponsors', value: seatList(authors) });
		lines.push({ label: 'Signatories', value: seatList(signatories) });
	}

	return { lines, opening: `The ${resolutionBody(source.committee)},` };
}
