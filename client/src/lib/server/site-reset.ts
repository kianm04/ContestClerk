/**
 * Resetting the test site from the website, the `/test-site` page.
 *
 * Only munmeet.umarbek.dev has this. Two settings switch it on, and only the deploy on the
 * Mac mini sets them, in its own `docker-compose.override.yaml`:
 *
 *   SITE_RESET_DIR   a folder the app shares with the Mac mini
 *   SITE_RESET_CODE  the code a tester types to confirm the reset
 *
 * With either one missing the page does not exist, which is how every development
 * machine runs.
 *
 * The app cannot reset the database by itself, because that takes the Supabase CLI and
 * Docker on the Mac mini. So it leaves a request file in the shared folder. A launchd job
 * on the Mac mini starts as soon as the file appears and runs `~/MunMeet/deploy/reseed.sh`,
 * which writes the time into `last-reset` and deletes the request when it is done:
 *
 *   SITE_RESET_DIR/requests/reset-requested   left here, removed by reseed.sh
 *   SITE_RESET_DIR/last-reset                 written by reseed.sh, read here
 *
 * Files under `$lib/server` only ever run on the server, so the code never reaches the
 * browser.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Where the reset request goes, and the code that allows one. */
export type SiteResetSettings = {
	directory: string;
	code: string;
};

/** What the page tells a tester about resets. */
export type SiteResetStatus = {
	/** When the last reset finished, as an ISO timestamp, or null if none has been recorded. */
	lastResetAt: string | null;
	/**
	 * When somebody asked for the reset that is waiting or running, or null if none is.
	 * The request stays until reseed.sh has finished, so this covers the whole reset.
	 */
	resetRequestedAt: string | null;
};

/** The folder launchd watches. Any file in it starts a reset. */
const REQUESTS_FOLDER = 'requests';
const REQUEST_FILE = 'reset-requested';
const LAST_RESET_FILE = 'last-reset';

/**
 * The reset settings from the server's environment, or null when this server has no
 * reset page. The environment is passed in rather than read here, so a test can hand
 * over a plain object.
 */
export function siteResetSettings(
	environment: Record<string, string | undefined>
): SiteResetSettings | null {
	const directory = environment.SITE_RESET_DIR ?? '';
	const code = environment.SITE_RESET_CODE ?? '';

	if (directory === '' || code === '') {
		return null;
	}

	return { directory, code };
}

/**
 * Whether the code a tester typed is the reset code.
 *
 * Both are hashed first because `timingSafeEqual` only compares values of the same
 * length. It takes as long for a nearly right code as for a wrong one, so the time an
 * answer takes gives nothing away.
 */
export function isResetCodeCorrect(typedCode: string, resetCode: string): boolean {
	const typedHash = createHash('sha256').update(typedCode.trim()).digest();
	const resetHash = createHash('sha256').update(resetCode).digest();

	return timingSafeEqual(typedHash, resetHash);
}

/** How many wrong codes in a row the form checks before it stops checking. */
export const RESET_ATTEMPT_LIMIT = 5;

/** How long the form then refuses every code, right or wrong: ten minutes. */
export const RESET_COOL_DOWN_MS = 10 * 60 * 1000;

/**
 * Counts wrong codes, and says when there have been too many. `now` is passed
 * in rather than read from the clock, so a test can move time along.
 */
export type FailedAttemptCounter = {
	/**
	 * Whether every code is being refused right now. The action asks this before it
	 * compares a code, so that during a cool-down a guess is never checked at all.
	 */
	isCoolingDown(now: Date): boolean;
	/** One more wrong code. */
	recordFailure(now: Date): void;
	/** The right code was typed, so the wrong ones before it are forgotten. */
	recordSuccess(): void;
};

/**
 * A counter that cools down for `coolDownMs` once `limit` wrong codes have been
 * typed in a row, and starts counting from nothing again after that.
 *
 * The reset code is shared among testers and short enough to guess, and every
 * right guess wipes the deployment, so guessing has to be slow: five tries, then
 * ten minutes of nothing, makes a six-character code a matter of years rather
 * than hours (security review L46).
 */
export function createFailedAttemptCounter(
	limit = RESET_ATTEMPT_LIMIT,
	coolDownMs = RESET_COOL_DOWN_MS
): FailedAttemptCounter {
	let failures = 0;
	let coolingDownUntil: Date | null = null;

	return {
		isCoolingDown(now) {
			if (coolingDownUntil === null) {
				return false;
			}

			if (now < coolingDownUntil) {
				return true;
			}

			// The cool-down has passed, so the next wrong codes count from nothing.
			failures = 0;
			coolingDownUntil = null;

			return false;
		},
		recordFailure(now) {
			failures += 1;

			if (failures >= limit) {
				coolingDownUntil = new Date(now.getTime() + coolDownMs);
			}
		},
		recordSuccess() {
			failures = 0;
			coolingDownUntil = null;
		}
	};
}

/**
 * The counter for the one `/test-site` form, kept for as long as the server
 * runs. A value at the top of a module is shared by every request this process
 * answers, which is the point: one visitor's guesses and the next one's land on
 * the same count. The deploy runs the app as a single Node process
 * (`client/Dockerfile`), so on munmeet.umarbek.dev this is the whole picture;
 * a restart starts the count again, which is the one way round it.
 */
export const siteResetAttempts: FailedAttemptCounter = createFailedAttemptCounter();

/** When the last reset finished, and when the one waiting or running was asked for. */
export async function readSiteResetStatus(directory: string): Promise<SiteResetStatus> {
	const lastResetAt = await readLastResetTime(directory);
	const resetRequestedAt = await readRequestTime(directory);

	return { lastResetAt, resetRequestedAt };
}

/**
 * Asks the Mac mini to reset the site, by leaving the request file launchd watches for.
 * The page reads the file's own modification time; the time written inside it is only
 * there for whoever looks in the folder by hand.
 */
export async function requestSiteReset(directory: string, now: Date): Promise<void> {
	const requestsFolder = join(directory, REQUESTS_FOLDER);

	await mkdir(requestsFolder, { recursive: true });
	await writeFile(join(requestsFolder, REQUEST_FILE), `${now.toISOString()}\n`);
}

/** The timestamp reseed.sh wrote, or null if it has not written one or wrote nonsense. */
async function readLastResetTime(directory: string): Promise<string | null> {
	let contents: string;

	try {
		contents = await readFile(join(directory, LAST_RESET_FILE), 'utf8');
	} catch {
		return null;
	}

	const moment = new Date(contents.trim());

	if (Number.isNaN(moment.getTime())) {
		return null;
	}

	return moment.toISOString();
}

/** When the request file was written, or null when there is no request. */
async function readRequestTime(directory: string): Promise<string | null> {
	try {
		const request = await stat(join(directory, REQUESTS_FOLDER, REQUEST_FILE));
		return request.mtime.toISOString();
	} catch {
		return null;
	}
}
