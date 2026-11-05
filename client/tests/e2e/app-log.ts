import { CLOCK_REFUSAL_EXPLANATION } from '../../src/lib/database-errors';

/**
 * Reading the app log `record-app-log.mjs` writes during a browser run, for the
 * one sentence in it that has to fail the run: `CLOCK_REFUSAL_EXPLANATION`,
 * which `handleError` in `src/hooks.server.ts` logs when the database refuses
 * an access token issued in its own future.
 *
 * `clock-refusal-reporter.ts` does the talking to Playwright. Everything here is
 * plain text and dates in, plain values out, so `app-log.harness.test.ts` can
 * check it without a browser or a server. See specs/02-architecture/testing.md.
 */

/**
 * How far past the end of a test a refusal still counts as possibly its own.
 * The server writes the line while it answers the test's request, but the line
 * reaches the log through a pipe, and a test that fails on the 500 page can end
 * a moment before it lands.
 */
export const ATTRIBUTION_GRACE_MS = 1_000;

/** One refusal found in the app log. */
export type ClockRefusal = {
	/** When the line arrived, or null when it carried no readable stamp. */
	loggedAt: Date | null;
	/** The address the server was answering, when the next line names it. */
	pathname: string | null;
};

/** One attempt at one test, as Playwright reported it. A retry is an attempt of its own. */
export type TestAttempt = {
	/** Project, file and title, for example `desktop › home.spec.ts › shows the dashboard`. */
	name: string;
	startedAt: Date;
	endedAt: Date;
};

/** `handleError` logs this, with the address, on the line after the explanation. */
const SERVING_LINE = /Unexpected error while serving (\S+)/;

/**
 * Splits one line of the log into its stamp and its text. A line with no
 * readable stamp keeps all of its text and a null time, so a refusal that
 * somehow arrived unstamped still fails the run; it just cannot be pinned on
 * a test.
 */
function readLogLine(line: string): { loggedAt: Date | null; text: string } {
	const firstSpace = line.indexOf(' ');
	const stamp = new Date(line.slice(0, firstSpace));

	if (firstSpace === -1 || Number.isNaN(stamp.getTime())) {
		return { loggedAt: null, text: line };
	}

	return { loggedAt: stamp, text: line.slice(firstSpace + 1) };
}

/**
 * Every clock refusal in the text of an app log, in the order they were logged.
 * An empty list means the run never met one.
 */
export function findClockRefusals(appLog: string): ClockRefusal[] {
	const lines = appLog.split('\n').map(readLogLine);
	const refusals: ClockRefusal[] = [];

	lines.forEach((line, index) => {
		if (!line.text.includes(CLOCK_REFUSAL_EXPLANATION)) {
			return;
		}

		const nextLine = lines[index + 1]?.text ?? '';
		const serving = SERVING_LINE.exec(nextLine);

		refusals.push({ loggedAt: line.loggedAt, pathname: serving ? serving[1] : null });
	});

	return refusals;
}

/**
 * The names of the test attempts that were running when a line was logged.
 * The three projects share one server and run side by side, so this can be
 * several tests rather than one; it cannot tell which of them made the request.
 */
export function testsRunningAt(loggedAt: Date, attempts: TestAttempt[]): string[] {
	const moment = loggedAt.getTime();

	return attempts
		.filter(
			(attempt) =>
				attempt.startedAt.getTime() <= moment &&
				moment <= attempt.endedAt.getTime() + ATTRIBUTION_GRACE_MS
		)
		.map((attempt) => attempt.name);
}

/** One refusal, described for the person reading the end of a failed run. */
function describeOneRefusal(refusal: ClockRefusal, attempts: TestAttempt[]): string {
	const where = refusal.pathname ? ` while serving ${refusal.pathname}` : '';

	if (refusal.loggedAt === null) {
		return `- logged${where}, with no time on the line, so no test can be named`;
	}

	const when = refusal.loggedAt.toISOString();
	const suspects = testsRunningAt(refusal.loggedAt, attempts);

	if (suspects.length === 0) {
		return `- logged at ${when}${where}, while no test was running`;
	}

	const names = suspects.map((name) => `    ${name}`).join('\n');

	return `- logged at ${when}${where}, while these tests were running:\n${names}`;
}

/**
 * The message that fails a run whose app log carries the refusal: how many
 * times it was logged, which tests were running each time, where the whole log
 * is, and the explanation itself, so the reader is told it is the clock.
 */
export function describeClockRefusals(
	refusals: ClockRefusal[],
	attempts: TestAttempt[],
	appLogPath: string
): string {
	const times = refusals.length === 1 ? 'once' : `${refusals.length} times`;
	const details = refusals.map((refusal) => describeOneRefusal(refusal, attempts)).join('\n');

	return [
		`This run fails because the app's server logged the clock refusal ${times}, ` +
			'whatever the tests themselves reported. A test that failed on it and passed on its ' +
			'retry would otherwise leave nothing but a "flaky" line naming nothing.',
		details,
		`The whole app log is ${appLogPath}.`,
		CLOCK_REFUSAL_EXPLANATION
	].join('\n');
}
