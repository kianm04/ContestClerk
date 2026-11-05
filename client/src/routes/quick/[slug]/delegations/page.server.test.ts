import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import { countryMember, type QuickSessionDraft } from '$lib/quick-session';
import type { QuickSession } from '$lib/server/quick-sessions';

// The gates, the database and the flash cookie are stood in for, so these
// tests are about what `load` and the actions decide: who gets in, what a
// running session refuses, and what "Save delegations" is told to write.
// `membersOfSeats` and `$lib/quick-session.ts` are pure and run for real.
vi.mock('$lib/server/access', () => ({
	requireOnboarded: vi.fn(),
	requirePermission: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

vi.mock('$lib/server/quick-sessions', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/server/quick-sessions')>();

	return {
		...original,
		getQuickSession: vi.fn(),
		saveQuickSessionDelegations: vi.fn()
	};
});

import { requirePermission, requireOnboarded } from '$lib/server/access';
import { setFlash } from '$lib/server/flash';
import { getQuickSession, saveQuickSessionDelegations } from '$lib/server/quick-sessions';

const SUPABASE = {};
const COOKIES = {};
const ROOM = '/conferences/quick-ab12cd34ef/committees/thursday-practice/chair';

/** The quick session the stand-in database answers with: France and Germany shown, Brazil hidden. */
const QUICK_SESSION: QuickSession = {
	conferenceId: 'conference-1',
	conferenceSlug: 'quick-ab12cd34ef',
	committeeId: 'committee-1',
	committeeSlug: 'thursday-practice',
	committeeName: 'Thursday practice',
	seats: [
		{ id: 'seat-fr', name: 'France', countryCode: 'FR', isAvailable: true },
		{ id: 'seat-de', name: 'Germany', countryCode: 'DE', isAvailable: true },
		{ id: 'seat-br', name: 'Brazil', countryCode: 'BR', isAvailable: false }
	],
	isSessionRunning: false
};

/** The few pieces of a request that `load` and the actions read. */
function makeEvent(formData: FormData = new FormData()) {
	return {
		url: new URL('http://localhost/quick/quick-ab12cd34ef/delegations'),
		params: { slug: 'quick-ab12cd34ef' },
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		request: { formData: async () => formData }
	};
}

/** A form carrying these members. */
function makeForm(members: string[], fields: Record<string, string> = {}): FormData {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) formData.set(name, value);
	for (const member of members) formData.append('member', member);

	return formData;
}

/** Run something that throws a redirect or an error, and give back what it threw. */
async function catchThrown(run: () => unknown): Promise<{ status: number; location?: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location?: string };
	}

	throw new Error('Nothing was thrown.');
}

type Answer = {
	draft?: QuickSessionDraft;
	status?: number;
	data?: { draft: QuickSessionDraft; errors: Record<string, string> };
};

beforeEach(() => {
	vi.mocked(requireOnboarded).mockReset();
	vi.mocked(requireOnboarded).mockResolvedValue({ id: 'user-1', email: 'chair@example.com' });
	vi.mocked(requirePermission).mockReset();
	vi.mocked(requirePermission).mockResolvedValue(
		{} as Awaited<ReturnType<typeof requirePermission>>
	);
	vi.mocked(getQuickSession).mockReset();
	vi.mocked(getQuickSession).mockResolvedValue(QUICK_SESSION);
	vi.mocked(saveQuickSessionDelegations).mockReset();
	vi.mocked(setFlash).mockClear();
});

describe('load', () => {
	it("answers a draft of the committee's shown members, its name and its chair room", async () => {
		const result = await load(makeEvent() as unknown as PageServerLoadEvent);

		expect(getQuickSession).toHaveBeenCalledWith(SUPABASE, 'quick-ab12cd34ef');
		// "Save delegations" writes seats, which the `seats` policies allow only
		// with `manage_committees` on the whole conference, so the page asks the
		// same rather than the committee's `run_room`.
		expect(requirePermission).toHaveBeenCalledWith(
			expect.anything(),
			expect.any(URL),
			'quick-ab12cd34ef',
			'manage_committees'
		);
		expect(result).toMatchObject({
			committeeName: 'Thursday practice',
			roomHref: ROOM,
			draft: { members: [countryMember('FR'), countryMember('DE')] }
		});
	});

	it('answers a 404 for a slug that is not a quick session', async () => {
		vi.mocked(getQuickSession).mockResolvedValue(null);

		const thrown = await catchThrown(() => load(makeEvent() as unknown as PageServerLoadEvent));

		expect(thrown.status).toBe(404);
		expect(requirePermission).not.toHaveBeenCalled();
	});

	it('lets the gate answer a 404 for anybody without manage_committees on the conference', async () => {
		vi.mocked(requirePermission).mockRejectedValue({ status: 404 });

		const thrown = await catchThrown(() => load(makeEvent() as unknown as PageServerLoadEvent));

		expect(thrown.status).toBe(404);
	});

	it('sends the chair back to the room while a session runs, saying why', async () => {
		vi.mocked(getQuickSession).mockResolvedValue({ ...QUICK_SESSION, isSessionRunning: true });

		const thrown = await catchThrown(() => load(makeEvent() as unknown as PageServerLoadEvent));

		expect(thrown).toMatchObject({ status: 303, location: ROOM });
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'error',
			message: 'End the session before changing its delegations.'
		});
	});
});

describe('the draft actions', () => {
	it('change the draft without saving, after asking the gate again', async () => {
		const event = makeEvent(makeForm(['country:FR'], { add: 'country:BR' }));
		const answer = (await actions.addMember(event as unknown as RequestEvent)) as Answer;

		expect(answer.draft?.members.map((member) => member.name)).toEqual(['Brazil', 'France']);
		expect(requirePermission).toHaveBeenCalledOnce();
		expect(saveQuickSessionDelegations).not.toHaveBeenCalled();
	});
});

describe('save', () => {
	it('saves the members and goes back to the room with "Delegations saved."', async () => {
		const event = makeEvent(makeForm(['country:FR', 'country:BR']));
		const thrown = await catchThrown(() => actions.save(event as unknown as RequestEvent));

		expect(thrown).toMatchObject({ status: 303, location: ROOM });
		expect(saveQuickSessionDelegations).toHaveBeenCalledWith(SUPABASE, QUICK_SESSION, [
			countryMember('BR'),
			countryMember('FR')
		]);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Delegations saved.'
		});
	});

	it('refuses fewer than two members and saves nothing', async () => {
		const event = makeEvent(makeForm(['country:FR']));
		const answer = (await actions.save(event as unknown as RequestEvent)) as Answer;

		expect(answer.status).toBe(400);
		expect(answer.data?.errors).toEqual({ members: 'Add at least two members to save.' });
		expect(saveQuickSessionDelegations).not.toHaveBeenCalled();
	});

	it('is refused while a session runs, back to the room with its message', async () => {
		vi.mocked(getQuickSession).mockResolvedValue({ ...QUICK_SESSION, isSessionRunning: true });

		const event = makeEvent(makeForm(['country:FR', 'country:DE']));
		const thrown = await catchThrown(() => actions.save(event as unknown as RequestEvent));

		expect(thrown).toMatchObject({ status: 303, location: ROOM });
		expect(saveQuickSessionDelegations).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'error',
			message: 'End the session before changing its delegations.'
		});
	});
});
