import { describe, expect, it } from 'vitest';
import {
	closeSignaturesNote,
	signingButton,
	signingStateWord,
	signingView,
	signingMessage,
	type SigningState
} from './paper-signing';

const CLOSED: SigningState = {
	isOpen: false,
	openedAt: null,
	isAuthor: true,
	mySeatName: 'Austria',
	hasSigned: false,
	isBeingWritten: true
};
const OPEN: SigningState = { ...CLOSED, isOpen: true, openedAt: '2099-03-01T16:05:00Z' };

describe('closeSignaturesNote', () => {
	it('tells an author when the paper opened, in the conference’s time', () => {
		expect(closeSignaturesNote(OPEN, 'Europe/Berlin')).toBe('Open for signatures since 17:05.');
	});

	it('has nothing for a closed paper or a reader who is not an author', () => {
		expect(closeSignaturesNote(CLOSED, 'UTC')).toBeNull();
		expect(closeSignaturesNote({ ...OPEN, isAuthor: false }, 'UTC')).toBeNull();
	});
});

describe('signingStateWord', () => {
	it('says who may see the paper', () => {
		expect(signingStateWord(true)).toBe('Open for signatures');
		expect(signingStateWord(false)).toBe('Private to the authors');
	});
});

describe('signingButton', () => {
	it('lets an author open the paper, and leaves the title row to submitting once it is', () => {
		expect(signingButton(CLOSED)).toEqual({
			action: 'openSignatures',
			label: 'Open for signatures',
			isPrimary: true
		});
		expect(signingButton(OPEN)).toBeNull();
	});

	it('lets another seat sign an open paper, then take the signature back', () => {
		const ghana = { ...OPEN, isAuthor: false, mySeatName: 'Ghana' };

		expect(signingButton(ghana)).toMatchObject({ label: 'Sign as Ghana', isPrimary: true });
		expect(signingButton({ ...ghana, hasSigned: true })).toMatchObject({
			action: 'removeSignature',
			isPrimary: false
		});
	});

	it('offers nothing on a closed paper, or to a reader with no seat', () => {
		expect(signingButton({ ...CLOSED, isAuthor: false })).toBeNull();
		expect(signingButton({ ...OPEN, isAuthor: false, mySeatName: null })).toBeNull();
	});

	it('lets a signatory take their signature off a returned paper, but not one with the dais', () => {
		const signed = { ...CLOSED, isAuthor: false, mySeatName: 'Ghana', hasSigned: true };

		expect(signingButton(signed)).toMatchObject({ action: 'removeSignature' });
		expect(signingButton({ ...signed, isBeingWritten: false })).toBeNull();
	});
});

describe('signingMessage', () => {
	it('says what changed', () => {
		expect(signingMessage('sign', 'Autonomous weapons')).toBe('You signed “Autonomous weapons”.');
		expect(signingMessage('openSignatures', 'A')).toBe('“A” is open for signatures.');
	});
});

describe('signingView', () => {
	it('gathers what the page says about signing', () => {
		expect(signingView(OPEN, 'Europe/Berlin')).toEqual({
			isOpen: true,
			button: null,
			stateWord: 'Open for signatures',
			closeNote: 'Open for signatures since 17:05.'
		});
	});
});
