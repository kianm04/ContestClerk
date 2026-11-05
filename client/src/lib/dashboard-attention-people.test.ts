import { describe, expect, it } from 'vitest';
import { QUIET_ATTENTION_FACTS, SAMPLE_COMMITTEE } from './dashboard-attention-samples';
import {
	absenteeLines,
	cameInText,
	delegationRequestLines,
	shortDelegationLines,
	waitingApplicationLines
} from './dashboard-attention-people';
import type { DashboardRoom } from './dashboard-rooms';
import type { DelegationRequest } from './dashboard-waiting';

/** Harbour View College asked for three seats; Andrew Blake heads it. */
const HARBOUR_VIEW: DelegationRequest = {
	id: 'harbour-id',
	name: 'Harbour View',
	institutionName: 'Harbour View College',
	requestedSeats: 3,
	headNames: ['Andrew Blake']
};

/** DISEC, sitting, with the given delegates marked absent at 11:02 London time. */
function sittingRoom(absentNames: string[]): DashboardRoom {
	return {
		committeeId: 'disec-id',
		committeeSlug: 'disec',
		committeeName: 'DISEC',
		session: { name: 'Session 2', mode: 'formal_debate' },
		presentCount: 1,
		lastSession: null,
		seatedCount: 5,
		absentees: absentNames.map((fullName, index) => ({
			fullName,
			seatName: `Seat ${index + 1}`,
			markedAt: '2026-10-02T10:02:00Z'
		}))
	};
}

describe('cameInText', () => {
	/** The dashboard's moment, 2 October 2026, and the conference's own timezone. */
	const NOW = QUIET_ATTENTION_FACTS.now;
	const TIMEZONE = QUIET_ATTENTION_FACTS.conference.timezone;

	it('counts back from now while the moment is less than a week old', () => {
		expect(cameInText('2026-09-26T10:00:00Z', NOW, TIMEZONE)).toBe('came in 6 days ago');
	});

	it('says "just now" for a moment within the minute', () => {
		expect(cameInText(NOW.toISOString(), NOW, TIMEZONE)).toBe('came in just now');
	});

	it('names the day once the moment is a week old', () => {
		expect(cameInText('2026-08-30T10:00:00Z', NOW, TIMEZONE)).toBe('came in on 30 Aug 2026');
	});
});

describe('waitingApplicationLines', () => {
	it('counts the applications waiting and says how long the oldest has waited', () => {
		const facts = {
			...QUIET_ATTENTION_FACTS,
			stats: { ...QUIET_ATTENTION_FACTS.stats, applicationsToReview: 4 },
			waiting: { ...QUIET_ATTENTION_FACTS.waiting, oldestApplicationAt: '2026-09-26T10:00:00Z' }
		};

		expect(waitingApplicationLines(facts)).toEqual([
			{
				key: 'applications',
				title: '4 applications are waiting for a decision',
				detail: 'The oldest came in 6 days ago.',
				actionLabel: 'Review applications',
				href: '/manage/northbridge/applications'
			}
		]);
	});

	it('speaks of one application in the singular, and gives a date once it is a week old', () => {
		const facts = {
			...QUIET_ATTENTION_FACTS,
			stats: { ...QUIET_ATTENTION_FACTS.stats, applicationsToReview: 1 },
			waiting: { ...QUIET_ATTENTION_FACTS.waiting, oldestApplicationAt: '2026-09-01T10:00:00Z' }
		};
		const [line] = waitingApplicationLines(facts);

		expect(line.title).toBe('1 application is waiting for a decision');
		expect(line.detail).toBe('It came in on 1 Sept 2026.');
	});

	it('draws nothing while no application waits', () => {
		expect(waitingApplicationLines(QUIET_ATTENTION_FACTS)).toEqual([]);
	});
});

describe('delegationRequestLines', () => {
	it('names one request, who sent it, and opens it', () => {
		const waiting = { ...QUIET_ATTENTION_FACTS.waiting, delegationRequests: [HARBOUR_VIEW] };

		expect(delegationRequestLines({ ...QUIET_ATTENTION_FACTS, waiting })).toEqual([
			{
				key: 'delegation-request',
				title: 'Harbour View College asked for 3 seats',
				detail: 'A delegation request from Andrew Blake.',
				actionLabel: 'Open request',
				href: '/manage/northbridge/delegations/harbour-id'
			}
		]);
	});

	it('counts several requests and opens the list of them', () => {
		const second = {
			...HARBOUR_VIEW,
			id: 'riverside-id',
			institutionName: null,
			name: 'Riverside'
		};
		const waiting = {
			...QUIET_ATTENTION_FACTS.waiting,
			delegationRequests: [HARBOUR_VIEW, second]
		};
		const [line] = delegationRequestLines({ ...QUIET_ATTENTION_FACTS, waiting });

		expect(line.title).toBe('2 delegation requests are waiting');
		expect(line.detail).toBe('The oldest is from Harbour View College.');
		expect(line.href).toBe('/manage/northbridge/delegations');
	});
});

describe('shortDelegationLines', () => {
	it('says how many seats the delegation has and where one is free', () => {
		const allocation = {
			...QUIET_ATTENTION_FACTS.allocation,
			shortDelegations: [
				{ id: 'harbour-id', name: 'Harbour View', requestedSeats: 3, givenSeats: 2 }
			]
		};

		expect(shortDelegationLines({ ...QUIET_ATTENTION_FACTS, allocation })).toEqual([
			{
				key: 'short-delegation',
				title: 'Harbour View has 2 of its 3 seats',
				detail: '1 seat is still free in HRC.',
				actionLabel: 'Give them a seat',
				href: '/manage/northbridge/allocation?state=free'
			}
		]);
	});

	it('counts several delegations, and says when no seat is free at all', () => {
		const short = { id: 'a', name: 'A', requestedSeats: 3, givenSeats: 2 };
		const allocation = {
			...QUIET_ATTENTION_FACTS.allocation,
			shortDelegations: [short, { ...short, id: 'b' }]
		};
		const full = { ...SAMPLE_COMMITTEE, seatCounts: { ...SAMPLE_COMMITTEE.seatCounts, filled: 3 } };
		const [line] = shortDelegationLines({
			...QUIET_ATTENTION_FACTS,
			allocation,
			committees: [full]
		});

		expect(line.title).toBe('2 delegations are short of seats');
		expect(line.detail).toBe('No seat is free: add seats to a committee first.');
	});
});

describe('absenteeLines', () => {
	it('names each absent delegate, the room, the seat and when the roll call was', () => {
		const rooms = [sittingRoom(['Zoe Adams'])];

		expect(absenteeLines({ ...QUIET_ATTENTION_FACTS, rooms })).toEqual([
			{
				key: 'absent-DISEC-Seat 1',
				title: 'Zoe Adams is marked absent',
				detail: 'DISEC · Seat 1 · since roll call at 11:02',
				actionLabel: 'Participants',
				href: '/manage/northbridge/participants?q=Zoe+Adams'
			}
		]);
	});

	it('counts them on one line once there are more than three', () => {
		const rooms = [sittingRoom(['A', 'B', 'C', 'D'])];
		const lines = absenteeLines({ ...QUIET_ATTENTION_FACTS, rooms });

		expect(lines).toHaveLength(1);
		expect(lines[0].title).toBe('4 delegates are marked absent');
		expect(lines[0].detail).toBe('In DISEC, at the latest roll call.');
	});
});
