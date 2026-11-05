import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { Award } from '$lib/awards';
import CommitteeAwardsCard from './CommitteeAwardsCard.svelte';

const AWARD: Award = {
	id: 'award-1',
	committeeId: 'committee-1',
	seatId: 'seat-1',
	seatName: 'France',
	countryCode: 'FR',
	holderName: 'Amira Haddad',
	isSeatEmpty: false,
	kind: 'best_delegate',
	title: 'Best Delegate',
	status: 'confirmed',
	createdBy: 'chair-1',
	proposerName: 'Ada'
};

describe('CommitteeAwardsCard', () => {
	it('lists a published award with its seat and holder, and no badge', () => {
		render(CommitteeAwardsCard, { props: { awards: [AWARD], isPublished: true } });

		expect(screen.getByRole('heading', { name: 'Awards' })).toBeTruthy();
		expect(screen.getByText('Best Delegate')).toBeTruthy();
		expect(screen.getByText(/France · Amira Haddad/)).toBeTruthy();
		expect(screen.queryByText('Published')).toBeNull();
	});

	it('marks an award that is not published yet, which only chairs and organisers see', () => {
		render(CommitteeAwardsCard, {
			props: { awards: [{ ...AWARD, status: 'proposed' }], isPublished: false }
		});

		expect(screen.getByText('Proposed')).toBeTruthy();
	});
});
