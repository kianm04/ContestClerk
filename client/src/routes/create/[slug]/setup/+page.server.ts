import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import {
	hasQuestionErrors,
	isChoiceType,
	isQuestionType,
	MAX_QUESTIONS,
	parseOptions,
	validateQuestionForm,
	type QuestionFormErrors,
	type QuestionFormValues
} from '$lib/application-questions';
import {
	cleanTopics,
	hasCommitteeErrors,
	validateCommitteeForm,
	type CommitteeFormErrors
} from '$lib/committee-details';
import { creationPreview, type CreationDraft } from '$lib/creation-draft';
import {
	readCommitteeDialogForm,
	readFeeDialogForm,
	readQuestionDialogForm,
	readSetupDialog,
	type CommitteeDialogValues,
	type FeeDialogValues
} from '$lib/creation-setup-dialog';
import {
	FEE_DESCRIPTION_MAX_LENGTH,
	plannedSeatsError,
	readApplicationsForm,
	toApplicationSettings,
	toPlannedSeatCount,
	uniqueSlug,
	validateApplicationsForm,
	type ApplicationsFormErrors,
	type ApplicationsFormValues
} from '$lib/creation-setup-forms';
import { publicPageStatus } from '$lib/creation-readiness';
import {
	applicationsStatus,
	applicationsSummary,
	bannerFact,
	committeesStatus,
	descriptionFact,
	feePhrase,
	feesStatus,
	pastDeadlineNote
} from '$lib/creation-setup-status';
import { furthestStep } from '$lib/creation-steps';
import { instantFromLocalDateTime } from '$lib/dates';
import { hasFeeErrors, isFeeAppliesTo, validateFeeForm, type FeeFormErrors } from '$lib/fees';
import { toCents } from '$lib/money';
import { slugify } from '$lib/slugs';
import { createSetupDialogUrl, createStepUrl, organizationSettingsUrl } from '$lib/urls';
import { mayOpenManagePage } from '$lib/manage-pages';
import { hasPermission } from '$lib/permissions';
import { askHasPermissionOrThrow, requirePermission, requireUser } from '$lib/server/access';
import { setFlash } from '$lib/server/flash';
import {
	createApplicationQuestion,
	deleteApplicationQuestion,
	moveApplicationQuestion,
	updateApplicationQuestion,
	type ApplicationQuestionInput
} from '$lib/server/application-questions';
import { findPreviousConference, getCreationDraft, setCreationStep } from '$lib/server/creation';
import {
	importApplicationForm,
	importCommittees,
	importFees,
	loadSetupFacts,
	saveFeeCollection,
	setApplicationSettings,
	setFeeStatus
} from '$lib/server/creation-setup';
import { createFee, deleteFee, updateFee } from '$lib/server/fees';
import {
	createCommittee,
	deleteCommittee,
	listCommitteeSlugs,
	updateCommittee
} from '$lib/server/manage-committees';
import { readMyPermissions } from '$lib/server/my-permissions';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * What a refused dialog sends back as `form`: which dialog, what was typed
 * and a message per field, so the dialog opens again exactly as it was left.
 */
export type SetupFailure =
	| {
			kind: 'committee';
			values: CommitteeDialogValues;
			errors: CommitteeFormErrors & { plannedSeatCount?: string };
	  }
	| { kind: 'question'; values: QuestionFormValues; errors: QuestionFormErrors & { form?: string } }
	| { kind: 'fee'; values: FeeDialogValues; errors: FeeFormErrors & { description?: string } }
	| { kind: 'applications'; values: ApplicationsFormValues; errors: ApplicationsFormErrors };

/** Why a committee was not added, changed or deleted, for a reader whose role edits the conference but does not manage every committee. */
const NO_COMMITTEE_PERMISSION_MESSAGE =
	'Your role does not let you add, change or delete committees here. If you manage some of them, change those on the committees page; otherwise ask somebody who manages committees.';

/*
	Step 4 of creating a conference: Setup. Four cards (public page,
	committees, applications, fees) and the dialogs that edit them.

	`parent()` hands over what `../+layout.server.ts` returned: the draft, its
	organisation and previous edition, already checked to be the organiser's.
	Which dialog is open is read from the address (`?dialog=` and `?id=`), so
	every Add, Edit and Delete control is a plain link.
*/
export const load: PageServerLoad = async ({ parent, locals, url, params }) => {
	const { draft, organization, previous, now } = await parent();
	const user = await requireUser(locals, url);
	const facts = await loadSetupFacts(locals.supabase, draft, previous);
	// Everything the reader holds on the draft. The step opens with
	// `edit_conference`, and a role can give that without `manage_committees`.
	const permissions = await readMyPermissions(locals.supabase, draft.id, user.id);
	const firstFee = facts.fees[0] ?? null;
	const nowDate = new Date(now);

	return {
		...facts,
		dialog: readSetupDialog(url.searchParams, { ...facts, draft }),
		// Adding, importing and deleting ask for `manage_committees` on the whole
		// conference. A reader without it sees the committees but not the
		// controls, Edit included: somebody who manages only their own committees
		// edits them on the committees page, where each committee's own page
		// offers just the fields they may change.
		canManageCommittees: hasPermission(permissions, 'manage_committees'),
		// That page opens for them as well as for somebody who manages them all.
		canOpenCommitteesPage: mayOpenManagePage(permissions, 'committees'),
		showAllCommittees: url.searchParams.get('committees') === 'all',
		// `resolve` builds a link from a route and its parameters, query and all.
		allCommitteesUrl: resolve('/create/[slug]/setup?committees=all', { slug: params.slug }),
		statuses: {
			publicPage: publicPageStatus(draft),
			committees: committeesStatus(facts.committees.length, previous),
			applications: applicationsStatus(draft, nowDate),
			fees: feesStatus(draft, facts.fees.length)
		},
		publicPageFacts: [
			{ label: 'Description', value: descriptionFact(draft.description) },
			{ label: 'Banner', value: bannerFact(draft) },
			{ label: 'Contact email', value: draft.contactEmail ?? 'Not added' }
		],
		applications: applicationsSummary(draft, facts.questions.length, facts.committees.length),
		deadlineNote: pastDeadlineNote(draft, nowDate),
		isStripeConnected: organization.isStripeConnected,
		stripeSettingsUrl: organizationSettingsUrl(organization.slug),
		preview: creationPreview(
			draft,
			organization.name,
			firstFee === null ? null : feePhrase(firstFee, draft.currency)
		)
	};
};

/**
 * The organiser check, then the draft as it is now. A form action is its own
 * request, and nothing `load` worked out reaches it, so both are read again.
 */
async function requireDraft(event: RequestEvent): Promise<CreationDraft> {
	await requirePermission(event.locals, event.url, event.params.slug, 'edit_conference');
	const draft = await getCreationDraft(event.locals.supabase, event.params.slug);

	if (!draft || draft.status !== 'draft') {
		error(404, 'This conference could not be found.');
	}

	return draft;
}

/** The draft with its committees, questions and fees: what a row's id is checked against. */
async function requireDraftAndFacts(event: RequestEvent) {
	const draft = await requireDraft(event);
	const facts = await loadSetupFacts(event.locals.supabase, draft, null);

	return { draft, facts };
}

/**
 * Turn the reader back, with the reason as a flash message, unless they may
 * manage every committee of this draft. The step itself opens with
 * `edit_conference`, but the committees policies ask for `manage_committees`,
 * and a role can give one without the other. Asked first, the refusal says
 * what is missing, rather than an add or a change failing with an error page,
 * or a refused delete being put down to a seat. A check that fails is an error
 * page, not a "no", so nobody is told their role lacks something it gives them.
 */
async function requireCommitteeManager(event: RequestEvent, draft: CreationDraft): Promise<void> {
	const mayManageCommittees = await askHasPermissionOrThrow(
		event.locals.supabase,
		draft.id,
		'manage_committees'
	);

	if (!mayManageCommittees) {
		setFlash(event.cookies, { tone: 'error', message: NO_COMMITTEE_PERMISSION_MESSAGE });
		backToSetup(event);
	}
}

/** The previous edition the imports copy from. */
async function previousEdition(event: RequestEvent, draft: CreationDraft) {
	return findPreviousConference(event.locals.supabase, draft.organizationId, draft.id);
}

/** Back to the plain Setup address, which closes the dialog. 303 turns the POST into a GET. */
function backToSetup(event: RequestEvent): never {
	redirect(303, createStepUrl(event.params.slug, 'setup'));
}

/** An id a form sent, which has to be one of `rows`, or this answers 404. */
function requireOwnedId(id: string, rows: { id: string }[]): string {
	if (!rows.some((row) => row.id === id)) {
		error(404, 'That is not part of this conference.');
	}

	return id;
}

/** Read the `id` a row's form sent, and check it is one of `rows`. */
async function readOwnedId(event: RequestEvent, rows: { id: string }[]): Promise<string> {
	const formData = await event.request.formData();

	return requireOwnedId(String(formData.get('id') ?? ''), rows);
}

/** The committee dialog's Save: add one when it has no id, otherwise save that one. */
async function saveCommittee(event: RequestEvent) {
	const { draft, facts } = await requireDraftAndFacts(event);
	const values = readCommitteeDialogForm(await event.request.formData());
	const isNew = values.committeeId === '';

	// Adding and changing both ask about the whole conference. The insert
	// policy asks the same. The update policy also lets in somebody who manages
	// just this committee, but the database then refuses their save as soon as
	// anything but its description, agenda and resolution settings differs from
	// what is saved. This dialog writes every field and works the link out again
	// from the name, so a rename, a new room or seat count, or a committee
	// imported with last year's link would end on an error page, and only some
	// of their saves would go through. They edit their committee on the
	// committees page instead, which the message points them to.
	if (!isNew) {
		requireOwnedId(values.committeeId, facts.committees);
	}
	await requireCommitteeManager(event, draft);

	const errors: CommitteeFormErrors & { plannedSeatCount?: string } = validateCommitteeForm(
		values,
		{ isConferencePublished: false, takenSlugs: [] }
	);
	const seatsMessage = plannedSeatsError(values.plannedSeatCount);

	if (seatsMessage !== null) {
		errors.plannedSeatCount = seatsMessage;
	}

	if (hasCommitteeErrors(errors) || seatsMessage !== null) {
		const failure: SetupFailure = { kind: 'committee', values, errors };
		// `fail` answers 400 and hands this to the page as `form`, which reopens the dialog.
		return fail(400, failure);
	}

	// The dialog asks for no link: a draft's committee is named after itself,
	// and gets "-2" when another committee of the conference has the name.
	const takenSlugs = await listCommitteeSlugs(
		event.locals.supabase,
		draft.id,
		isNew ? undefined : values.committeeId
	);
	const saved = {
		...values,
		slug: uniqueSlug(slugify(values.name), takenSlugs),
		topics: cleanTopics(values.topics)
	};
	const seats = toPlannedSeatCount(values.plannedSeatCount);

	if (isNew) {
		await createCommittee(event.locals.supabase, draft.id, saved, facts.committees.length, seats);
	} else {
		await updateCommittee(event.locals.supabase, values.committeeId, saved, seats);
	}

	backToSetup(event);
}

/** Only the two choice types keep their options, as on the Manage page. */
function toQuestionInput(values: QuestionFormValues): ApplicationQuestionInput {
	const type = isQuestionType(values.type) ? values.type : 'short_text';

	return {
		label: values.label,
		helpText: values.helpText === '' ? null : values.helpText,
		type,
		options: isChoiceType(type) ? parseOptions(values.options) : [],
		isRequired: values.isRequired
	};
}

/** The question dialog's Save. */
async function saveQuestion(event: RequestEvent) {
	const { draft, facts } = await requireDraftAndFacts(event);
	const values = readQuestionDialogForm(await event.request.formData());
	const isNew = values.questionId === '';

	if (!isNew) {
		requireOwnedId(values.questionId, facts.questions);
	}

	const errors: QuestionFormErrors & { form?: string } = validateQuestionForm(values);

	// The Manage page caps the list at the same number, so an apply form stays short.
	if (isNew && facts.questions.length >= MAX_QUESTIONS) {
		errors.form = `You can add up to ${MAX_QUESTIONS} questions.`;
	}

	if (hasQuestionErrors(errors) || errors.form !== undefined) {
		const failure: SetupFailure = { kind: 'question', values, errors };
		return fail(400, failure);
	}

	if (isNew) {
		await createApplicationQuestion(event.locals.supabase, draft.id, toQuestionInput(values));
	} else {
		await updateApplicationQuestion(
			event.locals.supabase,
			values.questionId,
			toQuestionInput(values)
		);
	}

	backToSetup(event);
}

/** The fee dialog's Save, which also records that the conference charges, and how. */
async function saveFee(event: RequestEvent) {
	const { draft, facts } = await requireDraftAndFacts(event);
	const values = readFeeDialogForm(await event.request.formData());
	const isNew = values.feeId === '';

	if (!isNew) {
		requireOwnedId(values.feeId, facts.fees);
	}

	const errors: FeeFormErrors & { description?: string } = validateFeeForm(values);

	if (values.description.length > FEE_DESCRIPTION_MAX_LENGTH) {
		errors.description = `Please keep the description under ${FEE_DESCRIPTION_MAX_LENGTH} characters.`;
	}

	if (hasFeeErrors(errors) || errors.description !== undefined) {
		const failure: SetupFailure = { kind: 'fee', values, errors };
		return fail(400, failure);
	}

	const fee = {
		name: values.name,
		// `validateFeeForm` has already refused an amount or an "applies to" these could not read.
		amountCents: toCents(values.amount) ?? 0,
		appliesTo: isFeeAppliesTo(values.appliesTo) ? values.appliesTo : 'individual',
		validFrom: instantFromLocalDateTime(values.validFrom, draft.timezone),
		validUntil: instantFromLocalDateTime(values.validUntil, draft.timezone),
		description: values.description === '' ? null : values.description
	};

	if (isNew) {
		await createFee(event.locals.supabase, draft.id, fee);
	} else {
		await updateFee(event.locals.supabase, values.feeId, fee);
	}

	await saveFeeCollection(event.locals.supabase, draft.id, values.collection === 'manual');
	backToSetup(event);
}

/*
	Every action ends in `backToSetup`, a redirect to the plain Setup address,
	so a successful save closes its dialog with or without JavaScript. Add and
	Update share one handler each: the form's hidden id says which it is, and
	the two names keep the address readable.
*/
export const actions: Actions = {
	addCommittee: saveCommittee,
	updateCommittee: saveCommittee,

	deleteCommittee: async (event) => {
		const { draft, facts } = await requireDraftAndFacts(event);
		const id = await readOwnedId(event, facts.committees);
		await requireCommitteeManager(event, draft);

		const wasDeleted = await deleteCommittee(event.locals.supabase, id);

		// The reader may delete committees, so a refusal here is the seats: a
		// draft can hold one reserved for a delegation when the conference was
		// published and taken back, and the database keeps such a committee
		// (migration 20261023120000). The redirect closes the dialog either way,
		// so the reason goes with it as a flash message.
		if (!wasDeleted) {
			setFlash(event.cookies, {
				tone: 'error',
				message:
					'You cannot delete a committee while a seat in it is filled or reserved. Free its seats on the allocation page first.'
			});
		}

		backToSetup(event);
	},

	importCommittees: async (event) => {
		const draft = await requireDraft(event);
		await requireCommitteeManager(event, draft);
		const previous = await previousEdition(event, draft);

		if (previous !== null) {
			await importCommittees(event.locals.supabase, previous, draft.id);
		}

		backToSetup(event);
	},

	saveApplications: async (event) => {
		const draft = await requireDraft(event);
		const values = readApplicationsForm(await event.request.formData());
		const errors = validateApplicationsForm(values, draft.startDate);

		if (Object.keys(errors).length > 0) {
			const failure: SetupFailure = { kind: 'applications', values, errors };
			return fail(400, failure);
		}

		await setApplicationSettings(
			event.locals.supabase,
			draft.id,
			toApplicationSettings(values, draft)
		);
		backToSetup(event);
	},

	importApplicationForm: async (event) => {
		const draft = await requireDraft(event);
		const previous = await previousEdition(event, draft);

		if (previous !== null) {
			await importApplicationForm(event.locals.supabase, previous, draft);
		}

		// Back to the Applications dialog it was pressed in, now showing last year's answers.
		redirect(303, createSetupDialogUrl(event.params.slug, 'applications'));
	},

	addQuestion: saveQuestion,
	updateQuestion: saveQuestion,

	deleteQuestion: async (event) => {
		const { facts } = await requireDraftAndFacts(event);
		const id = await readOwnedId(event, facts.questions);

		await deleteApplicationQuestion(event.locals.supabase, id);
		backToSetup(event);
	},

	moveQuestion: async (event) => {
		const { draft, facts } = await requireDraftAndFacts(event);
		const formData = await event.request.formData();
		const id = requireOwnedId(String(formData.get('id') ?? ''), facts.questions);
		const direction = formData.get('direction') === 'up' ? 'up' : 'down';

		await moveApplicationQuestion(event.locals.supabase, draft.id, id, direction);
		backToSetup(event);
	},

	setFeeStatus: async (event) => {
		const draft = await requireDraft(event);
		const status = (await event.request.formData()).get('feeStatus');

		if (status === 'free' || status === 'paid' || status === 'undecided') {
			await setFeeStatus(event.locals.supabase, draft.id, status);
		}

		backToSetup(event);
	},

	addFee: saveFee,
	updateFee: saveFee,

	deleteFee: async (event) => {
		const { facts } = await requireDraftAndFacts(event);
		const id = await readOwnedId(event, facts.fees);

		await deleteFee(event.locals.supabase, id);
		backToSetup(event);
	},

	importFees: async (event) => {
		const draft = await requireDraft(event);
		const previous = await previousEdition(event, draft);

		if (previous !== null) {
			await importFees(event.locals.supabase, previous, draft.id);
		}

		backToSetup(event);
	},

	/** "Continue to launch": remember the step was reached, then go there. */
	continue: async (event) => {
		const draft = await requireDraft(event);

		await setCreationStep(
			event.locals.supabase,
			draft.id,
			furthestStep(draft.creationStep, 'launch')
		);
		redirect(303, createStepUrl(event.params.slug, 'launch'));
	}
};
