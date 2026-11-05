import { error, type RequestEvent } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { countryMember, memberFromName, QUICK_SESSION_MESSAGES } from '$lib/quick-session';
import { quickSessionDraftActions } from './quick-session-actions';

// `$lib/quick-session.ts` is pure and runs for real, and is tested in depth
// beside itself. These tests are about what the factory promises both quick
// session pages: every action asks the page's access rule first, reads the
// whole posted draft, and answers with the changed draft, or with a 400
// carrying the draft and its message when the change is refused.

/** A post to a quick session page, carrying `fields` and one hidden `member` field per member. */
function makeEvent(fields: Record<string, string>, members: string[] = []): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) formData.set(name, value);
	for (const member of members) formData.append('member', member);

	return {
		url: new URL('http://localhost/quick/new'),
		locals: {},
		request: { formData: async () => formData }
	} as unknown as RequestEvent;
}

/** The actions with an access rule that lets everybody in, and that rule, to ask what it was given. */
function makeActions() {
	const checkAccess = vi.fn(async () => undefined);

	return { actions: quickSessionDraftActions(checkAccess), checkAccess };
}

/** The names of the members a successful answer's draft holds, in its order. */
function memberNames(answer: unknown): string[] {
	const { draft } = answer as { draft: { members: { name: string }[] } };

	return draft.members.map((member) => member.name);
}

describe('quickSessionDraftActions', () => {
	it('asks the access rule about the request before reading the form', async () => {
		const { actions, checkAccess } = makeActions();
		const event = makeEvent({ q: 'fra' });

		await actions.search(event);

		expect(checkAccess).toHaveBeenCalledWith(event);
	});

	it('lets the access rule’s refusal through and reads nothing', async () => {
		// `error` throws, so the rule refuses the moment it is asked.
		const actions = quickSessionDraftActions(async () => error(404, 'Not found.'));
		const formData = vi.fn();
		const event = { request: { formData } } as unknown as RequestEvent;

		await expect(actions.clearMembers(event)).rejects.toMatchObject({ status: 404 });
		expect(formData).not.toHaveBeenCalled();
	});

	it('keeps the fields the form posted in the draft it answers with', async () => {
		const { actions } = makeActions();
		const fields = { name: 'Thursday practice', agenda: 'Climate', speakingTime: '2:00', q: 'ger' };

		const answer = await actions.search(makeEvent(fields, ['country:FR']));

		expect(answer).toEqual({
			draft: {
				name: 'Thursday practice',
				agenda: 'Climate',
				speakingTime: '2:00',
				timezone: '',
				search: 'ger',
				members: [countryMember('FR')]
			},
			errors: {}
		});
	});

	it('fills the draft from a ready-made list (`security_council`), replacing the members', async () => {
		const { actions } = makeActions();

		const answer = await actions.fillFromList(
			makeEvent({ list: 'security_council' }, ['name:Amnesty International'])
		);

		expect(memberNames(answer)).toHaveLength(15);
		expect(memberNames(answer)).not.toContain('Amnesty International');
	});

	it('adds a member state with "+" and removes one with "×"', async () => {
		const { actions } = makeActions();

		const added = await actions.addMember(makeEvent({ add: 'country:DE' }, ['country:FR']));
		const removed = await actions.removeMember(
			makeEvent({ remove: 'country:FR' }, ['country:FR', 'country:DE'])
		);

		expect(memberNames(added)).toEqual(['France', 'Germany']);
		expect(memberNames(removed)).toEqual(['Germany']);
	});

	it('adds what is typed in the search box as a member, and empties the box', async () => {
		const { actions } = makeActions();

		const answer = await actions.addCustom(makeEvent({ q: 'Amnesty International' }));

		expect(answer).toMatchObject({
			draft: { search: '', members: [memberFromName('Amnesty International')] },
			errors: {}
		});
	});

	it('refuses a typed name over 80 characters with a 400 that keeps the draft', async () => {
		const { actions } = makeActions();
		const typed = 'a'.repeat(81);

		const answer = await actions.addCustom(makeEvent({ q: typed }, ['country:FR']));

		expect(answer).toMatchObject({
			status: 400,
			data: {
				draft: { search: typed, members: [countryMember('FR')] },
				errors: { custom: QUICK_SESSION_MESSAGES.memberNameTooLong }
			}
		});
	});

	it('clears every member with "Clear all"', async () => {
		const { actions } = makeActions();

		const answer = await actions.clearMembers(makeEvent({}, ['country:FR', 'country:DE']));

		expect(memberNames(answer)).toEqual([]);
	});

	it('adds pasted names, and refuses a paste with a line over 80 characters', async () => {
		const { actions } = makeActions();

		const pasted = await actions.paste(makeEvent({ names: 'germany\nWHO' }, ['country:FR']));
		const refused = await actions.paste(makeEvent({ names: `Brazil\n${'b'.repeat(81)}` }));

		expect(memberNames(pasted)).toEqual(['France', 'Germany', 'WHO']);
		expect(refused).toMatchObject({
			status: 400,
			data: { errors: { paste: QUICK_SESSION_MESSAGES.memberNameTooLong } }
		});
	});
});
