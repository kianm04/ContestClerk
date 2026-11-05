import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FullConfig, TestCase, TestResult } from '@playwright/test/reporter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CLOCK_REFUSAL_EXPLANATION } from '../../src/lib/database-errors';
import ClockRefusalReporter from './clock-refusal-reporter';

// The whole check a browser run ends with, minus the browser: the real
// `record-app-log.mjs` runs a stand-in server that prints the clock refusal or
// does not, and the real reporter reads what it recorded. That is the proof
// that a run whose app log carries the refusal fails and one without it does
// not. A real browser run cannot be made to meet the refusal on purpose,
// because that needs the Docker clock corrected backwards mid-test.
//
// Playwright's own objects are stood in for with only the fields the reporter
// reads. See specs/02-architecture/testing.md.

/** The recorder, as `playwright.config.ts` runs it. */
const RECORDER = join(import.meta.dirname, 'record-app-log.mjs');

/** A folder of its own for each test's log, removed afterwards. */
let folder: string;

beforeEach(() => {
	folder = mkdtempSync(join(tmpdir(), 'clock-refusal-reporter-'));
});

afterEach(() => {
	rmSync(folder, { recursive: true, force: true });
});

/**
 * Runs the recorder around a stand-in server that prints each of `lines` to
 * its error output and stops, the way the app's server prints `handleError`'s
 * lines, and gives back the log it wrote.
 */
function recordServerPrinting(lines: string[]): string {
	const appLogPath = join(folder, 'app.log');
	const server = 'for (const line of process.argv.slice(1)) console.error(line);';

	execFileSync('node', [RECORDER, appLogPath, 'node', '-e', server, ...lines], {
		stdio: 'ignore'
	});

	return appLogPath;
}

/** The settings the reporter reads from `playwright.config.ts`. */
function configWith(reuseExistingServer: boolean): FullConfig {
	return { webServer: { reuseExistingServer } } as unknown as FullConfig;
}

/** One attempt at a test, running from ten seconds ago until now. */
function reportTestRunningUntilNow(reporter: ClockRefusalReporter, title: string): void {
	const test = { titlePath: () => ['', 'phone', 'home.spec.ts', title] } as unknown as TestCase;
	const result = { retry: 0, startTime: new Date(Date.now() - 10_000), duration: 10_000 };

	reporter.onTestEnd(test, result as unknown as TestResult);
}

/** A reporter whose sentences are kept in `said` instead of being printed. */
function reporterFor(appLogPath: string, reuseExistingServer: boolean) {
	const said: string[] = [];
	const reporter = new ClockRefusalReporter({ appLogPath }, (line) => said.push(line));

	reporter.onBegin(configWith(reuseExistingServer));

	return { reporter, said };
}

describe('ClockRefusalReporter', () => {
	it('fails a run whose app log carries the refusal and names the test', async () => {
		const appLogPath = recordServerPrinting([
			CLOCK_REFUSAL_EXPLANATION,
			'Unexpected error while serving /home Error: Could not read the profile'
		]);
		const { reporter, said } = reporterFor(appLogPath, false);
		reportTestRunningUntilNow(reporter, 'shows the dashboard');

		expect(await reporter.onEnd()).toEqual({ status: 'failed' });
		expect(said.join('\n')).toContain('phone › home.spec.ts › shows the dashboard');
		expect(said.join('\n')).toContain('while serving /home');
	});

	it('leaves alone a run whose app log does not carry it', async () => {
		const appLogPath = recordServerPrinting([
			'Unexpected error while serving /home Error: something else entirely'
		]);
		const { reporter, said } = reporterFor(appLogPath, false);
		reportTestRunningUntilNow(reporter, 'shows the dashboard');

		expect(await reporter.onEnd()).toBeUndefined();
		expect(said).toEqual(['The app log carried no clock refusal.']);
	});

	it('says out loud that it could not check a server Playwright did not start', async () => {
		const { reporter, said } = reporterFor(join(folder, 'never-written.log'), true);
		reportTestRunningUntilNow(reporter, 'shows the dashboard');

		expect(await reporter.onEnd()).toBeUndefined();
		expect(said.join('\n')).toContain('Could not check the app log');
	});

	it('fails a run that had to start its own server and has no log from it', async () => {
		const { reporter, said } = reporterFor(join(folder, 'never-written.log'), false);
		reportTestRunningUntilNow(reporter, 'shows the dashboard');

		expect(await reporter.onEnd()).toEqual({ status: 'failed' });
		expect(said.join('\n')).toContain('was never written');
	});

	it('has nothing to check when no test ran', async () => {
		const { reporter, said } = reporterFor(join(folder, 'never-written.log'), false);

		expect(await reporter.onEnd()).toBeUndefined();
		expect(said).toEqual([]);
	});
});
