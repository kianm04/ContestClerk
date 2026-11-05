import { describe, expect, it } from 'vitest';
import { keyToAction } from './roll-call-keys';

describe('keyToAction', () => {
	it('moves between seats with the arrow keys', () => {
		expect(keyToAction('ArrowDown')).toEqual({ kind: 'move', direction: 'next' });
		expect(keyToAction('ArrowUp')).toEqual({ kind: 'move', direction: 'previous' });
	});

	it('marks the seat with A, P and V, in either case', () => {
		expect(keyToAction('a')).toEqual({ kind: 'mark', status: 'absent' });
		expect(keyToAction('P')).toEqual({ kind: 'mark', status: 'present' });
		expect(keyToAction('v')).toEqual({ kind: 'mark', status: 'present_and_voting' });
	});

	it('leaves every other key alone, so Tab and Enter keep working', () => {
		expect(keyToAction('Tab')).toBeNull();
		expect(keyToAction('Enter')).toBeNull();
		expect(keyToAction('ArrowLeft')).toBeNull();
		expect(keyToAction('x')).toBeNull();
	});
});
