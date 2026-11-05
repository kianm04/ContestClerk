import { describe, expect, it } from 'vitest';
import { teamSummarySentence } from './team-summary';

describe('teamSummarySentence', () => {
	it('counts the people and the invitations waiting', () => {
		expect(teamSummarySentence(11, 2)).toBe('11 people · 2 invitations waiting');
	});

	it('writes one of each in the singular', () => {
		expect(teamSummarySentence(1, 1)).toBe('1 person · 1 invitation waiting');
	});

	it('leaves out the invitations when none are waiting', () => {
		expect(teamSummarySentence(4, 0)).toBe('4 people');
	});

	it('leaves out the people when there are only invitations', () => {
		expect(teamSummarySentence(0, 3)).toBe('3 invitations waiting');
	});

	it('says so when there is nobody and nothing waiting', () => {
		expect(teamSummarySentence(0, 0)).toBe('Nobody on the team yet');
	});
});
