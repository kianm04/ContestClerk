import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
	VERIFICATION_STEPS,
	checkWaves,
	descendantProcessGroups,
	runVerificationStep
} from './verify.mjs';

function options(context) {
	const client = mkdtempSync(join(tmpdir(), 'munmeet-step-test-'));
	context.after(() => rmSync(client, { recursive: true, force: true }));
	const logsDirectory = '.verify-logs/test-run';
	mkdirSync(join(client, logsDirectory), { recursive: true });
	return { client, logsDirectory, timeoutMs: 10_000 };
}

test('step records full output and a nonzero child exit', async (context) => {
	const configuration = options(context);
	const result = await runVerificationStep(
		{
			id: 'failure',
			command: [
				process.execPath,
				'-e',
				'console.log("full output"); console.error("reason"); process.exit(3);'
			]
		},
		configuration
	);
	assert.equal(result.status, 3);
	const output = readFileSync(join(configuration.client, result.log), 'utf8');
	assert.match(output, /full output/);
	assert.match(output, /reason/);
});

test('spawn errors settle as failed checks rather than hanging', async (context) => {
	const result = await runVerificationStep(
		{ id: 'missing', command: ['/does-not-exist/munmeet-check'] },
		options(context)
	);
	assert.equal(result.status, 1);
});

test('a hung step times out, terminates its group and retains the reason', async (context) => {
	const configuration = { ...options(context), timeoutMs: 100 };
	const result = await runVerificationStep(
		{ id: 'timeout', command: [process.execPath, '-e', 'setInterval(() => {}, 1000);'] },
		configuration
	);
	assert.equal(result.timedOut, true);
	assert.equal(result.status, 1);
	assert.match(readFileSync(join(configuration.client, result.log), 'utf8'), /time limit/);
});

test('finds the groups led by processes below the check, however deep', () => {
	// 100 is the check. 200 is Playwright in the check's group; 300 is the
	// preview server leading its own group, and 301 is its child in that group.
	// 900 leads a group but is someone else's process.
	const table = [
		'  100     1   100',
		'  200   100   100',
		'  300   200   300',
		'  301   300   300',
		'  900     1   900'
	].join('\n');
	assert.deepEqual(descendantProcessGroups(table, 100), [300]);
	assert.deepEqual(descendantProcessGroups(table, 900), []);
});

test('a timed-out step also stops a server that started a group of its own', async (context) => {
	const configuration = { ...options(context), timeoutMs: 1_000 };
	// The check starts a detached child, as Playwright starts its preview
	// server, prints the child's id and then hangs.
	const script = [
		"const { spawn } = require('node:child_process');",
		"const server = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);'],",
		"  { detached: true, stdio: 'ignore' });",
		'console.log(`server ${server.pid}`);',
		'setInterval(() => {}, 1000);'
	].join('\n');
	const result = await runVerificationStep(
		{ id: 'server', command: [process.execPath, '-e', script] },
		configuration
	);
	assert.equal(result.timedOut, true);
	const output = readFileSync(join(configuration.client, result.log), 'utf8');
	const serverPid = Number(output.match(/server (\d+)/)?.[1]);
	assert.ok(serverPid > 0, output);
	// Give the operating system a moment to finish removing the process.
	await new Promise((resolve) => setTimeout(resolve, 200));
	assert.throws(() => process.kill(serverPid, 0), { code: 'ESRCH' });
});

test('an aborted verification cannot produce a successful check', async (context) => {
	const controller = new AbortController();
	controller.abort();
	const result = await runVerificationStep(
		{ id: 'aborted', command: [process.execPath, '-e', 'setInterval(() => {}, 1000);'] },
		{ ...options(context), signal: controller.signal }
	);
	assert.equal(result.status, 1);
});

// What a step really runs: the package script behind `pnpm <script>`, or the
// command itself. Read from package.json so a changed script is noticed here.
function commandText(step) {
	const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).scripts;
	const [program, first, ...rest] = step.command;
	if (program === 'pnpm' && first !== 'exec' && scripts[first]) {
		return [scripts[first], ...rest].join(' ');
	}
	return step.command.join(' ');
}

test('every check that rewrites .svelte-kit says so', () => {
	// Vitest, Playwright and Vite load the SvelteKit plugin, which syncs.
	const startsSvelteKit = /\b(vitest|playwright|vite|svelte-kit sync)\b/;
	for (const step of VERIFICATION_STEPS) {
		assert.equal(
			Boolean(step.writesSvelteKitFiles),
			startsSvelteKit.test(commandText(step)),
			`${step.id} runs "${commandText(step)}"`
		);
	}
});

test('a check that rewrites .svelte-kit shares its wave with nothing', () => {
	for (const wave of checkWaves()) {
		const steps = VERIFICATION_STEPS.filter((step) => step.wave === wave);
		if (steps.some((step) => step.writesSvelteKitFiles)) {
			assert.deepEqual(
				steps.map((step) => step.id),
				[steps[0].id],
				`wave ${wave} runs a SvelteKit sync beside other checks`
			);
		}
	}
});

test('the type check reads the files preparation synced', () => {
	const typeCheck = VERIFICATION_STEPS.find((step) => step.id === 'types');
	const sync = VERIFICATION_STEPS.find((step) => step.id === 'svelte-sync');
	assert.equal(sync.wave, 0);
	assert.ok(typeCheck.wave > 0);
	assert.doesNotMatch(commandText(typeCheck), /svelte-kit sync/);
});

test('checks run in every wave after preparation', () => {
	const allWaves = [...new Set(VERIFICATION_STEPS.map((step) => step.wave))]
		.filter((wave) => wave > 0)
		.sort((left, right) => left - right);
	assert.deepEqual(checkWaves(), allWaves);
});

test('verify does not run the whole browser suite', () => {
	for (const step of VERIFICATION_STEPS) {
		assert.doesNotMatch(commandText(step), /\bplaywright\b/, `${step.id} runs the browser tests`);
	}
});

test('verify audits the shipped packages for high advisories', () => {
	const audit = VERIFICATION_STEPS.find((step) => step.id === 'audit');
	assert.ok(audit, 'no audit step');
	assert.ok(audit.wave > 0, 'the audit is a check, not preparation');
	assert.deepEqual(audit.command, ['pnpm', 'audit', '--prod', '--audit-level=high']);
});
