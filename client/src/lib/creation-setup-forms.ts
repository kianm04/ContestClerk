/**
 * The forms of the Setup step's dialogs (Trello fe3reN7Y) that the Manage
 * pages do not already have: a committee's planned seats, a fee's line for
 * delegates and its kind, and the Applications dialog's settings.
 *
 * The committee, question and fee fields everybody shares keep their own
 * files (`$lib/committee-details.ts`, `$lib/application-questions.ts`,
 * `$lib/fees.ts`); this file only adds what Setup asks for besides.
 * Nothing here talks to Supabase or knows any Svelte.
 */

import type { ApplicationCloseRule, ApplicationOpenMode, CreationDraft } from '$lib/creation-draft';
import { dayInTimezone, instantFromLocalDateTime, localDateTimeInTimezone } from '$lib/dates';
import type { FeeAppliesTo } from '$lib/fees';
import { MAX_COMMITTEE_PREFERENCES } from '$lib/application-form-settings';
import { readCloseOffsetDays, relativeDeadlineInstant } from '$lib/relative-deadline';

/** The most seats a committee may plan. Larger than any real committee. */
export const MAX_PLANNED_SEATS = 999;

/** Why the Seats field cannot be saved, or `null` when it can. Empty means "Not decided". */
export function plannedSeatsError(text: string): string | null {
	if (text === '') {
		return null;
	}

	const seats = Number(text);

	if (!Number.isInteger(seats) || seats < 1 || seats > MAX_PLANNED_SEATS) {
		return `Please enter a whole number of seats from 1 to ${MAX_PLANNED_SEATS}, or leave it empty.`;
	}

	return null;
}

/** The Seats field as the column stores it: a number, or `null` for "Not decided". */
export function toPlannedSeatCount(text: string): number | null {
	return text === '' || plannedSeatsError(text) !== null ? null : Number(text);
}

/**
 * `base`, or `base-2`, `base-3` and so on: the first that no other committee
 * of the conference uses. The dialog has no link field, so two committees
 * with the same name still each get a link of their own.
 */
export function uniqueSlug(base: string, takenSlugs: string[]): string {
	const start = base === '' ? 'committee' : base;
	let candidate = start;

	for (let suffix = 2; takenSlugs.includes(candidate); suffix += 1) {
		candidate = `${start}-${suffix}`;
	}

	return candidate;
}

/** The longest a fee's line for delegates may be. */
export const FEE_DESCRIPTION_MAX_LENGTH = 500;

/** The four kinds of fee the dialog offers; each sets who pays and a name to start from. */
export type FeeKind = 'delegate' | 'delegation' | 'late' | 'other';

export const FEE_KIND_OPTIONS: {
	value: FeeKind;
	label: string;
	description: string;
	appliesTo: FeeAppliesTo;
	defaultName: string;
}[] = [
	{
		value: 'delegate',
		label: 'Delegate fee',
		description: 'Per individual delegate',
		appliesTo: 'individual',
		defaultName: 'Delegate fee'
	},
	{
		value: 'delegation',
		label: 'Delegation fee',
		description: 'Per delegation (team)',
		appliesTo: 'delegation_member',
		defaultName: 'Delegation fee'
	},
	{
		value: 'late',
		label: 'Late fee',
		description: 'Additional fee (for example, late application)',
		appliesTo: 'individual',
		defaultName: 'Late fee'
	},
	{
		value: 'other',
		label: 'Other',
		description: 'Custom fee type',
		appliesTo: 'individual',
		defaultName: ''
	}
];

/** Which kind an existing fee looks like, from its name and who pays it. */
export function feeKindOf(fee: { name: string; appliesTo: FeeAppliesTo }): FeeKind {
	const matching = FEE_KIND_OPTIONS.find(
		(option) => option.defaultName !== '' && option.defaultName === fee.name
	);

	if (matching !== undefined) {
		return matching.value;
	}

	return fee.appliesTo === 'delegation_member' ? 'delegation' : 'other';
}

/** What the Applications dialog sends. Every field is text or a yes/no, as a form sends them. */
export type ApplicationsFormValues = {
	openMode: ApplicationOpenMode;
	/** `YYYY-MM-DDTHH:mm` on the conference's clock, or `''`. Only read when `openMode` is `scheduled`. */
	opensAt: string;
	/** An offset in days such as `-14`, or `fixed`. */
	closeChoice: string;
	/** `YYYY-MM-DD`, or `''`. Only read when `closeChoice` is `fixed`. */
	closesOn: string;
	acceptsIndividualApplications: boolean;
	acceptsDelegations: boolean;
	/** '0' to '3'. */
	committeePreferenceCount: string;
	askMotivation: boolean;
	positionPaperRequired: boolean;
};

export type ApplicationsFormErrors = {
	opensAt?: string;
	closesOn?: string;
	committeePreferenceCount?: string;
};

const OPEN_MODES: ApplicationOpenMode[] = ['manual', 'on_publish', 'scheduled'];

/** The dialog's fields, filled from the draft as it is saved. */
export function toApplicationsFormValues(
	draft: Pick<
		CreationDraft,
		| 'applicationOpenMode'
		| 'applicationsOpenAt'
		| 'applicationCloseRule'
		| 'applicationCloseOffsetDays'
		| 'applicationsCloseAt'
		| 'acceptsIndividualApplications'
		| 'acceptsDelegations'
		| 'committeePreferenceCount'
		| 'askMotivation'
		| 'positionPaperRequired'
		| 'timezone'
	>
): ApplicationsFormValues {
	const opensAt = draft.applicationsOpenAt;
	const closesAt = draft.applicationsCloseAt;

	return {
		openMode: draft.applicationOpenMode,
		opensAt: opensAt === null ? '' : localDateTimeInTimezone(new Date(opensAt), draft.timezone),
		closeChoice:
			draft.applicationCloseRule === 'fixed' ? 'fixed' : String(draft.applicationCloseOffsetDays),
		closesOn: closesAt === null ? '' : dayInTimezone(new Date(closesAt), draft.timezone),
		acceptsIndividualApplications: draft.acceptsIndividualApplications,
		acceptsDelegations: draft.acceptsDelegations,
		committeePreferenceCount: String(draft.committeePreferenceCount),
		askMotivation: draft.askMotivation,
		positionPaperRequired: draft.positionPaperRequired
	};
}

/** Read the Applications dialog. A checkbox or switch that is off sends nothing at all. */
export function readApplicationsForm(formData: FormData): ApplicationsFormValues {
	const text = (name: string) => String(formData.get(name) ?? '').trim();
	const openMode = text('openMode') as ApplicationOpenMode;

	return {
		openMode: OPEN_MODES.includes(openMode) ? openMode : 'manual',
		opensAt: text('opensAt'),
		closeChoice: text('closeChoice'),
		closesOn: text('closesOn'),
		acceptsIndividualApplications: formData.has('acceptsIndividualApplications'),
		acceptsDelegations: formData.has('acceptsDelegations'),
		committeePreferenceCount: text('committeePreferenceCount') || '0',
		askMotivation: formData.has('askMotivation'),
		positionPaperRequired: formData.has('positionPaperRequired')
	};
}

/** What is wrong with the dialog, field by field, for a conference starting on `startDate`. */
export function validateApplicationsForm(
	values: ApplicationsFormValues,
	startDate: string
): ApplicationsFormErrors {
	const errors: ApplicationsFormErrors = {};

	if (values.openMode === 'scheduled' && instantFromLocalDateTime(values.opensAt, 'UTC') === null) {
		errors.opensAt = 'Please choose when applications open.';
	}

	if (values.closeChoice === 'fixed') {
		// Both are `YYYY-MM-DD`, so comparing them as text compares them as days.
		if (!/^\d{4}-\d{2}-\d{2}$/.test(values.closesOn)) {
			errors.closesOn = 'Please choose the day applications close.';
		} else if (values.closesOn > startDate) {
			errors.closesOn = 'Applications have to close before the conference starts.';
		}
	}

	const preferences = Number(values.committeePreferenceCount);

	if (
		!Number.isInteger(preferences) ||
		preferences < 0 ||
		preferences > MAX_COMMITTEE_PREFERENCES
	) {
		errors.committeePreferenceCount = 'Please choose how many committees applicants rank.';
	}

	return errors;
}

/** The application columns of a draft, as the dialog's values save them. */
export type ApplicationSettings = {
	applicationOpenMode: ApplicationOpenMode;
	applicationsOpenAt: string | null;
	applicationCloseRule: ApplicationCloseRule;
	applicationCloseOffsetDays: number;
	applicationsCloseAt: string | null;
	acceptsIndividualApplications: boolean;
	acceptsDelegations: boolean;
	committeePreferenceCount: number;
	askMotivation: boolean;
	positionPaperRequired: boolean;
};

/**
 * Valid dialog values as columns. A fixed deadline closes at 23:59 of its day,
 * like a relative one; a relative one is worked out from the first day, so
 * every page that reads `applications_close_at` sees the same moment.
 */
export function toApplicationSettings(
	values: ApplicationsFormValues,
	draft: Pick<CreationDraft, 'startDate' | 'timezone' | 'applicationCloseOffsetDays'>
): ApplicationSettings {
	const isFixed = values.closeChoice === 'fixed';
	const offset = isFixed
		? draft.applicationCloseOffsetDays
		: readCloseOffsetDays(values.closeChoice);
	const closesAt = isFixed
		? instantFromLocalDateTime(`${values.closesOn}T23:59`, draft.timezone)
		: relativeDeadlineInstant(draft.startDate, offset, draft.timezone);

	return {
		applicationOpenMode: values.openMode,
		applicationsOpenAt:
			values.openMode === 'scheduled'
				? instantFromLocalDateTime(values.opensAt, draft.timezone)
				: null,
		applicationCloseRule: isFixed ? 'fixed' : 'relative',
		applicationCloseOffsetDays: offset,
		applicationsCloseAt: closesAt,
		acceptsIndividualApplications: values.acceptsIndividualApplications,
		acceptsDelegations: values.acceptsDelegations,
		committeePreferenceCount: Number(values.committeePreferenceCount),
		askMotivation: values.askMotivation,
		positionPaperRequired: values.positionPaperRequired
	};
}
