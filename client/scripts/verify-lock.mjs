// Every checkout on this machine uses the same local database. A lock in the
// user's temporary directory therefore protects linked worktrees too.
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';

/** Returns the shared local-stack lock directory; standalone DB commands do not take it. */
export function verificationLockPath() {
	return join(tmpdir(), `munmeet-verify-${process.getuid?.() ?? 'user'}.lock`);
}

function readOwner(path) {
	try {
		return JSON.parse(readFileSync(join(path, 'owner.json'), 'utf8'));
	} catch {
		return null;
	}
}

function isProcessAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error.code !== 'ESRCH';
	}
}

function isOwnerAlive(owner) {
	if (!owner || owner.hostname !== hostname() || !Number.isInteger(owner.pid) || owner.pid <= 0) {
		return true;
	}
	if (isProcessAlive(owner.pid)) return true;
	// A killed verifier can leave a detached test/server group running. Keep
	// its database protected until that group is gone as well.
	return (owner.processGroups ?? []).some((pid) =>
		isProcessAlive(process.platform === 'win32' ? pid : -pid)
	);
}

function recoverDeadOwner(path) {
	if (isOwnerAlive(readOwner(path))) return false;
	// Only one contender may remove a dead owner's lock. Re-reading after
	// taking recovery ownership avoids removing a newly acquired live lock.
	try {
		mkdirSync(join(path, 'recovery'));
	} catch {
		return false;
	}
	if (isOwnerAlive(readOwner(path))) {
		rmSync(join(path, 'recovery'), { recursive: true, force: true });
		return false;
	}
	rmSync(path, { recursive: true });
	return true;
}

/** Takes an exclusive lock and returns an idempotent release function. */
export function acquireVerificationLock(path = verificationLockPath()) {
	try {
		mkdirSync(path);
	} catch (error) {
		if (error.code !== 'EEXIST') throw error;
		if (!recoverDeadOwner(path)) {
			const owner = readOwner(path);
			throw new Error(
				`Verification already owns ${path} (PID ${owner?.pid ?? 'unknown'}). ` +
					'Wait for it to finish. Inspect unknown locks before removing them.',
				{ cause: error }
			);
		}
		mkdirSync(path);
	}
	const token = randomUUID();
	const owner = { token, pid: process.pid, hostname: hostname(), processGroups: [] };
	const writeOwner = () => writeFileSync(join(path, 'owner.json'), JSON.stringify(owner));
	writeOwner();
	const release = () => {
		if (readOwner(path)?.token === token) rmSync(path, { recursive: true, force: true });
	};
	release.trackProcess = (pid, isRunning) => {
		owner.processGroups = owner.processGroups.filter((candidate) => candidate !== pid);
		if (isRunning) owner.processGroups.push(pid);
		writeOwner();
	};
	return release;
}
