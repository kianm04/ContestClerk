import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { RoomScreen } from '$lib/room-screen';
import LivePaperLine from './LivePaperLine.svelte';

const UNMOD: RoomScreen = { kind: 'unmod' };

const DRAFT = { id: 'paper-2', name: 'Draft resolution 1.1', title: 'Human control' };

/** A room with "Working paper 1.1" on the projector, or none, and the paper its vote is on. */
function makeRoom(
	hasPaper: boolean,
	votedPaper: { paper: typeof DRAFT; isOpen: boolean } | null = null
) {
	return {
		displayedPaper: hasPaper
			? { id: 'paper-1', name: 'Working paper 1.1', title: 'Autonomous weapons' }
			: null,
		votedPaper,
		conference: { slug: 'thimun-2027' },
		committee: { slug: 'disec' }
	};
}

describe('LivePaperLine', () => {
	it('says which paper is on the screen, linked to its reading page', () => {
		render(LivePaperLine, { props: { screen: UNMOD, room: makeRoom(true) } });

		const link = screen.getByRole('link', { name: 'Working paper 1.1 · Autonomous weapons' });

		expect(screen.getByText('On screen')).toBeTruthy();
		expect(link.getAttribute('href')).toBe(
			'/conferences/thimun-2027/committees/disec/resolutions/paper-1'
		);
	});

	it('draws nothing while no paper is on the screen', () => {
		render(LivePaperLine, { props: { screen: UNMOD, room: makeRoom(false) } });

		expect(screen.queryByText('On screen')).toBeNull();
	});

	it('draws nothing while a vote has the screen, which the projector keeps for the vote', () => {
		render(LivePaperLine, { props: { screen: { kind: 'vote' }, room: makeRoom(true) } });

		expect(screen.queryByText('On screen')).toBeNull();
	});

	it('names the draft the room is voting on, linked to its reading page', () => {
		const room = makeRoom(true, { paper: DRAFT, isOpen: true });
		render(LivePaperLine, { props: { screen: { kind: 'vote' }, room } });

		const link = screen.getByRole('link', { name: 'Draft resolution 1.1 · Human control' });

		expect(screen.getByText('Voting on')).toBeTruthy();
		expect(link.getAttribute('href')).toBe(
			'/conferences/thimun-2027/committees/disec/resolutions/paper-2'
		);
	});

	it('says the room voted on the draft once the vote has closed', () => {
		const room = makeRoom(false, { paper: DRAFT, isOpen: false });
		render(LivePaperLine, { props: { screen: { kind: 'vote' }, room } });

		expect(screen.getByText('Voted on')).toBeTruthy();
	});
});
