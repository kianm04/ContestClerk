import {
	applicationCsvRows,
	applicationsCsvFileName,
	parseApplicationListQuery
} from '$lib/applications';
import { CSV_CONTENT_TYPE, toCsvText, withoutColumns } from '$lib/csv';
import { dayInTimezone } from '$lib/dates';
import { contentDispositionFor } from '$lib/download-filename';
import { hiddenDetailHeadings, privateDetailsAccess } from '$lib/private-details';
import { requireManagePage, requireTeamMember } from '$lib/server/access';
import { readApplicationFormSettings } from '$lib/server/application-form-settings';
import { listApplicationQuestions } from '$lib/server/application-questions';
import { listApplicationsForExport } from '$lib/server/application-table';
import type { RequestHandler } from './$types';

/**
 * The applications table as a spreadsheet, filtered exactly as the page beside
 * it is.
 *
 * A `+server.ts` file is an endpoint rather than a page, so this answers the
 * browser with a file instead of any HTML. `05-pages/organiser/applications.md`
 * puts an "Export CSV" button at the top of the table pointing here, and the
 * button carries the page's own query string along, so whatever the organiser is
 * looking at is what they download. There is no paging: the table shows
 * twenty-five at a time and the file shows every row the filter matches.
 *
 * The first two lines throw a 404 at anybody whose permissions do not open the
 * applications page, which is what keeps a link to this address from becoming
 * a way of reading another conference's applicants, and nothing below them is
 * reached in that case. The private columns follow `read_contact_details` and
 * `read_welfare_details` (`docs/roles-and-permissions.md`, section 5). Files under `$lib/server` only ever run on
 * the server, so the queries below cannot reach the browser.
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	const { conference, permissions } = await requireTeamMember(locals, url, params.slug);
	// A 404 unless the reader's permissions open the applications page.
	requireManagePage(permissions, 'applications');

	const query = parseApplicationListQuery(url.searchParams);

	// None of these three needs another's answer, so they run side by side.
	const [applications, questions, settings] = await Promise.all([
		listApplicationsForExport(locals.supabase, conference.id, query),
		listApplicationQuestions(locals.supabase, conference.id),
		readApplicationFormSettings(locals.supabase, conference.id)
	]);

	/*
		The column count comes from the conference's own
		`committee_preference_count` rather than from how many preferences these
		particular applicants happened to give, so that two downloads taken with
		different filters have the same columns and can be pasted under one
		another.
	*/
	// The private columns the reader may not see are left out rather than written blank.
	const rows = withoutColumns(
		applicationCsvRows(applications, questions, settings.committeePreferenceCount),
		hiddenDetailHeadings(privateDetailsAccess(permissions), {
			contact: ['Email', 'Phone'],
			welfare: ['Date of birth', 'Dietary requirements', 'Emergency contact']
		})
	);

	// The day is read in the conference's own timezone, so a download taken late
	// in the evening is named after the day the organiser is having.
	const day = dayInTimezone(new Date(), conference.timezone);
	const fileName = applicationsCsvFileName(conference.slug, day);

	/*
		`content-disposition: attachment` is what makes the browser save the file
		instead of showing it, and the name after it is what the file is saved as.
		The name carries the conference's slug, which an organiser typed, so it
		goes through `contentDispositionFor` rather than straight into the header.
	*/
	return new Response(toCsvText(rows), {
		headers: {
			'content-type': CSV_CONTENT_TYPE,
			'content-disposition': contentDispositionFor(fileName)
		}
	});
};
