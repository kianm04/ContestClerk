import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { RULING_REFUSAL } from '$lib/amendment-queue';
import { AMENDMENT_NOT_FOUND, type PaperAmendment } from '$lib/paper-amendments';
import {
	amendmentCardActions,
	atAmendment,
	daisAmendmentActions,
	type AmendedPaper
} from './paper-amendment-actions';

// The cards' actions with the database stood in for: which function each
// asks, where it sends the reader back to, and how it answers a refusal.
// Who may press what is the database's, tested in `tests/db/`.
vi.mock('./flash', () => ({ setFlash: vi.fn() }));
vi.mock('./paper-amendments', () => ({
	readPaperAmendments: vi.fn(),
	answerAmendment: vi.fn(),
	makeAmendmentUnfriendly: vi.fn(),
	supportAmendment: vi.fn(),
	withdrawAmendment: vi.fn(),
	decideAmendment: vi.fn()
}));

import { setFlash } from './flash';
import {
	answerAmendment,
	decideAmendment,
	makeAmendmentUnfriendly,
	readPaperAmendments,
	supportAmendment,
	withdrawAmendment
} from './paper-amendments';

const SUPABASE = {};
const PAGE = '/conferences/thimun-2027/committees/disec/resolutions/paper-1';
const PAPER: AmendedPaper = { paperId: 'paper-1', pageUrl: PAGE };
const DONE = { refusal: null };

const AMENDMENT = {
	id: 'amendment-3',
	sequence: 3,
	isFriendly: true
} as PaperAmendment;

const findPaper = vi.fn(async () => PAPER);
const cards = amendmentCardActions(findPaper);
const dais = daisAmendmentActions(findPaper);

/** An action's request with `fields` posted. */
function makeEvent(fields: Record<string, string>): RequestEvent {
	const formData = new FormData();
	for (const [name, value] of Object.entries(fields)) formData.append(name, value);

	return {
		locals: { supabase: SUPABASE },
		cookies: {},
		request: { formData: async () => formData }
	} as unknown as RequestEvent;
}

/** Run an action expected to redirect, and give back where it sent the reader. */
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
	vi.mocked(readPaperAmendments).mockResolvedValue([AMENDMENT]);
});

describe('atAmendment', () => {
	it('points at the amendment’s card', () => {
		expect(atAmendment(PAGE, 3)).toBe(`${PAGE}#amendment-3`);
	});
});

describe('amendmentCardActions', () => {
	it('answers, supports and withdraws, and comes back to the card with a toast', async () => {
		vi.mocked(answerAmendment).mockResolvedValue(DONE);
		vi.mocked(supportAmendment).mockResolvedValue(DONE);
		vi.mocked(withdrawAmendment).mockResolvedValue(DONE);
		vi.mocked(makeAmendmentUnfriendly).mockResolvedValue(DONE);
		const event = () => makeEvent({ amendment: 'amendment-3' });

		expect(await redirectedTo(() => cards.acceptAmendment(event()))).toBe(`${PAGE}#amendment-3`);
		await redirectedTo(() => cards.declineAmendment(event()));
		await redirectedTo(() => cards.supportAmendment(event()));
		await redirectedTo(() => cards.makeAmendmentUnfriendly(event()));
		await redirectedTo(() => cards.withdrawAmendment(event()));

		expect(vi.mocked(answerAmendment).mock.calls).toEqual([
			[SUPABASE, 'amendment-3', true],
			[SUPABASE, 'amendment-3', false]
		]);
		expect(supportAmendment).toHaveBeenCalledWith(SUPABASE, 'amendment-3');
		expect(makeAmendmentUnfriendly).toHaveBeenCalledWith(SUPABASE, 'amendment-3');
		expect(withdrawAmendment).toHaveBeenCalledWith(SUPABASE, 'amendment-3');
		expect(vi.mocked(setFlash).mock.calls[0][1]).toEqual({
			tone: 'success',
			message: 'You accepted amendment 3 as friendly.'
		});
	});

	it('refuses an amendment not on the paper, and passes on the database’s refusal', async () => {
		vi.mocked(supportAmendment).mockResolvedValue({ refusal: 'You support it already.' });

		expect(await cards.supportAmendment(makeEvent({ amendment: 'elsewhere' }))).toMatchObject({
			status: 400,
			data: { flash: { tone: 'error', message: AMENDMENT_NOT_FOUND } }
		});
		expect(await cards.supportAmendment(makeEvent({ amendment: 'amendment-3' }))).toMatchObject({
			data: { flash: { message: 'You support it already.' } }
		});
	});
});

describe('daisAmendmentActions', () => {
	it('approves, and rules out of order with the dais’s reason', async () => {
		vi.mocked(decideAmendment).mockResolvedValue(DONE);

		await redirectedTo(() => dais.approveAmendment(makeEvent({ amendment: 'amendment-3' })));
		await redirectedTo(() =>
			dais.ruleOutAmendment(makeEvent({ amendment: 'amendment-3', ruling: ' Not germane. ' }))
		);

		expect(vi.mocked(decideAmendment).mock.calls).toEqual([
			[SUPABASE, 'amendment-3', { kind: 'approve' }],
			[SUPABASE, 'amendment-3', { kind: 'out_of_order', ruling: 'Not germane.' }]
		]);
		expect(vi.mocked(setFlash).mock.calls[0][1].message).toBe(
			'Amendment 3 approved and written in.'
		);
	});

	it('refuses a ruling with no reason', async () => {
		expect(
			await dais.ruleOutAmendment(makeEvent({ amendment: 'amendment-3', ruling: ' ' }))
		).toMatchObject({ data: { flash: { message: RULING_REFUSAL } } });
		expect(decideAmendment).not.toHaveBeenCalled();
	});
});
