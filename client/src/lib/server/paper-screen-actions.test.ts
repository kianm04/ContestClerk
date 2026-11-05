import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { paperScreenActions, type ScreenedPaper } from './paper-screen-actions';

// The projector's actions with the database stood in for: what each hands
// the screen functions, where it sends the dais back to, and how it answers a
// refusal. The functions themselves are tested in `papers-on-floor.test.ts`,
// and the rows in `tests/db/committee-papers-displayed-clause.test.ts`.
vi.mock('./flash', () => ({ setFlash: vi.fn() }));
vi.mock('./papers-on-floor', () => ({
	mayRunRoom: vi.fn(),
	showPaperOnScreen: vi.fn(),
	takePaperOffScreen: vi.fn(),
	stepDisplayedClause: vi.fn()
}));

import { setFlash } from './flash';
import {
	mayRunRoom,
	showPaperOnScreen,
	stepDisplayedClause,
	takePaperOffScreen
} from './papers-on-floor';

const SUPABASE = {};
const COOKIES = {};
const PAPER: ScreenedPaper = {
	committeeId: 'committee-1',
	paperId: 'paper-1',
	name: 'Draft resolution 1.1',
	pageUrl: '/conferences/thimun-2027/committees/disec/chair/resolutions/paper-1'
};

const findPaper = vi.fn(async () => PAPER);
const actions = paperScreenActions(findPaper);
const EVENT = { locals: { supabase: SUPABASE }, cookies: COOKIES } as unknown as RequestEvent;

/** Run an action expected to redirect, and give back where it sent the dais. */
async function redirectedTo(run: () => unknown): Promise<string> {
	try {
		await run();
	} catch (thrown) {
		return (thrown as { location: string }).location;
	}

	throw new Error('The action did not redirect');
}

beforeEach(() => {
	vi.clearAllMocks();
	// The dais presses the buttons unless a test says otherwise.
	vi.mocked(mayRunRoom).mockResolvedValue(true);
});

describe('paperScreenActions', () => {
	it('puts the paper on screen and says so', async () => {
		vi.mocked(showPaperOnScreen).mockResolvedValue(null);

		expect(await redirectedTo(() => actions.showOnScreen(EVENT))).toBe(PAPER.pageUrl);
		expect(showPaperOnScreen).toHaveBeenCalledWith(SUPABASE, 'committee-1', 'paper-1');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Draft resolution 1.1 is on the screen.'
		});
	});

	it('refuses with the reason, leaving the page as it was', async () => {
		vi.mocked(showPaperOnScreen).mockResolvedValue(
			'Only an introduced paper can go on the screen.'
		);

		expect(await actions.showOnScreen(EVENT)).toMatchObject({
			status: 400,
			data: { flash: { tone: 'error', message: 'Only an introduced paper can go on the screen.' } }
		});
	});

	it('takes the paper off screen and says so', async () => {
		expect(await redirectedTo(() => actions.takeOffScreen(EVENT))).toBe(PAPER.pageUrl);
		expect(takePaperOffScreen).toHaveBeenCalledWith(SUPABASE, 'committee-1', 'paper-1');
		expect(setFlash).toHaveBeenCalledOnce();
	});

	it('steps the projector either way without a toast', async () => {
		vi.mocked(stepDisplayedClause).mockResolvedValue(null);

		expect(await redirectedTo(() => actions.nextClause(EVENT))).toBe(PAPER.pageUrl);
		expect(await redirectedTo(() => actions.previousClause(EVENT))).toBe(PAPER.pageUrl);
		expect(stepDisplayedClause).toHaveBeenNthCalledWith(
			1,
			SUPABASE,
			'committee-1',
			'paper-1',
			'next'
		);
		expect(stepDisplayedClause).toHaveBeenNthCalledWith(
			2,
			SUPABASE,
			'committee-1',
			'paper-1',
			'previous'
		);
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('refuses a step once another paper is on screen', async () => {
		vi.mocked(stepDisplayedClause).mockResolvedValue('That paper is no longer on the screen.');

		expect(await actions.nextClause(EVENT)).toMatchObject({
			status: 400,
			data: { flash: { message: 'That paper is no longer on the screen.' } }
		});
	});

	it('refuses a reader who does not run the room before anything is written', async () => {
		vi.mocked(mayRunRoom).mockResolvedValue(false);

		const refusal = {
			status: 400,
			data: { flash: { tone: 'error', message: 'Only the dais changes the screen.' } }
		};

		expect(await actions.showOnScreen(EVENT)).toMatchObject(refusal);
		expect(await actions.takeOffScreen(EVENT)).toMatchObject(refusal);
		expect(await actions.nextClause(EVENT)).toMatchObject(refusal);
		expect(await actions.previousClause(EVENT)).toMatchObject(refusal);

		expect(mayRunRoom).toHaveBeenCalledWith(SUPABASE, 'committee-1');
		expect(showPaperOnScreen).not.toHaveBeenCalled();
		expect(takePaperOffScreen).not.toHaveBeenCalled();
		expect(stepDisplayedClause).not.toHaveBeenCalled();
		expect(setFlash).not.toHaveBeenCalled();
	});
});
