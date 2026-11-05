import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { AmendmentOnScreen } from '$lib/amendment-on-screen';
import type { OpenVote } from '$lib/votes';
import DisplayAmendmentVote from './DisplayAmendmentVote.svelte';

const OPEN_VOTE: OpenVote = {
	id: 'vote-1',
	subject: 'Amendment 2 to Draft resolution 1.1',
	kind: 'substantive',
	method: 'show_of_hands',
	majority: 'simple',
	status: 'open',
	votesFor: 12,
	votesAgainst: 21,
	votesAbstain: 5,
	passed: null,
	openedAt: '2027-03-15T11:20:00.000Z',
	closedAt: null,
	entries: {}
};

/** Amendment 2, striking clause 2, as drawn. */
const STRIKE: AmendmentOnScreen = {
	sequence: 2,
	paperName: 'Draft resolution 1.1',
	headline: 'Strike clause 2',
	proposedLine: 'Proposed by the United States · Unfriendly',
	page: {
		shows: 'amendment',
		reference: '2',
		struckHtml: '<p><u>Requests</u> a voluntary register;</p>',
		newHtml: null
	}
};

const COUNTS = { for: 12, against: 21, abstain: 5 };

describe('DisplayAmendmentVote', () => {
	it('shows the amendment, the clause it strikes, the counts and who has voted', () => {
		const { container } = render(DisplayAmendmentVote, {
			props: { vote: OPEN_VOTE, amendment: STRIKE, counts: COUNTS, presentCount: 43 }
		});

		expect(screen.getByText('Voting on amendment 2 · Draft resolution 1.1')).toBeTruthy();
		expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe('Strike clause 2');
		expect(screen.getByText('Proposed by the United States · Unfriendly')).toBeTruthy();
		expect(container.querySelector('del')?.textContent).toContain('Requests a voluntary register;');
		expect(screen.getByText(/passes at/)).toBeTruthy();
		expect(screen.getByText('38 of 43 have voted')).toBeTruthy();
	});

	it('gives the result once the vote is closed, without the mark', () => {
		render(DisplayAmendmentVote, {
			props: {
				vote: { ...OPEN_VOTE, status: 'closed', passed: false },
				amendment: STRIKE,
				counts: COUNTS,
				presentCount: 43
			}
		});

		expect(screen.getByText('Voted on amendment 2 · Draft resolution 1.1')).toBeTruthy();
		expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe('Amendment 2 fails');
		expect(screen.queryByText(/passes at/)).toBeNull();
		expect(screen.queryByText(/have voted/)).toBeNull();
	});
});
