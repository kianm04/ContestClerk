/**
 * Reading and checking the award forms: the chair's "Propose an award" form,
 * the organiser's "Add award" and "Edit title" forms, and the organiser's
 * "Publish awards" panel.
 *
 * The chair's page and the organiser's page check the same things but word
 * some refusals differently, because their page files do, so each page has its
 * own table of sentences and both share the checks.
 */

import { instantFromLocalDateTime } from '$lib/dates';
import {
	AWARD_TITLE_MAX_LENGTH,
	awardKindLabel,
	isAwardKind,
	type AwardKind,
	type AwardSeat
} from '$lib/awards';

/** What an award form sent, as text, so a refused form can be shown again as typed. */
export type AwardFormValues = {
	seatId: string;
	kind: string;
	title: string;
};

/** An empty award form: no seat, Best Delegate, no title. */
export const EMPTY_AWARD_FORM: AwardFormValues = { seatId: '', kind: 'best_delegate', title: '' };

/** What can be wrong with an award form, in the order it is checked. */
export type AwardFormProblem = 'seat' | 'kind' | 'title' | 'titleLength' | 'emptySeat';

/** A checked award form, ready to write. */
export type CheckedAward = {
	seatId: string;
	/** The seat's name, for the "{seat} already has this award." refusal. */
	seatName: string;
	kind: AwardKind;
	/** The custom title, trimmed, or the kind's own label for every other kind. */
	title: string;
};

/** The chair's refusals, word for word from `05-pages/chair/awards.md`. */
export const CHAIR_AWARD_REFUSALS = {
	seat: 'Pick a seat.',
	kind: 'Pick an award.',
	title: 'Give the custom award a title.',
	titleLength: `Keep the title to ${AWARD_TITLE_MAX_LENGTH} characters.`,
	emptySeat: 'That seat has no delegate.',
	published: 'Awards were published; ask an organiser to change them.',
	notYours: 'Only the chair who proposed an award can change it, and only while it is proposed.',
	confirm: 'Please confirm before withdrawing the proposal.'
} as const;

/** The chair's refusal of a second award of the same kind for one seat. */
export function chairDuplicateRefusal(seatName: string): string {
	return `${seatName} already has this award.`;
}

/** The organiser's refusals, word for word from `05-pages/organiser/awards.md`. */
export const ORGANISER_AWARD_REFUSALS = {
	seat: 'Pick a seat.',
	kind: 'Pick an award.',
	title: 'Give the award a title.',
	titleLength: `Keep the title to ${AWARD_TITLE_MAX_LENGTH} characters.`,
	emptySeat: 'That seat has no delegate.',
	duplicate: 'This delegate already has that award.',
	published: 'Unpublish the awards before changing them.',
	noConfirmed: 'Confirm at least one award before publishing.',
	moment: 'Choose a moment in the future.',
	notCustom: 'Only a custom award you added can be renamed.',
	missing: 'That award is not part of this conference.',
	confirm: 'Please confirm first.'
} as const;

/** The organiser's publish refusal for a confirmed award on an empty seat. */
export function emptySeatPublishRefusal(awardDescription: string): string {
	return `${awardDescription} points at an empty seat. Fix or delete it first.`;
}

/** Read the three award fields out of a posted form. A missing field reads as empty. */
export function readAwardForm(formData: FormData): AwardFormValues {
	return {
		seatId: String(formData.get('seatId') ?? ''),
		kind: String(formData.get('kind') ?? ''),
		title: String(formData.get('title') ?? '')
	};
}

/**
 * Check an award form against the committee's seats. Answers the checked
 * award, or the first thing wrong with it.
 *
 * `seats` is every seat the form may name, filled or not, so that a seat that
 * was emptied since the page was drawn is told "That seat has no delegate."
 * rather than "Pick a seat.".
 */
export function checkAwardForm(
	values: AwardFormValues,
	seats: AwardSeat[]
): { award: CheckedAward } | { problem: AwardFormProblem } {
	const seat = seats.find((each) => each.id === values.seatId);

	if (!seat) return { problem: 'seat' };
	if (!isAwardKind(values.kind)) return { problem: 'kind' };

	const title = values.kind === 'custom' ? values.title.trim() : awardKindLabel(values.kind);

	if (title === '') return { problem: 'title' };
	if (title.length > AWARD_TITLE_MAX_LENGTH) return { problem: 'titleLength' };
	if (!seat.isFilled) return { problem: 'emptySeat' };

	return { award: { seatId: seat.id, seatName: seat.name, kind: values.kind, title } };
}

/**
 * Check the organiser's "Edit title" form. Answers the trimmed title, or the
 * problem with it.
 */
export function checkAwardTitle(
	title: string
): { title: string } | { problem: 'title' | 'titleLength' } {
	const trimmed = title.trim();

	if (trimmed === '') return { problem: 'title' };
	if (trimmed.length > AWARD_TITLE_MAX_LENGTH) return { problem: 'titleLength' };

	return { title: trimmed };
}

/** What the publish panel sent: `now` or `scheduled`, and the moment typed for the second. */
export type PublishFormValues = {
	when: string;
	publishAt: string;
};

/** An empty publish panel: "Publish now", with no moment typed. */
export const EMPTY_PUBLISH_FORM: PublishFormValues = { when: 'now', publishAt: '' };

/** Read the publish panel's two fields out of a posted form. */
export function readPublishForm(formData: FormData): PublishFormValues {
	return {
		when: String(formData.get('when') ?? ''),
		publishAt: String(formData.get('publishAt') ?? '')
	};
}

/**
 * The moment to publish at, as an ISO timestamp, or the organiser's refusal.
 *
 * "Publish now" is `now` itself. A scheduled moment is typed as the
 * conference's own clock reads it, because an `<input type="datetime-local">`
 * has no timezone, so it is read in the conference's timezone; it has to be
 * after `now`.
 */
export function readPublishMoment(
	values: PublishFormValues,
	now: Date,
	timeZone: string
): { publishAt: string } | { problem: string } {
	if (values.when !== 'scheduled') return { publishAt: now.toISOString() };

	const publishAt = instantFromLocalDateTime(values.publishAt, timeZone);

	if (publishAt === null || new Date(publishAt).getTime() <= now.getTime()) {
		return { problem: ORGANISER_AWARD_REFUSALS.moment };
	}

	return { publishAt };
}

/** A message under each field of an award form that needs fixing. */
export type AwardFormErrors = {
	seatId?: string;
	kind?: string;
	title?: string;
};

/**
 * Put a refusal under the field it is about: the seat for a missing, empty or
 * doubled seat, the kind for a missing kind, and the title for the rest.
 */
export function awardFormErrors(
	problem: AwardFormProblem | 'duplicate',
	message: string
): AwardFormErrors {
	if (problem === 'kind') return { kind: message };
	if (problem === 'title' || problem === 'titleLength') return { title: message };

	return { seatId: message };
}

/**
 * What a refused form on the organiser's awards page sends back, and which
 * form it belongs to: an "Add award" form names its committee, and a refused
 * "Edit title" names none.
 */
export type AwardsRefusal = {
	/** The committee whose "Add award" form was refused, or null. */
	committeeId: string | null;
	values: AwardFormValues | null;
	errors: AwardFormErrors;
};
