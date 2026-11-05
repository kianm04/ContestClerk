import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the action are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { CreationDraft, CreationOrganization } from '$lib/creation-draft';
import type { LaunchImprovement } from '$lib/creation-readiness';
import { NO_PERMISSIONS, type MyPermissions } from '$lib/permissions';

// The gate, the queries and the flash cookie are stood in for, so these tests
// are about what `load` and the `publish` action decide. `$lib/creation-readiness`
// is not: it is pure, and running the real rules is what proves the page and
// the action agree about whether a conference may go public.
vi.mock('$lib/server/access', () => ({ requirePermission: vi.fn(), requireUser: vi.fn() }));
vi.mock('$lib/server/my-permissions', () => ({ readMyPermissions: vi.fn() }));

vi.mock('$lib/server/creation', () => ({
	countDraftFacts: vi.fn(),
	getCreationDraft: vi.fn(),
	publishDraft: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requirePermission, requireUser } from '$lib/server/access';
import { countDraftFacts, getCreationDraft, publishDraft } from '$lib/server/creation';
import { setFlash } from '$lib/server/flash';
import { readMyPermissions } from '$lib/server/my-permissions';

/** The Supabase client. `load` and the action only hand it on. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

/** A draft that may go public: dates chosen, a city, the venue still to be announced. */
const DRAFT: CreationDraft = {
	id: 'draft-1',
	slug: 'tu-delft-mun-2027',
	name: 'TU Delft MUN 2027',
	tagline: null,
	description: null,
	organizationId: 'org-1',
	status: 'draft',
	creationStep: 'launch',
	locationMode: 'in_person',
	city: 'Delft',
	countryCode: 'NL',
	countryName: 'Netherlands',
	venueStatus: 'tba',
	venueName: null,
	venueAddress: null,
	startDate: '2099-04-16',
	endDate: '2099-04-18',
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
	applicationsCloseAt: '2099-04-02T21:59:00Z',
	acceptsIndividualApplications: true,
	acceptsDelegations: true,
	committeePreferenceCount: 3,
	askMotivation: false,
	positionPaperRequired: false,
	prefillSources: { start_date: 'user' },
	updatedAt: '2026-10-04T10:00:00Z'
};

/** A draft started without an earlier edition, still on its placeholder dates. */
const UNDATED_DRAFT: CreationDraft = { ...DRAFT, prefillSources: { start_date: 'system_default' } };

const ORGANIZATION: CreationOrganization = {
	id: 'org-1',
	slug: 'tu-delft-mun',
	name: 'TU Delft MUN',
	city: 'Delft',
	countryCode: 'NL',
	countryName: 'Netherlands',
	logoPath: null,
	websiteUrl: null,
	isStripeConnected: false,
	lastConference: null
};

/** Nothing attached to the draft yet. */
const NO_FACTS = { committeeCount: 0, questionCount: 0, feeCount: 0, firstFee: null };

/** A reader whose role manages every committee of the draft. */
const MANAGES_EVERY_COMMITTEE: MyPermissions = {
	held: [{ permission: 'manage_committees', scope: 'conference' }],
	committeeIds: [],
	rank: 0
};

/** The few pieces of a request `load` and the action read; the cast says "this is enough". */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		params: { slug: DRAFT.slug },
		url: new URL(`http://localhost/create/${DRAFT.slug}/launch`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		...overrides
	};
}

/** `load`'s event, whose `parent()` answers with what the layout returned. */
function makeLoadEvent(draft: CreationDraft): PageServerLoadEvent {
	return makeEvent({
		parent: async () => ({
			draft,
			organization: ORGANIZATION,
			previous: null,
			now: '2026-10-04T12:00:00Z'
		})
	}) as unknown as PageServerLoadEvent;
}

/** A post to the `publish` action with the radio the organiser picked. */
function makePublishEvent(choice?: string): RequestEvent {
	const formData = new FormData();

	if (choice !== undefined) {
		formData.set('choice', choice);
	}

	return makeEvent({ request: { formData: async () => formData } }) as unknown as RequestEvent;
}

/** Run something that should redirect, and give back where to. `redirect` throws. */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

/** What `fail` gives back. */
type ActionResult = { status?: number; data?: { publishError?: string } };

beforeEach(() => {
	vi.mocked(requirePermission).mockResolvedValue({
		user: { id: 'user-1', email: 'sofia@example.com' },
		conference: {} as never
	});
	vi.mocked(requireUser).mockResolvedValue({ id: 'user-1', email: 'sofia@example.com' });
	vi.mocked(readMyPermissions).mockResolvedValue(MANAGES_EVERY_COMMITTEE);
	vi.mocked(getCreationDraft).mockResolvedValue(DRAFT);
	vi.mocked(countDraftFacts).mockResolvedValue(NO_FACTS);
	vi.mocked(publishDraft).mockReset().mockResolvedValue(undefined);
	vi.mocked(setFlash).mockClear();
});

describe('load', () => {
	it('builds the readiness table, the choices and the preview', async () => {
		const result = await load(makeLoadEvent(DRAFT));

		expect(result).toMatchObject({
			blockers: [],
			choices: { mode: 'manual', note: null },
			publicUrl: '/conferences/tu-delft-mun-2027',
			applicantsSee: [
				{ label: 'Venue', value: 'To be announced' },
				{ label: 'Applications', value: 'Opening soon' },
				{ label: 'Fees', value: 'To be announced' }
			],
			preview: { name: 'TU Delft MUN 2027', organizedBy: 'TU Delft MUN' }
		});
	});

	it('suggests committees only to a reader who manages every committee', async () => {
		const manager = await load(makeLoadEvent(DRAFT));
		vi.mocked(readMyPermissions).mockResolvedValue(NO_PERMISSIONS);
		const editor = await load(makeLoadEvent(DRAFT));

		expect(readMyPermissions).toHaveBeenCalledWith(SUPABASE, 'draft-1', 'user-1');
		// `load` is typed loosely, as any page's data, so the rows are named here.
		const keysOf = (improvements: LaunchImprovement[]) =>
			improvements.map((improvement) => improvement.key);
		expect(keysOf(manager?.improvements)).toContain('committees');
		expect(keysOf(editor?.improvements)).not.toContain('committees');
	});

	it('names what stops a draft on placeholder dates', async () => {
		const result = await load(makeLoadEvent(UNDATED_DRAFT));

		expect(result).toMatchObject({
			blockers: ['Pick the conference dates on the When & where step.']
		});
	});
});

describe('the publish action', () => {
	it('refuses a draft that something still blocks, and publishes nothing', async () => {
		vi.mocked(getCreationDraft).mockResolvedValue(UNDATED_DRAFT);

		const result = (await actions.publish(makePublishEvent('publish'))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.publishError).toBe('Pick the conference dates on the When & where step.');
		expect(publishDraft).not.toHaveBeenCalled();
	});

	it('refuses a conference that is no longer a draft', async () => {
		vi.mocked(getCreationDraft).mockResolvedValue({ ...DRAFT, status: 'published' });

		const result = (await actions.publish(makePublishEvent('publish'))) as ActionResult;

		expect(result.data?.publishError).toBe('Only a draft can be published.');
		expect(publishDraft).not.toHaveBeenCalled();
	});

	it('publishes a manual draft on its own and goes to the management area', async () => {
		const redirect = await catchRedirect(() => actions.publish(makePublishEvent('publish')));

		expect(redirect).toMatchObject({ status: 303, location: '/manage/tu-delft-mun-2027' });
		expect(publishDraft).toHaveBeenCalledWith(SUPABASE, DRAFT, 'publish', expect.any(Date));
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'TU Delft MUN 2027 is now public.'
		});
	});

	it('opens applications too when asked and committees exist', async () => {
		vi.mocked(countDraftFacts).mockResolvedValue({ ...NO_FACTS, committeeCount: 3 });

		await catchRedirect(() => actions.publish(makePublishEvent('publish_and_open')));

		expect(publishDraft).toHaveBeenCalledWith(
			SUPABASE,
			DRAFT,
			'publish_and_open',
			expect.any(Date)
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'TU Delft MUN 2027 is now public and taking applications.'
		});
	});

	it('will not open applications that ask for committees when there are none', async () => {
		const result = (await actions.publish(makePublishEvent('publish_and_open'))) as ActionResult;

		expect(result.data?.publishError).toBe(
			'Add committees before opening applications, or set committee preferences to none.'
		);
		expect(publishDraft).not.toHaveBeenCalled();
	});

	it('opens applications for on_publish whatever the form says, and keeps a schedule', async () => {
		const onPublish = { ...DRAFT, applicationOpenMode: 'on_publish' as const };
		vi.mocked(getCreationDraft).mockResolvedValue(onPublish);
		vi.mocked(countDraftFacts).mockResolvedValue({ ...NO_FACTS, committeeCount: 3 });

		await catchRedirect(() => actions.publish(makePublishEvent('publish')));
		expect(publishDraft).toHaveBeenLastCalledWith(
			SUPABASE,
			onPublish,
			'publish_and_open',
			expect.any(Date)
		);

		const scheduled = { ...DRAFT, applicationOpenMode: 'scheduled' as const };
		vi.mocked(getCreationDraft).mockResolvedValue(scheduled);

		await catchRedirect(() => actions.publish(makePublishEvent('publish_and_open')));
		expect(publishDraft).toHaveBeenLastCalledWith(SUPABASE, scheduled, 'publish', expect.any(Date));
	});

	it('says so when the database refuses', async () => {
		vi.mocked(publishDraft).mockRejectedValue(new Error('conferences_place_unless_quick_session'));

		const result = (await actions.publish(makePublishEvent('publish'))) as ActionResult;

		expect(result.data?.publishError).toBe(
			'The conference could not be published. Check the When & where step.'
		);
		expect(setFlash).not.toHaveBeenCalled();
	});
});
