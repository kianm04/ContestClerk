import { describe, expect, it, vi } from 'vitest';
import type { RoomSeat } from '$lib/committee-room';
import { createInstantForm, type InstantPress } from '$lib/instant-form.svelte';
import {
	attendanceAfterPresses,
	describeRollCallFailure,
	hasRollCallAfterPresses,
	latestAttendanceAfterPresses,
	sharedRollCallForm,
	shareRollCallForm
} from './roll-call-preview';

// Svelte's context only exists while a component is being set up, so these
// tests keep it in a plain map instead, which is all the two functions rely on.
const fakeContext = vi.hoisted(() => new Map<unknown, unknown>());
vi.mock('svelte', () => ({
	setContext: (key: unknown, value: unknown) => fakeContext.set(key, value),
	getContext: (key: unknown) => fakeContext.get(key)
}));
// The instant form reads SvelteKit's browser modules, which only work inside a running app.
vi.mock('$app/forms', () => ({ applyAction: vi.fn(async () => undefined) }));
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(async () => undefined) }));
vi.mock('$app/state', () => ({ navigating: { complete: null } }));

/** The roll call the presses below are made on. */
const ROLL_CALL_ID = 'roll-call-1';

/** A press on the Roll call page, as the instant form keeps it. */
function rollCallPress(action: string, fields: Record<string, string>, id = 1): InstantPress {
	const formData = new FormData();
	formData.set('rollCallId', ROLL_CALL_ID);
	for (const [name, value] of Object.entries(fields)) formData.set(name, value);

	return { id, formData, action: new URL(action, 'http://localhost/roll-call'), expected: null };
}

describe('attendanceAfterPresses', () => {
	it('applies the presses in the order made, so the last one wins', () => {
		const presses = [
			rollCallPress('?/setStatus', { seatId: 'france', status: 'present' }, 1),
			rollCallPress('?/setStatus', { seatId: 'ghana', status: 'present_and_voting' }, 2),
			rollCallPress('?/setStatus', { seatId: 'france', status: 'absent' }, 3)
		];

		expect(
			attendanceAfterPresses({ france: 'absent', ghana: 'absent' }, ROLL_CALL_ID, presses)
		).toEqual({ france: 'absent', ghana: 'present_and_voting' });
	});

	it('marks only absent seats present, and adds no seat, like the server', () => {
		const presses = [rollCallPress('?/markAllPresent', {})];

		expect(
			attendanceAfterPresses(
				{ france: 'absent', ghana: 'present_and_voting' },
				ROLL_CALL_ID,
				presses
			)
		).toEqual({ france: 'present', ghana: 'present_and_voting' });
	});

	it('leaves out presses on another roll call and the "Finish" press', () => {
		const other = rollCallPress('?/setStatus', { seatId: 'france', status: 'present' });
		other.formData.set('rollCallId', 'roll-call-2');
		const finish = rollCallPress('?/finish', {});

		expect(attendanceAfterPresses({ france: 'absent' }, ROLL_CALL_ID, [other, finish])).toEqual({
			france: 'absent'
		});
		expect(attendanceAfterPresses({ france: 'absent' }, null, [other])).toEqual({
			france: 'absent'
		});
	});
});

/** A press on the Room page's opening card, which names no roll call (R2). */
function openingPress(action: string, fields: Record<string, string>, id = 1): InstantPress {
	const press = rollCallPress(action, fields, id);
	press.formData.delete('rollCallId');

	return press;
}

describe('presses that name no roll call (T160, R2)', () => {
	const franceOpening = openingPress('?/setStatus', { seatId: 'france', status: 'present' });

	it('land on the session’s latest roll call, and on no earlier one', () => {
		expect(
			attendanceAfterPresses({ france: 'absent' }, ROLL_CALL_ID, [franceOpening], true)
		).toEqual({ france: 'present' });
		expect(attendanceAfterPresses({ france: 'absent' }, ROLL_CALL_ID, [franceOpening])).toEqual({
			france: 'absent'
		});
	});

	it('mean the session will have a roll call, and nothing else does', () => {
		const finish = rollCallPress('?/finish', {});

		expect(hasRollCallAfterPresses(null, [])).toBe(false);
		expect(hasRollCallAfterPresses(null, [finish])).toBe(false);
		expect(hasRollCallAfterPresses(null, [franceOpening])).toBe(true);
		expect(hasRollCallAfterPresses(ROLL_CALL_ID, [])).toBe(true);
	});

	it('start the first roll call from every seat absent, as the server makes it', () => {
		const seatIds = ['france', 'ghana', 'japan'];

		expect(latestAttendanceAfterPresses({}, null, [], seatIds)).toBeNull();
		expect(latestAttendanceAfterPresses({}, null, [franceOpening], seatIds)).toEqual({
			france: 'present',
			ghana: 'absent',
			japan: 'absent'
		});
		expect(
			latestAttendanceAfterPresses({}, null, [openingPress('?/markAllPresent', {})], seatIds)
		).toEqual({ france: 'present', ghana: 'present', japan: 'present' });
	});

	it('add to the latest roll call once there is one', () => {
		const ghanaOpening = openingPress('?/setStatus', { seatId: 'ghana', status: 'present' });

		expect(
			latestAttendanceAfterPresses(
				{ france: 'present', ghana: 'absent' },
				ROLL_CALL_ID,
				[ghanaOpening],
				['france', 'ghana']
			)
		).toEqual({ france: 'present', ghana: 'present' });
	});
});

describe('describeRollCallFailure', () => {
	const seats = [{ id: 'france', name: 'France' }] as RoomSeat[];

	it('names the seat and the answer that did not happen', () => {
		const press = rollCallPress('?/setStatus', { seatId: 'france', status: 'present' });

		expect(describeRollCallFailure(press, seats)).toBe('France was not marked present.');
	});

	it('names "Mark all present" and "Finish" too', () => {
		expect(describeRollCallFailure(rollCallPress('?/markAllPresent', {}), seats)).toBe(
			'The seats were not marked present.'
		);
		expect(describeRollCallFailure(rollCallPress('?/finish', {}), seats)).toBe(
			'The roll call was not finished.'
		);
	});
});

describe('shareRollCallForm and sharedRollCallForm', () => {
	it('gives a page the very form the layout shared', () => {
		const form = createInstantForm({ describeFailure: () => 'Not marked.' });

		shareRollCallForm(form);

		expect(sharedRollCallForm()).toBe(form);
	});

	it('gives a component outside the chair pages an empty form of its own', () => {
		fakeContext.clear();

		expect(sharedRollCallForm().presses).toEqual([]);
	});
});
