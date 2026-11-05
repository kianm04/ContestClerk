import { describe, expect, it } from 'vitest';
import {
	destinationAfterAccepting,
	invitationSentence,
	invitedToName,
	inviteProblem,
	inviteRoleWord,
	type ChairedCommittee,
	type InviteView
} from './invites';

/**
 * An invitation to a conference's team, as `get_invite` would answer it: still
 * open, and expiring at noon UTC on 29 October 2026.
 */
function makeInvite(overrides: Partial<InviteView> = {}): InviteView {
	return {
		kind: 'conference_staff',
		status: 'pending',
		role: 'Chair',
		roleScope: 'committees',
		rolePermissions: ['run_room'],
		email: 'chair@example.org',
		organizationName: null,
		organizationSlug: null,
		conferenceName: 'THIMUN 2027',
		conferenceSlug: 'thimun-2027',
		committeeName: 'United Nations Security Council',
		invitedByName: 'Nadia Haddad',
		expiresAt: '2026-10-29T12:00:00Z',
		acceptedAt: null,
		...overrides
	};
}

/** The same, but an invitation into an organisation rather than onto a team. */
function makeOrganizationInvite(overrides: Partial<InviteView> = {}): InviteView {
	return makeInvite({
		kind: 'organization_member',
		role: 'owner',
		roleScope: null,
		rolePermissions: [],
		organizationName: 'Sample Europe MUN Network',
		organizationSlug: 'sample-europe-mun-network',
		conferenceName: null,
		conferenceSlug: null,
		committeeName: null,
		...overrides
	});
}

/**
 * The same invitation once it has been used or has run out. `get_invite` then
 * withholds the address, the names and the slugs, so they are all `null`.
 */
function makeSpentInvite(
	status: 'used' | 'expired',
	overrides: Partial<InviteView> = {}
): InviteView {
	return makeInvite({
		status,
		email: null,
		conferenceName: null,
		conferenceSlug: null,
		committeeName: null,
		invitedByName: null,
		acceptedAt: status === 'used' ? '2026-10-21T09:00:00Z' : null,
		...overrides
	});
}

/** A moment well before the invitation above runs out. */
const BEFORE_EXPIRY = new Date('2026-10-20T12:00:00Z');

describe('inviteRoleWord', () => {
	it('gives the sentence word for every organisation role', () => {
		expect(inviteRoleWord('owner')).toBe('owner');
		expect(inviteRoleWord('admin')).toBe('admin');
		expect(inviteRoleWord('member')).toBe('member');
	});

	it("bends a conference role's name the way it reads in a sentence", () => {
		expect(inviteRoleWord('Organiser')).toBe('organiser');
		expect(inviteRoleWord('Chair')).toBe('chair');
		expect(inviteRoleWord('Volunteer')).toBe('volunteer');
		// An abbreviation keeps its capitals: "uSG" would be a mistake.
		expect(inviteRoleWord('USG delegate affairs')).toBe('USG delegate affairs');
	});

	it('falls back to the text it was given for a role it does not know', () => {
		// `accept_invite` in the database refuses any other role, so nobody
		// should ever see this.
		expect(inviteRoleWord('sponsor')).toBe('sponsor');
	});
});

describe('invitedToName', () => {
	it('names the conference for an invitation onto a team', () => {
		expect(invitedToName(makeInvite())).toBe('THIMUN 2027');
	});

	it('names the organisation for an invitation into one', () => {
		expect(invitedToName(makeOrganizationInvite())).toBe('Sample Europe MUN Network');
	});
});

describe('invitationSentence', () => {
	it('names the inviter, the conference and the role', () => {
		expect(invitationSentence(makeInvite())).toBe(
			'Nadia Haddad invited you to THIMUN 2027 as chair.'
		);
	});

	it('names the organisation for an invitation into one', () => {
		expect(invitationSentence(makeOrganizationInvite())).toBe(
			'Nadia Haddad invited you to Sample Europe MUN Network as owner.'
		);
	});

	it('says "Somebody" when the inviter has no name to show', () => {
		// `get_invite` reaches the inviter's profile through a left join, so the
		// name can be missing while the invitation itself is fine.
		const invite = makeInvite({ invitedByName: null });

		expect(invitationSentence(invite)).toBe('Somebody invited you to THIMUN 2027 as chair.');
	});
});

describe('inviteProblem', () => {
	it('is null for an open invitation to the person reading it', () => {
		expect(inviteProblem(makeInvite(), 'chair@example.org', BEFORE_EXPIRY)).toBe(null);
	});

	it('takes no notice of capitals on either address', () => {
		const invite = makeInvite({ email: 'chair@example.org' });

		expect(inviteProblem(invite, 'Chair@Example.ORG', BEFORE_EXPIRY)).toBe(null);
	});

	it('tells somebody signed in as the wrong person which address to use', () => {
		const problem = inviteProblem(makeInvite(), 'someone.else@example.org', BEFORE_EXPIRY);

		expect(problem?.kind).toBe('mismatch');
		expect(problem?.message).toBe(
			'This invite was sent to chair@example.org. Log in with that address, or ask Nadia Haddad to invite someone.else@example.org.'
		);
	});

	it('says "the organisers" in the mismatch message when the inviter has no name', () => {
		const invite = makeInvite({ invitedByName: null });
		const problem = inviteProblem(invite, 'someone.else@example.org', BEFORE_EXPIRY);

		expect(problem?.message).toBe(
			'This invite was sent to chair@example.org. Log in with that address, or ask the organisers to invite someone.else@example.org.'
		);
	});

	it('says so when the invitation has already been used', () => {
		const problem = inviteProblem(makeSpentInvite('used'), 'chair@example.org', BEFORE_EXPIRY);

		expect(problem).toEqual({ kind: 'used', message: 'This invite was already used.' });
	});

	it('says when the invitation expired and to ask for a new one, naming nobody', () => {
		// `get_invite` withholds who sent an expired invitation along with whom
		// it was for, so the sentence cannot name them.
		const problem = inviteProblem(
			makeSpentInvite('expired'),
			'chair@example.org',
			new Date('2026-11-05T09:00:00Z')
		);

		expect(problem?.kind).toBe('expired');
		expect(problem?.message).toBe(
			'This invite expired on 29 Oct 2026. Ask the person who invited you for a new one.'
		);
	});

	it('counts the moment of expiry itself as expired, as the database does', () => {
		// The status is still "pending" here: the invitation ran out between the
		// database answering and the page being drawn, and the page's own clock
		// catches it.
		const problem = inviteProblem(
			makeInvite(),
			'chair@example.org',
			new Date('2026-10-29T12:00:00Z')
		);

		expect(problem?.kind).toBe('expired');
	});

	it('gives the day the invitation expired in UTC, not where the reader is', () => {
		// An invitation belongs to no conference's clock, so there is no
		// timezone to prefer: 23:00 UTC on 29 October is the 29th here even
		// though it is already the 30th in Amsterdam.
		const invite = makeSpentInvite('expired', { expiresAt: '2026-10-29T23:00:00Z' });
		const problem = inviteProblem(invite, 'chair@example.org', new Date('2026-11-05T09:00:00Z'));

		expect(problem?.message).toContain('29 Oct 2026');
	});

	it('tells anybody a used invitation is used, whoever they are signed in as', () => {
		// The address is withheld for a used invitation, so there is nothing to
		// compare it with, and nothing anybody could do about it either way.
		const problem = inviteProblem(
			makeSpentInvite('used'),
			'someone.else@example.org',
			new Date('2026-11-05T09:00:00Z')
		);

		expect(problem?.kind).toBe('used');
	});

	it('tells somebody a used invitation is used rather than that it expired', () => {
		const problem = inviteProblem(
			makeSpentInvite('used'),
			'chair@example.org',
			new Date('2026-11-05T09:00:00Z')
		);

		expect(problem?.kind).toBe('used');
	});

	it('treats an open invitation that somehow carries no address as a mismatch', () => {
		const problem = inviteProblem(makeInvite({ email: null }), 'chair@example.org', BEFORE_EXPIRY);

		expect(problem?.kind).toBe('mismatch');
		expect(problem?.message).toContain('another address');
	});
});

describe('destinationAfterAccepting', () => {
	/** A committee the reader chairs, in THIMUN 2027 unless told otherwise. */
	function chaired(overrides: Partial<ChairedCommittee> = {}): ChairedCommittee {
		return {
			committeeName: 'United Nations Security Council',
			committeeSlug: 'security-council',
			conferenceSlug: 'thimun-2027',
			...overrides
		};
	}

	it('sends a chair to the room of the one committee with that name', () => {
		const otherConference = chaired({ conferenceSlug: 'hmun-2027', committeeSlug: 'unsc' });
		const otherCommittee = chaired({ committeeName: 'General Assembly', committeeSlug: 'ga' });

		const destination = destinationAfterAccepting(makeInvite(), [
			otherConference,
			chaired(),
			otherCommittee
		]);

		expect(destination).toBe('/conferences/thimun-2027/committees/security-council/chair');
	});

	it('sends a chair to the conference page when no committee there has that name', () => {
		const elsewhere = chaired({ conferenceSlug: 'hmun-2027' });

		expect(destinationAfterAccepting(makeInvite(), [elsewhere])).toBe('/conferences/thimun-2027');
		expect(destinationAfterAccepting(makeInvite(), [])).toBe('/conferences/thimun-2027');
	});

	it('sends a chair to the conference page when two committees share the name', () => {
		const twin = chaired({ committeeSlug: 'security-council-2' });

		const destination = destinationAfterAccepting(makeInvite(), [chaired(), twin]);

		expect(destination).toBe('/conferences/thimun-2027');
	});

	it('sends a chair invited to no committee to the conference page', () => {
		const invite = makeInvite({ committeeName: null });

		expect(destinationAfterAccepting(invite, [chaired()])).toBe('/conferences/thimun-2027');
	});

	it('sends an administrator to the conference dashboard and a volunteer to its page', () => {
		// What the role grants decides, not its name: a renamed Organiser still
		// holds `administrator`, and that is what opens the dashboard.
		const organiser = makeInvite({
			role: 'Secretariat',
			roleScope: 'conference',
			rolePermissions: ['administrator'],
			committeeName: null
		});
		const volunteer = makeInvite({
			role: 'Volunteer',
			roleScope: 'conference',
			rolePermissions: [],
			committeeName: null
		});

		expect(destinationAfterAccepting(organiser, [])).toBe('/manage/thimun-2027');
		expect(destinationAfterAccepting(volunteer, [])).toBe('/conferences/thimun-2027');
	});
});
