import { describe, expect, it } from 'vitest';
import type { RoomSeat } from './committee-room';
import {
	filterSeatsByName,
	listedSeatIds,
	nextPosition,
	placedPositions,
	readQueueIndex,
	waitingNeighbour,
	waitingSpeakers,
	type ListedSpeaker
} from './speakers-lists';

const FRANCE: RoomSeat = { id: 'seat-fr', name: 'France', countryCode: 'FR' };
const GHANA: RoomSeat = { id: 'seat-gh', name: 'Ghana', countryCode: 'GH' };
const JAPAN: RoomSeat = { id: 'seat-jp', name: 'Japan', countryCode: 'JP' };

/** One entry of a list. */
function speaker(
	id: string,
	seat: RoomSeat,
	position: number,
	status: ListedSpeaker['status'],
	spokeSeconds: number | null = null
): ListedSpeaker {
	return { id, seat, position, status, spokeSeconds };
}

describe('the groups of a list', () => {
	const SPEAKERS = [
		speaker('spoken', FRANCE, 1, 'spoken', 55),
		speaker('second', GHANA, 5, 'waiting'),
		speaker('removed', JAPAN, 2, 'removed'),
		speaker('first', JAPAN, 3, 'waiting'),
		speaker('now', FRANCE, 0, 'speaking')
	];

	it('puts the waiting entries in position order', () => {
		expect(waitingSpeakers(SPEAKERS).map((entry) => entry.id)).toEqual(['first', 'second']);
	});

	it('counts a seat waiting or speaking as listed, but not one spoken or removed', () => {
		expect(listedSeatIds(SPEAKERS)).toEqual(['seat-gh', 'seat-jp', 'seat-fr']);
		expect(listedSeatIds([speaker('a', FRANCE, 1, 'spoken')])).toEqual([]);
	});

	it('puts a new entry after the highest position there is', () => {
		expect(nextPosition(SPEAKERS)).toBe(6);
		expect(nextPosition([])).toBe(1);
	});
});

describe('waitingNeighbour', () => {
	const SPEAKERS = [
		speaker('now', FRANCE, 0, 'speaking'),
		speaker('first', GHANA, 2, 'waiting'),
		speaker('gone', FRANCE, 3, 'removed'),
		speaker('second', JAPAN, 4, 'waiting')
	];

	it('finds the waiting entry above or below, skipping every other status', () => {
		expect(waitingNeighbour(SPEAKERS, 'second', 'up')?.id).toBe('first');
		expect(waitingNeighbour(SPEAKERS, 'first', 'down')?.id).toBe('second');
	});

	it('is null at either end, and for an entry that is not waiting', () => {
		expect(waitingNeighbour(SPEAKERS, 'first', 'up')).toBeNull();
		expect(waitingNeighbour(SPEAKERS, 'second', 'down')).toBeNull();
		expect(waitingNeighbour(SPEAKERS, 'now', 'down')).toBeNull();
	});
});

describe('filterSeatsByName', () => {
	it('keeps the seats whose name holds the words, ignoring capitals and spaces around them', () => {
		expect(filterSeatsByName([FRANCE, GHANA, JAPAN], ' GH ')).toEqual([GHANA]);
	});

	it('keeps every seat when nothing is typed', () => {
		expect(filterSeatsByName([FRANCE, GHANA], '')).toEqual([FRANCE, GHANA]);
	});

	it('finds a seat by its delegate’s name too (T129)', () => {
		const ghanaWithDelegate = { ...GHANA, delegateName: 'Kofi Mensah' };

		expect(filterSeatsByName([FRANCE, ghanaWithDelegate, JAPAN], 'kofi')).toEqual([
			ghanaWithDelegate
		]);
	});
});

describe('placedPositions', () => {
	// France spoke; Ghana, Japan and France again wait in that order.
	const entries = [
		speaker('spoken-fr', FRANCE, 1, 'spoken'),
		speaker('entry-gh', GHANA, 2, 'waiting'),
		speaker('entry-jp', JAPAN, 3, 'waiting'),
		speaker('entry-fr', FRANCE, 4, 'waiting')
	];

	it('moves a waiting entry down and closes the gap behind it', () => {
		expect(placedPositions(entries, 'entry-gh', 2)).toEqual([
			{ id: 'entry-jp', position: 2 },
			{ id: 'entry-fr', position: 3 },
			{ id: 'entry-gh', position: 4 }
		]);
	});

	it('moves a waiting entry to the top, writing only the positions that change', () => {
		expect(placedPositions(entries, 'entry-fr', 0)).toEqual([
			{ id: 'entry-fr', position: 2 },
			{ id: 'entry-gh', position: 3 },
			{ id: 'entry-jp', position: 4 }
		]);
		expect(placedPositions(entries, 'entry-gh', 0)).toEqual([]);
	});

	it('takes a place past the end as last', () => {
		expect(placedPositions(entries, 'entry-jp', 99)).toEqual([
			{ id: 'entry-fr', position: 3 },
			{ id: 'entry-jp', position: 4 }
		]);
	});

	it('gives entries that shared a position one each', () => {
		const sharing = [
			speaker('entry-gh', GHANA, 1, 'waiting'),
			speaker('entry-jp', JAPAN, 1, 'waiting')
		];

		expect(placedPositions(sharing, 'entry-jp', 0)).toEqual([{ id: 'entry-gh', position: 2 }]);
	});

	it('moves nothing for an entry that is not waiting', () => {
		expect(placedPositions(entries, 'spoken-fr', 0)).toEqual([]);
		expect(placedPositions(entries, 'entry-elsewhere', 0)).toEqual([]);
	});
});

describe('readQueueIndex', () => {
	it('reads a place counting from 1 into an index counting from 0', () => {
		expect(readQueueIndex('1')).toBe(0);
		expect(readQueueIndex(' 3 ')).toBe(2);
	});

	it('refuses anything that is not a whole place', () => {
		expect(readQueueIndex('0')).toBeNull();
		expect(readQueueIndex('-1')).toBeNull();
		expect(readQueueIndex('2.5')).toBeNull();
		expect(readQueueIndex('')).toBeNull();
		expect(readQueueIndex(null)).toBeNull();
	});
});
