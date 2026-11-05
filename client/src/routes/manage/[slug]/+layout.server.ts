import { manageStatusLine } from '$lib/manage-status';
import { requireTeamMember } from '$lib/server/access';
import {
	loadSetupProgress,
	loadSidebarCount,
	loadSwitcherConferences
} from '$lib/server/manage-layout';
import { getManagedOrganization } from '$lib/server/organizations';
import type { LayoutServerLoad } from './$types';

/**
 * Runs on the server for every page under `/manage/[slug]`, because it belongs
 * to that folder's layout.
 *
 * It reads the conference once and what the reader may do on it once
 * (`docs/roles-and-permissions.md`, section 8). Whatever it returns reaches
 * every page underneath as `data`, so none of them repeats either: each page's
 * `load` checks its own line of the permission table against
 * `data.permissions` with `requireManagePage`.
 *
 * Files under `$lib/server` only ever run on the server, so the checks below
 * cannot be skipped by anything the browser does.
 */
export const load: LayoutServerLoad = async ({ params, url, locals }) => {
	// `requireTeamMember` sends a visitor to the sign in page, somebody with an
	// unfinished profile to `/welcome`, and throws a 404 at a signed-in person
	// whose permissions open no page of this conference. All three throw, so
	// everything below is running for somebody on its team.
	const { conference, permissions } = await requireTeamMember(locals, url, params.slug);

	// The organisation has to be looked up after the conference rather than
	// beside it, because the slug it is found by is a column on the conference
	// row. The two cannot start at the same time.
	const organizationSlug = conference.organizationSlug;

	if (!organizationSlug) {
		throw new Error(`The conference ${conference.slug} is not attached to an organisation.`);
	}

	const now = new Date();

	// The sidebar's parts (the manage redesign). None of these needs another's
	// answer, so all four are sent at once and the page waits for the slowest.
	const [organization, setupProgress, sidebarCount, switcherConferences] = await Promise.all([
		getManagedOrganization(locals.supabase, organizationSlug),
		loadSetupProgress(locals.supabase, conference, now),
		loadSidebarCount(locals.supabase, conference, now),
		loadSwitcherConferences(locals.supabase)
	]);

	// A plain `Error` and not a 404. A conference always belongs to an
	// organisation, and anybody allowed to read the conference is allowed to read
	// that organisation, so nothing coming back means something is wrong on our
	// side rather than that the reader asked for a page that does not exist.
	if (!organization) {
		throw new Error(`The organisation ${organizationSlug} could not be read.`);
	}

	return {
		conference,
		permissions,
		organization,
		setupProgress,
		sidebarCount,
		switcherConferences,
		statusLine: manageStatusLine(conference, now)
	};
};
