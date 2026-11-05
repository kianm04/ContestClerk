/**
 * The Basics step of creating a conference (Trello fe3reN7Y): reading its
 * form, saying what is wrong with it, and turning what is right into the
 * values a draft is saved with.
 *
 * The step saves by itself while the organiser types, so the checks are
 * lenient: a field with something wrong in it is simply not saved, and only
 * "Continue to when & where" insists on a name.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import { validateEmail } from '$lib/auth';
import { addHttpsIfMissing, isWebAddress } from '$lib/conference-details';
import type { CreationPreview, PrefillSource } from '$lib/creation-draft';
import type { DraftValues } from '$lib/creation-prefill';

/** The longest name and tagline, as the public page has room for them. */
export const NAME_MAX_LENGTH = 120;
export const TAGLINE_MAX_LENGTH = 120;
export const DESCRIPTION_MAX_LENGTH = 4000;

/** The Basics form as it arrived, every field as text. */
export type BasicsValues = {
	name: string;
	tagline: string;
	description: string;
	contactEmail: string;
	websiteUrl: string;
	instagramUrl: string;
};

/** One message per field that has something wrong with it. */
export type BasicsErrors = Partial<Record<keyof BasicsValues, string>>;

function readText(formData: FormData, fieldName: string): string {
	return String(formData.get(fieldName) ?? '').trim();
}

/**
 * An Instagram account as people write it. "@tudelftmun" is how an account is
 * usually named, so it becomes the address of that account; anything else is
 * treated like any web address.
 */
export function instagramAddress(text: string): string {
	const handle = /^@([A-Za-z0-9._]+)$/.exec(text);

	if (handle !== null) {
		return `https://www.instagram.com/${handle[1]}`;
	}

	return addHttpsIfMissing(text);
}

/** Read the Basics fields from a submitted form. */
export function readBasics(formData: FormData): BasicsValues {
	return {
		name: readText(formData, 'name'),
		tagline: readText(formData, 'tagline'),
		description: readText(formData, 'description'),
		contactEmail: readText(formData, 'contactEmail'),
		// People type `thimun.org` rather than `https://thimun.org`.
		websiteUrl: addHttpsIfMissing(readText(formData, 'websiteUrl')),
		instagramUrl: instagramAddress(readText(formData, 'instagramUrl'))
	};
}

/**
 * What is wrong with the form. An empty name is only wrong when the organiser
 * asks to move on (`isNameRequired`); while they type it is a name not yet
 * written.
 */
export function validateBasics(
	values: BasicsValues,
	options: { isNameRequired: boolean }
): BasicsErrors {
	const errors: BasicsErrors = {};

	if (values.name === '' && options.isNameRequired) {
		errors.name = 'Please give the conference a name.';
	} else if (values.name.length > NAME_MAX_LENGTH) {
		errors.name = `Please keep the name under ${NAME_MAX_LENGTH} characters.`;
	}

	if (values.tagline.length > TAGLINE_MAX_LENGTH) {
		errors.tagline = `Please keep the tagline under ${TAGLINE_MAX_LENGTH} characters.`;
	}

	if (values.description.length > DESCRIPTION_MAX_LENGTH) {
		errors.description = `Please keep the description under ${DESCRIPTION_MAX_LENGTH} characters.`;
	}

	if (values.contactEmail !== '' && validateEmail(values.contactEmail) !== null) {
		errors.contactEmail = 'That does not look like an email address.';
	}

	if (values.websiteUrl !== '' && !isWebAddress(values.websiteUrl)) {
		errors.websiteUrl = 'Please enter a web address, such as tudelftmun.nl.';
	}

	if (values.instagramUrl !== '' && !isWebAddress(values.instagramUrl)) {
		errors.instagramUrl = 'Please enter an account, such as @tudelftmun, or its address.';
	}

	return errors;
}

/** Empty text is "nothing", which the database stores as `null`. */
function textOrNull(text: string): string | null {
	return text === '' ? null : text;
}

/**
 * The values to save: every field without an error. An empty name is left
 * out, because a draft always keeps the name it had rather than none at all.
 */
export function basicsPatch(values: BasicsValues, errors: BasicsErrors): Partial<DraftValues> {
	const patch: Partial<DraftValues> = {};

	if (errors.name === undefined && values.name !== '') patch.name = values.name;
	if (errors.tagline === undefined) patch.tagline = textOrNull(values.tagline);
	if (errors.description === undefined) patch.description = textOrNull(values.description);
	if (errors.contactEmail === undefined) patch.contactEmail = textOrNull(values.contactEmail);
	if (errors.websiteUrl === undefined) patch.websiteUrl = textOrNull(values.websiteUrl);
	if (errors.instagramUrl === undefined) patch.instagramUrl = textOrNull(values.instagramUrl);

	return patch;
}

/**
 * The quiet line under the logo or the banner on the Basics step: where the
 * picture came from, or nothing when there is no picture.
 */
export function imageCaption(
	kind: 'logo' | 'banner',
	path: string | null,
	source: PrefillSource | undefined,
	organizationName: string
): string {
	if (path === null) {
		return '';
	}

	if (source === 'organization') {
		return `Using ${organizationName} branding`;
	}

	if (source === 'previous_conference') {
		return 'Based on last conference';
	}

	return kind === 'logo' ? 'Conference logo' : 'Conference banner';
}

/**
 * Whether a picture lives in the draft's own folder, which is the only kind
 * the Basics step may delete: the organisation's logo and the last edition's
 * banner are copied there when the draft begins.
 */
export function isDraftOwnImage(path: string | null, draftId: string): boolean {
	return path !== null && path.startsWith(`conferences/${draftId}/`);
}

/**
 * The preview on the Basics step, as its mockup draws it: when, where and who
 * it is for under the name. The venue, timezone and fees wait for the steps
 * that ask about them.
 */
export function basicsPreview(preview: CreationPreview): CreationPreview {
	const shownKinds = new Set(['dates', 'place', 'level']);

	return { ...preview, facts: preview.facts.filter((fact) => shownKinds.has(fact.kind)) };
}
