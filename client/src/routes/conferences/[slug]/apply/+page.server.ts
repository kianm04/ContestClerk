import { error, fail, redirect } from '@sveltejs/kit';
import {
	ageWarning,
	canApply,
	cleanApplicationForm,
	hasApplicationErrors,
	readApplicationForm,
	toApplicationFormValues,
	validateApplication,
	type ApplicationFormErrors,
	type ApplicationFormValues,
	type ApplyRefusal,
	type CommitteeChoice,
	type MyApplication
} from '$lib/applications';
import type { ApplicationQuestion } from '$lib/application-questions';
import { formatConferenceDay, type Conference } from '$lib/conferences';
import { dayInTimezone, formatEventTime } from '$lib/dates';
import { applicableFee } from '$lib/fees';
import { profileCompleteness, type ProfileRequiredField } from '$lib/profiles';
import { applicationUrl } from '$lib/urls';
import { requireOnboarded } from '$lib/server/access';
import { readApplicationFormSettings } from '$lib/server/application-form-settings';
import { listApplicationQuestions } from '$lib/server/application-questions';
import {
	getMyApplicationFor,
	upsertApplication,
	type ApplicationInput
} from '$lib/server/applications';
import { listCommitteesWithSeatCounts, type CommitteeWithSeats } from '$lib/server/committees';
import { getConferenceBySlug } from '$lib/server/conferences';
import { getMyDelegationFor } from '$lib/server/delegations';
import { listPublicFees, readPaymentSettings } from '$lib/server/fees';
import { setFlash } from '$lib/server/flash';
import { getMyProfile } from '$lib/server/profiles';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * What both of this page's actions answer with when they refuse.
 *
 * One shape for the two of them, so `+page.svelte` has a single thing to read
 * rather than a different answer per button. `values` is everything that was
 * typed, so a refused form is drawn again exactly as it was sent.
 */
type ApplyPageResult = {
	values: ApplicationFormValues;
	errors: ApplicationFormErrors;
};

/** What `/applications/[id]` says at the top once the form has been kept for later. */
const DRAFT_SAVED_FLASH = 'Draft saved.';

/** What it says once the application has gone to the organisers. */
const APPLICATION_SUBMITTED_FLASH = 'Application submitted.';

/** What the page says when the conference in the address does not exist. */
const NO_SUCH_CONFERENCE = 'This conference does not exist.';

/** An empty box is not an answer, and both of those columns are nullable. */
function emptyToNull(text: string): string | null {
	return text === '' ? null : text;
}

/**
 * The form somebody who has never applied here sees: one empty select per
 * committee preference, and nothing else filled in.
 *
 * The selects are counted out rather than left as an empty list, because the
 * page draws one box per entry and `readApplicationForm` sends one entry per
 * box back.
 */
function emptyApplicationForm(preferenceCount: number): ApplicationFormValues {
	const committeePreferences: string[] = [];

	for (let choice = 1; choice <= preferenceCount; choice += 1) {
		committeePreferences.push('');
	}

	return {
		committeePreferences,
		seatPreferences: '',
		motivation: '',
		answers: {},
		hasConsented: false
	};
}

/**
 * The committees as the form's selects offer them.
 *
 * `listCommitteesWithSeatCounts` brings every committee along with how many of
 * its seats are taken, which no select needs, so only the three fields a
 * dropdown shows are passed on. The organiser's own `position` order comes
 * along with the list.
 */
function toCommitteeChoices(rows: CommitteeWithSeats[]): CommitteeChoice[] {
	return rows.map((row) => ({
		id: row.committee.id,
		name: row.committee.name,
		abbreviation: row.committee.abbreviation
	}));
}

/**
 * The form as it should open: the application already saved when there is one,
 * and an empty form otherwise.
 *
 * Only a `draft` or a `submitted` row prefills it. An application that has been
 * decided is not one to write over, and `canApply` turns it into a refusal, so
 * the form is not drawn at all in that case.
 */
function savedFormValues(
	application: MyApplication | null,
	preferenceCount: number
): ApplicationFormValues {
	if (application === null) {
		return emptyApplicationForm(preferenceCount);
	}

	if (application.status !== 'draft' && application.status !== 'submitted') {
		return emptyApplicationForm(preferenceCount);
	}

	return toApplicationFormValues(application, preferenceCount);
}

/**
 * When applications close, read in the conference's own timezone: "15 Dec 2026
 * · 23:59", or `null` when the organisers set no closing time.
 *
 * The line under the title and the summary card beside the form both show it,
 * so it is worked out once here rather than by each of them, and here rather
 * than in a component because `CLAUDE.md` keeps formatting out of a component's
 * script block. `formatConferenceDay` is what `canApply` words its own window
 * refusals with, so the two always name the same day.
 */
function closingLine(conference: Conference): string | null {
	if (conference.applicationsCloseAt === null) {
		return null;
	}

	const day = formatConferenceDay(conference.applicationsCloseAt, conference.timezone);
	const time = formatEventTime(conference.applicationsCloseAt, null, conference.timezone);

	return `${day} · ${time}`;
}

/**
 * Runs on the server before the page is drawn, and again after every action on
 * it. Whatever it returns arrives in `+page.svelte` as `data`.
 *
 * `requireOnboarded` rather than `requireUser`: it sends a visitor to
 * `/login?next=/conferences/<slug>/apply` and an account that has not answered
 * the welcome questions to `/welcome`, which is what
 * `05-pages/delegate/apply.md` asks of this page. Files under `$lib/server`
 * only ever run on the server, so the queries below cannot reach the browser.
 */
export const load: PageServerLoad = async ({ params, url, locals }) => {
	const user = await requireOnboarded(locals, url);

	// The folder is named `[slug]`, so SvelteKit hands us that part of the
	// address as `params.slug`.
	const conference = await getConferenceBySlug(locals.supabase, params.slug);

	if (!conference) {
		// `error` stops here and shows SvelteKit's error page with a 404 status.
		error(404, NO_SUCH_CONFERENCE);
	}

	// None of these eight needs another's answer, so they all run side by side.
	const [
		committeeRows,
		questions,
		settings,
		profileAndDetails,
		existingApplication,
		delegation,
		fees,
		paymentSettings
	] = await Promise.all([
		listCommitteesWithSeatCounts(locals.supabase, conference.id),
		listApplicationQuestions(locals.supabase, conference.id),
		readApplicationFormSettings(locals.supabase, conference.id),
		getMyProfile(locals.supabase, user.id),
		getMyApplicationFor(locals.supabase, conference.id, user.id),
		getMyDelegationFor(locals.supabase, conference.id, user.id),
		listPublicFees(locals.supabase, conference.id),
		readPaymentSettings(locals.supabase, conference.id)
	]);

	/*
		One moment for the whole page. The three things below that depend on it —
		the refusal, the age warning and the fee — are all worked out here rather
		than by the components that show them, so that no component ever calls
		`new Date()`: one that did would write one thing while the page is
		rendered on the server and another a moment later in the browser, and
		Svelte reports that as a hydration mismatch. The application form page's
		`load` reads the clock once for the same reason.
	*/
	const now = new Date();

	// Whether somebody is old enough is asked about the conference's own day: a
	// birthday falls on the same day wherever it is read.
	const today = dayInTimezone(now, conference.timezone);

	const { profile, details } = profileAndDetails;
	const preferenceCount = settings.committeePreferenceCount;
	const currentFee = applicableFee(fees, 'individual', now);

	return {
		conference,
		/** The committees the selects offer, in the organiser's own order. */
		committees: toCommitteeChoices(committeeRows),
		/** The conference's own questions, in the order it asks them. */
		questions,
		/** How many committee selects the form draws. 0 when this conference asks for none. */
		preferenceCount,
		asksMotivation: settings.askMotivation,
		/** The public half of the applicant's profile, which the "About you" card shows. */
		profile,
		/** The required profile fields still empty. They block submitting. */
		missingProfileFields: profileCompleteness(profile).missingFields,
		/** The line shown to somebody outside the ages the organisers expect. Never a block. */
		ageNotice: ageWarning(conference, details.dateOfBirth, today),
		/** Why this person may not apply, or `null` when they may. */
		refusal: canApply(conference, existingApplication, delegation, now),
		/**
		 * Whether this is an organiser looking at their own unpublished form.
		 *
		 * `05-pages/organiser/application-form.md` puts a "Preview apply page"
		 * button on the form builder, and says that while the conference is a
		 * draft this page shows its organiser a banner "instead of refusing" —
		 * a button that led to "This conference is not taking applications." would
		 * show them nothing of the form they are building. `05-pages/delegate/apply.md`
		 * says the reason replaces the form, and this is the one exception to it.
		 *
		 * Reading the status is the whole check, and no staff lookup is needed to
		 * go with it. The `conferences` select policy is "anon, auth: `published`
		 * or `archived`; staff of it: any status", so a `draft` row that has
		 * reached this line at all belongs to somebody on this conference's team;
		 * for anybody else `getConferenceBySlug` answered `null` and the 404 above
		 * has already happened. `archived`, which `canApply` also turns into
		 * `not_published`, is readable by everybody and so is never a preview.
		 */
		isPreview: conference.status === 'draft',
		/** The application already saved, so the "You already applied" notice can link to it. */
		existingApplicationId: existingApplication?.id ?? null,
		/** The delegation the reader is already in, so the "You are part of" notice can link to it. */
		existingDelegationId: delegation?.id ?? null,
		/** What every box on the form starts with: the saved application, or nothing. */
		values: savedFormValues(existingApplication, preferenceCount),
		/** What an individual pays if they are accepted, or `null` when no fee's window is open. */
		fee:
			currentFee === null
				? null
				: { amountCents: currentFee.amountCents, currency: paymentSettings.currency },
		/** How many fees the conference lists, so the summary can tell "none yet" from "none open now". */
		feeCount: fees.length,
		/** When applications close, or `null` when the organisers set no closing time. */
		closesOn: closingLine(conference)
	};
};

/**
 * Everything both actions need before they can decide anything.
 *
 * A form action is its own request and nothing `load` worked out reaches it, so
 * all of this is read again rather than trusted from whenever the page was last
 * drawn. `specs/02-architecture/permissions.md` asks every action for that.
 */
type ApplyContext = {
	conference: Conference;
	/** The signed-in applicant, whose row this writes. */
	userId: string;
	committees: CommitteeChoice[];
	questions: ApplicationQuestion[];
	preferenceCount: number;
	asksMotivation: boolean;
	/** Only `submit` looks at these; a draft is allowed to be half filled in. */
	missingProfileFields: ProfileRequiredField[];
	/** Why this person may not apply after all, or `null` when they may. */
	refusal: ApplyRefusal | null;
};

/** Read that context, asking the gate, the conference and the rules all over again. */
async function readApplyContext(event: RequestEvent): Promise<ApplyContext> {
	const user = await requireOnboarded(event.locals, event.url);
	const conference = await getConferenceBySlug(event.locals.supabase, event.params.slug);

	if (!conference) {
		error(404, NO_SUCH_CONFERENCE);
	}

	// None of these six needs another's answer, so they run side by side.
	const [committeeRows, questions, settings, profileAndDetails, existingApplication, delegation] =
		await Promise.all([
			listCommitteesWithSeatCounts(event.locals.supabase, conference.id),
			listApplicationQuestions(event.locals.supabase, conference.id),
			readApplicationFormSettings(event.locals.supabase, conference.id),
			getMyProfile(event.locals.supabase, user.id),
			getMyApplicationFor(event.locals.supabase, conference.id, user.id),
			getMyDelegationFor(event.locals.supabase, conference.id, user.id)
		]);

	return {
		conference,
		userId: user.id,
		committees: toCommitteeChoices(committeeRows),
		questions,
		preferenceCount: settings.committeePreferenceCount,
		asksMotivation: settings.askMotivation,
		missingProfileFields: profileCompleteness(profileAndDetails.profile).missingFields,
		refusal: canApply(conference, existingApplication, delegation, new Date())
	};
}

/**
 * Refuse, handing back everything that was typed so that nothing is lost.
 *
 * 400, because what arrived is wrong and only the person who sent it can put it
 * right. `fail` sends the page back with that status and this result as `form`,
 * so every box keeps what was typed and shows its own message at once.
 */
function refuse(values: ApplicationFormValues, errors: ApplicationFormErrors) {
	return fail(400, { values, errors } satisfies ApplyPageResult);
}

/** The answers as the database takes them: an empty box is stored as nothing at all. */
function toApplicationInput(values: ApplicationFormValues): ApplicationInput {
	return {
		committeePreferences: values.committeePreferences,
		seatPreferences: emptyToNull(values.seatPreferences),
		motivation: emptyToNull(values.motivation),
		answers: values.answers
	};
}

export const actions: Actions = {
	/**
	 * Keep the form for later, in whatever state it is in.
	 *
	 * Nothing is checked beyond the types: a draft is allowed to be half filled
	 * in, which is what `05-pages/delegate/apply.md` means by "no validation
	 * beyond types". `cleanApplicationForm` only takes out what the database
	 * would not hold, so saving a draft cannot fail.
	 */
	saveDraft: async (event) => {
		const context = await readApplyContext(event);

		const formData = await event.request.formData();
		const typedValues = readApplicationForm(formData, context.questions, context.preferenceCount);

		if (context.refusal !== null) {
			// The window closing between the page being drawn and the button being
			// pressed is the edge case `05-pages/delegate/apply.md` names.
			return refuse(typedValues, { form: context.refusal.message });
		}

		const savedValues = cleanApplicationForm(typedValues, context.committees, context.questions);

		const applicationId = await upsertApplication(
			event.locals.supabase,
			context.conference.id,
			context.userId,
			'draft',
			toApplicationInput(savedValues)
		);

		// A redirecting action cannot return anything, so the message travels in a
		// one-shot cookie that the root layout reads and throws away.
		setFlash(event.cookies, { tone: 'success', message: DRAFT_SAVED_FLASH });
		redirect(303, applicationUrl(applicationId));
	},

	/** Send the application to the organisers, once everything the form asks for is there. */
	submit: async (event) => {
		const context = await readApplyContext(event);

		const formData = await event.request.formData();
		const typedValues = readApplicationForm(formData, context.questions, context.preferenceCount);

		if (context.refusal !== null) {
			return refuse(typedValues, { form: context.refusal.message });
		}

		/*
			Checked against what was typed rather than against the cleaned values.
			`readApplicationForm` gives every select an entry, so the first entry is
			the first choice, while `cleanApplicationForm` takes the empty and the
			repeated ones out. Checking the cleaned list would let a second choice
			slide up into the first one's place, and a committee picked twice would
			disappear without anybody being told.
		*/
		const errors = validateApplication(typedValues, {
			preferenceCount: context.preferenceCount,
			asksMotivation: context.asksMotivation,
			questions: context.questions,
			missingProfileFields: context.missingProfileFields
		});

		if (hasApplicationErrors(errors)) {
			return refuse(typedValues, errors);
		}

		const savedValues = cleanApplicationForm(typedValues, context.committees, context.questions);

		const applicationId = await upsertApplication(
			event.locals.supabase,
			context.conference.id,
			context.userId,
			'submitted',
			toApplicationInput(savedValues)
		);

		setFlash(event.cookies, { tone: 'success', message: APPLICATION_SUBMITTED_FLASH });
		redirect(303, applicationUrl(applicationId));
	}
};
