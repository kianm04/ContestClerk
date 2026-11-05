/**
 * Every internal link in the app is built here.
 *
 * Two reasons. A link built in one place is a link renamed in one place, and
 * `resolve()` from `$app/paths` checks the route against the folders under
 * `src/routes/`, so a link to a page that no longer exists fails the type check
 * instead of giving a visitor a 404. `resolve()` also adds the base path when
 * the app is deployed under one, which plain string concatenation would not.
 *
 * Both the server and the browser import this file, so nothing here may be
 * server-only. Add a helper when its route exists; a helper for a route that has
 * not been built yet cannot be type-checked and so cannot be written.
 */

import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';
import { EMPTY_ALLOCATION_QUERY, type AllocationQuery } from '$lib/allocation';
import { EMPTY_APPLICATION_LIST_QUERY, type ApplicationListQuery } from '$lib/applications';
import { safeRedirectPath, type AuthErrorReason } from '$lib/auth';
import { EMPTY_CONFERENCE_QUERY, type ConferenceQuery } from '$lib/conferences';
import { EMPTY_DELEGATION_LIST_QUERY, type DelegationListQuery } from '$lib/delegations';
import type { FeesTab } from '$lib/fees-tabs';
import { EMPTY_INVOICE_LIST_QUERY, type InvoiceListQuery } from '$lib/invoices';
import { SHOWCASE_VIEW_PARAMETER, type ShowcaseView } from '$lib/landing-showcase';
import { FROM_VIEW_FIELD, type ChairPage } from '$lib/live-mode';
import { EMPTY_MY_APPLICATIONS_QUERY, type MyApplicationsQuery } from '$lib/my-applications-query';
import type { PaperWay } from '$lib/paper-writing';
import {
	EMPTY_PARTICIPANT_QUERY,
	participantQuerySearch,
	type ParticipantQuery
} from '$lib/participants';
import type { TeamFilter } from '$lib/team';

/** Which column the styleguide's sample table is sorted by, and which page it shows. */
export type StyleguideView = {
	/** A column key such as `name`, or nothing for "not sorted". */
	sort?: string;
	direction?: 'asc' | 'desc';
	/** The first page is 1, not 0. */
	page?: number;
	/** The seat chosen in the `SeatList` example, such as `seat-br`. */
	seat?: string;
};

/** The public front page, `/`. */
export function landingUrl(): ResolvedPathname {
	return resolve('/');
}

/**
 * The front page showing one view of its example (Trello RBz46aTQ). The
 * delegate's view is the default, so its address is the plain `/`, and the
 * organiser's is `/?view=organiser`.
 */
export function landingShowcaseUrl(view: ShowcaseView): ResolvedPathname {
	if (view === 'delegate') {
		return resolve('/');
	}

	return resolve(`/?${SHOWCASE_VIEW_PARAMETER}=${view}`);
}

/**
 * The conference directory showing these search results.
 *
 * Values that are already the default are left out, so the address stays short:
 * `/conferences?q=munich` rather than `/conferences?q=munich&country=&page=1`.
 * With no search at all this is the plain `/conferences`.
 */
export function conferenceListUrl(
	query: ConferenceQuery = EMPTY_CONFERENCE_QUERY
): ResolvedPathname {
	const parameters = new URLSearchParams();

	if (query.q) parameters.set('q', query.q);
	if (query.country) parameters.set('country', query.country);
	// `append` rather than `set`, because each region is a parameter of its own.
	for (const region of query.regions) parameters.append('region', region);
	if (query.withinMonths) parameters.set('within', String(query.withinMonths));
	if (query.level) parameters.set('level', query.level);
	if (query.openOnly) parameters.set('open', '1');
	if (query.sort !== 'soonest') parameters.set('sort', query.sort);
	if (query.page > 1) parameters.set('page', String(query.page));

	const search = parameters.toString();

	return resolve(search ? `/conferences?${search}` : '/conferences');
}

/** One conference's own page, such as `/conferences/thimun-2027`. */
export function conferenceUrl(slug: string): ResolvedPathname {
	// The route folder is called `[slug]`, and `resolve` fills that part of the
	// address in with the value we give it.
	return resolve('/conferences/[slug]', { slug });
}

/** One committee's own page, such as `/conferences/amsterdam-open-mun-2027/committees/security-council`. */
export function committeeUrl(conferenceSlug: string, committeeSlug: string): ResolvedPathname {
	return resolve('/conferences/[slug]/committees/[committeeSlug]', {
		slug: conferenceSlug,
		committeeSlug
	});
}

/**
 * The apply form of one conference, such as `/conferences/thimun-2027/apply`,
 * where somebody fills in that conference's application.
 *
 * The apply panel on the conference page, the "Edit application" link on an
 * application of one's own and both of the form's own actions all send people
 * here, so the address is written once.
 */
export function applyUrl(slug: string): ResolvedPathname {
	return resolve('/conferences/[slug]/apply', { slug });
}

/**
 * The form that registers a delegation at one conference, such as
 * `/conferences/thimun-2027/delegations/new`, where a teacher signs their
 * group up instead of applying on their own.
 *
 * It sits beside `applyUrl` above because the two are the conference's two
 * ways in, and `specs/06-features/delegations.md` lets somebody take only one
 * of them.
 */
export function newDelegationUrl(slug: string): ResolvedPathname {
	return resolve('/conferences/[slug]/delegations/new', { slug });
}

/**
 * One application's own page, such as `/applications/9f2c8d1e-...`, where the
 * applicant sees its status and the organisers' note.
 *
 * The application is named by its id rather than by the conference's slug,
 * because it is the applicant's own row and nobody else may open it.
 */
export function applicationUrl(applicationId: string): ResolvedPathname {
	return resolve('/applications/[applicationId]', { applicationId });
}

/**
 * The reader's own invoice list, `/invoices`: what they owe and what they have
 * paid, for themselves and for any delegation they head.
 *
 * It takes no parameters. The page shows every invoice the reader can pay for,
 * without a filter of its own, which is what `05-pages/delegate/invoices.md`
 * asks for.
 */
export function myInvoicesUrl(): ResolvedPathname {
	return resolve('/invoices');
}

/**
 * One invoice's own page, such as `/invoices/9f2c8d1e-...`, where the payer
 * sees what it is for and how to pay it.
 *
 * The invoice is named by its id rather than by its number, for the same
 * reason `applicationUrl` above uses an id: only the payer and the heads of
 * its delegation may open it.
 */
export function invoiceUrl(invoiceId: string): ResolvedPathname {
	return resolve('/invoices/[invoiceId]', { invoiceId });
}

/**
 * One delegation's own pages, such as `/delegations/9f2c8d1e-...`, where its
 * heads see where the group stands and its members see their own seat.
 *
 * The delegation is named by its id rather than by the conference's slug, for
 * the same reason `applicationUrl` above is: only the people in it may open it.
 */
export function delegationUrl(delegationId: string): ResolvedPathname {
	return resolve('/delegations/[delegationId]', { delegationId });
}

/**
 * The seats page of one delegation, such as `/delegations/9f2c8d1e-.../seats`,
 * where its head puts members into the seats the organisers reserved.
 */
export function delegationSeatsUrl(delegationId: string): ResolvedPathname {
	return resolve('/delegations/[delegationId]/seats', { delegationId });
}

/**
 * Where the Unassign button on that page posts to, such as
 * `/delegations/9f2c8d1e-.../seats?/unassign&seat=seat-france`.
 *
 * It answers a plain `string` rather than a `ResolvedPathname` for the reason
 * `manageAllocationActionUrl` further down this file does: a form target is not
 * a page anybody navigates to, and `formaction` takes a string.
 *
 * The seat travels in the address rather than in a hidden field because
 * `ConfirmButton` renders a `<form method="post">` of its own and puts anything
 * passed to it as children in a `mb-3` box above the button, which would leave a
 * 12px gap over every seat row for a field nobody can see. SvelteKit picks the
 * form action out of the first query parameter whose name starts with `/`, so
 * `?/unassign&seat=…` names the action and carries the seat at once, and
 * `+page.server.ts` reads the seat back from `?seat=`.
 */
export function unassignDelegationSeatUrl(delegationId: string, seatId: string): string {
	const address = delegationSeatsUrl(delegationId);

	return `${address}?/unassign&seat=${encodeURIComponent(seatId)}`;
}

/**
 * The members page of one delegation, such as
 * `/delegations/9f2c8d1e-.../members`, where its head sees who has joined,
 * shares the join link and removes somebody who should not be there.
 */
export function delegationMembersUrl(delegationId: string): ResolvedPathname {
	return resolve('/delegations/[delegationId]/members', { delegationId });
}

/**
 * The "Position papers" view of one delegation (T147), such as
 * `/delegations/9f2c8d1e-.../papers`, listing the paper of every seat its
 * members hold.
 */
export function delegationPapersUrl(delegationId: string): ResolvedPathname {
	return resolve('/delegations/[delegationId]/papers', { delegationId });
}

/**
 * A fellow member's paper, opened for editing by the rest of their delegation
 * (T147), such as `/delegations/9f2c8d1e-.../papers/5a7b...`.
 */
export function delegationPaperUrl(delegationId: string, seatId: string): ResolvedPathname {
	return resolve('/delegations/[delegationId]/papers/[seatId]', { delegationId, seatId });
}

/**
 * The address the Remove button on that page posts to, such as
 * `/delegations/9f2c8d1e-.../members?/remove&user=3b1a...`.
 *
 * It answers a plain `string` rather than a `ResolvedPathname` for exactly the
 * reason `unassignDelegationSeatUrl` above gives in its own comment: a form
 * target is not a page anybody navigates to, and `formaction` takes a string.
 *
 * The member travels in the query string rather than in a hidden field for that
 * helper's other reason too. `ConfirmButton` renders a `<form method="post">` of
 * its own and takes no extra fields, and SvelteKit picks the form action out of
 * the first query parameter whose name starts with `/`, so `?/remove&user=...`
 * names the action and carries the member at once. `+page.server.ts` reads the
 * member back from `?user=`.
 */
export function removeDelegationMemberUrl(delegationId: string, userId: string): string {
	const address = delegationMembersUrl(delegationId);

	return `${address}?/remove&user=${encodeURIComponent(userId)}`;
}

/**
 * The link a head shares with the people they are bringing, such as
 * `/join/H7KP3QWX`.
 *
 * The code is the permission: anybody holding it may look the delegation up
 * and join it, which is why the database mints it and nobody may choose it.
 * `05-pages/delegation/dashboard.md` shows this address on the join code card
 * with the site's own name written in front of it.
 */
export function joinDelegationUrl(joinCode: string): ResolvedPathname {
	return resolve('/join/[joinCode]', { joinCode });
}

/** One organisation's own page, such as `/organizations/sample-europe-mun-network`. */
export function organizationUrl(slug: string): ResolvedPathname {
	return resolve('/organizations/[slug]', { slug });
}

/**
 * The "create a conference" page: the Organisation step, the first of the five
 * steps of creating a conference (Trello fe3reN7Y). The draft does not exist
 * yet, so there is no slug.
 */
export function createConferenceUrl(): ResolvedPathname {
	return resolve('/create');
}

/**
 * The Organisation step with one organisation already chosen, such as
 * `/create?organization=<id>` or `/create?organization=new`. The choice lives
 * in the address so the cards are plain links and the page works without
 * JavaScript.
 */
export function createWithOrganizationUrl(organizationId: string): string {
	// Built by hand rather than with `pageWithQuery`, which wants the page's
	// whole `URL`; this one only ever starts from `/create` itself.
	return `${createConferenceUrl()}?organization=${encodeURIComponent(organizationId)}`;
}

/** The four steps of a draft being created, as its address spells them. */
export type CreationStepSlug = 'basics' | 'when' | 'setup' | 'launch';

/**
 * One step of creating the draft `slug`, such as `/create/delft-mun-2027/when`.
 * Each step is its own folder under `src/routes/create/[slug]/`, so `resolve()`
 * can check the address.
 */
export function createStepUrl(slug: string, step: CreationStepSlug): ResolvedPathname {
	if (step === 'basics') {
		return resolve('/create/[slug]/basics', { slug });
	}

	if (step === 'when') {
		return resolve('/create/[slug]/when', { slug });
	}

	if (step === 'setup') {
		return resolve('/create/[slug]/setup', { slug });
	}

	return resolve('/create/[slug]/launch', { slug });
}

/**
 * The draft itself, `/create/<slug>`, which sends the organiser on to the step
 * they had reached. The list of their conferences links a draft here.
 */
export function createResumeUrl(slug: string): ResolvedPathname {
	return resolve('/create/[slug]', { slug });
}

/** The dialogs the Setup step opens over itself (Trello fe3reN7Y). */
export type SetupDialogKind =
	| 'committee'
	| 'delete-committee'
	| 'applications'
	| 'question'
	| 'delete-question'
	| 'fee'
	| 'delete-fee';

/**
 * The Setup step with one of its dialogs open, such as
 * `/create/delft-mun-2027/setup?dialog=committee&id=<uuid>`. The dialog's
 * state lives in the address, so every Add, Edit and Delete control is a plain
 * link, a reload keeps the dialog open, and closing it is a move back to the
 * plain Setup address. Without an `id` the dialog adds something new.
 *
 * The query is built inside `resolve()` the way `manageFeeEditUrl` builds its
 * own, so the answer keeps the `ResolvedPathname` type a `Button` asks for.
 */
export function createSetupDialogUrl(
	slug: string,
	kind: SetupDialogKind,
	id?: string
): ResolvedPathname {
	const query = id === undefined ? `dialog=${kind}` : `dialog=${kind}&id=${encodeURIComponent(id)}`;

	return resolve(`/create/[slug]/setup?${query}`, { slug });
}

/** The organiser area index, `/manage`, where somebody picks what to work on. */
export function manageUrl(): ResolvedPathname {
	return resolve('/manage');
}

/**
 * One conference's management area, such as `/manage/thimun-2027`.
 *
 * The module map in `specs/02-architecture/stack.md` promises a later
 * `managePath(slug, section)` covering the sections of that area. Each section
 * (`/details`, `/committees`, and the rest) gets its own helper here as the task
 * that builds its page arrives, for the reason at the top of this file:
 * `resolve()` only accepts a route whose folder is already under `src/routes/`.
 */
export function manageConferenceUrl(slug: string): ResolvedPathname {
	return resolve('/manage/[slug]', { slug });
}

/**
 * The details editor of one conference, such as `/manage/thimun-2027/details`,
 * where an organiser changes everything the public page shows.
 *
 * The first of the section helpers `manageConferenceUrl` above promises. The
 * sidebar, the publish checklist and the editor's own two form actions all send
 * people here, so the address is written once.
 */
export function manageDetailsUrl(slug: string): ResolvedPathname {
	return resolve('/manage/[slug]/details', { slug });
}

/**
 * The committees of one conference, such as `/manage/thimun-2027/committees`,
 * where an organiser adds the bodies delegates will sit in and puts them in
 * order.
 *
 * The second of the section helpers `manageConferenceUrl` above promises, after
 * `manageDetailsUrl`.
 */
export function manageCommitteesUrl(slug: string): ResolvedPathname {
	return resolve('/manage/[slug]/committees', { slug });
}

/** The form that makes a new committee, `/manage/thimun-2027/committees/new`. */
export function newCommitteeUrl(slug: string): ResolvedPathname {
	return resolve('/manage/[slug]/committees/new', { slug });
}

/**
 * One committee's own editor, such as
 * `/manage/thimun-2027/committees/9f2c8d1e-...`.
 *
 * The committee is named by its id here and by its slug on the public page
 * (`committeeUrl` above). That is deliberate: this very page is where the slug
 * is changed, and an address that moved the moment it was saved would leave the
 * organiser looking at a 404.
 */
export function manageCommitteeUrl(slug: string, committeeId: string): ResolvedPathname {
	return resolve('/manage/[slug]/committees/[committeeId]', { slug, committeeId });
}

/**
 * The team of one conference, such as `/manage/thimun-2027/team`, where an
 * organiser invites chairs and volunteers and hands out committees.
 *
 * The third of the section helpers `manageConferenceUrl` above promises, after
 * `manageDetailsUrl` and `manageCommitteesUrl`.
 */
export function manageTeamUrl(slug: string): ResolvedPathname {
	return resolve('/manage/[slug]/team', { slug });
}

/**
 * The same page with the team list filtered to one role, such as
 * `/manage/thimun-2027/team?role=<the Chair role's id>`: the Role filter names
 * one of the conference's own roles by its id.
 *
 * The filter lives in the URL, so back and refresh keep it and a filtered list
 * can be linked to. `all` is the default and leaves the parameter off, so the
 * plain address is what the sidebar and every other link point at.
 */
export function manageTeamFilterUrl(slug: string, filter: TeamFilter): ResolvedPathname {
	if (filter === 'all') {
		return manageTeamUrl(slug);
	}

	return resolve(`/manage/[slug]/team?role=${filter}`, { slug });
}

/**
 * The team page with the "Edit roles" dialog open for one person, such as
 * `/manage/thimun-2027/team?edit=<their user id>`. The dialog lives in the
 * address, like every dialog of this area, so it opens without JavaScript and
 * the back button closes it. The role filter that was open stays open.
 */
export function manageTeamEditRolesUrl(
	slug: string,
	filter: TeamFilter,
	userId: string
): ResolvedPathname {
	if (filter === 'all') {
		return resolve(`/manage/[slug]/team?edit=${userId}`, { slug });
	}

	return resolve(`/manage/[slug]/team?role=${filter}&edit=${userId}`, { slug });
}

/** The roles of one conference, such as `/manage/thimun-2027/team/roles`, in their order. */
export function manageRolesUrl(slug: string): ResolvedPathname {
	return resolve('/manage/[slug]/team/roles', { slug });
}

/**
 * The form for a new role. `from` is the id of a role whose scope and
 * permissions the form starts with, the "Start from" choice; without it the
 * form starts blank.
 */
export function manageNewRoleUrl(slug: string, from: string | null = null): ResolvedPathname {
	if (from === null) {
		return resolve('/manage/[slug]/team/roles/new', { slug });
	}

	return resolve(`/manage/[slug]/team/roles/new?from=${from}`, { slug });
}

/** One role's editor, such as `/manage/thimun-2027/team/roles/<the role's id>`. */
export function manageRoleUrl(slug: string, roleId: string): ResolvedPathname {
	return resolve('/manage/[slug]/team/roles/[roleId]', { slug, roleId });
}

/**
 * One role's editor with the "Delete role" confirmation open over it, kept in
 * the address for the same reason as the "Edit roles" dialog.
 */
export function manageDeleteRoleUrl(slug: string, roleId: string): ResolvedPathname {
	return resolve(`/manage/[slug]/team/roles/[roleId]?delete=1`, { slug, roleId });
}

/**
 * The query string the fees page's invoices table travels with, shared by the
 * helpers under this one so that the table, its buttons and its CSV always ask
 * the same question.
 *
 * Values that are already the default are left out, the way
 * `applicationListSearch` below leaves them out, so the address stays short.
 */
function invoiceListSearch(query: InvoiceListQuery): string {
	const parameters = new URLSearchParams();

	if (query.q) parameters.set('q', query.q);
	if (query.status) parameters.set('status', query.status);
	if (query.page > 1) parameters.set('page', String(query.page));
	if (query.invoice) parameters.set('invoice', query.invoice);

	return parameters.toString();
}

/**
 * The fees of one conference, such as `/manage/thimun-2027/fees`, where an
 * organiser says what delegates pay and how the money is collected, and reads
 * and settles every invoice.
 *
 * The fourth of the section helpers `manageConferenceUrl` above promises, after
 * `manageDetailsUrl`, `manageCommitteesUrl` and `manageTeamUrl`.
 *
 * The invoices table's search, status filter and page travel in the address,
 * so that the back button, a refresh and a shared link all show the same rows.
 * `query` is left off by the sidebar and every other page, which want the
 * plain page.
 */
export function manageFeesUrl(
	slug: string,
	query: InvoiceListQuery = EMPTY_INVOICE_LIST_QUERY
): ResolvedPathname {
	const search = invoiceListSearch(query);

	if (search) {
		return resolve(`/manage/[slug]/fees?${search}`, { slug });
	}

	return resolve('/manage/[slug]/fees', { slug });
}

/**
 * The fees page opened on one of its two tabs, such as
 * `/manage/thimun-2027/fees?tab=fees`. The fee forms come back to the "Fees"
 * tab this way, whichever tab the page opens on by itself (`$lib/fees-tabs.ts`).
 */
export function manageFeesTabUrl(slug: string, tab: FeesTab): ResolvedPathname {
	return resolve(`/manage/[slug]/fees?tab=${tab}`, { slug });
}

/**
 * The same page on its "Invoices" tab, scrolled to the table, such as
 * `/manage/thimun-2027/fees?status=unpaid&page=2#invoices`.
 *
 * The filter form, the page links and every invoice button come back here, so
 * that the organiser lands on the table they were using. Any search, filter or
 * page already opens the "Invoices" tab, so only the plain table needs
 * `tab=invoices`. The `#invoices` is explained under the next helper.
 */
export function manageFeesTableUrl(slug: string, query: InvoiceListQuery): ResolvedPathname {
	const search = invoiceListSearch(query);

	if (search) {
		return resolve(`/manage/[slug]/fees?${search}#invoices`, { slug });
	}

	return resolve('/manage/[slug]/fees?tab=invoices#invoices', { slug });
}

/**
 * The fees page opened on one invoice, such as
 * `/manage/thimun-2027/fees?invoice=9f2c8d1e-...#invoices`, which the
 * delegation review page links each of its invoices to.
 *
 * The table highlights that invoice and shows it first, on the "Invoices" tab,
 * which `invoice=` opens. The `#invoices` at the end is a plain HTML anchor:
 * the browser scrolls down to the element whose `id` is `invoices`, which is
 * the invoices table, without any JavaScript.
 */
export function manageFeesInvoiceUrl(slug: string, invoiceId: string): ResolvedPathname {
	const search = invoiceListSearch({ ...EMPTY_INVOICE_LIST_QUERY, invoice: invoiceId });

	return resolve(`/manage/[slug]/fees?${search}#invoices`, { slug });
}

/**
 * The invoices of the table as a spreadsheet, such as
 * `/manage/thimun-2027/fees/export?status=unpaid`.
 *
 * It is an endpoint rather than a page (`+server.ts`), which is why the browser
 * downloads a file instead of navigating. It carries the search and the status
 * and nothing else: the CSV is every invoice those two leave, not one page of
 * them, and not the one invoice another page linked to.
 */
export function manageFeesExportUrl(slug: string, query: InvoiceListQuery): ResolvedPathname {
	const search = invoiceListSearch({
		...EMPTY_INVOICE_LIST_QUERY,
		q: query.q,
		status: query.status
	});

	if (search) {
		return resolve(`/manage/[slug]/fees/export?${search}`, { slug });
	}

	return resolve('/manage/[slug]/fees/export', { slug });
}

/**
 * Where one of the invoice rows' buttons posts to: the fees page's own address
 * with the name of the form action added to the end of the query string, so
 * that the search, the filter and the page survive the post.
 *
 * It is built the way `manageApplicationsActionUrl` below is built, and for the
 * same reason, which that helper explains. It answers a plain `string` because
 * a form target is not a page anybody navigates to.
 */
export function manageFeesActionUrl(
	slug: string,
	query: InvoiceListQuery,
	actionName: string
): string {
	const address = manageFeesUrl(slug, query);
	const separator = address.includes('?') ? '&' : '?';

	return `${address}${separator}/${actionName}`;
}

/**
 * The same page with one fee open for editing, such as
 * `/manage/thimun-2027/fees?editFee=9f2c8d1e-...`.
 *
 * The fee being edited is in the address rather than in a piece of state, so
 * that the back button works, a refresh keeps the form open, and the page needs
 * no JavaScript to switch between adding and editing. It is the same reason the
 * team page's tabs are links; `05-pages/organiser/fees.md` asks for this
 * parameter by name.
 */
export function manageFeeEditUrl(slug: string, feeId: string): ResolvedPathname {
	return resolve(`/manage/[slug]/fees?editFee=${encodeURIComponent(feeId)}`, { slug });
}

/**
 * The application form of one conference, such as
 * `/manage/thimun-2027/application-form`, where an organiser decides when
 * people may apply, who may apply, and what the form asks them.
 *
 * The fifth of the section helpers `manageConferenceUrl` above promises, after
 * `manageDetailsUrl`, `manageCommitteesUrl`, `manageTeamUrl` and
 * `manageFeesUrl`.
 */
export function manageApplicationFormUrl(slug: string): ResolvedPathname {
	return resolve('/manage/[slug]/application-form', { slug });
}

/**
 * The same page with one custom question open for editing, such as
 * `/manage/thimun-2027/application-form?edit=9f2c8d1e-...`.
 *
 * The question being edited is in the address rather than in a piece of state,
 * so that the back button works, a refresh keeps the form open, and the page
 * needs no JavaScript to switch between adding a question and editing one. It
 * is the same reason the fee being edited travels in `manageFeeEditUrl` above;
 * `05-pages/organiser/application-form.md` asks for this parameter by name.
 */
export function manageQuestionEditUrl(slug: string, questionId: string): ResolvedPathname {
	return resolve(`/manage/[slug]/application-form?edit=${encodeURIComponent(questionId)}`, {
		slug
	});
}

/**
 * The query string the organiser's applications table travels with, shared by
 * the helpers under this one so that the table and its CSV always ask the
 * same question. It is exported for `$lib/application-panel-urls.ts`, which
 * adds the review panel's `application` parameter to it.
 *
 * Values that are already the default are left out, the way `conferenceListUrl`
 * above leaves them out, so the address stays short:
 * `/manage/thimun-2027/applications?q=kowalska` rather than one carrying the
 * tab, the sort and the page as well.
 */
export function applicationListSearch(query: ApplicationListQuery): string {
	const parameters = new URLSearchParams();

	if (query.q) parameters.set('q', query.q);
	if (query.status !== 'submitted') parameters.set('status', query.status);
	if (query.committee) parameters.set('committee', query.committee);
	if (query.country) parameters.set('country', query.country);
	if (query.sort !== 'submitted') parameters.set('sort', query.sort);
	if (query.page > 1) parameters.set('page', String(query.page));
	if (query.view !== 'table') parameters.set('view', query.view);

	return parameters.toString();
}

/**
 * The organiser's applications table, such as
 * `/manage/thimun-2027/applications?status=waitlisted`, where the people who
 * applied are read, waitlisted, accepted or turned down.
 *
 * The sixth of the section helpers `manageConferenceUrl` above promises, after
 * `manageDetailsUrl`, `manageCommitteesUrl`, `manageTeamUrl`, `manageFeesUrl`
 * and `manageApplicationFormUrl`.
 *
 * The whole state of the table — the tab, the search, the two filters, the sort
 * and the page — travels in the address, so that the back button, a refresh and
 * a shared link all show the same rows. `query` is left off altogether by the
 * sidebar and by the dashboard's "View all" link, which both want the plain
 * table.
 */
export function manageApplicationsUrl(
	slug: string,
	query: ApplicationListQuery = EMPTY_APPLICATION_LIST_QUERY
): ResolvedPathname {
	const search = applicationListSearch(query);

	if (search) {
		return resolve(`/manage/[slug]/applications?${search}`, { slug });
	}

	return resolve('/manage/[slug]/applications', { slug });
}

/**
 * The same rows as a spreadsheet, such as
 * `/manage/thimun-2027/applications/export?status=accepted`.
 *
 * It is an endpoint rather than a page (`+server.ts`), which is why the browser
 * downloads a file instead of navigating. It takes the same query as
 * `manageApplicationsUrl` above and through the same helper, so the "Export
 * CSV" button always hands back exactly the rows the table is showing.
 */
export function manageApplicationsExportUrl(
	slug: string,
	query: ApplicationListQuery
): ResolvedPathname {
	const search = applicationListSearch(query);

	if (search) {
		return resolve(`/manage/[slug]/applications/export?${search}`, { slug });
	}

	return resolve('/manage/[slug]/applications/export', { slug });
}

/**
 * Where one of the applications table's form buttons posts to: the table's own
 * address, with the name of the form action added to the end of the query
 * string.
 *
 * SvelteKit picks which action to run out of the query string — it takes the
 * first parameter whose name starts with `/` — so the usual `?/bulkAccept`
 * written on a button replaces the whole query string and throws away the tab,
 * the search, the filters and the page the organiser is looking at. Every
 * action on that page reads those back out of the address, both to find the
 * ticked rows again and to redirect to where the organiser was, so they have to
 * survive the post. Adding the action to what is already there is what keeps
 * them.
 *
 * It answers a plain `string` rather than a `ResolvedPathname`, because the
 * result is not a page anybody can navigate to: it is a form target, and
 * `formaction` takes a string.
 */
export function manageApplicationsActionUrl(
	slug: string,
	query: ApplicationListQuery,
	actionName: string
): string {
	const address = manageApplicationsUrl(slug, query);
	const separator = address.includes('?') ? '&' : '?';

	return `${address}${separator}/${actionName}`;
}

/**
 * One application's review page, such as
 * `/manage/thimun-2027/applications/6f1b…?status=waitlisted`, where an
 * organiser reads one application in full and decides it.
 *
 * Unlike `manageDelegationReviewUrl` below, this one carries the table's query
 * string along. The page's "Previous" and "Next" walk the queue the organiser
 * came from, and its "Applications" back link returns to the same tab, search
 * and page, so both need to know what that queue was. The table's rows and the
 * dashboard's recent applications both link here; the dashboard has no query
 * to pass and leaves it off.
 */
export function manageApplicationReviewUrl(
	slug: string,
	applicationId: string,
	query: ApplicationListQuery = EMPTY_APPLICATION_LIST_QUERY
): ResolvedPathname {
	const search = applicationListSearch(query);

	if (search) {
		return resolve(`/manage/[slug]/applications/[applicationId]?${search}`, {
			slug,
			applicationId
		});
	}

	return resolve('/manage/[slug]/applications/[applicationId]', { slug, applicationId });
}

/**
 * Where one of the review page's forms posts to: the page's own address, query
 * string included, with the action's name added to the end.
 *
 * A bare `?/accept` would throw the queue away, for the reason
 * `manageApplicationsActionUrl` above gives, and the page would come back
 * after the post with "Previous" and "Next" walking the wrong queue.
 */
export function manageApplicationReviewActionUrl(
	slug: string,
	applicationId: string,
	query: ApplicationListQuery,
	actionName: string
): string {
	const address = manageApplicationReviewUrl(slug, applicationId, query);
	const separator = address.includes('?') ? '&' : '?';

	return `${address}${separator}/${actionName}`;
}

/**
 * The query string the organiser's delegations table travels with.
 *
 * Values that are already the default are left out, the way
 * `applicationListSearch` above leaves them out, so the address stays short:
 * `/manage/thimun-2027/delegations?q=lycee` rather than one carrying the tab,
 * the sort and the page as well.
 */
function delegationListSearch(query: DelegationListQuery): string {
	const parameters = new URLSearchParams();

	if (query.q) parameters.set('q', query.q);
	if (query.status !== 'submitted') parameters.set('status', query.status);
	if (query.country) parameters.set('country', query.country);
	if (query.sort !== 'submitted') parameters.set('sort', query.sort);
	if (query.page > 1) parameters.set('page', String(query.page));

	return parameters.toString();
}

/**
 * The organiser's delegations table, such as
 * `/manage/thimun-2027/delegations?status=accepted`, where the schools and
 * groups that want to come are read and opened one at a time.
 *
 * The seventh of the section helpers `manageConferenceUrl` above promises,
 * after `manageDetailsUrl`, `manageCommitteesUrl`, `manageTeamUrl`,
 * `manageFeesUrl`, `manageApplicationFormUrl` and `manageApplicationsUrl`.
 *
 * The whole state of the table — the tab, the search, the country filter, the
 * sort and the page — travels in the address, so that the back button, a
 * refresh and a shared link all show the same rows. `query` is left off
 * altogether by the sidebar, which wants the plain table.
 *
 * The page one row leads to has its own helper, `manageDelegationReviewUrl`
 * just below.
 */
export function manageDelegationsUrl(
	slug: string,
	query: DelegationListQuery = EMPTY_DELEGATION_LIST_QUERY
): ResolvedPathname {
	const search = delegationListSearch(query);

	if (search) {
		return resolve(`/manage/[slug]/delegations?${search}`, { slug });
	}

	return resolve('/manage/[slug]/delegations', { slug });
}

/**
 * One delegation's review page, such as
 * `/manage/thimun-2027/delegations/6f1b…`, where the organisers read a school's
 * request in full, allocate its seats and decide it.
 *
 * The table above links here for every row it draws, and so does the card the
 * same list shows on a phone. There is no query string: everything this page
 * shows is the one delegation, so there is no filter or sort to carry.
 *
 * Form targets on this page are written as plain `?/allocate` in the markup
 * rather than built here, the way `manageAllocationActionUrl` builds its own.
 * That helper exists because the grid has filters in its address that a bare
 * `?/action` would throw away; this page has none to lose.
 */
export function manageDelegationReviewUrl(slug: string, delegationId: string): ResolvedPathname {
	return resolve('/manage/[slug]/delegations/[delegationId]', { slug, delegationId });
}

/**
 * The query string the allocation grid travels with. Defaults are left off.
 *
 * The parameters are written in one fixed order — the two filters, the search,
 * then the seat a panel is open for and which panel it is — so that the same
 * grid always has the same address, the way `delegationListSearch` above keeps
 * its own order.
 */
function allocationSearch(query: AllocationQuery): string {
	const parameters = new URLSearchParams();

	if (query.committee) parameters.set('committee', query.committee);
	if (query.state) parameters.set('state', query.state);
	if (query.q) parameters.set('q', query.q);
	if (query.seat) parameters.set('seat', query.seat);
	if (query.action) parameters.set('action', query.action);

	return parameters.toString();
}

/**
 * The organiser's allocation grid for one conference, such as
 * `/manage/thimun-2027/allocation?state=free`, where every seat of every
 * committee is seen at once and the gaps are filled in.
 *
 * The eighth of the section helpers `manageConferenceUrl` above promises, after
 * `manageDetailsUrl`, `manageCommitteesUrl`, `manageTeamUrl`, `manageFeesUrl`,
 * `manageApplicationFormUrl`, `manageApplicationsUrl` and
 * `manageDelegationsUrl`.
 *
 * Everything the grid is showing travels in the address — the two filters, the
 * search and the panel that is open over it — so that the back button, a
 * refresh and a shared link all show the same seats, and so that the move panel
 * opens from a plain link on a page whose JavaScript never ran. `query` is left
 * off altogether by the sidebar, which wants the plain grid.
 */
export function manageAllocationUrl(
	slug: string,
	query: AllocationQuery = EMPTY_ALLOCATION_QUERY
): ResolvedPathname {
	const search = allocationSearch(query);

	if (search) {
		return resolve(`/manage/[slug]/allocation?${search}`, { slug });
	}

	return resolve('/manage/[slug]/allocation', { slug });
}

/**
 * A form target on the allocation grid that keeps the filters and the open
 * panel: the grid's own address with the name of the form action added to the
 * end of the query string.
 *
 * It is built the way `manageApplicationsActionUrl` above is built, and for the
 * same reason: SvelteKit picks the action out of the first parameter whose name
 * starts with `/`, so a plain `?/freeSeat` written on a button would replace the
 * whole query string and throw away the filters the organiser is looking
 * through. It answers a plain `string` for that helper's reason too — a form
 * target is not a page anybody navigates to, and `formaction` takes a string.
 */
export function manageAllocationActionUrl(
	slug: string,
	query: AllocationQuery,
	actionName: string
): string {
	const address = manageAllocationUrl(slug, query);
	const separator = address.includes('?') ? '&' : '?';

	return `${address}${separator}/${actionName}`;
}

/**
 * The organiser's participants list, such as
 * `/manage/thimun-2027/participants?committee=…&invoice=unpaid&page=2`: everybody
 * sitting in a seat, with what they owe and whether their paper arrived.
 *
 * Every filter, the sort and the page travel in the address, for the same
 * reasons `manageApplicationsUrl` gives. `query` is left off by the sidebar,
 * which wants the plain list.
 */
export function manageParticipantsUrl(
	slug: string,
	query: ParticipantQuery = EMPTY_PARTICIPANT_QUERY
): ResolvedPathname {
	const search = participantQuerySearch(query);

	if (search) {
		return resolve(`/manage/[slug]/participants?${search}`, { slug });
	}

	return resolve('/manage/[slug]/participants', { slug });
}

/**
 * The participants list as a CSV, such as
 * `/manage/thimun-2027/participants/export?invoice=unpaid`.
 *
 * It carries the table's filters and sort but never its page, because the file
 * holds every participant the filters match rather than the fifty on screen.
 */
export function manageParticipantsExportUrl(
	slug: string,
	query: ParticipantQuery
): ResolvedPathname {
	const search = participantQuerySearch({ ...query, page: 1 });

	if (search) {
		return resolve(`/manage/[slug]/participants/export?${search}`, { slug });
	}

	return resolve('/manage/[slug]/participants/export', { slug });
}

/**
 * Where a button on the participants list posts to, such as
 * `/manage/thimun-2027/participants?invoice=unpaid&/removeFromSeat`.
 *
 * Built the way `manageApplicationsActionUrl` is and for the same reason: a
 * bare `?/removeFromSeat` would throw away the filters, and the page would come
 * back to the unfiltered list. It answers a plain `string` because a form
 * target is not a page anybody navigates to.
 */
export function manageParticipantsActionUrl(
	slug: string,
	query: ParticipantQuery,
	actionName: string
): string {
	const address = manageParticipantsUrl(slug, query);
	const separator = address.includes('?') ? '&' : '?';

	return `${address}${separator}/${actionName}`;
}

/** What the schedule editor shows besides the programme: a day, and which form is open. */
export type ScheduleEditorView = {
	/** The open day tab, `YYYY-MM-DD`. Left out, the page picks today or the first day. */
	day?: string;
	/** The event whose form is open, for `?edit=`. */
	editEventId?: string;
	/** Opens the empty "Add event" form, `?new=1`. */
	isAddingEvent?: boolean;
	/** Opens "Add committee sessions", `?sessions=1`. */
	isAddingSessions?: boolean;
	/** Shows the programme as a list rather than a calendar, `?view=list`. */
	isList?: boolean;
	/** The event whose details are open over the calendar, `?event=`. */
	openEventId?: string;
};

/**
 * The organiser's schedule editor, such as `/manage/thimun-2027/schedule?day=2027-01-26`.
 *
 * The open day and the open form both live in the address, so that every tab
 * and every "Edit" is a plain link and the back button closes a form again.
 */
export function manageScheduleUrl(slug: string, view: ScheduleEditorView = {}): ResolvedPathname {
	const parameters = new URLSearchParams();

	if (view.day) {
		parameters.set('day', view.day);
	}

	if (view.editEventId) {
		parameters.set('edit', view.editEventId);
	}

	if (view.isAddingEvent) {
		parameters.set('new', '1');
	}

	if (view.isAddingSessions) {
		parameters.set('sessions', '1');
	}

	if (view.isList) {
		parameters.set('view', 'list');
	}

	if (view.openEventId) {
		parameters.set('event', view.openEventId);
	}

	const search = parameters.toString();

	if (search) {
		return resolve(`/manage/[slug]/schedule?${search}`, { slug });
	}

	return resolve('/manage/[slug]/schedule', { slug });
}

/**
 * The top bar's "Schedule", `/schedule`. It has no schedule of its own: it sends
 * the reader on to the schedule of their current conference.
 */
export function myScheduleUrl(): ResolvedPathname {
	return resolve('/schedule');
}

/** What a conference's programme is asked to show: a day, the list, and one event's details. */
export type ConferenceScheduleView = {
	/** The day a phone shows, `YYYY-MM-DD`. Left out, the page picks today or the first day. */
	day?: string;
	/** Shows the programme as a list rather than a calendar, `?view=list`. */
	isList?: boolean;
	/** The event whose details are open over the calendar, `?event=`. */
	openEventId?: string;
};

/**
 * One conference's programme, such as `/conferences/thimun-2027/schedule?day=2027-01-26`.
 *
 * The day, the view and the open event all live in the address, so that each is
 * a plain link that works without JavaScript and the back button undoes it.
 */
export function conferenceScheduleUrl(
	slug: string,
	view: ConferenceScheduleView = {}
): ResolvedPathname {
	const parameters = new URLSearchParams();

	if (view.day) {
		parameters.set('day', view.day);
	}

	if (view.isList) {
		parameters.set('view', 'list');
	}

	if (view.openEventId) {
		parameters.set('event', view.openEventId);
	}

	const search = parameters.toString();

	if (search) {
		return resolve(`/conferences/[slug]/schedule?${search}`, { slug });
	}

	return resolve('/conferences/[slug]/schedule', { slug });
}

/**
 * The organiser's announcements page, such as `/manage/thimun-2027/announcements`.
 *
 * `editAnnouncementId` opens one announcement in the form, `?edit=<id>`, so
 * "Edit" in a row's menu is a plain link and the back button closes it again.
 */
export function manageAnnouncementsUrl(
	slug: string,
	editAnnouncementId?: string
): ResolvedPathname {
	if (editAnnouncementId) {
		return resolve(`/manage/[slug]/announcements?edit=${editAnnouncementId}`, { slug });
	}

	return resolve('/manage/[slug]/announcements', { slug });
}

/** What the delegate's announcements page is asked to show besides the list. */
export type AnnouncementsView = {
	/** The page of the list, counting from 1. */
	page?: number;
	/** Shows "That announcement was removed.", `?removed=1`. */
	isRemoved?: boolean;
};

/**
 * One conference's announcements for the people taking part, such as
 * `/conferences/thimun-2027/announcements?page=2`.
 *
 * `isRemoved` is what the notifications page adds when the announcement a
 * notification points at has since been deleted.
 */
export function conferenceAnnouncementsUrl(
	slug: string,
	view: AnnouncementsView = {}
): ResolvedPathname {
	const parameters = new URLSearchParams();

	if (view.page && view.page > 1) {
		parameters.set('page', String(view.page));
	}

	if (view.isRemoved) {
		parameters.set('removed', '1');
	}

	const search = parameters.toString();

	if (search) {
		return resolve(`/conferences/[slug]/announcements?${search}`, { slug });
	}

	return resolve('/conferences/[slug]/announcements', { slug });
}

/** Which part of the organiser's documents page is open, and what is chosen on it. */
export type DocumentsView = {
	/** The tab, `?tab=`. Leaving it out opens the resources. */
	tab?: 'resources' | 'guides' | 'papers';
	/** The committee whose seats the papers tab lists, `?committee=<id>`. */
	committeeId?: string | null;
	/** Only the seats whose paper has this status, `?paper=`. */
	paper?: string | null;
	/** The paper whose "Request changes" form is open, `?review=<document id>`. */
	reviewDocumentId?: string | null;
};

/**
 * The organiser's documents page, such as
 * `/manage/thimun-2027/documents?tab=papers&committee=<id>`.
 *
 * The tab, the chosen committee and the open "Request changes" form all live
 * in the address, so each of them is a plain link that works without
 * JavaScript and the back button goes back to the last one.
 */
export function manageDocumentsUrl(slug: string, view: DocumentsView = {}): ResolvedPathname {
	const parameters = new URLSearchParams();

	if (view.tab && view.tab !== 'resources') {
		parameters.set('tab', view.tab);
	}

	if (view.committeeId) {
		parameters.set('committee', view.committeeId);
	}

	if (view.paper) {
		parameters.set('paper', view.paper);
	}

	if (view.reviewDocumentId) {
		parameters.set('review', view.reviewDocumentId);
	}

	const search = parameters.toString();

	if (search) {
		return resolve(`/manage/[slug]/documents?${search}`, { slug });
	}

	return resolve('/manage/[slug]/documents', { slug });
}

/**
 * Where a form on the documents page posts to: the page's own address with the
 * action's name added to the end of the query string, the way
 * `manageApplicationsActionUrl` does it.
 *
 * A plain `?/requestChanges` would replace the whole query string, and a page
 * refused without JavaScript would then come back on the resources tab rather
 * than on the committee the organiser was reviewing.
 */
export function manageDocumentsActionUrl(
	slug: string,
	view: DocumentsView,
	actionName: string
): string {
	const address = manageDocumentsUrl(slug, view);
	const separator = address.includes('?') ? '&' : '?';

	return `${address}${separator}/${actionName}`;
}

/**
 * The organiser's awards page, such as `/manage/thimun-2027/awards`. With an
 * `editAwardId` that award's row shows its "Edit title" form, `?edit=<id>`,
 * so the form opens with a plain link that works without JavaScript.
 */
export function manageAwardsUrl(slug: string, editAwardId: string | null = null): ResolvedPathname {
	if (editAwardId === null) {
		return resolve('/manage/[slug]/awards', { slug });
	}

	return resolve(`/manage/[slug]/awards?edit=${encodeURIComponent(editAwardId)}`, { slug });
}

/**
 * Where an award's "Edit title" form posts to: `?edit=<id>&/updateTitle`, so a
 * refused title comes back with the same row's form still open.
 */
export function manageAwardTitleActionUrl(slug: string, awardId: string): string {
	return `${manageAwardsUrl(slug, awardId)}&/updateTitle`;
}

/**
 * One committee on the organiser's awards page, such as
 * `/manage/thimun-2027/awards?add=<committee id>#add-award-<committee id>`.
 * `isAddFormOpen` opens that committee's "Add award" form (`?add=<id>`) with a
 * plain link that works without JavaScript, and lands on the form itself
 * (`#add-award-<id>`, the `id` on `AddAwardForm`), so the next Tab reaches its
 * first field. Without it the link closes the form again and lands on the
 * committee's heading (`#awards-<id>`, the `id` in `AwardsCommitteeSection`)
 * rather than at the top of the page.
 */
export function manageAwardsCommitteeUrl(
	slug: string,
	committeeId: string,
	isAddFormOpen: boolean
): ResolvedPathname {
	const committee = encodeURIComponent(committeeId);

	if (!isAddFormOpen) {
		return resolve(`/manage/[slug]/awards#awards-${committee}`, { slug });
	}

	return resolve(`/manage/[slug]/awards?add=${committee}#add-award-${committee}`, { slug });
}

/**
 * The last step of setting a draft up, such as `/manage/thimun-2027/publish`:
 * what goes public, what is still worth doing, and the "Publish conference"
 * button (the manage redesign).
 */
export function managePublishUrl(slug: string): ResolvedPathname {
	return resolve('/manage/[slug]/publish', { slug });
}

/**
 * The page a conference lands on the moment it is published, such as
 * `/manage/thimun-2027/published`, with the link to share and the next steps.
 */
export function managePublishedUrl(slug: string): ResolvedPathname {
	return resolve('/manage/[slug]/published', { slug });
}

/**
 * Where one paper's own "Approve" button posts: the action address with the
 * paper's id after it, `…&/approvePaper&documentId=<id>`. The button sits
 * inside the "Approve selected" form, whose fields belong to every paper at
 * once, so the id of the one paper cannot be a field of its own.
 */
export function approvePaperActionUrl(
	slug: string,
	view: DocumentsView,
	documentId: string
): string {
	const parameters = new URLSearchParams({ documentId });

	return `${manageDocumentsActionUrl(slug, view, 'approvePaper')}&${parameters.toString()}`;
}

/**
 * Every file shared with the reader, `/resources`, or only one conference's
 * with `?conference=<slug>`.
 */
export function myResourcesUrl(conferenceSlug?: string): ResolvedPathname {
	if (conferenceSlug) {
		const parameters = new URLSearchParams({ conference: conferenceSlug });
		return resolve(`/resources?${parameters.toString()}`);
	}

	return resolve('/resources');
}

/**
 * The seated delegate's own position paper for one committee, such as
 * `/conferences/thimun-2027/committees/security-council/position-paper`.
 */
export function positionPaperUrl(conferenceSlug: string, committeeSlug: string): ResolvedPathname {
	return resolve('/conferences/[slug]/committees/[committeeSlug]/position-paper', {
		slug: conferenceSlug,
		committeeSlug
	});
}

/**
 * The position paper page opened on one way of handing the paper in (T145):
 * `?way=write` for "Write it here" or `?way=upload` for "Upload a PDF".
 * `isEditing` adds `edit=1`, which opens a submitted written paper in the
 * editor again, for "Edit and resubmit".
 */
export function positionPaperWayUrl(
	conferenceSlug: string,
	committeeSlug: string,
	way: PaperWay,
	isEditing = false
): ResolvedPathname {
	const parameters = new URLSearchParams({ way });

	if (isEditing) parameters.set('edit', '1');

	return resolve(
		`/conferences/[slug]/committees/[committeeSlug]/position-paper?${parameters.toString()}`,
		{ slug: conferenceSlug, committeeSlug }
	);
}

/**
 * The chair's committee room, such as
 * `/conferences/thimun-2027/committees/security-council/chair`, where a chair
 * runs the session: the mode, the speaker, the timer and every chair tool.
 */
export function chairRoomUrl(conferenceSlug: string, committeeSlug: string): ResolvedPathname {
	return resolve('/conferences/[slug]/committees/[committeeSlug]/chair', {
		slug: conferenceSlug,
		committeeSlug
	});
}

/**
 * The delegate live view of a committee room, such as
 * `/conferences/thimun-2027/committees/security-council/live`, where a
 * delegate follows the session from their phone.
 */
export function committeeLiveUrl(conferenceSlug: string, committeeSlug: string): ResolvedPathname {
	return resolve('/conferences/[slug]/committees/[committeeSlug]/live', {
		slug: conferenceSlug,
		committeeSlug
	});
}

/**
 * The papers a committee's delegates write together, such as
 * `/conferences/thimun-2027/committees/disec/resolutions`: its working papers,
 * draft resolutions and resolutions, or a crisis committee's directives.
 */
export function committeePapersUrl(
	conferenceSlug: string,
	committeeSlug: string
): ResolvedPathname {
	return resolve('/conferences/[slug]/committees/[committeeSlug]/resolutions', {
		slug: conferenceSlug,
		committeeSlug
	});
}

/** "Start a paper": the form at `…/committees/disec/resolutions/new`. */
export function newCommitteePaperUrl(
	conferenceSlug: string,
	committeeSlug: string
): ResolvedPathname {
	return resolve('/conferences/[slug]/committees/[committeeSlug]/resolutions/new', {
		slug: conferenceSlug,
		committeeSlug
	});
}

/** One committee paper, where its authors write it: `…/committees/disec/resolutions/<its id>`. */
export function committeePaperUrl(
	conferenceSlug: string,
	committeeSlug: string,
	paperId: string
): ResolvedPathname {
	return resolve('/conferences/[slug]/committees/[committeeSlug]/resolutions/[paperId]', {
		slug: conferenceSlug,
		committeeSlug,
		paperId
	});
}

/**
 * The dialogs a paper's page opens over itself: "Add an author", "Leave",
 * "Delete", "Submit to the dais" and "Withdraw".
 */
export type CommitteePaperDialog = 'add' | 'leave' | 'delete' | 'submit' | 'withdraw';

/**
 * A paper's page with one of its dialogs open over it, such as
 * `…/resolutions/<its id>?add=1`. The dialog is kept in the address so that
 * it opens without JavaScript and closes with the browser's back button.
 */
export function committeePaperDialogUrl(
	conferenceSlug: string,
	committeeSlug: string,
	paperId: string,
	dialog: CommitteePaperDialog
): ResolvedPathname {
	return resolve(
		`/conferences/[slug]/committees/[committeeSlug]/resolutions/[paperId]?${dialog}=1`,
		{ slug: conferenceSlug, committeeSlug, paperId }
	);
}

/**
 * The form that proposes an amendment to an introduced draft resolution,
 * such as `…/resolutions/<its id>/amendments/new` (`docs/committee-papers.md`,
 * step 7). With `parentId` it is the same form amending that amendment,
 * `…/amendments/new?amend=<its id>`.
 */
export function newAmendmentUrl(
	conferenceSlug: string,
	committeeSlug: string,
	paperId: string,
	parentId: string | null = null
): ResolvedPathname {
	const params = { slug: conferenceSlug, committeeSlug, paperId };

	return parentId === null
		? resolve(
				'/conferences/[slug]/committees/[committeeSlug]/resolutions/[paperId]/amendments/new',
				params
			)
		: resolve(
				`/conferences/[slug]/committees/[committeeSlug]/resolutions/[paperId]/amendments/new?amend=${parentId}`,
				params
			);
}

/**
 * A draft's page with the dialog that withdraws one of its amendments open,
 * such as `…/resolutions/<its id>?withdrawAmendment=3`, by the amendment's
 * number, so it opens without JavaScript.
 */
export function withdrawAmendmentUrl(
	conferenceSlug: string,
	committeeSlug: string,
	paperId: string,
	sequence: number
): ResolvedPathname {
	return resolve(
		`/conferences/[slug]/committees/[committeeSlug]/resolutions/[paperId]?withdrawAmendment=${sequence}`,
		{ slug: conferenceSlug, committeeSlug, paperId }
	);
}

/**
 * A draft resolution's page with one of the working papers it is based on
 * open beside its text: `…/resolutions/<its id>?source=<the working paper's id>`.
 * Which one is open lives in the address, so it opens without JavaScript and
 * a link to it opens the same paper.
 */
export function committeePaperSourceUrl(
	conferenceSlug: string,
	committeeSlug: string,
	paperId: string,
	sourceId: string
): ResolvedPathname {
	return resolve(
		`/conferences/[slug]/committees/[committeeSlug]/resolutions/[paperId]?source=${encodeURIComponent(sourceId)}`,
		{ slug: conferenceSlug, committeeSlug, paperId }
	);
}

/**
 * The crisis staff's page of a crisis committee, `…/committees/jcc/crisis`:
 * the directives and press releases waiting for their answer, and the room's
 * crisis update.
 */
export function crisisDeskUrl(conferenceSlug: string, committeeSlug: string): ResolvedPathname {
	return resolve('/conferences/[slug]/committees/[committeeSlug]/crisis', {
		slug: conferenceSlug,
		committeeSlug
	});
}

/** One directive or press release, where the crisis staff answer it: `…/crisis/<its id>`. */
export function crisisPaperUrl(
	conferenceSlug: string,
	committeeSlug: string,
	paperId: string
): ResolvedPathname {
	return resolve('/conferences/[slug]/committees/[committeeSlug]/crisis/[paperId]', {
		slug: conferenceSlug,
		committeeSlug,
		paperId
	});
}

/**
 * A paper's page with one of the reader's comments open for changing, at its
 * thread: `<the paper's page>?editComment=<comment id>#thread-<thread id>`.
 * Every page a paper is written on has a margin, so this starts from that
 * page's own address, which may already have a query of its own, as the
 * position paper page's `?way=write` does. The form lives in the address so
 * that it works without JavaScript.
 */
export function editCommentUrl(
	paperUrl: ResolvedPathname,
	commentId: string,
	threadId: string
): string {
	return `${withQuery(paperUrl, 'editComment', commentId)}#thread-${encodeURIComponent(threadId)}`;
}

/** A paper's page with "Delete this comment?" open over it: `<the paper's page>?deleteComment=<id>`. */
export function deleteCommentUrl(paperUrl: ResolvedPathname, commentId: string): string {
	return withQuery(paperUrl, 'deleteComment', commentId);
}

/** One more name and value on an address, after `?` or after the query it already has. */
function withQuery(url: string, name: string, value: string): string {
	const joiner = url.includes('?') ? '&' : '?';

	return `${url}${joiner}${name}=${encodeURIComponent(value)}`;
}

/**
 * "Run a quick session": `/quick/new`, where anybody signed in sets up one
 * committee and starts its session at once (`chair/quick-session.md`).
 */
export function newQuickSessionUrl(): ResolvedPathname {
	return resolve('/quick/new');
}

/**
 * "Edit delegations" of a quick session: `/quick/<conference slug>/delegations`.
 * The slug is the quick session's conference's, `quick-` and ten letters.
 */
export function quickSessionDelegationsUrl(conferenceSlug: string): ResolvedPathname {
	return resolve('/quick/[slug]/delegations', { slug: conferenceSlug });
}

/**
 * The projector's view of a committee room, such as
 * `/conferences/thimun-2027/committees/security-council/display`, which the
 * chair console's "Display" opens in a window of its own (`chair/display.md`).
 */
export function committeeDisplayUrl(
	conferenceSlug: string,
	committeeSlug: string
): ResolvedPathname {
	return resolve('/conferences/[slug]/committees/[committeeSlug]/display', {
		slug: conferenceSlug,
		committeeSlug
	});
}

/**
 * The chair's Roll call page, such as
 * `/conferences/thimun-2027/committees/security-council/chair/roll-call`.
 */
export function chairRollCallUrl(conferenceSlug: string, committeeSlug: string): ResolvedPathname {
	return resolve('/conferences/[slug]/committees/[committeeSlug]/chair/roll-call', {
		slug: conferenceSlug,
		committeeSlug
	});
}

/**
 * One of the Roll call page's actions, such as `…/chair/roll-call?/setStatus`,
 * which the Room page's opening card posts its roll call to (T167).
 */
export function chairRollCallAction(
	conferenceSlug: string,
	committeeSlug: string,
	actionName: 'setStatus' | 'markAllPresent'
): string {
	return `${chairRollCallUrl(conferenceSlug, committeeSlug)}?/${actionName}`;
}

/**
 * The Roll call page editing one roll call, which is where its actions send
 * the chair back to: `.../chair/roll-call?rollCall=<id>`. `seatId`, when
 * given, adds `&seat=<id>`, and the page puts the focus back on that seat's
 * row so the chair can go on down the list.
 */
export function chairRollCallDraftUrl(
	conferenceSlug: string,
	committeeSlug: string,
	rollCallId: string,
	seatId: string | null = null
): string {
	const query = new URLSearchParams({ rollCall: rollCallId });

	if (seatId !== null) query.set('seat', seatId);

	return `${chairRollCallUrl(conferenceSlug, committeeSlug)}?${query}`;
}

/**
 * The chair's Motions page, such as
 * `/conferences/thimun-2027/committees/security-council/chair/motions`, where
 * the chair writes down motions and puts them to the vote.
 */
export function chairMotionsUrl(conferenceSlug: string, committeeSlug: string): ResolvedPathname {
	return resolve('/conferences/[slug]/committees/[committeeSlug]/chair/motions', {
		slug: conferenceSlug,
		committeeSlug
	});
}

/**
 * The chair's Voting page, such as
 * `/conferences/thimun-2027/committees/security-council/chair/voting`, where
 * the chair opens a substantive vote, collects it and records the result.
 */
export function chairVotingUrl(conferenceSlug: string, committeeSlug: string): ResolvedPathname {
	return resolve('/conferences/[slug]/committees/[committeeSlug]/chair/voting', {
		slug: conferenceSlug,
		committeeSlug
	});
}

/**
 * The chair's Position papers page, such as
 * `/conferences/thimun-2027/committees/security-council/chair/papers`. With a
 * `status` it lists only the seats at that status, `?status=approved`, which
 * is how the filter is a plain link that works without JavaScript.
 */
export function chairPapersUrl(
	conferenceSlug: string,
	committeeSlug: string,
	status: string | null = null
): ResolvedPathname {
	if (status === null) {
		return resolve('/conferences/[slug]/committees/[committeeSlug]/chair/papers', {
			slug: conferenceSlug,
			committeeSlug
		});
	}

	return resolve(
		`/conferences/[slug]/committees/[committeeSlug]/chair/papers?status=${encodeURIComponent(status)}`,
		{ slug: conferenceSlug, committeeSlug }
	);
}

/**
 * The dais's Resolutions page, such as
 * `/conferences/thimun-2027/committees/disec/chair/resolutions`: the papers
 * the committee's delegates have submitted, approved and introduced
 * (`docs/committee-papers.md`, step 5).
 */
export function chairResolutionsUrl(
	conferenceSlug: string,
	committeeSlug: string
): ResolvedPathname {
	return resolve('/conferences/[slug]/committees/[committeeSlug]/chair/resolutions', {
		slug: conferenceSlug,
		committeeSlug
	});
}

/**
 * The dais's review of one paper, such as `…/chair/resolutions/<its id>`,
 * where the dais approves it, returns it to its authors or leaves notes on it.
 * The database's notifications link here too (`reply_to_thread`).
 */
export function chairResolutionUrl(
	conferenceSlug: string,
	committeeSlug: string,
	paperId: string
): ResolvedPathname {
	return resolve('/conferences/[slug]/committees/[committeeSlug]/chair/resolutions/[paperId]', {
		slug: conferenceSlug,
		committeeSlug,
		paperId
	});
}

/** The dialogs the review page opens over itself: "Return to the authors" and "Withdraw". */
export type ChairResolutionDialog = 'return' | 'withdraw';

/**
 * The review page with one of its dialogs open, such as
 * `…/chair/resolutions/<its id>?return=1`. Kept in the address, the dialog
 * opens without JavaScript and closes with the browser's back button.
 */
export function chairResolutionDialogUrl(
	conferenceSlug: string,
	committeeSlug: string,
	paperId: string,
	dialog: ChairResolutionDialog
): ResolvedPathname {
	return resolve(
		`/conferences/[slug]/committees/[committeeSlug]/chair/resolutions/[paperId]?${dialog}=1`,
		{ slug: conferenceSlug, committeeSlug, paperId }
	);
}

/**
 * The review page with the dialog that rules one amendment out of order
 * open, such as `…/chair/resolutions/<its id>?ruleOut=3`, by the amendment's
 * number, so it opens without JavaScript.
 */
export function ruleOutAmendmentUrl(
	conferenceSlug: string,
	committeeSlug: string,
	paperId: string,
	sequence: number
): ResolvedPathname {
	return resolve(
		`/conferences/[slug]/committees/[committeeSlug]/chair/resolutions/[paperId]?ruleOut=${sequence}`,
		{ slug: conferenceSlug, committeeSlug, paperId }
	);
}

/**
 * A draft's page at one amendment's card, such as
 * `…/resolutions/<its id>#amendment-3`. The `#amendment-3` is a plain HTML
 * anchor: the browser scrolls to the card whose `id` it is.
 */
export function paperAmendmentUrl(
	conferenceSlug: string,
	committeeSlug: string,
	paperId: string,
	sequence: number
): ResolvedPathname {
	return resolve(
		`/conferences/[slug]/committees/[committeeSlug]/resolutions/[paperId]#amendment-${sequence}`,
		{ slug: conferenceSlug, committeeSlug, paperId }
	);
}

/** The dais's review of a draft at one amendment's card: `…/chair/resolutions/<its id>#amendment-3`. */
export function chairAmendmentUrl(
	conferenceSlug: string,
	committeeSlug: string,
	paperId: string,
	sequence: number
): ResolvedPathname {
	return resolve(
		`/conferences/[slug]/committees/[committeeSlug]/chair/resolutions/[paperId]#amendment-${sequence}`,
		{ slug: conferenceSlug, committeeSlug, paperId }
	);
}

/** The dais's list of papers at its queue of amendments: `…/chair/resolutions#amendments`. */
export function chairAmendmentQueueUrl(
	conferenceSlug: string,
	committeeSlug: string
): ResolvedPathname {
	return resolve('/conferences/[slug]/committees/[committeeSlug]/chair/resolutions#amendments', {
		slug: conferenceSlug,
		committeeSlug
	});
}

/**
 * The chair's Notes page, such as
 * `/conferences/thimun-2027/committees/security-council/chair/notes`. With a
 * `seatId` it opens that seat's notes, `?seat=<id>`, which is what each row of
 * the seat column links to.
 */
export function chairNotesUrl(
	conferenceSlug: string,
	committeeSlug: string,
	seatId: string | null = null
): ResolvedPathname {
	if (seatId === null) {
		return resolve('/conferences/[slug]/committees/[committeeSlug]/chair/notes', {
			slug: conferenceSlug,
			committeeSlug
		});
	}

	return resolve(
		`/conferences/[slug]/committees/[committeeSlug]/chair/notes?seat=${encodeURIComponent(seatId)}`,
		{ slug: conferenceSlug, committeeSlug }
	);
}

/**
 * One session's running notes under the chair's Notes page (T130), such as
 * `/conferences/thimun-2027/committees/security-council/chair/notes/sessions/<id>`.
 * They stay there after the session has ended.
 */
export function chairSessionNotesUrl(
	conferenceSlug: string,
	committeeSlug: string,
	sessionId: string
): ResolvedPathname {
	return resolve(
		'/conferences/[slug]/committees/[committeeSlug]/chair/notes/sessions/[sessionId]',
		{
			slug: conferenceSlug,
			committeeSlug,
			sessionId
		}
	);
}

/**
 * Where the notes page sends the chair after adding a note: the seat's notes
 * with `&added=1` after them, which tells the page to put the cursor back in
 * the note box so the next note can be typed straight away.
 */
export function chairNoteAddedUrl(
	conferenceSlug: string,
	committeeSlug: string,
	seatId: string
): string {
	return `${chairNotesUrl(conferenceSlug, committeeSlug, seatId)}&added=1`;
}

/**
 * Where a form on the notes page posts to: the seat's address with the
 * action's name added to the end, `?seat=<id>&/add`. A plain `?/add` would
 * replace the whole query string, and a note refused without JavaScript would
 * then come back on another seat.
 */
export function chairNotesActionUrl(
	conferenceSlug: string,
	committeeSlug: string,
	seatId: string,
	actionName: string
): string {
	return `${chairNotesUrl(conferenceSlug, committeeSlug, seatId)}&/${actionName}`;
}

/**
 * The chair's Awards page, such as
 * `/conferences/thimun-2027/committees/security-council/chair/awards`. With an
 * `editAwardId` the proposal form at the top holds that award for editing,
 * `?edit=<id>`, which is how "Edit" is a plain link that works without
 * JavaScript.
 */
export function chairAwardsUrl(
	conferenceSlug: string,
	committeeSlug: string,
	editAwardId: string | null = null
): ResolvedPathname {
	if (editAwardId === null) {
		return resolve('/conferences/[slug]/committees/[committeeSlug]/chair/awards', {
			slug: conferenceSlug,
			committeeSlug
		});
	}

	return resolve(
		`/conferences/[slug]/committees/[committeeSlug]/chair/awards?edit=${encodeURIComponent(editAwardId)}`,
		{ slug: conferenceSlug, committeeSlug }
	);
}

/**
 * Where the chair's proposal form posts to while it edits an award:
 * `?edit=<id>&/update`. A refusal without JavaScript then comes back with the
 * same award still open in the form.
 */
export function chairAwardUpdateActionUrl(
	conferenceSlug: string,
	committeeSlug: string,
	awardId: string
): string {
	return `${chairAwardsUrl(conferenceSlug, committeeSlug, awardId)}&/update`;
}

/**
 * The reading page of one position paper written on MUNMeet (T146), by the
 * seat it belongs to, such as
 * `/conferences/thimun-2027/committees/unsc/chair/papers/<seat id>`.
 */
export function chairPaperReadingUrl(
	conferenceSlug: string,
	committeeSlug: string,
	seatId: string
): ResolvedPathname {
	return resolve('/conferences/[slug]/committees/[committeeSlug]/chair/papers/[seatId]', {
		slug: conferenceSlug,
		committeeSlug,
		seatId
	});
}

/** Where a review form on the reading page posts to, such as `…/papers/<seat id>?/approve`. */
export function chairPaperReadingActionUrl(
	conferenceSlug: string,
	committeeSlug: string,
	seatId: string,
	actionName: string
): string {
	return `${chairPaperReadingUrl(conferenceSlug, committeeSlug, seatId)}?/${actionName}`;
}

/**
 * Where a form on the papers page posts to: the page's address, with its
 * status filter when there is one, and the action's name at the end, such as
 * `?status=submitted&/approve`. A refusal without JavaScript then comes back
 * on the same filter.
 */
export function chairPapersActionUrl(
	conferenceSlug: string,
	committeeSlug: string,
	status: string | null,
	actionName: string
): string {
	const address = chairPapersUrl(conferenceSlug, committeeSlug, status);
	const separator = address.includes('?') ? '&' : '?';

	return `${address}${separator}/${actionName}`;
}

/**
 * The Voting page after the chair pressed a button in one seat's row of a roll
 * call vote: `.../chair/voting?seat=<id>`. The page puts the focus back on that
 * seat's row, so the chair can go on down the list.
 */
export function chairVotingSeatUrl(
	conferenceSlug: string,
	committeeSlug: string,
	seatId: string
): string {
	const query = new URLSearchParams({ seat: seatId });

	return `${chairVotingUrl(conferenceSlug, committeeSlug)}?${query}`;
}

/**
 * The Motions page showing an ended session's motions, read-only:
 * `.../chair/motions?session=<id>`.
 */
export function chairMotionsSessionUrl(
	conferenceSlug: string,
	committeeSlug: string,
	sessionId: string
): ResolvedPathname {
	return resolve(
		`/conferences/[slug]/committees/[committeeSlug]/chair/motions?session=${encodeURIComponent(sessionId)}`,
		{ slug: conferenceSlug, committeeSlug }
	);
}

/**
 * The Motions view with one motion put to the vote out of order,
 * `.../chair/motions?motion=<id>`: "Vote on this now" in a further motion's
 * menu, a plain link so it works without JavaScript (`motions.md`).
 */
export function chairMotionsMotionUrl(
	conferenceSlug: string,
	committeeSlug: string,
	motionId: string
): ResolvedPathname {
	return resolve(
		`/conferences/[slug]/committees/[committeeSlug]/chair/motions?motion=${encodeURIComponent(motionId)}`,
		{ slug: conferenceSlug, committeeSlug }
	);
}

/**
 * The Motions view's `restore` action, `.../chair/motions?/restore`. The
 * toast's "Undo" posts to it from whichever chair page the toast is on, so it
 * cannot be the page's own `?/restore`. On the server `resolve()` writes it
 * relative to the request being answered, so an action reads it against
 * `event.url` to write it from the site's root.
 */
export function chairMotionsRestoreAction(conferenceSlug: string, committeeSlug: string): string {
	return `${chairMotionsUrl(conferenceSlug, committeeSlug)}?/restore`;
}

/**
 * A page that draws the Vote view (`chair/voting`, or `chair` while the room
 * votes) with one question of the view asked in its address: `vote=new` draws
 * the set-up while a closed vote's result is on show ("Open another vote"),
 * and `cancel=confirm` asks Cancel vote's question, both without JavaScript.
 */
export function chairVoteViewUrl(
	conferenceSlug: string,
	committeeSlug: string,
	page: 'chair' | 'voting',
	question: 'vote=new' | 'cancel=confirm'
): ResolvedPathname {
	const params = { slug: conferenceSlug, committeeSlug };

	if (page === 'chair') {
		return resolve(`/conferences/[slug]/committees/[committeeSlug]/chair?${question}`, params);
	}

	return resolve(`/conferences/[slug]/committees/[committeeSlug]/chair/voting?${question}`, params);
}

/**
 * The chair's GSL view, such as
 * `/conferences/thimun-2027/committees/security-council/chair/gsl`: the
 * General Speakers' List, its floor and its queue (`05-pages/chair/gsl.md`).
 */
export function chairGslUrl(conferenceSlug: string, committeeSlug: string): ResolvedPathname {
	return resolve('/conferences/[slug]/committees/[committeeSlug]/chair/gsl', {
		slug: conferenceSlug,
		committeeSlug
	});
}

/**
 * The chair's Mod view, `…/chair/mod`: a moderated caucus's start form, or
 * the running caucus (`05-pages/chair/mod.md`).
 */
export function chairModUrl(conferenceSlug: string, committeeSlug: string): ResolvedPathname {
	return resolve('/conferences/[slug]/committees/[committeeSlug]/chair/mod', {
		slug: conferenceSlug,
		committeeSlug
	});
}

/**
 * The chair's Unmod view, `…/chair/unmod`: an unmoderated caucus's start
 * form, or the running caucus (`05-pages/chair/unmod.md`).
 */
export function chairUnmodUrl(conferenceSlug: string, committeeSlug: string): ResolvedPathname {
	return resolve('/conferences/[slug]/committees/[committeeSlug]/chair/unmod', {
		slug: conferenceSlug,
		committeeSlug
	});
}

/**
 * The chair's Single speaker view, `…/chair/single`: "Give one speaker the
 * floor", or the single speaker who has it (`05-pages/chair/single-speaker.md`).
 */
export function chairSingleUrl(conferenceSlug: string, committeeSlug: string): ResolvedPathname {
	return resolve('/conferences/[slug]/committees/[committeeSlug]/chair/single', {
		slug: conferenceSlug,
		committeeSlug
	});
}

/**
 * The address of one chair page, by the name the console gives it
 * (`ChairPage` in `$lib/live-mode.ts`): `chair` is the live room, the views
 * and the pages inside the frame each their own route. The mode bar's tabs
 * link here, and the frame's actions send the chair back here.
 */
export function chairPageUrl(
	conferenceSlug: string,
	committeeSlug: string,
	page: ChairPage
): ResolvedPathname {
	switch (page) {
		case 'gsl':
			return chairGslUrl(conferenceSlug, committeeSlug);
		case 'motions':
			return chairMotionsUrl(conferenceSlug, committeeSlug);
		case 'mod':
			return chairModUrl(conferenceSlug, committeeSlug);
		case 'unmod':
			return chairUnmodUrl(conferenceSlug, committeeSlug);
		case 'single':
			return chairSingleUrl(conferenceSlug, committeeSlug);
		case 'voting':
			return chairVotingUrl(conferenceSlug, committeeSlug);
		case 'roll-call':
			return chairRollCallUrl(conferenceSlug, committeeSlug);
		case 'papers':
			return chairPapersUrl(conferenceSlug, committeeSlug);
		case 'resolutions':
			return chairResolutionsUrl(conferenceSlug, committeeSlug);
		case 'notes':
			return chairNotesUrl(conferenceSlug, committeeSlug);
		case 'awards':
			return chairAwardsUrl(conferenceSlug, committeeSlug);
		default:
			return chairRoomUrl(conferenceSlug, committeeSlug);
	}
}

/**
 * One of the live room's actions as the console's frame posts it from any
 * chair page: the agenda menu, Suspend, End and the live strip's buttons,
 * such as `…/chair?fromView=motions&/timerPause`.
 *
 * `fromView` names the page the chair pressed it on, so an action that does
 * not change what the room is doing sends them back there
 * (`05-pages/chair/committee-room.md`, "Actions and forms"). It travels in the
 * address rather than in a hidden field because the floor's shared actions
 * (`floorActions`) see only the request's address when they work out where to
 * send the chair. Pressed on `chair` itself, the address is the plain
 * `…/chair?/timerPause`.
 */
export function chairFrameAction(
	conferenceSlug: string,
	committeeSlug: string,
	actionName: string,
	fromView: ChairPage
): string {
	const room = chairRoomUrl(conferenceSlug, committeeSlug);

	if (fromView === 'chair') return `${room}?/${actionName}`;

	const query = new URLSearchParams({ [FROM_VIEW_FIELD]: fromView });

	return `${room}?${query}&/${actionName}`;
}

/**
 * The roll call view, naming the page it was opened from so its "Return to
 * the floor" can go back there: `…/chair/roll-call?from=gsl`. Opened from the
 * live room it is the plain roll call page, whose return leads to `chair`.
 */
export function chairRollCallFromUrl(
	conferenceSlug: string,
	committeeSlug: string,
	fromView: ChairPage
): ResolvedPathname {
	if (fromView === 'chair') return chairRollCallUrl(conferenceSlug, committeeSlug);

	return resolve(
		`/conferences/[slug]/committees/[committeeSlug]/chair/roll-call?from=${encodeURIComponent(fromView)}`,
		{ slug: conferenceSlug, committeeSlug }
	);
}

/** Which roll call the view shows, which row its focus marker is on, and where it was opened from. */
export type RollCallViewAddress = {
	/** The roll call being edited, or null for the session's latest. */
	rollCallId: string | null;
	/** The seat whose row gets the focus marker and the focus, or null for the first row. */
	seatId: string | null;
	/** The page "Return to the floor" goes back to; `chair` names none. */
	from: ChairPage;
};

/**
 * The roll call view, such as `…/chair/roll-call?rollCall=<id>&seat=<id>&from=gsl`:
 * where its own presses send the chair back to, keeping the page it was
 * opened from (`chair/roll-call.md`, "Data").
 */
export function rollCallViewUrl(
	conferenceSlug: string,
	committeeSlug: string,
	address: RollCallViewAddress
): string {
	const query = new URLSearchParams();

	if (address.rollCallId !== null) query.set('rollCall', address.rollCallId);
	if (address.seatId !== null) query.set('seat', address.seatId);
	if (address.from !== 'chair') query.set('from', address.from);

	const base = chairRollCallUrl(conferenceSlug, committeeSlug);

	return query.size === 0 ? base : `${base}?${query}`;
}

/**
 * The page being shown with one query parameter set, or taken away when
 * `value` is null, everything else in its address kept. The console's frame
 * opens End's confirmation (`?end=confirm`) and the agenda menu
 * (`?agenda=change`) this way without JavaScript, on whichever chair page the
 * chair is on.
 */
export function pageWithQuery(url: URL, name: string, value: string | null): string {
	const query = new URLSearchParams(url.search);

	if (value === null) query.delete(name);
	else query.set(name, value);

	const search = query.size === 0 ? '' : `?${query}`;

	return `${url.pathname}${search}`;
}

/**
 * One organisation's settings, such as
 * `/manage/organizations/sample-europe-mun-network`, where its details, its
 * members and its Stripe connection are kept.
 *
 * It sits under `/manage/organizations/` rather than under `/manage/[slug]/`
 * because an organisation is above its conferences: the same page serves all of
 * them, and an organisation may have none yet. Six places link here — the
 * organiser area's index, the public organisation page, the conference team
 * page, `/settings`, the dashboard's "Connect Stripe" checklist item and the
 * invitation an organiser accepts — which is why the address is written once.
 */
export function organizationSettingsUrl(orgSlug: string): ResolvedPathname {
	return resolve('/manage/organizations/[orgSlug]', { orgSlug });
}

/**
 * Where Stripe sends somebody back to once they have finished, or abandoned,
 * the Connect onboarding form: `/api/stripe/connect/return?org=<slug>`.
 *
 * It is an endpoint rather than a page (`+server.ts`), and `resolve()` accepts
 * one as readily as a page. The organisation travels in the address because
 * Stripe hands the browser back with nothing of ours attached to it.
 *
 * `02-architecture/payments.md` calls this the `return_url`. Stripe needs the
 * whole address rather than a path, so the caller writes `url.origin` in front
 * of what this gives back, the way the team page's `inviteLink` does.
 */
export function stripeConnectReturnUrl(orgSlug: string): ResolvedPathname {
	return resolve(`/api/stripe/connect/return?org=${encodeURIComponent(orgSlug)}`);
}

/**
 * Where Stripe sends somebody when the onboarding link has gone stale:
 * `/api/stripe/connect/refresh?org=<slug>`. Its endpoint makes a fresh link and
 * sends them straight back to Stripe. `payments.md` calls it the `refresh_url`.
 */
export function stripeConnectRefreshUrl(orgSlug: string): ResolvedPathname {
	return resolve(`/api/stripe/connect/refresh?org=${encodeURIComponent(orgSlug)}`);
}

/**
 * The page that accepts one invitation, such as
 * `/invites/mV7Qx2LpR8nK3sDf6TgYb1WcZ4hJ0eAu`.
 *
 * The token is the secret: anybody holding it may look the invitation up, and
 * only somebody signed in with the invited address may accept it. It is never
 * logged, which is why nothing here writes it anywhere but the address.
 */
export function inviteUrl(token: string): ResolvedPathname {
	return resolve('/invites/[token]', { token });
}

/**
 * The sign in page.
 *
 * `next` is the page the visitor was trying to reach. Signing in sends them
 * back to it, so a link from a bookmark does not dump them on the home page.
 *
 * `safeRedirectPath` is the same check the sign in page uses when it reads the
 * parameter back, and it is called here rather than written out a second time:
 * one place that decides what counts as a safe address is one place to fix.
 * It answers `/` for anything pointing at another website, and the front page
 * is where a visitor lands anyway, so that case leaves the parameter off.
 */
export function loginUrl(next: string = ''): ResolvedPathname {
	const safeNext = safeRedirectPath(next);

	if (safeNext === '/') {
		return resolve('/login');
	}

	return resolve(`/login?next=${encodeURIComponent(safeNext)}`);
}

/**
 * A link for a reader who may not be signed in: the page itself when they are,
 * and the create account page carrying that address when they are not, so that
 * the new account lands where they were heading rather than on the front page.
 *
 * The conference page's "Apply as a delegate" and "Register a delegation"
 * buttons are both built with it, which is the "signed out and accepting" row
 * of `05-pages/public/conference.md`. It sends a signed-out reader to sign up
 * rather than to sign in because somebody pressing "Apply" with no session is
 * more often new than returning (streamlining, T158). A returning reader
 * follows the create account page's "Log in", which keeps the same `next`.
 *
 * `registerUrl` wants a plain absolute path while `applyUrl` and its like give
 * a `ResolvedPathname`, and the two are not the same thing: `resolve()` answers
 * a *relative* address while a page is being built on the server.
 * `absolutePath` below turns one into the other, and its own doc comment
 * explains that trap in full. `currentPathname` is the address of the page the
 * link is written on, which is what a relative address is relative to.
 */
export function pathThroughRegister(
	path: ResolvedPathname,
	currentPathname: string,
	isSignedIn: boolean
): ResolvedPathname {
	if (isSignedIn) {
		return path;
	}

	return registerUrl(absolutePath(path, currentPathname));
}

/**
 * The sign in page, told that the visitor has just confirmed their address.
 *
 * `/auth/confirm` sends people here when the link worked but left them without
 * a session, which is what an email change link does for somebody who was not
 * signed in. The page turns the parameter into a line of good news.
 */
export function loginConfirmedUrl(): ResolvedPathname {
	return resolve('/login?message=confirmed');
}

/**
 * The create account page.
 *
 * `next` works exactly as it does in `loginUrl` above: the page the visitor was
 * trying to reach travels with the link, so the "Create an account" link on the
 * sign in page does not lose it.
 */
export function registerUrl(next: string = ''): ResolvedPathname {
	const safeNext = safeRedirectPath(next);

	if (safeNext === '/') {
		return resolve('/register');
	}

	return resolve(`/register?next=${encodeURIComponent(safeNext)}`);
}

/** The page whose form ends the session. */
export function logoutUrl(): ResolvedPathname {
	return resolve('/logout');
}

/**
 * The notifications page, `/notifications`.
 *
 * `page` counts from 1, and page 1 is left off the address so that the plain
 * `/notifications` is what the bell and the top bar link to.
 */
export function notificationsUrl(page: number = 1): ResolvedPathname {
	if (page > 1) {
		return resolve(`/notifications?page=${page}`);
	}

	return resolve('/notifications');
}

/**
 * The page that sends a password reset email.
 *
 * `next` works exactly as it does in `loginUrl` above, so somebody who came to
 * the sign in page on their way somewhere still gets there after choosing a new
 * password.
 */
export function forgotPasswordUrl(next: string = ''): ResolvedPathname {
	const safeNext = safeRedirectPath(next);

	if (safeNext === '/') {
		return resolve('/forgot-password');
	}

	return resolve(`/forgot-password?next=${encodeURIComponent(safeNext)}`);
}

/** The page the reset link opens, where a new password is chosen. */
export function resetPasswordUrl(): ResolvedPathname {
	return resolve('/reset-password');
}

/**
 * The page that explains why a link from one of our emails did not work.
 *
 * The reason is a word from `AUTH_ERROR_REASONS`, and the page turns it into a
 * sentence.
 */
export function authErrorUrl(reason: AuthErrorReason): ResolvedPathname {
	return resolve(`/auth/error?reason=${reason}`);
}

/**
 * Where somebody lands once they are signed in and have nowhere more
 * particular to go: `/home`, the signed-in dashboard.
 *
 * It is safe to send a brand-new account here as well. `/home` asks for a
 * finished profile, so anybody who has not answered the welcome questions yet
 * is sent on from there to `/welcome`, and back to `/home` once they have.
 */
export function signedInHomeUrl(showAll?: 'conferences' | 'quick'): ResolvedPathname {
	// `?all=conferences` or `?all=quick` lifts the limit on that section's rows:
	// the "Show all" links at the foot of "Also coming up" and "Quick sessions".
	if (showAll === undefined) {
		return resolve('/home');
	}
	return resolve(`/home?all=${showAll}`);
}

/**
 * The reader's own list of applications and delegation memberships,
 * `/applications`, showing this search, tab and order.
 *
 * Values that are already the default are left out, so the address stays short:
 * `/applications?show=accepted` rather than `/applications?q=&show=accepted&sort=recent`.
 * With nothing chosen this is the plain `/applications`.
 *
 * The conferences that are over sit under the "Past" tab, `?show=past`. The
 * page once showed them with `?past=1`, as `myCommitteesUrl` below still does;
 * the applications mockup replaced that link with the tab (30 Sep 2026).
 */
export function myApplicationsUrl(
	query: MyApplicationsQuery = EMPTY_MY_APPLICATIONS_QUERY
): ResolvedPathname {
	const parameters = new URLSearchParams();

	if (query.q) parameters.set('q', query.q);
	if (query.tab !== 'all') parameters.set('show', query.tab);
	if (query.sort !== 'recent') parameters.set('sort', query.sort);

	const search = parameters.toString();

	return resolve(search ? `/applications?${search}` : '/applications');
}

/**
 * The reader's own committee list, `/committees`, or `/committees?past=1` when
 * the committees of finished conferences are wanted too.
 *
 * Showing only the conferences that are still to come is the default, so that
 * address is the plain one, the way `notificationsUrl` above leaves page 1 off.
 */
export function myCommitteesUrl(includesPast: boolean = false): ResolvedPathname {
	if (includesPast) {
		return resolve('/committees?past=1');
	}

	return resolve('/committees');
}

/**
 * The welcome page, the few questions a new account answers before it can do
 * anything else. It is where the confirmation link in the sign up email lands.
 *
 * `next` is the page the person was heading for when the onboarding gate caught
 * them, and the welcome form sends them on to it once it is saved. It works
 * exactly as it does in `loginUrl` above, including the `safeRedirectPath`
 * check, so an invite or apply link survives onboarding.
 */
export function welcomeUrl(next: string = ''): ResolvedPathname {
	const safeNext = safeRedirectPath(next);

	if (safeNext === '/') {
		return resolve('/welcome');
	}

	return resolve(`/welcome?next=${encodeURIComponent(safeNext)}`);
}

/** The signed-in person's own profile, `/profile`, as everybody else sees it. */
export function profileUrl(): ResolvedPathname {
	return resolve('/profile');
}

/** Somebody's public profile, `/people/[userId]`, which any signed-in reader can open. */
export function personUrl(userId: string): ResolvedPathname {
	return resolve('/people/[userId]', { userId });
}

/** The form where the signed-in person changes their own profile, `/profile/edit`. */
export function profileEditUrl(): ResolvedPathname {
	return resolve('/profile/edit');
}

/**
 * Where somebody already signed in goes to change their email or password, or
 * to delete their account.
 */
export function accountSettingsUrl(): ResolvedPathname {
	return resolve('/settings');
}

/**
 * The styleguide page, `/styleguide`.
 *
 * `view` carries the sample table's sort and page, and the seat list's chosen
 * seat, because `DataTable`, `Pagination` and `SeatList` are given real links
 * rather than buttons: that is how they work
 * on a page with no JavaScript, and the styleguide has to show them as they
 * really are. Nothing on the styleguide reads these back; the page always
 * renders the same samples.
 *
 * Values that are already the default are left out, so the address stays short.
 */
export function styleguideUrl(view: StyleguideView = {}): ResolvedPathname {
	const parameters = new URLSearchParams();

	if (view.sort) parameters.set('sort', view.sort);
	if (view.direction && view.direction !== 'asc') parameters.set('direction', view.direction);
	if (view.page && view.page > 1) parameters.set('page', String(view.page));
	if (view.seat) parameters.set('seat', view.seat);

	const search = parameters.toString();

	return resolve(search ? `/styleguide?${search}` : '/styleguide');
}

/** The "for organisers" marketing page, `/for-organisers`. */
export function forOrganisersUrl(): ResolvedPathname {
	return resolve('/for-organisers');
}

/** The terms of service, `/terms`. */
export function termsUrl(): ResolvedPathname {
	return resolve('/terms');
}

/** The privacy policy, `/privacy`. */
export function privacyUrl(): ResolvedPathname {
	return resolve('/privacy');
}

/**
 * Where a marketing page's "Create a conference" button goes: straight to the
 * form for somebody signed in, and through sign up for everybody else, so they
 * land on the form once the account exists.
 */
export function startConferenceUrl(isSignedIn: boolean): ResolvedPathname {
	if (isSignedIn) {
		return createConferenceUrl();
	}

	return registerUrl('/create');
}

/** The address people write to us at (open question 11). */
export const CONTACT_EMAIL = 'hello@munmeet.app';

/**
 * A `mailto:` link for `CONTACT_EMAIL`. It is the one address in this file that
 * is not a route of our own, so it is a plain string rather than a
 * `ResolvedPathname`: `resolve()` only knows about the folders under `src/routes/`.
 */
export function contactEmailUrl(): string {
	return `mailto:${CONTACT_EMAIL}`;
}

/**
 * The absolute path a link points at, whichever form the link was written in.
 *
 * `resolve()` answers a *relative* address while a page is being built on the
 * server, so that a build can be served from any folder: on
 * `/conferences/amsterdammun-2027` the top bar's "Conferences" link comes out
 * as `../conferences` rather than `/conferences`. Once the browser takes over
 * it is absolute again, which is why the difference is easy to miss.
 *
 * So anything that compares a link with the address the reader asked for has to
 * resolve it first, or it will never match on a page that arrives from the
 * server. Handing both to `URL` settles it: a relative address resolved against
 * the page it was written on gives the absolute path it meant, and an address
 * that is already absolute comes back unchanged.
 *
 * `currentPathname` is the address of the page the link was written on, which
 * is what a relative address is relative to. The host name is a throwaway,
 * because only the path is read back out.
 */
export function absolutePath(href: string, currentPathname: string): string {
	return new URL(href, `http://localhost${currentPathname}`).pathname;
}

/** A passed paper's record copy, laid out for paper: `…/resolutions/<its id>/print`. */
export function committeePaperPrintUrl(
	conferenceSlug: string,
	committeeSlug: string,
	paperId: string
): ResolvedPathname {
	return resolve('/conferences/[slug]/committees/[committeeSlug]/resolutions/[paperId]/print', {
		slug: conferenceSlug,
		committeeSlug,
		paperId
	});
}
