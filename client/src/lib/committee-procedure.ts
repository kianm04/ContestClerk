/**
 * The "Resolutions" settings of one committee (`docs/committee-papers.md`,
 * section 5): how its draft resolutions and amendments work, as the committee's
 * manage page shows and saves them.
 *
 * Each setting is one column of `committees`, with a check on its range in the
 * database. `validateProcedureForm` asks the same questions first, so that a
 * mistake is answered beside its own field rather than as a database error; the
 * database still checks again whatever this file says.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import type { Database } from '$lib/database.types';
import type { CommitteeFormat, PaperWords } from '$lib/committee-papers';

/** Whether a support minimum counts seats or a share of the committee's seats with a delegate. */
export type SupportUnit = Database['public']['Enums']['support_unit'];

/** The two procedures "Start from" fills the settings from, as `apply_committee_procedure` names them. */
export type ProcedureName = 'north_american' | 'thimun';

/** Every setting of section 5, as the database holds it. */
export type CommitteeProcedure = {
	format: CommitteeFormat;
	/** A crisis committee also writes working papers and draft resolutions. */
	crisisAllowsResolutions: boolean;
	paperWords: PaperWords;
	hasWorkingPapers: boolean;
	/** The most sponsors a draft resolution may have, or `null` for no cap. */
	sponsorLimit: number | null;
	supportMinimum: number;
	supportUnit: SupportUnit;
	supportCountsSponsors: boolean;
	oneSponsorshipPerTopic: boolean;
	hasFriendlyAmendments: boolean;
	amendmentSupportMinimum: number;
	amendmentSupportUnit: SupportUnit;
	preambleAmendable: boolean;
	hasSecondDegreeAmendments: boolean;
	checksFormat: boolean;
};

/**
 * The settings as the form holds them. The three numbers are text, because
 * text is all an `<input>` can carry, and a refused form must show what was
 * typed, such as "abc", rather than a number it could not become.
 */
export type ProcedureFormValues = Omit<
	CommitteeProcedure,
	| 'format'
	| 'paperWords'
	| 'sponsorLimit'
	| 'supportMinimum'
	| 'supportUnit'
	| 'amendmentSupportMinimum'
	| 'amendmentSupportUnit'
> & {
	/** Text, so that a value nobody offered can be kept and refused rather than thrown away. */
	format: string;
	paperWords: string;
	supportUnit: string;
	amendmentSupportUnit: string;
	sponsorLimit: string;
	supportMinimum: string;
	amendmentSupportMinimum: string;
};

/** The fields that can be wrong. A tick box is either ticked or not, so it never is. */
export type ProcedureFormErrors = Partial<
	Record<
		| 'format'
		| 'paperWords'
		| 'sponsorLimit'
		| 'supportMinimum'
		| 'supportUnit'
		| 'amendmentSupportMinimum'
		| 'amendmentSupportUnit',
		string
	>
>;

/** A committee the settings could be copied to, by its id and name. */
export type ProcedureCopyTarget = { id: string; name: string };

/** One choice of a dropdown on the form: the value is sent, the label is read. */
export type ProcedureOption = { value: string; label: string };

/** "Start from", in the words of section 5. */
export const PROCEDURE_OPTIONS: ProcedureOption[] = [
	{ value: 'north_american', label: 'North American' },
	{ value: 'thimun', label: 'THIMUN' }
];

export const FORMAT_OPTIONS: ProcedureOption[] = [
	{ value: 'standard', label: 'Standard' },
	{ value: 'crisis', label: 'Crisis' }
];

export const WORDS_OPTIONS: ProcedureOption[] = [
	{ value: 'sponsors_and_signatories', label: 'Sponsors and signatories' },
	{ value: 'submitters', label: 'Main submitter and co-submitters' }
];

export const SUPPORT_UNIT_OPTIONS: ProcedureOption[] = [
	{ value: 'seats', label: 'seats' },
	{ value: 'percent', label: '% of the committee' }
];

/**
 * The largest number any of the three may be, the database's own: far beyond
 * any committee, so that a typing slip does not become a number nobody meant.
 */
export const PROCEDURE_NUMBER_MAX = 1000;

/** The largest share of the committee, in percent. */
const PERCENT_MAX = 100;

/** Is this one of the two procedures? Anybody can post anything to a form action. */
export function isProcedureName(text: string): text is ProcedureName {
	return text === 'north_american' || text === 'thimun';
}

/** The saved settings as the form holds them. */
export function toProcedureFormValues(procedure: CommitteeProcedure): ProcedureFormValues {
	return {
		...procedure,
		sponsorLimit: procedure.sponsorLimit === null ? '' : String(procedure.sponsorLimit),
		supportMinimum: String(procedure.supportMinimum),
		amendmentSupportMinimum: String(procedure.amendmentSupportMinimum)
	};
}

/** One text field of a posted form, without surrounding spaces. */
function readText(formData: FormData, fieldName: string): string {
	return String(formData.get(fieldName) ?? '').trim();
}

/** A ticked box sends its value; an unticked one sends nothing at all. */
function readTicked(formData: FormData, fieldName: string): boolean {
	return formData.has(fieldName);
}

/** The settings form as it was posted. Nothing is checked yet. */
export function readProcedureForm(formData: FormData): ProcedureFormValues {
	return {
		format: readText(formData, 'format'),
		crisisAllowsResolutions: readTicked(formData, 'crisisAllowsResolutions'),
		paperWords: readText(formData, 'paperWords'),
		hasWorkingPapers: readTicked(formData, 'hasWorkingPapers'),
		sponsorLimit: readText(formData, 'sponsorLimit'),
		supportMinimum: readText(formData, 'supportMinimum'),
		supportUnit: readText(formData, 'supportUnit'),
		supportCountsSponsors: readTicked(formData, 'supportCountsSponsors'),
		oneSponsorshipPerTopic: readTicked(formData, 'oneSponsorshipPerTopic'),
		hasFriendlyAmendments: readTicked(formData, 'hasFriendlyAmendments'),
		amendmentSupportMinimum: readText(formData, 'amendmentSupportMinimum'),
		amendmentSupportUnit: readText(formData, 'amendmentSupportUnit'),
		preambleAmendable: readTicked(formData, 'preambleAmendable'),
		hasSecondDegreeAmendments: readTicked(formData, 'hasSecondDegreeAmendments'),
		checksFormat: readTicked(formData, 'checksFormat')
	};
}

/** The whole number this text spells, or `null` when it is anything else, such as "2.5". */
function readWholeNumber(text: string): number | null {
	return /^\d+$/.test(text) ? Number(text) : null;
}

/**
 * A support minimum and its unit, checked as the database checks them: a whole
 * number up to a thousand seats, or up to a hundred percent. `null` beside the
 * error when either is wrong.
 */
function checkSupport(
	minimumText: string,
	unitText: string
): { minimum: number | null; unit: SupportUnit | null; minimumError?: string; unitError?: string } {
	const unit = unitText === 'seats' || unitText === 'percent' ? unitText : null;

	if (unit === null) {
		return { minimum: null, unit, unitError: 'Choose seats or a share of the committee.' };
	}

	const minimum = readWholeNumber(minimumText);
	const most = unit === 'seats' ? PROCEDURE_NUMBER_MAX : PERCENT_MAX;

	if (minimum === null || minimum > most) {
		const minimumError =
			unit === 'seats'
				? `Enter a whole number of seats from 0 to ${PROCEDURE_NUMBER_MAX}.`
				: `Enter a whole percentage from 0 to ${PERCENT_MAX}.`;

		return { minimum: null, unit, minimumError };
	}

	return { minimum, unit };
}

/** The sponsor cap: empty for none, otherwise a whole number from 1 to a thousand. */
function checkSponsorLimit(text: string): { limit: number | null; error?: string } {
	if (text === '') {
		return { limit: null };
	}

	const limit = readWholeNumber(text);

	if (limit === null || limit < 1 || limit > PROCEDURE_NUMBER_MAX) {
		return {
			limit: null,
			error: `Enter a whole number from 1 to ${PROCEDURE_NUMBER_MAX}, or leave it empty for no cap.`
		};
	}

	return { limit };
}

/** What `validateProcedureForm` answers: the settings to save, or what is wrong with them. */
export type ProcedureFormResult =
	| { procedure: CommitteeProcedure; errors: ProcedureFormErrors }
	| { procedure: null; errors: ProcedureFormErrors };

/**
 * Check the posted settings and turn them into the values to save. The
 * procedure is `null` whenever any field has an error, and `errors` then says
 * which, one sentence per field.
 *
 * A standard committee never allows resolutions "in a crisis committee": the
 * box is only shown for a crisis one, so it is saved as off rather than as
 * whatever a hidden box last said.
 */
export function validateProcedureForm(values: ProcedureFormValues): ProcedureFormResult {
	const errors: ProcedureFormErrors = {};

	const format = values.format === 'standard' || values.format === 'crisis' ? values.format : null;
	if (format === null) errors.format = 'Choose standard or crisis.';

	const paperWords =
		values.paperWords === 'sponsors_and_signatories' || values.paperWords === 'submitters'
			? values.paperWords
			: null;
	if (paperWords === null) errors.paperWords = 'Choose the words the committee uses.';

	const sponsors = checkSponsorLimit(values.sponsorLimit);
	if (sponsors.error) errors.sponsorLimit = sponsors.error;

	const support = checkSupport(values.supportMinimum, values.supportUnit);
	if (support.minimumError) errors.supportMinimum = support.minimumError;
	if (support.unitError) errors.supportUnit = support.unitError;

	const amendment = checkSupport(values.amendmentSupportMinimum, values.amendmentSupportUnit);
	if (amendment.minimumError) errors.amendmentSupportMinimum = amendment.minimumError;
	if (amendment.unitError) errors.amendmentSupportUnit = amendment.unitError;

	if (
		format === null ||
		paperWords === null ||
		Object.keys(errors).length > 0 ||
		support.minimum === null ||
		support.unit === null ||
		amendment.minimum === null ||
		amendment.unit === null
	) {
		return { procedure: null, errors };
	}

	return {
		procedure: {
			format,
			crisisAllowsResolutions: format === 'crisis' && values.crisisAllowsResolutions,
			paperWords,
			hasWorkingPapers: values.hasWorkingPapers,
			sponsorLimit: sponsors.limit,
			supportMinimum: support.minimum,
			supportUnit: support.unit,
			supportCountsSponsors: values.supportCountsSponsors,
			oneSponsorshipPerTopic: values.oneSponsorshipPerTopic,
			hasFriendlyAmendments: values.hasFriendlyAmendments,
			amendmentSupportMinimum: amendment.minimum,
			amendmentSupportUnit: amendment.unit,
			preambleAmendable: values.preambleAmendable,
			hasSecondDegreeAmendments: values.hasSecondDegreeAmendments,
			checksFormat: values.checksFormat
		},
		errors
	};
}

/**
 * "Settings copied to 2 committees.", with the singular where one is needed,
 * for the toast after "Copy settings".
 */
export function copiedProcedureMessage(committeeCount: number): string {
	return committeeCount === 1
		? 'Settings copied to 1 committee.'
		: `Settings copied to ${committeeCount} committees.`;
}

/** What "Start from" says once it has filled the settings: "THIMUN settings applied." */
export function appliedProcedureMessage(procedureName: ProcedureName): string {
	const label = PROCEDURE_OPTIONS.find((option) => option.value === procedureName)?.label;

	return `${label} settings applied.`;
}
