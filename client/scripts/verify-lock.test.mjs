import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { acquireVerificationLock } from './verify-lock.mjs';

function lockDirectory(context) {
	const directory = mkdtempSync(join(tmpdir(), 'munmeet-lock-test-'));
	context.after(() => rmSync(directory, { recursive: true, force: true }));
	return join(directory, 'verify.lock');
}

test('a live verification excludes another process or worktree', (context) => {
	const path = lockDirectory(context);
	const release = acquireVerificationLock(path);
	assert.throws(() => acquireVerificationLock(path), /Verification already owns/);
	release();
	release();
	acquireVerificationLock(path)();
});

test('a definitely dead owner is recovered while an unknown owner is refused', (context) => {
	const path = lockDirectory(context);
	mkdirSync(path);
	writeFileSync(
		join(path, 'owner.json'),
		JSON.stringify({ pid: 2147483647, hostname: hostname() })
	);
	acquireVerificationLock(path)();
	mkdirSync(path);
	assert.throws(() => acquireVerificationLock(path), /PID unknown/);
});

test('a lock from a different host cannot be silently removed', (context) => {
	const path = lockDirectory(context);
	mkdirSync(path);
	writeFileSync(
		join(path, 'owner.json'),
		JSON.stringify({ pid: 2147483647, hostname: 'another-host' })
	);
	assert.throws(() => acquireVerificationLock(path), /Verification already owns/);
});
