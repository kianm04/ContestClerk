import { describe, expect, it } from 'vitest';
import { CLOCK_REFUSAL_EXPLANATION } from '../../src/lib/database-errors';
import {
	ATTRIBUTION_GRACE_MS,
	describeClockRefusals,
	findClockRefusals,
	testsRunningAt,
	type TestAttempt
} from './app-log';

// Reading the app log that `record-app-log.mjs` writes during a browser run.
// Everything here is text and dates, so the tests write the log themselves in
// the shape the recorder writes it: a time, one space, and the line the server
// printed. `clock-refusal-reporter.harness.test.ts` checks the real recorder
// and this reader agree. See specs/02-architecture/testing.md.

/** A line of the app log as `record-app-log.mjs` writes it. */
function logLine(at: string, text: string): string {
	return `${at} ${text}`;
}

/** An attempt at a test that ran between two times. */
function attempt(name: string, startedAt: string, endedAt: string): TestAttempt {
	return { name, startedAt: new Date(startedAt), endedAt: new Date(endedAt) };
}

describe('findClockRefusals', () => {
	it('finds nothing in a log without the refusal', () => {
		const appLog = [
			logLine('2026-09-25T10:00:00.000Z', '  ➜  Local:   http://localhost:4173/'),
			logLine('2026-09-25T10:00:05.000Z', 'Unexpected error while serving /home Error: boom')
		].join('\n');

		expect(findClockRefusals(appLog)).toEqual([]);
	});

	it('finds a planted refusal with its time and the address being served', () => {
		const appLog = [
			logLine('2026-09-25T10:00:00.000Z', '  ➜  Local:   http://localhost:4173/'),
			logLine('2026-09-25T10:00:05.000Z', CLOCK_REFUSAL_EXPLANATION),
			logLine('2026-09-25T10:00:05.001Z', 'Unexpected error while serving /home Error: …')
		].join('\n');

		expect(findClockRefusals(appLog)).toEqual([
			{ loggedAt: new Date('2026-09-25T10:00:05.000Z'), pathname: '/home' }
		]);
	});

	it('finds every refusal when there are several', () => {
		const appLog = [
			logLine('2026-09-25T10:00:05.000Z', CLOCK_REFUSAL_EXPLANATION),
			logLine('2026-09-25T10:00:06.000Z', CLOCK_REFUSAL_EXPLANATION)
		].join('\n');

		expect(findClockRefusals(appLog)).toHaveLength(2);
	});

	it('still finds a refusal on a line with no readable time', () => {
		// Pinning it on a test is impossible then, but the run must still fail.
		expect(findClockRefusals(CLOCK_REFUSAL_EXPLANATION)).toEqual([
			{ loggedAt: null, pathname: null }
		]);
	});
});

describe('testsRunningAt', () => {
	const attempts = [
		attempt('desktop › home.spec.ts › early', '2026-09-25T10:00:00Z', '2026-09-25T10:00:02Z'),
		attempt('phone › home.spec.ts › around', '2026-09-25T10:00:04Z', '2026-09-25T10:00:08Z'),
		attempt('desktop › apply.spec.ts › around', '2026-09-25T10:00:03.500Z', '2026-09-25T10:00:06Z')
	];

	it('names every attempt that was running at that moment', () => {
		expect(testsRunningAt(new Date('2026-09-25T10:00:05Z'), attempts)).toEqual([
			'phone › home.spec.ts › around',
			'desktop › apply.spec.ts › around'
		]);
	});

	it('names an attempt that ended just before the line arrived', () => {
		const justAfterTheEarlyOne = new Date(
			new Date('2026-09-25T10:00:02Z').getTime() + ATTRIBUTION_GRACE_MS
		);

		expect(testsRunningAt(justAfterTheEarlyOne, attempts)).toEqual([
			'desktop › home.spec.ts › early'
		]);
	});

	it('names nobody when no test was running', () => {
		expect(testsRunningAt(new Date('2026-09-25T11:00:00Z'), attempts)).toEqual([]);
	});
});

describe('describeClockRefusals', () => {
	it('names the tests, the address, the log file and the explanation', () => {
		const refusals = [{ loggedAt: new Date('2026-09-25T10:00:05Z'), pathname: '/home' }];
		const attempts = [
			attempt('phone › home.spec.ts › around', '2026-09-25T10:00:04Z', '2026-09-25T10:00:08Z')
		];

		const message = describeClockRefusals(refusals, attempts, '/tmp/app.log');

		expect(message).toContain('logged the clock refusal once');
		expect(message).toContain('while serving /home');
		expect(message).toContain('phone › home.spec.ts › around');
		expect(message).toContain('/tmp/app.log');
		expect(message).toContain(CLOCK_REFUSAL_EXPLANATION);
	});

	it('says so when no test can be named', () => {
		const refusals = [
			{ loggedAt: null, pathname: null },
			{ loggedAt: new Date('2026-09-25T12:00:00Z'), pathname: null }
		];

		const message = describeClockRefusals(refusals, [], '/tmp/app.log');

		expect(message).toContain('2 times');
		expect(message).toContain('with no time on the line, so no test can be named');
		expect(message).toContain('while no test was running');
	});
});
