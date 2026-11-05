/**
 * The roll call's keyboard shortcuts, as a plain map from a key to what it does.
 *
 * `specs/05-pages/chair/roll-call.md`: with JavaScript, arrow down and arrow up
 * move between seats, and A, P and V press the seat's Absent, Present, or
 * Present and voting button. The seat list's `onkeydown` handler asks this
 * file what a key means and then does it; keeping the map here means it can be
 * read and tested without a browser.
 */

import type { AttendanceStatus } from '$lib/committee-room';

/** What one key asks for: move to another seat, or mark the focused one. */
export type RollCallKeyAction =
	{ kind: 'move'; direction: 'next' | 'previous' } | { kind: 'mark'; status: AttendanceStatus };

/** The letter keys, lower case, and the answer each one presses. */
const MARK_KEYS: Record<string, AttendanceStatus> = {
	a: 'absent',
	p: 'present',
	v: 'present_and_voting'
};

/**
 * What a key does in the roll call, or null for every other key.
 *
 * `key` is `KeyboardEvent.key`, which is "a" or "A" depending on Shift and
 * Caps Lock; both mean the same here.
 */
export function keyToAction(key: string): RollCallKeyAction | null {
	if (key === 'ArrowDown') return { kind: 'move', direction: 'next' };
	if (key === 'ArrowUp') return { kind: 'move', direction: 'previous' };

	const status = MARK_KEYS[key.toLowerCase()];

	return status ? { kind: 'mark', status } : null;
}
