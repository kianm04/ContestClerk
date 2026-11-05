import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { RoomSeat } from '$lib/committee-room';
import type { FloorScreenView } from '$lib/watched-floor';
import DisplayFloor from './DisplayFloor.svelte';

const NOW = new Date('2026-10-01T12:07:00.000Z');

const CHINA: RoomSeat = {
	id: 'seat-cn',
	name: 'China',
	countryCode: 'CN',
	delegateName: 'Wei Zhang'
};
const NEXT: RoomSeat[] = ['United Kingdom', 'Brazil', 'Russian Federation'].map((name) => ({
	id: name,
	name,
	countryCode: null
}));

/** China on the GSL with 52 seconds of 1:30 left and three waiting. */
const GSL: FloorScreenView = {
	modeTitle: 'General Speakers’ List',
	caucus: null,
	speaker: CHINA,
	timer: {
		totalSeconds: 90,
		endsAt: new Date(NOW.getTime() + 52_000).toISOString(),
		pausedRemainingSeconds: null
	},
	speakingTimeSeconds: 90,
	clockNote: null,
	nextSeats: NEXT,
	emptyText: 'The next speaker will be called shortly'
};

function renderFloor(overrides: Partial<FloorScreenView> = {}) {
	return render(DisplayFloor, { props: { ...GSL, ...overrides, clockOffsetMs: 0 } });
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('DisplayFloor', () => {
	it('draws the mode, the speaker with their delegate, the clock at the right and the next three', () => {
		const { container } = renderFloor();

		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('General Speakers’ List');
		expect(screen.getByText('China')).toBeTruthy();
		expect(screen.getByText('Wei Zhang')).toBeTruthy();
		expect(screen.getByRole('timer').textContent?.trim()).toBe('0:52');
		expect(screen.getByRole('timer').className).toContain('text-[17vw]');
		expect(screen.getByText('Next')).toBeTruthy();
		expect(screen.getByText('United Kingdom · Brazil · Russian Federation')).toBeTruthy();
		// The flag is flagcdn's w320, the projector's `xl`.
		expect(container.querySelector('img')?.getAttribute('src')).toBe(
			'https://flagcdn.com/w320/cn.png'
		);
	});

	it('writes "About to speak" or "Paused" beside a clock that is not running', () => {
		const ready = renderFloor({
			clockNote: 'About to speak',
			timer: { totalSeconds: 90, endsAt: null, pausedRemainingSeconds: 90 }
		});
		expect(screen.getByText('About to speak')).toBeTruthy();
		expect(screen.getByRole('timer').textContent?.trim()).toBe('1:30');
		ready.unmount();

		renderFloor({
			clockNote: 'Paused',
			timer: { totalSeconds: 90, endsAt: null, pausedRemainingSeconds: 41 }
		});
		expect(screen.getByText('Paused')).toBeTruthy();
	});

	it('turns warning in the last ten seconds and counts up in danger once over', () => {
		const warning = renderFloor({
			timer: {
				totalSeconds: 90,
				endsAt: new Date(NOW.getTime() + 7_000).toISOString(),
				pausedRemainingSeconds: null
			}
		});
		expect(screen.getByRole('timer').className).toContain('text-warning-700');
		warning.unmount();

		renderFloor({
			timer: {
				totalSeconds: 90,
				endsAt: new Date(NOW.getTime() - 7_000).toISOString(),
				pausedRemainingSeconds: null
			}
		});
		expect(screen.getByRole('timer').textContent?.trim()).toBe('+0:07');
		expect(screen.getByRole('timer').className).toContain('text-danger-700');
	});

	it('puts the empty sentence in the speaker\'s place, and leaves "Next" out with nobody waiting', () => {
		renderFloor({ speaker: null, nextSeats: [] });

		expect(screen.getByText('The next speaker will be called shortly')).toBeTruthy();
		expect(screen.queryByRole('timer')).toBeNull();
		expect(screen.queryByText('Next')).toBeNull();
	});

	it("shows a moderated caucus's own clock above the speaker", () => {
		renderFloor({
			modeTitle: 'Moderated caucus · Opening humanitarian corridors',
			caucus: { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 372 }
		});

		expect(screen.getByRole('timer', { name: 'Caucus time left' }).textContent).toMatch(
			/^\s*Caucus\s+6:12\s+left\s*$/
		);
	});

	it('reads "Caucus time is up" once the caucus has run out', () => {
		renderFloor({ caucus: { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 0 } });

		const caucus = screen.getByRole('timer', { name: 'Caucus time left' });
		expect(caucus.textContent?.trim()).toBe('Caucus time is up');
		expect(caucus.querySelector('strong')?.className).toContain('text-danger-700');
	});

	it("shows a typed single speaker's initials in the flag's place", () => {
		renderFloor({
			modeTitle: 'Single speaker · Right of reply',
			speaker: { id: 'entry-1', name: 'Secretary-General', countryCode: null }
		});

		expect(screen.getByText('SG')).toBeTruthy();
		expect(screen.getByText('Secretary-General')).toBeTruthy();
	});
});
