import { redirect } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape `load` is given.
import type { PageServerLoadEvent } from './$types';
import type { ResourceListItem } from '$lib/resources';

// `listMyResources` has its own tests in `$lib/server/my-resources.test.ts`,
// so it is stood in for here. These tests are only about what `load` itself
// decides: who it is for, and how the reader's files are grouped and filtered
// once `listMyResources` has answered. `$lib/resources.ts` is deliberately not
// stood in for: `groupResourcesByConference` and `resourceConferenceOptions`
// are pure, and running the real ones is what proves this page agrees with
// them about what a group looks like.
vi.mock('$lib/server/access', () => ({ requireOnboarded: vi.fn() }));
vi.mock('$lib/server/my-resources', () => ({ listMyResources: vi.fn() }));

import { requireOnboarded } from '$lib/server/access';
import { listMyResources } from '$lib/server/my-resources';

/** The Supabase client. `load` only hands it on. */
const SUPABASE = {};

/** Somebody signed in who has finished onboarding, as `requireOnboarded` returns them. */
const SIGNED_IN_USER = { id: 'user-1', email: 'daniel@example.com' };

/** A file of "DelftMUN 2027". */
const RULES_OF_PROCEDURE: ResourceListItem = {
	id: 'doc-1',
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
	downloadUrl: 'https://signed/rop.pdf'
};

/** A file of a second conference, "LSE MUN 2027". */
const TEMPLATE: ResourceListItem = {
	...RULES_OF_PROCEDURE,
	id: 'doc-2',
	title: 'Position Paper Template',
	conferenceId: 'conf-b',
	conferenceName: 'LSE MUN 2027',
	conferenceSlug: 'lse-mun-2027',
	conferenceLogoPath: null,
	downloadUrl: 'https://signed/template.pdf'
};

/**
 * The few pieces of a request that `load` here actually reads.
 *
 * SvelteKit hands it a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeLoadEvent(search = ''): PageServerLoadEvent {
	return {
		url: new URL(`http://localhost/resources${search}`),
		locals: { supabase: SUPABASE }
	} as unknown as PageServerLoadEvent;
}

/**
 * The redirect `requireOnboarded` throws at a visitor who is not signed in,
 * with this page as the one to come back to afterwards.
 */
function loginRedirect(): unknown {
	try {
		redirect(303, '/login?next=%2Fresources');
	} catch (thrown) {
		return thrown;
	}

	throw new Error('Nothing was thrown, so there is no redirect to hand on.');
}

/**
 * Run something that is expected to redirect, and give back the redirect.
 *
 * Since `redirect` throws, catching it is the only way to see where it was
 * sending the reader.
 */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

/** What `load` answered, as much of it as these tests look at. */
type LoadedResources = {
	groups: { conferenceId: string; conferenceSlug: string; conferenceName: string }[];
	conferenceOptions: { value: string; label: string }[];
	conferenceFilter: string;
};

beforeEach(() => {
	vi.mocked(requireOnboarded).mockResolvedValue(SIGNED_IN_USER);
	vi.mocked(listMyResources).mockResolvedValue([RULES_OF_PROCEDURE, TEMPLATE]);
});

describe('load', () => {
	it('sends a visitor who is not signed in to the sign in page, with this page to come back to', async () => {
		vi.mocked(requireOnboarded).mockRejectedValue(loginRedirect());

		const thrown = await catchRedirect(() => load(makeLoadEvent()));

		expect(thrown.status).toBe(303);
		expect(thrown.location).toBe('/login?next=%2Fresources');
		expect(listMyResources).not.toHaveBeenCalled();
	});

	it('asks for the resources of the signed-in reader', async () => {
		await load(makeLoadEvent());

		expect(listMyResources).toHaveBeenCalledWith(SUPABASE, SIGNED_IN_USER.id);
	});

	it('groups the resources by conference', async () => {
		const result = (await load(makeLoadEvent())) as LoadedResources;

		expect(result.groups.map((group) => group.conferenceName)).toEqual([
			'DelftMUN 2027',
			'LSE MUN 2027'
		]);
	});

	it('offers "All conferences" plus one option per conference the reader has a file of', async () => {
		const result = (await load(makeLoadEvent())) as LoadedResources;

		expect(result.conferenceOptions).toEqual([
			{ value: '', label: 'All conferences' },
			{ value: 'delftmun-2027', label: 'DelftMUN 2027' },
			{ value: 'lse-mun-2027', label: 'LSE MUN 2027' }
		]);
	});

	it('reads the filter as empty when the address carries none', async () => {
		const result = (await load(makeLoadEvent())) as LoadedResources;

		expect(result.conferenceFilter).toBe('');
	});

	it('narrows the groups to the one conference `?conference=` names', async () => {
		const result = (await load(makeLoadEvent('?conference=lse-mun-2027'))) as LoadedResources;

		expect(result.groups.map((group) => group.conferenceSlug)).toEqual(['lse-mun-2027']);
		expect(result.conferenceFilter).toBe('lse-mun-2027');
	});

	it('still offers every conference in the filter, even while one is chosen', async () => {
		const result = (await load(makeLoadEvent('?conference=lse-mun-2027'))) as LoadedResources;

		expect(result.conferenceOptions).toHaveLength(3);
	});

	it('is an empty list of groups, not an error, when the filter matches nothing', async () => {
		const result = (await load(makeLoadEvent('?conference=does-not-exist'))) as LoadedResources;

		expect(result.groups).toEqual([]);
	});
});
