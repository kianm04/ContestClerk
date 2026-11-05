import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from 'vite';

// Playwright does not read `client/.env` by itself, but the tests need the
// local Supabase address and keys: they create the account they sign in as, and
// the notification rows a database trigger will one day write. `loadEnv` is the
// same reader Vite uses for the app. A value already in the environment wins,
// so a machine that sets these its own way is left alone.
for (const [name, value] of Object.entries(loadEnv('test', process.cwd(), ''))) {
	process.env[name] ??= value;
}

// Where the built app is served while the browser tests run. Playwright starts
// it (see `webServer` below) and points every `page.goto('/...')` at it.
// `MUNMEET_E2E_PORT` moves it, so that two checkouts of this repository on one
// machine (a worktree beside the main one) can each run their own browser
// tests at the same time without one testing the other's build.
const APP_PORT = process.env.MUNMEET_E2E_PORT ?? '4173';
const APP_URL = `http://localhost:${APP_PORT}`;

// Where `tests/e2e/record-app-log.mjs` writes everything the app's server prints
// during this run, for `tests/e2e/clock-refusal-reporter.ts` to read at the end.
// A new file each run, so a log left over from an earlier run can never be read
// as this one's. This file is loaded again in every worker process, and the
// environment variable is what keeps them all on the first process's name.
process.env.MUNMEET_APP_LOG_PATH ??= join(tmpdir(), `munmeet-app-log-${randomUUID()}.log`);
const APP_LOG_PATH = process.env.MUNMEET_APP_LOG_PATH;

// Which browser engine the three projects below run in. Chromium (Chrome's
// engine) unless `MUNMEET_BROWSER=webkit` is set, as `pnpm test:e2e:webkit`
// does: WebKit is the engine inside Safari (T151). It is a separate download
// (`pnpm exec playwright install webkit`) that a fresh clone does not have, and
// `pnpm verify` must work on a fresh clone, so it is never the default. The
// projects keep their names in either engine, so a test that only runs on
// `desktop` or `phone` runs in WebKit too.
const BROWSER_DEVICE =
	process.env.MUNMEET_BROWSER === 'webkit' ? devices['Desktop Safari'] : devices['Desktop Chrome'];

// Every test runs three times: on a desktop, on a desktop with JavaScript
// switched off, and on a phone. The spec requires all three to work.
export default defineConfig({
	testDir: 'tests/e2e',
	// Playwright would otherwise take any file whose name ends in `test.ts` or
	// `spec.ts`, which since T81 includes the Vitest files named
	// `*.harness.test.ts`. Those import from `vitest` and would fail the moment
	// Playwright loaded them. Every browser test here is a `.spec.ts`.
	testMatch: '**/*.spec.ts',
	fullyParallel: true,
	// One retry, as insurance rather than as a cure. Until T59 a whole run failed
	// something like half the time and every retry was hiding the same real bug:
	// a test typed into a page before Svelte had brought it to life, and the
	// typing was written over. That is fixed in the form components, not here.
	// What is left is the ordinary risk of a machine under load, and one retry
	// turns that into a line saying "flaky" rather than three minutes of running
	// everything again. A test that fails twice is a real failure, and a run with
	// flaky lines in it is worth reading rather than ignoring.
	//
	// One failure is not left to that retry: a database refusing the app's access
	// token as issued in its own future (the Docker clock, not our code). The
	// second reporter fails any run whose app log carries that refusal, even when
	// every retry passed, and names the tests that were running when it came.
	retries: 1,
	reporter: [['list'], ['./tests/e2e/clock-refusal-reporter.ts', { appLogPath: APP_LOG_PATH }]],
	use: {
		baseURL: APP_URL,
		trace: 'retain-on-failure'
	},
	projects: [
		{
			name: 'desktop',
			use: { ...BROWSER_DEVICE, viewport: { width: 1280, height: 800 } }
		},
		{
			name: 'desktop-no-js',
			use: {
				...BROWSER_DEVICE,
				viewport: { width: 1280, height: 800 },
				javaScriptEnabled: false
			}
		},
		{
			name: 'phone',
			use: {
				...BROWSER_DEVICE,
				viewport: { width: 390, height: 844 },
				isMobile: true,
				hasTouch: true
			}
		}
	],
	webServer: {
		// `record-app-log.mjs` starts the preview server and copies what it prints
		// into the app log above, one stamped line at a time.
		command:
			`pnpm build && node tests/e2e/record-app-log.mjs ${JSON.stringify(APP_LOG_PATH)} ` +
			`pnpm preview --port ${APP_PORT} --strictPort`,
		url: APP_URL,
		// Full verification must build and serve its own candidate. An occupied
		// port fails instead of accidentally testing yesterday's preview server.
		reuseExistingServer: !process.env.CI && process.env.MUNMEET_VERIFY_FRESH_SERVER !== '1',
		// Ten minutes: the build in front of the server takes a minute alone and
		// several when other checkouts on the machine are building at the same time.
		timeout: 600_000
	}
});
