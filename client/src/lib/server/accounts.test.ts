import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	changeMyEmail,
	changeMyPassword,
	createThrowawayAuthClient,
	deleteMyAccount,
	endThrowawaySession,
	isMyCurrentPassword,
	readPendingEmailChange,
	signInAgain
} from './accounts';

// These tests are about the decisions this module makes with what Supabase
// answers, not about Supabase itself, so every client below is a stand-in with
// only the calls each function actually makes. What the database itself allows
// is tested in `tests/db/organizations.test.ts` and
// `tests/db/security-account-deletion.test.ts`, which cover `delete_my_account`.

/** A stand-in client, cast to the type the functions ask for. */
function asClient(parts: Record<string, unknown>): SupabaseClient {
	return parts as unknown as SupabaseClient;
}

describe('readPendingEmailChange', () => {
	it('gives back the address waiting to be confirmed', async () => {
		const supabase = asClient({
			auth: {
				getUser: async () => ({ data: { user: { new_email: 'new@example.org' } }, error: null })
			}
		});

		expect(await readPendingEmailChange(supabase)).toBe('new@example.org');
	});

	it('says nothing is waiting when the account has no pending address', async () => {
		const supabase = asClient({
			auth: { getUser: async () => ({ data: { user: { new_email: '' } }, error: null }) }
		});

		expect(await readPendingEmailChange(supabase)).toBeNull();
	});

	it('says nothing is waiting when Supabase could not be asked', async () => {
		const supabase = asClient({
			auth: { getUser: async () => ({ data: { user: null }, error: { message: 'offline' } }) }
		});

		// The rest of the settings page still works, so a failure here is quiet
		// rather than an error page.
		expect(await readPendingEmailChange(supabase)).toBeNull();
	});
});

describe('changeMyEmail', () => {
	it('asks Supabase for the new address and says where the link comes back to', async () => {
		const updateUser = vi.fn(async () => ({ error: null }));
		const supabase = asClient({ auth: { updateUser } });

		const problem = await changeMyEmail(
			supabase,
			'new@example.org',
			'http://localhost/auth/confirm?next=%2Fsettings'
		);

		expect(problem).toBeNull();
		expect(updateUser).toHaveBeenCalledWith(
			{ email: 'new@example.org' },
			{ emailRedirectTo: 'http://localhost/auth/confirm?next=%2Fsettings' }
		);
	});

	it('gives back the message when Supabase refuses', async () => {
		const supabase = asClient({
			auth: { updateUser: async () => ({ error: { message: 'Email address already in use' } }) }
		});

		expect(
			await changeMyEmail(supabase, 'taken@example.org', 'http://localhost/auth/confirm')
		).toBe('Email address already in use');
	});
});

describe('createThrowawayAuthClient', () => {
	it('is a client of its own, with nothing stored and no refresh running', () => {
		const throwaway = createThrowawayAuthClient();

		// Nothing more can be checked without Supabase; the point is that it is a
		// client the settings page can sign in on without touching the visitor's
		// own cookies, which `isMyCurrentPassword` below relies on.
		expect(typeof throwaway.auth.signInWithPassword).toBe('function');
		expect(createThrowawayAuthClient()).not.toBe(throwaway);
	});
});

describe('isMyCurrentPassword', () => {
	/** A session the sign-in check mints, which has to be revoked again. */
	const MINTED_SESSION = { access_token: 'a-token' };

	it('is true when the password still signs the person in', async () => {
		const signInWithPassword = vi.fn(async () => ({
			data: { session: MINTED_SESSION },
			error: null
		}));
		const signOut = vi.fn(async () => ({ error: null }));
		const throwaway = asClient({ auth: { signInWithPassword, signOut } });

		expect(await isMyCurrentPassword(throwaway, 'daniel@example.org', 'right')).toBe(true);
		expect(signInWithPassword).toHaveBeenCalledWith({
			email: 'daniel@example.org',
			password: 'right'
		});
	});

	it('revokes the session the check minted, and only that one', async () => {
		const signOut = vi.fn(async () => ({ error: null }));
		const throwaway = asClient({
			auth: {
				signInWithPassword: async () => ({ data: { session: MINTED_SESSION }, error: null }),
				signOut
			}
		});

		await isMyCurrentPassword(throwaway, 'daniel@example.org', 'right');

		// `global` would end the visitor's real session too, which is the one
		// they are using to make this very change.
		expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
	});

	it('is still true when revoking that session fails', async () => {
		const throwaway = asClient({
			auth: {
				signInWithPassword: async () => ({ data: { session: MINTED_SESSION }, error: null }),
				signOut: async () => {
					throw new Error('offline');
				}
			}
		});

		expect(await isMyCurrentPassword(throwaway, 'daniel@example.org', 'right')).toBe(true);
	});

	it('is false when the password does not sign the person in, and signs nothing out', async () => {
		const signOut = vi.fn(async () => ({ error: null }));
		const throwaway = asClient({
			auth: {
				signInWithPassword: async () => ({
					data: { session: null },
					error: { message: 'Invalid login credentials' }
				}),
				signOut
			}
		});

		expect(await isMyCurrentPassword(throwaway, 'daniel@example.org', 'wrong')).toBe(false);
		expect(signOut).not.toHaveBeenCalled();
	});
});

describe('signInAgain', () => {
	it('is true when the password signs the person in, and keeps the session it made', async () => {
		const signInWithPassword = vi.fn(async () => ({
			data: { session: { access_token: 'a-token' } },
			error: null
		}));
		const signOut = vi.fn(async () => ({ error: null }));
		const throwaway = asClient({ auth: { signInWithPassword, signOut } });

		expect(await signInAgain(throwaway, 'daniel@example.org', 'right')).toBe(true);
		expect(signInWithPassword).toHaveBeenCalledWith({
			email: 'daniel@example.org',
			password: 'right'
		});
		// The deletion is asked through this session next, so it must still be there.
		expect(signOut).not.toHaveBeenCalled();
	});

	it('is false when the password does not sign the person in', async () => {
		const throwaway = asClient({
			auth: {
				signInWithPassword: async () => ({
					data: { session: null },
					error: { message: 'Invalid login credentials' }
				})
			}
		});

		expect(await signInAgain(throwaway, 'daniel@example.org', 'wrong')).toBe(false);
	});
});

describe('endThrowawaySession', () => {
	it('ends only the session on the throwaway client', async () => {
		const signOut = vi.fn(async () => ({ error: null }));

		await endThrowawaySession(asClient({ auth: { signOut } }));

		expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
	});

	it('does not throw when ending it fails', async () => {
		const throwaway = asClient({
			auth: {
				signOut: async () => {
					throw new Error('offline');
				}
			}
		});

		await expect(endThrowawaySession(throwaway)).resolves.toBeUndefined();
	});
});

describe('changeMyPassword', () => {
	it('saves the new password', async () => {
		const updateUser = vi.fn(async () => ({ error: null }));
		const supabase = asClient({ auth: { updateUser } });

		expect(await changeMyPassword(supabase, 'a-good-password')).toBeNull();
		expect(updateUser).toHaveBeenCalledWith({ password: 'a-good-password' });
	});

	it('gives back the message when Supabase refuses', async () => {
		const supabase = asClient({
			auth: { updateUser: async () => ({ error: { message: 'Password is too weak' } }) }
		});

		expect(await changeMyPassword(supabase, 'a-good-password')).toBe('Password is too weak');
	});
});

describe('deleteMyAccount', () => {
	it('calls the database function that does it', async () => {
		const rpc = vi.fn(async () => ({ error: null }));
		const supabase = asClient({ rpc });

		expect(await deleteMyAccount(supabase)).toBeNull();
		expect(rpc).toHaveBeenCalledWith('delete_my_account');
	});

	it('passes on a refusal the database function raised on purpose, as one to show', async () => {
		// `P0001` is what PostgreSQL gives a `raise exception`, and every refusal
		// in `delete_my_account()` is one. PostgREST hands the code on as it stands.
		const supabase = asClient({
			rpc: async () => ({
				error: {
					code: 'P0001',
					message:
						'You are the only head of Lycée Rousseau at Amsterdam MUN. Make another member a head, or withdraw the delegation, before deleting your account.'
				}
			})
		});

		expect(await deleteMyAccount(supabase)).toEqual({
			kind: 'refused',
			message:
				'You are the only head of Lycée Rousseau at Amsterdam MUN. Make another member a head, or withdraw the delegation, before deleting your account.'
		});
	});

	it('calls anything else a failure, whose message is for the log', async () => {
		const supabase = asClient({
			rpc: async () => ({ error: { code: 'PGRST301', message: 'JWT expired' } })
		});

		expect(await deleteMyAccount(supabase)).toEqual({ kind: 'failed', message: 'JWT expired' });
	});

	it('calls an error with no code at all a failure too', async () => {
		// A network error from `fetch` arrives without a PostgreSQL code.
		const supabase = asClient({
			rpc: async () => ({ error: { message: 'fetch failed' } })
		});

		expect(await deleteMyAccount(supabase)).toEqual({ kind: 'failed', message: 'fetch failed' });
	});
});
