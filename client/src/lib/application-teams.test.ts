import { describe, expect, it } from 'vitest';
import type { AllocatableSeat, SeatGroup } from '$lib/allocation';
import {
	assignTeamSeats,
	isOpenMember,
	openTeammateIds,
	joinWithAnd,
	normaliseTeamCode,
	teamAcceptedFlash,
	teamCountryOptions,
	teamRefusal
} from './application-teams';

/** A free seat for `countryCode` in `committeeId`. */
function freeSeat(committeeId: string, name: string, countryCode: string): AllocatableSeat {
	return {
		id: `${committeeId}-${countryCode}`,
		committeeId,
		name,
		countryCode,
		isAvailable: true,
		delegationId: null,
		userId: null
	};
}

/** Kenya free in DISEC and HRC, Japan free in HRC only. */
const SEAT_GROUPS: SeatGroup[] = [
	{
		committeeId: 'disec',
		committeeLabel: 'DISEC',
		seats: [freeSeat('disec', 'Kenya', 'KE')]
	},
	{
		committeeId: 'hrc',
		committeeLabel: 'HRC',
		seats: [freeSeat('hrc', 'Kenya', 'KE'), freeSeat('hrc', 'Japan', 'JP')]
	}
];

describe('teamCountryOptions', () => {
	it('offers only the countries free in a committee for every member', () => {
		expect(teamCountryOptions(SEAT_GROUPS, 2)).toEqual([
			{ value: 'KE', label: 'Kenya (2 committees free)' }
		]);
	});

	it('offers every country to a team of one, by name', () => {
		expect(teamCountryOptions(SEAT_GROUPS, 1).map((option) => option.value)).toEqual(['JP', 'KE']);
	});
});

describe('assignTeamSeats', () => {
	it('gives each member their own committee, the one they asked for first', () => {
		const choices = assignTeamSeats(
			SEAT_GROUPS,
			[
				{ applicationId: 'umarbek', committeePreferences: ['hrc'] },
				{ applicationId: 'kian', committeePreferences: ['hrc', 'disec'] }
			],
			'KE'
		);

		expect(choices?.map((choice) => [choice.applicationId, choice.seat.id])).toEqual([
			['umarbek', 'hrc-KE'],
			['kian', 'disec-KE']
		]);
	});

	it('answers null when the country is free in too few committees', () => {
		const members = [
			{ applicationId: 'umarbek', committeePreferences: [] },
			{ applicationId: 'kian', committeePreferences: [] }
		];

		expect(assignTeamSeats(SEAT_GROUPS, members, 'JP')).toBeNull();
	});
});

describe('openTeammateIds', () => {
	it('names the teammates still undecided, never the application itself', () => {
		const members = [
			{ applicationId: 'umarbek', status: 'submitted' as const },
			{ applicationId: 'kian', status: 'waitlisted' as const },
			{ applicationId: 'amara', status: 'accepted' as const },
			{ applicationId: 'ben', status: 'draft' as const }
		].map((member) => ({ ...member, userId: '', fullName: '', committeePreferences: [] }));

		expect(members.filter(isOpenMember).map((member) => member.applicationId)).toEqual([
			'umarbek',
			'kian'
		]);
		expect(openTeammateIds(members, 'umarbek')).toEqual(['kian']);
	});
});

describe('the words', () => {
	it('reads a code as the database stores it', () => {
		expect(normaliseTeamCode('  ab3k9q ')).toBe('AB3K9Q');
	});

	it('passes on the database’s own refusals and nobody else’s', () => {
		expect(teamRefusal('You are already in this team')).toBe('You are already in this team.');
		expect(teamRefusal('permission denied for table application_teams')).toBeNull();
	});

	it('joins names the way a sentence does', () => {
		expect(joinWithAnd(['A'])).toBe('A');
		expect(joinWithAnd(['A', 'B', 'C'])).toBe('A, B and C');
	});

	it('names everybody and every committee after accepting a team', () => {
		const choices = assignTeamSeats(
			SEAT_GROUPS,
			[
				{ applicationId: 'umarbek', committeePreferences: ['disec'] },
				{ applicationId: 'kian', committeePreferences: [] }
			],
			'KE'
		);
		const names = new Map([
			['umarbek', 'Umarbek Ismoilov'],
			['kian', 'Kian Matton']
		]);

		expect(teamAcceptedFlash(choices ?? [], names)).toBe(
			'Umarbek Ismoilov and Kian Matton are now Kenya in DISEC and HRC.'
		);
	});
});
