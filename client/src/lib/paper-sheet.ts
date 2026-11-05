/**
 * The standard look of a position paper (Trello S6HLyL5Y): the heading lines
 * every paper opens with and the page count beside the word count.
 *
 * The delegate only writes the text. The heading, running header and body
 * style come from the seat, the committee and the conference, so every paper
 * a chair reads is laid out the same way, and the editor, the submitted paper
 * and the chair's reading page all draw it from this one place.
 *
 * The papers a committee writes together (docs/committee-papers.md) have a
 * look of their own at the end of the file.
 */

import { wordCountText } from '$lib/paper-writing';

/** One bold line above the text, such as "Committee: Security Council". */
export type PaperHeadingLine = {
	label: string;
	value: string;
};

/** What `PaperSheetHeading` draws above the text of a paper. */
export type PaperHeading = {
	/** The left side of the running header: the seat, such as "Kenya". */
	seatName: string;
	/** The right side of the running header: the conference's name. */
	conferenceName: string;
	/** The bold lines, in the order they are written. */
	lines: PaperHeadingLine[];
};

/** What the heading is worked out from. */
export type PaperHeadingSource = {
	seatName: string;
	/** The seat's two-letter country code, or `null` for a seat that is no country, such as "Press". */
	countryCode: string | null;
	/** The committee's full name, not its abbreviation. */
	committeeName: string;
	conferenceName: string;
	/** The committee's topics, in the organiser's order. An empty list leaves the topic line out. */
	topics: string[];
};

/** How a paper's topics are joined on its one topic line. */
const TOPIC_SEPARATOR = '; ';

/**
 * The heading lines of a paper. A seat that is a country gets "Country:",
 * any other seat "Delegation:"; a committee with no topics gets no topic line.
 */
export function paperHeading(source: PaperHeadingSource): PaperHeading {
	const seatLabel = source.countryCode === null ? 'Delegation' : 'Country';
	const lines: PaperHeadingLine[] = [
		{ label: seatLabel, value: source.seatName },
		{ label: 'Committee', value: source.committeeName }
	];

	if (source.topics.length > 0) {
		const topicLabel = source.topics.length === 1 ? 'Topic' : 'Topics';
		lines.push({ label: topicLabel, value: source.topics.join(TOPIC_SEPARATOR) });
	}

	return { seatName: source.seatName, conferenceName: source.conferenceName, lines };
}

/**
 * How many words fill one A4 page in the paper's own typeface, single spaced
 * with 20 mm margins. The page count is an estimate from this, not a
 * measurement of the screen.
 */
export const WORDS_PER_PAGE = 500;

/** The pages a paper of this many words takes: 0 for no words, else at least 1. */
export function countPages(wordCount: number): number {
	if (wordCount <= 0) return 0;

	return Math.ceil(wordCount / WORDS_PER_PAGE);
}

/** "1 page" or "3 pages". */
export function pageCountText(pageCount: number): string {
	return pageCount === 1 ? '1 page' : `${pageCount} pages`;
}

/** "812 words · 2 pages", or just "0 words" for an empty paper. */
export function paperLengthText(wordCount: number): string {
	const pageCount = countPages(wordCount);

	if (pageCount === 0) return wordCountText(wordCount);

	return `${wordCountText(wordCount)} · ${pageCountText(pageCount)}`;
}

/*
	How the text of a paper looks, over `MARKDOWN_CONTENT_CLASSES` from
	`$lib/markdown.ts`: the serif typeface, each paragraph justified, and every
	paragraph after the first indented on its first line, the way a printed
	paper reads. `[&_p+p]:indent-8` is Tailwind for "a `p` that follows another
	`p` gets a first-line indent". Written out in full so Tailwind can find the
	class names in this file.
*/
export const PAPER_SHEET_CLASSES =
	'font-display hyphens-auto [&_p]:text-justify [&_p]:my-0 [&_p+p]:indent-8 [&_h1]:text-h3 [&_h2]:mt-4 [&_h3]:mt-3';

/*
	How the text of a paper written in committee looks, in the writer and
	wherever the paper is read: the site's own sans text, ragged right, with
	serif headings and room between the clauses of a list, as the paper writer
	was drawn. `[&_:is(h1,h2,h3)]` is Tailwind for "every `h1`, `h2` or `h3`
	inside this element". The editor wraps the text of each list item in a `p`,
	which `[&_li>p]:mb-0` keeps from adding a gap of its own. Written out in
	full so Tailwind can find the class names in this file.
*/
export const COMMITTEE_PAPER_TEXT_CLASSES = [
	'text-body text-foreground break-words',
	'[&_p]:mb-4 [&_li>p]:mb-0',
	'[&_:is(h1,h2,h3)]:mt-7 [&_:is(h1,h2,h3)]:mb-2 [&_:is(h1,h2,h3)]:font-display',
	'[&_:is(h1,h2,h3)]:text-[1.1875rem]/[1.625rem] [&_:is(h1,h2,h3)]:font-semibold',
	'[&>:first-child]:mt-0 [&>:last-child]:mb-0',
	'[&_ul]:list-disc [&_ol]:list-decimal [&_:is(ul,ol)]:mb-4 [&_:is(ul,ol)]:pl-6',
	'[&_li]:mb-3 [&_li]:pl-1',
	'[&_a]:text-link [&_a]:underline'
].join(' ');
