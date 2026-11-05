/**
 * How `/manage` lays its conferences out (artboard Main of the manage
 * redesign): a band for each conference in session today, then one section per
 * organisation listing what is coming up, soonest first. What has ended waits
 * behind a "Past and archived (n)" link, which shows the same page with
 * `?show=past` in the address.
 *
 * Under the list come the conferences the reader helps with as staff, and at
 * the foot of the page one line per organisation says what the reader is in
 * it and whether it can take fees by card.
 *
 * The rows themselves are `$lib/manage-list-row.ts`. Nothing here talks to
 * Supabase or knows any Svelte.
 */

import type { ResolvedPathname } from '$app/types';
import { resolve } from '$app/paths';
import type { Conference } from '$lib/conferences';
import { conferencePhase } from '$lib/conference-phase';
import { formatDateRange } from '$lib/dates';
import {
	staffConferenceHref,
	type ManagedConferenceSummary,
	type OrganizationGroupData,
	type OrganizationRole,
	type StaffConference
} from '$lib/manage';
import { conferenceDayOfDays } from '$lib/manage-list-dates';
import { conferenceListRow, type ConferenceListRow } from '$lib/manage-list-row';
import { numberInWords } from '$lib/number-words';
import { isOrganizationAdmin } from '$lib/organizations';
import { manageConferenceUrl, organizationSettingsUrl } from '$lib/urls';

/** Which conferences the list shows: what is coming up, or what has ended. */
export type ManageListView = 'upcoming' | 'past';

/** The address parameter that holds the view, as in `/manage?show=past`. */
const VIEW_PARAMETER = 'show';

/** Which view an address asks for. Anything but `?show=past` is the usual one. */
export function readManageListView(url: URL): ManageListView {
	return url.searchParams.get(VIEW_PARAMETER) === 'past' ? 'past' : 'upcoming';
}

/** The address of one view: `/manage`, or `/manage?show=past`. */
export function manageListViewUrl(view: ManageListView): ResolvedPathname {
	// `resolve()` from `$app/paths` builds an internal address and checks that
	// the route exists. The query is part of the text it is given.
	if (view === 'past') {
		return resolve(`/manage?${VIEW_PARAMETER}=past`);
	}

	return resolve('/manage');
}

/** One organisation's conferences, sorted into the three places the page puts them. */
export type SplitConferences = {
	/** Running today: each gets a band at the top. */
	inSession: ManagedConferenceSummary[];
	/** Drafts and conferences still ahead, soonest first. */
	comingUp: ManagedConferenceSummary[];
	/** Ended or archived, most recent first. */
	past: ManagedConferenceSummary[];
};

/** Earliest first day first. Days are `YYYY-MM-DD`, so comparing the text compares the dates. */
function bySoonestStart(first: ManagedConferenceSummary, second: ManagedConferenceSummary): number {
	return first.conference.startDate.localeCompare(second.conference.startDate);
}

/** Sort conferences into in session, coming up and past, by the phase each is in at `now`. */
export function splitConferences(
	summaries: ManagedConferenceSummary[],
	now: Date
): SplitConferences {
	const split: SplitConferences = { inSession: [], comingUp: [], past: [] };

	for (const summary of summaries) {
		const phase = conferencePhase(summary.conference, now);

		// The band at the top leads into the management area, so a conference the
		// reader is not on the team of stays in the list, named without a link.
		if (phase === 'conference-days' && summary.isOnTeam) {
			split.inSession.push(summary);
		} else if (phase === 'after') {
			split.past.push(summary);
		} else {
			split.comingUp.push(summary);
		}
	}

	split.inSession.sort(bySoonestStart);
	split.comingUp.sort(bySoonestStart);
	split.past.sort((first, second) => bySoonestStart(second, first));

	return split;
}

/**
 * The line under the page title: "One in session today, two coming up, one
 * taking shape." A draft is "taking shape"; a published conference that has
 * not begun is "coming up".
 */
export function manageListSummary(organizations: OrganizationGroupData[], now: Date): string {
	let inSessionCount = 0;
	let comingUpCount = 0;
	let draftCount = 0;

	for (const group of organizations) {
		const split = splitConferences(group.conferences, now);
		const drafts = split.comingUp.filter((summary) => summary.conference.status === 'draft');

		inSessionCount += split.inSession.length;
		draftCount += drafts.length;
		comingUpCount += split.comingUp.length - drafts.length;
	}

	const parts: string[] = [];

	if (inSessionCount > 0) parts.push(`${numberInWords(inSessionCount)} in session today`);
	if (comingUpCount > 0) parts.push(`${numberInWords(comingUpCount)} coming up`);
	if (draftCount > 0) parts.push(`${numberInWords(draftCount)} taking shape`);

	if (parts.length === 0) {
		return 'Nothing coming up yet.';
	}

	const sentence = parts.join(', ');

	return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

/** The band of one conference in session today. */
export type InSessionBand = {
	id: string;
	/** "In session now · day 1 of 3". */
	statusLine: string;
	name: string;
	/** "Manchester · Northbridge MUN Society". */
	place: string;
	href: ResolvedPathname;
};

/** The band at the top of the page for a conference running today. */
export function inSessionBand(conference: Conference, now: Date): InSessionBand {
	const placeParts = [conference.city ?? '', conference.organizationName ?? ''];

	return {
		id: conference.id,
		statusLine: `In session now · ${conferenceDayOfDays(conference, now)}`,
		name: conference.name,
		place: placeParts.filter((part) => part !== '').join(' · '),
		href: manageConferenceUrl(conference.slug)
	};
}

/** One organisation's section of the list, ready to draw. */
export type ConferenceListSection = {
	/** The organisation's id, which keys the section. */
	id: string;
	/** "Coming up" or "Past and archived" with one organisation, its name with several. */
	title: string;
	rows: ConferenceListRow[];
	/** The link to the other view, beside the title, or none when it would show nothing. */
	link?: { label: string; href: ResolvedPathname };
	/** What the section says when it has no rows. */
	emptyText: string;
	/**
	 * Whether a row says "Not on the team", which the section explains in one
	 * line under the list.
	 */
	hasOffTeamRows: boolean;
};

/** The words when a section has no rows. */
function emptyTextOf(view: ManageListView, split: SplitConferences): string {
	if (view === 'past') {
		return 'Nothing has ended yet.';
	}

	if (split.inSession.length > 0) {
		return 'Nothing else coming up.';
	}

	return 'Nothing coming up. Create a conference to start.';
}

/** The link beside a section's title to the other view, or none when it would be empty. */
function otherViewLink(
	view: ManageListView,
	split: SplitConferences
): ConferenceListSection['link'] {
	if (view === 'past') {
		const upcomingCount = split.inSession.length + split.comingUp.length;

		return { label: `Coming up (${upcomingCount})`, href: manageListViewUrl('upcoming') };
	}

	if (split.past.length === 0) {
		return undefined;
	}

	return { label: `Past and archived (${split.past.length})`, href: manageListViewUrl('past') };
}

/** One section per organisation, for the view the address asks for. */
export function conferenceListSections(
	organizations: OrganizationGroupData[],
	view: ManageListView,
	now: Date
): ConferenceListSection[] {
	const hasOneOrganization = organizations.length === 1;
	const viewTitle = view === 'past' ? 'Past and archived' : 'Coming up';

	return organizations.map((group) => {
		const split = splitConferences(group.conferences, now);
		const summaries = view === 'past' ? split.past : split.comingUp;

		return {
			id: group.organization.id,
			title: hasOneOrganization ? viewTitle : group.organization.name,
			rows: summaries.map((summary) => conferenceListRow(summary, now)),
			link: otherViewLink(view, split),
			emptyText: emptyTextOf(view, split),
			hasOffTeamRows: summaries.some((summary) => !summary.isOnTeam)
		};
	});
}

/** The bands of every conference in session today, across all organisations. */
export function inSessionBands(organizations: OrganizationGroupData[], now: Date): InSessionBand[] {
	const bands: InSessionBand[] = [];

	for (const group of organizations) {
		const split = splitConferences(group.conferences, now);

		for (const summary of split.inSession) {
			bands.push(inSessionBand(summary.conference, now));
		}
	}

	return bands;
}

/** What the footer line says the reader is, for each organisation role. */
const ROLE_WORDS: Record<OrganizationRole, string> = {
	owner: 'you are the owner',
	admin: 'you are an admin',
	member: 'you are a member'
};

/** The line at the foot of the page about one organisation, and its links. */
export type OrganizationFooterData = {
	id: string;
	/** "Northbridge MUN Society · you are the owner · Stripe is not connected, so ..." */
	text: string;
	links: { label: string; href: ResolvedPathname }[];
};

/**
 * The foot-of-page line of one organisation. Only an owner or an admin may
 * connect Stripe on the settings page, so only they are offered "Connect
 * Stripe"; everybody gets "Organisation settings", which shows a plain member
 * the organisation read-only.
 */
export function organizationFooter(group: OrganizationGroupData): OrganizationFooterData {
	const organization = group.organization;
	const stripe = organization.isStripeConnected
		? 'Stripe is connected.'
		: 'Stripe is not connected, so fees cannot be paid by card yet.';
	const settingsHref = organizationSettingsUrl(organization.slug);
	const links: OrganizationFooterData['links'] = [];

	if (!organization.isStripeConnected && isOrganizationAdmin(group.myRole)) {
		links.push({ label: 'Connect Stripe', href: settingsHref });
	}

	links.push({ label: 'Organisation settings', href: settingsHref });

	return {
		id: organization.id,
		text: `${organization.name} · ${ROLE_WORDS[group.myRole]} · ${stripe}`,
		links
	};
}

/** One row under "Conferences you help with". */
export type StaffConferenceRow = {
	id: string;
	name: string;
	/** "12 – 15 Feb 2027 · Utrecht · Chair". */
	detail: string;
	/** "Manage" for an organiser, who can; "View" for everybody else. */
	actionLabel: string;
	href: ResolvedPathname;
};

/** What one conference the reader helps with says, and where its button goes. */
export function staffConferenceRow(staffConference: StaffConference): StaffConferenceRow {
	const conference = staffConference.conference;
	const dates = formatDateRange(conference.startDate, conference.endDate);
	// The roles are named as the conference named them, "Chair, Press" for two.
	const role = staffConference.roleNames.join(', ');

	return {
		id: conference.id,
		name: conference.name,
		detail: [dates, conference.city ?? '', role].filter((part) => part !== '').join(' · '),
		actionLabel: staffConference.mayManage ? 'Manage' : 'View',
		href: staffConferenceHref(staffConference)
	};
}
