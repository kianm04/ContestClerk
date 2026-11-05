/**
 * The review panel beside the organiser's applications list (the manage
 * redesign): which application it shows, the rows its arrows go to, and the
 * words of its header and facts.
 *
 * The panel's state lives in the address as `?application=<id>`, next to the
 * tab, the filters and the page, so back, refresh and a shared link all show
 * the same application. These functions are pure, so `+page.server.ts`, its
 * actions and the panel's components all agree, and the tests need no page.
 */
import type { ReviewPanelLinks } from '$lib/application-panel-urls';
import { NOT_PROVIDED, UNKNOWN_AGE, type ApplicationForReview } from '$lib/application-review';
import { APPLICATIONS_PAGE_SIZE } from '$lib/applications';
import type { SelectOption } from '$lib/components/SelectField.svelte';
import { countryName } from '$lib/countries';
import { dayAndFullMonth } from '$lib/manage-list-dates';
import { statusLabel } from '$lib/status';

/** The query parameter naming the application in the panel, such as `?application=6f1b…`. */
export const PANEL_APPLICATION_PARAMETER = 'application';

/** The application the address asks the panel to show, or null when it names none. */
export function readPanelApplicationId(searchParams: URLSearchParams): string | null {
	const value = (searchParams.get(PANEL_APPLICATION_PARAMETER) ?? '').trim();

	return value === '' ? null : value;
}

/**
 * Where on this page of rows the panel's application is.
 *
 * It is the row the address names, or the first row when the address names
 * none, or one that is not on this page any more (decided since, or on another
 * tab). Null when the page has no rows, and so no panel.
 */
export function pickPanelIndex(rowIds: string[], requestedId: string | null): number | null {
	if (rowIds.length === 0) return null;
	if (requestedId === null) return 0;

	const index = rowIds.indexOf(requestedId);

	return index === -1 ? 0 : index;
}

/** The applications the panel's two arrows go to, or null where there is no row. */
export type PanelNeighbours = {
	previousId: string | null;
	nextId: string | null;
};

/**
 * The rows just above and below the panel's own, for its arrows. They stay on
 * this page of rows: the pager under the table is the way to the next page.
 */
export function panelNeighbours(rowIds: string[], index: number): PanelNeighbours {
	const isFirst = index <= 0;
	const isLast = index >= rowIds.length - 1;

	return {
		previousId: isFirst ? null : rowIds[index - 1],
		nextId: isLast ? null : rowIds[index + 1]
	};
}

/**
 * The application the panel moves on to once `decidedId` has been decided and
 * has left the tab: the row after it, or the row before it when it was the
 * last. Null when it was the only row, or is not on the page at all, and the
 * list then opens on its first row.
 */
export function applicationAfterDecision(rowIds: string[], decidedId: string): string | null {
	const index = rowIds.indexOf(decidedId);

	if (index === -1) return null;
	if (index < rowIds.length - 1) return rowIds[index + 1];
	if (index > 0) return rowIds[index - 1];

	return null;
}

/** Where the panel's application is in the whole tab, counting the pages before this one. */
export function panelPosition(page: number, index: number): number {
	return (page - 1) * APPLICATIONS_PAGE_SIZE + index + 1;
}

/**
 * "Applied 26 September · 1 of 4", under the applicant's name. An application
 * that was never submitted has no day to give, and says only "1 of 4".
 */
export function panelMetaLine(
	submittedAt: string | null,
	timezone: string,
	position: number,
	total: number
): string {
	const place = `${position} of ${total}`;

	if (submittedAt === null) return place;

	return `Applied ${dayAndFullMonth(submittedAt, timezone)} · ${place}`;
}

/** One line of the panel's facts, such as "Diet" and "Vegetarian". */
export type PanelFact = {
	label: string;
	value: string;
};

/** What the panel's facts are read from: the review page's own reading of one application. */
export type PanelFactSource = Pick<
	ApplicationForReview,
	'profile' | 'details' | 'preferredCommittees'
>;

/** "Sciences Po, France": the school and its country, whichever of the two are known. */
function schoolText(profile: ApplicationForReview['profile']): string {
	const country = profile.countryCode === null ? null : countryName(profile.countryCode);
	const parts = [profile.institutionName, country].filter((part) => part !== null && part !== '');

	return parts.length === 0 ? NOT_PROVIDED : parts.join(', ');
}

/** "1. DISEC · 2. Human Rights Council": the committees asked for, in the applicant's order. */
function preferencesText(preferredCommittees: string[]): string {
	if (preferredCommittees.length === 0) return NOT_PROVIDED;

	const numbered = preferredCommittees.map((name, index) => `${index + 1}. ${name}`);

	return numbered.join(' · ');
}

/** A detail the applicant never filled in reads "Not provided" rather than being left blank. */
function detailText(value: string | null | undefined): string {
	if (value === null || value === undefined || value.trim() === '') return NOT_PROVIDED;

	return value;
}

/**
 * The five facts the panel lists, in the artboard's order: school, experience,
 * age, preferences and diet. The review page lists these and more; the panel
 * keeps to what deciding needs, and "Open the full application" has the rest.
 */
export function panelFacts(source: PanelFactSource, age: number | null): PanelFact[] {
	const experienceLevel = source.profile.experienceLevel;
	const experience =
		experienceLevel === null ? NOT_PROVIDED : statusLabel('experience_level', experienceLevel);

	return [
		{ label: 'School', value: schoolText(source.profile) },
		{ label: 'Experience', value: experience },
		{ label: 'Age', value: age === null ? UNKNOWN_AGE : String(age) },
		{ label: 'Preferences', value: preferencesText(source.preferredCommittees) },
		{ label: 'Diet', value: detailText(source.details?.dietaryRequirements) }
	];
}

/** Which part of the panel a refusal belongs to: the decision buttons, or the note. */
export type PanelPart = 'decision' | 'note';

/**
 * What a refused post from the panel sends back with the page, so the message
 * shows under the form that was pressed and nothing chosen or typed is lost.
 */
export type ReviewPanelRefusal = {
	/** The application the refused post was about. Another one in the panel ignores it. */
	applicationId: string;
	part: PanelPart;
	message: string;
	/** The seat that was chosen. */
	seatId: string;
	/** What was typed in the organisers' note. */
	internalNote: string;
};

/**
 * Everything the panel draws about its one application. `loadReviewPanel` in
 * `$lib/server/application-review-panel.ts` reads it; it is declared here
 * rather than there because the panel's components need the type too, and a
 * component never imports from `$lib/server`.
 */
export type ReviewPanel = {
	applicationId: string;
	applicantName: string;
	/** "Applied 26 September · 1 of 4". */
	metaLine: string;
	/** School, experience, age, preferences and diet. */
	facts: PanelFact[];
	motivation: string | null;
	/** The organisers' own note, as saved. */
	internalNote: string;
	/** Which buttons it can still have: an application already decided has none. */
	canAccept: boolean;
	canWaitlist: boolean;
	canReject: boolean;
	/** The free seats, the applicant's preferred committees first. Empty once decided. */
	seatOptions: SelectOption[];
	links: ReviewPanelLinks;
};
