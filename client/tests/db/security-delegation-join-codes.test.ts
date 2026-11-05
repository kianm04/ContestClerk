import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addDelegation,
	createOpenConferenceOwnedByMe,
	whileTheConferenceIsJoinable,
	type ConferenceFixture
} from './conference-fixtures';

// Migration 20261022161000_delegation_join_code_limit.sql, for finding L24 of
// docs/security-review-2026-10-10.md. preview_delegation and join_delegation
// both say whether a code belongs to a delegation, so both write a wrong code
// down in delegation_code_attempts, and private.limit_delegation_code_guesses,
// which each of them asks first, refuses a person who has sent ten wrong codes
// in the last hour. A wrong code is answered without an exception, because an
// exception would roll the attempt back with it.
//
// The same migration gave every delegation still holding a code shorter than
// ten characters a new one. That is a one-off update to the rows there were,
// so nothing here can run it again; the length of a new code is tested in
// delegations.test.ts.

/** A code in the alphabet create_delegation draws from that no delegation has. */
const WRONG_CODE = 'ZZZZZZZZZZ';

const TOO_MANY = 'Too many wrong codes';

/** A head's delegation in an open conference, and the code they share. */
async function createDelegationWithCode(): Promise<{
	conference: ConferenceFixture;
	delegationId: string;
	code: string;
}> {
	const conference = await createOpenConferenceOwnedByMe();
	const head = await createSignedInClient('Rachel Adeyemi');
	const delegationId = await addDelegation(head.supabase, conference.conferenceId);

	const { data, error } = await head.supabase
		.from('delegations')
		.select('join_code')
		.eq('id', delegationId)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the join code: ${error?.message}`);
	}

	return { conference, delegationId, code: data.join_code };
}

function preview(person: SignedInClient, code: string) {
	return person.supabase.rpc('preview_delegation', { code });
}

function join(person: SignedInClient, code: string) {
	return person.supabase.rpc('join_delegation', { code });
}

/** Send `count` wrong codes, half to each function, and check none was refused. */
async function sendWrongCodes(person: SignedInClient, count: number) {
	for (let attempt = 1; attempt <= count; attempt += 1) {
		const { error } = await (attempt % 2 === 0
			? preview(person, WRONG_CODE)
			: join(person, WRONG_CODE));
		expect(error).toBeNull();
	}
}

describe('delegation join codes (L24): preview_delegation, join_delegation and private.limit_delegation_code_guesses', () => {
	it('answers a wrong code from either function with nothing, and not with an exception', async () => {
		const guesser = await createSignedInClient('Youssef Benali');

		const previewed = await preview(guesser, WRONG_CODE);
		expect(previewed.error).toBeNull();
		expect(previewed.data).toEqual([]);

		// Null and not "That join code does not belong to a delegation", because
		// the exception would roll back the attempt the function writes down.
		const joined = await join(guesser, WRONG_CODE);
		expect(joined.error).toBeNull();
		expect(joined.data).toBeNull();
	});

	it('refuses the eleventh code in an hour, to either function, right or wrong, and only for that person', async () => {
		const { conference, delegationId, code } = await createDelegationWithCode();
		const guesser = await createSignedInClient('Youssef Benali');
		const friend = await createSignedInClient('Amara Okafor');

		// Five to each function: the two keep one count between them.
		await sendWrongCodes(guesser, 10);

		// The cap is asked before the code is looked up, so the eleventh try
		// learns nothing even when it happens to be right.
		const { error: previewLocked } = await preview(guesser, code);
		expect(previewLocked?.message).toContain(TOO_MANY);

		const { error: joinLocked } = await whileTheConferenceIsJoinable(conference, () =>
			join(guesser, code)
		);
		expect(joinLocked?.message).toContain(TOO_MANY);

		// Somebody else is not locked out by the guesser's attempts.
		const { data: friendPreview, error: friendPreviewError } = await preview(friend, code);
		expect(friendPreviewError).toBeNull();
		expect(friendPreview).toHaveLength(1);

		const { data: joinedId, error: friendJoinError } = await whileTheConferenceIsJoinable(
			conference,
			() => join(friend, code)
		);
		expect(friendJoinError).toBeNull();
		expect(joinedId).toBe(delegationId);
	});

	it('does not count the right code, however often it is looked up', async () => {
		const { code } = await createDelegationWithCode();
		const student = await createSignedInClient('Youssef Benali');

		// The join page looks the code up every time it is drawn, so somebody
		// coming back to a good link must never use up their wrong codes.
		for (let lookup = 1; lookup <= 12; lookup += 1) {
			const { data, error } = await preview(student, code);
			expect(error).toBeNull();
			expect(data).toHaveLength(1);
		}

		const { error } = await preview(student, WRONG_CODE);
		expect(error).toBeNull();
	});

	it('counts wrong codes sent all at once one by one, so a burst gets no more than the cap', async () => {
		const guesser = await createSignedInClient('Youssef Benali');

		// Five wrong codes first, so five are left in the hour.
		await sendWrongCodes(guesser, 5);

		// Then thirty at the same moment, to both functions. Without the lock,
		// every request the API runs side by side counts the same five before any
		// of them has written its own, and as many as it runs at once get through
		// to the lookup.
		const outcomes = await Promise.all(
			Array.from({ length: 30 }, (_, index) =>
				index % 2 === 0 ? preview(guesser, WRONG_CODE) : join(guesser, WRONG_CODE)
			)
		);

		const answered = outcomes.filter((outcome) => outcome.error === null);
		const refused = outcomes.filter((outcome) => outcome.error?.message.includes(TOO_MANY));
		expect(answered).toHaveLength(5);
		expect(refused).toHaveLength(25);
	});

	it('forgets a wrong code once it is an hour old', async () => {
		const guesser = await createSignedInClient('Youssef Benali');

		await sendWrongCodes(guesser, 10);

		const { error: locked } = await preview(guesser, WRONG_CODE);
		expect(locked?.message).toContain(TOO_MANY);

		// No browser may write an attempt, so the service role makes these ten an
		// hour and a minute old, as waiting would.
		const anHourAndAMinuteAgo = new Date(Date.now() - 61 * 60 * 1000).toISOString();
		const { error: ageError } = await createServiceRoleClient()
			.from('delegation_code_attempts')
			.update({ attempted_at: anHourAndAMinuteAgo })
			.eq('user_id', guesser.userId);
		expect(ageError).toBeNull();

		const { data, error } = await preview(guesser, WRONG_CODE);
		expect(error).toBeNull();
		expect(data).toEqual([]);
	});

	it('keeps the attempts out of every browser, so nobody can read or clear their own', async () => {
		const guesser = await createSignedInClient('Youssef Benali');
		await sendWrongCodes(guesser, 2);

		const attempts = (supabase: SupabaseClient) => supabase.from('delegation_code_attempts');

		const { error: readError } = await attempts(guesser.supabase).select('id');
		expect(readError?.message).toContain('permission denied');

		const { error: deleteError } = await attempts(guesser.supabase)
			.delete()
			.eq('user_id', guesser.userId);
		expect(deleteError?.message).toContain('permission denied');

		const { error: insertError } = await attempts(guesser.supabase).insert({
			user_id: guesser.userId
		});
		expect(insertError?.message).toContain('permission denied');
	});
});
