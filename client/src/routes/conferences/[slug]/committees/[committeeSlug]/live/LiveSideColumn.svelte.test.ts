import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { GslEntry } from '$lib/gsl-floor';
import type { SessionMotion } from '$lib/motions';
import LiveSideColumn from './LiveSideColumn.svelte';

const SPEAKERS: GslEntry[] = [
	{
		id: 'entry-cn',
		position: 0,
		status: 'speaking',
		spokeSeconds: null,
		seat: { id: 'seat-cn', name: 'China', countryCode: 'CN' }
	},
	{
		id: 'entry-br',
		position: 1,
		status: 'waiting',
		spokeSeconds: null,
		seat: { id: 'seat-br', name: 'Brazil', countryCode: 'BR' }
	}
];

const MOTION: SessionMotion = {
	id: 'motion-1',
	kind: 'moderated_caucus',
	status: 'proposed',
	topic: 'Opening humanitarian corridors',
	totalTimeSeconds: 600,
	speakingTimeSeconds: 60,
	proposedBy: { id: 'seat-br', name: 'Brazil', countryCode: 'BR' },
	votesFor: null,
	votesAgainst: null,
	decidedAt: null,
	createdAt: '2026-10-01T11:00:00.000Z',
	startedWithoutVote: false
};

function renderColumn(overrides: Record<string, unknown> = {}) {
	return render(LiveSideColumn, {
		props: {
			view: 'gsl',
			speakers: SPEAKERS,
			attendance: {},
			mySeatId: 'seat-br',
			floorMotion: MOTION,
			...overrides
		}
	});
}

describe('LiveSideColumn', () => {
	it('beside the GSL, lists who waits and the motion first in line', () => {
		renderColumn();

		const list = screen.getByRole('region', { name: 'Speakers’ list' });
		expect(list.textContent).toContain('Brazil');
		expect(list.textContent).not.toContain('China');
		expect(screen.getByRole('region', { name: 'Motion on the floor' })).toBeTruthy();
	});

	it('names a caucus\'s list "Caucus speakers" and shows no motion beside it', () => {
		renderColumn({ view: 'mod' });

		expect(screen.getByRole('region', { name: 'Caucus speakers' })).toBeTruthy();
		expect(screen.queryByRole('region', { name: 'Motion on the floor' })).toBeNull();
	});

	it('shows nothing for a single speaker, a motion already decided, or a screen with no floor', () => {
		const single = renderColumn({ view: 'single' });
		expect(screen.queryByRole('region')).toBeNull();
		single.unmount();

		const decided = renderColumn({ floorMotion: { ...MOTION, status: 'passed' } });
		expect(screen.queryByRole('region', { name: 'Motion on the floor' })).toBeNull();
		decided.unmount();

		renderColumn({ view: null });
		expect(screen.queryByRole('region')).toBeNull();
	});
});
