// What every script under client/scripts/ needs to know about the repository:
// where its root is, which files it holds, and which of them this branch
// changed. It lives in one place so every script reads the same answer.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The top of the working tree, whichever folder a script was started from. */
export const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
	encoding: 'utf8'
}).trim();

/** Runs git and returns its trimmed output, or null when git reports an error. */
export function gitOutput(args) {
	try {
		return execFileSync('git', args, {
			cwd: repoRoot,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
	} catch {
		return null;
	}
}

/** The branch work is merged into: `feature/mvp` while it exists, `main` after that. */
export function integrationBranch() {
	return gitOutput(['rev-parse', '--verify', 'refs/heads/feature/mvp']) ? 'feature/mvp' : 'main';
}

/** Reads a file by its path from the repository root. */
export function read(path) {
	return readFileSync(join(repoRoot, path), 'utf8');
}

/** True when a path from the repository root exists on disk. */
export function exists(path) {
	return existsSync(join(repoRoot, path));
}

/**
 * Every file git knows about, plus every new file that is not ignored. A
 * tracked file deleted in the working tree but not yet committed is left out,
 * since there is nothing left to read; without that, a branch that deletes a
 * component crashed every check that reads the files.
 */
export function listFiles() {
	const tracked = gitOutput(['ls-files']) ?? '';
	const untracked = gitOutput(['ls-files', '--others', '--exclude-standard']) ?? '';
	return [...tracked.split('\n'), ...untracked.split('\n')].filter(
		(path) => path !== '' && exists(path)
	);
}

/**
 * The files this branch added or changed: everything that differs from the
 * integration branch, plus everything not committed yet. On the integration
 * branch itself that leaves only the uncommitted work, which is what we want.
 */
export function listChangedFiles() {
	const committed = gitOutput(['diff', '--name-only', `${integrationBranch()}...HEAD`]) ?? '';
	const working = gitOutput(['status', '--porcelain']) ?? '';
	// A status line is two status characters, a space, then the path.
	const workingPaths = working
		.split('\n')
		.filter(Boolean)
		.map((line) => line.trimStart().replace(/^\S{1,2}\s+/, ''));
	return [...new Set([...committed.split('\n').filter(Boolean), ...workingPaths])];
}

/**
 * Prints the result of one group of checks the way every script here does, and
 * says whether anything failed. A note is printed and changes nothing.
 */
export function reportRules(rules) {
	let failed = false;

	for (const rule of rules) {
		const problems = rule.run();
		if (problems.length === 0) {
			console.log(`ok    ${rule.name}`);
			continue;
		}
		failed = failed || !rule.isNote;
		console.log(`${rule.isNote ? 'note' : 'FAIL'}  ${rule.name}`);
		for (const problem of problems) {
			console.log(`        ${problem}`);
		}
	}

	return failed;
}
