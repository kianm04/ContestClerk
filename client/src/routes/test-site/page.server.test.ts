import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the action are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';

// The environment is a stand-in, so each test decides whether this server has a reset
// page. `vi.mock` is moved to the top of the file before the imports run, so the object
// it hands out has to be made in `vi.hoisted`, which is moved with it.
const { privateEnvironment } = vi.hoisted(() => ({
	privateEnvironment: {} as Record<string, string | undefined>
}));

vi.mock('$env/dynamic/private', () => ({ env: privateEnvironment }));

const { actions, load } = await import('./+page.server');
const { siteResetAttempts } = await import('$lib/server/site-reset');

const RESET_CODE = 'open-sesame';

// An empty folder per test, standing in for the one the deploy shares with the Mac mini.
let directory: string;

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'test-site-page-'));
	privateEnvironment.SITE_RESET_DIR = directory;
	privateEnvironment.SITE_RESET_CODE = RESET_CODE;
	// The failed-attempt counter lives as long as the server does, so each test starts
	// it afresh rather than inheriting another test's wrong guesses.
	siteResetAttempts.recordSuccess();
});

afterEach(async () => {
	await rm(directory, { recursive: true, force: true });
});

function makeLoadEvent(): PageServerLoadEvent {
	return {} as unknown as PageServerLoadEvent;
}

function makeFormEvent(code: string): RequestEvent {
	const formData = new FormData();
	formData.set('code', code);

	return { request: { formData: async () => formData } } as unknown as RequestEvent;
}

/** Whether the request file launchd watches for is there. */
async function hasRequestFile(): Promise<boolean> {
	try {
		await stat(join(directory, 'requests', 'reset-requested'));
		return true;
	} catch {
		return false;
	}
}

describe('load', () => {
	it('is a 404 on a server with no reset settings, such as a development machine', async () => {
		privateEnvironment.SITE_RESET_CODE = undefined;

		await expect(load(makeLoadEvent())).rejects.toMatchObject({ status: 404 });
	});

	it('says no reset has been recorded or asked for in an empty folder', async () => {
		expect(await load(makeLoadEvent())).toEqual({ lastResetAt: null, resetRequestedAt: null });
	});
});

describe('the reset action', () => {
	it('refuses a wrong code and asks for nothing', async () => {
		const result = await actions.default(makeFormEvent('wrong'));

		expect(result).toMatchObject({ status: 403, data: { error: 'That is not the reset code.' } });
		expect(await hasRequestFile()).toBe(false);
	});

	it('leaves a request for the Mac mini when the code is right', async () => {
		await actions.default(makeFormEvent(RESET_CODE));

		expect(await hasRequestFile()).toBe(true);
		expect(await load(makeLoadEvent())).toMatchObject({ resetRequestedAt: expect.any(String) });
	});

	it('refuses a second reset while the first is still under way', async () => {
		await actions.default(makeFormEvent(RESET_CODE));

		const second = await actions.default(makeFormEvent(RESET_CODE));

		expect(second).toMatchObject({ status: 409, data: { error: 'A reset is already under way.' } });
	});

	it('stops checking codes after five wrong ones, even when the next one is right', async () => {
		// The shared code is short enough to guess and every hit wipes the deployment, so
		// guessing has to be slow (security review L46). The counter itself is tested in
		// `$lib/server/site-reset.test.ts`; this checks the action asks it first.
		for (let attempt = 0; attempt < 5; attempt += 1) {
			await actions.default(makeFormEvent(`guess-${attempt}`));
		}

		const refused = await actions.default(makeFormEvent(RESET_CODE));

		expect(refused).toMatchObject({
			status: 429,
			data: { error: 'Too many wrong codes. Try again in ten minutes.' }
		});
		expect(await hasRequestFile()).toBe(false);
	});

	it('forgets the wrong codes once the right one is typed', async () => {
		for (let attempt = 0; attempt < 4; attempt += 1) {
			await actions.default(makeFormEvent(`guess-${attempt}`));
		}

		await actions.default(makeFormEvent(RESET_CODE));

		expect(await hasRequestFile()).toBe(true);
	});
});
