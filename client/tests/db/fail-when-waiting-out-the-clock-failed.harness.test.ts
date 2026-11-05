import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The proof that the "db" project in vite.config.ts still loads
// `fail-when-waiting-out-the-clock-failed.ts` as its setup file. Without that
// one line, a database test whose every request was refused for the clock can
// pass, and the 77 `expect(error).not.toBeNull()` assertions in this folder
// would pass for the wrong reason.
//
// The check cannot be made from inside the database suite, because the setup
// file is part of what is being checked. So this runs a second Vitest, through
// `run-db-project-over.mjs`, over two test files it writes into a temporary
// folder. Neither touches the database: both are handed a stand-in `fetch`,
// which is why this file can sit in the "harness" project and need nothing
// started. See specs/02-architecture/testing.md.

/** The script that runs files through the real "db" project. */
const RUNNER = join(import.meta.dirname, 'run-db-project-over.mjs');

/** The folder holding vite.config.ts, which the runner must be started from. */
const CLIENT_FOLDER = join(import.meta.dirname, '..', '..');

/**
 * The clock module the fixtures import. It must be the same file the setup
 * file imports, because the reason a wait failed is kept inside that module.
 */
const CLOCK_MODULE = join(import.meta.dirname, 'waiting-out-the-clock.ts');

// Starting a second Vitest takes about a second on its own, and longer while
// `pnpm verify` keeps the machine busy.
const NESTED_RUN_TIMEOUT_MS = 60_000;

/**
 * A database test that asks through the real `createFetchThatWaitsOutTheClock`
 * and asserts only what it was answered, the way the 77 refusal tests do.
 * `answerCode` is the PostgREST code the stand-in `fetch` refuses every
 * request with, or `null` for a stand-in that answers every request.
 */
function fixtureAnsweredWith(answerCode: string | null): string {
	const answer =
		answerCode === null
			? `new Response('[]', { status: 200 })`
			: `new Response(JSON.stringify({ code: '${answerCode}' }), { status: 401 })`;
	const expectedStatus = answerCode === null ? 200 : 401;

	return `
		import { expect, it } from 'vitest';
		import { createFetchThatWaitsOutTheClock } from ${JSON.stringify(CLOCK_MODULE)};

		it('gets the answer it expected', async () => {
			const standInFetch = async () => ${answer};
			const fetchThatWaits = createFetchThatWaitsOutTheClock(async () => 'fresh-token', standInFetch, [0]);

			const answer = await fetchThatWaits('http://localhost/rest/v1/profiles');

			expect(answer.status).toBe(${expectedStatus});
		});
	`;
}

/** What the runner says happened to one test. */
type TestOutcome = { file: string; name: string; state: string; errors: string[] };

/** The temporary folder the fixtures are written to, removed afterwards. */
let folder: string;

/** What happened to every test in the fixtures, in the order the runner reported them. */
let outcomes: TestOutcome[] = [];

/** Writes each fixture into `folder` and runs them all through the "db" project in one go. */
function runThroughDatabaseProject(fixtures: Record<string, string>): TestOutcome[] {
	const paths: string[] = [];

	for (const [fileName, source] of Object.entries(fixtures)) {
		const path = join(folder, fileName);
		writeFileSync(path, source);
		paths.push(path);
	}

	const output = execFileSync('node', [RUNNER, ...paths], {
		cwd: CLIENT_FOLDER,
		encoding: 'utf8'
	});

	return JSON.parse(output);
}

/** The one test in the fixture called `fileName`. */
function outcomeIn(fileName: string): TestOutcome {
	const found = outcomes.filter((outcome) => outcome.file === join(folder, fileName));
	expect(found).toHaveLength(1);

	return found[0];
}

beforeAll(() => {
	folder = realpathSync(mkdtempSync(join(tmpdir(), 'db-setup-file-')));

	outcomes = runThroughDatabaseProject({
		'refused-for-the-clock.test.ts': fixtureAnsweredWith('PGRST303'),
		'answered.test.ts': fixtureAnsweredWith(null)
	});
}, NESTED_RUN_TIMEOUT_MS);

afterAll(() => {
	rmSync(folder, { recursive: true, force: true });
});

describe('the "db" project setup file', () => {
	it('fails a test whose wait for the clock failed, although its own assertion passed', () => {
		const outcome = outcomeIn('refused-for-the-clock.test.ts');

		expect(outcome.state).toBe('failed');
		expect(outcome.errors.join('\n')).toContain('"JWT issued at future"');
	});

	it('leaves a test alone when nothing was refused', () => {
		// Without this, the test above would also pass if the second Vitest
		// failed every test for some reason of its own.
		const outcome = outcomeIn('answered.test.ts');

		expect(outcome.state).toBe('passed');
	});
});
