/**
 * The one link a refused join link offers, so that a refusal on
 * `/join/[joinCode]` is never a dead end (`05-pages/delegation/join.md`,
 * "Cannot join"; streamlining, F14, T177).
 *
 * The sentences themselves stay `joinRefusalSentence`'s in
 * `$lib/delegations.ts`; this file only says where to go next.
 */

import type { ResolvedPathname } from '$app/types';
import type { JoinRefusalKind, RouteIntoConference } from '$lib/delegations';
import { applicationUrl, conferenceListUrl, conferenceUrl, delegationUrl } from '$lib/urls';

/** A link the refusal card draws as its only button. */
export type JoinRefusalLink = {
	/** The words on the button, such as "Open Northbridge High". */
	label: string;
	href: ResolvedPathname;
};

/** What the link needs to know beyond why the join was refused. */
export type JoinRefusalLinkFacts = {
	conferenceName: string;
	conferenceSlug: string;
	/**
	 * How the reader is already attached to the conference, from
	 * `findMyRouteIntoConference`, or `null` when that could not be found out.
	 */
	existing: RouteIntoConference | null;
};

/** "Back to {conference}", for every refusal that leaves the conference page as the way on. */
function backToConference(facts: JoinRefusalLinkFacts): JoinRefusalLink {
	return { label: `Back to ${facts.conferenceName}`, href: conferenceUrl(facts.conferenceSlug) };
}

/**
 * "Browse conferences", for a join code nobody has. The action needs it on its
 * own, because by then there is no delegation to name a conference from.
 */
export function unknownCodeLink(): JoinRefusalLink {
	return { label: 'Browse conferences', href: conferenceListUrl() };
}

/**
 * The link under one refusal, as `join.md`'s link table names it, or `null`
 * when there is no link to draw.
 *
 * `already_in_this` answers `null` because the page redirects to the
 * delegation instead of drawing it, and so does `unknown`, a refusal the
 * database raised that nothing here recognises. When the reader's delegation
 * or application cannot be found, the conference page is the way on instead,
 * since the sentence then names only the conference. Somebody on the team
 * (`conference_staff`) is sent back to the conference as well: they run it, so
 * its page is where their work is.
 */
export function joinRefusalLink(
	kind: JoinRefusalKind | 'unknown_code' | 'unknown',
	facts: JoinRefusalLinkFacts
): JoinRefusalLink | null {
	if (kind === 'already_in_this' || kind === 'unknown') {
		return null;
	}

	if (kind === 'unknown_code') {
		return unknownCodeLink();
	}

	const existing = facts.existing;

	if (kind === 'in_other_delegation' && existing?.kind === 'delegation') {
		return { label: `Open ${existing.delegationName}`, href: delegationUrl(existing.delegationId) };
	}

	// "View your application", where the sentence asks for it to be withdrawn.
	if (kind === 'already_applied' && existing?.kind === 'application') {
		return { label: 'View your application', href: applicationUrl(existing.applicationId) };
	}

	// `rejected`, `withdrawn` and `conference_over`: the reader can take part
	// another way, or see what the conference was, from its own page.
	return backToConference(facts);
}
