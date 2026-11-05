/**
 * The addresses of the review panel beside the organiser's applications list:
 * the list with one application open in the panel, the panel's arrows, and
 * where its forms post.
 *
 * Each one is the list's own address (`applicationListSearch` in `$lib/urls.ts`)
 * with `application=<id>` added, so the tab, the filters and the page survive
 * every click and every post. The review page's addresses never carry it.
 */
// `resolve` builds an address from a route's file path and its parameters,
// so a typo in the path is a type error instead of a broken link.
import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';
import { PANEL_APPLICATION_PARAMETER, type PanelNeighbours } from '$lib/application-panel';
import type { ApplicationListQuery } from '$lib/applications';
import { applicationListSearch, manageApplicationReviewUrl } from '$lib/urls';

/**
 * The applications list with one application open in the review panel, such as
 * `/manage/thimun-2027/applications?status=waitlisted&application=6f1b…`.
 */
export function applicationPanelUrl(
	slug: string,
	query: ApplicationListQuery,
	applicationId: string
): ResolvedPathname {
	const parameters = new URLSearchParams(applicationListSearch(query));
	parameters.set(PANEL_APPLICATION_PARAMETER, applicationId);

	return resolve(`/manage/[slug]/applications?${parameters.toString()}`, { slug });
}

/**
 * Where one of the panel's forms posts: the panel's own address with the
 * action's name added to the end. SvelteKit picks the action from the first
 * parameter starting with `/`, and the action reads the application and the
 * list back out of the rest, as `manageApplicationsActionUrl` explains.
 */
export function applicationPanelActionUrl(
	slug: string,
	query: ApplicationListQuery,
	applicationId: string,
	actionName: string
): string {
	return `${applicationPanelUrl(slug, query, applicationId)}&/${actionName}`;
}

/** The two places one row of the list leads. */
export type ApplicationRowLinks = {
	/** The review page, which is where the row goes below `xl`, where there is no panel. */
	reviewHref: ResolvedPathname;
	/** The list with this application in the panel, which is where the row goes from `xl` up. */
	panelHref: ResolvedPathname;
};

/** Where one row of the list leads, keeping the tab, the filters and the page. */
export function applicationRowLinks(
	slug: string,
	query: ApplicationListQuery,
	applicationId: string
): ApplicationRowLinks {
	return {
		reviewHref: manageApplicationReviewUrl(slug, applicationId, query),
		panelHref: applicationPanelUrl(slug, query, applicationId)
	};
}

/** Every address the panel draws for the application it shows. */
export type ReviewPanelLinks = {
	/** The arrows, or null on the first and the last row of the page. */
	previousHref: ResolvedPathname | null;
	nextHref: ResolvedPathname | null;
	/** "Open the full application": the review page, keeping the list it came from. */
	fullApplicationHref: ResolvedPathname;
	acceptAction: string;
	waitlistAction: string;
	rejectAction: string;
	saveNoteAction: string;
};

/** The panel's links and form targets for one application and its two neighbours. */
export function reviewPanelLinks(
	slug: string,
	query: ApplicationListQuery,
	applicationId: string,
	neighbours: PanelNeighbours
): ReviewPanelLinks {
	const { previousId, nextId } = neighbours;

	return {
		previousHref: previousId === null ? null : applicationPanelUrl(slug, query, previousId),
		nextHref: nextId === null ? null : applicationPanelUrl(slug, query, nextId),
		fullApplicationHref: manageApplicationReviewUrl(slug, applicationId, query),
		acceptAction: applicationPanelActionUrl(slug, query, applicationId, 'reviewAccept'),
		waitlistAction: applicationPanelActionUrl(slug, query, applicationId, 'reviewWaitlist'),
		rejectAction: applicationPanelActionUrl(slug, query, applicationId, 'reviewReject'),
		saveNoteAction: applicationPanelActionUrl(slug, query, applicationId, 'reviewSaveNote')
	};
}
