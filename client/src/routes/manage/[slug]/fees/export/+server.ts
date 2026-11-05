import { CSV_CONTENT_TYPE, toCsvText, withoutColumns } from '$lib/csv';
import { dayInTimezone } from '$lib/dates';
import { contentDispositionFor } from '$lib/download-filename';
import {
	filterInvoices,
	invoiceCsvRows,
	invoicesCsvFileName,
	parseInvoiceQuery
} from '$lib/invoices';
import { privateDetailsAccess } from '$lib/private-details';
import { requirePermissionAndRank } from '$lib/server/access';
import { listConferenceInvoices, withPayerEmails } from '$lib/server/invoices';
import type { RequestHandler } from './$types';

/**
 * The invoices table on the fees page as a spreadsheet, filtered exactly as
 * the table is.
 *
 * A `+server.ts` file is an endpoint rather than a page, so this answers the
 * browser with a file instead of any HTML. The "Export CSV" button at the top
 * of the fees page points here and carries the table's search and status
 * along (see `manageFeesExportUrl`), so the file holds every invoice the
 * organiser is looking at, on every page of the table rather than one.
 *
 * The first lines throw a 404 at anybody without `manage_invoices`, so this
 * address cannot be used to read another conference's invoices. The payer's email is a contact detail, so the column is left out
 * for a reader without `read_contact_details`
 * (`docs/roles-and-permissions.md`, section 5). Files under `$lib/server` only ever run on the
 * server, so the queries below cannot reach the browser.
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	// The invoice export belongs to `manage_invoices` (section 8 of the spec).
	// This helper also answers what else the reader holds, for the email column.
	const { conference, permissions } = await requirePermissionAndRank(
		locals,
		url,
		params.slug,
		'manage_invoices'
	);

	const query = parseInvoiceQuery(url.searchParams);

	const invoices = await listConferenceInvoices(locals.supabase, conference.id);
	const matching = filterInvoices(invoices, query);

	// The emails are looked up only for the invoices going into the file.
	const exported = await withPayerEmails(locals.supabase, matching);

	// The day is read in the conference's own timezone, so a download taken late
	// in the evening is named after the day the organiser is having.
	const day = dayInTimezone(new Date(), conference.timezone);
	const fileName = invoicesCsvFileName(conference.slug, day);

	/*
		`content-disposition: attachment` is what makes the browser save the file
		instead of showing it, and the name after it is what the file is saved as.
		The name carries the conference's slug, which an organiser typed, so it
		goes through `contentDispositionFor` rather than straight into the header.
	*/
	const hiddenHeadings = privateDetailsAccess(permissions).contact ? [] : ['Payer email'];
	const rows = withoutColumns(invoiceCsvRows(exported), hiddenHeadings);

	return new Response(toCsvText(rows), {
		headers: {
			'content-type': CSV_CONTENT_TYPE,
			'content-disposition': contentDispositionFor(fileName)
		}
	});
};
