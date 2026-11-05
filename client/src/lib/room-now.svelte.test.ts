import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoomNow } from './room-now.svelte';

const START = new Date('2026-10-01T12:00:00.000Z');

/**
 * The moment, made inside `$effect.root`, which lets its `$effect` start
 * outside a component. `flushSync` runs that effect straight away rather than
 * at Svelte's next update.
 */
function makeRoomNow(tickMs: () => number | null, clockOffsetMs: () => number = () => 0) {
	let roomNow: ReturnType<typeof createRoomNow> | undefined;
	const stop = $effect.root(() => {
		roomNow = createRoomNow(tickMs, clockOffsetMs);
	});
	flushSync();

	if (roomNow === undefined) throw new Error('The moment was not made.');

	return { roomNow, stop };
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(START);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('createRoomNow', () => {
	it('moves on every tick while a clock runs', () => {
		const { roomNow, stop } = makeRoomNow(() => 100);

		vi.advanceTimersByTime(1_000);

		expect(roomNow.now.getTime()).toBe(START.getTime() + 1_000);
		stop();
	});

	it('stands still while no clock runs', () => {
		const { roomNow, stop } = makeRoomNow(() => null);

		vi.advanceTimersByTime(5_000);

		expect(roomNow.now.getTime()).toBe(START.getTime());
		stop();
	});

	it('reads the time on the server’s clock, the offset added', () => {
		const { roomNow, stop } = makeRoomNow(
			() => null,
			() => 2_500
		);

		expect(roomNow.now.getTime()).toBe(START.getTime() + 2_500);
		stop();
	});

	it('stops ticking once its owner is gone', () => {
		const { roomNow, stop } = makeRoomNow(() => 100);

		stop();
		vi.advanceTimersByTime(1_000);

		expect(roomNow.now.getTime()).toBe(START.getTime());
	});
});
