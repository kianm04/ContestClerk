import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import { countryMember, emptyDraft, type QuickSessionDraft } from '$lib/quick-session';

// The gate and the database call are stood in for, so these tests are about
// what `load` and the actions themselves decide. `$lib/quick-session.ts` is
// not stood in for: it is pure, and running the real checks is what proves
// the page and the actions agree. `create_quick_session` itself is tested in
// `tests/db/quick-sessions.test.ts`.
vi.mock('$lib/server/access', () => ({ requireOnboarded: vi.fn() }));

// Only the database call is stood in for; `QuickSessionRefusal` stays the real
// class, so that the action's `instanceof` sees what the tests throw.
vi.mock('$lib/server/quick-sessions', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/quick-sessions')>()),
	createQuickSession: vi.fn()
}));

import { requireOnboarded } from '$lib/server/access';
import { createQuickSession, QuickSessionRefusal } from '$lib/server/quick-sessions';

/** The Supabase client. `load` and the actions only hand it on. */
const SUPABASE = {};

/** A form as the page posts it: its fields, then one `member` field per member. */
function makeForm(fields: Record<string, string>, members: string[] = []): FormData {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) formData.set(name, value);
	for (const member of members) formData.append('member', member);

	return formData;
}

/**
 * The few pieces of a request that `load` and the actions read. SvelteKit
 * hands them many more, so the cast says "this is enough".
 */
function makeEvent(formData: FormData = new FormData()) {
	return {
		url: new URL('http://localhost/quick/new'),
		locals: { supabase: SUPABASE },
		request: { formData: async () => formData }
	};
}

/** A post to one of the actions, carrying this form. */
function makePostEvent(formData: FormData): RequestEvent {
	return makeEvent(formData) as unknown as RequestEvent;
}

/** What a draft action answers: the draft, or a refusal holding it (`{ status, data }`). */
type DraftAnswer = {
	draft?: QuickSessionDraft;
	status?: number;
	data?: { draft: QuickSessionDraft; errors: Record<string, string>; flash?: unknown };
	errors?: Record<string, string>;
};

/**
 * Run something that is expected to redirect, and give back the redirect.
 * SvelteKit's `redirect` works by throwing, so catching it is the only way to
 * see where it was sending the visitor.
 */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

/** The names of an answered draft's members. */
function memberNames(draft: QuickSessionDraft | undefined): string[] {
	return (draft?.members ?? []).map((member) => member.name);
}

const READY_FIELDS = { name: 'Thursday practice', agenda: '', speakingTime: '1:30', timezone: '' };

beforeEach(() => {
	vi.mocked(requireOnboarded).mockReset();
	vi.mocked(requireOnboarded).mockResolvedValue({ id: 'user-1', email: 'chair@example.com' });
	vi.mocked(createQuickSession).mockReset();
	vi.mocked(createQuickSession).mockResolvedValue({
		conferenceSlug: 'quick-ab12cd34ef',
		committeeSlug: 'thursday-practice'
	});
});

describe('load', () => {
	it('asks for a signed-in, onboarded reader and answers an empty draft, reading nothing else', async () => {
		const result = await load(makeEvent() as unknown as PageServerLoadEvent);

		expect(requireOnboarded).toHaveBeenCalledOnce();
		expect(result).toEqual({ draft: emptyDraft() });
	});

	it('lets the gate send a visitor to sign in', async () => {
		vi.mocked(requireOnboarded).mockRejectedValue({
			status: 303,
			location: '/login?next=/quick/new'
		});

		const redirected = await catchRedirect(() =>
			load(makeEvent() as unknown as PageServerLoadEvent)
		);

		expect(redirected.location).toBe('/login?next=/quick/new');
	});
});

describe('the draft actions, without JavaScript', () => {
	it('"Security Council" fills the committee with its fifteen, replacing what was there', async () => {
		const formData = makeForm({ ...READY_FIELDS, list: 'security_council' }, ['name:Press']);
		const answer = (await actions.fillFromList(makePostEvent(formData))) as DraftAnswer;

		expect(answer.draft?.members).toHaveLength(15);
		expect(memberNames(answer.draft)).not.toContain('Press');
		expect(answer.draft?.name).toBe('Thursday practice');
	});

	it('"+" adds a member state, and "×" removes a member', async () => {
		const added = (await actions.addMember(
			makePostEvent(makeForm({ add: 'country:FR' }, ['country:DE']))
		)) as DraftAnswer;
		const removed = (await actions.removeMember(
			makePostEvent(makeForm({ remove: 'country:DE' }, ['country:DE', 'country:FR']))
		)) as DraftAnswer;

		expect(memberNames(added.draft)).toEqual(['France', 'Germany']);
		expect(memberNames(removed.draft)).toEqual(['France']);
	});

	it('adds the typed name as a member and empties the search', async () => {
		const answer = (await actions.addCustom(
			makePostEvent(makeForm({ q: 'Amnesty International' }))
		)) as DraftAnswer;

		expect(answer.draft?.search).toBe('');
		expect(answer.draft?.members).toEqual([
			{ value: 'name:Amnesty International', name: 'Amnesty International', countryCode: null }
		]);
	});

	it('refuses a typed name over 80 characters with a 400, keeping the draft', async () => {
		const answer = (await actions.addCustom(
			makePostEvent(makeForm({ q: 'a'.repeat(81) }, ['country:FR']))
		)) as DraftAnswer;

		expect(answer.status).toBe(400);
		expect(answer.data?.errors).toEqual({
			custom: "Please keep a member's name under 80 characters."
		});
		expect(memberNames(answer.data?.draft)).toEqual(['France']);
	});

	it('"Clear all" removes every member', async () => {
		const answer = (await actions.clearMembers(
			makePostEvent(makeForm({}, ['country:FR', 'country:DE']))
		)) as DraftAnswer;

		expect(answer.draft?.members).toEqual([]);
	});

	it('"Add these" adds the pasted lines, and refuses more than 300', async () => {
		const pasted = (await actions.paste(
			makePostEvent(makeForm({ names: 'Germany\nSecretary-General' }, ['country:FR']))
		)) as DraftAnswer;
		const tooMany = Array.from({ length: 301 }, (_, index) => `Member ${index}`).join('\n');
		const refused = (await actions.paste(
			makePostEvent(makeForm({ names: tooMany }))
		)) as DraftAnswer;

		expect(memberNames(pasted.draft)).toEqual(['France', 'Germany', 'Secretary-General']);
		expect(refused.status).toBe(400);
		expect(refused.data?.errors).toEqual({
			paste: 'Please add at most 300 delegations at a time.'
		});
	});

	it('"Search" draws the draft again with its search, saving nothing', async () => {
		const answer = (await actions.search(makePostEvent(makeForm({ q: 'ger' })))) as DraftAnswer;

		expect(answer.draft?.search).toBe('ger');
		expect(createQuickSession).not.toHaveBeenCalled();
	});

	it('asks the gate again first, since an action is its own request', async () => {
		await actions.search(makePostEvent(makeForm({ q: 'ger' })));

		expect(requireOnboarded).toHaveBeenCalledOnce();
	});
});

describe('start', () => {
	it('makes the quick session and lands on its chair room', async () => {
		const formData = makeForm({ ...READY_FIELDS, timezone: 'Europe/Paris' }, [
			'country:FR',
			'country:DE'
		]);
		const redirected = await catchRedirect(() => actions.start(makePostEvent(formData)));

		expect(redirected).toMatchObject({
			status: 303,
			location: '/conferences/quick-ab12cd34ef/committees/thursday-practice/chair'
		});
		expect(createQuickSession).toHaveBeenCalledWith(SUPABASE, {
			committeeName: 'Thursday practice',
			agenda: null,
			speakingTimeSeconds: 90,
			timezone: 'Europe/Paris',
			members: [countryMember('FR'), countryMember('DE')].sort((first, second) =>
				first.name.localeCompare(second.name)
			)
		});
	});

	it('refuses fewer than two members, keeping every field, and makes nothing', async () => {
		const formData = makeForm({ ...READY_FIELDS, agenda: 'Climate', q: 'ger' }, ['country:FR']);
		const answer = (await actions.start(makePostEvent(formData))) as DraftAnswer;

		expect(answer.status).toBe(400);
		expect(answer.data?.errors).toEqual({ members: 'Add at least two members to start.' });
		expect(answer.data?.draft.agenda).toBe('Climate');
		expect(answer.data?.draft.search).toBe('ger');
		expect(createQuickSession).not.toHaveBeenCalled();
	});

	it('refuses an empty name and a speaking time out of range, each with its message', async () => {
		const formData = makeForm({ name: '', speakingTime: '20' }, ['country:FR', 'country:DE']);
		const answer = (await actions.start(makePostEvent(formData))) as DraftAnswer;

		expect(answer.data?.errors).toEqual({
			name: "Please enter the committee's name.",
			speakingTime: 'Please enter a speaking time between 0:30 and 10:00.'
		});
	});

	it("shows the database's own refusal, such as the cap, keeping the draft", async () => {
		const refusal =
			'You already have 25 quick sessions running. Start another once one of them is over.';
		vi.mocked(createQuickSession).mockRejectedValue(new QuickSessionRefusal(refusal));

		const formData = makeForm(READY_FIELDS, ['country:FR', 'country:DE']);
		const answer = (await actions.start(makePostEvent(formData))) as DraftAnswer;

		expect(answer.status).toBe(400);
		expect(answer.data?.flash).toEqual({ tone: 'error', message: refusal });
		expect(memberNames(answer.data?.draft)).toEqual(['France', 'Germany']);
	});

	it('answers a failure of ours with "Something went wrong", keeping the draft', async () => {
		vi.mocked(createQuickSession).mockRejectedValue(new Error('connection reset'));
		vi.spyOn(console, 'error').mockImplementation(() => undefined);

		const formData = makeForm(READY_FIELDS, ['country:FR', 'country:DE']);
		const answer = (await actions.start(makePostEvent(formData))) as DraftAnswer;

		expect(answer.status).toBe(500);
		expect(answer.data?.flash).toEqual({
			tone: 'error',
			message: 'Something went wrong on our side. Please try again.'
		});
		expect(memberNames(answer.data?.draft)).toEqual(['France', 'Germany']);
	});
});
