import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreationDraft } from '$lib/creation-draft';
import { requirePermission } from './access';
import { getCreationDraft, updateCreationDraft } from './creation';
import { requireCreationDraft, saveCreationStep } from './creation-step-save';

// The organiser check and the draft's reads and writes have tests of their
// own; here they are stand-ins, so these tests are about what this module
// decides: which draft an action may touch, and what one save writes.
vi.mock('./access', () => ({ requirePermission: vi.fn() }));
vi.mock('./creation', () => ({ getCreationDraft: vi.fn(), updateCreationDraft: vi.fn() }));

/** A draft a returning organiser has just started: dates chosen, the name generated. */
const DRAFT: CreationDraft = {
	id: 'draft-1',
	slug: 'delft-mun-2027',
	name: 'Delft MUN 2027',
	tagline: 'Three days of debate',
	description: null,
	organizationId: 'org-1',
	status: 'draft',
	creationStep: 'basics',
	locationMode: 'in_person',
	city: 'Delft',
	countryCode: 'NL',
	countryName: 'Netherlands',
	venueStatus: 'tba',
	venueName: null,
	venueAddress: null,
	startDate: '2027-04-16',
	endDate: '2027-04-18',
	timezone: 'Europe/Amsterdam',
	conferenceTimeStatus: 'tba',
	startTime: null,
	endTime: null,
	currency: 'EUR',
	level: 'university',
	logoPath: null,
	bannerPath: null,
	contactEmail: null,
	websiteUrl: null,
	instagramUrl: null,
	feeStatus: 'undecided',
	collectsPaymentsManually: false,
	applicationOpenMode: 'manual',
	applicationsOpenAt: null,
	applicationCloseRule: 'relative',
	applicationCloseOffsetDays: -14,
	applicationsCloseAt: '2027-04-02T21:59:00.000Z',
	acceptsIndividualApplications: true,
	acceptsDelegations: true,
	committeePreferenceCount: 3,
	askMotivation: false,
	positionPaperRequired: false,
	prefillSources: {
		name: 'previous_conference',
		tagline: 'previous_conference',
		start_date: 'previous_conference',
		end_date: 'previous_conference',
		timezone: 'organization',
		city: 'organization',
		country_code: 'organization'
	},
	updatedAt: '2026-10-04T10:00:00Z'
};

/** A stand-in client that writes down the venue update it was asked for. */
function venueClient(errorMessage: string | null = null) {
	const updates: { values: Record<string, unknown>; id: unknown }[] = [];
	const client = {
		from: () => ({
			update: (values: Record<string, unknown>) => ({
				eq: async (_column: string, id: unknown) => {
					updates.push({ values, id });
					return { error: errorMessage === null ? null : { message: errorMessage } };
				}
			})
		})
	};

	return { supabase: client as unknown as SupabaseClient, updates };
}

const locals = { supabase: {} } as App.Locals;
const url = new URL('http://localhost/create/delft-mun-2027/basics');

beforeEach(() => {
	vi.mocked(getCreationDraft).mockReset().mockResolvedValue(DRAFT);
	vi.mocked(updateCreationDraft).mockReset();
});

describe('requireCreationDraft', () => {
	it('gives the draft once the organiser check passes', async () => {
		await expect(requireCreationDraft(locals, url, DRAFT.slug)).resolves.toBe(DRAFT);
		expect(requirePermission).toHaveBeenCalledWith(locals, url, DRAFT.slug, 'edit_conference');
	});

	it('answers 404 when there is no draft', async () => {
		vi.mocked(getCreationDraft).mockResolvedValue(null);

		await expect(requireCreationDraft(locals, url, DRAFT.slug)).rejects.toMatchObject({
			status: 404
		});
	});

	it('sends a launched conference to its manage page', async () => {
		vi.mocked(getCreationDraft).mockResolvedValue({ ...DRAFT, status: 'published' });

		await expect(requireCreationDraft(locals, url, DRAFT.slug)).rejects.toMatchObject({
			status: 303,
			location: '/manage/delft-mun-2027'
		});
	});
});

describe('saveCreationStep', () => {
	it('saves the values with the ones that follow, and reads the draft back', async () => {
		const saved = { ...DRAFT, name: 'Delft MUN 2028' };
		vi.mocked(getCreationDraft).mockResolvedValue(saved);
		const { supabase, updates } = venueClient();

		const result = await saveCreationStep(supabase, DRAFT, {
			startDate: '2028-04-14',
			endDate: '2028-04-16'
		});

		expect(result).toBe(saved);
		const [, draftId, patch, sources] = vi.mocked(updateCreationDraft).mock.calls[0];
		expect(draftId).toBe('draft-1');
		expect(patch).toMatchObject({ startDate: '2028-04-14', name: 'Delft MUN 2028' });
		expect(sources).toMatchObject({ start_date: 'user', name: 'previous_conference' });
		expect(updates).toEqual([]);
	});

	it('saves a changed venue address beside the values', async () => {
		const { supabase, updates } = venueClient();

		await saveCreationStep(supabase, DRAFT, {}, { venueAddress: 'Mekelweg 5' });

		expect(updates).toEqual([{ values: { venue_address: 'Mekelweg 5' }, id: 'draft-1' }]);
	});

	it('reports a venue address the database refused', async () => {
		const { supabase } = venueClient('refused');

		await expect(
			saveCreationStep(supabase, DRAFT, {}, { venueAddress: 'Mekelweg 5' })
		).rejects.toThrow('refused');
	});
});
