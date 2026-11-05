// Runs the given test files through the "db" Vitest project exactly as
// vite.config.ts sets it up — the same environment and the same setup file —
// and prints what happened to each test as JSON, one array on one line: the
// file it is in, its name, whether it passed and the message of each error.
//
//   node tests/db/run-db-project-over.mjs /some/folder/a.test.ts /some/folder/b.test.ts
//
// It is how `fail-when-waiting-out-the-clock-failed.harness.test.ts` checks
// that the "db" project still loads its setup file. That check cannot be made
// from inside the database suite, because the setup file is part of what it is
// checking, so it runs a second Vitest over files of its own. The command line
// `vitest run --project db <file>` would not do: it only runs files that match
// the project's `include` pattern, and a file in a temporary folder does not.
// Vitest's own Node API can run any file through a named project.
//
// It must be run from `client/`, where Vitest finds vite.config.ts. It needs
// nothing started, as long as the files it is given touch no database.

import { createVitest } from 'vitest/node';

const testFiles = process.argv.slice(2);

// `reporters: []` keeps Vitest's own report off standard output, so the only
// thing printed there is the JSON below.
const vitest = await createVitest('test', { project: ['db'], watch: false, reporters: [] });

// Gets Vitest ready to run tests without running the project's own files.
await vitest.standalone();

const databaseProject = vitest.getProjectByName('db');
const specifications = testFiles.map((file) => databaseProject.createSpecification(file));
const run = await vitest.runTestSpecifications(specifications);
await vitest.close();

const outcomes = [];

for (const testModule of run.testModules) {
	for (const test of testModule.children.allTests()) {
		const result = test.result();
		const errors = result.errors ?? [];

		outcomes.push({
			file: testModule.moduleId,
			name: test.fullName,
			state: result.state,
			errors: errors.map((error) => error.message)
		});
	}
}

console.log(JSON.stringify(outcomes));

// Vitest sets a failing exit code when any test failed. Here a failed test is
// an answer printed above, not a failure of this script, so the exit code is
// kept for this script itself going wrong: Vitest not starting, for example.
process.exitCode = 0;
