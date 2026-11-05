import { describe, expect, it } from 'vitest';
import {
	WORDS_PER_PAGE,
	countPages,
	pageCountText,
	paperHeading,
	paperLengthText
} from './paper-sheet';

const KENYA = {
	seatName: 'Kenya',
	countryCode: 'KE',
	committeeName: 'Security Council',
	conferenceName: 'THIMUN 2027',
	topics: ['Climate finance']
};

describe('paperHeading', () => {
	it('names the seat and the conference in the running header', () => {
		const heading = paperHeading(KENYA);

		expect(heading.seatName).toBe('Kenya');
		expect(heading.conferenceName).toBe('THIMUN 2027');
	});

	it('writes the country, the committee and the topic as bold lines', () => {
		expect(paperHeading(KENYA).lines).toEqual([
			{ label: 'Country', value: 'Kenya' },
			{ label: 'Committee', value: 'Security Council' },
			{ label: 'Topic', value: 'Climate finance' }
		]);
	});

	it('calls a seat that is no country a delegation', () => {
		const heading = paperHeading({ ...KENYA, seatName: 'Press', countryCode: null });

		expect(heading.lines[0]).toEqual({ label: 'Delegation', value: 'Press' });
	});

	it('joins several topics on one line, and leaves the line out with none', () => {
		const two = paperHeading({ ...KENYA, topics: ['Small arms', 'Cyber operations'] });
		const none = paperHeading({ ...KENYA, topics: [] });

		expect(two.lines[2]).toEqual({ label: 'Topics', value: 'Small arms; Cyber operations' });
		expect(none.lines.map((line) => line.label)).toEqual(['Country', 'Committee']);
	});
});

describe('countPages', () => {
	it('gives an empty paper no pages and a short one a single page', () => {
		expect(countPages(0)).toBe(0);
		expect(countPages(1)).toBe(1);
		expect(countPages(WORDS_PER_PAGE)).toBe(1);
	});

	it('starts a new page with the first word past a full one', () => {
		expect(countPages(WORDS_PER_PAGE + 1)).toBe(2);
		expect(countPages(WORDS_PER_PAGE * 3)).toBe(3);
	});
});

describe('paperLengthText', () => {
	it('reads the words and the pages together', () => {
		expect(pageCountText(1)).toBe('1 page');
		expect(paperLengthText(812)).toBe('812 words · 2 pages');
		expect(paperLengthText(1)).toBe('1 word · 1 page');
	});

	it('leaves the pages out of an empty paper', () => {
		expect(paperLengthText(0)).toBe('0 words');
	});
});
