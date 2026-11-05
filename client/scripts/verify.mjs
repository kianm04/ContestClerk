// `pnpm verify`: every check, with the full output of each saved to a log file.
// --fast and --no-reset skip rebuilding the database, which is the slow part.
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { repoRoot } from './repo-files.mjs';
import { acquireVerificationLock } from './verify-lock.mjs';

// Preparation (wave 0) runs one step at a time; the numbered waves run after it,
// and the checks inside one wave run at the same time.
//
// `writesSvelteKitFiles` marks a check that rewrites `.svelte-kit/`. Vitest and
// Playwright do it through the SvelteKit Vite plugin whether asked or not. Every
// SvelteKit sync deletes and recreates the root route's generated types, and two
// syncs at once can stat a file the other has just deleted and die with ENOENT.
// So such a check runs in a wave of its own, and the type check reads what
// preparation synced instead of syncing again.
//
// The browser tests (`pnpm test:e2e`) are not a step. The whole suite takes about
// 20 minutes, four times everything else together. Run the specs your change
// touches by path instead, for example `pnpm test:e2e tests/e2e/<page>.spec.ts`.
export const VERIFICATION_STEPS = [
	{ id: 'database-status', name: 'Local database', wave: 0, command: ['pnpm', 'db:status'] },
	{
		id: 'svelte-sync',
		name: 'Svelte preparation',
		wave: 0,
		writesSvelteKitFiles: true,
		command: ['pnpm', 'exec', 'svelte-kit', 'sync']
	},
	{ id: 'database-reset', name: 'Fresh database', wave: 0, command: ['pnpm', 'db:reset'] },
	{
		id: 'types',
		name: 'Type check',
		wave: 1,
		command: ['pnpm', 'exec', 'svelte-check', '--tsconfig', './tsconfig.json']
	},
	{ id: 'lint', name: 'Lint and formatting', wave: 1, command: ['pnpm', 'lint'] },
	{ id: 'house-rules', name: 'House rules', wave: 1, command: ['node', 'scripts/house-rules.mjs'] },
	{ id: 'scripts', name: 'Script tests', wave: 1, command: ['pnpm', 'test:scripts'] },
	{
		// Published advisories against the packages the server ships. `--prod`
		// leaves out the build and test tools, which never run on the public site,
		// and only a high or critical advisory fails the check. The `overrides` in
		// pnpm-workspace.yaml are what keep it passing for packages we only get
		// through other packages; a direct dependency is updated instead. It asks
		// the npm registry, so it needs the network like `pnpm install` does.
		id: 'audit',
		name: 'Dependency advisories',
		wave: 1,
		command: ['pnpm', 'audit', '--prod', '--audit-level=high']
	},
	{
		id: 'unit',
		name: 'Unit, component and harness tests',
		wave: 2,
		writesSvelteKitFiles: true,
		command: ['pnpm', 'test']
	},
	{
		id: 'database',
		name: 'Database tests',
		wave: 3,
		writesSvelteKitFiles: true,
		command: ['pnpm', 'test:db']
	}
];

// A hung tool must not run forever. The longest step is lint, under three
// minutes; the limit leaves room for a busy machine running everything at half speed.
const STEP_TIMEOUT_MS = 15 * 60 * 1000;
// Give tools a short opportunity to close their server and database connections.
const TERMINATION_GRACE_MS = 3_000;

function signalGroup(child, signal) {
	if (!child.pid) return;
	try {
		process.kill(process.platform === 'win32' ? child.pid : -child.pid, signal);
	} catch (error) {
		if (error.code !== 'ESRCH') throw error;
	}
}

/**
 * The process groups, other than `rootPid`'s own, that processes below
 * `rootPid` lead, read from `ps -A -o pid=,ppid=,pgid=` output. Playwright
 * starts the preview server as the leader of a group of its own, so signalling
 * the check's group alone leaves that server holding its port (T140).
 */
export function descendantProcessGroups(processTable, rootPid) {
	const rows = processTable
		.trim()
		.split('\n')
		.map((line) => line.trim().split(/\s+/).map(Number))
		.filter((row) => row.length === 3 && row.every(Number.isInteger));
	const below = new Set([rootPid]);
	let hasGrown = true;
	while (hasGrown) {
		hasGrown = false;
		for (const [pid, parentPid] of rows) {
			if (below.has(parentPid) && !below.has(pid)) {
				below.add(pid);
				hasGrown = true;
			}
		}
	}
	const groups = new Set();
	for (const [pid, , groupId] of rows) {
		if (below.has(pid) && groupId === pid && pid !== rootPid) groups.add(groupId);
	}
	return [...groups];
}

function childProcessGroups(child) {
	if (!child.pid || process.platform === 'win32') return [];
	try {
		const table = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,pgid='], { encoding: 'utf8' });
		return descendantProcessGroups(table, child.pid);
	} catch {
		return [];
	}
}

function signalGroupId(groupId, signal) {
	try {
		process.kill(-groupId, signal);
	} catch (error) {
		// macOS answers EPERM for a group whose processes have all exited but
		// are not yet cleared away. The group was started below this check, so
		// it is ours either way, and nothing is left in it to stop.
		if (error.code !== 'ESRCH' && error.code !== 'EPERM') throw error;
	}
}

/** Runs one bounded check and retains its complete output, including spawn failures. */
export function runVerificationStep(step, options) {
	const {
		client,
		logsDirectory,
		signal,
		timeoutMs = STEP_TIMEOUT_MS,
		trackProcess = () => {}
	} = options;
	const startedAt = Date.now();
	const log = join(logsDirectory, `${step.id}.log`);
	const path = join(client, log);
	writeFileSync(path, '');
	return new Promise((resolve) => {
		let timedOut = false;
		let spawnError = false;
		let finished = false;
		let forceTimer;
		let completionTimer;
		// Groups started below the check, found while it still runs; see
		// `descendantProcessGroups`.
		let childGroups = [];
		const child = spawn(step.command[0], step.command.slice(1), {
			cwd: client,
			env: { ...process.env, MUNMEET_VERIFY_FRESH_SERVER: '1' },
			detached: process.platform !== 'win32',
			stdio: ['ignore', 'pipe', 'pipe']
		});
		if (child.pid) trackProcess(child.pid, true);
		const append = (chunk) => appendFileSync(path, chunk);
		child.stdout.on('data', append);
		child.stderr.on('data', append);

		function finish(status, exitSignal) {
			if (finished) return;
			finished = true;
			clearTimeout(timeout);
			clearTimeout(forceTimer);
			clearTimeout(completionTimer);
			signal?.removeEventListener('abort', abort);
			// A command that exited must not leave a preview server behind for
			// the next run. Only this check's own process group is touched.
			signalGroup(child, 'SIGKILL');
			for (const groupId of childGroups) signalGroupId(groupId, 'SIGKILL');
			if (child.pid) trackProcess(child.pid, false);
			child.stdout.destroy();
			child.stderr.destroy();
			resolve({
				id: step.id,
				command: step.command,
				status: spawnError || timedOut || signal?.aborted ? 1 : status,
				signal: exitSignal ?? null,
				timedOut,
				durationMs: Date.now() - startedAt,
				log
			});
		}

		function stop(reason) {
			if (forceTimer || finished) return;
			append(`\n${reason}\n`);
			childGroups = childProcessGroups(child);
			signalGroup(child, 'SIGTERM');
			for (const groupId of childGroups) signalGroupId(groupId, 'SIGTERM');
			forceTimer = setTimeout(() => {
				signalGroup(child, 'SIGKILL');
				for (const groupId of childGroups) signalGroupId(groupId, 'SIGKILL');
			}, TERMINATION_GRACE_MS);
			// Even a broken wrapper that never closes its pipes cannot hold the
			// lock forever. Kill its group before resolving the failed check.
			completionTimer = setTimeout(() => finish(1, 'SIGKILL'), TERMINATION_GRACE_MS + 1_000);
		}

		function abort() {
			stop('Verification interrupted.');
		}
		const timeout = setTimeout(() => {
			timedOut = true;
			stop(`Check exceeded its ${Math.round(timeoutMs / 1000)} second time limit.`);
		}, timeoutMs);
		child.once('error', (error) => {
			spawnError = true;
			append(`\nCould not start check: ${error.message}\n`);
		});
		child.once('close', finish);
		signal?.addEventListener('abort', abort, { once: true });
		if (signal?.aborted) abort();
	});
}

/** The wave numbers after preparation, in order. */
export function checkWaves() {
	const waves = new Set(VERIFICATION_STEPS.map((step) => step.wave));
	waves.delete(0);
	return [...waves].sort((left, right) => left - right);
}

function printResult(result, client) {
	const step = VERIFICATION_STEPS.find((candidate) => candidate.id === result.id);
	const passed = result.status === 0 && !result.signal && !result.timedOut;
	console.log(
		`${passed ? 'PASS' : 'FAIL'} ${step.name} (${Math.round(result.durationMs / 1000)}s): ${result.log}`
	);
	if (!passed) {
		console.log(
			readFileSync(join(client, result.log), 'utf8').trimEnd().split('\n').slice(-60).join('\n')
		);
	}
	return passed;
}

async function verify() {
	const arguments_ = process.argv.slice(2);
	if (arguments_.some((argument) => !['--fast', '--no-reset'].includes(argument))) {
		throw new Error('Usage: pnpm verify [--fast] [--no-reset]');
	}
	// `--fast` used to leave out the browser tests as well. They are no longer a
	// step, so it now means the same as `--no-reset`.
	const keepDatabase = arguments_.includes('--fast') || arguments_.includes('--no-reset');
	const client = join(repoRoot, 'client');
	const release = acquireVerificationLock();
	const controller = new AbortController();
	const interrupt = () => controller.abort();
	process.on('SIGINT', interrupt);
	process.on('SIGTERM', interrupt);
	try {
		const logsDirectory = `.verify-logs/${randomUUID()}`;
		mkdirSync(join(client, logsDirectory), { recursive: true });
		console.log(`Verification logs: ${join(client, logsDirectory)}`);
		const options = {
			client,
			logsDirectory,
			signal: controller.signal,
			trackProcess: release.trackProcess
		};
		const preparation = VERIFICATION_STEPS.filter((step) => step.wave === 0);
		for (const step of preparation) {
			if (step.id === 'database-reset' && keepDatabase) continue;
			if (controller.signal.aborted) throw new Error('Verification interrupted.');
			const result = await runVerificationStep(step, options);
			if (!printResult(result, client))
				throw new Error(`${step.name} failed; preparation must succeed before running checks.`);
		}
		for (const wave of checkWaves()) {
			if (controller.signal.aborted) throw new Error('Verification interrupted.');
			const steps = VERIFICATION_STEPS.filter((step) => step.wave === wave);
			console.log(`Running: ${steps.map((step) => step.name).join(', ')}`);
			const waveResults = await Promise.all(
				steps.map(async (step) => {
					const result = await runVerificationStep(step, options);
					printResult(result, client);
					return result;
				})
			);
			if (waveResults.some((result) => result.status !== 0 || result.signal || result.timedOut)) {
				throw new Error('Checks failed. Fix the saved failures and run verification again.');
			}
		}
		if (controller.signal.aborted) throw new Error('Verification interrupted.');
		console.log(
			keepDatabase
				? 'All checks passed on the existing database. Run a full "pnpm verify" before you finish.'
				: 'All checks passed.'
		);
	} finally {
		process.removeListener('SIGINT', interrupt);
		process.removeListener('SIGTERM', interrupt);
		release();
	}
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	try {
		await verify();
	} catch (error) {
		console.error(`Verification failed: ${error.message}`);
		process.exitCode = 1;
	}
}
