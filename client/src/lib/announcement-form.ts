/**
 * The organiser's announcement form: what it holds, how a submitted one is read
 * and what it refuses.
 *
 * Reading and checking what was typed lives here rather than in the page's
 * `+page.server.ts`, so the rules can be tested without a request and the
 * messages are written down in one place. `05-pages/organiser/announcements.md`
 * gives every message word for word.
 */

import type { Announcement, AnnouncementAudience, AnnouncementGroup } from '$lib/announcements';

/** The longest title an announcement may have, which the title box also stops typing at. */
export const ANNOUNCEMENT_TITLE_MAX_LENGTH = 120;

/** The longest body an announcement may have. The body box counts down towards it. */
export const ANNOUNCEMENT_BODY_MAX_LENGTH = 4000;

/** The five audiences, in the order the form offers them. */
export const ANNOUNCEMENT_AUDIENCE_OPTIONS: { value: AnnouncementAudience; label: string }[] = [
	{ value: 'everyone', label: 'Everyone' },
	{ value: 'delegates', label: 'Delegates' },
	{ value: 'staff', label: 'Staff' },
	{ value: 'committee', label: 'One committee' },
	{ value: 'delegation', label: 'One delegation' }
];

/**
 * Who an announcement is addressed to, as three pieces of text. The recipient
 * count is worked out from exactly this, whether it came from the form or from
 * the address.
 */
export type AudienceChoice = {
	audience: string;
	/** Only read when `audience` is `committee`. */
	committeeId: string;
	/** Only read when `audience` is `delegation`. */
	delegationId: string;
};

/** Everything the form holds, as text, so a refused form is drawn again exactly as it was. */
export type AnnouncementFormValues = AudienceChoice & {
	/** The announcement being edited, or `''` when the form is writing a new one. */
	announcementId: string;
	title: string;
	body: string;
	isPinned: boolean;
};

/** A message for each field that needs fixing. A field that is fine has no entry. */
export type AnnouncementFormErrors = {
	title?: string;
	body?: string;
	audience?: string;
	committeeId?: string;
	delegationId?: string;
};

/** An audience as `$lib/server/announcements.ts` takes it, with `null` for an id that does not apply. */
export type AudienceInput = {
	audience: AnnouncementAudience;
	committeeId: string | null;
	delegationId: string | null;
};

/** An announcement as `$lib/server/announcements.ts` writes it. */
export type AnnouncementInput = AudienceInput & {
	title: string;
	body: string;
	isPinned: boolean;
};

/** Read one text field from a submitted form or an address, without surrounding spaces. */
function readText(source: FormData | URLSearchParams, fieldName: string): string {
	return String(source.get(fieldName) ?? '').trim();
}

/** Is this text one of the five audiences? */
export function isAnnouncementAudience(text: string): text is AnnouncementAudience {
	return ANNOUNCEMENT_AUDIENCE_OPTIONS.some((option) => option.value === text);
}

/**
 * The audience the address asks for: `?audience=committee&committee=<id>`.
 * Anything missing or unknown is "everyone", which is where the form starts.
 */
export function readAudienceFromUrl(searchParams: URLSearchParams): AudienceChoice {
	const audience = readText(searchParams, 'audience');

	return {
		audience: isAnnouncementAudience(audience) ? audience : 'everyone',
		committeeId: readText(searchParams, 'committee'),
		delegationId: readText(searchParams, 'delegation')
	};
}

/** An empty form addressed to `choice`, which is "everyone" unless the address said otherwise. */
export function newAnnouncementForm(choice: AudienceChoice): AnnouncementFormValues {
	return {
		announcementId: '',
		title: '',
		body: '',
		isPinned: false,
		...choice
	};
}

/** A published announcement as the form holds it when "Edit" opens it. */
export function announcementFormValues(announcement: Announcement): AnnouncementFormValues {
	return {
		announcementId: announcement.id,
		title: announcement.title,
		body: announcement.body,
		audience: announcement.audience,
		committeeId: announcement.committeeId ?? '',
		delegationId: announcement.delegationId ?? '',
		isPinned: announcement.isPinned
	};
}

/** Read the form's fields from a submitted form. A ticked box sends "on"; an unticked one nothing. */
export function readAnnouncementForm(formData: FormData): AnnouncementFormValues {
	return {
		announcementId: readText(formData, 'announcementId'),
		title: readText(formData, 'title'),
		body: readText(formData, 'body'),
		audience: readText(formData, 'audience'),
		committeeId: readText(formData, 'committeeId'),
		delegationId: readText(formData, 'delegationId'),
		isPinned: formData.get('isPinned') === 'on'
	};
}

/**
 * Check who the announcement is for, and add any message to `errors`.
 *
 * Whether the committee or the delegation really belongs to this conference is
 * not asked here, because that needs the database; the action asks it after this.
 */
function checkAudience(choice: AudienceChoice, errors: AnnouncementFormErrors): void {
	// The radio buttons offer the five audiences and nothing else, so only a
	// request put together by hand gets this message.
	if (!isAnnouncementAudience(choice.audience)) {
		errors.audience = 'Choose who the announcement is for.';
		return;
	}

	if (choice.audience === 'committee' && choice.committeeId === '') {
		errors.committeeId = 'Pick the committee.';
	}

	if (choice.audience === 'delegation' && choice.delegationId === '') {
		errors.delegationId = 'Pick the delegation.';
	}
}

/**
 * Check a whole form before it is published or saved. Every problem is
 * collected at once, so the organiser sees all of them rather than one per try.
 *
 * An edit keeps the audience it was published with (the database refuses to
 * re-address an announcement), so `isEditing` leaves the audience unchecked.
 */
export function validateAnnouncementForm(
	values: AnnouncementFormValues,
	isEditing: boolean
): AnnouncementFormErrors {
	const errors: AnnouncementFormErrors = {};

	if (values.title === '') {
		errors.title = 'Please give the announcement a title.';
	} else if (values.title.length > ANNOUNCEMENT_TITLE_MAX_LENGTH) {
		errors.title = `Please keep the title under ${ANNOUNCEMENT_TITLE_MAX_LENGTH} characters.`;
	}

	if (values.body === '') {
		errors.body = 'Write the announcement first.';
	} else if (values.body.length > ANNOUNCEMENT_BODY_MAX_LENGTH) {
		errors.body = `Please keep the announcement under ${ANNOUNCEMENT_BODY_MAX_LENGTH} characters.`;
	}

	if (!isEditing) {
		checkAudience(values, errors);
	}

	return errors;
}

/** Check only the audience, which is all "Preview recipients" needs. */
export function validateAudienceChoice(choice: AudienceChoice): AnnouncementFormErrors {
	const errors: AnnouncementFormErrors = {};

	checkAudience(choice, errors);

	return errors;
}

/** Whether a check found anything to fix. */
export function hasAnnouncementErrors(errors: AnnouncementFormErrors): boolean {
	return Object.keys(errors).length > 0;
}

/**
 * The audience as the database takes it. The ids that do not belong to the
 * chosen audience are dropped, because the table refuses a committee on
 * anything but a committee announcement. Call it only on a checked choice.
 */
export function toAudienceInput(choice: AudienceChoice): AudienceInput {
	const audience = isAnnouncementAudience(choice.audience) ? choice.audience : 'everyone';

	return {
		audience,
		committeeId: audience === 'committee' ? choice.committeeId : null,
		delegationId: audience === 'delegation' ? choice.delegationId : null
	};
}

/** A checked form as the database takes it. */
export function toAnnouncementInput(values: AnnouncementFormValues): AnnouncementInput {
	return {
		...toAudienceInput(values),
		title: values.title,
		body: values.body,
		isPinned: values.isPinned
	};
}

/**
 * The audience a recipient count was worked out for, in words: "Everyone", or
 * the committee's or the delegation's own name.
 *
 * The form says it beside the count, because choosing another audience does
 * not change the count until "Preview recipients" is pressed, and a bare
 * number would then be describing somebody else.
 */
export function audienceChoiceLabel(
	audience: AudienceInput,
	committees: AnnouncementGroup[],
	delegations: AnnouncementGroup[]
): string {
	if (audience.audience === 'committee') {
		const committee = committees.find((candidate) => candidate.id === audience.committeeId);

		return committee?.name ?? 'One committee';
	}

	if (audience.audience === 'delegation') {
		const delegation = delegations.find((candidate) => candidate.id === audience.delegationId);

		return delegation?.name ?? 'One delegation';
	}

	const option = ANNOUNCEMENT_AUDIENCE_OPTIONS.find(
		(candidate) => candidate.value === audience.audience
	);

	return option?.label ?? 'Everyone';
}

/** How many people an announcement would notify, and the audience that number was counted for. */
export type AudienceCount = {
	recipientCount: number;
	/** Said beside the number, from `audienceChoiceLabel`. */
	audienceLabel: string;
};
