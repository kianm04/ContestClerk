import { existsSync, readFileSync } from 'node:fs';
import type {
	FullConfig,
	FullResult,
	Reporter,
	TestCase,
	TestResult
} from '@playwright/test/reporter';
import { describeClockRefusals, findClockRefusals, type TestAttempt } from './app-log';

/**
 * A Playwright reporter that fails a browser run whose app log carries the
 * clock refusal, and names the tests that were running when it was logged.
 *
 * A reporter is an object Playwright tells about the run as it goes: every
 * test that ends, and the run as a whole at the end. It runs in the one process
 * that sees all three projects, which is why the check lives here rather than
 * in a test. What `onEnd` returns can change the run's result, and so the exit
 * code `pnpm verify` reads. `playwright.config.ts` lists it next to `list`,
 * which still prints the run as before.
 *
 * Why the run fails even when every test passed in the end: the app's server
 * writes `CLOCK_REFUSAL_EXPLANATION` when the database refuses its access token
 * as issued in its own future, and a test that met that can pass on its one
 * retry. Without this the run would be green with a "flaky" line naming
 * nothing. See specs/02-architecture/testing.md.
 */

/** What `playwright.config.ts` hands this reporter. */
export type ClockRefusalReporterOptions = {
	/** The file `record-app-log.mjs` writes the server's output to for this run. */
	appLogPath: string;
};

/** Where this reporter's own sentences go. Standing in for it lets a test read them. */
type WriteLine = (line: string) => void;

/** The name a reader can search for: project, file and title, plus the retry number. */
function nameOfAttempt(test: TestCase, result: TestResult): string {
	// `titlePath()` starts with an empty title for the root of the run, then the
	// project, then the file, then any `describe` blocks and the test itself.
	const titles = test.titlePath().filter((title) => title !== '');
	const name = titles.join(' › ');

	return result.retry === 0 ? name : `${name} (retry ${result.retry})`;
}

export default class ClockRefusalReporter implements Reporter {
	private readonly appLogPath: string;
	private readonly writeLine: WriteLine;
	private readonly attempts: TestAttempt[] = [];

	/** Whether Playwright was allowed to use a server it did not start. */
	private mayReuseServer = false;

	constructor(
		options: ClockRefusalReporterOptions,
		writeLine: WriteLine = (line) => process.stdout.write(`${line}\n`)
	) {
		this.appLogPath = options.appLogPath;
		this.writeLine = writeLine;
	}

	/** Called once before any test runs, with the settings from `playwright.config.ts`. */
	onBegin(config: FullConfig): void {
		this.mayReuseServer = config.webServer?.reuseExistingServer === true;
	}

	/** Called after every attempt at every test, so a retry is written down as well. */
	onTestEnd(test: TestCase, result: TestResult): void {
		const endedAt = new Date(result.startTime.getTime() + result.duration);

		this.attempts.push({ name: nameOfAttempt(test, result), startedAt: result.startTime, endedAt });
	}

	/**
	 * Called once after the last test. Returning `{ status: 'failed' }` fails the
	 * run whatever the tests reported; returning nothing leaves the result alone.
	 * Playwright's types only allow that answer from an `async` method.
	 */
	async onEnd(): Promise<{ status: FullResult['status'] } | undefined> {
		if (!existsSync(this.appLogPath)) {
			return this.reportMissingLog();
		}

		const refusals = findClockRefusals(readFileSync(this.appLogPath, 'utf8'));

		if (refusals.length === 0) {
			this.writeLine('The app log carried no clock refusal.');
			return undefined;
		}

		this.writeLine(describeClockRefusals(refusals, this.attempts, this.appLogPath));
		return { status: 'failed' };
	}

	/**
	 * No log means `record-app-log.mjs` never ran, so nothing the server said can
	 * be checked. Outside CI Playwright may use a preview server somebody left
	 * running, and then that is expected and only said out loud. When it was told
	 * to start its own server, as `pnpm verify` tells it to, a missing log means
	 * the recording itself broke, and a run that could not check does not pass.
	 */
	private reportMissingLog(): { status: FullResult['status'] } | undefined {
		// A run in which no test ran, such as `playwright test --list`, starts no
		// server and has nothing to check.
		if (this.attempts.length === 0) {
			return undefined;
		}

		if (this.mayReuseServer) {
			this.writeLine(
				'Could not check the app log for the clock refusal: this run used a server ' +
					'Playwright did not start, so its output was never recorded. Stop that server, ' +
					'or run "pnpm verify", to have the log checked.'
			);
			return undefined;
		}

		this.writeLine(
			`This run fails because the app log ${this.appLogPath} was never written, so ` +
				'nothing can say whether the database refused an access token from its own future. ' +
				'Check the webServer command in playwright.config.ts.'
		);
		return { status: 'failed' };
	}
}
