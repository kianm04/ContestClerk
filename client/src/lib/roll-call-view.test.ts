import { describe, expect, it } from 'vitest';
import type { RoomSeat } from './committee-room';
import type { InstantPress } from './instant-form.svelte';
import {
	alphabeticalSeats,
	quorumLineText,
	rollCallAnswerClasses,
	rollCallView,
	type RollCallViewData
} from './roll-call-view';

const SEATS: RoomSeat[] = [
	{ id: 'seat-us', name: 'United States', countryCode: 'US' },
	{ id: 'seat-br', name: 'Brazil', countryCode: 'BR' },
	{ id: 'seat-fr', name: 'France', countryCode: 'FR' },
	{ id: 'seat-cn', name: 'China', countryCode: 'CN' }
];

/** The view's data on a session with a roll call, `roll-2` the latest. */
function dataWith(overrides: Partial<RollCallViewData> = {}): RollCallViewData {
	return {
		conference: { slug: 'thimun', timezone: 'Europe/Amsterdam' },
		committee: { slug: 'unsc' },
		seats: SEATS,
		latestRollCallId: 'roll-2',
		rollCalls: [
			{ id: 'roll-2', takenAt: '2026-02-14T10:05:00Z', takenByName: null, presentCount: 2 },
			{ id: 'roll-1', takenAt: '2026-02-14T09:02:00Z', takenByName: null, presentCount: 1 }
		],
		rollCall: {
			id: 'roll-2',
			attendance: { 'seat-us': 'present_and_voting', 'seat-br': 'present' }
		},
		from: 'gsl',
		...overrides
	};
}

/** A press of the roll call's instant form, as `setStatus` or `markAllPresent` sends it. */
function press(action: string, fields: Record<string, string>): InstantPress {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) formData.set(name, value);

	return {
		id: 1,
		formData,
		action: new URL(`http://localhost/roll-call${action}`),
		expected: null
	};
}

describe('alphabeticalSeats', () => {
	it('lists the seats by name, the way a chair calls the roll, without changing the list given', () => {
		const sorted = alphabeticalSeats(SEATS);

		expect(sorted.map((seat) => seat.name)).toEqual(['Brazil', 'China', 'France', 'United States']);
		expect(SEATS[0].name).toBe('United States');
	});
});

describe('rollCallView', () => {
	it('counts the answers, the quorum and the majority, every unanswered seat absent', () => {
		const view = rollCallView(dataWith(), []);

		expect(view.marks).toEqual({
			'seat-us': 'present_and_voting',
			'seat-br': 'present',
			'seat-fr': 'absent',
			'seat-cn': 'absent'
		});
		expect(view.counts).toEqual({ presentCount: 1, presentAndVotingCount: 1, absentCount: 2 });
		expect(view).toMatchObject({
			quorumNeeded: 2,
			hasQuorum: true,
			majority: 2,
			hasAnyonePresent: true,
			rollCallId: 'roll-2'
		});
	});

	it('lays the presses on their way on top, so each answer shows at once', () => {
		const presses = [
			press('?/setStatus', { rollCallId: 'roll-2', seatId: 'seat-fr', status: 'present' })
		];

		expect(rollCallView(dataWith(), presses).marks['seat-fr']).toBe('present');
	});

	it('draws every seat absent before the first roll call, and the first press makes one', () => {
		const before = rollCallView(
			dataWith({ rollCall: null, latestRollCallId: null, rollCalls: [] }),
			[]
		);

		expect(before.rollCallId).toBeNull();
		expect(before.hasAnyonePresent).toBe(false);
		expect(Object.values(before.marks)).toEqual(['absent', 'absent', 'absent', 'absent']);

		const firstPress = [press('?/markAllPresent', {})];
		const after = rollCallView(
			dataWith({ rollCall: null, latestRollCallId: null, rollCalls: [] }),
			firstPress
		);

		expect(after.counts.presentCount).toBe(4);
	});

	it('links the earlier roll calls, keeping the page the view was opened from', () => {
		expect(rollCallView(dataWith(), []).earlier).toEqual([
			{
				id: 'roll-1',
				label: '10:02 (1 present)',
				href: '/conferences/thimun/committees/unsc/chair/roll-call?rollCall=roll-1&from=gsl'
			}
		]);
	});
});

describe('quorumLineText', () => {
	it('reads "met · majority" once quorum is met, and what is still needed before', () => {
		const counts = { presentCount: 1, presentAndVotingCount: 0, absentCount: 5 };

		expect(quorumLineText({ quorumNeeded: 3, hasQuorum: true, majority: 4, counts })).toBe(
			'Quorum 3 · met · majority 4'
		);
		expect(quorumLineText({ quorumNeeded: 3, hasQuorum: false, majority: 1, counts })).toBe(
			'Quorum 3 · 2 more needed'
		);
	});
});

describe('rollCallAnswerClasses', () => {
	it('fills a chosen "Present" in light blue with its line, and a chosen "Absent" in grey', () => {
		expect(rollCallAnswerClasses('present', true)).toContain('bg-brand-100');
		expect(rollCallAnswerClasses('present', true)).toContain('border-brand-500');
		expect(rollCallAnswerClasses('present_and_voting', true)).toContain('text-brand-900');
		expect(rollCallAnswerClasses('absent', true)).toContain('bg-neutral-100');
		expect(rollCallAnswerClasses('absent', false)).toContain('bg-surface');
	});

	it('never uses a warning or danger colour (P4)', () => {
		for (const answer of ['absent', 'present', 'present_and_voting'] as const) {
			for (const isChosen of [true, false]) {
				expect(rollCallAnswerClasses(answer, isChosen)).not.toMatch(/warning|danger/);
			}
		}
	});
});
