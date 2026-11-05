import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import {
	EMPTY_COMMITTEE_FORM,
	type CommitteeFormErrors,
	type CommitteeFormValues
} from '$lib/committee-details';
import type { Conference } from '$lib/conferences';
import type { ManagedOrganization } from '$lib/organizations';

// The gate, the queries and the flash cookie are all stood in for, so these
// tests are about what `load` and the three actions themselves decide.
// `requirePermission` has its own tests in `src/lib/server/access`, and what the
// database allows is tested in `tests/db/`.
//
// `$lib/committee-details` is deliberately not stood in for: it is pure, and
// running the real checks is what proves the page and the `save` action agree
// about which values are allowed.
vi.mock('$lib/server/access', () => ({ requirePermission: vi.fn(), requireManagePage: vi.fn() }));

vi.mock('$lib/server/manage-committees', () => ({
	createCommittee: vi.fn(),
	listCommitteeSlugs: vi.fn(),
	listCommitteesForManage: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requireManagePage, requirePermission } from '$lib/server/access';
import {
	createCommittee,
	listCommitteeSlugs,
	listCommitteesForManage
} from '$lib/server/manage-committees';
import { setFlash } from '$lib/server/flash';
import type { MyPermissions } from '$lib/permissions';

/** What the layout hands down for an organiser: `administrator` opens every page. */
const ADMINISTRATOR: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: -1
};

/** The Supabase client. `load` and the actions only hand it on. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

/** The organiser `requirePermission` answers with. Nothing here reads them. */
const SIGNED_IN_USER = { id: 'user-1', email: 'daniel@example.com' };

/** The conference the new committee is being added to, still a draft. */
const CONFERENCE: Conference = {
	id: '11111111-1111-1111-1111-111111111111',
	slug: 'riverside-mun-2027',
	name: 'Riverside MUN 2027',
	description: null,
	organizationName: 'Riverside MUN Society',
	organizationSlug: 'riverside-mun-society',
	city: 'Delft',
	countryCode: 'NL',
	countryName: 'Netherlands',
	locationMode: 'in_person',
	venueStatus: 'tba',
	conferenceTimeStatus: 'tba',
	startTime: null,
	endTime: null,
	feeStatus: 'undecided',
	applicationOpenMode: 'on_publish',
	startDate: '2027-03-04',
	endDate: '2027-03-07',
	websiteUrl: null,
	bannerPath: null,
	logoPath: null,
	level: 'high_school',
	status: 'draft',
	timezone: 'Europe/Amsterdam',
	expectedDelegates: null,
	applicationsOpenAt: null,
	applicationsCloseAt: null,
	committeeCount: 0,
	committeeNames: [],
	tagline: null,
	venueName: null,
	venueAddress: null,
	contactEmail: null,
	instagramUrl: null,
	contactPhone: null,
	facebookUrl: null,
	linkedinUrl: null,
	youtubeUrl: null,
	tiktokUrl: null,
	language: 'English',
	minAge: null,
	maxAge: null,
	positionPaperRequired: false,
	positionPaperDeadline: null,
	acceptsIndividualApplications: true,
	acceptsDelegations: true
};

/** The same conference once it is public, which is when a topic is required. */
const PUBLISHED_CONFERENCE: Conference = { ...CONFERENCE, status: 'published' };

/** The organisation that runs it. The layout reads it; this page only passes it on. */
const ORGANIZATION: ManagedOrganization = {
	id: '22222222-2222-2222-2222-222222222222',
	name: 'Riverside MUN Society',
	slug: 'riverside-mun-society',
	logoPath: null,
	isStripeConnected: false
};

/**
 * The two committees the conference already has.
 *
 * `save` only counts them, to work out where the new one goes, so a stand-in
 * row with an id is enough and the cast below says exactly that.
 */
const EXISTING_COMMITTEES = [{ id: 'committee-1' }, { id: 'committee-2' }] as unknown as Awaited<
	ReturnType<typeof listCommitteesForManage>
>;

/** The id `createCommittee` answers with, which is where the organiser is sent. */
const NEW_COMMITTEE_ID = '33333333-3333-3333-3333-333333333333';

/** That committee's own editor: where a save that worked ends up. */
const NEW_COMMITTEE_PATH = `/manage/riverside-mun-2027/committees/${NEW_COMMITTEE_ID}`;

/** A form in which every field holds something the server accepts. */
const VALID_FORM: Record<string, string> = {
	name: 'Security Council',
	abbreviation: 'UNSC',
	slug: 'security-council',
	description: 'The council that keeps the peace.',
	level: 'advanced',
	room: 'Committee Room 1',
	defaultSpeakingTimeSeconds: '90'
};

/** The topic rows that form sends, unless a test says otherwise. */
const VALID_TOPICS = ['Climate finance', ''];

/**
 * The few pieces of a request that `load` and the actions here actually read.
 *
 * SvelteKit hands them a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		params: { slug: CONFERENCE.slug },
		url: new URL(`http://localhost/manage/${CONFERENCE.slug}/committees/new`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		...overrides
	};
}

/**
 * That stand-in, as the `load` function's own event type.
 *
 * `parent()` is how a page's `load` reads what the layout above it returned.
 * This `load` never asks for it, but the stand-in carries it so that a version
 * of the page that did would still be given something to read.
 */
function makeLoadEvent(): PageServerLoadEvent {
	return makeEvent({
		parent: async () => ({
			conference: CONFERENCE,
			organization: ORGANIZATION,
			permissions: ADMINISTRATOR
		})
	}) as unknown as PageServerLoadEvent;
}

/**
 * A post to one of the three actions, carrying these fields and these topic
 * rows, with `search` for the query string a topic button adds to the address.
 */
function makeFormEvent(
	fields: Record<string, string> = VALID_FORM,
	topics: string[] = VALID_TOPICS,
	search = ''
): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	// Every row of the topics editor is sent under the one name `topics[]`, so
	// they are appended one by one rather than set, which would keep only the last.
	for (const topic of topics) {
		formData.append('topics[]', topic);
	}

	return makeEvent({
		url: new URL(`http://localhost/manage/${CONFERENCE.slug}/committees/new${search}`),
		request: { formData: async () => formData }
	}) as unknown as RequestEvent;
}

/**
 * Run something that is expected to redirect, and give back the redirect.
 *
 * SvelteKit's `redirect` works by throwing rather than by returning, so
 * catching it is the only way to see where it was sending the reader.
 */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

/** What an action answers with: `fail` wraps it in `{ status, data }`, the rest do not. */
type ActionResult = {
	status?: number;
	data?: ActionAnswer;
} & ActionAnswer;

/** The shape every action on this page answers in. */
type ActionAnswer = {
	values?: CommitteeFormValues | null;
	errors?: CommitteeFormErrors;
	message?: string | null;
};

beforeEach(() => {
	vi.mocked(requirePermission).mockResolvedValue({
		user: SIGNED_IN_USER,
		conference: CONFERENCE
	});
	vi.mocked(listCommitteeSlugs).mockResolvedValue([]);
	vi.mocked(listCommitteesForManage).mockResolvedValue(EXISTING_COMMITTEES);
	vi.mocked(createCommittee).mockResolvedValue(NEW_COMMITTEE_ID);
	vi.mocked(setFlash).mockClear();
});

describe('load', () => {
	/* `toMatchObject` rather than reading a field off the answer: SvelteKit
	   types every `load` as allowed to return nothing at all, so the answer is
	   compared as a whole instead of being narrowed first. */
	it('hands the page an empty form, with one topic row to type into', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ values: EMPTY_COMMITTEE_FORM });
	});

	it('works from what the layout already read, and does not check again', async () => {
		await load(makeLoadEvent());

		// The layout read the reader's permissions once; the page checks its own
		// line against them instead of asking the database a second time.
		expect(requirePermission).not.toHaveBeenCalled();
		expect(requireManagePage).toHaveBeenCalledWith(ADMINISTRATOR, 'committees');
		expect(createCommittee).not.toHaveBeenCalled();
	});
});

describe('the save action', () => {
	it('refuses a committee with no name, and creates nothing', async () => {
		const withoutName = { ...VALID_FORM, name: '' };

		const result = (await actions.save(makeFormEvent(withoutName))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.errors?.name).toBe("Please enter the committee's name.");
		expect(result.data?.message).toBeNull();
		expect(createCommittee).not.toHaveBeenCalled();
	});

	it('sends back what was typed, so a refused form keeps it', async () => {
		const withoutLevel = { ...VALID_FORM, level: '' };

		const result = (await actions.save(makeFormEvent(withoutLevel))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.errors?.level).toBe('Please pick a level.');
		expect(result.data?.values?.room).toBe('Committee Room 1');
		expect(result.data?.values?.topics).toEqual(VALID_TOPICS);
	});

	it('makes the link from the name when the organiser left it empty', async () => {
		const withoutSlug = { ...VALID_FORM, name: 'Historical Security Council', slug: '' };

		await catchRedirect(() => actions.save(makeFormEvent(withoutSlug)));

		expect(createCommittee).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			expect.objectContaining({ slug: 'historical-security-council' }),
			expect.anything()
		);
	});

	it('gives a name no link can be made from the link "committee" rather than an empty one', async () => {
		// `slugify` keeps only a-z and 0-9, so a Cyrillic name leaves nothing, and
		// the `committees` table refuses an empty slug (`committees_slug_shape`).
		const cyrillic = { ...VALID_FORM, name: 'Совет Безопасности', slug: '' };

		await catchRedirect(() => actions.save(makeFormEvent(cyrillic)));

		expect(createCommittee).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			expect.objectContaining({ slug: 'committee' }),
			expect.anything()
		);
	});

	it('keeps the link the organiser typed', async () => {
		await catchRedirect(() => actions.save(makeFormEvent()));

		expect(createCommittee).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			expect.objectContaining({ slug: 'security-council' }),
			expect.anything()
		);
	});

	it('refuses a link another committee already uses', async () => {
		vi.mocked(listCommitteeSlugs).mockResolvedValue(['security-council']);

		const result = (await actions.save(makeFormEvent())) as ActionResult;

		expect(listCommitteeSlugs).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
		expect(result.status).toBe(400);
		expect(result.data?.errors?.slug).toBe('Another committee already uses this link.');
		expect(createCommittee).not.toHaveBeenCalled();
	});

	it('asks a published conference for at least one topic', async () => {
		vi.mocked(requirePermission).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: PUBLISHED_CONFERENCE
		});

		const result = (await actions.save(makeFormEvent(VALID_FORM, ['', '']))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.errors?.topics).toBe('Please add at least one topic.');
		expect(createCommittee).not.toHaveBeenCalled();
	});

	it('saves the topics that were typed and drops the empty rows', async () => {
		await catchRedirect(() =>
			actions.save(makeFormEvent(VALID_FORM, ['Climate finance', '  ', 'Sanctions review']))
		);

		expect(createCommittee).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			expect.objectContaining({ topics: ['Climate finance', 'Sanctions review'] }),
			expect.anything()
		);
	});

	it('puts the new committee after the ones the conference already has', async () => {
		await catchRedirect(() => actions.save(makeFormEvent()));

		expect(listCommitteesForManage).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
		expect(createCommittee).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			expect.anything(),
			EXISTING_COMMITTEES.length
		);
	});

	it('creates it, says so, and opens its own editor', async () => {
		const redirect = await catchRedirect(() => actions.save(makeFormEvent()));

		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Committee created. Now add its seats.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(NEW_COMMITTEE_PATH);
	});

	it('asks the organiser gate again, because an action is its own request', async () => {
		await catchRedirect(() => actions.save(makeFormEvent()));

		expect(requirePermission).toHaveBeenCalledWith(
			{ supabase: SUPABASE },
			expect.any(URL),
			CONFERENCE.slug,
			'manage_committees'
		);
	});
});

describe('the addTopic action', () => {
	it('adds an empty row, keeps what was typed, and saves nothing', async () => {
		const result = (await actions.addTopic(makeFormEvent())) as ActionResult;

		expect(result.values?.topics).toEqual([...VALID_TOPICS, '']);
		expect(result.values?.name).toBe('Security Council');
		expect(result.errors).toEqual({});
		expect(result.message).toBeNull();
		expect(createCommittee).not.toHaveBeenCalled();
	});

	it('asks the organiser gate again', async () => {
		await actions.addTopic(makeFormEvent());

		expect(requirePermission).toHaveBeenCalled();
	});
});

describe('the removeTopic action', () => {
	it('takes away the row the address names, and saves nothing', async () => {
		const topics = ['Climate finance', 'Sanctions review', 'Peacekeeping'];

		const result = (await actions.removeTopic(
			makeFormEvent(VALID_FORM, topics, '?/removeTopic&index=1')
		)) as ActionResult;

		expect(result.values?.topics).toEqual(['Climate finance', 'Peacekeeping']);
		expect(result.errors).toEqual({});
		expect(createCommittee).not.toHaveBeenCalled();
	});

	it('leaves the list alone when the address names no row', async () => {
		const result = (await actions.removeTopic(
			makeFormEvent(VALID_FORM, VALID_TOPICS, '?/removeTopic')
		)) as ActionResult;

		expect(result.values?.topics).toEqual(VALID_TOPICS);
	});

	it('leaves the list alone when the row is not a whole number', async () => {
		const result = (await actions.removeTopic(
			makeFormEvent(VALID_FORM, VALID_TOPICS, '?/removeTopic&index=first')
		)) as ActionResult;

		expect(result.values?.topics).toEqual(VALID_TOPICS);
	});

	it('asks the organiser gate again', async () => {
		await actions.removeTopic(makeFormEvent(VALID_FORM, VALID_TOPICS, '?/removeTopic&index=0'));

		expect(requirePermission).toHaveBeenCalled();
	});
});
