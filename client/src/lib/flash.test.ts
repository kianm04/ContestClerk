import { describe, expect, it } from 'vitest';
import { FLASH_TONES, FLASH_VISIBLE_MS, isFlash } from './flash';

describe('isFlash', () => {
	it('accepts a message in every tone', () => {
		for (const tone of FLASH_TONES) {
			expect(isFlash({ tone, message: 'Saved.' })).toBe(true);
		}
	});

	it('refuses a tone the design system does not have', () => {
		expect(isFlash({ tone: 'purple', message: 'Saved.' })).toBe(false);
	});

	it('refuses a message that is missing or empty', () => {
		expect(isFlash({ tone: 'info' })).toBe(false);
		expect(isFlash({ tone: 'info', message: '' })).toBe(false);
	});

	it('refuses anything that is not an object', () => {
		expect(isFlash(null)).toBe(false);
		expect(isFlash(undefined)).toBe(false);
		expect(isFlash('Saved.')).toBe(false);
	});

	it('refuses the result of a form action that carries no flash', () => {
		// A page's action may return errors and nothing else, which is the usual
		// case: `page.form` is set, but there is no message to show.
		expect(isFlash({ errors: { email: 'Please enter your email address.' } })).toBe(false);
	});
});

describe('isFlash with an undo', () => {
	const UNDO = {
		label: 'Undo',
		action: '/conferences/mun/committees/unsc/chair/motions?/restore',
		motionIds: ['motion-1', 'motion-2']
	};

	it('accepts a message that can be taken back on this site', () => {
		expect(isFlash({ tone: 'info', message: '2 other motions dropped', undo: UNDO })).toBe(true);
	});

	it('refuses an undo that posts to another website', () => {
		const elsewhere = { ...UNDO, action: '//evil.example/restore' };
		const absolute = { ...UNDO, action: 'https://evil.example/restore' };
		// A browser reads the backslash as a second slash (security review M13).
		const backslash = { ...UNDO, action: '/\\evil.example/restore' };
		// The dot segment goes when the address is tidied, leaving `//evil.example`.
		const dotSegment = { ...UNDO, action: '/a/..//evil.example/restore' };

		expect(isFlash({ tone: 'info', message: 'Dropped', undo: elsewhere })).toBe(false);
		expect(isFlash({ tone: 'info', message: 'Dropped', undo: absolute })).toBe(false);
		expect(isFlash({ tone: 'info', message: 'Dropped', undo: backslash })).toBe(false);
		expect(isFlash({ tone: 'info', message: 'Dropped', undo: dotSegment })).toBe(false);
	});

	it('refuses an undo with no words or with ids that are not text', () => {
		expect(isFlash({ tone: 'info', message: 'Dropped', undo: { ...UNDO, label: '' } })).toBe(false);
		expect(isFlash({ tone: 'info', message: 'Dropped', undo: { ...UNDO, motionIds: [1] } })).toBe(
			false
		);
		expect(isFlash({ tone: 'info', message: 'Dropped', undo: 'Undo' })).toBe(false);
	});
});

describe('FLASH_VISIBLE_MS', () => {
	it('is the five seconds the app shell spec asks for', () => {
		expect(FLASH_VISIBLE_MS).toBe(5000);
	});
});
