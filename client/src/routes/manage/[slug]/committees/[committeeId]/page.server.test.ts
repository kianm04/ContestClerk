import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { CommitteeFormErrors, CommitteeFormValues } from '$lib/committee-details';
import type { CommitteeChair, ManagedCommitteeRow, ManagedSeat } from '$lib/committees';
import type { Conference } from '$lib/conferences';
import type { BackgroundGuide } from '$lib/documents';
import type { ChairStaffMember } from '$lib/team';
import type { ManagedOrganization } from '$lib/organizations';

// The gate, the queries and the flash cookie are all stood in for, so these
// tests are about what `load` and the actions themselves decide.
// `requirePermissionSomewhere` has its own tests in `src/lib/server/access`, and what the
// database allows is tested in `tests/db/`.
//
// `$lib/committee-details`, `$lib/seat-lists` and `$lib/countries` are
// deliberately not stood in for: they are pure, and running the real ones is
// what proves this page and the form agree about what a committee may hold.
vi.mock('$lib/server/access', () => ({
	requirePermissionSomewhere: vi.fn(),
	requireUser: vi.fn(),
	requireManagePage: vi.fn()
}));

vi.mock('$lib/server/manage-committees', () => ({
	deleteCommittee: vi.fn(),
	getCommitteeForManage: vi.fn(),
	listCommitteeSlugs: vi.fn(),
	updateCommittee: vi.fn(),
	updateCommitteeAgenda: vi.fn()
}));

vi.mock('$lib/server/seats', () => ({
	addSeats: vi.fn(),
	deleteSeat: vi.fn(),
	getSeat: vi.fn(),
	moveSeat: vi.fn(),
	setSeatAvailability: vi.fn()
}));

vi.mock('$lib/server/documents', () => ({
	getBackgroundGuide: vi.fn(),
	removeBackgroundGuide: vi.fn(),
	uploadBackgroundGuide: vi.fn()
}));

vi.mock('$lib/server/team', () => ({
	addCommitteeChair: vi.fn(),
	findChairRole: vi.fn(),
	listChairStaff: vi.fn(),
	listCommitteeChairs: vi.fn(),
	listPendingCommitteeChairInvites: vi.fn(),
	readTeamRanks: vi.fn(),
	removeCommitteeChair: vi.fn()
}));

vi.mock('$lib/server/invites', () => ({
	committeeChairInviteRefusal: vi.fn(),
	createStaffInvite: vi.fn(),
	findPendingInvite: vi.fn(),
	withdrawCommitteeChairInvite: vi.fn()
}));

vi.mock('$lib/server/committee-procedure', () => ({
	applyCommitteeProcedure: vi.fn(),
	copyCommitteeProcedure: vi.fn(),
	getCommitteeProcedure: vi.fn(),
	listOtherCommittees: vi.fn(),
	saveCommitteeProcedure: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

vi.mock('$lib/server/ordered-rows', () => ({ placeOrderedRow: vi.fn() }));

import { requireManagePage, requirePermissionSomewhere, requireUser } from '$lib/server/access';
import {
	deleteCommittee,
	getCommitteeForManage,
	listCommitteeSlugs,
	updateCommittee,
	updateCommitteeAgenda
} from '$lib/server/manage-committees';
import {
	getBackgroundGuide,
	removeBackgroundGuide,
	uploadBackgroundGuide
} from '$lib/server/documents';
import {
	applyCommitteeProcedure,
	copyCommitteeProcedure,
	getCommitteeProcedure,
	listOtherCommittees,
	saveCommitteeProcedure
} from '$lib/server/committee-procedure';
import type { CommitteeProcedure, ProcedureFormErrors } from '$lib/committee-procedure';
import { setFlash } from '$lib/server/flash';
import { placeOrderedRow } from '$lib/server/ordered-rows';
import { addSeats, deleteSeat, getSeat, moveSeat, setSeatAvailability } from '$lib/server/seats';
import {
	addCommitteeChair,
	findChairRole,
	listChairStaff,
	listCommitteeChairs,
	listPendingCommitteeChairInvites,
	readTeamRanks,
	removeCommitteeChair
} from '$lib/server/team';
import type { TeamRole } from '$lib/team';
import {
	committeeChairInviteRefusal,
	createStaffInvite,
	findPendingInvite,
	withdrawCommitteeChairInvite
} from '$lib/server/invites';
import type { MyPermissions } from '$lib/permissions';

/** What the layout hands down for an organiser: `administrator` opens every page. */
const ADMINISTRATOR: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: -1
};

/** The Supabase client. `load` and the actions only hand it on. */
const SUPABASE = {};

/** The conference's Chair role, which a chair invitation from this page hands over. */
const CHAIR_ROLE: TeamRole = {
	id: 'role-chair',
	name: 'Chair',
	position: 1,
	scope: 'committees',
	isPublic: true,
	isAdministrator: false
};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

/** The organiser `requirePermissionSomewhere` answers with. Nothing here reads them. */
const SIGNED_IN_USER = { id: 'user-1', email: 'daniel@example.com' };

/** A draft conference. Only its id, its slug and its status are read here. */
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
	committeeCount: 1,
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

/** The organisation that runs it. The layout reads it; this page only passes it on. */
const ORGANIZATION: ManagedOrganization = {
	id: '22222222-2222-2222-2222-222222222222',
	name: 'Riverside MUN Society',
	slug: 'riverside-mun-society',
	logoPath: null,
	isStripeConnected: false
};

/** The committee being edited, with its optional columns still empty. */
const COMMITTEE: ManagedCommitteeRow = {
	id: '33333333-3333-3333-3333-333333333333',
	slug: 'security-council',
	name: 'Security Council',
	abbreviation: null,
	description: null,
	topics: [],
	level: 'advanced',
	room: null,
	position: 1,
	defaultSpeakingTimeSeconds: 90
};

/** A seat nobody holds and nobody has been promised. */
const FREE_SEAT: ManagedSeat = {
	id: 'seat-free',
	name: 'France',
	kind: 'country',
	countryCode: 'FR',
	position: 1,
	isAvailable: true,
	isFilled: false,
	isReserved: false,
	holderName: null,
	delegationName: null
};

/** A seat with a delegate sitting in it. */
const FILLED_SEAT: ManagedSeat = {
	...FREE_SEAT,
	id: 'seat-filled',
	name: 'Ghana',
	countryCode: 'GH',
	position: 2,
	isFilled: true,
	holderName: 'Amina Otoo'
};

/**
 * The same, for a delegate whose profile could not be read. `isFilled` is what
 * says the seat is taken; the name is only what to call them.
 */
const NAMELESS_FILLED_SEAT: ManagedSeat = {
	...FILLED_SEAT,
	id: 'seat-nameless',
	holderName: null
};

/** A seat held for a delegation that has not named anybody yet. */
const RESERVED_SEAT: ManagedSeat = {
	...FREE_SEAT,
	id: 'seat-reserved',
	name: 'Japan',
	countryCode: 'JP',
	position: 3,
	isReserved: true,
	delegationName: 'Riverside College'
};

const SEATS: ManagedSeat[] = [FREE_SEAT, FILLED_SEAT, RESERVED_SEAT];

/** Somebody who already chairs this committee. */
const CHAIR: CommitteeChair = {
	userId: 'user-chair',
	fullName: 'Aiko Tanaka',
	avatarPath: null,
	title: 'Chair'
};

/**
 * The conference's chair staff, which is who the picker may offer. Both hold
 * the Chair role, the conference's third, so both rank 2.
 */
const CHAIR_STAFF: ChairStaffMember[] = [
	{ userId: CHAIR.userId, fullName: CHAIR.fullName, title: null, rank: 2 },
	{ userId: 'user-vice', fullName: 'Luis Moreno', title: 'Deputy Chair', rank: 2 }
];

/** The background guide this committee already has. */
const GUIDE: BackgroundGuide = {
	id: 'document-1',
	title: 'Security Council background guide',
	fileName: 'unsc-guide.pdf',
	fileSizeBytes: 1_258_291,
	audience: 'delegates',
	downloadUrl: 'https://storage.example/signed/unsc-guide.pdf'
};

/** A PDF small enough for `pdfFileProblem` to have nothing to say about it. */
function makeGuideFile(name = 'guide.pdf', type = 'application/pdf', sizeBytes = 1024): File {
	return new File([new Uint8Array(sizeBytes)], name, { type });
}

/**
 * A PDF that says it is twenty-one megabytes without being one.
 *
 * `size` is worked out from the bytes a `File` was built with and cannot be
 * passed in, so it is redefined afterwards. It has to stay a real `File`,
 * because the action skips anything that is not one, and really allocating
 * twenty-one megabytes to prove that one number is compared with another would
 * be a slow test for nothing.
 */
function makeOversizedGuideFile(): File {
	const file = makeGuideFile('huge.pdf');

	Object.defineProperty(file, 'size', { value: 21 * 1024 * 1024 });

	return file;
}

/** A committee form in which every field holds something the server accepts. */
const VALID_FORM: Record<string, string> = {
	name: 'Security Council',
	abbreviation: 'UNSC',
	slug: 'security-council',
	description: 'The council of fifteen.',
	level: 'advanced',
	room: 'Committee Room 1',
	defaultSpeakingTimeSeconds: '90'
};

/** The topic rows that form is sent with. */
const VALID_TOPICS = ['The situation in the Sahel', ''];

/** Where a save that worked, and every seat action, comes back to. */
const EDITOR_PATH = `/manage/riverside-mun-2027/committees/${COMMITTEE.id}`;

/** Where deleting the committee sends the organiser instead. */
const COMMITTEES_PATH = '/manage/riverside-mun-2027/committees';

/**
 * The few pieces of a request that `load` and the actions here actually read.
 *
 * SvelteKit hands them a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		params: { slug: CONFERENCE.slug, committeeId: COMMITTEE.id },
		url: new URL(`http://localhost${EDITOR_PATH}`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		...overrides
	};
}

/**
 * That stand-in, as the `load` function's own event type.
 *
 * `parent()` is how a page's `load` reads what the layout above it returned. It
 * is an async function on the event, so the stand-in is one too.
 */
function makeLoadEvent(conference: Conference = CONFERENCE): PageServerLoadEvent {
	return makeEvent({
		parent: async () => ({ conference, organization: ORGANIZATION, permissions: ADMINISTRATOR })
	}) as unknown as PageServerLoadEvent;
}

/**
 * A post carrying these plain fields, one `topics[]` row per topic, and this
 * query string on the action's own address.
 */
function makeActionEvent(
	fields: Record<string, string> = {},
	options: { topics?: string[]; search?: string } = {}
): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	// `TopicsEditor` names every row `topics[]`, so one form holds several fields
	// under that one name and they are appended rather than set.
	for (const topic of options.topics ?? []) {
		formData.append('topics[]', topic);
	}

	return makeEvent({
		url: new URL(`http://localhost${EDITOR_PATH}${options.search ?? ''}`),
		request: { formData: async () => formData }
	}) as unknown as RequestEvent;
}

/** A post to `save` carrying a whole valid committee form. */
function makeSaveEvent(overrides: Record<string, string> = {}): RequestEvent {
	return makeActionEvent({ ...VALID_FORM, ...overrides }, { topics: VALID_TOPICS });
}

/**
 * A post to `uploadGuide` carrying a file and an audience.
 *
 * `makeActionEvent` above only carries text, and a file box posts a `File`, so
 * the background guide needs a builder of its own. `file: null` is the empty
 * box, which the browser still posts as a `File` of no size.
 */
function makeUploadGuideEvent(
	options: { file?: File | null; audience?: string } = {}
): RequestEvent {
	const formData = new FormData();

	formData.set(
		'guide',
		options.file === undefined ? makeGuideFile() : (options.file ?? new File([], '', { type: '' }))
	);
	formData.set('audience', options.audience ?? 'delegates');

	return makeEvent({
		url: new URL(`http://localhost${EDITOR_PATH}`),
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

/** What an action answers with, whether it refused with `fail` or returned plainly. */
type ActionResult = {
	status?: number;
	data?: CommitteeEditAnswer;
} & Partial<CommitteeEditAnswer>;

/** The three fields every action on this page answers with, and the chair invitation's own. */
type CommitteeEditAnswer = {
	values?: CommitteeFormValues | null;
	errors?: CommitteeFormErrors;
	message?: string | null;
	chairInvite?: { email: string; error: string | null; link: string | null };
	/** What the "Resolutions" settings form answers when its fields are refused. */
	procedure?: { values: Record<string, unknown>; errors: ProcedureFormErrors };
	/** A refusal shown as a toast. */
	flash?: { tone: string; message: string };
};

/** The committee's "Resolutions" settings: the defaults, North American procedure. */
const PROCEDURE: CommitteeProcedure = {
	format: 'standard',
	crisisAllowsResolutions: false,
	paperWords: 'sponsors_and_signatories',
	hasWorkingPapers: true,
	sponsorLimit: 5,
	supportMinimum: 20,
	supportUnit: 'percent',
	supportCountsSponsors: true,
	oneSponsorshipPerTopic: false,
	hasFriendlyAmendments: true,
	amendmentSupportMinimum: 10,
	amendmentSupportUnit: 'percent',
	preambleAmendable: false,
	hasSecondDegreeAmendments: false,
	checksFormat: true
};

/** Those settings as the form posts them: a ticked box sends `on`, an unticked one nothing. */
const PROCEDURE_FORM: Record<string, string> = {
	format: 'standard',
	paperWords: 'sponsors_and_signatories',
	hasWorkingPapers: 'on',
	sponsorLimit: '5',
	supportMinimum: '20',
	supportUnit: 'percent',
	supportCountsSponsors: 'on',
	hasFriendlyAmendments: 'on',
	amendmentSupportMinimum: '10',
	amendmentSupportUnit: 'percent',
	checksFormat: 'on'
};

/** The conference's two other committees. */
const OTHER_COMMITTEES = [
	{ id: '44444444-4444-4444-4444-444444444444', name: 'Human Rights Council' },
	{ id: '55555555-5555-5555-5555-555555555555', name: 'DISEC' }
];

/** A post to `copyProcedure` with these committees ticked. */
function makeCopyEvent(committeeIds: string[]): RequestEvent {
	const formData = new FormData();

	for (const committeeId of committeeIds) {
		formData.append('committeeIds', committeeId);
	}

	return makeEvent({ request: { formData: async () => formData } }) as unknown as RequestEvent;
}

/** One chair invitation nobody has accepted yet. */
const PENDING_CHAIR_INVITE = {
	id: 'invite-1',
	token: 'a'.repeat(32),
	email: 'new.chair@example.org',
	expiresAt: '2027-02-01T10:00:00Z'
};

beforeEach(() => {
	vi.mocked(requirePermissionSomewhere).mockReset();
	vi.mocked(requirePermissionSomewhere).mockResolvedValue({
		user: SIGNED_IN_USER,
		conference: CONFERENCE,
		permissions: ADMINISTRATOR
	});
	vi.mocked(requireUser).mockResolvedValue(SIGNED_IN_USER);
	vi.mocked(listPendingCommitteeChairInvites).mockResolvedValue([PENDING_CHAIR_INVITE]);
	vi.mocked(committeeChairInviteRefusal).mockReset();
	vi.mocked(committeeChairInviteRefusal).mockResolvedValue(null);
	vi.mocked(findPendingInvite).mockReset();
	vi.mocked(findPendingInvite).mockResolvedValue(null);
	vi.mocked(createStaffInvite).mockReset();
	vi.mocked(createStaffInvite).mockResolvedValue('b'.repeat(32));
	vi.mocked(withdrawCommitteeChairInvite).mockReset();
	vi.mocked(withdrawCommitteeChairInvite).mockResolvedValue(true);
	vi.mocked(getCommitteeForManage).mockResolvedValue({ committee: COMMITTEE, seats: SEATS });
	vi.mocked(listCommitteeSlugs).mockResolvedValue([]);
	vi.mocked(updateCommittee).mockResolvedValue(undefined);
	vi.mocked(deleteCommittee).mockResolvedValue(true);
	vi.mocked(addSeats).mockResolvedValue({ addedCount: 1, existingCount: 0 });
	vi.mocked(getSeat).mockResolvedValue(FREE_SEAT);
	vi.mocked(setSeatAvailability).mockResolvedValue(undefined);
	vi.mocked(moveSeat).mockResolvedValue(undefined);
	vi.mocked(deleteSeat).mockResolvedValue(true);
	vi.mocked(listCommitteeChairs).mockResolvedValue([CHAIR]);
	vi.mocked(listChairStaff).mockResolvedValue(CHAIR_STAFF);
	vi.mocked(readTeamRanks).mockResolvedValue(
		new Map(CHAIR_STAFF.map((member) => [member.userId, member.rank ?? 0]))
	);
	vi.mocked(findChairRole).mockReset();
	vi.mocked(findChairRole).mockResolvedValue(CHAIR_ROLE);
	vi.mocked(getBackgroundGuide).mockResolvedValue(GUIDE);
	vi.mocked(addCommitteeChair).mockResolvedValue('added');
	vi.mocked(removeCommitteeChair).mockResolvedValue(true);
	vi.mocked(uploadBackgroundGuide).mockResolvedValue(undefined);
	vi.mocked(removeBackgroundGuide).mockResolvedValue(true);
	vi.mocked(getCommitteeProcedure).mockResolvedValue(PROCEDURE);
	vi.mocked(listOtherCommittees).mockResolvedValue(OTHER_COMMITTEES);
	vi.mocked(applyCommitteeProcedure).mockReset();
	vi.mocked(applyCommitteeProcedure).mockResolvedValue({ refusal: null });
	vi.mocked(saveCommitteeProcedure).mockReset();
	vi.mocked(saveCommitteeProcedure).mockResolvedValue({ refusal: null });
	vi.mocked(copyCommitteeProcedure).mockReset();
	vi.mocked(copyCommitteeProcedure).mockResolvedValue({ refusal: null });
	vi.mocked(setFlash).mockClear();
	vi.mocked(placeOrderedRow).mockReset();
	vi.mocked(placeOrderedRow).mockResolvedValue(true);
});

describe('load', () => {
	it('works from the conference the layout already read, and does not check again', async () => {
		await load(makeLoadEvent());

		// The layout read the reader's permissions once; the page checks its own
		// line against them instead of asking the database a second time.
		expect(requirePermissionSomewhere).not.toHaveBeenCalled();
		expect(requireManagePage).toHaveBeenCalledWith(ADMINISTRATOR, 'committees');
		expect(getCommitteeForManage).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, COMMITTEE.id);
	});

	it('is a 404 for a committee this conference does not have', async () => {
		vi.mocked(getCommitteeForManage).mockResolvedValue(null);

		await expect(load(makeLoadEvent())).rejects.toMatchObject({ status: 404 });
	});

	it('does not ask about the chairs or the guide of a committee that is not there', async () => {
		vi.mocked(getCommitteeForManage).mockResolvedValue(null);

		await expect(load(makeLoadEvent())).rejects.toMatchObject({ status: 404 });

		expect(listCommitteeChairs).not.toHaveBeenCalled();
		expect(listChairStaff).not.toHaveBeenCalled();
		expect(getBackgroundGuide).not.toHaveBeenCalled();
	});

	it('reads the chairs, the chair team and the background guide for the two panels', async () => {
		const result = await load(makeLoadEvent());

		expect(listCommitteeChairs).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id);
		expect(listChairStaff).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
		expect(getBackgroundGuide).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id);
		expect(result).toMatchObject({
			chairs: [CHAIR],
			chairStaff: CHAIR_STAFF,
			backgroundGuide: GUIDE
		});
	});

	it('reads the waiting chair invitations, the reader and the site address for the Chairs panel', async () => {
		const result = await load(makeLoadEvent());

		expect(listPendingCommitteeChairInvites).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id);
		expect(result).toMatchObject({
			pendingChairInvites: [PENDING_CHAIR_INVITE],
			readerUserId: SIGNED_IN_USER.id,
			// The reader is an administrator, the one reader who may.
			mayChairYourself: true,
			origin: 'http://localhost'
		});
	});

	it('says there is no background guide when the committee has none', async () => {
		vi.mocked(getBackgroundGuide).mockResolvedValue(null);

		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ backgroundGuide: null });
	});

	/* `toMatchObject` rather than reading a field off the answer: SvelteKit
	   types every `load` as allowed to return nothing at all, so the answer is
	   compared as a whole instead of being narrowed first. */
	it('turns the committee into the text a form field holds', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({
			values: {
				name: 'Security Council',
				abbreviation: '',
				slug: 'security-council',
				description: '',
				level: 'advanced',
				room: '',
				defaultSpeakingTimeSeconds: '90',
				// A committee with no topics still gets one empty row to type in.
				topics: ['']
			}
		});
	});

	it('keeps the topics a committee already has', async () => {
		const withTopics = { ...COMMITTEE, topics: ['Water', 'Sanitation'] };

		vi.mocked(getCommitteeForManage).mockResolvedValue({ committee: withTopics, seats: SEATS });

		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ values: { topics: ['Water', 'Sanitation'] } });
	});

	it('counts the seats', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({
			seats: SEATS,
			seatCounts: { available: 3, filled: 1, reserved: 1, total: 3 }
		});
	});
});

describe('the save action', () => {
	it('refuses a link another committee already uses, and saves nothing', async () => {
		vi.mocked(listCommitteeSlugs).mockResolvedValue(['general-assembly']);

		const result = (await actions.save(
			makeSaveEvent({ slug: 'general-assembly' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.errors?.slug).toBe('Another committee already uses this link.');
		expect(result.data?.values?.slug).toBe('general-assembly');
		expect(updateCommittee).not.toHaveBeenCalled();
	});

	it('leaves this committee out of the taken links, so saving it unchanged works', async () => {
		await catchRedirect(() => actions.save(makeSaveEvent()));

		expect(listCommitteeSlugs).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, COMMITTEE.id);
	});

	it('refuses a form with no level picked', async () => {
		const result = (await actions.save(makeSaveEvent({ level: '' }))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.errors?.level).toBe('Please pick a level.');
		expect(result.data?.message).toBeNull();
	});

	it('asks a published conference for a topic', async () => {
		const published = { ...CONFERENCE, status: 'published' as const };

		vi.mocked(requirePermissionSomewhere).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: published,
			permissions: ADMINISTRATOR
		});

		const event = makeActionEvent(VALID_FORM, { topics: ['', ' '] });
		const result = (await actions.save(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.errors?.topics).toBe('Please add at least one topic.');
	});

	it('makes a link out of the name when the box was cleared', async () => {
		await catchRedirect(() => actions.save(makeSaveEvent({ slug: '', name: 'Human Rights' })));

		expect(updateCommittee).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			expect.objectContaining({ slug: 'human-rights' })
		);
	});

	it('gives a name no link can be made from the link "committee" rather than an empty one', async () => {
		// `slugify` keeps only a-z and 0-9, so a Chinese name leaves nothing, and
		// the `committees` table refuses an empty slug (`committees_slug_shape`).
		await catchRedirect(() => actions.save(makeSaveEvent({ slug: '', name: '安全理事会' })));

		expect(updateCommittee).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			expect.objectContaining({ slug: 'committee' })
		);
	});

	it('saves without the empty topic rows, says so, and comes back to the same page', async () => {
		const redirect = await catchRedirect(() => actions.save(makeSaveEvent()));

		expect(updateCommittee).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			expect.objectContaining({
				name: 'Security Council',
				topics: ['The situation in the Sahel']
			})
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Committee saved.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(EDITOR_PATH);
	});

	it('asks the organiser gate again, because an action is its own request', async () => {
		await catchRedirect(() => actions.save(makeSaveEvent()));

		expect(requirePermissionSomewhere).toHaveBeenCalled();
	});

	it('is a 404 for a committee of another conference', async () => {
		vi.mocked(getCommitteeForManage).mockResolvedValue(null);

		await expect(actions.save(makeSaveEvent())).rejects.toMatchObject({ status: 404 });
		expect(updateCommittee).not.toHaveBeenCalled();
	});
});

describe('the topic row actions', () => {
	it('adds an empty row without saving anything', async () => {
		const event = makeActionEvent(VALID_FORM, { topics: ['Water'] });
		const result = (await actions.addTopic(event)) as ActionResult;

		expect(result.values?.topics).toEqual(['Water', '']);
		expect(updateCommittee).not.toHaveBeenCalled();
	});

	it('removes the row named in the address', async () => {
		const event = makeActionEvent(VALID_FORM, {
			topics: ['Water', 'Sanitation'],
			search: '?/removeTopic&index=0'
		});

		const result = (await actions.removeTopic(event)) as ActionResult;

		expect(result.values?.topics).toEqual(['Sanitation']);
	});

	it('leaves the rows alone when the address names no row', async () => {
		const event = makeActionEvent(VALID_FORM, { topics: ['Water', 'Sanitation'] });
		const result = (await actions.removeTopic(event)) as ActionResult;

		expect(result.values?.topics).toEqual(['Water', 'Sanitation']);
	});
});

describe('the addSeats action', () => {
	it('adds a whole ready-made list, with a flag on every seat', async () => {
		vi.mocked(addSeats).mockResolvedValue({ addedCount: 193, existingCount: 0 });

		await catchRedirect(() => actions.addSeats(makeActionEvent({ source: 'un_members' })));

		const seatsAdded = vi.mocked(addSeats).mock.calls[0][2];

		expect(seatsAdded).toHaveLength(193);
		expect(seatsAdded).toContainEqual({ name: 'France', countryCode: 'FR' });
	});

	it('counts what it added and what was already there', async () => {
		vi.mocked(addSeats).mockResolvedValue({ addedCount: 12, existingCount: 3 });

		const redirect = await catchRedirect(() =>
			actions.addSeats(makeActionEvent({ source: 'security_council' }))
		);

		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: '12 seats added, 3 already existed.'
		});
		expect(redirect.location).toBe(EDITOR_PATH);
	});

	it('says "1 seat added" and "1 already existed" in the singular', async () => {
		vi.mocked(addSeats).mockResolvedValue({ addedCount: 1, existingCount: 1 });

		await catchRedirect(() => actions.addSeats(makeActionEvent({ source: 'eu_members' })));

		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: '1 seat added, 1 already existed.'
		});
	});

	it('gives a pasted country its code, and a pasted character none', async () => {
		const event = makeActionEvent({
			source: 'list',
			names: 'france\nSecretary-General'
		});

		await catchRedirect(() => actions.addSeats(event));

		// No `kind`: a pasted list says nothing about it, so the country code
		// decides, which is what `addSeats` does with a seat that leaves it out.
		expect(addSeats).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, [
			// The name is kept as it was typed; only the matching ignores capitals.
			{ name: 'france', countryCode: 'FR' },
			{ name: 'Secretary-General', countryCode: null }
		]);
	});

	it('refuses an empty textarea', async () => {
		const event = makeActionEvent({ source: 'list', names: '  \n  ' });
		const result = (await actions.addSeats(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('Please enter at least one seat name.');
		expect(addSeats).not.toHaveBeenCalled();
	});

	it('refuses more than three hundred pasted names, and adds none of them', async () => {
		const names = Array.from({ length: 301 }, (unused, index) => `Seat ${index}`);
		const event = makeActionEvent({ source: 'list', names: names.join('\n') });

		const result = (await actions.addSeats(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('Please add at most 300 seats at a time.');
		expect(addSeats).not.toHaveBeenCalled();
	});

	it('refuses a source it has never heard of', async () => {
		const result = (await actions.addSeats(
			makeActionEvent({ source: 'nato_members' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(addSeats).not.toHaveBeenCalled();
	});
});

/* The form field is `seatName`, not `name`: the committee form on the same page
   already has a `name`, and `TextField` builds its id from the field's name, so
   two boxes called `name` would share one id and one label. */
describe('the addSeat action', () => {
	it('adds one seat with the country that was picked', async () => {
		const event = makeActionEvent({ seatName: 'France', kind: 'country', countryCode: 'FR' });

		await catchRedirect(() => actions.addSeat(event));

		expect(addSeats).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, [
			{ name: 'France', countryCode: 'FR', kind: 'country' }
		]);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'success', message: 'Seat added.' });
	});

	/* The kind travels with the seat rather than being worked out from the
	   country code, which is the whole point of the dropdown: an observer with
	   no country would otherwise be stored as `other`. */
	it('passes on the kind the organiser picked', async () => {
		const event = makeActionEvent({ seatName: 'Holy See', kind: 'observer', countryCode: 'VA' });

		await catchRedirect(() => actions.addSeat(event));

		expect(addSeats).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, [
			{ name: 'Holy See', countryCode: 'VA', kind: 'observer' }
		]);
	});

	it('drops a country code that is not a country', async () => {
		const event = makeActionEvent({ seatName: 'Gondor', kind: 'character', countryCode: 'ZZ' });

		await catchRedirect(() => actions.addSeat(event));

		expect(addSeats).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, [
			{ name: 'Gondor', countryCode: null, kind: 'character' }
		]);
	});

	it('refuses a seat with no name', async () => {
		const result = (await actions.addSeat(
			makeActionEvent({ seatName: '   ', kind: 'country' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('Please enter a seat name.');
		expect(addSeats).not.toHaveBeenCalled();
	});

	it('refuses a kind the database has never heard of', async () => {
		const result = (await actions.addSeat(
			makeActionEvent({ seatName: 'France', kind: 'delegation' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(addSeats).not.toHaveBeenCalled();
	});

	it('says so when the committee already has a seat of that name', async () => {
		vi.mocked(addSeats).mockResolvedValue({ addedCount: 0, existingCount: 1 });

		const result = (await actions.addSeat(
			makeActionEvent({ seatName: 'France', kind: 'country' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('This committee already has a seat called France.');
		expect(setFlash).not.toHaveBeenCalled();
	});
});

describe('the moveSeat action', () => {
	it('moves the seat the way the address says, and comes back', async () => {
		const event = makeActionEvent(
			{ seatId: FREE_SEAT.id },
			{ search: '?/moveSeat&direction=down' }
		);

		const redirect = await catchRedirect(() => actions.moveSeat(event));

		expect(moveSeat).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, FREE_SEAT.id, 'down');
		expect(redirect.location).toBe(EDITOR_PATH);
		// The seat visibly moves, so there is nothing for a flash message to add.
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('refuses a direction a seat cannot move in', async () => {
		const event = makeActionEvent(
			{ seatId: FREE_SEAT.id },
			{ search: '?/moveSeat&direction=sideways' }
		);

		const result = (await actions.moveSeat(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(moveSeat).not.toHaveBeenCalled();
	});
});

describe('the hideSeat and showSeat actions', () => {
	it('hides a seat nobody holds', async () => {
		const redirect = await catchRedirect(() =>
			actions.hideSeat(makeActionEvent({ seatId: FREE_SEAT.id }))
		);

		expect(getSeat).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, FREE_SEAT.id);
		expect(setSeatAvailability).toHaveBeenCalledWith(SUPABASE, FREE_SEAT.id, false);
		expect(redirect.location).toBe(EDITOR_PATH);
	});

	it('refuses to hide a seat a delegate is sitting in', async () => {
		vi.mocked(getSeat).mockResolvedValue(FILLED_SEAT);

		const result = (await actions.hideSeat(
			makeActionEvent({ seatId: FILLED_SEAT.id })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('Free the seat first.');
		expect(setSeatAvailability).not.toHaveBeenCalled();
	});

	it('refuses to hide a seat a delegation has been promised', async () => {
		vi.mocked(getSeat).mockResolvedValue(RESERVED_SEAT);

		const result = (await actions.hideSeat(
			makeActionEvent({ seatId: RESERVED_SEAT.id })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('Free the seat first.');
		expect(setSeatAvailability).not.toHaveBeenCalled();
	});

	it('refuses to hide a filled seat whose delegate has no readable name', async () => {
		vi.mocked(getSeat).mockResolvedValue(NAMELESS_FILLED_SEAT);

		const result = (await actions.hideSeat(
			makeActionEvent({ seatId: NAMELESS_FILLED_SEAT.id })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(setSeatAvailability).not.toHaveBeenCalled();
	});

	it('refuses a seat that is not in this committee', async () => {
		vi.mocked(getSeat).mockResolvedValue(null);

		const result = (await actions.hideSeat(
			makeActionEvent({ seatId: 'seat-elsewhere' })
		)) as ActionResult;

		expect(result.status).toBe(404);
		expect(setSeatAvailability).not.toHaveBeenCalled();
	});

	it('puts a hidden seat back on the list', async () => {
		const redirect = await catchRedirect(() =>
			actions.showSeat(makeActionEvent({ seatId: FREE_SEAT.id }))
		);

		expect(getSeat).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, FREE_SEAT.id);
		expect(setSeatAvailability).toHaveBeenCalledWith(SUPABASE, FREE_SEAT.id, true);
		expect(redirect.location).toBe(EDITOR_PATH);
	});

	it('refuses to show a seat that is not in this committee', async () => {
		vi.mocked(getSeat).mockResolvedValue(null);

		const result = (await actions.showSeat(
			makeActionEvent({ seatId: 'seat-elsewhere' })
		)) as ActionResult;

		expect(result.status).toBe(404);
		expect(setSeatAvailability).not.toHaveBeenCalled();
	});
});

describe('the deleteSeat action', () => {
	/** Both halves of the rule answer with the same sentence. */
	const IN_USE_MESSAGE =
		'You cannot delete a seat that is filled or reserved. Free it on the allocation page first.';

	it('deletes a seat nobody holds', async () => {
		const redirect = await catchRedirect(() =>
			actions.deleteSeat(makeActionEvent({ seatId: FREE_SEAT.id }))
		);

		expect(deleteSeat).toHaveBeenCalledWith(SUPABASE, FREE_SEAT.id);
		expect(redirect.location).toBe(EDITOR_PATH);
	});

	it('refuses a seat a delegation has been promised, which the policy would allow', async () => {
		vi.mocked(getSeat).mockResolvedValue(RESERVED_SEAT);

		const result = (await actions.deleteSeat(
			makeActionEvent({ seatId: RESERVED_SEAT.id })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe(IN_USE_MESSAGE);
		expect(deleteSeat).not.toHaveBeenCalled();
	});

	it('refuses a filled seat', async () => {
		vi.mocked(getSeat).mockResolvedValue(FILLED_SEAT);

		const result = (await actions.deleteSeat(
			makeActionEvent({ seatId: FILLED_SEAT.id })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(deleteSeat).not.toHaveBeenCalled();
	});

	it('refuses a filled seat whose delegate has no readable name', async () => {
		vi.mocked(getSeat).mockResolvedValue(NAMELESS_FILLED_SEAT);

		const result = (await actions.deleteSeat(
			makeActionEvent({ seatId: NAMELESS_FILLED_SEAT.id })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(deleteSeat).not.toHaveBeenCalled();
	});

	it('says the same when Row Level Security refuses it in the meantime', async () => {
		vi.mocked(deleteSeat).mockResolvedValue(false);

		const result = (await actions.deleteSeat(
			makeActionEvent({ seatId: FREE_SEAT.id })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe(IN_USE_MESSAGE);
	});
});

describe('the deleteCommittee action', () => {
	it('deletes the committee, says so, and goes back to the list', async () => {
		const redirect = await catchRedirect(() => actions.deleteCommittee(makeActionEvent()));

		expect(deleteCommittee).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Committee deleted.'
		});
		expect(redirect.location).toBe(COMMITTEES_PATH);
	});

	it('says why when Row Level Security refuses a committee with a filled or reserved seat', async () => {
		vi.mocked(deleteCommittee).mockResolvedValue(false);

		const result = (await actions.deleteCommittee(makeActionEvent())) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe(
			'You cannot delete a committee while a seat in it is filled or reserved. Free its seats on the allocation page first.'
		);
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('asks the organiser gate again', async () => {
		await catchRedirect(() => actions.deleteCommittee(makeActionEvent()));

		expect(requirePermissionSomewhere).toHaveBeenCalled();
	});
});

describe('the addChair action', () => {
	it('adds somebody on the chair team, with their title, and says so', async () => {
		const redirect = await catchRedirect(() =>
			actions.addChair(makeActionEvent({ userId: 'user-vice', title: 'Vice Chair' }))
		);

		expect(addCommitteeChair).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			'user-vice',
			'Vice Chair'
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'success', message: 'Chair added.' });
		expect(redirect.location).toBe(EDITOR_PATH);
	});

	it('leaves the title out when the box was empty, so the column default is written', async () => {
		await catchRedirect(() =>
			actions.addChair(makeActionEvent({ userId: 'user-vice', title: '' }))
		);

		expect(addCommitteeChair).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, 'user-vice', undefined);
	});

	it('refuses somebody who is not on the conference chair team', async () => {
		const result = (await actions.addChair(
			makeActionEvent({ userId: 'somebody-else' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe(
			'Only a chair on this conference team can chair a committee. Invite them on the team page first.'
		);
		expect(addCommitteeChair).not.toHaveBeenCalled();
	});

	it('refuses a post with nobody chosen', async () => {
		const result = (await actions.addChair(makeActionEvent())) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('Please choose somebody to add as a chair.');
		expect(listChairStaff).not.toHaveBeenCalled();
	});

	it('refuses a title longer than the team page allows', async () => {
		const result = (await actions.addChair(
			makeActionEvent({ userId: 'user-vice', title: 'x'.repeat(41) })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('Please keep the title under 40 characters.');
		expect(addCommitteeChair).not.toHaveBeenCalled();
	});

	it('says so when the database refuses a second row for the same person', async () => {
		vi.mocked(addCommitteeChair).mockResolvedValue('already-chairs');

		const result = (await actions.addChair(
			makeActionEvent({ userId: 'user-vice' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('That person is already a chair here.');
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('says why when the database refuses the person for the rank rule', async () => {
		vi.mocked(addCommitteeChair).mockResolvedValue('refused');

		const result = (await actions.addChair(
			makeActionEvent({ userId: 'user-vice' })
		)) as ActionResult;

		expect(result.status).toBe(403);
		expect(result.data?.message).toBe('You can only make somebody below your own role a chair.');
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('asks the organiser gate again', async () => {
		await catchRedirect(() => actions.addChair(makeActionEvent({ userId: 'user-vice' })));

		expect(requirePermissionSomewhere).toHaveBeenCalled();
	});
});

describe('the removeChair action', () => {
	it('takes the chair off the committee and comes back to the editor', async () => {
		const redirect = await catchRedirect(() =>
			actions.removeChair(makeActionEvent({ userId: CHAIR.userId }))
		);

		expect(removeCommitteeChair).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, CHAIR.userId);
		// The row visibly goes, so there is nothing for a flash to add.
		expect(setFlash).not.toHaveBeenCalled();
		expect(redirect.location).toBe(EDITOR_PATH);
	});

	it('refuses a post that names nobody', async () => {
		const result = (await actions.removeChair(makeActionEvent())) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.flash).toEqual({
			tone: 'error',
			message: 'Please say which chair to remove.'
		});
		expect(removeCommitteeChair).not.toHaveBeenCalled();
	});

	it('says so when the database deleted nothing', async () => {
		vi.mocked(removeCommitteeChair).mockResolvedValue(false);

		const result = (await actions.removeChair(
			makeActionEvent({ userId: CHAIR.userId })
		)) as ActionResult;

		expect(result.status).toBe(404);
		// The "Remove" button is an instant form, whose toast is the flash, so the
		// reason goes there and the page's notice stays empty.
		expect(result.data?.message).toBeNull();
		expect(result.data?.flash).toEqual({
			tone: 'error',
			message: 'That person no longer chairs this committee, or ranks at or above you.'
		});
	});

	it('asks the organiser gate again', async () => {
		await catchRedirect(() => actions.removeChair(makeActionEvent({ userId: CHAIR.userId })));

		expect(requirePermissionSomewhere).toHaveBeenCalled();
	});
});

describe('the inviteChair action', () => {
	it('writes a chair invitation to this committee and answers with its link', async () => {
		const result = (await actions.inviteChair(
			makeActionEvent({ email: 'New.Chair@example.org' })
		)) as ActionResult;

		// The same row the team page writes for a chair with this committee chosen:
		// the conference's own Chair role, looked up rather than named.
		expect(findChairRole).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
		expect(createStaffInvite).toHaveBeenCalledWith(SUPABASE, {
			conferenceId: CONFERENCE.id,
			email: 'New.Chair@example.org',
			roleId: CHAIR_ROLE.id,
			committeeId: COMMITTEE.id,
			title: null,
			invitedBy: SIGNED_IN_USER.id
		});
		expect(result.chairInvite).toEqual({
			email: 'New.Chair@example.org',
			error: null,
			link: `http://localhost/invites/${'b'.repeat(32)}`
		});
	});

	it('says so when the conference has no role that works per committee', async () => {
		vi.mocked(findChairRole).mockResolvedValue(null);

		const result = (await actions.inviteChair(
			makeActionEvent({ email: 'new.chair@example.org' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.chairInvite?.error).toBe(
			'This conference has no role that works per committee to invite them to.'
		);
		expect(createStaffInvite).not.toHaveBeenCalled();
	});

	it('refuses an address that is not one, before asking the database anything', async () => {
		const result = (await actions.inviteChair(
			makeActionEvent({ email: 'not an address' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.chairInvite?.email).toBe('not an address');
		expect(result.data?.chairInvite?.error).not.toBeNull();
		expect(committeeChairInviteRefusal).not.toHaveBeenCalled();
		expect(createStaffInvite).not.toHaveBeenCalled();
	});

	it('refuses somebody who already chairs this committee', async () => {
		vi.mocked(committeeChairInviteRefusal).mockResolvedValue('already_chair');

		const result = (await actions.inviteChair(
			makeActionEvent({ email: 'chair@example.org' })
		)) as ActionResult;

		expect(committeeChairInviteRefusal).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			'chair@example.org'
		);
		expect(result.status).toBe(400);
		expect(result.data?.chairInvite?.error).toBe('That person already chairs this committee.');
		expect(createStaffInvite).not.toHaveBeenCalled();
	});

	it('refuses an organiser of the conference, whom accepting would demote', async () => {
		vi.mocked(committeeChairInviteRefusal).mockResolvedValue('organiser');

		const result = (await actions.inviteChair(
			makeActionEvent({ email: 'organiser@example.org' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.chairInvite?.error).toBe(
			'That person organises this conference. They can press "Chair it yourself" instead.'
		);
		expect(createStaffInvite).not.toHaveBeenCalled();
	});

	it('refuses an address with an invitation already waiting in this conference', async () => {
		vi.mocked(findPendingInvite).mockResolvedValue({
			id: 'invite-2',
			token: 'c'.repeat(32),
			email: 'new.chair@example.org',
			roleId: CHAIR_ROLE.id,
			roleName: 'Chair',
			committeeId: null,
			committeeName: null,
			title: null,
			expiresAt: '2027-02-01T10:00:00Z'
		});

		const result = (await actions.inviteChair(
			makeActionEvent({ email: 'new.chair@example.org' })
		)) as ActionResult;

		expect(findPendingInvite).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			'new.chair@example.org'
		);
		expect(result.status).toBe(400);
		expect(result.data?.chairInvite?.error).toBe(
			'There is already a pending invitation for that address.'
		);
		expect(createStaffInvite).not.toHaveBeenCalled();
	});

	it('is a 500 with the address kept when nothing could be written', async () => {
		vi.mocked(createStaffInvite).mockResolvedValue(null);

		const result = (await actions.inviteChair(
			makeActionEvent({ email: 'new.chair@example.org' })
		)) as ActionResult;

		expect(result.status).toBe(500);
		expect(result.data?.chairInvite).toEqual({
			email: 'new.chair@example.org',
			error: 'The invitation could not be created. Please try again.',
			link: null
		});
	});

	it('asks the organiser gate again', async () => {
		await actions.inviteChair(makeActionEvent({ email: 'new.chair@example.org' }));

		expect(requirePermissionSomewhere).toHaveBeenCalled();
	});
});

describe('the withdrawChairInvite action', () => {
	it("withdraws this committee's invitation and says so", async () => {
		const redirect = await catchRedirect(() =>
			actions.withdrawChairInvite(makeActionEvent({ inviteId: 'invite-1' }))
		);

		expect(withdrawCommitteeChairInvite).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, 'invite-1');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Invitation withdrawn.'
		});
		expect(redirect.location).toBe(EDITOR_PATH);
	});

	it('refuses a post that names no invitation', async () => {
		const result = (await actions.withdrawChairInvite(makeActionEvent())) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.flash).toEqual({
			tone: 'error',
			message: 'Please say which invitation to withdraw.'
		});
		expect(withdrawCommitteeChairInvite).not.toHaveBeenCalled();
	});

	it("says so when the invitation is not this committee's or was already accepted", async () => {
		vi.mocked(withdrawCommitteeChairInvite).mockResolvedValue(false);

		const result = (await actions.withdrawChairInvite(
			makeActionEvent({ inviteId: 'invite-1' })
		)) as ActionResult;

		expect(result.status).toBe(404);
		expect(result.data?.flash).toEqual({
			tone: 'error',
			message:
				'That invitation is no longer waiting to be accepted, or it offers a role above yours.'
		});
		expect(setFlash).not.toHaveBeenCalled();
	});
});

describe('the chairYourself action', () => {
	it('adds only the reader, without the chair team check addChair makes', async () => {
		const redirect = await catchRedirect(() => actions.chairYourself(makeActionEvent()));

		// No title, so the column's default "Chair" is written.
		expect(addCommitteeChair).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, SIGNED_IN_USER.id);
		expect(listChairStaff).not.toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: `You now chair ${COMMITTEE.name}.`
		});
		expect(redirect.location).toBe(EDITOR_PATH);
	});

	it('adds the reader and nobody else, whatever the form carried', async () => {
		await catchRedirect(() => actions.chairYourself(makeActionEvent({ userId: 'user-vice' })));

		expect(addCommitteeChair).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, SIGNED_IN_USER.id);
	});

	it('refuses a reader who already chairs this committee', async () => {
		vi.mocked(addCommitteeChair).mockResolvedValue('already-chairs');

		const result = (await actions.chairYourself(makeActionEvent())) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('You already chair this committee.');
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('says why when the database refuses the reader all the same', async () => {
		vi.mocked(addCommitteeChair).mockResolvedValue('refused');

		const result = (await actions.chairYourself(makeActionEvent())) as ActionResult;

		expect(result.status).toBe(403);
		expect(result.data?.message).toBe(
			'Only an administrator can chair a committee themselves. Ask one to add you.'
		);
	});

	it('refuses a reader who cannot manage the conference, before writing anything', async () => {
		// `requirePermissionSomewhere` answers somebody who cannot manage the conference,
		// a chair of another committee included, with a 404.
		vi.mocked(requirePermissionSomewhere).mockRejectedValue({ status: 404 });

		await expect(actions.chairYourself(makeActionEvent())).rejects.toMatchObject({ status: 404 });
		expect(addCommitteeChair).not.toHaveBeenCalled();
	});
});

describe('the uploadGuide action', () => {
	it('uploads the file for this committee and says so', async () => {
		const redirect = await catchRedirect(() =>
			actions.uploadGuide(makeUploadGuideEvent({ audience: 'everyone' }))
		);

		expect(uploadBackgroundGuide).toHaveBeenCalledWith(SUPABASE, {
			conferenceId: CONFERENCE.id,
			committeeId: COMMITTEE.id,
			uploadedBy: SIGNED_IN_USER.id,
			title: 'Security Council background guide',
			file: expect.any(File),
			audience: 'everyone'
		});
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Background guide uploaded.'
		});
		expect(redirect.location).toBe(EDITOR_PATH);
	});

	it('refuses a post with an empty file box', async () => {
		const result = (await actions.uploadGuide(
			makeUploadGuideEvent({ file: null })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('Please choose a PDF to upload.');
		expect(uploadBackgroundGuide).not.toHaveBeenCalled();
	});

	it('refuses a file that is not a PDF', async () => {
		const result = (await actions.uploadGuide(
			makeUploadGuideEvent({ file: makeGuideFile('guide.docx', 'text/plain') })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('Please upload a PDF.');
		expect(uploadBackgroundGuide).not.toHaveBeenCalled();
	});

	it('refuses a PDF over twenty megabytes', async () => {
		const result = (await actions.uploadGuide(
			makeUploadGuideEvent({ file: makeOversizedGuideFile() })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('The file must be under 20 MB.');
		expect(uploadBackgroundGuide).not.toHaveBeenCalled();
	});

	it('refuses an audience the guide may not have', async () => {
		const result = (await actions.uploadGuide(
			makeUploadGuideEvent({ audience: 'staff' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('Please say who the background guide is for.');
		expect(uploadBackgroundGuide).not.toHaveBeenCalled();
	});

	it('says so when Storage or the row could not be written', async () => {
		vi.mocked(uploadBackgroundGuide).mockRejectedValue(new Error('Storage is down'));

		const result = (await actions.uploadGuide(makeUploadGuideEvent())) as ActionResult;

		expect(result.status).toBe(500);
		expect(result.data?.message).toBe('The background guide could not be saved. Please try again.');
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('asks the organiser gate again', async () => {
		await catchRedirect(() => actions.uploadGuide(makeUploadGuideEvent()));

		expect(requirePermissionSomewhere).toHaveBeenCalled();
	});
});

describe('the removeGuide action', () => {
	it('removes the guide, says so, and comes back to the editor', async () => {
		const redirect = await catchRedirect(() => actions.removeGuide(makeActionEvent()));

		expect(removeBackgroundGuide).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Background guide removed.'
		});
		expect(redirect.location).toBe(EDITOR_PATH);
	});

	it('says so when there was no guide to remove', async () => {
		vi.mocked(removeBackgroundGuide).mockResolvedValue(false);

		const result = (await actions.removeGuide(makeActionEvent())) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('There is no background guide to remove.');
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('asks the organiser gate again', async () => {
		await catchRedirect(() => actions.removeGuide(makeActionEvent()));

		expect(requirePermissionSomewhere).toHaveBeenCalled();
	});
});

describe('the moveSeatTo action', () => {
	it('puts the dropped seat at its place, counting from 0, and comes back', async () => {
		const event = makeActionEvent({ seatId: FREE_SEAT.id, place: '2' });

		const redirect = await catchRedirect(() => actions.moveSeatTo(event));

		expect(placeOrderedRow).toHaveBeenCalledWith(
			SUPABASE,
			{ table: 'seats', ownerColumn: 'committee_id', ownerId: COMMITTEE.id },
			FREE_SEAT.id,
			1
		);
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(EDITOR_PATH);
		expect(requirePermissionSomewhere).toHaveBeenCalled();
	});

	it('refuses a drop that names no seat or no place, and moves nothing', async () => {
		const withoutPlace = makeActionEvent({ seatId: FREE_SEAT.id });
		const withoutSeat = makeActionEvent({ place: '1' });

		const first = (await actions.moveSeatTo(withoutPlace)) as ActionResult;
		const second = (await actions.moveSeatTo(withoutSeat)) as ActionResult;

		expect(first.status).toBe(400);
		expect(first.data?.message).toBe('That request did not say which seat to move, or where.');
		expect(second.status).toBe(400);
		expect(placeOrderedRow).not.toHaveBeenCalled();
	});

	it('says so when the seat is not in this committee any more', async () => {
		vi.mocked(placeOrderedRow).mockResolvedValue(false);
		const event = makeActionEvent({ seatId: 'gone', place: '1' });

		const result = (await actions.moveSeatTo(event)) as ActionResult;

		expect(result.status).toBe(404);
		expect(result.data?.message).toBe('That seat is no longer in this committee.');
	});
});

describe('the Resolutions settings in load', () => {
	it('reads the settings as the form holds them, and the committees they may be copied to', async () => {
		const result = await load(makeLoadEvent());

		expect(getCommitteeProcedure).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id);
		expect(listOtherCommittees).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, COMMITTEE.id);
		expect(result).toMatchObject({
			procedureValues: { sponsorLimit: '5', supportMinimum: '20', supportUnit: 'percent' },
			procedureCopyTargets: OTHER_COMMITTEES
		});
	});

	it('is a 404 when the committee went before its settings could be read', async () => {
		vi.mocked(getCommitteeProcedure).mockResolvedValue(null);

		await expect(load(makeLoadEvent())).rejects.toMatchObject({ status: 404 });
	});
});

describe('the applyProcedure action', () => {
	it('fills the settings from the procedure and says so', async () => {
		const redirected = await catchRedirect(() =>
			actions.applyProcedure(makeActionEvent({ procedureName: 'thimun' }))
		);

		expect(applyCommitteeProcedure).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, 'thimun');
		expect(redirected).toMatchObject({ status: 303, location: EDITOR_PATH });
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'THIMUN settings applied.'
		});
	});

	it('refuses a procedure it does not know, and asks nothing of the database', async () => {
		const result = (await actions.applyProcedure(
			makeActionEvent({ procedureName: 'custom' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.flash).toEqual({
			tone: 'error',
			message: 'Choose North American or THIMUN procedure.'
		});
		expect(applyCommitteeProcedure).not.toHaveBeenCalled();
	});

	it("shows the database's refusal as a toast", async () => {
		vi.mocked(applyCommitteeProcedure).mockResolvedValue({ refusal: 'Not yours to change.' });

		const result = (await actions.applyProcedure(
			makeActionEvent({ procedureName: 'north_american' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.flash?.message).toBe('Not yours to change.');
		expect(setFlash).not.toHaveBeenCalled();
	});
});

describe('the saveProcedure action', () => {
	it('saves every setting as posted', async () => {
		const redirected = await catchRedirect(() =>
			actions.saveProcedure(makeActionEvent(PROCEDURE_FORM))
		);

		expect(saveCommitteeProcedure).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, PROCEDURE);
		expect(redirected).toMatchObject({ status: 303, location: EDITOR_PATH });
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Resolution settings saved.'
		});
	});

	it('reads a box that was not sent as off, and an empty sponsor box as no cap', async () => {
		// The box left out of the post altogether, as an unticked one is.
		const posted = Object.fromEntries(
			Object.entries({ ...PROCEDURE_FORM, sponsorLimit: '' }).filter(
				([name]) => name !== 'hasWorkingPapers'
			)
		);

		await catchRedirect(() => actions.saveProcedure(makeActionEvent(posted)));

		expect(saveCommitteeProcedure).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			expect.objectContaining({ hasWorkingPapers: false, sponsorLimit: null })
		);
	});

	it('refuses a share over a hundred percent beside its field, keeping what was typed', async () => {
		const result = (await actions.saveProcedure(
			makeActionEvent({ ...PROCEDURE_FORM, supportMinimum: '150' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.procedure).toMatchObject({
			values: { supportMinimum: '150' },
			errors: { supportMinimum: 'Enter a whole percentage from 0 to 100.' }
		});
		expect(result.data?.flash?.tone).toBe('error');
		expect(saveCommitteeProcedure).not.toHaveBeenCalled();
	});

	it("shows the database's refusal as a toast, keeping what was typed", async () => {
		vi.mocked(saveCommitteeProcedure).mockResolvedValue({ refusal: 'Not yours to change.' });

		const result = (await actions.saveProcedure(makeActionEvent(PROCEDURE_FORM))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.flash?.message).toBe('Not yours to change.');
		expect(result.data?.procedure?.values).toMatchObject({ sponsorLimit: '5' });
	});
});

describe('the copyProcedure action', () => {
	it('copies to the committees ticked and counts them', async () => {
		const committeeIds = OTHER_COMMITTEES.map((committee) => committee.id);

		const redirected = await catchRedirect(() =>
			actions.copyProcedure(makeCopyEvent(committeeIds))
		);

		expect(copyCommitteeProcedure).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, committeeIds);
		expect(redirected).toMatchObject({ status: 303, location: EDITOR_PATH });
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Settings copied to 2 committees.'
		});
	});

	it('sends on only committees the page offered', async () => {
		await catchRedirect(() =>
			actions.copyProcedure(makeCopyEvent([OTHER_COMMITTEES[0].id, 'another-conference']))
		);

		expect(copyCommitteeProcedure).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, [
			OTHER_COMMITTEES[0].id
		]);
	});

	it('refuses when nothing is ticked', async () => {
		const result = (await actions.copyProcedure(makeCopyEvent([]))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.flash?.message).toBe(
			'Choose at least one committee to copy the settings to.'
		);
		expect(copyCommitteeProcedure).not.toHaveBeenCalled();
	});

	it("shows the database's refusal as a toast", async () => {
		vi.mocked(copyCommitteeProcedure).mockResolvedValue({ refusal: 'Not yours to change.' });

		const result = (await actions.copyProcedure(
			makeCopyEvent([OTHER_COMMITTEES[1].id])
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.flash?.message).toBe('Not yours to change.');
	});
});

describe('a team manager who is not an administrator (security review L5)', () => {
	/**
	 * Somebody holding a Head of Logistics role, the conference's second: they
	 * manage the team and every committee, and rank 1, above the chairs.
	 */
	const TEAM_MANAGER: MyPermissions = {
		held: [
			{ permission: 'manage_team', scope: 'conference' },
			{ permission: 'manage_committees', scope: 'conference' }
		],
		committeeIds: [],
		rank: 1
	};

	/** Chair staff ranked at or above the manager, whom the database refuses them. */
	const PEER: ChairStaffMember = {
		userId: 'user-peer',
		fullName: 'Noor Haddad',
		title: null,
		rank: 1
	};
	const OWNER: ChairStaffMember = {
		userId: 'user-owner',
		fullName: 'Ines Duarte',
		title: null,
		rank: -1
	};

	beforeEach(() => {
		vi.mocked(requirePermissionSomewhere).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: CONFERENCE,
			permissions: TEAM_MANAGER
		});
		vi.mocked(listChairStaff).mockResolvedValue([...CHAIR_STAFF, PEER, OWNER]);
		vi.mocked(readTeamRanks).mockResolvedValue(
			new Map([
				[CHAIR.userId, 2],
				[PEER.userId, 1],
				[OWNER.userId, -1]
			])
		);
	});

	function makeManagerLoadEvent(): PageServerLoadEvent {
		return makeEvent({
			parent: async () => ({
				conference: CONFERENCE,
				organization: ORGANIZATION,
				permissions: TEAM_MANAGER
			})
		}) as unknown as PageServerLoadEvent;
	}

	it('offers only chair staff ranked below them, and not "Chair it yourself"', async () => {
		const result = await load(makeManagerLoadEvent());

		expect(result).toMatchObject({ chairStaff: CHAIR_STAFF, mayChairYourself: false });
	});

	it('shows "Remove" only on the chairs ranked below them', async () => {
		vi.mocked(listCommitteeChairs).mockResolvedValue([
			CHAIR,
			{ userId: PEER.userId, fullName: PEER.fullName, avatarPath: null, title: 'Chair' },
			{ userId: OWNER.userId, fullName: OWNER.fullName, avatarPath: null, title: 'Chair' }
		]);

		const result = await load(makeManagerLoadEvent());

		expect(result).toMatchObject({ removableChairIds: [CHAIR.userId] });
	});

	it('refuses to take a chair at or above their rank off a committee, before writing anything', async () => {
		for (const member of [PEER, OWNER]) {
			const result = (await actions.removeChair(
				makeActionEvent({ userId: member.userId })
			)) as ActionResult;

			expect(result.status).toBe(403);
			expect(result.data?.flash).toEqual({
				tone: 'error',
				message: 'You can only take somebody below your own role off a committee.'
			});
		}

		expect(removeCommitteeChair).not.toHaveBeenCalled();
	});

	it('takes a chair below them off a committee', async () => {
		await catchRedirect(() => actions.removeChair(makeActionEvent({ userId: CHAIR.userId })));

		expect(removeCommitteeChair).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, CHAIR.userId);
	});

	it('refuses to make a chair of somebody at or above their rank, before writing anything', async () => {
		for (const member of [PEER, OWNER]) {
			const result = (await actions.addChair(
				makeActionEvent({ userId: member.userId })
			)) as ActionResult;

			expect(result.status).toBe(403);
			expect(result.data?.message).toBe('You can only make somebody below your own role a chair.');
		}

		expect(addCommitteeChair).not.toHaveBeenCalled();
	});

	it('makes a chair of somebody below them', async () => {
		await catchRedirect(() => actions.addChair(makeActionEvent({ userId: 'user-vice' })));

		expect(addCommitteeChair).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, 'user-vice', undefined);
	});

	it('refuses "Chair it yourself", which the database would refuse too, before writing anything', async () => {
		const result = (await actions.chairYourself(makeActionEvent())) as ActionResult;

		expect(result.status).toBe(403);
		expect(result.data?.message).toBe(
			'Only an administrator can chair a committee themselves. Ask one to add you.'
		);
		expect(addCommitteeChair).not.toHaveBeenCalled();
	});
});

describe('a chair who edits only their own committee', () => {
	/** The Chair preset, assigned this committee: its agenda, guide and room, nothing more. */
	const CHAIR: MyPermissions = {
		held: [
			{ permission: 'manage_committees', scope: 'committees' },
			{ permission: 'run_room', scope: 'committees' }
		],
		committeeIds: [COMMITTEE.id],
		rank: 1
	};

	beforeEach(() => {
		vi.mocked(requirePermissionSomewhere).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: CONFERENCE,
			permissions: CHAIR
		});
	});

	function makeChairLoadEvent(permissions: MyPermissions = CHAIR): PageServerLoadEvent {
		return makeEvent({
			parent: async () => ({ conference: CONFERENCE, organization: ORGANIZATION, permissions })
		}) as unknown as PageServerLoadEvent;
	}

	it('opens the editor without the chair team, and says what the reader may change', async () => {
		const result = await load(makeChairLoadEvent());

		expect(result?.access).toEqual({
			isWholeEditor: false,
			mayManageChairs: false,
			mayOpenRoom: true
		});
		expect(listChairStaff).not.toHaveBeenCalled();
	});

	it('is a 404 for a committee they are not assigned', async () => {
		const elsewhere = { ...CHAIR, committeeIds: ['another-committee'] };

		await expect(load(makeChairLoadEvent(elsewhere))).rejects.toMatchObject({ status: 404 });
	});

	it('saves the description and the agenda only, whatever else the post carries', async () => {
		await catchRedirect(() => actions.save(makeSaveEvent({ name: 'Renamed' })));

		expect(updateCommittee).not.toHaveBeenCalled();
		expect(updateCommitteeAgenda).toHaveBeenCalledWith(
			SUPABASE,
			COMMITTEE.id,
			// The name is the saved one: the posted "Renamed" is not theirs to change.
			expect.objectContaining({ name: COMMITTEE.name, description: VALID_FORM.description })
		);
	});

	it('refuses deleting the committee and changing its chairs', async () => {
		await expect(actions.deleteCommittee(makeActionEvent())).rejects.toMatchObject({
			status: 404
		});
		await expect(actions.chairYourself(makeActionEvent())).rejects.toMatchObject({ status: 404 });
		expect(deleteCommittee).not.toHaveBeenCalled();
		expect(addCommitteeChair).not.toHaveBeenCalled();
	});

	it('may change the Resolutions settings of their committee', async () => {
		await catchRedirect(() => actions.applyProcedure(makeActionEvent({ procedureName: 'thimun' })));
		await catchRedirect(() => actions.saveProcedure(makeActionEvent(PROCEDURE_FORM)));

		expect(applyCommitteeProcedure).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, 'thimun');
		expect(saveCommitteeProcedure).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, PROCEDURE);
	});

	it('is offered, and may copy to, only the other committees they are assigned', async () => {
		const assignedElsewhere = OTHER_COMMITTEES[1];
		const chairOfTwo = { ...CHAIR, committeeIds: [COMMITTEE.id, assignedElsewhere.id] };
		vi.mocked(requirePermissionSomewhere).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: CONFERENCE,
			permissions: chairOfTwo
		});

		const result = await load(makeChairLoadEvent(chairOfTwo));
		await catchRedirect(() =>
			actions.copyProcedure(makeCopyEvent(OTHER_COMMITTEES.map((committee) => committee.id)))
		);

		expect(result).toMatchObject({ procedureCopyTargets: [assignedElsewhere] });
		expect(copyCommitteeProcedure).toHaveBeenCalledWith(SUPABASE, COMMITTEE.id, [
			assignedElsewhere.id
		]);
	});
});
