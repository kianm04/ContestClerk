import { describe, expect, it } from 'vitest';
import { nextEditionName, retargetEditionText, yearInName, yearOfDay } from './edition-name';

describe('yearInName', () => {
	it('finds a four-digit year anywhere in the name', () => {
		expect(yearInName('TU Delft MUN 2026')).toBe(2026);
		expect(yearInName('2025 Winter Session')).toBe(2025);
	});

	it('answers null when there is none, and ignores other numbers', () => {
		expect(yearInName('Delft MUN')).toBeNull();
		expect(yearInName('Delft MUN 12')).toBeNull();
		expect(yearInName('Room 20260')).toBeNull();
	});
});

describe('nextEditionName', () => {
	it('swaps the year for the next one', () => {
		expect(nextEditionName('TU Delft MUN 2026', 2027)).toBe('TU Delft MUN 2027');
	});

	it('leaves a name with no year alone', () => {
		expect(nextEditionName('Delft MUN', 2027)).toBe('Delft MUN');
	});

	it('changes only the first year', () => {
		expect(nextEditionName('MUN 2026 (since 2010)', 2027)).toBe('MUN 2027 (since 2010)');
	});
});

describe('yearOfDay', () => {
	it('reads the year of a day and refuses anything else', () => {
		expect(yearOfDay('2027-04-16')).toBe(2027);
		expect(yearOfDay('')).toBeNull();
		expect(yearOfDay('April 2027')).toBeNull();
	});
});

describe('retargetEditionText', () => {
	it('moves the old name and year in a copied tagline to the new edition', () => {
		const text = 'Join us in April 2026 for TU Delft MUN 2026.';

		expect(retargetEditionText(text, 'TU Delft MUN 2026', 'TU Delft MUN 2027', 2027)).toBe(
			'Join us in April 2027 for TU Delft MUN 2027.'
		);
	});

	it('leaves text alone when the old name had no year', () => {
		expect(retargetEditionText('Debate. Connect.', 'Delft MUN', 'Delft MUN', 2027)).toBe(
			'Debate. Connect.'
		);
	});
});
