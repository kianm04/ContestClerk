import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { OpenVote } from '$lib/votes';
import LiveVote from './LiveVote.svelte';

const OPEN_HANDS: OpenVote = {
	id: 'vote-1',
	subject: 'Draft Resolution 1.1',
	kind: 'substantive',
	method: 'show_of_hands',
	majority: 'simple',
	status: 'open',
	votesFor: 4,
	votesAgainst: 1,
	votesAbstain: 0,
	passed: null,
	openedAt: '2026-10-01T11:00:00.000Z',
	closedAt: null,
	entries: {}
};

const COUNTS = { for: 2, against: 1, abstain: 0 };

/** The three counts as the page reads them, word and number. */
function countTexts(container: HTMLElement): string[] {
	const rows = [...container.querySelectorAll('dl > div')];

	return rows.map((row) => (row.textContent ?? '').replace(/\s+/g, ''));
}

describe('LiveVote', () => {
	it('shows an open show of hands with its majority and method, and no counts', () => {
		const { container } = render(LiveVote, {
			props: { vote: OPEN_HANDS, counts: COUNTS, answerText: null }
		});

		expect(screen.getByRole('region', { name: 'Draft Resolution 1.1' })).toBeTruthy();
		expect(screen.getByText('Simple majority · voting by show of hands')).toBeTruthy();
		expect(container.querySelector('dl')).toBeNull();
	});

	it("shows a roll call vote's counts so far, the bar and the reader's own answer", () => {
		const { container } = render(LiveVote, {
			props: {
				vote: { ...OPEN_HANDS, method: 'roll_call' },
				counts: COUNTS,
				answerText: 'You voted yes'
			}
		});

		expect(screen.getByText('Roll call vote · simple majority')).toBeTruthy();
		expect(screen.getByText('You voted yes')).toBeTruthy();
		expect(countTexts(container)).toEqual(['for2', 'against1', 'abstaining0']);
		expect(screen.queryByText(/passes at/)).toBeNull();
	});

	it('titles a closed vote by its result, with the counts and no line', () => {
		const { container } = render(LiveVote, {
			props: {
				vote: { ...OPEN_HANDS, status: 'closed', passed: true },
				counts: { for: 4, against: 1, abstain: 0 },
				answerText: null
			}
		});

		expect(screen.getByRole('region', { name: 'Draft Resolution 1.1 passes' })).toBeTruthy();
		expect(screen.queryByText(/voting by show of hands/)).toBeNull();
		expect(countTexts(container)).toEqual(['for4', 'against1', 'abstaining0']);
	});
});
