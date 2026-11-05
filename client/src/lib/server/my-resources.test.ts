import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listMyResources } from './my-resources';
import type { Conference } from '$lib/conferences';
import type { AudienceMembership } from '$lib/schedule';

// `readMyMemberships` and `listConferencesByIds` have their own tests in
// `schedule.test.ts` and `conferences.test.ts`, so they are stood in for here.
// These tests are only about what `listMyResources` itself decides: which
// `documents` rows it asks for, how it matches each one back to its
// conference, the order it puts them in, and that every row it keeps gets a
// signed link. The `documents` query and the storage bucket are a small
// stand-in below, the way `resources.test.ts` does for `$lib/server/resources.ts`.
vi.mock('$lib/server/schedule', () => ({ readMyMemberships: vi.fn() }));
vi.mock('$lib/server/conferences', () => ({ listConferencesByIds: vi.fn() }));

import { listConferencesByIds } from '$lib/server/conferences';
import { readMyMemberships } from '$lib/server/schedule';

/** A conference the reader is a delegate of. */
const CONFERENCE_A = {
	id: 'conf-a',
	slug: 'delftmun-2027',
	name: 'DelftMUN 2027',
	logoPath: 'conf-a/logo.png'
} as unknown as Conference;

/** A second conference, where the reader chairs one committee. */
const CONFERENCE_B = {
	id: 'conf-b',
	slug: 'lse-mun-2027',
	name: 'LSE MUN 2027',
	logoPath: null
} as unknown as Conference;

/** How the reader is part of both conferences. `listMyResources` only reads its keys. */
const MEMBERSHIPS = new Map<string, AudienceMembership>([
	['conf-a', { isOrganiser: false, isParticipant: true, isStaff: false, committeeIds: [] }],
	[
		'conf-b',
		{ isOrganiser: false, isParticipant: false, isStaff: true, committeeIds: ['committee-b'] }
	]
]);

/** One `documents` row of a conference-level resource, belonging to conference A. */
const RESOURCE_ROW = {
	id: 'doc-resource',
	conference_id: 'conf-a',
	kind: 'resource',
	title: 'Rules of Procedure',
	file_name: 'rop.pdf',
	file_size_bytes: 1200,
	mime_type: 'application/pdf',
	storage_path: 'conf-a/resources/a.pdf',
	committees: null
};

/** One `documents` row of a background guide, which carries its committee, of conference B. */
const GUIDE_ROW = {
	id: 'doc-guide',
	conference_id: 'conf-b',
	kind: 'background_guide',
	title: 'UNSC Background Guide',
	file_name: 'unsc.pdf',
	file_size_bytes: 3400,
	mime_type: 'application/pdf',
	storage_path: 'conf-b/background-guides/b.pdf',
	committees: { abbreviation: 'UNSC', name: 'Security Council' }
};

/**
 * A stand-in Supabase client that answers every `documents` query with fixed
 * rows and signs whatever storage paths it is given, the same shape
 * `resources.test.ts` uses for `$lib/server/resources.ts`.
 */
function createStandInSupabase(
	documentRows: Record<string, unknown>[],
	options: { signsEverything?: boolean } = {}
) {
	const signsEverything = options.signsEverything ?? true;
	const signedPaths: string[] = [];

	function from(table: string) {
		if (table !== 'documents') {
			throw new Error(`listMyResources should not query "${table}".`);
		}

		const builder = {
			select: () => builder,
			in: () => builder,
			overrideTypes: () => Promise.resolve({ data: documentRows, error: null })
		};

		return builder;
	}

	const bucket = {
		createSignedUrls: (paths: string[]) => {
			signedPaths.push(...paths);

			if (!signsEverything) {
				// Storage refused every path, the way it does for one that no
				// longer exists: `createDownloadLinks` then leaves the map empty.
				return Promise.resolve({ data: [], error: null });
			}

			return Promise.resolve({
				data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}`, error: null })),
				error: null
			});
		}
	};

	const supabase = { from, storage: { from: () => bucket } } as unknown as SupabaseClient;

	return { supabase, signedPaths };
}

beforeEach(() => {
	vi.mocked(readMyMemberships).mockResolvedValue(MEMBERSHIPS);
	vi.mocked(listConferencesByIds).mockResolvedValue([CONFERENCE_A, CONFERENCE_B]);
});

describe('listMyResources', () => {
	it('asks the other two queries only for the conferences the reader is part of', async () => {
		const { supabase } = createStandInSupabase([]);

		await listMyResources(supabase, 'user-1');

		expect(readMyMemberships).toHaveBeenCalledWith(supabase, 'user-1');
		expect(listConferencesByIds).toHaveBeenCalledWith(supabase, ['conf-a', 'conf-b']);
	});

	it('answers with nothing, and asks no further query, for somebody in no conference', async () => {
		vi.mocked(readMyMemberships).mockResolvedValue(new Map());
		const { supabase } = createStandInSupabase([]);

		const resources = await listMyResources(supabase, 'user-1');

		expect(resources).toEqual([]);
		expect(listConferencesByIds).not.toHaveBeenCalled();
	});

	it('reads a resource and a background guide, each with its own conference, soonest conference first', async () => {
		// Given out of order, to prove the grouping is not just echoing the query.
		const { supabase } = createStandInSupabase([GUIDE_ROW, RESOURCE_ROW]);

		const resources = await listMyResources(supabase, 'user-1');

		expect(resources).toEqual([
			{
				id: 'doc-resource',
				title: 'Rules of Procedure',
				fileName: 'rop.pdf',
				fileSizeBytes: 1200,
				mimeType: 'application/pdf',
				kind: 'resource',
				conferenceId: 'conf-a',
				conferenceName: 'DelftMUN 2027',
				conferenceSlug: 'delftmun-2027',
				conferenceLogoPath: 'conf-a/logo.png',
				committeeLabel: null,
				downloadUrl: 'https://signed/conf-a/resources/a.pdf'
			},
			{
				id: 'doc-guide',
				title: 'UNSC Background Guide',
				fileName: 'unsc.pdf',
				fileSizeBytes: 3400,
				mimeType: 'application/pdf',
				kind: 'background_guide',
				conferenceId: 'conf-b',
				conferenceName: 'LSE MUN 2027',
				conferenceSlug: 'lse-mun-2027',
				conferenceLogoPath: null,
				committeeLabel: 'UNSC',
				downloadUrl: 'https://signed/conf-b/background-guides/b.pdf'
			}
		]);
	});

	it('orders two files of the same conference by title', async () => {
		const secondResourceOfConferenceA = {
			...RESOURCE_ROW,
			id: 'doc-a2',
			title: 'Venue Map',
			storage_path: 'conf-a/resources/b.pdf'
		};

		const { supabase } = createStandInSupabase([secondResourceOfConferenceA, RESOURCE_ROW]);

		const resources = await listMyResources(supabase, 'user-1');

		expect(resources.map((resource) => resource.title)).toEqual([
			'Rules of Procedure',
			'Venue Map'
		]);
	});

	it('reads a committee with no abbreviation by its name instead', async () => {
		const namedOnlyCommittee = {
			...GUIDE_ROW,
			committees: { abbreviation: null, name: 'Security Council' }
		};
		const { supabase } = createStandInSupabase([namedOnlyCommittee]);

		const resources = await listMyResources(supabase, 'user-1');

		expect(resources[0].committeeLabel).toBe('Security Council');
	});

	it('leaves out a document whose conference could not be read', async () => {
		const orphanRow = { ...RESOURCE_ROW, conference_id: 'conf-unknown' };
		const { supabase } = createStandInSupabase([orphanRow]);

		const resources = await listMyResources(supabase, 'user-1');

		expect(resources).toEqual([]);
	});

	it('signs every document it lists in one batch', async () => {
		const { supabase, signedPaths } = createStandInSupabase([RESOURCE_ROW, GUIDE_ROW]);

		await listMyResources(supabase, 'user-1');

		expect(signedPaths).toEqual([RESOURCE_ROW.storage_path, GUIDE_ROW.storage_path]);
	});

	it('leaves the download link null for a path Storage would not sign', async () => {
		const { supabase } = createStandInSupabase([RESOURCE_ROW], { signsEverything: false });

		const resources = await listMyResources(supabase, 'user-1');

		expect(resources[0].downloadUrl).toBeNull();
	});
});
