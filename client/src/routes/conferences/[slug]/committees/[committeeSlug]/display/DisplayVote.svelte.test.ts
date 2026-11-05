import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { OpenVote } from '$lib/votes';
import DisplayVote from './DisplayVote.svelte';

const OPEN_HANDS: OpenVote = {
	id: 'vote-1',
	subject: 'Draft Resolution 1.1',
	kind: 'substantive',
	method: 'show_of_hands',
	majority: 'simple',
	status: 'open',
	votesFor: 4,
	votesAgainst: 1,
	votesAbstain: 1,
	passed: null,
	openedAt: '2026-10-01T11:00:00.000Z',
	closedAt: null,
	entries: {}
};

/** The three counts as the page reads them, word and number. */
function countTexts(container: HTMLElement): string[] {
	return [...container.querySelectorAll('dl > div')].map((row) =>
		(row.textContent ?? '').replace(/\s+/g, '')
	);
}

describe('DisplayVote', () => {
	it('shows how an open vote is counted, its subject, the three counts and the bar', () => {
		const { container } = render(DisplayVote, {
			props: { vote: OPEN_HANDS, counts: { for: 4, against: 1, abstain: 1 } }
		});

		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
			'Voting by show of hands · simple majority'
		);
		expect(screen.getByText('Draft Resolution 1.1')).toBeTruthy();
		expect(countTexts(container)).toEqual(['for4', 'against1', 'abstaining1']);
		// The chair's "passes at" mark is left out.
		expect(screen.queryByText(/passes at/)).toBeNull();
		expect(container.querySelector('.bg-success-500')).toBeTruthy();
	});

	it('names a roll call vote and its majority', () => {
		render(DisplayVote, {
			props: {
				vote: { ...OPEN_HANDS, method: 'roll_call', majority: 'two_thirds' },
				counts: { for: 2, against: 1, abstain: 0 }
			}
		});

		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
			'Roll call vote · two-thirds majority'
		);
	});

	it('shows the result once the vote is closed', () => {
		render(DisplayVote, {
			props: {
				vote: { ...OPEN_HANDS, status: 'closed', passed: false },
				counts: { for: 1, against: 4, abstain: 1 }
			}
		});

		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
			'Draft Resolution 1.1 · simple majority'
		);
		expect(screen.getByText('Draft Resolution 1.1 fails')).toBeTruthy();
	});
});
