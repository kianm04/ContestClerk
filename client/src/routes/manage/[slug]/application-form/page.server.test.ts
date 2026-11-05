import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
// The real constants and the real empty form, not copies of them: renaming a
// field or changing a limit in `$lib/application-questions.ts` has to fail here
// too.
import {
	EMPTY_QUESTION_FORM,
	MAX_QUESTIONS,
	type ApplicationQuestion
} from '$lib/application-questions';
import type { Conference } from '$lib/conferences';
import type { ManagedOrganization } from '$lib/organizations';
import type { ApplicationFormSettings } from '$lib/server/application-form-settings';

// The gate, the queries and the flash cookie are all stood in for, so these
// tests are about what `load` and the actions themselves decide.
// `requirePermission` has its own tests in `src/lib/server/access`, and what the
// database allows is tested in `tests/db/`.
//
// `$lib/application-form-settings` and `$lib/application-questions` are
// deliberately not stood in for: they are pure, and running the real rules is
// what proves the page and the actions agree about when a window is valid, when
// a preference count may go down and when a question may be changed.
vi.mock('$lib/server/access', () => ({ requirePermission: vi.fn(), requireManagePage: vi.fn() }));

vi.mock('$lib/server/application-form-settings', () => ({
	readApplicationFormSettings: vi.fn(),
	updateApplicationWindow: vi.fn(),
	updateApplicationFormSettings: vi.fn(),
	countSubmittedApplications: vi.fn()
}));

vi.mock('$lib/server/application-questions', () => ({
	listApplicationQuestions: vi.fn(),
	getApplicationQuestion: vi.fn(),
	createApplicationQuestion: vi.fn(),
	updateApplicationQuestion: vi.fn(),
	moveApplicationQuestion: vi.fn(),
	deleteApplicationQuestion: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

vi.mock('$lib/server/ordered-rows', () => ({ placeOrderedRow: vi.fn() }));

import { requireManagePage, requirePermission } from '$lib/server/access';
import {
	countSubmittedApplications,
	readApplicationFormSettings,
	updateApplicationFormSettings,
	updateApplicationWindow
} from '$lib/server/application-form-settings';
import {
	createApplicationQuestion,
	deleteApplicationQuestion,
	getApplicationQuestion,
	listApplicationQuestions,
	moveApplicationQuestion,
	updateApplicationQuestion
} from '$lib/server/application-questions';
import { setFlash } from '$lib/server/flash';
import { placeOrderedRow } from '$lib/server/ordered-rows';
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

/**
 * The conference every test works on.
 *
 * Its timezone is what the two `datetime-local` boxes are read in, its start
 * and end dates are what the window and the position paper deadline are
 * measured against, and its own application settings are what `load` fills the
 * two upper forms from.
 */
const CONFERENCE = {
	id: '11111111-1111-1111-1111-111111111111',
	slug: 'riverside-mun-2027',
	name: 'Riverside MUN 2027',
	timezone: 'Europe/Amsterdam',
	startDate: '2027-02-12',
	endDate: '2027-02-15',
	applicationsOpenAt: '2026-10-01T07:00:00Z',
	applicationsCloseAt: '2026-12-15T22:59:00Z',
	acceptsIndividualApplications: true,
	acceptsDelegations: false,
	positionPaperRequired: true,
	positionPaperDeadline: '2027-02-01T22:59:00Z'
} as unknown as Conference;

/** The organisation the layout reads beside it. Nothing on this page uses it. */
const ORGANIZATION = {
	id: '22222222-2222-2222-2222-222222222222',
	name: 'Riverside MUN Society',
	slug: 'riverside-mun-society',
	logoPath: null,
	isStripeConnected: false
} as ManagedOrganization;

/** The two settings that are not columns on the `Conference` the layout hands over. */
const SAVED_SETTINGS: ApplicationFormSettings = {
	committeePreferenceCount: 2,
	askMotivation: true
};

/** A plain text question, first in the list. */
const DIETARY: ApplicationQuestion = {
	id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
	label: 'Dietary requirements',
	helpText: 'Anything the caterers should know.',
	type: 'short_text',
	options: [],
	isRequired: false,
	position: 1
};

/** A question with options, which is what the "already answered" lock is about. */
const TSHIRT: ApplicationQuestion = {
	id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
	label: 'T-shirt size',
	helpText: null,
	type: 'single_choice',
	options: ['S', 'M', 'L'],
	isRequired: true,
	position: 2
};

/** The page every action comes back to. */
const FORM_PATH = '/manage/riverside-mun-2027/application-form';

/**
 * The few pieces of a request that `load` and the actions here actually read.
 *
 * SvelteKit hands them a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		params: { slug: CONFERENCE.slug },
		url: new URL(`http://localhost${FORM_PATH}`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		...overrides
	};
}

/**
 * That stand-in, as the `load` function's own event type.
 *
 * `parent()` is how a page's `load` reads what the layout above it returned. It
 * is an async function on the event, so the stand-in is one too. `search` is
 * what carries `?edit=` in.
 */
function makeLoadEvent(search: string = ''): PageServerLoadEvent {
	return makeEvent({
		url: new URL(`http://localhost${FORM_PATH}${search}`),
		parent: async () => ({
			conference: CONFERENCE,
			organization: ORGANIZATION,
			permissions: ADMINISTRATOR
		})
	}) as unknown as PageServerLoadEvent;
}

/**
 * A post to one of the actions.
 *
 * `search` carries what travels in the action's own address, which for
 * `moveQuestion` is the direction; `fields` are the hidden and typed fields the
 * form sent. A tick box that is not ticked sends nothing at all, so an unticked
 * box is simply left out of `fields`.
 */
function makeActionEvent(search: string, fields: Record<string, string> = {}): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return makeEvent({
		url: new URL(`http://localhost${FORM_PATH}${search}`),
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

/** What an action returns when it refuses: `fail` gives back `{ status, data }`. */
type ActionResult = {
	status?: number;
	data?: {
		message?: string | null;
		windowValues?: { applicationsOpenAt: string } | null;
		windowErrors?: {
			applicationsOpenAt?: string;
			applicationsCloseAt?: string;
			whoCanApply?: string;
		};
		settingsValues?: { committeePreferenceCount: string } | null;
		settingsErrors?: { committeePreferenceCount?: string; positionPaperDeadline?: string };
		questionValues?: { label: string } | null;
		questionErrors?: { label?: string; options?: string };
	};
};

beforeEach(() => {
	vi.mocked(requirePermission).mockResolvedValue({
		user: SIGNED_IN_USER,
		conference: CONFERENCE
	});
	vi.mocked(readApplicationFormSettings).mockResolvedValue(SAVED_SETTINGS);
	vi.mocked(countSubmittedApplications).mockResolvedValue(0);
	vi.mocked(updateApplicationWindow).mockResolvedValue(undefined);
	vi.mocked(updateApplicationFormSettings).mockResolvedValue(undefined);
	vi.mocked(listApplicationQuestions).mockResolvedValue([DIETARY, TSHIRT]);
	vi.mocked(getApplicationQuestion).mockResolvedValue(TSHIRT);
	vi.mocked(createApplicationQuestion).mockResolvedValue(undefined);
	vi.mocked(updateApplicationQuestion).mockResolvedValue(undefined);
	vi.mocked(moveApplicationQuestion).mockResolvedValue(undefined);
	vi.mocked(deleteApplicationQuestion).mockResolvedValue(undefined);
	vi.mocked(setFlash).mockClear();
	vi.mocked(placeOrderedRow).mockReset();
	vi.mocked(placeOrderedRow).mockResolvedValue(true);
});

describe('load', () => {
	it('works from the conference the layout already read, and does not check again', async () => {
		await load(makeLoadEvent());

		// The layout read the reader's permissions once; the page checks its own
		// line against them instead of asking the database a second time.
		expect(requirePermission).not.toHaveBeenCalled();
		expect(requireManagePage).toHaveBeenCalledWith(ADMINISTRATOR, 'application-form');
		expect(listApplicationQuestions).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
		expect(readApplicationFormSettings).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
		expect(countSubmittedApplications).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
	});

	/* `toMatchObject` rather than reading a field off the answer: SvelteKit
	   types every `load` as allowed to return nothing at all, so the answer is
	   compared as a whole instead of being narrowed first. */
	it('hands the page the questions in the order they came back, and the count', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({
			questions: [DIETARY, TSHIRT],
			applicationCount: 0
		});
	});

	it('does not hand the browser the settings row itself, only the form built from it', async () => {
		const result = await load(makeLoadEvent());

		// The page draws nothing from the row that `settingsForm` does not already
		// carry, and `load` returning data nothing reads is a thing the next
		// reader has to check before they can change it.
		expect(result).not.toHaveProperty('settings');
		// `toMatchObject` rather than reading the field, because `load`'s generated
		// return type includes `void` and the compiler cannot see past it. Every
		// other test of `load` here reads it the same way.
		expect(result).toMatchObject({
			settingsForm: {
				committeePreferenceCount: String(SAVED_SETTINGS.committeePreferenceCount)
			}
		});
	});

	it('shows the two saved moments as boxes in the conference timezone', async () => {
		const result = await load(makeLoadEvent());

		// 07:00 UTC on 1 October is 09:00 in Amsterdam, where the clock is two
		// hours ahead in October and one hour ahead in December.
		expect(result).toMatchObject({
			windowForm: {
				applicationsOpenAt: '2026-10-01T09:00',
				applicationsCloseAt: '2026-12-15T23:59',
				acceptsIndividualApplications: true,
				acceptsDelegations: false
			}
		});
	});

	it('starts on "As soon as I publish" once the saved opening has passed', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ windowForm: { opensWhen: 'publish' } });
	});

	it('shows the saved form settings, with the preference count as text', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({
			settingsForm: {
				committeePreferenceCount: '2',
				askMotivation: true,
				positionPaperRequired: true,
				positionPaperDeadline: '2027-02-01T23:59'
			}
		});
	});

	it('shows the empty question form and no question being edited on a plain visit', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({
			questionForm: EMPTY_QUESTION_FORM,
			editQuestionId: null
		});
	});

	it('hands the page the moment it was drawn, so the notice agrees with the server', async () => {
		const result = await load(makeLoadEvent());

		// An ISO instant, not a `Date`: only text survives the trip to the browser.
		expect(typeof (result as { now: string }).now).toBe('string');
	});

	it('fills the question form from the question that ?edit= names', async () => {
		const result = await load(makeLoadEvent(`?edit=${TSHIRT.id}`));

		expect(result).toMatchObject({
			editQuestionId: TSHIRT.id,
			questionForm: {
				questionId: TSHIRT.id,
				label: 'T-shirt size',
				type: 'single_choice',
				isRequired: true
			}
		});
	});

	it('falls back to the empty form when ?edit= names no question of this conference', async () => {
		// A link that has gone stale is not an error: it simply shows "Add question".
		const result = await load(makeLoadEvent('?edit=dddddddd-dddd-dddd-dddd-dddddddddddd'));

		expect(result).toMatchObject({
			questionForm: EMPTY_QUESTION_FORM,
			editQuestionId: null
		});
	});
});

describe('the save action', () => {
	/**
	 * What the three settings sections send together: a chosen opening date,
	 * both kinds of applicant, and every question of the form switched on.
	 */
	const SETTINGS = {
		opensWhen: 'date',
		applicationsOpenAt: '2026-10-01T09:00',
		applicationsCloseAt: '2026-12-15T23:59',
		acceptsIndividualApplications: 'on',
		acceptsDelegations: 'on',
		committeePreferenceCount: '3',
		askMotivation: 'on',
		positionPaperRequired: 'on',
		positionPaperDeadline: '2027-02-01T23:59'
	};

	it('saves the window and the form settings in the conference timezone, and says so', async () => {
		const redirect = await catchRedirect(() => actions.save(makeActionEvent('?/save', SETTINGS)));

		// Amsterdam is two hours ahead of UTC in October and one hour ahead in
		// December, which is the whole reason the zone is asked for rather than
		// taken from whichever machine is running.
		expect(updateApplicationWindow).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, {
			applicationsOpenAt: '2026-10-01T07:00:00.000Z',
			applicationsCloseAt: '2026-12-15T22:59:00.000Z',
			acceptsIndividualApplications: true,
			acceptsDelegations: true
		});
		expect(updateApplicationFormSettings).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, {
			committeePreferenceCount: 3,
			askMotivation: true,
			positionPaperRequired: true,
			positionPaperDeadline: '2027-02-01T22:59:00.000Z'
		});
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Application form saved.'
		});
		expect(redirect.status).toBe(303);
	});

	it('comes back to the page once the conference is public', async () => {
		const redirect = await catchRedirect(() => actions.save(makeActionEvent('?/save', SETTINGS)));

		expect(redirect.location).toBe(FORM_PATH);
	});

	it('goes on to the fees step while the conference is a draft', async () => {
		vi.mocked(requirePermission).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: { ...CONFERENCE, status: 'draft' }
		});

		const redirect = await catchRedirect(() => actions.save(makeActionEvent('?/save', SETTINGS)));

		expect(redirect.location).toBe('/manage/riverside-mun-2027/fees');
	});

	it('keeps an opening that has passed when the window opens on publishing', async () => {
		// The box still holds a date, but "As soon as I publish" ignores it. The
		// saved opening (1 October) has already passed, so it stays as it is,
		// and is never stored as nothing.
		const event = makeActionEvent('?/save', {
			...SETTINGS,
			opensWhen: 'publish',
			applicationsOpenAt: '2026-11-20T09:00'
		});

		await catchRedirect(() => actions.save(event));

		expect(updateApplicationWindow).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			expect.objectContaining({ applicationsOpenAt: CONFERENCE.applicationsOpenAt })
		);
	});

	it('saves an empty closing box as a window that stays open', async () => {
		const event = makeActionEvent('?/save', { ...SETTINGS, applicationsCloseAt: '' });

		await catchRedirect(() => actions.save(event));

		expect(updateApplicationWindow).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			expect.objectContaining({ applicationsCloseAt: null })
		);
	});

	it('refuses a chosen date that was left empty, and saves nothing', async () => {
		const event = makeActionEvent('?/save', { ...SETTINGS, applicationsOpenAt: '' });

		const result = (await actions.save(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.windowErrors?.applicationsOpenAt).toBe(
			'Please choose when applications open.'
		);
		expect(updateApplicationWindow).not.toHaveBeenCalled();
		expect(updateApplicationFormSettings).not.toHaveBeenCalled();
	});

	it('refuses a window that closes before it opens, and saves nothing', async () => {
		const event = makeActionEvent('?/save', {
			...SETTINGS,
			applicationsCloseAt: '2026-09-01T09:00'
		});

		const result = (await actions.save(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.windowErrors?.applicationsCloseAt).toBeTruthy();
		expect(updateApplicationWindow).not.toHaveBeenCalled();
	});

	it('refuses a window that accepts nobody at all', async () => {
		// Neither tick box was ticked, so neither is in the form data.
		const nobody = {
			opensWhen: SETTINGS.opensWhen,
			applicationsOpenAt: SETTINGS.applicationsOpenAt,
			applicationsCloseAt: SETTINGS.applicationsCloseAt,
			committeePreferenceCount: SETTINGS.committeePreferenceCount
		};

		const result = (await actions.save(makeActionEvent('?/save', nobody))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.windowErrors?.whoCanApply).toBeTruthy();
		expect(updateApplicationWindow).not.toHaveBeenCalled();
	});

	it('refuses a required position paper with no deadline behind it', async () => {
		const event = makeActionEvent('?/save', { ...SETTINGS, positionPaperDeadline: '' });

		const result = (await actions.save(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.settingsErrors?.positionPaperDeadline).toBeTruthy();
		expect(updateApplicationFormSettings).not.toHaveBeenCalled();
		expect(updateApplicationWindow).not.toHaveBeenCalled();
	});

	it('measures the paper deadline against the opening being saved, not the saved one', async () => {
		// The saved opening is 1 October; the one being saved is 5 February, so a
		// deadline on 1 February would be due before anybody could apply.
		const event = makeActionEvent('?/save', {
			...SETTINGS,
			applicationsOpenAt: '2027-02-05T09:00',
			applicationsCloseAt: '2027-02-10T09:00'
		});

		const result = (await actions.save(event)) as ActionResult;

		expect(result.data?.settingsErrors?.positionPaperDeadline).toBe(
			'The deadline must be after applications open.'
		);
	});

	it('hands back both halves of what was typed, so a refused form keeps all of it', async () => {
		const event = makeActionEvent('?/save', { ...SETTINGS, positionPaperDeadline: '' });

		const result = (await actions.save(event)) as ActionResult;

		expect(result.data?.windowValues).toMatchObject({ applicationsOpenAt: '2026-10-01T09:00' });
		expect(result.data?.settingsValues).toMatchObject({ committeePreferenceCount: '3' });
	});

	it('refuses fewer preferences once people have applied', async () => {
		vi.mocked(countSubmittedApplications).mockResolvedValue(7);

		const event = makeActionEvent('?/save', { ...SETTINGS, committeePreferenceCount: '1' });

		const result = (await actions.save(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.settingsErrors?.committeePreferenceCount).toBeTruthy();
		expect(updateApplicationFormSettings).not.toHaveBeenCalled();
	});

	it('still allows more preferences once people have applied', async () => {
		vi.mocked(countSubmittedApplications).mockResolvedValue(7);

		await catchRedirect(() => actions.save(makeActionEvent('?/save', SETTINGS)));

		expect(updateApplicationFormSettings).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			expect.objectContaining({ committeePreferenceCount: 3 })
		);
	});

	it('asks the organiser gate again, because an action is its own request', async () => {
		await catchRedirect(() => actions.save(makeActionEvent('?/save', SETTINGS)));

		expect(requirePermission).toHaveBeenCalled();
	});
});

describe('the addQuestion action', () => {
	/** The fields the question form sends for a plain text question. */
	const NEW_QUESTION = {
		questionId: '',
		label: 'Dietary requirements',
		helpText: 'Anything the caterers should know.',
		type: 'short_text',
		options: '',
		isRequired: 'on'
	};

	it('adds the question and comes back to the page', async () => {
		const redirect = await catchRedirect(() =>
			actions.addQuestion(makeActionEvent('?/addQuestion', NEW_QUESTION))
		);

		expect(createApplicationQuestion).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, {
			label: 'Dietary requirements',
			helpText: 'Anything the caterers should know.',
			type: 'short_text',
			options: [],
			isRequired: true
		});
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Question added.'
		});
		expect(redirect.location).toBe(FORM_PATH);
	});

	it('keeps the options of a choice question, one per line', async () => {
		const event = makeActionEvent('?/addQuestion', {
			...NEW_QUESTION,
			label: 'T-shirt size',
			type: 'single_choice',
			options: 'S\nM\nL'
		});

		await catchRedirect(() => actions.addQuestion(event));

		expect(createApplicationQuestion).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			expect.objectContaining({ options: ['S', 'M', 'L'] })
		);
	});

	it('throws away the options of a question that is not a choice', async () => {
		const event = makeActionEvent('?/addQuestion', { ...NEW_QUESTION, options: 'S\nM\nL' });

		await catchRedirect(() => actions.addQuestion(event));

		expect(createApplicationQuestion).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			expect.objectContaining({ options: [] })
		);
	});

	it('saves help text nobody wrote as nothing at all', async () => {
		const event = makeActionEvent('?/addQuestion', { ...NEW_QUESTION, helpText: '' });

		await catchRedirect(() => actions.addQuestion(event));

		expect(createApplicationQuestion).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			expect.objectContaining({ helpText: null })
		);
	});

	it('refuses a question with nothing in it, and adds nothing', async () => {
		const result = (await actions.addQuestion(
			makeActionEvent('?/addQuestion', { ...NEW_QUESTION, label: '' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.questionErrors?.label).toBeTruthy();
		expect(createApplicationQuestion).not.toHaveBeenCalled();
	});

	it('refuses a choice question with fewer than two options', async () => {
		const event = makeActionEvent('?/addQuestion', {
			...NEW_QUESTION,
			type: 'single_choice',
			options: 'Only one'
		});

		const result = (await actions.addQuestion(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.questionErrors?.options).toBeTruthy();
		expect(createApplicationQuestion).not.toHaveBeenCalled();
	});

	it('refuses the twenty-first question', async () => {
		/* A full list, built from the constant rather than typed out, so the list
		   is exactly as long as the rule allows. */
		const full = Array.from({ length: MAX_QUESTIONS }, (unused, index) => ({
			...DIETARY,
			id: `question-${index}`,
			position: index + 1
		}));

		vi.mocked(listApplicationQuestions).mockResolvedValue(full);

		const result = (await actions.addQuestion(
			makeActionEvent('?/addQuestion', NEW_QUESTION)
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('You can add up to 20 questions.');
		expect(createApplicationQuestion).not.toHaveBeenCalled();
	});
});

describe('the updateQuestion action', () => {
	/** The fields the form sends while it is editing the T-shirt question. */
	const EDITED_QUESTION = {
		questionId: TSHIRT.id,
		label: 'T-shirt size',
		helpText: '',
		type: 'single_choice',
		options: 'S\nM\nL\nXL',
		isRequired: 'on'
	};

	it('saves the question, says so, and comes back to the page', async () => {
		const redirect = await catchRedirect(() =>
			actions.updateQuestion(makeActionEvent('?/updateQuestion', EDITED_QUESTION))
		);

		expect(updateApplicationQuestion).toHaveBeenCalledWith(
			SUPABASE,
			TSHIRT.id,
			expect.objectContaining({ options: ['S', 'M', 'L', 'XL'] })
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Question saved.'
		});
		expect(redirect.location).toBe(FORM_PATH);
	});

	it('refuses a request that names no question, without asking the database', async () => {
		const result = (await actions.updateQuestion(
			makeActionEvent('?/updateQuestion', { ...EDITED_QUESTION, questionId: '' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('That request did not say which question to save.');
		expect(getApplicationQuestion).not.toHaveBeenCalled();
	});

	it('refuses a question id that belongs to another conference', async () => {
		vi.mocked(getApplicationQuestion).mockResolvedValue(null);

		const result = (await actions.updateQuestion(
			makeActionEvent('?/updateQuestion', EDITED_QUESTION)
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('That question is not part of this conference.');
		expect(updateApplicationQuestion).not.toHaveBeenCalled();
	});

	it('changes the kind of answer freely while nobody has applied', async () => {
		const event = makeActionEvent('?/updateQuestion', {
			...EDITED_QUESTION,
			type: 'short_text'
		});

		await catchRedirect(() => actions.updateQuestion(event));

		expect(updateApplicationQuestion).toHaveBeenCalledWith(
			SUPABASE,
			TSHIRT.id,
			expect.objectContaining({ type: 'short_text' })
		);
	});

	it('refuses that same change once there are answers to it', async () => {
		vi.mocked(countSubmittedApplications).mockResolvedValue(4);

		const event = makeActionEvent('?/updateQuestion', {
			...EDITED_QUESTION,
			type: 'short_text'
		});

		const result = (await actions.updateQuestion(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe(
			'This question already has answers. Add a new question instead.'
		);
		expect(updateApplicationQuestion).not.toHaveBeenCalled();
	});

	it('still lets the wording be improved once there are answers', async () => {
		vi.mocked(countSubmittedApplications).mockResolvedValue(4);

		const event = makeActionEvent('?/updateQuestion', {
			...EDITED_QUESTION,
			label: 'Which T-shirt size do you wear?',
			options: 'S\nM\nL'
		});

		await catchRedirect(() => actions.updateQuestion(event));

		expect(updateApplicationQuestion).toHaveBeenCalledWith(
			SUPABASE,
			TSHIRT.id,
			expect.objectContaining({ label: 'Which T-shirt size do you wear?' })
		);
	});

	it('refuses a question whose text was emptied, and saves nothing', async () => {
		const result = (await actions.updateQuestion(
			makeActionEvent('?/updateQuestion', { ...EDITED_QUESTION, label: '' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.questionErrors?.label).toBeTruthy();
		expect(updateApplicationQuestion).not.toHaveBeenCalled();
	});
});

describe('the moveQuestion action', () => {
	it('moves the question that was posted up, and comes back to the list', async () => {
		const event = makeActionEvent('?/moveQuestion&direction=up', { questionId: TSHIRT.id });

		const redirect = await catchRedirect(() => actions.moveQuestion(event));

		expect(moveApplicationQuestion).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, TSHIRT.id, 'up');
		// No flash: the question has visibly changed places.
		expect(setFlash).not.toHaveBeenCalled();
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(FORM_PATH);
	});

	it('moves it down as well', async () => {
		const event = makeActionEvent('?/moveQuestion&direction=down', { questionId: DIETARY.id });

		await catchRedirect(() => actions.moveQuestion(event));

		expect(moveApplicationQuestion).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			DIETARY.id,
			'down'
		);
	});

	it('refuses a direction a question cannot move, and moves nothing', async () => {
		const event = makeActionEvent('?/moveQuestion&direction=sideways', {
			questionId: TSHIRT.id
		});

		const result = (await actions.moveQuestion(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('A question can only move up or down.');
		expect(moveApplicationQuestion).not.toHaveBeenCalled();
	});

	it('refuses a request that names no direction at all', async () => {
		const event = makeActionEvent('?/moveQuestion', { questionId: TSHIRT.id });

		const result = (await actions.moveQuestion(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(moveApplicationQuestion).not.toHaveBeenCalled();
	});

	it('refuses a request that names no question', async () => {
		const result = (await actions.moveQuestion(
			makeActionEvent('?/moveQuestion&direction=up')
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('That request did not say which question to move.');
		expect(moveApplicationQuestion).not.toHaveBeenCalled();
	});
});

describe('the deleteQuestion action', () => {
	it('deletes the question, says so, and comes back to the list', async () => {
		const event = makeActionEvent('?/deleteQuestion', { questionId: TSHIRT.id });

		const redirect = await catchRedirect(() => actions.deleteQuestion(event));

		expect(deleteApplicationQuestion).toHaveBeenCalledWith(SUPABASE, TSHIRT.id);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Question deleted.'
		});
		expect(redirect.location).toBe(FORM_PATH);
	});

	it('refuses a question id that belongs to another conference', async () => {
		vi.mocked(getApplicationQuestion).mockResolvedValue(null);

		const event = makeActionEvent('?/deleteQuestion', { questionId: TSHIRT.id });
		const result = (await actions.deleteQuestion(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('That question is not part of this conference.');
		expect(deleteApplicationQuestion).not.toHaveBeenCalled();
	});

	it('refuses a request that names no question, without asking the database', async () => {
		// An empty id is not something the database can look a question up by, so
		// it is refused before `getApplicationQuestion` is ever called.
		const result = (await actions.deleteQuestion(
			makeActionEvent('?/deleteQuestion', {})
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('That request did not say which question to delete.');
		expect(getApplicationQuestion).not.toHaveBeenCalled();
	});

	it('asks the organiser gate again', async () => {
		const event = makeActionEvent('?/deleteQuestion', { questionId: TSHIRT.id });

		await catchRedirect(() => actions.deleteQuestion(event));

		expect(requirePermission).toHaveBeenCalled();
	});
});

describe('the moveQuestionTo action', () => {
	it('puts the dropped question at its place, counting from 0, and comes back to the form', async () => {
		const event = makeActionEvent('?/moveQuestionTo', { questionId: TSHIRT.id, place: '1' });

		const redirect = await catchRedirect(() => actions.moveQuestionTo(event));

		expect(placeOrderedRow).toHaveBeenCalledWith(
			SUPABASE,
			{ table: 'application_questions', ownerColumn: 'conference_id', ownerId: CONFERENCE.id },
			TSHIRT.id,
			0
		);
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(FORM_PATH);
		expect(requirePermission).toHaveBeenCalled();
	});

	it('refuses a drop that names no question or no place, and moves nothing', async () => {
		const withoutPlace = makeActionEvent('?/moveQuestionTo', { questionId: TSHIRT.id, place: 'x' });
		const withoutQuestion = makeActionEvent('?/moveQuestionTo', { place: '2' });

		const first = (await actions.moveQuestionTo(withoutPlace)) as ActionResult;
		const second = (await actions.moveQuestionTo(withoutQuestion)) as ActionResult;

		expect(first.status).toBe(400);
		expect(first.data?.message).toBe('That request did not say which question to move, or where.');
		expect(second.status).toBe(400);
		expect(placeOrderedRow).not.toHaveBeenCalled();
	});

	it('says so when the question is no longer on the form', async () => {
		vi.mocked(placeOrderedRow).mockResolvedValue(false);
		const event = makeActionEvent('?/moveQuestionTo', { questionId: 'gone', place: '1' });

		const result = (await actions.moveQuestionTo(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('That question is no longer on the form.');
	});
});
