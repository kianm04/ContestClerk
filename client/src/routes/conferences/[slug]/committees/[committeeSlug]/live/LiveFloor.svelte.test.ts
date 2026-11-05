import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import type { RoomSpeaker } from '$lib/chair-room';
import type { RoomSeat, TimerSetting } from '$lib/committee-room';
import type { ReaderWaitBasis } from '$lib/watched-floor';
import LiveFloor from './LiveFloor.svelte';

const NOW = new Date('2026-10-01T12:07:00.000Z');

const CHINA: RoomSeat = {
	id: 'seat-cn',
	name: 'China',
	countryCode: 'CN',
	delegateName: 'Wei Zhang'
};
const BRAZIL: RoomSeat = { id: 'seat-br', name: 'Brazil', countryCode: 'BR', delegateName: null };
const UNITED_KINGDOM: RoomSeat = { id: 'seat-gb', name: 'United Kingdom', countryCode: 'GB' };

/** China speaking; the United Kingdom, then Brazil, waiting. */
const ENTRIES: RoomSpeaker[] = [
	{ id: 'entry-cn', position: 0, status: 'speaking', seat: CHINA },
	{ id: 'entry-gb', position: 1, status: 'waiting', seat: UNITED_KINGDOM },
	{ id: 'entry-br', position: 2, status: 'waiting', seat: BRAZIL }
];

/** Brazil's wait, at a minute and a half a speech. */
const BRAZIL_WAIT: ReaderWaitBasis = {
	entries: ENTRIES,
	attendance: {},
	seatId: 'seat-br',
	speakingTimeSeconds: 90
};

/** A running clock with `seconds` left, from `NOW`. */
function runningFor(seconds: number): TimerSetting {
	const endsAt = new Date(NOW.getTime() + seconds * 1000).toISOString();

	return { totalSeconds: 90, endsAt, pausedRemainingSeconds: null };
}

function renderFloor(overrides: Record<string, unknown> = {}) {
	return render(LiveFloor, {
		props: {
			modeTitle: 'General Speakers’ List',
			caucus: null,
			speaker: CHINA,
			timer: runningFor(52),
			speakingTimeSeconds: 90,
			isReadersFloor: false,
			readerWait: BRAZIL_WAIT,
			clockOffsetMs: 0,
			...overrides
		}
	});
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('LiveFloor', () => {
	it("draws the mode, the speaker with their delegate, the clock and the reader's place", () => {
		const { container } = renderFloor();

		expect(screen.getByRole('region', { name: 'General Speakers’ List' })).toBeTruthy();
		expect(screen.getByText('China')).toBeTruthy();
		expect(screen.getByText('Wei Zhang')).toBeTruthy();
		expect(screen.getByRole('timer').textContent?.trim()).toBe('0:52');
		expect(screen.getByRole('timer').className).toContain('text-[56px]');
		// 52 seconds left, then the United Kingdom's 1:30: about 3 minutes.
		expect(screen.getByText('You are 2nd · about 3 min')).toBeTruthy();
		expect(container.querySelectorAll('form, button')).toHaveLength(0);
	});

	it('follows the clock as it runs: the wait shrinks with the speech', () => {
		renderFloor({ timer: runningFor(31) });
		expect(screen.getByText('You are 2nd · about 3 min')).toBeTruthy();

		vi.advanceTimersByTime(2_000);
		flushSync();
		expect(screen.getByRole('timer').textContent?.trim()).toBe('0:29');
		expect(screen.getByText('You are 2nd · about 2 min')).toBeTruthy();
	});

	it('says "You have the floor" above the speaker when it is the reader\'s seat', () => {
		renderFloor({ speaker: BRAZIL, isReadersFloor: true, readerWait: null });

		expect(screen.getByText('You have the floor')).toBeTruthy();
		expect(screen.queryByText(/You are/)).toBeNull();
	});

	it('turns warning in the last ten seconds, counts up in danger, and stands still while paused', () => {
		const warning = renderFloor({ timer: runningFor(7) });
		expect(screen.getByRole('timer').className).toContain('text-warning-700');
		warning.unmount();

		const over = renderFloor({ timer: runningFor(-7) });
		expect(screen.getByRole('timer').textContent?.trim()).toBe('+0:07');
		expect(screen.getByRole('timer').className).toContain('text-danger-700');
		over.unmount();

		renderFloor({ timer: { totalSeconds: 90, endsAt: null, pausedRemainingSeconds: 41 } });
		vi.advanceTimersByTime(2_000);
		flushSync();
		expect(screen.getByRole('timer').textContent?.trim()).toBe('0:41');
	});

	it('says nobody has the floor, and gives staff watching no place', () => {
		renderFloor({ speaker: null, readerWait: null });

		expect(screen.getByText('Nobody has the floor')).toBeTruthy();
		expect(screen.queryByRole('timer')).toBeNull();
	});

	it("shows a moderated caucus's clock above the speaker, then that it is up", () => {
		const running = renderFloor({
			modeTitle: 'Moderated caucus · Opening humanitarian corridors',
			caucus: { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 372 }
		});
		const caucus = screen.getByRole('timer', { name: 'Caucus time left' });
		expect(caucus.textContent?.replace(/\s+/g, ' ').trim()).toBe('Caucus 6:12 left of 10:00');
		running.unmount();

		renderFloor({ caucus: { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 0 } });
		expect(screen.getByText('Caucus time is up').className).toContain('text-danger-700');
	});

	it('shows a typed single speaker by their initials', () => {
		renderFloor({
			modeTitle: 'Single speaker · Right of reply',
			speaker: { id: 'entry-sg', name: 'Secretary-General', countryCode: null }
		});

		expect(screen.getByRole('region', { name: 'Single speaker · Right of reply' })).toBeTruthy();
		expect(screen.getByText('SG')).toBeTruthy();
	});
});
