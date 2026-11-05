import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { CreationDraft, CreationOrganization } from '$lib/creation-draft';
import type { SetupFacts } from '$lib/server/creation-setup';
import { NO_PERMISSIONS, type MyPermissions } from '$lib/permissions';

// The organiser check and every query are stood in for, so these tests are
// about what `load` and the actions decide. Reading and checking the dialogs'
// forms (`$lib/creation-setup-*`) is pure and runs for real.
vi.mock('$lib/server/access', () => ({
	askHasPermissionOrThrow: vi.fn(),
	requirePermission: vi.fn(),
	requireUser: vi.fn()
}));
vi.mock('$lib/server/my-permissions', () => ({ readMyPermissions: vi.fn() }));
vi.mock('$lib/server/creation', () => ({
	findPreviousConference: vi.fn(),
	getCreationDraft: vi.fn(),
	setCreationStep: vi.fn()
}));
vi.mock('$lib/server/creation-setup', () => ({
	importApplicationForm: vi.fn(),
	importCommittees: vi.fn(),
	importFees: vi.fn(),
	loadSetupFacts: vi.fn(),
	saveFeeCollection: vi.fn(),
	setApplicationSettings: vi.fn(),
	setFeeStatus: vi.fn()
}));
vi.mock('$lib/server/application-questions', () => ({
	createApplicationQuestion: vi.fn(),
	deleteApplicationQuestion: vi.fn(),
	moveApplicationQuestion: vi.fn(),
	updateApplicationQuestion: vi.fn()
}));
vi.mock('$lib/server/fees', () => ({ createFee: vi.fn(), deleteFee: vi.fn(), updateFee: vi.fn() }));
vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));
vi.mock('$lib/server/manage-committees', () => ({
	createCommittee: vi.fn(),
	deleteCommittee: vi.fn(),
	listCommitteeSlugs: vi.fn(),
	updateCommittee: vi.fn()
}));

import { askHasPermissionOrThrow, requireUser } from '$lib/server/access';
import { createApplicationQuestion } from '$lib/server/application-questions';
import { findPreviousConference, getCreationDraft, setCreationStep } from '$lib/server/creation';
import {
	importCommittees,
	loadSetupFacts,
	saveFeeCollection,
	setApplicationSettings,
	setFeeStatus
} from '$lib/server/creation-setup';
import { createFee } from '$lib/server/fees';
import { setFlash } from '$lib/server/flash';
import {
	createCommittee,
	deleteCommittee,
	listCommitteeSlugs,
	updateCommittee
} from '$lib/server/manage-committees';
import { readMyPermissions } from '$lib/server/my-permissions';

const DRAFT = {
	id: 'draft-1',
	slug: 'delft-mun-2027',
	name: 'Delft MUN 2027',
	tagline: null,
	description: null,
	organizationId: 'org-1',
	status: 'draft',
	creationStep: 'setup',
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
	prefillSources: { start_date: 'previous_conference' },
	updatedAt: '2026-10-04T10:00:00Z'
} satisfies CreationDraft;

const ORGANIZATION = {
	id: 'org-1',
	slug: 'delft-mun',
	name: 'Delft MUN',
	city: 'Delft',
	countryCode: 'NL',
	countryName: 'Netherlands',
	logoPath: null,
	websiteUrl: null,
	isStripeConnected: false,
	lastConference: null
} satisfies CreationOrganization;

const FACTS: SetupFacts = {
	committees: [
		{
			id: 'committee-1',
			name: 'Security Council',
			abbreviation: 'UNSC',
			plannedSeatCount: 15,
			room: null,
			level: 'advanced',
			topics: ['Haiti'],
			description: null,
			defaultSpeakingTimeSeconds: 60,
			position: 0
		}
	],
	questions: [],
	fees: [],
	previousFeeSummary: null
};

/** The few pieces of a request the step reads; the cast says "this is enough". */
function makeEvent(path: string, form: Record<string, string | string[]> = {}) {
	const formData = new FormData();
	for (const [name, value] of Object.entries(form)) {
		for (const one of [value].flat()) {
			formData.append(name, one);
		}
	}

	return {
		url: new URL(`http://localhost${path}`),
		params: { slug: DRAFT.slug },
		locals: { supabase: {} },
		request: { formData: async () => formData },
		parent: async () => ({ draft: DRAFT, organization: ORGANIZATION, previous: null })
	};
}

/** Run an action, and give back what it threw: SvelteKit's redirect and error are thrown. */
async function run(name: keyof typeof actions, form: Record<string, string | string[]>) {
	try {
		const action = actions[name] as (event: RequestEvent) => Promise<unknown>;
		return await action(makeEvent(`/create/${DRAFT.slug}/setup`, form) as unknown as RequestEvent);
	} catch (thrown) {
		return thrown;
	}
}

const BACK_TO_SETUP = { status: 303, location: '/create/delft-mun-2027/setup' };

/** What a reader is told when their role does not let them manage every committee. */
const NO_PERMISSION_MESSAGE =
	'Your role does not let you add, change or delete committees here. If you manage some of them, change those on the committees page; otherwise ask somebody who manages committees.';

/** What the committee dialog sends for a committee the form accepts. */
const COMMITTEE_FORM = {
	name: 'WHO',
	abbreviation: 'WHO',
	level: 'intermediate',
	defaultSpeakingTimeSeconds: '90',
	plannedSeatCount: '40'
};

/** What somebody holds who manages every committee: `manage_committees` on the whole conference. */
const MANAGES_EVERY_COMMITTEE: MyPermissions = {
	held: [{ permission: 'manage_committees', scope: 'conference' }],
	committeeIds: [],
	rank: 0
};

beforeEach(() => {
	vi.resetAllMocks();
	vi.mocked(requireUser).mockResolvedValue({ id: 'user-1', email: 'clara@example.org' });
	vi.mocked(readMyPermissions).mockResolvedValue(MANAGES_EVERY_COMMITTEE);
	vi.mocked(askHasPermissionOrThrow).mockResolvedValue(true);
	vi.mocked(getCreationDraft).mockResolvedValue(DRAFT);
	vi.mocked(loadSetupFacts).mockResolvedValue(FACTS);
	vi.mocked(listCommitteeSlugs).mockResolvedValue(['who']);
});

describe('load', () => {
	it('opens the dialog the address asks for', async () => {
		const data = await load(
			makeEvent(
				`/create/${DRAFT.slug}/setup?dialog=delete-committee&id=committee-1`
			) as unknown as PageServerLoadEvent
		);

		expect(data).toMatchObject({
			dialog: { kind: 'delete', content: { title: 'Delete committee?' } },
			showAllCommittees: false,
			allCommitteesUrl: '/create/delft-mun-2027/setup?committees=all',
			stripeSettingsUrl: expect.stringContaining('delft-mun')
		});
	});

	it('says whether the reader may manage committees, so the page can hide what would be refused', async () => {
		vi.mocked(readMyPermissions).mockResolvedValue(NO_PERMISSIONS);

		const data = await load(
			makeEvent(`/create/${DRAFT.slug}/setup`) as unknown as PageServerLoadEvent
		);

		expect(readMyPermissions).toHaveBeenCalledWith({}, 'draft-1', 'user-1');
		expect(data).toMatchObject({ canManageCommittees: false, canOpenCommitteesPage: false });
	});

	it('opens the committees page, and nothing more, to somebody who manages only their own committees', async () => {
		vi.mocked(readMyPermissions).mockResolvedValue({
			held: [{ permission: 'manage_committees', scope: 'committees' }],
			committeeIds: ['committee-1'],
			rank: 2
		});

		const data = await load(
			makeEvent(`/create/${DRAFT.slug}/setup`) as unknown as PageServerLoadEvent
		);

		expect(data).toMatchObject({ canManageCommittees: false, canOpenCommitteesPage: true });
	});
});

describe('committees', () => {
	it('adds a committee with a link worked out from its name, and closes the dialog', async () => {
		const result = await run('addCommittee', {
			committeeId: '',
			name: 'WHO',
			abbreviation: 'WHO',
			level: 'intermediate',
			defaultSpeakingTimeSeconds: '90',
			plannedSeatCount: '40',
			'topics[]': ['Pandemic treaty', ' ']
		});

		expect(result).toMatchObject(BACK_TO_SETUP);
		const [, conferenceId, values, position, seats] = vi.mocked(createCommittee).mock.calls[0];
		expect(conferenceId).toBe('draft-1');
		expect(values).toMatchObject({ slug: 'who-2', topics: ['Pandemic treaty'] });
		expect(position).toBe(1);
		expect(seats).toBe(40);
	});

	it('keeps the dialog open with a message for seats that are not a number', async () => {
		const result = await run('addCommittee', {
			name: 'WHO',
			level: 'intermediate',
			defaultSpeakingTimeSeconds: '90',
			plannedSeatCount: 'lots'
		});

		expect(result).toMatchObject({
			status: 400,
			data: { kind: 'committee', errors: { plannedSeatCount: expect.any(String) } }
		});
		expect(createCommittee).not.toHaveBeenCalled();
	});

	it('refuses to edit or delete a committee of another conference', async () => {
		expect(await run('updateCommittee', { committeeId: 'elsewhere', name: 'X' })).toMatchObject({
			status: 404
		});
		expect(await run('deleteCommittee', { id: 'elsewhere' })).toMatchObject({ status: 404 });
		expect(updateCommittee).not.toHaveBeenCalled();
		expect(deleteCommittee).not.toHaveBeenCalled();
	});

	it('deletes one of its own', async () => {
		vi.mocked(deleteCommittee).mockResolvedValue(true);

		expect(await run('deleteCommittee', { id: 'committee-1' })).toMatchObject(BACK_TO_SETUP);
		expect(deleteCommittee).toHaveBeenCalledWith({}, 'committee-1');
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('says why when the database keeps a committee with a reserved seat', async () => {
		vi.mocked(deleteCommittee).mockResolvedValue(false);

		expect(await run('deleteCommittee', { id: 'committee-1' })).toMatchObject(BACK_TO_SETUP);
		expect(setFlash).toHaveBeenCalledWith(undefined, {
			tone: 'error',
			message:
				'You cannot delete a committee while a seat in it is filled or reserved. Free its seats on the allocation page first.'
		});
	});

	it('says that the role is missing, not a seat, when the reader may not manage committees', async () => {
		// A role can give `edit_conference`, which opens the step, without
		// `manage_committees`, which the committees policies ask for.
		vi.mocked(askHasPermissionOrThrow).mockResolvedValue(false);

		expect(await run('addCommittee', { committeeId: '', ...COMMITTEE_FORM })).toMatchObject(
			BACK_TO_SETUP
		);
		expect(
			await run('updateCommittee', { committeeId: 'committee-1', ...COMMITTEE_FORM })
		).toMatchObject(BACK_TO_SETUP);
		expect(await run('importCommittees', {})).toMatchObject(BACK_TO_SETUP);
		expect(await run('deleteCommittee', { id: 'committee-1' })).toMatchObject(BACK_TO_SETUP);

		expect(askHasPermissionOrThrow).toHaveBeenCalledWith({}, 'draft-1', 'manage_committees');
		expect(createCommittee).not.toHaveBeenCalled();
		expect(updateCommittee).not.toHaveBeenCalled();
		expect(findPreviousConference).not.toHaveBeenCalled();
		expect(importCommittees).not.toHaveBeenCalled();
		expect(deleteCommittee).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledTimes(4);
		expect(setFlash).toHaveBeenCalledWith(undefined, {
			tone: 'error',
			message: NO_PERMISSION_MESSAGE
		});
	});

	it('turns back a change from somebody who manages just that committee, to the committees page', async () => {
		// The update policy would let them in, but the database refuses a change
		// to anything but the description, agenda and resolution settings, and
		// this dialog writes every field and works the link out again, so a
		// rename or an imported link would be an error page.
		vi.mocked(askHasPermissionOrThrow).mockResolvedValue(false);

		expect(
			await run('updateCommittee', { committeeId: 'committee-1', ...COMMITTEE_FORM })
		).toMatchObject(BACK_TO_SETUP);
		expect(updateCommittee).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(undefined, {
			tone: 'error',
			message: NO_PERMISSION_MESSAGE
		});
	});

	it('shows an error page, not a missing role, when the check itself fails', async () => {
		vi.mocked(askHasPermissionOrThrow).mockRejectedValue(
			new Error('Could not check your permissions: offline')
		);

		expect(await run('deleteCommittee', { id: 'committee-1' })).toMatchObject({
			message: 'Could not check your permissions: offline'
		});
		expect(setFlash).not.toHaveBeenCalled();
		expect(deleteCommittee).not.toHaveBeenCalled();
	});
});

describe('applications and questions', () => {
	it('saves a fixed closing day as 23:59 on that day', async () => {
		const result = await run('saveApplications', {
			openMode: 'manual',
			closeChoice: 'fixed',
			closesOn: '2027-03-31',
			acceptsIndividualApplications: 'on',
			committeePreferenceCount: '3'
		});

		expect(result).toMatchObject(BACK_TO_SETUP);
		const [, , settings] = vi.mocked(setApplicationSettings).mock.calls[0];
		expect(settings).toMatchObject({
			applicationCloseRule: 'fixed',
			applicationsCloseAt: '2027-03-31T21:59:00.000Z',
			acceptsDelegations: false
		});
	});

	it('adds an optional question', async () => {
		const result = await run('addQuestion', {
			questionId: '',
			label: 'Why MUN?',
			type: 'long_text',
			required: 'optional'
		});

		expect(result).toMatchObject(BACK_TO_SETUP);
		expect(createApplicationQuestion).toHaveBeenCalledWith({}, 'draft-1', {
			label: 'Why MUN?',
			helpText: null,
			type: 'long_text',
			options: [],
			isRequired: false
		});
	});
});

describe('fees', () => {
	it('adds a fee and records that the conference charges, collected externally', async () => {
		const result = await run('addFee', {
			feeId: '',
			kind: 'delegate',
			name: 'Delegate fee',
			amount: '35',
			appliesTo: 'individual',
			description: 'Includes lunch',
			collection: 'manual'
		});

		expect(result).toMatchObject(BACK_TO_SETUP);
		expect(createFee).toHaveBeenCalledWith({}, 'draft-1', {
			name: 'Delegate fee',
			amountCents: 3500,
			appliesTo: 'individual',
			validFrom: null,
			validUntil: null,
			description: 'Includes lunch'
		});
		expect(saveFeeCollection).toHaveBeenCalledWith({}, 'draft-1', true);
	});

	it('saves Free, and ignores a status it does not know', async () => {
		await run('setFeeStatus', { feeStatus: 'free' });
		await run('setFeeStatus', { feeStatus: 'sometimes' });

		expect(setFeeStatus).toHaveBeenCalledTimes(1);
		expect(setFeeStatus).toHaveBeenCalledWith({}, 'draft-1', 'free');
	});
});

describe('continue', () => {
	it('remembers Launch was reached and goes there', async () => {
		expect(await run('continue', {})).toMatchObject({
			status: 303,
			location: '/create/delft-mun-2027/launch'
		});
		expect(setCreationStep).toHaveBeenCalledWith({}, 'draft-1', 'launch');
	});
});
