/**
 * The Organisation step of creating a conference (Trello fe3reN7Y): reading
 * which organisation was chosen, or the new one that was described, and
 * checking it before a draft is made.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import { countryName, isCountryCode } from '$lib/countries';
import {
	creationPreview,
	locationLine,
	sourceChipLabel,
	type CreationOrganization,
	type CreationPreview,
	type DraftFacts,
	type PreviousConference
} from '$lib/creation-draft';
import { prefillDraft, type PrefilledDraft } from '$lib/creation-prefill';
import { formatDateRange } from '$lib/dates';
import {
	NEW_ORGANIZATION,
	ORGANIZATION_CITY_MAX_LENGTH,
	ORGANIZATION_NAME_MAX_LENGTH
} from '$lib/organizations';

/** What the Organisation step's form sends. */
export type CreationStartValues = {
	/** An organisation's id, `new`, or '' when nothing was chosen. */
	organization: string;
	/** The new organisation's name, city and country; only read when `organization` is `new`. */
	name: string;
	city: string;
	countryCode: string;
};

export type CreationStartErrors = {
	organization?: string;
	name?: string;
	city?: string;
	countryCode?: string;
};

/** Read the Organisation step's form. */
export function readCreationStart(formData: FormData): CreationStartValues {
	const text = (field: string) => String(formData.get(field) ?? '').trim();

	return {
		organization: text('organization'),
		name: text('organizationName'),
		city: text('organizationCity'),
		countryCode: text('organizationCountry').toUpperCase()
	};
}

/**
 * Check the Organisation step. `myOrganizationIds` must come from the
 * database, never from the form: a submitted id is only trusted once it turns
 * up among the reader's own organisations.
 */
export function validateCreationStart(
	values: CreationStartValues,
	myOrganizationIds: string[]
): CreationStartErrors {
	if (values.organization === NEW_ORGANIZATION) {
		const errors: CreationStartErrors = {};

		if (values.name === '') {
			errors.name = 'Enter the name of your organisation.';
		} else if (values.name.length > ORGANIZATION_NAME_MAX_LENGTH) {
			errors.name = `Keep the name under ${ORGANIZATION_NAME_MAX_LENGTH} characters.`;
		}

		// The city is optional, so only one that was typed can be too long.
		if (values.city.length > ORGANIZATION_CITY_MAX_LENGTH) {
			errors.city = `Keep the city under ${ORGANIZATION_CITY_MAX_LENGTH} characters.`;
		}

		if (values.countryCode !== '' && !isCountryCode(values.countryCode)) {
			errors.countryCode = 'Pick a country from the list.';
		}

		return errors;
	}

	if (values.organization === '') {
		return { organization: 'Choose an organisation, or start a new one.' };
	}

	if (!myOrganizationIds.includes(values.organization)) {
		return { organization: 'You are not a member of that organisation. Choose another one.' };
	}

	return {};
}

/** Whether the check above found anything. */
export function hasCreationStartErrors(errors: CreationStartErrors): boolean {
	return Object.keys(errors).length > 0;
}

/** The small lines on an organisation's card: where it is based, and its latest conference. */
export function organizationCardLines(organization: CreationOrganization): string[] {
	const lines: string[] = [];
	const home = [organization.city, organization.countryName].filter(Boolean).join(', ');

	if (home !== '') {
		lines.push(home);
	}

	if (organization.lastConference) {
		lines.push(`Latest: ${organization.lastConference.name}`);
	}

	return lines;
}

/**
 * The suggestion as the preview card and the line helpers read a draft: the
 * prefilled values, the country's name and where each value came from.
 */
export function suggestionFacts(suggestion: PrefilledDraft): DraftFacts {
	const { values, sources } = suggestion;

	return {
		...values,
		countryName: values.countryCode ? countryName(values.countryCode) : null,
		prefillSources: sources
	};
}

/** One line of the suggested next edition, with the chip that says where it came from. */
export type EditionLine = { text: string; chip: string | null };

/** "We found your previous conference": the old edition beside the suggested next one. */
export type EditionComparison = {
	previous: { name: string; dates: string; place: string };
	next: { name: EditionLine; dates: EditionLine; place: EditionLine };
};

export function editionComparison(
	previous: PreviousConference,
	suggestion: PrefilledDraft
): EditionComparison {
	const facts = suggestionFacts(suggestion);
	const { sources } = suggestion;

	return {
		previous: {
			name: previous.name,
			dates: formatDateRange(previous.startDate, previous.endDate),
			place: locationLine(previous)
		},
		next: {
			name: { text: facts.name, chip: sourceChipLabel('name', sources.name) },
			dates: {
				text: formatDateRange(facts.startDate, facts.endDate),
				chip: sourceChipLabel('start_date', sources.start_date)
			},
			place: { text: locationLine(facts), chip: sourceChipLabel('city', sources.city) }
		}
	};
}

/** The preview before anything is chosen: a conference with nothing known yet. */
const EMPTY_PREVIEW: CreationPreview = {
	name: 'Your conference',
	tagline: null,
	bannerPath: null,
	organizedBy: 'your organisation',
	facts: [
		{ kind: 'dates', text: 'Dates to be announced' },
		{ kind: 'place', text: 'Location to be announced' }
	],
	description: null
};

/**
 * A new organisation as its fields describe it so far, shaped like a saved
 * one so that its draft can be prefilled the same way. Nothing is checked
 * here: an unknown country is simply left out, as `validateCreationStart`
 * will refuse it when the form is sent.
 */
function typedOrganization(
	values: Pick<CreationStartValues, 'name' | 'city' | 'countryCode'>
): CreationOrganization {
	const city = values.city.trim();
	const countryCode = isCountryCode(values.countryCode) ? values.countryCode : null;

	return {
		id: NEW_ORGANIZATION,
		slug: '',
		name: values.name.trim(),
		city: city === '' ? null : city,
		countryCode,
		countryName: countryCode === null ? null : countryName(countryCode),
		logoPath: null,
		websiteUrl: null,
		isStripeConnected: false,
		lastConference: null
	};
}

/**
 * The Organisation step's preview. A chosen organisation shows the draft the
 * server prefilled for it; a new one shows the draft its fields would start,
 * worked out again on every keystroke, so its name and home appear as they
 * are typed. Only who, where and when: the tagline, the description and the
 * level wait for the Basics step's preview, as the mockup has it.
 */
export function organizationStepPreview(input: {
	/** The chosen organisation and the server's prefill for it, when one was chosen. */
	chosen: { organization: CreationOrganization; suggestion: PrefilledDraft } | null;
	/** What a new organisation's fields hold, when "New organisation" was chosen. */
	newOrganization: Pick<CreationStartValues, 'name' | 'city' | 'countryCode'> | null;
	/** When the page was drawn, so the placeholder dates match the server's. */
	now: Date;
}): CreationPreview {
	const { chosen, newOrganization, now } = input;
	let organization: CreationOrganization;
	let suggestion: PrefilledDraft;

	if (chosen !== null) {
		({ organization, suggestion } = chosen);
	} else if (newOrganization !== null) {
		organization = typedOrganization(newOrganization);
		suggestion = prefillDraft({ organization, previous: null, now });
	} else {
		return EMPTY_PREVIEW;
	}

	const preview = creationPreview(suggestionFacts(suggestion), organization.name, null);

	return {
		...preview,
		// A new organisation without a name yet keeps the empty preview's words.
		name: organization.name === '' ? EMPTY_PREVIEW.name : preview.name,
		organizedBy: organization.name === '' ? EMPTY_PREVIEW.organizedBy : organization.name,
		tagline: null,
		description: null,
		facts: preview.facts.filter((fact) => fact.kind !== 'level')
	};
}
