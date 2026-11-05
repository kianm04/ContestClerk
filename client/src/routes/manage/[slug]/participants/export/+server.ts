import { CSV_CONTENT_TYPE, toCsvText, withoutColumns } from '$lib/csv';
import { dayInTimezone } from '$lib/dates';
import { contentDispositionFor } from '$lib/download-filename';
import {
	matchesParticipantQuery,
	parseParticipantQuery,
	participantCsvRows,
	participantsCsvFileName,
	sortParticipants
} from '$lib/participants';
import {
	hiddenParticipantCsvHeadings,
	participantColumns,
	participantsReaderMaySee,
	queryForColumns
} from '$lib/participant-access';
import { requireManagePage, requireTeamMember } from '$lib/server/access';
import { listParticipants, withExportDetails } from '$lib/server/participants';
import type { RequestHandler } from './$types';

/**
 * The participants list as a spreadsheet, filtered and sorted exactly as the
 * page beside it is.
 *
 * A `+server.ts` file is an endpoint rather than a page, so this answers the
 * browser with a file instead of any HTML. The "Export CSV" button carries the
 * page's own query string along, so whatever the organiser is looking at is
 * what they download. There is no paging: the table shows fifty at a time and
 * the file holds every participant the filters match.
 *
 * The first two lines throw a 404 at anybody whose permissions do not open the
 * participants page, so nothing below them is reached in that case. The file
 * then holds the rows and columns the page would show this reader: their own
 * committees, and the private details, invoices and papers only with the
 * permissions for them (`docs/roles-and-permissions.md`, section 5). Files
 * under `$lib/server` only ever run on the server.
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	const { conference, permissions } = await requireTeamMember(locals, url, params.slug);
	requireManagePage(permissions, 'participants');

	const query = queryForColumns(
		parseParticipantQuery(url.searchParams),
		participantColumns(permissions)
	);

	const everyParticipant = await listParticipants(locals.supabase, conference.id);
	const participants = participantsReaderMaySee(everyParticipant, permissions);
	const matching = participants.filter((participant) =>
		matchesParticipantQuery(participant, query)
	);
	const sorted = sortParticipants(matching, query.sort);

	// The private details are read for the matching rows only, not for everybody,
	// and only those this conference's permissions grant the reader are kept.
	const exportRows = await withExportDetails(locals.supabase, sorted, permissions);
	// A column the reader may not see is left out rather than written blank.
	const rows = withoutColumns(
		participantCsvRows(exportRows, conference.startDate),
		hiddenParticipantCsvHeadings(permissions)
	);

	// The day is read in the conference's own timezone, so a download taken late
	// in the evening is named after the day the organiser is having.
	const day = dayInTimezone(new Date(), conference.timezone);
	const fileName = participantsCsvFileName(conference.slug, day);

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
