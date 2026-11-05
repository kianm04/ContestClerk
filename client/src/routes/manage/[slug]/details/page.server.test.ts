import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { ConferenceEditErrors, ConferenceEditValues } from '$lib/conference-details';
import type { Conference } from '$lib/conferences';
import type { ManagedOrganization } from '$lib/organizations';

// The gate, the queries and the flash cookie are all stood in for, so these
// tests are about what `load` and the two actions themselves decide.
// `requirePermission` has its own tests in `src/lib/server/access`, and what the
// database allows is tested in `tests/db/`.
//
// `$lib/conference-details` is deliberately not stood in for: it is pure, and
// running the real thing is what proves the page and the `save` action agree
// about which values are allowed.
vi.mock('$lib/server/access', () => ({ requirePermission: vi.fn(), requireManagePage: vi.fn() }));

vi.mock('$lib/server/conferences', () => ({
	hasInvoices: vi.fn(),
	readConferenceCurrency: vi.fn(),
	removeConferenceImage: vi.fn(),
	updateConference: vi.fn(),
	uploadConferenceImage: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requireManagePage, requirePermission } from '$lib/server/access';
import {
	hasInvoices,
	readConferenceCurrency,
	removeConferenceImage,
	updateConference,
	uploadConferenceImage
} from '$lib/server/conferences';
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

/** The currency the conference is saved with, unless a test says otherwise. */
const SAVED_CURRENCY = 'EUR';

/**
 * A draft with every optional column still empty, which is what a conference
 * looks like the first time its organiser opens this page.
 */
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

/** The same conference once every one of those columns has been filled in. */
const FILLED_CONFERENCE: Conference = {
	...CONFERENCE,
	description: 'Four days of debate on the Schie.',
	websiteUrl: 'https://riverside-mun.example',
	bannerPath: 'conferences/riverside-mun-2027/banner.jpg',
	logoPath: 'conferences/riverside-mun-2027/logo.png',
	tagline: 'Debate in Delft',
	venueName: 'Riverside College',
	venueAddress: 'Mekelweg 4',
	contactEmail: 'team@riverside-mun.example',
	instagramUrl: 'https://instagram.com/riversidemun',
	contactPhone: '+31 15 278 9111',
	facebookUrl: 'https://facebook.com/riversidemun',
	linkedinUrl: 'https://linkedin.com/company/riversidemun',
	youtubeUrl: 'https://youtube.com/@riversidemun',
	tiktokUrl: 'https://tiktok.com/@riversidemun',
	expectedDelegates: 250,
	minAge: 15,
	maxAge: 19
};

/** The organisation that runs it. The layout reads it; this page only passes it on. */
const ORGANIZATION: ManagedOrganization = {
	id: '22222222-2222-2222-2222-222222222222',
	name: 'Riverside MUN Society',
	slug: 'riverside-mun-society',
	logoPath: null,
	isStripeConnected: false
};

/** A form in which every field holds something the server accepts. */
const VALID_FORM: Record<string, string> = {
	name: 'Riverside MUN 2027',
	description: 'Four days of debate on the Schie.',
	city: 'Delft',
	countryCode: 'NL',
	startDate: '2027-03-04',
	endDate: '2027-03-07',
	websiteUrl: 'riverside-mun.example',
	tagline: 'Debate in Delft',
	venueName: 'Riverside College',
	venueAddress: 'Mekelweg 4',
	timezone: 'Europe/Amsterdam',
	level: 'high_school',
	language: 'English',
	expectedDelegates: '250',
	minAge: '15',
	maxAge: '19',
	currency: 'EUR',
	contactEmail: 'team@riverside-mun.example',
	instagramUrl: 'instagram.com/riversidemun',
	contactPhone: '+31 15 278 9111',
	facebookUrl: 'facebook.com/riversidemun',
	linkedinUrl: 'linkedin.com/company/riversidemun',
	youtubeUrl: 'youtube.com/@riversidemun',
	tiktokUrl: 'tiktok.com/@riversidemun'
};

/** A form in which every single field holds something the server refuses. */
const BAD_FORM: Record<string, string> = {
	name: '',
	description: 'x'.repeat(4001),
	city: '',
	countryCode: 'ZZ',
	startDate: '',
	endDate: '',
	websiteUrl: 'not a web address',
	tagline: 'x'.repeat(121),
	venueName: 'x'.repeat(201),
	venueAddress: 'x'.repeat(201),
	timezone: 'Mars/Olympus',
	level: 'primary_school',
	language: '',
	expectedDelegates: '9000',
	minAge: '4',
	maxAge: '9',
	currency: 'XYZ',
	contactEmail: 'not-an-email',
	instagramUrl: 'not a web address',
	contactPhone: 'ring the office',
	facebookUrl: 'not a web address',
	linkedinUrl: 'not a web address',
	youtubeUrl: 'not a web address',
	tiktokUrl: 'not a web address'
};

/** Every field of the editor that can carry a message, for the "all at once" test. */
const EVERY_FIELD = [
	'banner',
	'city',
	'contactEmail',
	'contactPhone',
	'countryCode',
	'currency',
	'description',
	'endDate',
	'expectedDelegates',
	'facebookUrl',
	'instagramUrl',
	'language',
	'level',
	'linkedinUrl',
	'logo',
	'maxAge',
	'minAge',
	'name',
	'startDate',
	'tagline',
	'tiktokUrl',
	'timezone',
	'venueAddress',
	'venueName',
	'websiteUrl',
	'youtubeUrl'
];

/** A picture of the kind and size the server takes. */
function makeImage(fileName: string, type: string, sizeInBytes: number): File {
	return new File([new Uint8Array(sizeInBytes)], fileName, { type });
}

/**
 * What a file box nobody chose a file in posts: a `File` with no name, no type
 * and a size of 0. Every real browser sends this for an untouched file input,
 * which is why the action has to tell it apart from a picture.
 */
function makeUntouchedFileBox(): File {
	return new File([], '', { type: 'application/octet-stream' });
}

/**
 * The few pieces of a request that `load` and the actions here actually read.
 *
 * SvelteKit hands them a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		params: { slug: CONFERENCE.slug },
		url: new URL(`http://localhost/manage/${CONFERENCE.slug}/details`),
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

/** A post to the `save` action, carrying these text fields and these files. */
function makeSaveEvent(
	fields: Record<string, string> = VALID_FORM,
	files: Record<string, File> = {}
): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	for (const [name, file] of Object.entries(files)) {
		formData.set(name, file);
	}

	return makeEvent({
		request: { formData: async () => formData }
	}) as unknown as RequestEvent;
}

/**
 * A post to the `removeImage` action.
 *
 * Which picture is meant travels in the address rather than in a field, because
 * the button that posts it sits inside the page's one big form, so `search` is
 * what this stand-in has to carry.
 */
function makeRemoveEvent(search: string): RequestEvent {
	return makeEvent({
		url: new URL(`http://localhost/manage/${CONFERENCE.slug}/details${search}`)
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

/** What an action returns when it refuses: `fail` gives back `{ status, data }`. */
type ActionResult = {
	status?: number;
	data?: {
		values?: ConferenceEditValues | null;
		errors?: ConferenceEditErrors;
		message?: string | null;
	};
};

/** The page itself: where a published conference stays after a save, and where a picture removal comes back to. */
const DETAILS_PATH = '/manage/riverside-mun-2027/details';

/** The next setup step, where a draft goes after "Save and continue". */
const COMMITTEES_PATH = '/manage/riverside-mun-2027/committees';

/** The same conference once it is public, so a save no longer moves on. */
const PUBLISHED_CONFERENCE: Conference = { ...CONFERENCE, status: 'published' };

beforeEach(() => {
	vi.mocked(requirePermission).mockResolvedValue({
		user: SIGNED_IN_USER,
		conference: CONFERENCE
	});
	vi.mocked(readConferenceCurrency).mockResolvedValue(SAVED_CURRENCY);
	vi.mocked(hasInvoices).mockResolvedValue(false);
	vi.mocked(updateConference).mockResolvedValue(undefined);
	vi.mocked(uploadConferenceImage).mockResolvedValue(undefined);
	vi.mocked(removeConferenceImage).mockResolvedValue(undefined);
	vi.mocked(setFlash).mockClear();
});

describe('load', () => {
	it('works from the conference the layout already read, and does not check again', async () => {
		await load(makeLoadEvent());

		// The layout read the reader's permissions once; the page checks its own
		// line against them instead of asking the database a second time.
		expect(requirePermission).not.toHaveBeenCalled();
		expect(requireManagePage).toHaveBeenCalledWith(ADMINISTRATOR, 'details');
		expect(readConferenceCurrency).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
		expect(hasInvoices).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
	});

	/* `toMatchObject` rather than reading a field off the answer: SvelteKit
	   types every `load` as allowed to return nothing at all, so the answer is
	   compared as a whole instead of being narrowed first. */
	it('turns the empty columns of a new conference into the empty text a field holds', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({
			values: {
				name: 'Riverside MUN 2027',
				description: '',
				city: 'Delft',
				countryCode: 'NL',
				startDate: '2027-03-04',
				endDate: '2027-03-07',
				websiteUrl: '',
				tagline: '',
				venueName: '',
				venueAddress: '',
				timezone: 'Europe/Amsterdam',
				level: 'high_school',
				language: 'English',
				expectedDelegates: '',
				minAge: '',
				maxAge: '',
				currency: SAVED_CURRENCY,
				contactEmail: '',
				instagramUrl: '',
				contactPhone: '',
				facebookUrl: '',
				linkedinUrl: '',
				youtubeUrl: '',
				tiktokUrl: ''
			}
		});
	});

	it('hands a filled conference its own values, with the numbers as text', async () => {
		const result = await load(makeLoadEvent(FILLED_CONFERENCE));

		expect(result).toMatchObject({
			values: {
				description: 'Four days of debate on the Schie.',
				websiteUrl: 'https://riverside-mun.example',
				tagline: 'Debate in Delft',
				venueName: 'Riverside College',
				venueAddress: 'Mekelweg 4',
				contactEmail: 'team@riverside-mun.example',
				instagramUrl: 'https://instagram.com/riversidemun',
				contactPhone: '+31 15 278 9111',
				facebookUrl: 'https://facebook.com/riversidemun',
				linkedinUrl: 'https://linkedin.com/company/riversidemun',
				youtubeUrl: 'https://youtube.com/@riversidemun',
				tiktokUrl: 'https://tiktok.com/@riversidemun',
				expectedDelegates: '250',
				minAge: '15',
				maxAge: '19'
			}
		});
	});

	it('says the currency is locked once the conference has an invoice', async () => {
		vi.mocked(hasInvoices).mockResolvedValue(true);

		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ isCurrencyLocked: true });
	});

	it('says it is not locked while there is no invoice', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ isCurrencyLocked: false });
	});

	it('hands the page the lists its dropdowns are built from', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({
			currencyOptions: expect.arrayContaining([{ value: 'EUR', label: 'EUR · Euro' }]),
			timezoneOptions: expect.arrayContaining([
				{ value: 'Europe/Amsterdam', label: 'Europe/Amsterdam' }
			]),
			levelOptions: expect.arrayContaining([{ value: 'high_school', label: 'High school' }])
		});
	});
});

describe('the save action', () => {
	it('answers a message for every field at once, and saves nothing', async () => {
		const files = {
			banner: makeImage('brochure.pdf', 'application/pdf', 1024),
			logo: makeImage('logo.png', 'image/png', 6 * 1024 * 1024)
		};

		const result = (await actions.save(makeSaveEvent(BAD_FORM, files))) as ActionResult;

		expect(result.status).toBe(400);
		expect(Object.keys(result.data?.errors ?? {}).sort()).toEqual(EVERY_FIELD);
		expect(result.data?.message).toBeNull();
		expect(updateConference).not.toHaveBeenCalled();
		expect(uploadConferenceImage).not.toHaveBeenCalled();
	});

	it('names what is wrong with each picture', async () => {
		const files = {
			banner: makeImage('brochure.pdf', 'application/pdf', 1024),
			logo: makeImage('logo.png', 'image/png', 6 * 1024 * 1024)
		};

		const result = (await actions.save(makeSaveEvent(VALID_FORM, files))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.errors?.banner).toBe('Please upload a JPEG, PNG or WebP image.');
		expect(result.data?.errors?.logo).toBe('The image must be under 5 MB.');
	});

	it('sends back what was typed, so a refused form keeps it', async () => {
		const result = (await actions.save(makeSaveEvent(BAD_FORM))) as ActionResult;

		expect(result.data?.values?.tagline).toBe(BAD_FORM.tagline);
		expect(result.data?.values?.venueName).toBe(BAD_FORM.venueName);
	});

	it('writes the saved currency when the locked form sends none', async () => {
		vi.mocked(hasInvoices).mockResolvedValue(true);
		vi.mocked(readConferenceCurrency).mockResolvedValue('GBP');

		// The locked section shows the code as words and has no control at all,
		// so the form really does arrive without a currency field.
		const withoutCurrency = { ...VALID_FORM, currency: '' };

		await catchRedirect(() => actions.save(makeSaveEvent(withoutCurrency)));

		expect(updateConference).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			expect.objectContaining({ currency: 'GBP' })
		);
	});

	it('sends the saved currency back when a locked form is refused for another field', async () => {
		vi.mocked(hasInvoices).mockResolvedValue(true);
		vi.mocked(readConferenceCurrency).mockResolvedValue('GBP');

		// A locked form posts no currency, and this one has something else wrong
		// with it, so the page is drawn again from what comes back here. Without
		// the saved code in it the locked section would draw its "code in words"
		// line with no code in it, which is what review round 1 found.
		const lockedAndWrong = { ...VALID_FORM, currency: '', language: '' };

		const result = (await actions.save(makeSaveEvent(lockedAndWrong))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.values?.currency).toBe('GBP');
		expect(result.data?.errors?.language).toBe('Please enter the language of the conference.');
		expect(updateConference).not.toHaveBeenCalled();
	});

	it('refuses a locked form that names another currency, and changes nothing', async () => {
		vi.mocked(hasInvoices).mockResolvedValue(true);
		vi.mocked(readConferenceCurrency).mockResolvedValue('GBP');

		const result = (await actions.save(makeSaveEvent(VALID_FORM))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.errors?.currency).toBe('The currency cannot change once invoices exist.');
		expect(updateConference).not.toHaveBeenCalled();
	});

	it('writes the row and uploads only the picture that was chosen', async () => {
		const files = {
			banner: makeImage('banner.jpg', 'image/jpeg', 2048),
			logo: makeUntouchedFileBox()
		};

		await catchRedirect(() => actions.save(makeSaveEvent(VALID_FORM, files)));

		expect(updateConference).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			expect.objectContaining({ name: 'Riverside MUN 2027', currency: 'EUR' })
		);
		expect(uploadConferenceImage).toHaveBeenCalledTimes(1);
		expect(uploadConferenceImage).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			'banner',
			files.banner
		);
	});

	it('uploads both pictures when both were chosen', async () => {
		const files = {
			banner: makeImage('banner.jpg', 'image/jpeg', 2048),
			logo: makeImage('logo.png', 'image/png', 2048)
		};

		await catchRedirect(() => actions.save(makeSaveEvent(VALID_FORM, files)));

		expect(uploadConferenceImage).toHaveBeenCalledTimes(2);
		expect(uploadConferenceImage).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, 'logo', files.logo);
	});

	it('ignores a file box nobody used, rather than calling it a bad picture', async () => {
		const files = {
			banner: makeUntouchedFileBox(),
			logo: makeUntouchedFileBox()
		};

		const redirect = await catchRedirect(() => actions.save(makeSaveEvent(VALID_FORM, files)));

		expect(updateConference).toHaveBeenCalled();
		expect(uploadConferenceImage).not.toHaveBeenCalled();
		expect(redirect.location).toBe(COMMITTEES_PATH);
	});

	it('says the row was saved when the upload is what failed', async () => {
		vi.mocked(uploadConferenceImage).mockRejectedValue(new Error('Storage is down.'));

		const files = { banner: makeImage('banner.jpg', 'image/jpeg', 2048) };

		const result = (await actions.save(makeSaveEvent(VALID_FORM, files))) as ActionResult;

		expect(result.status).toBe(500);
		expect(result.data?.message).toBe(
			'The image could not be saved. Your other changes were saved.'
		);
		// The row is written before the pictures, which is what makes that true.
		expect(updateConference).toHaveBeenCalled();
	});

	it('saves a draft, says so, and moves on to the next setup step', async () => {
		const redirect = await catchRedirect(() => actions.save(makeSaveEvent()));

		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Details saved.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(COMMITTEES_PATH);
	});

	it('saves a published conference and comes back to the same page', async () => {
		vi.mocked(requirePermission).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: PUBLISHED_CONFERENCE
		});

		const redirect = await catchRedirect(() => actions.save(makeSaveEvent()));

		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(DETAILS_PATH);
	});

	it('asks the organiser gate again, because an action is its own request', async () => {
		await catchRedirect(() => actions.save(makeSaveEvent()));

		expect(requirePermission).toHaveBeenCalled();
	});
});

describe('the removeImage action', () => {
	it('takes the banner away and says so', async () => {
		const redirect = await catchRedirect(() =>
			actions.removeImage(makeRemoveEvent('?/removeImage&kind=banner'))
		);

		expect(removeConferenceImage).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, 'banner');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Image removed.'
		});
		expect(redirect.location).toBe(DETAILS_PATH);
	});

	it('takes the logo away', async () => {
		await catchRedirect(() => actions.removeImage(makeRemoveEvent('?/removeImage&kind=logo')));

		expect(removeConferenceImage).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, 'logo');
	});

	it('refuses a kind this page does not have', async () => {
		const result = (await actions.removeImage(
			makeRemoveEvent('?/removeImage&kind=mascot')
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('That is not a picture this page has.');
		expect(removeConferenceImage).not.toHaveBeenCalled();
	});

	it('refuses a request that names no kind at all', async () => {
		const result = (await actions.removeImage(makeRemoveEvent('?/removeImage'))) as ActionResult;

		expect(result.status).toBe(400);
		expect(removeConferenceImage).not.toHaveBeenCalled();
	});

	it('asks the organiser gate again', async () => {
		await catchRedirect(() => actions.removeImage(makeRemoveEvent('?/removeImage&kind=logo')));

		expect(requirePermission).toHaveBeenCalled();
	});
});
