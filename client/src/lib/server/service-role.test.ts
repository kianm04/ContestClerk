import { describe, expect, it, vi } from 'vitest';

// The environment is a stand-in, so these tests need no key and no database.
// `vi.mock` is moved to the top of the file before the imports run, so the
// object it hands out has to be made in `vi.hoisted`, which is moved with it.
const { privateEnvironment } = vi.hoisted(() => ({
	privateEnvironment: { SUPABASE_SERVICE_ROLE_KEY: '' }
}));

vi.mock('$env/dynamic/private', () => ({ env: privateEnvironment }));
vi.mock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' }));

const { createServiceRoleClient } = await import('./service-role');

describe('createServiceRoleClient', () => {
	it('refuses to make a client when the server has no key', () => {
		privateEnvironment.SUPABASE_SERVICE_ROLE_KEY = '';

		expect(() => createServiceRoleClient()).toThrow('SUPABASE_SERVICE_ROLE_KEY is not set.');
	});

	it('makes a client that can reach both the tables and Storage when the key is set', () => {
		privateEnvironment.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-for-tests';

		const client = createServiceRoleClient();

		expect(typeof client.from).toBe('function');
		expect(typeof client.storage.from).toBe('function');
	});
});
