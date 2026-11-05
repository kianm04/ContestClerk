import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NO_MEMBERSHIP } from '$lib/schedule';

// Both reads have tests of their own next to their modules, so these stand in
// for them and check only how the two are put together.
vi.mock('./schedule', () => ({ readMyMemberships: vi.fn() }));
vi.mock('./conferences', () => ({ listConferencesByIds: vi.fn() }));

import { listConferencesByIds } from './conferences';
import { listMyConferences } from './my-conferences';
import { readMyMemberships } from './schedule';

const supabase = {} as SupabaseClient;

describe('listMyConferences', () => {
	it('lists the conferences the reader has a membership of', async () => {
		vi.mocked(readMyMemberships).mockResolvedValue(
			new Map([
				['conference-geneva', NO_MEMBERSHIP],
				['conference-oslo', NO_MEMBERSHIP]
			])
		);
		vi.mocked(listConferencesByIds).mockResolvedValue([]);

		await listMyConferences(supabase, 'user-1');

		expect(readMyMemberships).toHaveBeenCalledWith(supabase, 'user-1');
		expect(listConferencesByIds).toHaveBeenCalledWith(supabase, [
			'conference-geneva',
			'conference-oslo'
		]);
	});
});
