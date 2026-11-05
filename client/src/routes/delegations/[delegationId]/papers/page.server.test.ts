import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route.
import type { PageServerLoadEvent } from './$types';

// The query is stood in for; what `delegation_papers` answers whom is tested
// in `tests/db/delegation-paper-drafts.test.ts`.
vi.mock('$lib/server/access', () => ({ requireOnboarded: vi.fn() }));
vi.mock('$lib/server/delegation-papers', () => ({ listDelegationPapers: vi.fn() }));

import { requireOnboarded } from '$lib/server/access';
import { listDelegationPapers } from '$lib/server/delegation-papers';

const SUPABASE = {};

beforeEach(() => {
	vi.mocked(requireOnboarded).mockResolvedValue({ id: 'member-tom', email: 'tom@example.com' });
	vi.mocked(listDelegationPapers).mockResolvedValue([]);
});

describe('the page load', () => {
	it("lists the delegation's papers for the reader", async () => {
		const event = {
			url: new URL('http://localhost/delegations/delegation-1/papers'),
			locals: { supabase: SUPABASE },
			parent: async () => ({ delegation: { id: 'delegation-1' } })
		} as unknown as PageServerLoadEvent;

		const result = await load(event);

		expect(listDelegationPapers).toHaveBeenCalledWith(SUPABASE, 'delegation-1');
		expect(result).toEqual({ papers: [], readerId: 'member-tom' });
	});
});
