// Starts the app's preview server for the browser tests and writes down
// everything it prints, one line at a time, each stamped with the moment it
// arrived. `playwright.config.ts` runs this as its `webServer` command:
//
//   node tests/e2e/record-app-log.mjs <log file> pnpm preview --port 4173 --strictPort
//
// Why it exists: the app's server writes to its own output and nowhere else, so
// without this nothing a test run owns can read what the server said. T80 made
// the server say something worth reading when the database refuses an access
// token from its own future; `clock-refusal-reporter.ts` reads this file after
// the run and fails the run when that sentence is in it. The stamps are what let
// the reporter name the tests that were running at the time.
//
// This is plain JavaScript rather than TypeScript because `node` runs it
// directly, before anything that could compile TypeScript has started.
// See specs/02-architecture/testing.md.

import { spawn } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';

const [logPath, command, ...commandArguments] = process.argv.slice(2);

if (!logPath || !command) {
	console.error('Usage: node tests/e2e/record-app-log.mjs <log file> <command> [arguments...]');
	process.exit(1);
}

// Start from an empty file, so the log holds this run's server and nothing else.
writeFileSync(logPath, '');

/**
 * Adds one line to the log, stamped with the time it arrived. The stamp and
 * the single space after it are the shape `readAppLog` in `app-log.ts` expects.
 *
 * @param {string} line
 */
function recordLine(line) {
	appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`);
}

/**
 * Passes what the server prints on to our own output unchanged, so the
 * terminal shows exactly what it showed before, and records it line by line.
 * A chunk can end half-way through a line, so the unfinished part waits for
 * the next chunk rather than being stamped as a line of its own.
 *
 * @param {import('node:stream').Readable} serverOutput
 * @param {NodeJS.WriteStream} ourOutput
 */
function recordEveryLineOf(serverOutput, ourOutput) {
	let unfinishedLine = '';

	serverOutput.setEncoding('utf8');
	serverOutput.on('data', (/** @type {string} */ chunk) => {
		ourOutput.write(chunk);

		const lines = (unfinishedLine + chunk).split('\n');
		unfinishedLine = lines.pop() ?? '';

		for (const line of lines) {
			recordLine(line);
		}
	});
	serverOutput.on('end', () => {
		if (unfinishedLine !== '') {
			recordLine(unfinishedLine);
		}
	});
}

const server = spawn(command, commandArguments, { stdio: ['ignore', 'pipe', 'pipe'] });

recordEveryLineOf(server.stdout, process.stdout);
recordEveryLineOf(server.stderr, process.stderr);

server.on('error', (error) => {
	console.error(`Could not start ${command}:`, error);
	process.exit(1);
});

// Playwright stops the server by ending this whole process group, which takes
// the server with it. Should the server stop on its own first, for example
// because the port is taken, this ends with its exit code so Playwright sees
// the same failure it would have seen without this file in the way.
server.on('close', (exitCode) => {
	process.exit(exitCode ?? 1);
});
