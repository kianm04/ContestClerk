import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	createFailedAttemptCounter,
	isResetCodeCorrect,
	readSiteResetStatus,
	requestSiteReset,
	RESET_ATTEMPT_LIMIT,
	RESET_COOL_DOWN_MS,
	siteResetSettings
} from './site-reset';

// Each test gets an empty folder of its own, standing in for the folder the deploy
// shares with the Mac mini.
let directory: string;

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'site-reset-'));
});

afterEach(async () => {
	await rm(directory, { recursive: true, force: true });
});

describe('siteResetSettings', () => {
	it('is null when neither setting is there, as on a development machine', () => {
		expect(siteResetSettings({})).toBeNull();
	});

	it('is null when only one of the two is set', () => {
		expect(siteResetSettings({ SITE_RESET_DIR: '/site-reset' })).toBeNull();
		expect(siteResetSettings({ SITE_RESET_CODE: 'open-sesame' })).toBeNull();
	});

	it('gives back the folder and the code when both are set', () => {
		const settings = siteResetSettings({
			SITE_RESET_DIR: '/site-reset',
			SITE_RESET_CODE: 'open-sesame'
		});

		expect(settings).toEqual({ directory: '/site-reset', code: 'open-sesame' });
	});
});

describe('isResetCodeCorrect', () => {
	it('accepts the code, and ignores spaces typed around it', () => {
		expect(isResetCodeCorrect('open-sesame', 'open-sesame')).toBe(true);
		expect(isResetCodeCorrect('  open-sesame ', 'open-sesame')).toBe(true);
	});

	it('refuses a wrong code, a code of another length and an empty one', () => {
		expect(isResetCodeCorrect('open-sesamE', 'open-sesame')).toBe(false);
		expect(isResetCodeCorrect('open', 'open-sesame')).toBe(false);
		expect(isResetCodeCorrect('', 'open-sesame')).toBe(false);
	});
});

describe('readSiteResetStatus', () => {
	it('knows of no reset in a folder nothing has written to', async () => {
		expect(await readSiteResetStatus(directory)).toEqual({
			lastResetAt: null,
			resetRequestedAt: null
		});
	});

	it('reads the time reseed.sh wrote, with its line break', async () => {
		await writeFile(join(directory, 'last-reset'), '2026-10-01T13:35:00Z\n');

		const status = await readSiteResetStatus(directory);

		expect(status.lastResetAt).toBe('2026-10-01T13:35:00.000Z');
	});

	it('treats a last-reset file that holds no time as no reset', async () => {
		await writeFile(join(directory, 'last-reset'), 'not a time\n');

		const status = await readSiteResetStatus(directory);

		expect(status.lastResetAt).toBeNull();
	});
});

describe('requestSiteReset', () => {
	it('leaves the request file launchd watches for, and the status then shows when', async () => {
		const before = Date.now();
		await requestSiteReset(directory, new Date('2026-10-01T14:00:00Z'));

		const request = await readFile(join(directory, 'requests', 'reset-requested'), 'utf8');
		const status = await readSiteResetStatus(directory);

		expect(request).toBe('2026-10-01T14:00:00.000Z\n');
		// The page goes by the file's own time, which is the real clock's, not the one passed in.
		expect(Date.parse(status.resetRequestedAt ?? '')).toBeGreaterThanOrEqual(before - 1000);
	});
});

describe('createFailedAttemptCounter', () => {
	const START = new Date('2026-10-22T10:00:00Z');

	/** `START` plus so many milliseconds. */
	function later(milliseconds: number): Date {
		return new Date(START.getTime() + milliseconds);
	}

	/** A counter that has just been given `count` wrong codes, all at `START`. */
	function counterAfterFailures(count: number) {
		const counter = createFailedAttemptCounter();

		for (let index = 0; index < count; index += 1) {
			counter.recordFailure(START);
		}

		return counter;
	}

	it('lets the first wrong codes through without a cool-down', () => {
		const counter = counterAfterFailures(RESET_ATTEMPT_LIMIT - 1);

		expect(counter.isCoolingDown(START)).toBe(false);
	});

	it('cools down once the limit is reached, and stays cool for ten minutes', () => {
		const counter = counterAfterFailures(RESET_ATTEMPT_LIMIT);

		expect(RESET_ATTEMPT_LIMIT).toBe(5);
		expect(RESET_COOL_DOWN_MS).toBe(10 * 60 * 1000);
		expect(counter.isCoolingDown(START)).toBe(true);
		expect(counter.isCoolingDown(later(RESET_COOL_DOWN_MS - 1))).toBe(true);
	});

	it('starts counting again from nothing once the cool-down has passed', () => {
		const counter = counterAfterFailures(RESET_ATTEMPT_LIMIT);
		const afterwards = later(RESET_COOL_DOWN_MS);

		expect(counter.isCoolingDown(afterwards)).toBe(false);

		// Four more wrong codes are allowed before the next cool-down, not one.
		for (let index = 0; index < RESET_ATTEMPT_LIMIT - 1; index += 1) {
			counter.recordFailure(afterwards);
		}

		expect(counter.isCoolingDown(afterwards)).toBe(false);
		counter.recordFailure(afterwards);
		expect(counter.isCoolingDown(afterwards)).toBe(true);
	});

	it('forgets the wrong codes once the right one is typed', () => {
		const counter = counterAfterFailures(RESET_ATTEMPT_LIMIT - 1);

		counter.recordSuccess();
		counter.recordFailure(START);

		expect(counter.isCoolingDown(START)).toBe(false);
	});

	it('can be told a different limit and cool-down', () => {
		const counter = createFailedAttemptCounter(2, 1000);

		counter.recordFailure(START);
		expect(counter.isCoolingDown(START)).toBe(false);
		counter.recordFailure(START);
		expect(counter.isCoolingDown(START)).toBe(true);
		expect(counter.isCoolingDown(later(1000))).toBe(false);
	});
});
