import { describe, expect, it } from 'vitest';
import {
	OPERATIVE_PHRASES,
	PREAMBULATORY_PHRASES,
	clausePlainText,
	hasOpeningPhrase,
	markedOpeningPhrase,
	openingPhrase,
	phrasesFor
} from './resolution-phrases';

// Words that end in -ise in American English too, so they have no -ize twin.
const SAME_IN_BOTH_SPELLINGS = new Set(['advises']);

// "Recognising" and "Recognizing", "Authorises" and "Authorizes": the other spelling of a phrase.
function otherSpelling(phrase: string): string {
	return phrase.replace(/(?<=\p{L})i([sz])(e|es|ed|ing|ation|ant)\b/gu, (_match, letter, ending) =>
		letter === 's' ? `iz${ending}` : `is${ending}`
	);
}

describe('the phrase lists', () => {
	for (const [name, phrases] of [
		['preambulatory', PREAMBULATORY_PHRASES],
		['operative', OPERATIVE_PHRASES]
	] as const) {
		it(`lists each ${name} phrase once`, () => {
			const lowercase = phrases.map((phrase) => phrase.toLowerCase());

			expect(new Set(lowercase).size).toBe(phrases.length);
		});

		it(`writes each ${name} phrase in sentence case, with single spaces`, () => {
			for (const phrase of phrases) {
				expect(phrase).toMatch(/^[A-Z][a-z-]*( [a-z-]+)*$/);
			}
		});

		it(`has both spellings of every ${name} phrase spelt with -ise or -ize`, () => {
			for (const phrase of phrases) {
				if (SAME_IN_BOTH_SPELLINGS.has(phrase.toLowerCase())) continue;

				expect(phrases).toContain(otherSpelling(phrase));
			}
		});
	}

	it('holds the phrases chairs look for first', () => {
		for (const phrase of ['Recalling', 'Alarmed by', 'Bearing in mind', 'Taking note of']) {
			expect(PREAMBULATORY_PHRASES).toContain(phrase);
		}
		for (const phrase of ['Calls upon', 'Urges', 'Requests', 'Decides', 'Takes note of']) {
			expect(OPERATIVE_PHRASES).toContain(phrase);
		}
	});

	it('gives each part its own list', () => {
		expect(phrasesFor('preamble')).toBe(PREAMBULATORY_PHRASES);
		expect(phrasesFor('operative')).toBe(OPERATIVE_PHRASES);
	});
});

describe('openingPhrase', () => {
	it('finds a preambulatory phrase at the start of a clause', () => {
		expect(openingPhrase('Recalling its resolution 2417 (2018),', 'preamble')).toBe('Recalling');
	});

	it('finds the longest phrase that fits', () => {
		expect(openingPhrase('Calls upon all parties to cease fire;', 'operative')).toBe('Calls upon');
		expect(openingPhrase('Calls for an immediate ceasefire;', 'operative')).toBe('Calls for');
		expect(openingPhrase('Calls a conference of the parties;', 'operative')).toBe('Calls');
		expect(openingPhrase('Taking note of the report,', 'preamble')).toBe('Taking note of');
		expect(openingPhrase('Alarmed by the number of civilian deaths,', 'preamble')).toBe(
			'Alarmed by'
		);
	});

	it('knows the British and the American spelling', () => {
		expect(openingPhrase('Recognising the right of every State,', 'preamble')).toBe('Recognising');
		expect(openingPhrase('Recognizing the right of every State,', 'preamble')).toBe('Recognizing');
		expect(openingPhrase('Authorises the Secretary-General to act;', 'operative')).toBe(
			'Authorises'
		);
		expect(openingPhrase('Authorizes the Secretary-General to act;', 'operative')).toBe(
			'Authorizes'
		);
	});

	it('ignores case and gives the phrase back as it is written', () => {
		expect(openingPhrase('RECALLING its resolution 78/241,', 'preamble')).toBe('RECALLING');
		expect(openingPhrase('calls upon all States to:', 'operative')).toBe('calls upon');
	});

	it('allows space before the phrase and inside it', () => {
		expect(openingPhrase('   Recalling its resolution,', 'preamble')).toBe('Recalling');
		expect(openingPhrase('Calls  upon all States;', 'operative')).toBe('Calls  upon');
	});

	it('matches a phrase only where its last word ends', () => {
		expect(openingPhrase('Recallingx its resolution,', 'preamble')).toBeNull();
		expect(openingPhrase('Callsign rules;', 'operative')).toBeNull();
		expect(openingPhrase('Calls upon, once more, all States;', 'operative')).toBe('Calls upon');
		expect(openingPhrase('Recalling', 'preamble')).toBe('Recalling');
	});

	it('finds nothing when the clause starts with no phrase on its list', () => {
		expect(openingPhrase('The General Assembly notes the report,', 'preamble')).toBeNull();
		expect(openingPhrase('', 'operative')).toBeNull();
		expect(openingPhrase('Recalling its resolution;', 'operative')).toBeNull();
		expect(openingPhrase('Urges all States,', 'preamble')).toBeNull();
	});
});

describe('markedOpeningPhrase', () => {
	it('reads a phrase marked in italic at the start of a preambulatory clause', () => {
		expect(markedOpeningPhrase('*Recalling* its resolution,', 'preamble')).toBe('Recalling');
		expect(markedOpeningPhrase('_Rappelant_ sa résolution,', 'preamble')).toBe('Rappelant');
		expect(markedOpeningPhrase('  *Deeply worried* by the reports,', 'preamble')).toBe(
			'Deeply worried'
		);
	});

	it('reads a phrase marked underlined at the start of an operative clause', () => {
		expect(markedOpeningPhrase('++Urges strongly++ all States to act;', 'operative')).toBe(
			'Urges strongly'
		);
		expect(markedOpeningPhrase('++ Calls upon ++ all parties;', 'operative')).toBe('Calls upon');
	});

	it('reads only the formatting of its own part', () => {
		expect(markedOpeningPhrase('++Recalling++ its resolution,', 'preamble')).toBeNull();
		expect(markedOpeningPhrase('*Urges strongly* all States;', 'operative')).toBeNull();
	});

	it('does not take bold for italic', () => {
		expect(markedOpeningPhrase('**Recalling** its resolution,', 'preamble')).toBeNull();
	});

	it('finds nothing when the clause does not start with the mark', () => {
		expect(markedOpeningPhrase('Recalling *its* resolution,', 'preamble')).toBeNull();
		expect(markedOpeningPhrase('Calls upon ++all++ States;', 'operative')).toBeNull();
		expect(markedOpeningPhrase('snake_case_ words,', 'preamble')).toBeNull();
		expect(markedOpeningPhrase('++++ all States;', 'operative')).toBeNull();
		expect(markedOpeningPhrase('', 'preamble')).toBeNull();
	});
});

describe('clausePlainText', () => {
	it('drops italic, bold, underline, strike and code marks', () => {
		expect(clausePlainText('*Recalling* its **resolution** 78/241,')).toBe(
			'Recalling its resolution 78/241,'
		);
		expect(clausePlainText('++Calls upon++ all ~~parties~~ `States`;')).toBe(
			'Calls upon all parties States;'
		);
		expect(clausePlainText('_Noting_ the report,')).toBe('Noting the report,');
	});

	it('keeps an underscore inside a word and a character typed after a backslash', () => {
		expect(clausePlainText('the snake_case name,')).toBe('the snake_case name,');
		expect(clausePlainText('a \\*starred\\* word,')).toBe('a *starred* word,');
	});

	it('keeps only the words of a link', () => {
		expect(clausePlainText('Recalling [resolution 2417](https://undocs.org/S/RES/2417),')).toBe(
			'Recalling resolution 2417,'
		);
	});
});

describe('hasOpeningPhrase', () => {
	it('accepts a phrase from the list, styled or not', () => {
		expect(hasOpeningPhrase('Recalling its resolution,', 'preamble')).toBe(true);
		expect(hasOpeningPhrase('*Recalling* its resolution,', 'preamble')).toBe(true);
		expect(hasOpeningPhrase('++Calls upon++ all States;', 'operative')).toBe(true);
	});

	it('accepts a phrase on no list when the author marked it', () => {
		expect(hasOpeningPhrase('*Rappelant* sa résolution,', 'preamble')).toBe(true);
		expect(hasOpeningPhrase('++Exhorte++ tous les États;', 'operative')).toBe(true);
	});

	it('refuses a clause with neither', () => {
		expect(hasOpeningPhrase('Rappelant sa résolution,', 'preamble')).toBe(false);
		expect(hasOpeningPhrase('All States should act;', 'operative')).toBe(false);
	});
});
