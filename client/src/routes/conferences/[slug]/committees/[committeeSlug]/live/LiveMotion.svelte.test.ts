import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { SessionMotion } from '$lib/motions';
import LiveMotion from './LiveMotion.svelte';

const CAUCUS: SessionMotion = {
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

describe('LiveMotion', () => {
	it('names the motion first in line with its times, its topic and who raised it', () => {
		render(LiveMotion, { props: { motion: CAUCUS } });

		expect(screen.getByRole('region', { name: 'Motion on the floor' })).toBeTruthy();
		expect(screen.getByText('Moderated caucus · 10:00 / 1:00')).toBeTruthy();
		expect(screen.getByText('Opening humanitarian corridors · Brazil')).toBeTruthy();
	});

	it('says the chair raised a motion no seat proposed', () => {
		render(LiveMotion, {
			props: { motion: { ...CAUCUS, kind: 'unmoderated_caucus', topic: null, proposedBy: null } }
		});

		expect(screen.getByText('Unmoderated caucus · 10:00')).toBeTruthy();
		expect(screen.getByText('the chair')).toBeTruthy();
	});
});
