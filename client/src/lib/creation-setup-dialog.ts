/**
 * The dialogs of the Setup step of creating a conference (Trello fe3reN7Y):
 * which one the address asks for, the values it opens with, what its form
 * sends, and the words of the three "Delete ...?" confirmations.
 *
 * A dialog's state lives in the address, `?dialog=committee&id=<uuid>`, so
 * every Add, Edit and Delete control is an ordinary link and the page works
 * without JavaScript. Each dialog's form posts to an address that repeats
 * `dialog` and `id` (see `dialogAction`), so a refused form comes back with
 * the same dialog open. Nothing here talks to Supabase or knows any Svelte.
 */

import {
	EMPTY_QUESTION_FORM,
	questionTypeLabel,
	readQuestionForm,
	toQuestionFormValues,
	type ApplicationQuestion,
	type QuestionFormValues
} from '$lib/application-questions';
import {
	EMPTY_COMMITTEE_FORM,
	readCommitteeForm,
	type CommitteeFormValues
} from '$lib/committee-details';
import type { CreationDraft } from '$lib/creation-draft';
import {
	FEE_KIND_OPTIONS,
	feeKindOf,
	toApplicationsFormValues,
	type ApplicationsFormValues,
	type FeeKind
} from '$lib/creation-setup-forms';
import { EMPTY_FEE_FORM, readFeeForm, type FeeAppliesTo, type FeeFormValues } from '$lib/fees';
import { formatMoney, fromCents } from '$lib/money';
import type { SetupDialogKind } from '$lib/urls';

/** One committee as the Setup step's table and dialog show it. */
export type SetupCommittee = {
	id: string;
	name: string;
	abbreviation: string | null;
	/** `null` is "Not decided". */
	plannedSeatCount: number | null;
	/** `null` is "Unassigned". */
	room: string | null;
	level: 'beginner' | 'intermediate' | 'advanced';
	topics: string[];
	description: string | null;
	defaultSpeakingTimeSeconds: number;
	position: number;
};

/** One fee as the Setup step shows it, with the line for delegates the Manage page leaves out. */
export type SetupFee = {
	id: string;
	name: string;
	amountCents: number;
	appliesTo: FeeAppliesTo;
	description: string | null;
	position: number;
};

/** What the committee dialog sends: the Manage form's fields, plus the planned seats. */
export type CommitteeDialogValues = CommitteeFormValues & {
	committeeId: string;
	/** A whole number as typed, or `''` for "Not decided". */
	plannedSeatCount: string;
};

/** What the fee dialog sends: the Manage form's fields, plus what Setup asks besides. */
export type FeeDialogValues = FeeFormValues & {
	kind: FeeKind;
	description: string;
	/** `manual` is "Collected externally". */
	collection: 'stripe' | 'manual';
};

/** The words of a "Delete ...?" confirmation. */
export type DeleteDialogContent = {
	id: string;
	title: string;
	sentence: string;
	consequence: string;
	facts: { label: string; value: string }[];
	action: 'deleteCommittee' | 'deleteQuestion' | 'deleteFee';
	buttonLabel: string;
};

/** The open dialog, or `null` when none is. */
export type SetupDialog =
	| { kind: 'committee'; values: CommitteeDialogValues }
	| { kind: 'question'; values: QuestionFormValues }
	| { kind: 'fee'; values: FeeDialogValues }
	| { kind: 'applications'; values: ApplicationsFormValues }
	| { kind: 'delete'; content: DeleteDialogContent }
	| null;

/** What the page has loaded that a dialog opens with. */
export type SetupDialogSources = {
	committees: SetupCommittee[];
	questions: ApplicationQuestion[];
	fees: SetupFee[];
	draft: Parameters<typeof toApplicationsFormValues>[0] &
		Pick<CreationDraft, 'currency' | 'collectsPaymentsManually'>;
};

/**
 * The address a dialog's form posts to: the action, then the dialog it came
 * from. SvelteKit reads the action from the first `?/name`, and ignores the
 * rest, which the page's `load` reads to open the same dialog again.
 */
export function dialogAction(action: string, kind: SetupDialogKind, id?: string | null): string {
	const idPart = id ? `&id=${encodeURIComponent(id)}` : '';

	return `?/${action}&dialog=${kind}${idPart}`;
}

/** A committee as the dialog's fields, or empty ones for a new committee. */
export function toCommitteeDialogValues(committee: SetupCommittee | null): CommitteeDialogValues {
	if (committee === null) {
		// Intermediate is where most committees sit; the catalogue sets its own when one is picked.
		return {
			...EMPTY_COMMITTEE_FORM,
			level: 'intermediate',
			topics: [],
			committeeId: '',
			plannedSeatCount: ''
		};
	}

	return {
		committeeId: committee.id,
		name: committee.name,
		abbreviation: committee.abbreviation ?? '',
		slug: '',
		description: committee.description ?? '',
		level: committee.level,
		room: committee.room ?? '',
		defaultSpeakingTimeSeconds: String(committee.defaultSpeakingTimeSeconds),
		topics: committee.topics,
		plannedSeatCount: committee.plannedSeatCount === null ? '' : String(committee.plannedSeatCount)
	};
}

/** Read the committee dialog. It never sends a link, so `slug` is always worked out from the name. */
export function readCommitteeDialogForm(formData: FormData): CommitteeDialogValues {
	return {
		...readCommitteeForm(formData),
		slug: '',
		committeeId: String(formData.get('committeeId') ?? ''),
		plannedSeatCount: String(formData.get('plannedSeatCount') ?? '').trim()
	};
}

/** Read the question dialog, whose Required choice is two radio buttons rather than a box. */
export function readQuestionDialogForm(formData: FormData): QuestionFormValues {
	return { ...readQuestionForm(formData), isRequired: formData.get('required') === 'required' };
}

/** A fee as the dialog's fields, or a new delegate fee. */
export function toFeeDialogValues(
	fee: SetupFee | null,
	collectsPaymentsManually: boolean
): FeeDialogValues {
	const collection = collectsPaymentsManually ? 'manual' : 'stripe';

	if (fee === null) {
		const delegate = FEE_KIND_OPTIONS[0];

		return {
			...EMPTY_FEE_FORM,
			kind: 'delegate',
			name: delegate.defaultName,
			description: '',
			collection
		};
	}

	return {
		...EMPTY_FEE_FORM,
		feeId: fee.id,
		kind: feeKindOf(fee),
		name: fee.name,
		amount: fromCents(fee.amountCents),
		appliesTo: fee.appliesTo,
		description: fee.description ?? '',
		collection
	};
}

/** Read the fee dialog. */
export function readFeeDialogForm(formData: FormData): FeeDialogValues {
	const kind = String(formData.get('kind') ?? '');
	const known = FEE_KIND_OPTIONS.find((option) => option.value === kind);

	return {
		...readFeeForm(formData),
		kind: known?.value ?? 'other',
		description: String(formData.get('description') ?? '').trim(),
		collection: formData.get('collection') === 'manual' ? 'manual' : 'stripe'
	};
}

/** The confirmation for deleting a committee. */
function deleteCommitteeContent(committee: SetupCommittee): DeleteDialogContent {
	const named = committee.abbreviation
		? `${committee.name} (${committee.abbreviation})`
		: committee.name;

	return {
		id: committee.id,
		title: 'Delete committee?',
		sentence: `Are you sure you want to delete the ${named}?`,
		consequence: 'Its topics and settings are removed. This cannot be undone.',
		facts: [
			{ label: 'Committee name', value: committee.name },
			{ label: 'Seats', value: committee.plannedSeatCount?.toString() ?? 'Not decided' },
			{ label: 'Room', value: committee.room ?? 'Unassigned' }
		],
		action: 'deleteCommittee',
		buttonLabel: 'Delete committee'
	};
}

/** The confirmation for deleting a question. */
function deleteQuestionContent(question: ApplicationQuestion): DeleteDialogContent {
	return {
		id: question.id,
		title: 'Delete question?',
		sentence: 'Are you sure you want to delete this question?',
		consequence: 'Applicants will no longer be asked it. This cannot be undone.',
		facts: [
			{ label: 'Question', value: question.label },
			{ label: 'Type', value: questionTypeLabel(question.type) },
			{ label: 'Answer', value: question.isRequired ? 'Required' : 'Optional' }
		],
		action: 'deleteQuestion',
		buttonLabel: 'Delete question'
	};
}

/** The confirmation for deleting a fee. */
function deleteFeeContent(
	fee: SetupFee,
	draft: Pick<CreationDraft, 'currency' | 'collectsPaymentsManually'>
): DeleteDialogContent {
	return {
		id: fee.id,
		title: 'Delete fee?',
		sentence: `Are you sure you want to delete the ${fee.name}?`,
		consequence: 'Delegates will no longer be charged it. This cannot be undone.',
		facts: [
			{ label: 'Fee name', value: fee.name },
			{ label: 'Amount', value: formatMoney(fee.amountCents, draft.currency) },
			{
				label: 'Collection',
				value: draft.collectsPaymentsManually ? 'Collected externally' : 'Through MUNMeet'
			}
		],
		action: 'deleteFee',
		buttonLabel: 'Delete fee'
	};
}

/**
 * The dialog `?dialog=` and `?id=` ask for, filled from what the page loaded.
 * An unknown kind, or an id that is not one of this draft's rows, opens
 * nothing, as an out-of-date link should.
 */
export function readSetupDialog(params: URLSearchParams, sources: SetupDialogSources): SetupDialog {
	const kind = params.get('dialog');
	const id = params.get('id');
	const committee = sources.committees.find((row) => row.id === id) ?? null;
	const question = sources.questions.find((row) => row.id === id) ?? null;
	const fee = sources.fees.find((row) => row.id === id) ?? null;

	switch (kind) {
		case 'committee':
			return id !== null && committee === null
				? null
				: { kind, values: toCommitteeDialogValues(committee) };
		case 'question':
			return id !== null && question === null
				? null
				: { kind, values: question ? toQuestionFormValues(question) : EMPTY_QUESTION_FORM };
		case 'fee':
			return id !== null && fee === null
				? null
				: { kind, values: toFeeDialogValues(fee, sources.draft.collectsPaymentsManually) };
		case 'applications':
			return { kind, values: toApplicationsFormValues(sources.draft) };
		case 'delete-committee':
			return committee && { kind: 'delete', content: deleteCommitteeContent(committee) };
		case 'delete-question':
			return question && { kind: 'delete', content: deleteQuestionContent(question) };
		case 'delete-fee':
			return fee && { kind: 'delete', content: deleteFeeContent(fee, sources.draft) };
		default:
			return null;
	}
}
