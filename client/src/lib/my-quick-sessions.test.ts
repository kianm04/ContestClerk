import { describe, expect, it } from 'vitest';
import {
	isQuickSession,
	isQuickSessionInProgress,
	quickSessionStatusLine,
	toMyQuickSessions,
	type QuickSessionSource
} from './my-quick-sessions';

/** A quick session that has never run, which a test changes as it needs. */
function source(overrides: Partial<QuickSessionSource> = {}): QuickSessionSource {
	return {
		committeeId: 'committee-thursday',
		committeeName: 'Thursday practice',
		committeeSlug: 'thursday-practice',
		conferenceSlug: 'quick-ab12cd34ef',
		timezone: 'Europe/Amsterdam',
		committeeCreatedAt: '2026-09-20T18:00:00Z',
		latestSession: null,
		...overrides
	};
}

describe('isQuickSession', () => {
	it('is true for a quick session and false for a conference', () => {
		expect(isQuickSession({ kind: 'quick_session' })).toBe(true);
		expect(isQuickSession({ kind: 'conference' })).toBe(false);
	});

	it('counts a conference read without its kind as an ordinary one', () => {
		expect(isQuickSession({})).toBe(false);
		expect(isQuickSession({ kind: null })).toBe(false);
	});
});

describe('isQuickSessionInProgress', () => {
	it('is true only for a session that is in progress and has started', () => {
		expect(
			isQuickSessionInProgress({
				name: 'Session 2',
				status: 'in_progress',
				startedAt: '2026-10-01T17:00:00Z'
			})
		).toBe(true);
		expect(
			isQuickSessionInProgress({
				name: 'Session 1',
				status: 'ended',
				startedAt: '2026-09-24T17:00:00Z'
			})
		).toBe(false);
		// A row marked in progress that never started is not running; the line says "No session yet" too.
		expect(
			isQuickSessionInProgress({ name: 'Session 1', status: 'in_progress', startedAt: null })
		).toBe(false);
		expect(isQuickSessionInProgress(null)).toBe(false);
	});
});

describe('quickSessionStatusLine', () => {
	it('names the session in progress', () => {
		const latest = {
			name: 'Session 2',
			status: 'in_progress' as const,
			startedAt: '2026-10-01T17:00:00Z'
		};

		expect(quickSessionStatusLine(latest, 'Europe/Amsterdam')).toBe('Session 2 in progress');
	});

	it('gives the day the last session started, in the quick session’s own timezone', () => {
		// 23:30 in London on 13 October is already the 14th in Tokyo. (Intl writes
		// September "Sept" in British English, as everywhere else in the app.)
		const latest = {
			name: 'Session 1',
			status: 'ended' as const,
			startedAt: '2026-10-13T22:30:00Z'
		};

		expect(quickSessionStatusLine(latest, 'Europe/London')).toBe('Last session 13 Oct 2026');
		expect(quickSessionStatusLine(latest, 'Asia/Tokyo')).toBe('Last session 14 Oct 2026');
	});

	it('says no session yet before the first, or for one that never started', () => {
		expect(quickSessionStatusLine(null, 'UTC')).toBe('No session yet');
		expect(
			quickSessionStatusLine({ name: 'Session 1', status: 'scheduled', startedAt: null }, 'UTC')
		).toBe('No session yet');
	});
});

describe('toMyQuickSessions', () => {
	it('puts the most recently used first: by the newest session, else by when it was made', () => {
		const rows = toMyQuickSessions([
			source({ committeeId: 'never-run', committeeCreatedAt: '2026-09-25T10:00:00Z' }),
			source({
				committeeId: 'ran-last-week',
				committeeCreatedAt: '2026-09-01T10:00:00Z',
				latestSession: { name: 'Session 3', status: 'ended', startedAt: '2026-09-24T17:00:00Z' }
			}),
			source({
				committeeId: 'running-now',
				committeeCreatedAt: '2026-08-01T10:00:00Z',
				latestSession: {
					name: 'Session 9',
					status: 'in_progress',
					startedAt: '2026-10-01T17:00:00Z'
				}
			})
		]);

		expect(rows.map((row) => row.committeeId)).toEqual([
			'running-now',
			'never-run',
			'ran-last-week'
		]);
	});

	it('flags the one with a session running, and no other', () => {
		const rows = toMyQuickSessions([
			source({ committeeId: 'never-run' }),
			source({
				committeeId: 'ran-last-week',
				latestSession: { name: 'Session 3', status: 'ended', startedAt: '2026-09-24T17:00:00Z' }
			}),
			source({
				committeeId: 'running-now',
				latestSession: {
					name: 'Session 9',
					status: 'in_progress',
					startedAt: '2026-10-01T17:00:00Z'
				}
			})
		]);

		// The flag and the line come from the same question, so they agree on every row.
		expect(rows.map((row) => [row.committeeId, row.isInProgress, row.statusLine])).toEqual([
			['running-now', true, 'Session 9 in progress'],
			['ran-last-week', false, 'Last session 24 Sept 2026'],
			['never-run', false, 'No session yet']
		]);
	});

	it('links each row to its chair room and words its line', () => {
		const [row] = toMyQuickSessions([source()]);

		expect(row).toEqual({
			committeeId: 'committee-thursday',
			committeeName: 'Thursday practice',
			statusLine: 'No session yet',
			isInProgress: false,
			href: '/conferences/quick-ab12cd34ef/committees/thursday-practice/chair'
		});
	});
});
