import { describe, expect, it } from 'vitest';
import {
	carriedFields,
	confirmationPageUrl,
	pageAddress,
	readConfirmationQuestion,
	sameSitePath
} from './confirmation';

const ORIGIN = 'http://localhost';

const WORDS = {
	title: 'Delete this event?',
	text: 'It disappears from every schedule.',
	label: 'Delete event',
	variant: 'danger' as const
};

describe('pageAddress', () => {
	it('keeps the query a page is showing', () => {
		const url = new URL(`${ORIGIN}/manage/thimun-2027/schedule?day=2027-03-01`);

		expect(pageAddress(url)).toBe('/manage/thimun-2027/schedule?day=2027-03-01');
	});

	it('drops the form action a failed post leaves in the address', () => {
		const url = new URL(`${ORIGIN}/manage/thimun-2027/schedule?/addEvent&day=2027-03-01`);

		expect(pageAddress(url)).toBe('/manage/thimun-2027/schedule?day=2027-03-01');
	});
});

describe('confirmationPageUrl', () => {
	it('carries the question, the full action and the page to go back to', () => {
		const pageUrl = new URL(`${ORIGIN}/manage/thimun-2027/schedule?day=2027-03-01`);

		const address = new URL(confirmationPageUrl(WORDS, '?/deleteEvent', pageUrl), ORIGIN);

		expect(address.pathname).toBe('/confirm');
		expect(address.searchParams.get('title')).toBe(WORDS.title);
		expect(address.searchParams.get('text')).toBe(WORDS.text);
		expect(address.searchParams.get('label')).toBe(WORDS.label);
		expect(address.searchParams.get('variant')).toBe('danger');
		expect(address.searchParams.get('action')).toBe('/manage/thimun-2027/schedule?/deleteEvent');
		expect(address.searchParams.get('back')).toBe('/manage/thimun-2027/schedule?day=2027-03-01');
	});

	it('keeps an action that is already a full path, query and all', () => {
		const pageUrl = new URL(`${ORIGIN}/delegations/d-1/seats`);

		const address = new URL(
			confirmationPageUrl(WORDS, '/delegations/d-1/seats?/unassign&seat=seat-1', pageUrl),
			ORIGIN
		);

		expect(address.searchParams.get('action')).toBe('/delegations/d-1/seats?/unassign&seat=seat-1');
	});

	it('is read back into the same question', () => {
		const pageUrl = new URL(`${ORIGIN}/manage/thimun-2027/schedule`);
		const address = new URL(confirmationPageUrl(WORDS, '?/deleteEvent', pageUrl), ORIGIN);

		expect(readConfirmationQuestion(address)).toEqual({
			...WORDS,
			actionAddress: '/manage/thimun-2027/schedule?/deleteEvent',
			returnAddress: '/manage/thimun-2027/schedule'
		});
	});
});

describe('sameSitePath', () => {
	it('keeps a path on this site', () => {
		expect(sameSitePath('/settings?/deleteAccount')).toBe('/settings?/deleteAccount');
	});

	it('refuses anything that would leave the site', () => {
		expect(sameSitePath('https://example.com/steal')).toBeNull();
		expect(sameSitePath('//example.com/steal')).toBeNull();
		expect(sameSitePath('/\\example.com/steal')).toBeNull();
		expect(sameSitePath('javascript:alert(1)')).toBeNull();
	});

	it('refuses a path that normalises into another website (security review M13)', () => {
		// Each stays on this site for the parser, because the dot segment holds
		// the first slash, but comes out as `//evil.example`.
		expect(sameSitePath('/.//evil.example')).toBeNull();
		expect(sameSitePath('/a/..//evil.example')).toBeNull();
		expect(sameSitePath('/%2e//evil.example')).toBeNull();
		expect(sameSitePath('/./\\evil.example')).toBeNull();
	});

	it('refuses an address that does not parse, rather than throwing', () => {
		expect(sameSitePath('//')).toBeNull();
		expect(sameSitePath('///')).toBeNull();
	});

	it('drops the fragment', () => {
		expect(sameSitePath('/settings?tab=account#delete')).toBe('/settings?tab=account');
	});

	it('refuses an address that is missing or relative', () => {
		expect(sameSitePath(null)).toBeNull();
		expect(sameSitePath('')).toBeNull();
		expect(sameSitePath('?/delete')).toBeNull();
	});
});

describe('readConfirmationQuestion', () => {
	function confirmUrl(parameters: Record<string, string>): URL {
		return new URL(`${ORIGIN}/confirm?${new URLSearchParams(parameters).toString()}`);
	}

	const COMPLETE = {
		title: WORDS.title,
		text: WORDS.text,
		label: WORDS.label,
		variant: 'primary',
		action: '/manage/thimun-2027/awards?/publish',
		back: '/manage/thimun-2027/awards'
	};

	it('reads every part of the question', () => {
		expect(readConfirmationQuestion(confirmUrl(COMPLETE))).toEqual({
			title: WORDS.title,
			text: WORDS.text,
			label: WORDS.label,
			variant: 'primary',
			actionAddress: '/manage/thimun-2027/awards?/publish',
			returnAddress: '/manage/thimun-2027/awards'
		});
	});

	it('asks nothing when a part of the question is missing', () => {
		for (const missing of ['title', 'text', 'label', 'action']) {
			const parameters: Record<string, string> = { ...COMPLETE };
			delete parameters[missing];

			expect(readConfirmationQuestion(confirmUrl(parameters))).toBeNull();
		}
	});

	it('asks nothing when the answer would be posted to another website', () => {
		const question = readConfirmationQuestion(
			confirmUrl({ ...COMPLETE, action: 'https://example.com/steal' })
		);

		expect(question).toBeNull();
	});

	it('goes back to the front page when the page to go back to is foreign or missing', () => {
		const foreign = readConfirmationQuestion(confirmUrl({ ...COMPLETE, back: '//example.com' }));
		const withoutBack: Record<string, string> = { ...COMPLETE };
		delete withoutBack.back;
		const missing = readConfirmationQuestion(confirmUrl(withoutBack));

		expect(foreign?.returnAddress).toBe('/');
		expect(missing?.returnAddress).toBe('/');
	});

	it('neither throws nor leaves the site on an address that normalises or does not parse', () => {
		// Each address is tried on its own, so that a refusal of one cannot hide
		// that the other got through.
		const normalisedAction = readConfirmationQuestion(
			confirmUrl({ ...COMPLETE, action: '/.//evil.example' })
		);
		const unparsedAction = readConfirmationQuestion(confirmUrl({ ...COMPLETE, action: '//' }));
		const normalisedBack = readConfirmationQuestion(
			confirmUrl({ ...COMPLETE, back: '/a/..//evil.example' })
		);
		const unparsedBack = readConfirmationQuestion(confirmUrl({ ...COMPLETE, back: '//' }));

		expect(normalisedAction).toBeNull();
		expect(unparsedAction).toBeNull();
		expect(normalisedBack?.returnAddress).toBe('/');
		expect(unparsedBack?.returnAddress).toBe('/');
	});

	it('draws a danger button when the look it names is not one a button has', () => {
		const question = readConfirmationQuestion(confirmUrl({ ...COMPLETE, variant: 'sparkly' }));

		expect(question?.variant).toBe('danger');
	});
});

describe('carriedFields', () => {
	it('keeps every field in order, the same name twice included', () => {
		const formData = new FormData();
		formData.append('confirmation', 'DELETE');
		formData.append('seatId', 'seat-1');
		formData.append('seatId', 'seat-2');

		expect(carriedFields(formData)).toEqual([
			{ name: 'confirmation', value: 'DELETE' },
			{ name: 'seatId', value: 'seat-1' },
			{ name: 'seatId', value: 'seat-2' }
		]);
	});

	it('leaves out confirm, which only the answer may send', () => {
		const formData = new FormData();
		formData.append('confirm', '1');
		formData.append('note', '');

		expect(carriedFields(formData)).toEqual([{ name: 'note', value: '' }]);
	});

	it('leaves out a file, which a hidden field cannot hold', () => {
		const formData = new FormData();
		formData.append('paper', new File(['text'], 'paper.pdf'));

		expect(carriedFields(formData)).toEqual([]);
	});
});
